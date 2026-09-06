import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, FileText, BookOpen, BarChart3, Scale } from "lucide-react";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { supabase } from "../../supabase";
import { numero } from "../../utils/numero";
import FinanzasEstadoResultados from "./FinanzasEstadoResultados";
import FinanzasLibroDiario from "./FinanzasLibroDiario";

const hoyISO = () => new Date().toISOString().slice(0, 10);
const nombreArchivo = (base, ext) => `${base}-${hoyISO()}.${ext}`;
const descargarExcel = (nombre, filas, hoja = "Reporte") => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), hoja); XLSX.writeFile(wb, nombreArchivo(nombre, "xlsx")); };
const descargarPDF = (titulo, filas, nombre) => { const doc = new jsPDF(); doc.setFontSize(16); doc.text(titulo, 14, 18); doc.setFontSize(9); let y = 28; filas.forEach(fila => { const linea = Object.entries(fila).map(([k,v])=>`${k}: ${v}`).join("  |  "); const lineas=doc.splitTextToSize(linea,180); if(y+lineas.length*5>285){doc.addPage();y=18;} doc.text(lineas,14,y); y+=lineas.length*5+2; }); doc.save(nombreArchivo(nombre,"pdf")); };
const normalizarTipo = (tipo="") => { const t=String(tipo).toLowerCase(); if(t.includes("activo")) return "activo"; if(t.includes("pasivo")) return "pasivo"; if(t.includes("patrimonio")||t.includes("capital")) return "patrimonio"; if(t.includes("ingreso")) return "ingreso"; if(t.includes("costo")) return "costo"; if(t.includes("gasto")) return "gasto"; return null; };

function BalanceGeneral({ cuentasContables=[], mostrarToast }) {
 const [movimientos,setMovimientos]=useState([]),[cargando,setCargando]=useState(true);
 useEffect(()=>{let activo=true;setCargando(true);supabase.from("movimientos_contables").select("debe, haber, cuentas_contables(id,codigo,nombre,tipo)").then(({data,error})=>{if(!activo)return;if(error)throw error;setMovimientos(data||[]);}).catch(()=>activo&&setMovimientos([])).finally(()=>activo&&setCargando(false));return()=>{activo=false;};},[]);
 const cuentas=useMemo(()=>{const mapa=new Map();movimientos.forEach(m=>{const c=m.cuentas_contables;if(!c)return;const tipo=normalizarTipo(c.tipo)||normalizarTipo(cuentasContables.find(x=>x.id===c.id)?.tipo);if(!tipo)return;if(!mapa.has(c.id))mapa.set(c.id,{codigo:c.codigo,nombre:c.nombre,tipo,debe:0,haber:0});const x=mapa.get(c.id);x.debe+=numero(m.debe);x.haber+=numero(m.haber);});return[...mapa.values()].map(x=>({...x,saldo:["activo","costo","gasto"].includes(x.tipo)?x.debe-x.haber:x.haber-x.debe})).filter(x=>Math.abs(x.saldo)>.005).sort((a,b)=>String(a.codigo).localeCompare(String(b.codigo)));},[movimientos,cuentasContables]);
 const porTipo=tipo=>cuentas.filter(x=>x.tipo===tipo), total=tipo=>porTipo(tipo).reduce((a,x)=>a+x.saldo,0);
 const utilidadAcumulada=total("ingreso")-total("costo")-total("gasto");
 const activos=total("activo"),pasivos=total("pasivo"),patrimonioBase=total("patrimonio"),patrimonio=patrimonioBase+utilidadAcumulada,diferencia=activos-pasivos-patrimonio;
 const filasBalance=[...porTipo("activo"),...porTipo("pasivo"),...porTipo("patrimonio"),{tipo:"patrimonio",codigo:"—",nombre:"Resultado acumulado",saldo:utilidadAcumulada}];
 const exportRows=filasBalance.map(x=>({Tipo:x.tipo,Código:x.codigo,Cuenta:x.nombre,Saldo:Number(x.saldo.toFixed(2))}));
 if(cargando)return <div className="card"><p>Cargando balance general…</p></div>;
 const renderTipo=(tipo,extra=[])=>{const filas=[...porTipo(tipo),...extra];return <div className="card"><h3 style={{textTransform:"capitalize"}}>{tipo}</h3><div className="list mt-16">{filas.map((x,i)=><div className="row-card" key={`${x.codigo}-${i}`}><div><b>{x.codigo} · {x.nombre}</b></div><b>${x.saldo.toFixed(2)}</b></div>)}{filas.length===0&&<p>Sin saldos en esta sección.</p>}</div></div>;};
 return <div><div className="segment"><button className="btn" onClick={()=>{descargarExcel("balance-general",exportRows,"Balance general");mostrarToast?.("Balance general descargado en Excel.");}}><FileSpreadsheet size={14}/>Excel</button><button className="btn" onClick={()=>{descargarPDF("Balance general",exportRows,"balance-general");mostrarToast?.("Balance general descargado en PDF.");}}><FileText size={14}/>PDF</button></div><div className="grid-4"><div className="metric"><b>Activos</b><span className="metric-value">${activos.toFixed(2)}</span></div><div className="metric"><b>Pasivos</b><span className="metric-value">${pasivos.toFixed(2)}</span></div><div className="metric"><b>Patrimonio + resultado</b><span className="metric-value">${patrimonio.toFixed(2)}</span></div><div className="metric"><b>Diferencia</b><span className="metric-value" style={{color:Math.abs(diferencia)<.01?"var(--success)":"var(--danger)"}}>${diferencia.toFixed(2)}</span></div></div>{renderTipo("activo")}{renderTipo("pasivo")}{renderTipo("patrimonio",[{codigo:"—",nombre:"Resultado acumulado",saldo:utilidadAcumulada}])}</div>;
}

export default function FinanzasReportes({ cuentasContables=[], mostrarToast }) {
 const [reporte,setReporte]=useState("resultados");
 return <div><div className="card"><div className="page-title" style={{margin:0}}><div><h3>Reportes financieros</h3><p>Estado de resultados, Libro diario y Balance general en un solo lugar.</p></div></div><div className="segment mt-16"><button className={`segment-btn ${reporte==="resultados"?"active":""}`} onClick={()=>setReporte("resultados")}><BarChart3 size={14}/> Estado de resultados</button><button className={`segment-btn ${reporte==="libro"?"active":""}`} onClick={()=>setReporte("libro")}><BookOpen size={14}/> Libro diario</button><button className={`segment-btn ${reporte==="balance"?"active":""}`} onClick={()=>setReporte("balance")}><Scale size={14}/> Balance general</button></div></div>{reporte==="resultados"&&<FinanzasEstadoResultados/>}{reporte==="libro"&&<FinanzasLibroDiario/>}{reporte==="balance"&&<BalanceGeneral cuentasContables={cuentasContables} mostrarToast={mostrarToast}/>}</div>;
}
