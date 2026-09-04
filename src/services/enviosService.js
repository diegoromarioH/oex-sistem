// src/services/enviosService.js
//
// Los envíos ("recibos") ya no se registran a mano desde cero: se generan
// en trackingsService.js (generarRecibo) a partir de trackings sueltos que
// ya están listos para retirar. Este archivo se quedó solo con lo que
// sigue operando sobre un envío YA CREADO: editar un tracking dentro de él,
// cambiar su estado, saldarlo (pago) y eliminarlo.
import { supabase } from "../supabase";
import { numero } from "../utils/numero";
import { tarifaPorTipoEnvio, calcularTotalesTrackings, totalPaq, costoInternoTotalPaq, tipoEnvioResumen } from "../utils/calculosPaqueteria";
import { registrarAuditoria } from "./coreService";
import { estadosPorDestino } from "../utils/estadosEnvio";
import { ajustarSaldoCuentaDinero } from "./cuentasDineroService";
import { postearAsiento, reversarAsientosDeOrigen } from "./contabilidadService";

// Postea el COBRO real de un envío al libro diario — Debe la cuenta de
// dinero elegida (caja/banco) · Haber Cuentas por Cobrar Clientes (1030).
// La VENTA ya se posteó al generar el recibo (ver trackingsService.js);
// esto solo mueve el dinero de "por cobrar" a "cobrado". Se llama tanto
// desde saldarEnvio como desde actualizarEstadoEnvio (mismo patrón que
// gastos/ingresos: si no hay cuenta de dinero vinculada a una cuenta
// contable, se guarda igual el pago pero no queda asiento formal).
const postearCobro = async ({ envio, monto, cuentaDinero, fecha, auth }) => {
  if (!cuentaDinero?.id || monto <= 0) return;

  await ajustarSaldoCuentaDinero(cuentaDinero.id, monto);

  if (!cuentaDinero.cuentaContableId) return;
  const { data: cuentaContable } = await supabase
    .from("cuentas_contables").select("codigo").eq("id", cuentaDinero.cuentaContableId).single();
  if (!cuentaContable) return;

  await postearAsiento({
    fecha: fecha || new Date().toISOString(),
    descripcion: `Cobro recibo ${envio.numero} · ${envio.cliente}`,
    origenModulo: "envios_cobro",
    origenId: envio.id,
    auth,
    lineas: [
      { cuentaCodigo: cuentaContable.codigo, cuentaDineroId: cuentaDinero.id, debe: monto, haber: 0 },
      { cuentaCodigo: "1030", debe: 0, haber: monto }
    ]
  });
};

