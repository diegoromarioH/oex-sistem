// src/pages/finanzas/FinanzasEstadoResultados.jsx
import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { numero } from "../../utils/numero";
import { calcularEstadoResultados } from "../../services/estadoResultadosService";

const mesActualISO = () => new Date().toISOString().slice(0, 7);
const rangoDelMes = (mesISO) => { const [anio, mes] = mesISO.split("-").map(Number); return { desde: new Date(anio, mes - 1, 1, 0, 0, 0).toISOString(), hasta: new Date(anio, mes, 0, 23, 59, 59).toISOString() }; };
const mesAnteriorISO = (mesISO) => { const [anio, mes] = mesISO.split("-").map(Number); const d = new Date(anio, mes - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const nombreMes = (mesISO) => { const [anio, mes] = mesISO.split("-").map(Number); const txt = new Date(anio, mes - 1, 1).toLocaleDateString("es-NI", { year: "numeric", month: "long" }); return txt.charAt(0).toUpperCase() + txt.slice(1); };

const Delta = ({ actual, anterior, invertirColor = false }) => { const diferencia = actual - anterior; if (Math.abs(diferencia) < 0.005 && anterior === 0) return null; const pct = anterior !== 0 ? (diferencia / Math.abs(anterior)) * 100 : null; const positivo = invertirColor ? diferencia <= 0 : diferencia >= 0; return <small style={{ color: positivo ? "var(--success)" : "var(--danger)" }}>{diferencia >= 0 ? "▲" : "▼"} ${Math.abs(diferencia).toFixed(2)}{pct !== null ? ` (${Math.abs(pct).toFixed(0)}%)` : ""} vs. mes anterior</small>; };
const FilaCuenta = ({ cuenta, montoAnterior }) => <div className="row-card"><div><b>{cuenta.codigo} · {cuenta.nombre}</b></div><div className="stack-gap-sm text-right"><b>${cuenta.monto.toFixed(2)}</b><small style={{ opacity: 0.6 }}>Mes anterior: ${numero(montoAnterior).toFixed(2)}</small></div></div>;
const SeccionDesglose = ({ titulo, cuentas, cuentasAnteriorPorId, colorTotal }) => { const [abierto, setAbierto] = useState(false); const total = cuentas.reduce((a, c) => a + c.monto, 0); return <div className="card"><button type="button" className="row-card" style={{ width: "100%", cursor: "pointer", background: "none", border: "none" }} onClick={() => setAbierto(v => !v)}><div><b>{titulo}</b></div><div className="stack-gap-sm text-right"><b style={{ color: colorTotal }}>${total.toFixed(2)}</b><small>{abierto ? "Ocultar detalle ▲" : `Ver ${cuentas.length} cuenta(s) ▼`}</small></div></button>{abierto && <div className="list mt-16">{cuentas.map(c => <FilaCuenta key={c.id} cuenta={c} montoAnterior={cuentasAnteriorPorId.get(c.id) || 0} />)}{cuentas.length === 0 && <p>Sin movimientos en este período.</p>}</div>}</div>; };

export default function FinanzasEstadoResultados() {
  const [mes, setMes] = useState(mesActualISO()); const [datosActual, setDatosActual] = useState(null); const [datosAnterior, setDatosAnterior] = useState(null); const [cargando, setCargando] = useState(true);
  useEffect(() => { setCargando(true); const cargar = async () => { const [actual, anterior] = await Promise.all([calcularEstadoResultados(rangoDelMes(mes)), calcularEstadoResultados(rangoDelMes(mesAnteriorISO(mes)))]); setDatosActual(actual); setDatosAnterior(anterior); setCargando(false); }; cargar().catch(() => setCargando(false)); }, [mes]);
  const cuentasAnteriorPorId = useMemo(() => { const mapa = new Map(); (datosAnterior?.porCuenta || []).forEach(c => mapa.set(c.id, c.monto)); return mapa; }, [datosAnterior]);
  if (cargando || !datosActual || !datosAnterior) return <p className="mt-16">Cargando...</p>;
  const porTipo = tipo => datosActual.porCuenta.filter(c => c.tipo === tipo);
  const filasExport = [
    { Concepto: "Ingresos", Monto: Number(datosActual.ingresos.toFixed(2)) },
    { Concepto: "Costos", Monto: Number(datosActual.costos.toFixed(2)) },
    { Concepto: "Gastos", Monto: Number(datosActual.gastos.toFixed(2)) },
    { Concepto: "Utilidad neta", Monto: Number(datosActual.utilidad.toFixed(2)) },
    ...datosActual.porCuenta.map(c => ({ Concepto: `${c.codigo} · ${c.nombre}`, Tipo: c.tipo, Monto: Number(c.monto.toFixed(2)) }))
  ];
  const descargarExcel = () => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasExport), "Estado resultados"); XLSX.writeFile(wb, `estado-resultados-${mes}.xlsx`); };
  const descargarPDF = () => { const doc = new jsPDF(); doc.setFontSize(16); doc.text(`Estado de resultados · ${nombreMes(mes)}`, 14, 18); doc.setFontSize(10); let y = 30; filasExport.forEach(f => { if (y > 280) { doc.addPage(); y = 18; } doc.text(`${f.Concepto}: $${numero(f.Monto).toFixed(2)}`, 14, y); y += 6; }); doc.save(`estado-resultados-${mes}.pdf`); };

  return <div>
    <div className="segment mt-8"><label className="stack-gap-sm" style={{ display: "flex", alignItems: "center", gap: 8, flexDirection: "row" }}><span className="field-label" style={{ margin: 0 }}>Mes:</span><input className="input input-sm" type="month" value={mes} onChange={e => setMes(e.target.value)} max={mesActualISO()} /></label><button className="btn" onClick={descargarExcel}><FileSpreadsheet size={14}/>Excel</button><button className="btn" onClick={descargarPDF}><FileText size={14}/>PDF</button></div>
    <div className="info-box mt-8">Comparando <b>{nombreMes(mes)}</b> contra <b>{nombreMes(mesAnteriorISO(mes))}</b>. Todo sale directo del libro diario.</div>
    <div className="grid-4 mt-16"><div className="metric"><b>Ingresos</b><span className="metric-value" style={{ color: "var(--success)" }}>${datosActual.ingresos.toFixed(2)}</span><Delta actual={datosActual.ingresos} anterior={datosAnterior.ingresos} /></div><div className="metric"><b>Costos</b><span className="metric-value">${datosActual.costos.toFixed(2)}</span><Delta actual={datosActual.costos} anterior={datosAnterior.costos} invertirColor /></div><div className="metric"><b>Gastos</b><span className="metric-value">${datosActual.gastos.toFixed(2)}</span><Delta actual={datosActual.gastos} anterior={datosAnterior.gastos} invertirColor /></div><div className="metric"><b>Utilidad neta</b><span className="metric-value" style={{ color: datosActual.utilidad >= 0 ? "var(--success)" : "var(--danger)" }}>${datosActual.utilidad.toFixed(2)}</span><Delta actual={datosActual.utilidad} anterior={datosAnterior.utilidad} /></div></div>
    <SeccionDesglose titulo="Ingresos" cuentas={porTipo("ingreso")} cuentasAnteriorPorId={cuentasAnteriorPorId} colorTotal="var(--success)" /><SeccionDesglose titulo="Costos" cuentas={porTipo("costo")} cuentasAnteriorPorId={cuentasAnteriorPorId} colorTotal="inherit" /><SeccionDesglose titulo="Gastos" cuentas={porTipo("gasto")} cuentasAnteriorPorId={cuentasAnteriorPorId} colorTotal="inherit" />
  </div>;
}
