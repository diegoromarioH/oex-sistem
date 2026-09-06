// src/services/trackingsService.js
import { supabase } from "../supabase";
import { numero } from "../utils/numero";
import { normalizarEnvio } from "../utils/clientes";
import { resolverCliente } from "./clientesService";
import { generarCodigoRecibo, firmarPayload, registrarAuditoria } from "./coreService";
import { estadosPorDestino } from "../utils/estadosEnvio";
import { tarifaDesdePerfil, costoInternoDefaultPorTipo, tipoEnvioResumen } from "../utils/calculosPaqueteria";
import { postearAsiento } from "./ContabilidadService";

const costoProveedorPorTipo = (proveedor, tipoEnvio) => {
  if (!proveedor) return costoInternoDefaultPorTipo(tipoEnvio);
  const costo = tipoEnvio === "Aéreo" ? proveedor.tarifaAereo : proveedor.tarifaMaritimo;
  return costo !== undefined && costo !== null && costo !== "" ? numero(costo) : costoInternoDefaultPorTipo(tipoEnvio);
};

export const confirmarTracking = async ({ tracking, clientesEnMemoria, proveedorAduana, almacenId, auth }) => {
  if (!proveedorAduana?.id) throw new Error("Selecciona el proveedor de Aduana / Flete.");
  if (!String(almacenId || "").trim()) throw new Error("Escribe el ID de almacén.");

  let clienteResuelto = null;
  if (tracking.clienteId) {
    const existentePorId = clientesEnMemoria.find((c) => c.id === tracking.clienteId);
    if (existentePorId) clienteResuelto = { id: existentePorId.id, codigo: existentePorId.codigo, nombre: existentePorId.nombre, telefono: existentePorId.telefono, tipo: existentePorId.tipo, esNuevo: false };
  }
  if (!clienteResuelto) clienteResuelto = await resolverCliente({ clientesEnMemoria, nombre: tracking.cliente, telefono: tracking.contacto, tipo: "General", codigo: tracking.clienteCodigo, auth });

  const costoInterno = costoProveedorPorTipo(proveedorAduana, tracking.tipoEnvio);
  const { error } = await supabase.from("tracking_registros").update({
    estado: "Miami",
    cliente_id: clienteResuelto.id,
    cliente_codigo: clienteResuelto.codigo,
    cliente_tipo: clienteResuelto.tipo,
    cliente: clienteResuelto.nombre || tracking.cliente,
    contacto: clienteResuelto.telefono || tracking.contacto,
    almacen_id: String(almacenId).trim(),
    proveedor_aduana_id: proveedorAduana.id,
    costo_interno: costoInterno,
    updated_by: auth.session?.user?.id || null,
    updated_by_name: auth.usuarioActual?.nombre || auth.usuarioActual?.email || auth.session?.user?.email || "Usuario"
  }).eq("id", tracking.id);
  if (error) throw error;
  await registrarAuditoria({ ...auth, accion: "Confirmó tracking recibido", modulo: "Trackings", registroCodigo: tracking.tracking || almacenId || "", detalle: `${clienteResuelto.nombre || tracking.cliente || ""} · ${proveedorAduana.nombre} · $${costoInterno.toFixed(2)}/lb` });
};

export const actualizarPrealerta = async ({ tracking, cambios, auth }) => {
  const cliente = String(cambios.cliente || "").trim();
  const contacto = String(cambios.contacto || "").trim();
  const codigo = String(cambios.codigo || "").trim();
  const almacenId = String(cambios.almacenId || "").trim();
  if (!cliente) throw new Error("Escribe el nombre del cliente.");
  if (!contacto) throw new Error("Escribe el WhatsApp del cliente.");
  if (!codigo && !almacenId) throw new Error("Escribe el número de tracking o el ID de almacén.");

  const { error } = await supabase.from("tracking_registros").update({
    cliente,
    contacto,
    cliente_codigo: String(cambios.clienteCodigo || "").trim() || null,
    destino: cambios.destino,
    tipo_envio: cambios.tipoEnvio,
    tracking: codigo,
    almacen_id: almacenId,
    nota: cambios.nota || "",
    updated_by: auth.session?.user?.id || null,
    updated_by_name: auth.usuarioActual?.nombre || auth.usuarioActual?.email || auth.session?.user?.email || "Usuario"
  }).eq("id", tracking.id);
  if (error) throw error;
  await registrarAuditoria({ ...auth, accion: "Editó prealerta", modulo: "Trackings", registroCodigo: codigo || almacenId, detalle: cliente });
};

export const registrarTracking = async ({ form, clientesEnMemoria, proveedorAduana, auth }) => {
  const { cliente, contacto, destino, tipoEnvio, codigo, almacenId, nota, estadoInicial = "Prealertado" } = form;
  if (!cliente.trim()) throw new Error("Escribe el nombre del cliente.");
  if (!contacto.trim()) throw new Error("Escribe el WhatsApp del cliente.");
  if (!codigo.trim()) throw new Error("Escribe el número de tracking.");
  if (!proveedorAduana?.id) throw new Error("Selecciona el proveedor de Aduana / Flete.");
  if (estadoInicial === "Miami" && !String(almacenId || "").trim()) throw new Error("Para registrar como Recibido en Miami debes escribir el ID de almacén.");

  const clienteResuelto = await resolverCliente({ clientesEnMemoria, nombre: cliente, telefono: contacto, tipo: "General", auth });
  const costoInterno = costoProveedorPorTipo(proveedorAduana, tipoEnvio);
  const { error } = await supabase.from("tracking_registros").insert([{
    cliente,
    contacto,
    destino,
    tipo_envio: tipoEnvio,
    tracking: codigo.trim(),
    almacen_id: String(almacenId || "").trim(),
    nota,
    peso: 0,
    estado: estadoInicial,
    origen_registro: "manual",
    proveedor_aduana_id: proveedorAduana.id,
    costo_interno: costoInterno,
    cliente_id: clienteResuelto.id,
    cliente_codigo: clienteResuelto.codigo,
    cliente_tipo: clienteResuelto.tipo,
    fecha: new Date().toISOString(),
    ...firmarPayload(auth)
  }]);
  if (error) throw error;
  await registrarAuditoria({ ...auth, accion: "Registró tracking", modulo: "Trackings", registroCodigo: codigo || almacenId, detalle: `${cliente} · ${estadoInicial === "Miami" ? "Recibido en Miami" : "Prealertado"} · ${proveedorAduana.nombre} · $${costoInterno.toFixed(2)}/lb` });
};

