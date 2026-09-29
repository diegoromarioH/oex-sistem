import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import jsPDF from "jspdf";
import { supabase } from "../supabase";

const monto = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const dinero = (v) => "$" + monto(v).toFixed(2);
const fecha = (v) => v ? new Date(v).toLocaleDateString("es-NI", { timeZone: "America/Managua" }) : "Sin confirmar";
const tresDias = 3 * 24 * 60 * 60 * 1000;
const fechaValida = (v) => v && Number.isFinite(new Date(v).getTime());

export function calcularFinanzasSocio({ recibos, clientes, eventos, porcentaje, ahora = new Date() }) {
  const clientesPorId = new Map(clientes.map((c) => [String(c.id), c]));
  return recibos.filter((e) => {
    const cliente = clientesPorId.get(String(e.cliente_id));
    return cliente && fechaValida(cliente.recomendacion_fecha) && fechaValida(e.fecha)
      && new Date(e.fecha) >= new Date(cliente.recomendacion_fecha);
  }).map((e) => {
    const entregas = eventos.filter((a) => a.registro_codigo === e.numero_envios &&
      (a.accion === "Saldó y entregó envío" || (a.accion === "Cambió estado" && /→ Entregado(?: ·|$)/.test(a.detalle || ""))));
    const entrega = entregas.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]?.created_at || null;
    const madura = fechaValida(entrega) ? new Date(new Date(entrega).getTime() + tresDias) : null;
    const utilidad = monto(e.ganancia_real);
    const comision = Math.round(Math.max(utilidad, 0) * monto(porcentaje)) / 100;
    let estado = "Pendiente de entrega";
    if (e.estado === "Entregado") {
      estado = monto(e.saldo) > 0.005 ? "Pendiente de cobro"
        : e.ganancia_real == null || e.costo_interno_total == null ? "Validar costos"
        : !madura ? "Confirmar fecha de entrega"
        : ahora < madura ? "Esperando 3 días" : "Elegible para revisión";
    }
    const parte = madura ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Managua", year: "numeric", month: "2-digit" }).formatToParts(madura) : [];
    const anio = Number(parte.find((p) => p.type === "year")?.value);
    const mes = Number(parte.find((p) => p.type === "month")?.value);
    const periodoPago = madura ? new Date(Date.UTC(anio, mes, 1)).toISOString().slice(0, 7) : "";
    return { ...e, utilidad, comision, entrega, estadoComision: estado, periodoPago };
  });
}

function descargarPDF(socio, filas) {
  const doc = new jsPDF();
  let y = 20;
  const linea = (texto, size = 10) => {
    doc.setFontSize(size);
    const lineas = doc.splitTextToSize(texto, 178);
    for (const l of lineas) {
      if (y > 275) { doc.addPage(); y = 20; }
      doc.text(l, 16, y); y += size === 16 ? 9 : 6;
    }
  };
  linea("OEX | Reporte de recomendaciones", 16);
  linea(socio.nombre + " · " + socio.identificador.toUpperCase(), 12);
  linea("Generado: " + fecha(new Date()));
  linea("Participación: " + socio.porcentaje_utilidad + "% de utilidad positiva.");
  linea("Comisión estimada: " + dinero(filas.reduce((a, e) => a + e.comision, 0)));
  linea("Elegible para revisión: " + dinero(filas.filter((e) => e.estadoComision === "Elegible para revisión").reduce((a, e) => a + e.comision, 0)));
  linea("Pagos del 1 al 5. Se consideran 3 días después de entrega y saldo cero.");
  linea("Este reporte estima comisiones; no acredita pagos realizados al socio.");
  y += 6;
  if (!filas.length) linea("No hay recibos posteriores a la vinculación de sus clientes.");
  filas.forEach((e) => {
    linea(e.numero_envios + " · " + e.cliente, 12);
    linea("Recibo: " + fecha(e.fecha) + " | Entrega: " + fecha(e.entrega));
    linea("Venta " + dinero(e.total) + " | Costo " + dinero(e.costo_interno_total) + " | Utilidad " + dinero(e.utilidad));
    linea("Comisión " + dinero(e.comision) + " | " + e.estadoComision);
    if (e.periodoPago) linea("Primer período de pago: 1 al 5 de " + e.periodoPago);
    y += 4;
  });
  doc.save("OEX-recomendaciones-" + socio.identificador + ".pdf");
}

