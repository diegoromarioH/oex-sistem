// src/services/darioImportService.js
import { supabase } from "../supabase";
import { numero } from "../utils/numero";
import { registrarAuditoria } from "./coreService";
import { actualizarTrackingEnvio } from "./enviosService";

const normalizar = (valor) => String(valor || "").trim().toLowerCase();

export const mapearEstadoDario = (estadoDario, destinoOEX) => {
  const estado = normalizar(estadoDario);
  if (estado === "recibido") return "Miami";
  if (["nicaragua", "aduana", "bodega managua", "tránsito a sucursal", "transito a sucursal"].includes(estado)) return "Nicaragua";
  if (["en sucursal", "sucursal"].includes(estado)) return "Bodega OEX";
  if (estado === "entregado") {
    if (destinoOEX === "Managua") return "Tránsito Managua";
    if (destinoOEX === "Ometepe") return "Tránsito Ometepe";
    return null;
  }
  return null;
};

export const listarDarioSync = async () => {
  const { data, error } = await supabase.from("dario_tracking_sync").select("*").order("ultimo_visto_en", { ascending: false });
  if (error) throw error;
  return data || [];
};

export const guardarSnapshotDario = async ({ trackingOEX, paquete }) => {
  if (!trackingOEX?.id) throw new Error("No se encontró el tracking en OEX.");
  const codigo = String(paquete?.trackingId || paquete?.tracking || "").trim();
  if (!codigo) throw new Error("El paquete de Darío no tiene tracking.");
  const payload = {
    tracking_id: trackingOEX.id,
    dario_package_id: paquete?.idPackage == null ? null : String(paquete.idPackage),
    tracking_codigo: codigo,
    dario_estado: paquete?.packageStatus?.description || paquete?.status || null,
    dario_peso_lb: numero(paquete?.weightLb),
    dario_tipo_envio: paquete?.shipmentType?.description || null,
    dario_carrier: paquete?.carrier || null,
    dario_guide_number: paquete?.guideNumber || null,
    ultimo_visto_en: new Date().toISOString(),
    actualizado_en: new Date().toISOString()
  };
  const { error } = await supabase.from("dario_tracking_sync").upsert(payload, { onConflict: "tracking_id" });
  if (error) throw error;
  return payload;
};

export const aplicarEstadoDario = async ({ trackingOEX, estadoDario, auth }) => {
  const nuevoEstado = mapearEstadoDario(estadoDario, trackingOEX?.destino);
  if (!nuevoEstado) throw new Error("No se puede determinar el estado OEX. Revisa el estado de Darío y el destino del tracking.");
  if (trackingOEX.estado === "Entregado") throw new Error("OEX ya marcó este tracking como Entregado. Darío no puede revertir la entrega final.");
  if (trackingOEX.envioId) throw new Error("Este tracking ya pertenece a un recibo. El cambio de estado debe revisarse desde el recibo para mantenerlo sincronizado.");
  const { error } = await supabase.from("tracking_registros").update({
    estado: nuevoEstado,
    updated_by: auth.session?.user?.id || null,
    updated_by_name: auth.usuarioActual?.nombre || auth.usuarioActual?.email || auth.session?.user?.email || "Usuario"
  }).eq("id", trackingOEX.id);
  if (error) throw error;
  await registrarAuditoria({ ...auth, accion: "Sincronizó estado Darío", modulo: "Darío Import", registroCodigo: trackingOEX.tracking || "", detalle: `${estadoDario} → ${nuevoEstado}` });
  return nuevoEstado;
};

export const aplicarPesoDario = async ({ trackingOEX, pesoDario, envio = null, tarifas, auth }) => {
  const peso = numero(pesoDario);
  if (peso <= 0) throw new Error("Darío no reporta un peso válido.");
  if (trackingOEX.envioId) {
    if (!envio) throw new Error("Este tracking pertenece a un recibo y requiere revisión antes de cambiar el peso.");
    const index = (envio.trackings || []).findIndex((t) => String(t.id) === String(trackingOEX.id));
    if (index < 0) throw new Error("No se encontró el tracking dentro del recibo.");
    await actualizarTrackingEnvio({ envio, trackingIndex: index, field: "peso", value: peso, tarifas, auth });
    return peso;
  }
  const { error } = await supabase.from("tracking_registros").update({
    peso,
    updated_by: auth.session?.user?.id || null,
    updated_by_name: auth.usuarioActual?.nombre || auth.usuarioActual?.email || auth.session?.user?.email || "Usuario"
  }).eq("id", trackingOEX.id);
  if (error) throw error;
  await registrarAuditoria({ ...auth, accion: "Sincronizó peso Darío", modulo: "Darío Import", registroCodigo: trackingOEX.tracking || "", detalle: `${numero(trackingOEX.peso).toFixed(2)} lb → ${peso.toFixed(2)} lb` });
  return peso;
};
