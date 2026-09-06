// src/services/enviosService.js
import { supabase } from "../supabase";
import { numero } from "../utils/numero";
import { tarifaPorTipoEnvio, calcularTotalesTrackings, totalPaq, costoInternoTotalPaq, tipoEnvioResumen } from "../utils/calculosPaqueteria";
import { registrarAuditoria } from "./coreService";
import { estadosPorDestino } from "../utils/estadosEnvio";
import { ajustarSaldoCuentaDinero } from "./cuentasDineroService";
import { postearAsiento, reversarAsientosDeOrigen } from "./ContabilidadService";

const nombreUsuario = (auth) => auth.usuarioActual?.nombre || auth.usuarioActual?.email || auth.session?.user?.email || "Usuario";

const sincronizarTrackingsVivos = async ({ envioId, cambios, auth }) => {
  if (!envioId) return;
  const { error } = await supabase.from("tracking_registros").update({
    ...cambios,
    updated_by: auth.session?.user?.id || null,
    updated_by_name: nombreUsuario(auth)
  }).eq("envio_id", envioId);
  if (error) throw error;
};

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

export const actualizarTrackingEnvio = async ({ envio, trackingIndex, field, value, tarifas, auth }) => {
  const nuevosTrackings = [...envio.trackings];
  nuevosTrackings[trackingIndex] = { ...nuevosTrackings[trackingIndex], [field]: value };

  const tipoEnvioActualizado = tipoEnvioResumen(nuevosTrackings, envio.tipoEnvio);
  const envioParaCalculo = { ...envio, tipoEnvio: tipoEnvioActualizado };
  const { libras: totalLibras, total, costoInternoTotal, gananciaReal } = calcularTotalesTrackings(tarifas, envioParaCalculo, nuevosTrackings);
  const abono = numero(envio.abono);
  const saldo = Math.max(total - abono, 0);
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
    updated_by: auth.session?.user?.id || null,
    updated_by_name: nombreUsuario(auth)
  }).eq("id", envio.id);
  if (error) throw error;

  const trackingId = nuevosTrackings[trackingIndex]?.id;
  if (trackingId && field === "peso") {
    const { error: trackingError } = await supabase.from("tracking_registros").update({
      peso: value,
      updated_by: auth.session?.user?.id || null,
      updated_by_name: nombreUsuario(auth)
    }).eq("id", trackingId).eq("envio_id", envio.id);
    if (trackingError) throw trackingError;
  }

  const delta = total - totalAnterior;
  if (Math.abs(delta) > 0.005) {
    await postearAsiento({
      fecha: new Date().toISOString(),
      descripcion: `Ajuste de venta · Recibo ${envio.numero} (corrección de ${field})`,
      origenModulo: "envios_ajuste",
      origenId: envio.id,
      auth,
      lineas: delta > 0
        ? [{ cuentaCodigo: "1030", debe: delta, haber: 0 }, { cuentaCodigo: "4010", debe: 0, haber: delta }]
        : [{ cuentaCodigo: "4010", debe: -delta, haber: 0 }, { cuentaCodigo: "1030", debe: 0, haber: -delta }]
    });
  }

  await registrarAuditoria({
    ...auth,
    accion: field === "peso" ? "Registró peso" : "Actualizó tracking",
    modulo: "Paquetería",
    registroCodigo: envio.numero,
    detalle: `${nuevosTrackings[trackingIndex]?.tracking || nuevosTrackings[trackingIndex]?.codigo || ""} · ${field}: ${value}`
  });
};

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

  const trackingsActualizados = (envio.trackings || []).map((t) => ({ ...t, estado: nuevoEstado }));
  const { error } = await supabase.from("envios").update({
    estado: nuevoEstado,
    trackings: trackingsActualizados,
    metodo_pago: metodo,
    referencia_pago: referencia,
    abono,
    saldo: Math.max(numero(envio.total) - abono, 0),
    updated_by: auth.session?.user?.id || null,
    updated_by_name: nombreUsuario(auth)
  }).eq("id", envio.id);
  if (error) throw error;

  await sincronizarTrackingsVivos({ envioId: envio.id, cambios: { estado: nuevoEstado }, auth });
  await postearCobro({ envio, monto: montoCobradoAhora, cuentaDinero, auth });
  await registrarAuditoria({ ...auth, accion: "Cambió estado", modulo: "Paquetería", registroCodigo: envio.numero, detalle: `${envio.estado} → ${nuevoEstado} · ${trackingsActualizados.length} tracking(s)` });
};

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
  const trackingsActualizados = (envio.trackings || []).map((t) => ({ ...t, estado: nuevoEstado }));

  const { error } = await supabase.from("envios").update({
    estado: nuevoEstado,
    trackings: trackingsActualizados,
    metodo_pago: pago.metodo,
    referencia_pago: referencia,
    abono: numero(envio.total),
    saldo: 0,
    updated_by: auth.session?.user?.id || null,
    updated_by_name: nombreUsuario(auth)
  }).eq("id", envio.id);
  if (error) throw error;

  if (nuevoEstado === "Entregado") {
    await sincronizarTrackingsVivos({ envioId: envio.id, cambios: { estado: "Entregado" }, auth });
  }

  await postearCobro({ envio, monto: montoCobrado, cuentaDinero, fecha: fechaISO, auth });
  await registrarAuditoria({
    ...auth,
    accion: nuevoEstado === "Entregado" ? "Saldó y entregó envío" : "Saldó envío",
    modulo: "Paquetería",
    registroCodigo: envio.numero,
    detalle: `${envio.cliente} · ${referencia} · $${numero(envio.total).toFixed(2)}`
  });
};

export const eliminarEnvio = async ({ envio, auth }) => {
  const { error: unlinkError } = await supabase.from("tracking_registros").update({
    envio_id: null,
    updated_by: auth.session?.user?.id || null,
    updated_by_name: nombreUsuario(auth)
  }).eq("envio_id", envio.id);
  if (unlinkError) throw unlinkError;

  const { error } = await supabase.from("envios").delete().eq("id", envio.id);
  if (error) throw error;

  await reversarAsientosDeOrigen({ origenModulo: "envios", origenId: envio.id, auth });
  await reversarAsientosDeOrigen({ origenModulo: "envios_ajuste", origenId: envio.id, auth });
  await reversarAsientosDeOrigen({ origenModulo: "envios_cobro", origenId: envio.id, auth });
  await registrarAuditoria({ ...auth, accion: "Eliminó envío", modulo: "Paquetería", registroCodigo: envio.numero || "", detalle: `${envio.cliente || ""} · trackings desvinculados` });
};

export { tarifaPorTipoEnvio, calcularTotalesTrackings, totalPaq, costoInternoTotalPaq };
