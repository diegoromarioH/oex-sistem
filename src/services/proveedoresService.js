// src/services/proveedoresService.js
//
// Dos tipos de proveedor, ambos van a COSTO (no a gasto operativo):
//
// - "Aduana / Flete" (Darío Import Logistic): la factura se genera
//   eligiendo exactamente qué trackings cubre — los que están en
//   "Bodega OEX" — y se compara el costo interno ESTIMADO (peso ×
//   tarifa) contra el monto REAL que factura, para llevar el cuadre.
// - "Transporte local" (pueden ser varios proveedores distintos): NO
//   van ligados a tracking — es solo un monto que factura, sin cuadre
//   posible porque no hay un "estimado" con qué compararlo.
//
// Ambos tipos comparten el mismo flujo de factura → pago → libro
// diario; lo único que cambia es si piden trackings o no, y a qué
// cuenta de costo postean (5010 vs. 5020).
import { supabase } from "../supabase";
import { numero } from "../utils/numero";
import { firmarPayload, registrarAuditoria } from "./coreService";
import { costoInternoDefaultPorTipo } from "../utils/calculosPaqueteria";
import { siguienteEstadoTrasRetiroProveedor } from "../utils/estadosEnvio";
import { ajustarSaldoCuentaDinero } from "./cuentasDineroService";
import { postearAsiento } from "./contabilidadService";

export const TIPOS_PROVEEDOR = ["Aduana / Flete", "Transporte local"];

const esAduanaFlete = (proveedor) => proveedor.tipo === "Aduana / Flete";
const cuentaCostoDe = (proveedor) => (esAduanaFlete(proveedor) ? "5010" : "5020");

export const crearProveedor = async ({ form, auth }) => {
  if (!form.nombre.trim()) throw new Error("Escribe el nombre del proveedor.");
  const { error } = await supabase.from("proveedores").insert([{
    nombre: form.nombre,
    tipo: form.tipo || "Transporte local",
    contacto: form.contacto || "",
    telefono: form.telefono || "",
    correo: form.correo || "",
    notas: form.notas || "",
    ...firmarPayload(auth)
  }]);
  if (error) throw error;
  await registrarAuditoria({ ...auth, accion: "Creó proveedor", modulo: "Finanzas", registroCodigo: form.nombre, detalle: form.tipo || "" });
};

export const eliminarProveedor = async ({ proveedor, auth }) => {
  const { error } = await supabase.from("proveedores").delete().eq("id", proveedor.id);
  if (error) throw error;
  await registrarAuditoria({ ...auth, accion: "Eliminó proveedor", modulo: "Finanzas", registroCodigo: proveedor.nombre || "" });
};

export const actualizarProveedor = async ({ proveedor, form, auth }) => {
  if (!form.nombre.trim()) throw new Error("Escribe el nombre del proveedor.");
  const { error } = await supabase.from("proveedores").update({
    nombre: form.nombre,
    tipo: form.tipo,
    contacto: form.contacto || "",
    telefono: form.telefono || "",
    correo: form.correo || "",
    notas: form.notas || "",
    updated_by: auth.session?.user?.id || null,
    updated_by_name: auth.usuarioActual?.nombre || auth.usuarioActual?.email || auth.session?.user?.email || "Usuario"
  }).eq("id", proveedor.id);
  if (error) throw error;
  await registrarAuditoria({ ...auth, accion: "Editó proveedor", modulo: "Finanzas", registroCodigo: form.nombre, detalle: form.tipo || "" });
};

// Costo interno estimado de un tracking suelto — mismo criterio que se usa
// en trackingsService.generarRecibo(): su propio costoInterno si lo tiene,
// si no el default según tipo (Marítimo/Aéreo). Solo aplica a Aduana/Flete.
const costoEstimadoTracking = (t) => {
  const costo = t.costoInterno !== undefined && t.costoInterno !== "" ? numero(t.costoInterno) : costoInternoDefaultPorTipo(t.tipoEnvio);
  return numero(t.peso) * costo;
};

export const calcularMontoEstimado = (trackings) => trackings.reduce((a, t) => a + costoEstimadoTracking(t), 0);

