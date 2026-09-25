// src/services/proveedoresService.js
import { supabase } from "../supabase";
import { numero } from "../utils/numero";
import { firmarPayload, registrarAuditoria } from "./coreService";
import { costoTrackingConProveedor } from "../utils/calculosPaqueteria";
import { siguienteEstadoTrasRetiroProveedor } from "../utils/estadosEnvio";
import { ajustarSaldoCuentaDinero } from "./cuentasDineroService";
import { postearAsiento } from "./ContabilidadService";
import { convertirMoneda, redondearDinero } from "../utils/conversionMoneda";

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

const costoEstimadoTracking = (t, proveedor, configOperativa) => numero(t.peso) * costoTrackingConProveedor(t, proveedor, configOperativa);\n\nexport const calcularMontoEstimado = (trackings, proveedor, configOperativa) => trackings.reduce((a, t) => a + costoEstimadoTracking(t, proveedor, configOperativa), 0);
