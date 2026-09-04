// src/services/catalogoCuentasService.js
//
// CRUD del catálogo de cuentas contables (Fase 1 del plan de mejora
// financiera). No calcula saldos todavía — eso llega en Fase 3 cuando
// exista el libro diario. Por ahora es la lista maestra de cuentas que
// se usará para clasificar todo lo demás.
import { supabase } from "../supabase";
import { firmarPayload, registrarAuditoria } from "./coreService";

export const listarCuentasContables = async () => {
  const { data, error } = await supabase.from("cuentas_contables").select("*").order("codigo");
  if (error) throw error;
  return data;
};

export const crearCuentaContable = async ({ form, auth }) => {
  if (!form.codigo?.trim() || !form.nombre?.trim()) {
    throw new Error("Escribe código y nombre de la cuenta.");
  }
  if (!form.tipo || !form.naturaleza) {
    throw new Error("Selecciona tipo y naturaleza de la cuenta.");
  }
  const { error } = await supabase.from("cuentas_contables").insert([{
    codigo: form.codigo.trim(),
    nombre: form.nombre.trim(),
    tipo: form.tipo,
    naturaleza: form.naturaleza,
    cuenta_padre_id: form.cuentaPadreId || null,
    ...firmarPayload(auth)
  }]);
  if (error) throw error;
  await registrarAuditoria({
    ...auth, accion: "Creó cuenta contable", modulo: "Finanzas",
    registroCodigo: form.codigo.trim(), detalle: form.nombre.trim()
  });
};

export const actualizarCuentaContable = async ({ cuenta, cambios, auth }) => {
  const { error } = await supabase.from("cuentas_contables").update(cambios).eq("id", cuenta.id);
  if (error) throw error;
  await registrarAuditoria({
    ...auth, accion: "Actualizó cuenta contable", modulo: "Finanzas",
    registroCodigo: cuenta.codigo, detalle: Object.keys(cambios).join(", ")
  });
};

// No se borra físicamente — una cuenta puede tener movimientos
// históricos referenciándola. Se desactiva para que no aparezca en
// los selectores nuevos pero siga existiendo para auditoría.
export const desactivarCuentaContable = async ({ cuenta, auth }) => {
  const { error } = await supabase.from("cuentas_contables").update({ activa: false }).eq("id", cuenta.id);
  if (error) throw error;
  await registrarAuditoria({
    ...auth, accion: "Desactivó cuenta contable", modulo: "Finanzas", registroCodigo: cuenta.codigo
  });
};