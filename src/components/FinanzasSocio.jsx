import { useEffect, useState } from "react";
import jsPDF from "jspdf";
import RetirosSocios from "./RetirosSocios";
import { listarComisionesSocio, listarRetirosSocio, solicitarRetiroSocio, agruparCortesSocio, dineroSocio as dinero, fechaSocio as fecha } from "../services/sociosFinanzasService";

const etiquetas = { curso: "Ganancias en curso", revision: "Ganancias en revisión", disponible: "Disponible para retiro", pendiente: "Pendiente de pago", pagado: "Total pagado" };
function descargarReporte(socio, cortes, retiros) {
  const doc = new jsPDF(); let y = 20;
  const linea = texto => { for (const l of doc.splitTextToSize(texto, 178)) { if (y > 275) { doc.addPage(); y = 20; } doc.text(l, 16, y); y += 6; } };
  doc.setFontSize(12); linea("OEX | Finanzas del socio · " + socio.nombre); doc.setFontSize(10);
  linea("Generado: " + fecha(new Date().toISOString()));
  linea("Pagos del 1 al 5. Entrega, cobro y 3 días cumplidos. Sin mínimo.");
  cortes.forEach(c => {
    linea("Corte / período de pago: " + c.periodo);
    Object.keys(etiquetas).forEach(k => linea(etiquetas[k] + ": " + dinero(c[k])));
    c.filas.forEach(f => linea(f.numero_envios + " · " + f.cliente + " | Utilidad " + dinero(f.utilidad) + " | Comisión " + dinero(f.comision) + " | " + etiquetas[f.estado_comision])); y += 4;
  });
  retiros.forEach(r => {
    linea(r.numero + " · " + r.estado + " · " + dinero(r.monto_usd));
    linea("Solicitud " + fecha(r.creado_en) + (r.fecha_pago ? " | Pago " + fecha(r.fecha_pago) + " · " + r.referencia : ""));
    (r.socios_retiros_detalle || []).forEach(d => linea(d.numero_envio + " · " + d.periodo + " | Utilidad " + dinero(d.utilidad) + " | Comisión " + dinero(d.comision)));
  });
  doc.save("OEX-finanzas-" + socio.identificador + ".pdf");
}
export default function FinanzasSocio({ socio, mostrarToast }) {
  const [filas, setFilas] = useState([]), [retiros, setRetiros] = useState([]);
  const [cargando, setCargando] = useState(true), [error, setError] = useState("");
  const [revision, setRevision] = useState(0), [corte, setCorte] = useState(null), [guardando, setGuardando] = useState(false);
  useEffect(() => {
    let activo = true; setCargando(true); setError("");
    Promise.all([listarComisionesSocio(socio.id), listarRetirosSocio(socio.id)]).then(([f, r]) => { if (activo) { setFilas(f); setRetiros(r); } })
      .catch(e => { if (activo) setError(e.message); }).finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [socio.id, socio.porcentaje_utilidad, revision]);
  const cortes = agruparCortesSocio(filas, retiros);
  const totales = Object.fromEntries(Object.keys(etiquetas).map(k => [k, cortes.reduce((s, c) => s + c[k], 0)]));
  const disponibles = corte?.filas.filter(f => f.estado_comision === "disponible" && Number(f.comision) > 0) || [];
  const solicitar = async () => {
    setGuardando(true);
    try { await solicitarRetiroSocio(socio.id, disponibles); mostrarToast?.("Solicitud creada. Recibo pendiente en Finanzas → Pagos a socios."); }
    catch (e) { mostrarToast?.(e.message, "error"); }
    finally { setCorte(null); setRevision(v => v + 1); setGuardando(false); }
  };
  return <>
    <section className="card">
      <div className="page-title"><h3>Finanzas del socio</h3><div className="segment"><button className="btn" disabled={cargando} onClick={() => setRevision(v => v + 1)}>Actualizar</button><button className="btn" disabled={cargando || Boolean(error)} onClick={() => descargarReporte(socio, cortes, retiros)}>Descargar reporte PDF</button></div></div>
      {cargando ? <p>Cargando cortes y comisiones…</p> : error ? <p role="alert">{error}</p> : <>
        <div className="grid-4 recomendaciones-metricas">{Object.entries(etiquetas).map(([k, label]) => <div className="metric" key={k}><b>{label}</b><span className="metric-value">{dinero(totales[k])}</span></div>)}</div>
        <p className="muted">En curso: falta entrega o cobro. En revisión: faltan costos, fecha de entrega o completar 3 días. Disponible: cumple las condiciones. Los cortes indican el primer período de pago, del 1 al 5 del mes siguiente; los saldos disponibles se conservan.</p>
        <h3>Cortes mensuales</h3>
        <div style={{ overflowX: "auto" }}><table className="recomendaciones-tabla"><thead><tr><th>Período de pago</th><th>Envíos</th><th>En curso</th><th>En revisión</th><th>Disponible</th><th>Pendiente</th><th>Pagado</th><th>Acciones</th></tr></thead><tbody>
          {cortes.map(c => <tr key={c.periodo}><td>{c.periodo === "Por confirmar" ? c.periodo : "1 al 5 de " + c.periodo}</td><td>{c.cantidad}</td>{["curso", "revision", "disponible", "pendiente", "pagado"].map(k => <td key={k}>{dinero(c[k])}</td>)}<td><button className="btn" disabled={c.disponible <= 0 || guardando} onClick={() => setCorte(c)}>Solicitar retiro</button></td></tr>)}
        </tbody></table></div>
        {!cortes.length && <p>No hay recibos posteriores a la vinculación de los clientes de este socio.</p>}
        <details className="mt-16"><summary>Ver comisiones por envío</summary><div style={{ overflowX: "auto" }}><table className="recomendaciones-tabla"><thead><tr><th>Recibo / cliente</th><th>Utilidad</th><th>Comisión</th><th>Estado</th><th>Corte</th></tr></thead><tbody>
          {filas.filter(f => !f.retiro_id).map(f => <tr key={f.envio_id}><td><b>{f.numero_envios}</b><small className="tabla-subtexto">{f.cliente} · entrega {fecha(f.entrega)}</small></td><td>{dinero(f.utilidad)}</td><td>{dinero(f.comision)}</td><td>{etiquetas[f.estado_comision]}</td><td>{f.periodo || "Por confirmar"}</td></tr>)}
        </tbody></table></div></details>
      </>}
    </section>
    <RetirosSocios socioId={socio.id} mostrarToast={mostrarToast} revision={revision} alCambiar={() => setRevision(v => v + 1)} />
    {corte && <div className="modal-overlay"><div className="modal-card" role="dialog" aria-modal="true" style={{ width: "min(600px, 94vw)", maxHeight: "90vh", overflowY: "auto" }}>
      <h2>Solicitar retiro</h2><p>{socio.nombre} · corte {corte.periodo}</p><h3>{dinero(corte.disponible)}</h3>
      <p>Cuenta del socio: {[socio.banco, socio.moneda_cuenta, socio.numero_cuenta].filter(Boolean).join(" · ") || "Sin definir"}</p>
      <div className="list">{disponibles.map(f => <p key={f.envio_id}>{f.numero_envios} · {f.cliente} · {dinero(f.comision)}</p>)}</div>
      <p>Se generará un recibo pendiente de pago. Estas comisiones quedarán reservadas. La solicitud no descuenta dinero del banco.</p>
      <div className="modal-actions"><button className="btn" disabled={guardando} onClick={() => setCorte(null)}>Cancelar</button><button className="btn btn-primary" disabled={guardando || !disponibles.length} onClick={solicitar}>{guardando ? "Creando…" : "Confirmar solicitud"}</button></div>
    </div></div>}
  </>;
}
