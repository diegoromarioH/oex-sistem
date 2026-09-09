// src/services/proveedoresService.js
import { supabase } from "../supabase";
import { numero } from "../utils/numero";
import { firmarPayload, registrarAuditoria } from "./coreService";
import { costoInternoDefaultPorTipo } from "../utils/calculosPaqueteria";
import { siguienteEstadoTrasRetiroProveedor } from "../utils/estadosEnvio";
import { ajustarSaldoCuentaDinero } from "./cuentasDineroService";
import { postearAsiento } from "./ContabilidadService";

export const TIPOS_PROVEEDOR = ["Aduana / Flete", "Transporte local"];
const esAduanaFlete = (proveedor) => proveedor.tipo === "Aduana / Flete";
const cuentaCostoDe = (proveedor) => (esAduanaFlete(proveedor) ? "5010" : "5020");

export const crearProveedor = async ({ form, auth }) => {
  if (!form.nombre.trim()) throw new Error("Escribe el nombre del proveedor.");
  const esAduana = (form.tipo || "") === "Aduana / Flete";
  const { error } = await supabase.from("proveedores").insert([{
    nombre: form.nombre,
    tipo: form.tipo || "Transporte local",
    aplica_destino: form.aplicaDestino || "General",
    contacto: form.contacto || "",
    telefono: form.telefono || "",
    correo: form.correo || "",
    direccion: form.direccion || "",
    tarifa_maritimo: esAduana && form.tarifaMaritimo !== "" ? numero(form.tarifaMaritimo) : null,
    tarifa_aereo: esAduana && form.tarifaAereo !== "" ? numero(form.tarifaAereo) : null,
    notas: form.notas || "",
    ...firmarPayload(auth)
  }]);
  if (error) throw error;
  await registrarAuditoria({ ...auth, accion:"Creó proveedor", modulo:"Finanzas", registroCodigo:form.nombre, detalle:form.tipo || "" });
};

export const eliminarProveedor = async ({ proveedor, auth }) => {
  const { error } = await supabase.from("proveedores").delete().eq("id", proveedor.id);
  if (error) throw error;
  await registrarAuditoria({ ...auth, accion:"Eliminó proveedor", modulo:"Finanzas", registroCodigo:proveedor.nombre || "" });
};

export const actualizarProveedor = async ({ proveedor, form, auth }) => {
  if (!form.nombre.trim()) throw new Error("Escribe el nombre del proveedor.");
  const esAduana = form.tipo === "Aduana / Flete";
  const { error } = await supabase.from("proveedores").update({
    nombre: form.nombre,
    tipo: form.tipo,
    aplica_destino: form.aplicaDestino || "General",
    contacto: form.contacto || "",
    telefono: form.telefono || "",
    correo: form.correo || "",
    direccion: form.direccion || "",
    tarifa_maritimo: esAduana && form.tarifaMaritimo !== "" ? numero(form.tarifaMaritimo) : null,
    tarifa_aereo: esAduana && form.tarifaAereo !== "" ? numero(form.tarifaAereo) : null,
    notas: form.notas || "",
    updated_by: auth.session?.user?.id || null,
    updated_by_name: auth.usuarioActual?.nombre || auth.usuarioActual?.email || auth.session?.user?.email || "Usuario"
  }).eq("id", proveedor.id);
  if (error) throw error;
  await registrarAuditoria({ ...auth, accion:"Editó proveedor", modulo:"Finanzas", registroCodigo:form.nombre, detalle:form.tipo || "" });
};

const costoEstimadoTracking = (t) => {
  const costo = t.costoInterno !== undefined && t.costoInterno !== "" ? numero(t.costoInterno) : costoInternoDefaultPorTipo(t.tipoEnvio);
  return numero(t.peso) * costo;
};

export const calcularMontoEstimado = (trackings) => trackings.reduce((a, t) => a + costoEstimadoTracking(t), 0);