export default function FinanzasSocio({ socio, clientes, mostrarToast }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const ids = clientes.map((c) => c.id).join(",");
  useEffect(() => {
    let activo = true;
    setCargando(true); setError("");
    const cargar = async () => {
      try {
        if (!clientes.length) { if (activo) setFilas([]); return; }
        const { data: recibos, error: errorRecibos } = await supabase.from("envios")
          .select("id,numero_envios,cliente,cliente_id,fecha,estado,total,saldo,costo_interno_total,ganancia_real")
          .in("cliente_id", clientes.map((c) => c.id)).order("fecha", { ascending: false });
        if (errorRecibos) throw errorRecibos;
        let eventos = [];
        const numeros = (recibos || []).map((e) => e.numero_envios).filter(Boolean);
        if (numeros.length) {
          const { data, error: errorEventos } = await supabase.from("audit_log")
            .select("registro_codigo,accion,detalle,created_at").eq("modulo", "Paquetería")
            .in("registro_codigo", numeros).in("accion", ["Saldó y entregó envío", "Cambió estado"]);
          if (errorEventos) throw errorEventos;
          eventos = data || [];
        }
        if (activo) setFilas(calcularFinanzasSocio({ recibos: recibos || [], clientes, eventos, porcentaje: socio.porcentaje_utilidad }));
      } catch (err) {
        if (activo) { setFilas([]); setError(err.message || "No se pudieron cargar las finanzas."); }
      } finally { if (activo) setCargando(false); }
    };
    cargar();
    return () => { activo = false; };
  }, [socio.id, socio.porcentaje_utilidad, ids, revision]);

  const estimada = filas.reduce((a, e) => a + e.comision, 0);
  const elegible = filas.filter((e) => e.estadoComision === "Elegible para revisión").reduce((a, e) => a + e.comision, 0);
  return <section className="card">
    <div className="page-title" style={{ margin: 0 }}><h3>Finanzas del socio</h3><div className="segment">
      <button type="button" className="btn" disabled={cargando} onClick={() => setRevision((v) => v + 1)}><RefreshCw size={15} />Actualizar</button>
      <button type="button" className="btn" disabled={cargando || Boolean(error)} onClick={() => { try { descargarPDF(socio, filas); } catch { mostrarToast?.("No se pudo descargar el reporte.", "error"); } }}><Download size={15} />Descargar reporte PDF</button>
    </div></div>
    {cargando ? <p>Cargando recibos y comisiones…</p> : error ? <p role="alert">{error}</p> : <>
      <div className="grid-4 recomendaciones-metricas mt-16">
        <div className="metric"><b>Recibos vinculados</b><span className="metric-value">{filas.length}</span></div>
        <div className="metric"><b>Ventas</b><span className="metric-value">{dinero(filas.reduce((a, e) => a + monto(e.total), 0))}</span></div>
        <div className="metric"><b>Comisión estimada</b><span className="metric-value">{dinero(estimada)}</span></div>
        <div className="metric"><b>Elegible para revisión</b><span className="metric-value">{dinero(elegible)}</span></div>
      </div>
      <p className="muted">Pagos del 1 al 5 del mes siguiente a completar los 3 días de entrega, con saldo cero. Se cuentan recibos posteriores a la vinculación del cliente. Las comisiones son estimadas; los pagos al socio aún no se registran aquí.</p>
      <div className="recomendaciones-tabla-wrap"><table className="recomendaciones-tabla"><thead><tr><th>Recibo / cliente</th><th>Venta</th><th>Utilidad</th><th>Comisión</th><th>Estado</th><th>Período de pago</th></tr></thead>
      <tbody>{filas.map((e) => <tr key={e.id}><td><strong>{e.numero_envios}</strong><small className="tabla-subtexto">{e.cliente} · {fecha(e.fecha)}</small></td><td>{dinero(e.total)}</td><td>{dinero(e.utilidad)}</td><td>{dinero(e.comision)}</td><td>{e.estadoComision}<small className="tabla-subtexto">Entrega: {fecha(e.entrega)}</small></td><td>{e.periodoPago ? "1 al 5 de " + e.periodoPago : "Por confirmar"}</td></tr>)}</tbody></table></div>
      {!filas.length && <p className="muted">Todavía no hay recibos posteriores a la vinculación de los clientes de este socio.</p>}
    </>}
  </section>;
}
