// src/services/trackingsService.js
//
// Cada tracking nace ligado a un CLIENTE (no a un envío) y vive suelto en
// tracking_registros, avanzando su propio pipeline de estado, hasta que
// queda listo para retirar (Punto UNI / Jardines de Veracruz / Ometepe).
// En ese momento se genera el RECIBO (numeración R00001...), que junta los
// trackings listos de un mismo cliente y mismo destino en un solo envío —
// eso reemplaza tanto al viejo "Registrar envío" como a "Factura
// consolidada", que ahora son la misma acción.

import { supabase } from "../supabase";
import { numero } from "../utils/numero";
import { normalizarEnvio } from "../utils/clientes";
import { resolverCliente } from "./clientesService";
import { generarCodigoRecibo, firmarPayload, registrarAuditoria } from "./coreService";
import { estadosPorDestino } from "../utils/estadosEnvio";
import { tarifaDesdePerfil, costoInternoDefaultPorTipo, tipoEnvioResumen } from "../utils/calculosPaqueteria";
import { postearAsiento } from "./ContabilidadService";

// Trackings que llegan de la landing pública nacen con datos mínimos
// (cliente/contacto como texto suelto, sin cliente_id, y un estado que no
// es parte del pipeline real, ej. "Prealertado"). Antes había que
// "convertir a envío" de un tirón; ahora el operador solo CONFIRMA que
// llegó: se resuelve el cliente (si hacía falta) y pasa a "Miami", el
// primer paso del pipeline real — desde ahí se edita como cualquier otro
// tracking (peso, ID de almacén, estado).
export const confirmarTracking = async ({ tracking, clientesEnMemoria, auth }) => {
  let clienteId = tracking.clienteId;
  let clienteCodigo = tracking.clienteCodigo;
  let clienteTipo = tracking.clienteTipo;

  if (!clienteId) {
    const clienteResuelto = await resolverCliente({
      clientesEnMemoria, nombre: tracking.cliente, telefono: tracking.contacto, tipo: "General",
      codigo: tracking.clienteCodigo, auth
    });
    clienteId = clienteResuelto.id;
    clienteCodigo = clienteResuelto.codigo;
    clienteTipo = clienteResuelto.tipo;
  }

  const { error } = await supabase.from("tracking_registros").update({
    estado: "Miami",
    cliente_id: clienteId,
    cliente_codigo: clienteCodigo,
    cliente_tipo: clienteTipo,
    updated_by: auth.session?.user?.id || null,
    updated_by_name: auth.usuarioActual?.nombre || auth.usuarioActual?.email || auth.session?.user?.email || "Usuario"
  }).eq("id", tracking.id);
  if (error) throw error;

  await registrarAuditoria({
    ...auth, accion: "Confirmó tracking recibido", modulo: "Trackings",
    registroCodigo: tracking.tracking || tracking.almacenId || "", detalle: tracking.cliente || ""
  });
};

// form = { cliente, contacto, destino, tipoEnvio, codigo, almacenId, nota }
export const registrarTracking = async ({ form, clientesEnMemoria, auth }) => {
  const { cliente, contacto, destino, tipoEnvio, codigo, almacenId, nota } = form;

  if (!cliente.trim()) throw new Error("Escribe el nombre del cliente.");
  if (!contacto.trim()) throw new Error("Escribe el WhatsApp del cliente.");
  if (!codigo.trim() && !almacenId.trim()) throw new Error("Escribe el número de tracking o el ID de almacén.");

  const clienteResuelto = await resolverCliente({
    clientesEnMemoria, nombre: cliente, telefono: contacto, tipo: "General", auth
  });

  const { error } = await supabase.from("tracking_registros").insert([{
    cliente,
    contacto,
    destino,
    tipo_envio: tipoEnvio,
    tracking: codigo,
    almacen_id: almacenId,
    nota,
    peso: 0,
    estado: "Miami",
    cliente_id: clienteResuelto.id,
    cliente_codigo: clienteResuelto.codigo,
    cliente_tipo: clienteResuelto.tipo,
    fecha: new Date().toISOString(),
    ...firmarPayload(auth)
  }]);
  if (error) throw error;

  await registrarAuditoria({
    ...auth, accion: "Registró tracking", modulo: "Trackings",
    registroCodigo: codigo || almacenId, detalle: cliente
  });
};

const COLUMNAS_EDITABLES = { peso: "peso", estado: "estado", almacenId: "almacen_id", costoInterno: "costo_interno", nota: "nota", tipoEnvio: "tipo_envio" };

