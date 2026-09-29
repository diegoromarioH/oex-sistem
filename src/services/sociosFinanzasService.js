import { supabase } from "../supabase";

export const dineroSocio = v => "$" + Number(v || 0).toFixed(2);
export const fechaSocio = v => v ? new Date(v.length === 10 ? v + "T12:00:00-06:00" : v).toLocaleDateString("es-NI", { timeZone: "America/Managua" }) : "Por confirmar";
export const fechaISOSocio = v => {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Managua", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(v));
  return ["year", "month", "day"].map(k => partes.find(p => p.type === k).value).join("-");
};
export const hoySocio = () => fechaISOSocio(new Date());

async function todas(consulta) {
  const filas = [];
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await consulta().range(inicio, inicio + 499);
    if (error) throw error;
    filas.push(...data);
    if (data.length < 500) return filas;
  }
}

export const listarComisionesSocio = id => todas(() => supabase.from("socios_comisiones").select("*").eq("socio_id", id).order("envio_id"));
export const listarRetirosSocio = id => todas(() => {
  let q = supabase.from("socios_retiros").select("*,socios_retiros_detalle(*)").order("id", { ascending: false });
  return id ? q.eq("socio_id", id) : q;
});
export async function solicitarRetiroSocio(id, filas) {
  const total = Math.round(filas.reduce((s, f) => s + Number(f.comision), 0) * 100) / 100;
  const { data, error } = await supabase.rpc("solicitar_retiro_socio", {
    p_socio_id: id, p_envios: filas.map(f => f.envio_id), p_total_esperado: total,
  });
  if (error) throw error;
  return data;
}
export async function gestionarRetiroSocio(id, form) {
  const { error } = await supabase.rpc("gestionar_retiro_socio", {
    p_retiro_id: id, p_accion: form.accion,
    p_cuenta_id: form.cuenta ? Number(form.cuenta) : null, p_fecha: form.fecha || null,
    p_tasa: form.tasa ? Number(form.tasa) : null, p_referencia: form.referencia || null,
    p_comprobante: form.comprobante || null, p_motivo: form.motivo || null,
  });
  if (error) throw error;
}

export function agruparCortesSocio(filas, retiros) {
  const grupos = new Map();
  const grupo = periodo => {
    if (!grupos.has(periodo)) grupos.set(periodo, { periodo, curso: 0, revision: 0, disponible: 0, pendiente: 0, pagado: 0, filas: [], cantidad: 0 });
    return grupos.get(periodo);
  };
  filas.filter(f => !f.retiro_id).forEach(f => {
    const g = grupo(f.periodo || "Por confirmar");
    g[f.estado_comision] += Number(f.comision || 0); g.filas.push(f); g.cantidad++;
  });
  retiros.filter(r => r.estado !== "anulado").forEach(r => (r.socios_retiros_detalle || []).forEach(d => {
    const g = grupo(d.periodo); g[r.estado] += Number(d.comision); g.cantidad++;
  }));
  return [...grupos.values()].sort((a, b) => b.periodo.localeCompare(a.periodo));
}
