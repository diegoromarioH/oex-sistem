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
  return Promise.all((data || []).map(async (socio) => {
    if (!socio.foto_path) return socio;
    const { data: firma } = await supabase.storage.from("socios-oex").createSignedUrl(socio.foto_path, 3600);
    return { ...socio, foto_url: firma?.signedUrl || socio.foto_url || null };
  }));
};

export const subirFotoSocio = async (archivo) => {
  const tipos = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  if (!tipos[archivo?.type]) throw new Error("La foto debe ser JPG, PNG o WEBP.");
  if (archivo.size > 3 * 1024 * 1024) throw new Error("La foto no puede superar 3 MB.");

  const { data: sesion } = await supabase.auth.getSession();
  const usuarioId = sesion?.session?.user?.id;
  if (!usuarioId) throw new Error("La sesión expiró. Inicia sesión nuevamente.");

  const nombre = `${crypto.randomUUID()}.${tipos[archivo.type]}`;
  const ruta = `${usuarioId}/${nombre}`;
  const { error } = await supabase.storage.from("socios-oex").upload(ruta, archivo, {
    cacheControl: "3600",
    contentType: archivo.type,
    upsert: false,
  });
  if (error) throw error;

  const { data: firma, error: errorFirma } = await supabase.storage.from("socios-oex").createSignedUrl(ruta, 3600);
  if (errorFirma) throw errorFirma;
  return { foto_path: ruta, foto_url: firma.signedUrl };
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
    foto_url: valores.foto_path ? null : (valores.foto_url?.trim() || null),
    foto_path: valores.foto_path?.trim() || null,
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