// Genera la factura. Ambos tipos pueden ligar trackings (para saber
// qué paquetes cubrió ese traslado/factura), pero solo Aduana/Flete:
// - Exige al menos un tracking.
// - Calcula el cuadre estimado-vs-real (porque ahí sí existe un costo
//   interno por libra con qué comparar).
// Transporte local puede ligar cero o varios trackings, sin exigencia
// y sin cuadre — el monto estimado se iguala al real, así la
// diferencia siempre da $0 en vez de mostrar un cuadre que no existe
// para ese tipo.
//
// `link` (opcional): URL al documento real de la factura (foto, PDF en
// Drive, etc.) — puramente informativo.
// `fecha` (opcional, "YYYY-MM-DD"): para cargar una factura histórica —
// si no se pasa, se usa el momento real en que se genera.
export const generarFacturaProveedor = async ({ proveedor, trackings = [], montoReal, numeroFactura, nota, link, fecha, auth }) => {
  const esAduana = esAduanaFlete(proveedor);

  if (esAduana && trackings.length === 0) {
    throw new Error("Selecciona al menos un tracking para esta factura.");
  }
  if (numero(montoReal) <= 0) throw new Error("Escribe el monto real que factura el proveedor.");

  const montoEstimado = esAduana ? calcularMontoEstimado(trackings) : numero(montoReal);

  // El snapshot se guarda para AMBOS tipos si hay trackings elegidos —
  // solo cambia si trae costoEstimado (Aduana/Flete) o no (Transporte
  // local, donde ese concepto no existe).
  const trackingsSnapshot = trackings.map((t) => ({
    id: t.id,
    codigo: t.tracking,
    cliente: t.cliente,
    destino: t.destino,
    tipoEnvio: t.tipoEnvio,
    peso: numero(t.peso),
    costoEstimado: esAduana ? costoEstimadoTracking(t) : null
  }));

  const horaActual = new Date().toTimeString().slice(0, 8);
  const fechaISO = fecha ? new Date(`${fecha}T${horaActual}`).toISOString() : new Date().toISOString();
  const { data: creada, error } = await supabase.from("facturas_proveedor").insert([{
    proveedor_id: proveedor.id,
    numero_factura: numeroFactura || "",
    trackings: trackingsSnapshot,
    monto_estimado: montoEstimado,
    monto_real: numero(montoReal),
    abonado: 0,
    saldo: numero(montoReal),
    estado: "Pendiente",
    nota: nota || "",
    link: link || "",
    fecha: fechaISO,
    ...firmarPayload(auth)
  }]).select().single();
  if (error) throw error;

  await postearAsiento({
    fecha: fechaISO,
    descripcion: `Factura ${numeroFactura || `#${creada.id}`} · ${proveedor.nombre}`,
    origenModulo: "facturas_proveedor",
    origenId: creada.id,
    auth,
    lineas: [
      { cuentaCodigo: cuentaCostoDe(proveedor), debe: numero(montoReal), haber: 0 },
      { cuentaCodigo: "2010", debe: 0, haber: numero(montoReal) }
    ]
  });

  const diferencia = numero(montoReal) - montoEstimado;
  await registrarAuditoria({
    ...auth, accion: "Generó factura de proveedor", modulo: "Finanzas", registroCodigo: numeroFactura || `#${creada.id}`,
    detalle: esAduana
      ? `${proveedor.nombre} · ${trackings.length} tracking(s) · real $${numero(montoReal).toFixed(2)} vs. estimado $${montoEstimado.toFixed(2)} (dif. $${diferencia.toFixed(2)})`
      : `${proveedor.nombre} · $${numero(montoReal).toFixed(2)}${trackings.length > 0 ? ` · ${trackings.length} tracking(s)` : ""}`
  });

  return { facturaId: creada.id, montoEstimado, diferencia };
};

