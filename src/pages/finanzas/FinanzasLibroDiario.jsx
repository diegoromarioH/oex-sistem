// src/pages/finanzas/FinanzasLibroDiario.jsx
import { useEffect, useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { numero } from "../../utils/numero";
import { listarLibroDiario } from "../../services/ContabilidadService";

const ORIGEN_LABEL = { gastos_operativos: "Gasto", ingresos_operativos: "Ingreso", facturas_proveedor: "Factura proveedor", pagos_proveedor: "Pago a proveedor", apertura: "Apertura", gastos_operativos_reversion: "Reversión de gasto", ingresos_operativos_reversion: "Reversión de ingreso" };

export default function FinanzasLibroDiario() {
  const [asientos, setAsientos] = useState([]); const [cargando, setCargando] = useState(true); const [expandido, setExpandido] = useState(null);
  useEffect(() => { listarLibroDiario().then(setAsientos).catch(() => setAsientos([])).finally(() => setCargando(false)); }, []);
  if (cargando) return <div className="card"><p>Cargando libro diario…</p></div>;

  const filasExport = asientos.flatMap(a => (a.movimientos_contables || []).map(l => ({ Fecha: new Date(a.fecha).toLocaleDateString("es-NI"), Descripción: a.descripcion, Origen: ORIGEN_LABEL[a.origen_modulo] || a.origen_modulo, Usuario: a.created_by_name || "—", Cuenta: l.cuentas_contables ? `${l.cuentas_contables.codigo} · ${l.cuentas_contables.nombre}` : "—", Debe: Number(numero(l.debe).toFixed(2)), Haber: Number(numero(l.haber).toFixed(2)) })));
  const descargarExcel = () => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasExport), "Libro diario"); XLSX.writeFile(wb, `libro-diario-${new Date().toISOString().slice(0,10)}.xlsx`); };
  const descargarPDF = () => { const doc = new jsPDF({ orientation: "landscape" }); doc.setFontSize(16); doc.text("Libro diario", 14, 16); doc.setFontSize(8); let y=26; filasExport.forEach(f=>{ if(y>195){doc.addPage();y=14;} const txt=`${f.Fecha} | ${f.Descripción} | ${f.Cuenta} | Debe $${numero(f.Debe).toFixed(2)} | Haber $${numero(f.Haber).toFixed(2)}`; doc.text(doc.splitTextToSize(txt,260),14,y); y+=8; }); doc.save(`libro-diario-${new Date().toISOString().slice(0,10)}.pdf`); };

  return <div className="card"><div className="card-header"><div><h3>Libro diario</h3><p className="muted">Asientos generados automáticamente por las operaciones del sistema.</p></div></div><div className="segment mt-16"><button className="btn" onClick={descargarExcel}><FileSpreadsheet size={14}/>Excel</button><button className="btn" onClick={descargarPDF}><FileText size={14}/>PDF</button></div>
    {!asientos.length ? <div className="empty-state">No hay asientos contables todavía.</div> : <div className="table-wrap"><table className="table"><thead><tr><th>Fecha</th><th>Descripción</th><th>Origen</th><th>Usuario</th><th>Debe</th><th>Haber</th></tr></thead><tbody>{asientos.map(a=>{const lineas=a.movimientos_contables||[];const debe=lineas.reduce((s,l)=>s+numero(l.debe),0);const haber=lineas.reduce((s,l)=>s+numero(l.haber),0);const abierto=expandido===a.id;return [<tr key={a.id} onClick={()=>setExpandido(abierto?null:a.id)} style={{cursor:"pointer"}}><td>{new Date(a.fecha).toLocaleDateString("es-NI")}</td><td>{a.descripcion}</td><td><span className="badge badge-neutral">{ORIGEN_LABEL[a.origen_modulo]||a.origen_modulo}</span></td><td>{a.created_by_name||"—"}</td><td>${debe.toFixed(2)}</td><td>${haber.toFixed(2)}</td></tr>, abierto&&<tr key={`${a.id}-detalle`}><td colSpan="6" style={{padding:"0 16px 16px"}}><div className="table-wrap" style={{marginTop:8}}><table className="table"><thead><tr><th>Cuenta</th><th>Debe</th><th>Haber</th></tr></thead><tbody>{lineas.map((l,i)=><tr key={i}><td>{l.cuentas_contables?`${l.cuentas_contables.codigo} · ${l.cuentas_contables.nombre}`:"—"}</td><td>${numero(l.debe).toFixed(2)}</td><td>${numero(l.haber).toFixed(2)}</td></tr>)}</tbody></table></div></td></tr>];})}</tbody></table></div>}
  </div>;
}