export const actualizarTracking = async ({ tracking, field, value, auth }) => {
  const columna = COLUMNAS_EDITABLES[field];
  if (!columna) throw new Error(`Campo no editable: ${field}`);

  const { error } = await supabase.from("tracking_registros").update({
    [columna]: value,
    updated_by: auth.session?.user?.id || null,
    updated_by_name: auth.usuarioActual?.nombre || auth.usuarioActual?.email || auth.session?.user?.email || "Usuario"
  }).eq("id", tracking.id);
  if (error) throw error;

  await registrarAuditoria({
    ...auth, accion: field === "peso" ? "Registró peso" : "Actualizó tracking", modulo: "Trackings",
    registroCodigo: tracking.tracking || tracking.almacenId || "", detalle: `${field}: ${value}`
  });
};

export const eliminarTracking = async ({ tracking, auth }) => {
  const { error } = await supabase.from("tracking_registros").delete().eq("id", tracking.id);
  if (error) throw error;
  await registrarAuditoria({
    ...auth, accion: "Eliminó tracking", modulo: "Trackings",
    registroCodigo: tracking.tracking || "", detalle: tracking.cliente || ""
  });
};

export const generarRecibo = async ({ cliente, trackings, tarifas, tarifaPerfil, tarifaPersonalizada, descuento, gastosExtras, nota, fecha, auth }) => {
  if (!trackings || trackings.length === 0) throw new Error("Selecciona al menos un tracking listo para generar el recibo.");

  const destinos = new Set(trackings.map((t) => t.destino));
  if (destinos.size > 1) throw new Error("Todos los trackings de un mismo recibo deben ser del mismo destino.");
  const destino = trackings[0].destino;

  const tipoEnvioRecibo = tipoEnvioResumen(trackings);
  const tarifaBase = tarifaDesdePerfil(tarifas, tarifaPerfil, tipoEnvioRecibo, tarifaPersonalizada);

  const totalLibras = trackings.reduce((a, t) => a + numero(t.peso), 0);
  const bruto = trackings.reduce(
    (a, t) => a + numero(t.peso) * tarifaDesdePerfil(tarifas, tarifaPerfil, t.tipoEnvio, tarifaPersonalizada),
    0
  );
  const total = Math.max(bruto - numero(descuento), 0);

  const costoInternoTotal = trackings.reduce((a, t) => {
    const costo = t.costoInterno !== undefined && t.costoInterno !== "" ? numero(t.costoInterno) : costoInternoDefaultPorTipo(t.tipoEnvio);
    return a + numero(t.peso) * costo;
  }, 0);
  const gananciaReal = total - costoInternoTotal - numero(gastosExtras);

  const pipeline = estadosPorDestino(destino);
  const indices = trackings.map((t) => { const idx = pipeline.indexOf(t.estado); return idx === -1 ? 0 : idx; });
  const estadoRecibo = pipeline[Math.min(...indices)];

  const trackingsParaRecibo = trackings.map((t) => ({
    codigo: t.tracking,
    almacenId: t.almacenId,
    peso: numero(t.peso),
    tipoEnvio: t.tipoEnvio,
    estado: t.estado,
    costoInterno: t.costoInterno
  }));

  const numeroRecibo = await generarCodigoRecibo();
  const horaActual = new Date().toTimeString().slice(0, 8);
  const fechaISO = fecha ? new Date(`${fecha}T${horaActual}`).toISOString() : new Date().toISOString();

  const { data: creado, error } = await supabase.from("envios").insert([{
    numero_envios: numeroRecibo,
    cliente_id: cliente.id,
    cliente_codigo: cliente.codigo,
    cliente_tipo: cliente.tipo,
    cliente: cliente.nombre,
    contacto: cliente.telefono,
    lugar: destino,
    tipo_envios: tipoEnvioRecibo,
    estado: estadoRecibo,
    tarifa: tarifaBase,
    tarifa_perfil: tarifaPerfil,
    tarifa_personalizada: numero(tarifaPersonalizada),
    descuento: numero(descuento),
    gastos_extras: numero(gastosExtras),
    nota_gastos: nota || "",
    costo_interno_total: costoInternoTotal,
    ganancia_real: gananciaReal,
    total_libras: totalLibras,
    total,
    abono: 0,
    saldo: total,
    trackings: trackingsParaRecibo,
    ...firmarPayload(auth),
    fecha: fechaISO
  }]).select().single();

  if (error) throw error;

  const idsFacturados = trackings.map((t) => t.id);
  await supabase.from("tracking_registros").delete().in("id", idsFacturados);

  if (total > 0) {
    await postearAsiento({
      fecha: fechaISO,
      descripcion: `Recibo ${numeroRecibo} · ${cliente.nombre}`,
      origenModulo: "envios",
      origenId: creado.id,
      auth,
      lineas: [
        { cuentaCodigo: "1030", debe: total, haber: 0 },
        { cuentaCodigo: "4010", debe: 0, haber: total }
      ]
    });
  }

  await registrarAuditoria({
    ...auth, accion: "Generó recibo", modulo: "Paquetería", registroCodigo: numeroRecibo,
    detalle: `${cliente.nombre} · ${trackings.length} tracking(s) · $${total.toFixed(2)}`
  });

  return { numeroRecibo, envio: normalizarEnvio(creado) };
};