const COLUMNAS_EDITABLES = { peso: "peso", estado: "estado", almacenId: "almacen_id", costoInterno: "costo_interno", nota: "nota", tipoEnvio: "tipo_envio" };
export const actualizarTracking = async ({ tracking, field, value, auth }) => {
  const columna = COLUMNAS_EDITABLES[field];
  if (!columna) throw new Error(`Campo no editable: ${field}`);
  if (field === "estado" && value === "Miami" && !String(tracking.almacenId || "").trim()) {
    throw new Error("Antes de marcar como Recibido en Miami, registra el ID de almacén.");
  }
  const { error } = await supabase.from("tracking_registros").update({ [columna]: value, updated_by: auth.session?.user?.id || null, updated_by_name: auth.usuarioActual?.nombre || auth.usuarioActual?.email || auth.session?.user?.email || "Usuario" }).eq("id", tracking.id);
  if (error) throw error;
  await registrarAuditoria({ ...auth, accion: field === "peso" ? "Registró peso" : "Actualizó tracking", modulo: "Trackings", registroCodigo: tracking.tracking || tracking.almacenId || "", detalle: `${field}: ${value}` });
};

export const eliminarTracking = async ({ tracking, auth }) => {
  const { error } = await supabase.from("tracking_registros").delete().eq("id", tracking.id);
  if (error) throw error;
  await registrarAuditoria({ ...auth, accion: "Eliminó tracking", modulo: "Trackings", registroCodigo: tracking.tracking || "", detalle: tracking.cliente || "" });
};

export const generarRecibo = async ({ cliente, trackings, tarifas, tarifaPerfil, tarifaPersonalizada, descuento, gastosExtras, nota, fecha, auth }) => {
  if (!trackings || trackings.length === 0) throw new Error("Selecciona al menos un tracking listo para generar el recibo.");
  const destinos = new Set(trackings.map((t) => t.destino));
  if (destinos.size > 1) throw new Error("Todos los trackings de un mismo recibo deben ser del mismo destino.");
  const destino = trackings[0].destino;
  const tipoEnvioRecibo = tipoEnvioResumen(trackings);
  const tarifaBase = tarifaDesdePerfil(tarifas, tarifaPerfil, tipoEnvioRecibo, tarifaPersonalizada);
  const totalLibras = trackings.reduce((a, t) => a + numero(t.peso), 0);
  const bruto = trackings.reduce((a, t) => a + numero(t.peso) * tarifaDesdePerfil(tarifas, tarifaPerfil, t.tipoEnvio, tarifaPersonalizada), 0);
  const total = Math.max(bruto - numero(descuento), 0);
  const costoInternoTotal = trackings.reduce((a, t) => {
    const costo = t.costoInterno !== undefined && t.costoInterno !== "" ? numero(t.costoInterno) : costoInternoDefaultPorTipo(t.tipoEnvio);
    return a + numero(t.peso) * costo;
  }, 0);
  const gananciaReal = total - costoInternoTotal - numero(gastosExtras);
  const numeroRecibo = await generarCodigoRecibo();
  const fechaRecibo = fecha || new Date().toISOString();
  const payload = {
    numero: numeroRecibo, cliente: cliente.nombre, cliente_id: cliente.id, cliente_codigo: cliente.codigo, cliente_tipo: cliente.tipo,
    contacto: cliente.telefono, destino, tipo_envios: tipoEnvioRecibo, trackings: trackings.map(normalizarEnvio), total_libras: totalLibras,
    tarifa: tarifaBase, descuento: numero(descuento), gastos_extras: numero(gastosExtras), total, costo_interno_total: costoInternoTotal,
    ganancia_real: gananciaReal, abono: 0, saldo: total, estado: estadosPorDestino(destino)[0], nota: nota || "", fecha: fechaRecibo, ...firmarPayload(auth)
  };
  const { data: envio, error } = await supabase.from("envios").insert([payload]).select().single();
  if (error) throw error;
  const ids = trackings.map((t) => t.id).filter(Boolean);
  if (ids.length) {
    const { error: deleteError } = await supabase.from("tracking_registros").delete().in("id", ids);
    if (deleteError) throw deleteError;
  }
  await postearAsiento({ fecha: fechaRecibo, descripcion: `Venta paquetería · Recibo ${numeroRecibo} · ${cliente.nombre}`, origenModulo: "envios", origenId: envio.id, auth, lineas: [{ cuentaCodigo: "1030", debe: total, haber: 0 }, { cuentaCodigo: "4010", debe: 0, haber: total }] });
  await registrarAuditoria({ ...auth, accion: "Generó recibo", modulo: "Paquetería", registroCodigo: numeroRecibo, detalle: `${cliente.nombre} · ${trackings.length} tracking(s) · $${total.toFixed(2)}` });
  return envio;
};
