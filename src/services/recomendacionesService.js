import { supabase } from "../supabase";

const TABLA = "socios_recomendacion";

const normalizarIdentificador = (valor = "") => valor
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

export const construirEnlaceRecomendacion = (identificador) =>
  `https://oexni.com/prealerta/${normalizarIdentificador(identificador)}`;

export const listarSociosRecomendacion = async () => {
  const { data, error } = await supabase
    .from(TABLA)
    .select("*")
    .order("creado_en", { ascending: false });
  if (error) throw error;
  return data || [];
};

export const listarClientesRecomendados = async () => {
  const { data, error } = await supabase
    .from("clientes")
    .select("id,codigo_cliente,nombre,telefono,socio_recomendacion_id,recomendacion_origen,recomendacion_fecha")
    .not("socio_recomendacion_id", "is", null)
    .order("recomendacion_fecha", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data || [];
};

export const actualizarRecomendacionCliente = async ({ clienteId, socioId, origen = "manual" }) => {
  const asignado = Boolean(socioId);
  const payload = {
    socio_recomendacion_id: asignado ? Number(socioId) : null,
    recomendacion_origen: asignado ? origen : null,
    recomendacion_fecha: asignado ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("clientes")
    .update(payload)
    .eq("id", clienteId)
    .select("id,socio_recomendacion_id,recomendacion_origen,recomendacion_fecha")
    .single();
  if (error) throw error;
  return data;
};

export const guardarSocioRecomendacion = async ({ id, ...valores }, auth) => {
  const ahora = new Date().toISOString();
  const payload = {
    nombre: valores.nombre.trim(),
    whatsapp: valores.whatsapp?.trim() || null,
    correo: valores.correo?.trim() || null,
    foto_url: valores.foto_url?.trim() || null,
    identificador: normalizarIdentificador(valores.identificador || valores.nombre),
    estado: valores.estado || "pendiente",
    porcentaje_utilidad: Number(valores.porcentaje_utilidad || 20),
    tarifa_maritima: valores.tarifa_maritima === "" ? null : Number(valores.tarifa_maritima),
    tarifa_aerea: valores.tarifa_aerea === "" ? null : Number(valores.tarifa_aerea),
    tarifa_promocional_activa: Boolean(valores.tarifa_promocional_activa),
    metodo_pago: valores.metodo_pago?.trim() || null,
    datos_pago: valores.datos_pago?.trim() || null,
    notas: valores.notas?.trim() || null,
    fecha_ingreso: valores.fecha_ingreso || new Date().toISOString().slice(0, 10),
    actualizado_en: ahora,
  };

  if (!payload.nombre) throw new Error("El nombre es obligatorio.");
  if (!payload.identificador) throw new Error("El identificador de recomendación es obligatorio.");

  if (id) {
    const { data, error } = await supabase.from(TABLA).update(payload).eq("id", id).select().single();
    if (error) throw error;
    return data;
  }

  payload.creado_por = auth?.session?.user?.id || null;
  const { data, error } = await supabase.from(TABLA).insert(payload).select().single();
  if (error) throw error;
  return data;
};

export const eliminarSocioRecomendacion = async (id) => {
  const { error } = await supabase.from(TABLA).delete().eq("id", id);
  if (error) throw error;
};

export { normalizarIdentificador };