// Actualiza UN campo de UN tracking dentro de un envío ya guardado, y
// recalcula todo (incluyendo tipo_envios y costo interno por tracking).
//
// Si esto cambia el `total` del envío (ej. se corrige un peso que venía
// en 0), se postea un asiento de AJUSTE por la diferencia contra la
// venta original — así el Estado de Resultados no queda desfasado
// respecto al monto real del recibo corregido.
export const actualizarTrackingEnvio = async ({ envio, trackingIndex, field, value, tarifas, auth }) => {
  const nuevosTrackings = [...envio.trackings];
  nuevosTrackings[trackingIndex] = { ...nuevosTrackings[trackingIndex], [field]: value };

  const tipoEnvioActualizado = tipoEnvioResumen(nuevosTrackings, envio.tipoEnvio);
  const envioParaCalculo = { ...envio, tipoEnvio: tipoEnvioActualizado };
  const { libras: totalLibras, total, costoInternoTotal, gananciaReal } = calcularTotalesTrackings(tarifas, envioParaCalculo, nuevosTrackings);

  // El abono (lo ya pagado) no cambia por registrar un peso; el saldo sí
  // debe recalcularse contra el nuevo total, o quedaría congelado en lo que
  // fuera al crear el envío — el caso típico de una prealerta que nace con
  // peso 0 y se completa después.
  const abono = numero(envio.abono);
  const saldo = Math.max(total - abono, 0);

  // El estado del envío ya no se controla a mano: se recalcula como el
  // tracking MÁS ATRASADO del pipeline (si un tracking sigue en Miami y
  // otro ya llegó a Ometepe, el envío como conjunto sigue "en Miami").
  // Esto mantiene funcionando sin cambios el resto de la app (filtros de
  // "activos", el aviso de WhatsApp "listo para retirar", etc.) sin que el
  // operador tenga que tocar un selector de estado general.
  //
  // Nunca se auto-avanza a "Entregado": eso solo pasa a través de
  // saldarEnvio() (el flujo de pago), para no marcar un envío como
  // entregado/pagado solo por editar un tracking.
  let estadoActualizado = envio.estado;
  if (envio.estado !== "Entregado") {
    const pipeline = estadosPorDestino(envio.destino);
    const indices = nuevosTrackings.map((t) => {
      const idx = pipeline.indexOf(t.estado);
      return idx === -1 ? 0 : idx;
    });
    const idxMinimo = Math.min(...indices, pipeline.length - 2);
    estadoActualizado = pipeline[Math.max(idxMinimo, 0)];
  }

  const totalAnterior = numero(envio.total);

  const { error } = await supabase.from("envios").update({
    trackings: nuevosTrackings,
    tipo_envios: tipoEnvioActualizado,
    total_libras: totalLibras,
    total,
    costo_interno_total: costoInternoTotal,
    ganancia_real: gananciaReal,
    abono,
    saldo,
    estado: estadoActualizado,
    updated_by: auth.session?.user?.id || null,
    updated_by_name: auth.usuarioActual?.nombre || auth.usuarioActual?.email || auth.session?.user?.email || "Usuario"
  }).eq("id", envio.id);

  if (error) throw error;

  const delta = total - totalAnterior;
  if (Math.abs(delta) > 0.005) {
    await postearAsiento({
      fecha: new Date().toISOString(),
      descripcion: `Ajuste de venta · Recibo ${envio.numero} (corrección de ${field})`,
      origenModulo: "envios_ajuste",
      origenId: envio.id,
      auth,
      // Si el total subió, es más venta (más CxC, más Ingreso). Si bajó,
      // es lo contrario — se reversa proporcionalmente.
      lineas: delta > 0
        ? [
            { cuentaCodigo: "1030", debe: delta, haber: 0 },
            { cuentaCodigo: "4010", debe: 0, haber: delta }
          ]
        : [
            { cuentaCodigo: "4010", debe: -delta, haber: 0 },
            { cuentaCodigo: "1030", debe: 0, haber: -delta }
          ]
    });
  }

  await registrarAuditoria({
    ...auth, accion: field === "peso" ? "Registró peso" : "Actualizó tracking", modulo: "Paquetería",
    registroCodigo: envio.numero, detalle: `${nuevosTrackings[trackingIndex]?.codigo || ""} · ${field}: ${value}`
  });
};

// `cuentaDinero` (opcional): si se pasa (y viene de EnvioItem con el
// selector nuevo), el cobro implícito al marcar "Entregado" con saldo
// pendiente también postea al libro diario — igual que saldarEnvio.
// Hoy este flujo sigue usando window.prompt() para método/referencia
// (ver EnvioItem.jsx), así que en la práctica no trae cuentaDinero salvo
// que se actualice ese flujo para usar un selector como el de
// FormularioSaldarEnvio.
export const actualizarEstadoEnvio = async ({ envio, nuevoEstado, prompts, cuentaDinero, auth }) => {
  let abono = numero(envio.abono);
  let referencia = envio.referencia || "";
  let metodo = envio.metodoPago || "";
  let montoCobradoAhora = 0;

  if (nuevoEstado === "Entregado" && numero(envio.total) - abono > 0) {
    metodo = metodo || prompts.pedirMetodo() || "";
    referencia = referencia || prompts.pedirReferencia() || "";
    if (!metodo.trim() || !referencia.trim()) {
      throw new Error("Para entregar debes registrar método y referencia de pago.");
    }
    montoCobradoAhora = numero(envio.total) - abono;
    abono = numero(envio.total);
  }

  const { error } = await supabase.from("envios").update({
    estado: nuevoEstado,
    metodo_pago: metodo,
    referencia_pago: referencia,
    abono,
    saldo: Math.max(numero(envio.total) - abono, 0),
    updated_by: auth.session?.user?.id || null,
    updated_by_name: auth.usuarioActual?.nombre || auth.usuarioActual?.email || auth.session?.user?.email || "Usuario"
  }).eq("id", envio.id);

  if (error) throw error;

  await postearCobro({ envio, monto: montoCobradoAhora, cuentaDinero, auth });

  await registrarAuditoria({ ...auth, accion: "Cambió estado", modulo: "Paquetería", registroCodigo: envio.numero, detalle: `${envio.estado} → ${nuevoEstado}` });
};