// Registra un pago (parcial o total) contra una factura ya generada —
// igual para ambos tipos de proveedor. `proveedor` se necesita para
// saber si aplica el avance automático de trackings (solo Aduana/Flete).
// `cuentaDinero` es obligatoria — es la única fuente de "de dónde sale
// el pago" (antes existía también un campo de texto libre `cuenta`,
// ligado a una lista separada en Configuración; se unificaron en una
// sola cosa). El campo `cuenta` de la tabla se sigue llenando, pero
// ahora se deriva del nombre de la cuenta de dinero, no de texto suelto.
// `fecha` (opcional, "YYYY-MM-DD"): para cargar un pago histórico — si no
// se pasa, se usa el momento real en que se registra.
export const registrarPagoProveedor = async ({ factura, proveedor, monto, metodo, cuentaDinero, referencia, nota, fecha, auth }) => {
  const montoNum = numero(monto);
  if (montoNum <= 0) throw new Error("El monto debe ser mayor a cero.");
  if (montoNum > numero(factura.saldo) + 0.01) throw new Error("El monto no puede ser mayor al saldo pendiente.");
  if (!metodo) throw new Error("Selecciona el método de pago.");
  if (!cuentaDinero?.id) throw new Error("Selecciona de cuál cuenta sale el pago (créala en Finanzas → Cuentas si no tienes ninguna).");

  const horaActual = new Date().toTimeString().slice(0, 8);
  const fechaISO = fecha ? new Date(`${fecha}T${horaActual}`).toISOString() : new Date().toISOString();
  const { data: pagoCreado, error: errorPago } = await supabase.from("pagos_proveedor").insert([{
    factura_id: factura.id,
    monto: montoNum,
    metodo,
    cuenta: cuentaDinero.nombre,
    cuenta_dinero_id: cuentaDinero.id,
    referencia: referencia || "",
    nota: nota || "",
    fecha: fechaISO,
    ...firmarPayload(auth)
  }]).select().single();
  if (errorPago) throw errorPago;

  const nuevoAbonado = numero(factura.abonado) + montoNum;
  const nuevoSaldo = Math.max(numero(factura.montoReal) - nuevoAbonado, 0);
  const nuevoEstado = nuevoSaldo <= 0.01 ? "Pagada" : "Parcial";

  const { error } = await supabase.from("facturas_proveedor").update({
    abonado: nuevoAbonado,
    saldo: nuevoSaldo,
    estado: nuevoEstado,
    updated_by: auth.session?.user?.id || null,
    updated_by_name: auth.usuarioActual?.nombre || auth.usuarioActual?.email || auth.session?.user?.email || "Usuario"
  }).eq("id", factura.id);
  if (error) throw error;

  // El tracking se queda "atascado" en Bodega OEX hasta que la factura
  // de Darío quede TOTALMENTE pagada — recién ahí avanza al siguiente
  // paso (depende del destino de cada tracking). Este avance SOLO
  // aplica a Aduana/Flete: si es Transporte local, sus trackings
  // ligados son solo trazabilidad (qué paquetes cubrió ese traslado),
  // no representan un "retiro de bodega de proveedor" y no deben
  // saltar de estado al pagarse.
  if (nuevoEstado === "Pagada" && esAduanaFlete(proveedor || {}) && (factura.trackings || []).length > 0) {
    await Promise.all(
      factura.trackings.map((t) =>
        supabase.from("tracking_registros").update({ estado: siguienteEstadoTrasRetiroProveedor(t.destino) }).eq("id", t.id)
      )
    );
  }

  // Sale dinero real de la cuenta elegida (caja o banco).
  await ajustarSaldoCuentaDinero(cuentaDinero.id, -montoNum);

  if (cuentaDinero.cuentaContableId) {
    const { data: cuentaContable } = await supabase
      .from("cuentas_contables").select("codigo").eq("id", cuentaDinero.cuentaContableId).single();
    if (cuentaContable) {
      await postearAsiento({
        fecha: fechaISO,
        descripcion: `Pago a proveedor · Factura ${factura.numeroFactura || `#${factura.id}`}`,
        origenModulo: "pagos_proveedor",
        origenId: pagoCreado.id,
        auth,
        lineas: [
          { cuentaCodigo: "2010", debe: montoNum, haber: 0 },
          { cuentaCodigo: cuentaContable.codigo, cuentaDineroId: cuentaDinero.id, debe: 0, haber: montoNum }
        ]
      });
    }
  }

  await registrarAuditoria({
    ...auth, accion: "Registró pago a proveedor", modulo: "Finanzas", registroCodigo: factura.numeroFactura || `#${factura.id}`,
    detalle: `$${montoNum.toFixed(2)} · ${metodo} · ${cuentaDinero.nombre}`
  });
};

// Historial de pagos de UN proveedor (todas sus facturas, todos sus
// pagos) — se consulta bajo demanda al abrir su ficha de detalle, no
// viene precargado globalmente como facturasProveedor.
export const listarPagosDeProveedor = async (proveedorId) => {
  const { data: facturas, error: errorFacturas } = await supabase
    .from("facturas_proveedor").select("id").eq("proveedor_id", proveedorId);
  if (errorFacturas) throw errorFacturas;

  const facturaIds = facturas.map((f) => f.id);
  if (facturaIds.length === 0) return [];

  const { data, error } = await supabase
    .from("pagos_proveedor").select("*")
    .in("factura_id", facturaIds)
    .order("fecha", { ascending: false });
  if (error) throw error;
  return data;
};