export const generarFacturaProveedor = async ({ proveedor, trackings = [], montoReal, numeroFactura, nota, link, fecha, auth }) => {
  const esAduana = esAduanaFlete(proveedor);
  if (esAduana && trackings.length === 0) throw new Error("Selecciona al menos un tracking para esta factura.");
  if (esAduana) {
    const ajenos = trackings.filter((t) => t.proveedorAduanaId && String(t.proveedorAduanaId) !== String(proveedor.id));
    if (ajenos.length) throw new Error("Hay trackings seleccionados que pertenecen a otro proveedor de Aduana / Flete.");
  }
  if (numero(montoReal) <= 0) throw new Error("Escribe el monto real que factura el proveedor.");

  const montoEstimado = esAduana ? calcularMontoEstimado(trackings) : numero(montoReal);
  const trackingsSnapshot = trackings.map((t) => ({
    id:t.id,
    codigo:t.tracking,
    almacenId:t.almacenId || "",
    cliente:t.cliente,
    destino:t.destino,
    tipoEnvio:t.tipoEnvio,
    peso:numero(t.peso),
    proveedorAduanaId:t.proveedorAduanaId || null,
    costoInterno:numero(t.costoInterno),
    costoEstimado:esAduana ? costoEstimadoTracking(t) : null
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

  await postearAsiento({ fecha:fechaISO, descripcion:`Factura ${numeroFactura || `#${creada.id}`} · ${proveedor.nombre}`, origenModulo:"facturas_proveedor", origenId:creada.id, auth, lineas:[{cuentaCodigo:cuentaCostoDe(proveedor),debe:numero(montoReal),haber:0},{cuentaCodigo:"2010",debe:0,haber:numero(montoReal)}] });

  const diferencia = numero(montoReal) - montoEstimado;
  await registrarAuditoria({ ...auth, accion:"Generó factura de proveedor", modulo:"Finanzas", registroCodigo:numeroFactura || `#${creada.id}`, detalle: esAduana ? `${proveedor.nombre} · ${trackings.length} tracking(s) · real $${numero(montoReal).toFixed(2)} vs. estimado $${montoEstimado.toFixed(2)} (dif. $${diferencia.toFixed(2)})` : `${proveedor.nombre} · $${numero(montoReal).toFixed(2)}` });
  return { facturaId:creada.id, montoEstimado, diferencia };
};

export const registrarPagoProveedor = async ({ factura, proveedor, monto, metodo, cuentaDinero, referencia, nota, fecha, tasaCambio, auth }) => {
  const montoNum = numero(monto);
  if (montoNum <= 0) throw new Error("El monto debe ser mayor a cero.");
  if (montoNum > numero(factura.saldo) + 0.01) throw new Error("El monto no puede ser mayor al saldo pendiente.");
  if (!metodo) throw new Error("Selecciona el método de pago.");
  if (!cuentaDinero?.id) throw new Error("Selecciona de cuál cuenta sale el pago (créala en Finanzas → Cuentas si no tienes ninguna).");
  const tasa = numero(tasaCambio);
  if (cuentaDinero.moneda === "NIO" && tasa <= 0) throw new Error("Configura una tasa de cambio válida para pagar dólares desde una cuenta en córdobas.");
  const montoCuenta = cuentaDinero.moneda === "NIO" ? montoNum * tasa : montoNum;

  const horaActual = new Date().toTimeString().slice(0, 8);
  const fechaISO = fecha ? new Date(`${fecha}T${horaActual}`).toISOString() : new Date().toISOString();
  const { data:pagoCreado, error:errorPago } = await supabase.from("pagos_proveedor").insert([{ factura_id:factura.id, monto:montoNum, metodo, cuenta:cuentaDinero.nombre, cuenta_dinero_id:cuentaDinero.id, referencia:referencia || "", nota:nota || "", fecha:fechaISO, ...firmarPayload(auth) }]).select().single();
  if (errorPago) throw errorPago;

  const nuevoAbonado = numero(factura.abonado) + montoNum;
  const nuevoSaldo = Math.max(numero(factura.montoReal) - nuevoAbonado, 0);
  const nuevoEstado = nuevoSaldo <= 0.01 ? "Pagada" : "Parcial";
  const { error } = await supabase.from("facturas_proveedor").update({ abonado:nuevoAbonado, saldo:nuevoSaldo, estado:nuevoEstado, updated_by:auth.session?.user?.id || null, updated_by_name:auth.usuarioActual?.nombre || auth.usuarioActual?.email || auth.session?.user?.email || "Usuario" }).eq("id", factura.id);
  if (error) throw error;

  if (nuevoEstado === "Pagada" && esAduanaFlete(proveedor || {}) && (factura.trackings || []).length > 0) {
    await Promise.all(factura.trackings.map((t) => supabase.from("tracking_registros").update({ estado:siguienteEstadoTrasRetiroProveedor(t.destino) }).eq("id", t.id)));
  }

  await ajustarSaldoCuentaDinero(cuentaDinero.id, -montoCuenta);
  if (cuentaDinero.cuentaContableId) {
    const { data:cuentaContable } = await supabase.from("cuentas_contables").select("codigo").eq("id", cuentaDinero.cuentaContableId).single();
    if (cuentaContable) await postearAsiento({ fecha:fechaISO, descripcion:`Pago a proveedor · Factura ${factura.numeroFactura || `#${factura.id}`}`, origenModulo:"pagos_proveedor", origenId:pagoCreado.id, auth, lineas:[{cuentaCodigo:"2010",debe:montoNum,haber:0},{cuentaCodigo:cuentaContable.codigo,cuentaDineroId:cuentaDinero.id,debe:0,haber:montoNum}] });
  }
  await registrarAuditoria({ ...auth, accion:"Registró pago a proveedor", modulo:"Finanzas", registroCodigo:factura.numeroFactura || `#${factura.id}`, detalle:`$${montoNum.toFixed(2)} · salió ${cuentaDinero.moneda === "NIO" ? "C$" : "$"}${montoCuenta.toFixed(2)} de ${cuentaDinero.nombre} · ${metodo}` });
};

export const listarPagosDeProveedor = async (proveedorId) => {
  const { data:facturas, error:errorFacturas } = await supabase.from("facturas_proveedor").select("id").eq("proveedor_id", proveedorId);
  if (errorFacturas) throw errorFacturas;
  const facturaIds = facturas.map((f) => f.id);
  if (!facturaIds.length) return [];
  const { data, error } = await supabase.from("pagos_proveedor").select("*").in("factura_id", facturaIds).order("fecha", { ascending:false });
  if (error) throw error;
  return data;
};