// Usada por el panel "Seguimiento de clientes" del Dashboard: registra el
// pago con el que el cliente salda su saldo pendiente y, por defecto,
// marca el envío como Entregado (retirado).
//
// pago = { metodo: "Transferencia" | "Efectivo", recibidoPor, marcarEntregado }
// — marcarEntregado por defecto true; si es false solo registra el pago
// sin cambiar el estado (útil si ya estaba Entregado pero quedó con saldo
// pendiente por un pago parcial anterior).
//
// `fecha` (opcional, formato "YYYY-MM-DD"): para cuando estás cargando un
// pago histórico (ej. migrando datos de un sistema anterior) — si no se
// pasa, se usa el momento real en que se confirma el pago.
export const saldarEnvio = async ({ envio, pago, cuentaDinero, fecha, auth }) => {
  if (!pago?.metodo) throw new Error("Selecciona el método de pago.");
  if (!cuentaDinero?.id) throw new Error("Selecciona a qué cuenta de dinero entra el pago (créala en Finanzas → Cuentas si no tienes ninguna).");

  let referencia = "";
  if (pago.metodo === "Transferencia") {
    referencia = `Transferencia a ${cuentaDinero.nombre}`;
  } else if (pago.metodo === "Efectivo") {
    if (!pago.recibidoPor?.trim()) throw new Error("Indica quién recibió el efectivo.");
    referencia = `Efectivo recibido por ${pago.recibidoPor.trim()} (${cuentaDinero.nombre})`;
  } else {
    throw new Error("Método de pago inválido.");
  }

  const horaActual = new Date().toTimeString().slice(0, 8);
  const fechaISO = fecha ? new Date(`${fecha}T${horaActual}`).toISOString() : new Date().toISOString();

  const montoCobrado = Math.max(numero(envio.total) - numero(envio.abono), 0);
  const nuevoEstado = pago.marcarEntregado === false ? envio.estado : "Entregado";

  const { error } = await supabase.from("envios").update({
    estado: nuevoEstado,
    metodo_pago: pago.metodo,
    referencia_pago: referencia,
    abono: numero(envio.total),
    saldo: 0,
    updated_by: auth.session?.user?.id || null,
    updated_by_name: auth.usuarioActual?.nombre || auth.usuarioActual?.email || auth.session?.user?.email || "Usuario"
  }).eq("id", envio.id);

  if (error) throw error;

  await postearCobro({ envio, monto: montoCobrado, cuentaDinero, fecha: fechaISO, auth });

  await registrarAuditoria({
    ...auth, accion: nuevoEstado === "Entregado" ? "Saldó y entregó envío" : "Saldó envío", modulo: "Paquetería",
    registroCodigo: envio.numero, detalle: `${envio.cliente} · ${referencia} · $${numero(envio.total).toFixed(2)}`
  });
};

export const eliminarEnvio = async ({ envio, auth }) => {
  const { error } = await supabase.from("envios").delete().eq("id", envio.id);
  if (error) throw error;

  // Reversa venta (generarRecibo), ajustes (correcciones de peso) y
  // cobro (saldarEnvio/actualizarEstadoEnvio) — sin esto, borrar un
  // envío dejaría ingresos fantasma en el Estado de Resultados.
  await reversarAsientosDeOrigen({ origenModulo: "envios", origenId: envio.id, auth });
  await reversarAsientosDeOrigen({ origenModulo: "envios_ajuste", origenId: envio.id, auth });
  await reversarAsientosDeOrigen({ origenModulo: "envios_cobro", origenId: envio.id, auth });

  await registrarAuditoria({ ...auth, accion: "Eliminó envío", modulo: "Paquetería", registroCodigo: envio.numero || "", detalle: envio.cliente || "" });
};

export { tarifaPorTipoEnvio, calcularTotalesTrackings, totalPaq, costoInternoTotalPaq };