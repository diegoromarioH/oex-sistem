import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, PackageSearch, CheckCircle2, AlertTriangle, History } from "lucide-react";
import { asignarRecepcionGlobal, importarLecturaGlobalConnection, listarRecepcionesGlobal, listarRunsGlobal, sincronizarGlobalConnection } from "../../services/globalConnectionService";
import { conexionGlobalEntrante, lectorGlobal, recibirLecturaGlobal } from "../../utils/globalConnectionBrowser";
import "../../styles/GlobalConnection.css";

export default function GlobalConnection({clientes=[],auth,mostrarToast,cargarDatos}){
 const [recepciones,setRecepciones]=useState([]),[runs,setRuns]=useState([]),[cargando,setCargando]=useState(true),[sync,setSync]=useState(false),[asignando,setAsignando]=useState(null);
 const [form,setForm]=useState({});
 const [progreso,setProgreso]=useState(null);
 const [lectura,setLectura]=useState("");
 const [importando,setImportando]=useState(false);
 const [copiado,setCopiado]=useState(false);
 const [ultimoResultado,setUltimoResultado]=useState(null);
 const [ultimaImportacion,setUltimaImportacion]=useState(()=>localStorage.getItem("oex_global_ultima_importacion")||"");
 const [lecturaDirecta, setLecturaDirecta] = useState(null);
 const [esperandoLectura, setEsperandoLectura] = useState(() => Boolean(conexionGlobalEntrante()));
 const importandoRef = useRef(false);
 useEffect(() => {
   if (!conexionGlobalEntrante()) return;
   return recibirLecturaGlobal((items) => {
     setLecturaDirecta(items);
     setEsperandoLectura(false);
   });
 }, []);

 const copiarLector=async()=>{try{await navigator.clipboard.writeText(lectorGlobal());localStorage.setItem("oex_global_lector_version","2026-09-27-ref-v2");setCopiado(true);mostrarToast?.("Lector copiado. Ahora créalo como marcador en Chrome.","success");setTimeout(()=>setCopiado(false),2500)}catch{mostrarToast?.("Chrome no permitió copiar el lector.","error")}};
 const importarLectura = async (itemsDirectos) => {
   if (importandoRef.current) return;
   importandoRef.current = true;
   setImportando(true);
   try {
     const raw = lectura.trim();
     if (!itemsDirectos && (/^javascript:/i.test(raw) || raw.includes("OEX Sync"))) {
       throw new Error("Pegaste el lector. Ejecuta el marcador OEX Sync en Global Connection y luego pega la lectura.");
     }
     const items = itemsDirectos || JSON.parse(raw);
     const resultado = await importarLecturaGlobalConnection(items, auth);
     setUltimoResultado(resultado);
     const importadoEn = new Date().toISOString();
     setUltimaImportacion(importadoEn);
     localStorage.setItem("oex_global_ultima_importacion", importadoEn);
     const cambios = (resultado.detalle || []).filter((d) => String(d.accion || "").includes("_a_"));
     mostrarToast?.(cambios.length
       ? `Importación lista: ${cambios.length} cambiaron de estado. Revisa el detalle abajo.`
       : `Lectura importada: sin cambios de estado · ${resultado.nuevos} nuevos`, "success");
     if (itemsDirectos) setLecturaDirecta(null);
     else setLectura("");
     await Promise.all([cargar(), cargarDatos?.()]);
   } catch (error) {
     mostrarToast?.(error.message || "Lectura inválida.", "error");
   } finally {
     importandoRef.current = false;
     setImportando(false);
   }
 };

 const cargar=async()=>{setCargando(true);try{const [r,h]=await Promise.all([listarRecepcionesGlobal(),listarRunsGlobal()]);setRecepciones(r);setRuns(h)}catch(e){mostrarToast?.(e.message,"error")}finally{setCargando(false)}};
 useEffect(()=>{cargar()},[]);
 const pendientes=useMemo(()=>recepciones.filter(x=>x.estado==="sin_asignar"),[recepciones]);
 const sincronizar=async()=>{setSync(true);setProgreso({procesados:0,total:0,lote:0});try{const r=await sincronizarGlobalConnection({onProgress:setProgreso});mostrarToast?.(`Global Connect: ${r.prealertasConfirmadas} prealertas confirmadas · ${r.sinAsignarNuevos} nuevos sin asignar`,"success");await Promise.all([cargar(),cargarDatos?.()])}catch(e){mostrarToast?.(e.message,"error")}finally{setSync(false);setProgreso(null)}};
 const asignar=async(r)=>{const instr=String(r?.detalle?.instrucciones_global||"").replace(/A[�\?]REO/gi,"AÉREO").replace(/MAR[�\?]TIMO/gi,"MARÍTIMO").trim().toUpperCase();const baseTipo=/(AIR|AÉREO|AEREO)/.test(instr)?"Aéreo":/(SEA|OCEAN|MARÍTIMO|MARITIMO)/.test(instr)?"Marítimo":"";const f=form[r.id]||{};const cliente=clientes.find(c=>String(c.id)===String(f.clienteId));setAsignando(r.id);try{await asignarRecepcionGlobal({recepcion:r,cliente,destino:f.destino,tipoEnvio:f.tipoEnvio||baseTipo,auth});mostrarToast?.("Paquete asignado y enviado a Envíos activos.","success");await Promise.all([cargar(),cargarDatos?.()])}catch(e){mostrarToast?.(e.message,"error")}finally{setAsignando(null)}};
 const last=runs[0];
 return <div className="gc-page">
  <section className="gc-hero"><div><span className="gc-eyebrow">Recepción Miami</span><h2>Global Connection</h2><p>Confirma prealertas recibidas y organiza paquetes que todavía no tienen cliente asignado.</p></div></section>
  {last&&<section className="gc-summary"><div><CheckCircle2 size={18}/><span>Última sincronización</span></div><strong>{last.total_detectados} detectados</strong><span>{last.prealertas_confirmadas} prealertas confirmadas</span><span>{last.sin_asignar_nuevos} nuevos sin asignar</span><span>{last.actualizados_sin_regresion} sin retroceder estado</span>{last.errores>0&&<span className="gc-warning">{last.errores} errores</span>}</section>}
  <div className="gc-kpis"><div><PackageSearch/><span>Por asignar</span><strong>{pendientes.length}</strong></div><div><CheckCircle2/><span>Coincidencias</span><strong>{recepciones.filter(x=>x.estado==="coincidencia").length}</strong></div><div><History/><span>Asignados manualmente</span><strong>{recepciones.filter(x=>x.estado==="asignado").length}</strong></div></div>
  <section className="gc-panel">
    <h3>Enviar paquetes desde Global Connection</h3>
    {ultimaImportacion && <p>Última importación: {new Date(ultimaImportacion).toLocaleString()}</p>}
    <p>Arrastra el marcador a la barra de favoritos de Chrome una sola vez. Después, abre Almacén en Global Connection y pulsa el marcador.</p>
    <a
      className="btn btn-secondary"
      draggable
      ref={(link) => link?.setAttribute("href", lectorGlobal(window.location.origin))}
      onClick={(event) => event.preventDefault()}
    >Enviar a OEX</a>
    {esperandoLectura && <p role="status">Esperando los paquetes de Global Connection…</p>}
    {lecturaDirecta && (
      <div className="gc-history mt-8">
        <h4>Vista previa · {lecturaDirecta.length} paquetes</h4>
        {lecturaDirecta.map((item) => (
          <div className="gc-detail" key={item.almacen_id}>
            <code>{item.tracking}</code>
            <span>Almacén {item.almacen_id} · Miami: {item.fecha_miami || "Sin fecha"} · {item.instrucciones_global || "Sin instrucciones"}</span>
          </div>
        ))}
        <div className="gc-assign">
          <button type="button" className="btn btn-primary" disabled={importando} onClick={() => importarLectura(lecturaDirecta)}>
            {importando ? "Importando…" : "Importar paquetes"}
          </button>
          <button type="button" className="btn btn-ghost" disabled={importando} onClick={() => setLecturaDirecta(null)}>Descartar</button>
        </div>
      </div>
    )}
    <details className="mt-8">
      <summary>Importar manualmente</summary>
      <p>Copia el lector y guárdalo como marcador OEX Sync. Ejecútalo en Almacén y pega aquí el resultado.</p>
      <div className="gc-assign">
        <button className="btn btn-secondary" type="button" onClick={copiarLector}>{copiado ? "✓ Lector copiado" : "Copiar lector OEX"}</button>
        <textarea value={lectura} onChange={(event) => setLectura(event.target.value)} placeholder="Pega aquí la lectura de OEX Sync…" rows={3} />
        <button className="btn btn-primary" type="button" onClick={() => importarLectura()} disabled={!lectura.trim() || importando}>Importar lectura</button>
      </div>
    </details>
  </section>
  {ultimoResultado&&<section className="gc-panel"><div className="gc-panel-head"><div><h3>Resultado de la última importación</h3><p>{ultimoResultado.total} leídos · {ultimoResultado.nuevos} nuevos · {ultimoResultado.actualizados||0} avanzaron · {ultimoResultado.sinCambios||0} sin cambios · {ultimoResultado.finalizados||0} finalizados · {ultimoResultado.errores} errores</p></div></div><div className="gc-history">{(ultimoResultado.detalle||[]).filter(d=>String(d.accion||"").includes("_a_")).length>0&&<div className="gc-state-changes"><b>Cambios de estado realizados</b>{(ultimoResultado.detalle||[]).filter(d=>String(d.accion||"").includes("_a_")).map((d,i)=><div className="gc-detail" key={`cambio-${i}`}><code>{d.tracking||"—"}</code><span>{d.anterior||"—"} → {d.final||"—"} · Almacén {d.almacenId||"—"}</span></div>)}</div>}{(ultimoResultado.detalle||[]).map((d,i)=><div className="gc-detail" key={i}><code>{d.tracking||"—"}</code><span>Almacén {d.almacenId||"—"}{d.cliente?` · Cliente: ${d.cliente}`:""} · Global: {d.statusGlobal||"Sin estado"} · OEX: {d.anterior?d.anterior+" → ":""}{d.final||"—"}{d.error?` · Error: ${d.error}`:""}</span></div>)}</div></section>}
  <section className="gc-panel"><div className="gc-panel-head"><div><h3>Paquetes sin asignar</h3><p>Recibidos en Miami que no estaban registrados en OEX.</p></div></div>
   {cargando?<p>Cargando recepciones…</p>:pendientes.length===0?<div className="gc-empty"><CheckCircle2 size={26}/><b>Todo está asignado</b><span>No hay paquetes pendientes de cliente.</span></div>:<div className="gc-list">{pendientes.map(r=>{const f=form[r.id]||{};const ref=r.detalle?.referencia_global||r.nombre_global||"";const instrRaw=String(r.detalle?.instrucciones_global||"").trim();const instr=instrRaw.replace(/A[�\?]REO/gi,"AÉREO").replace(/MAR[�\?]TIMO/gi,"MARÍTIMO").toUpperCase();const tipoDetectado=/(AIR|AÉREO|AEREO)/.test(instr)?"Aéreo":/(SEA|OCEAN|MARÍTIMO|MARITIMO)/.test(instr)?"Marítimo":"";return <article className="gc-card" key={r.id}><div className="gc-card-main"><div><small>TRACKING</small><b>{r.tracking}</b></div><div><small>ID ALMACÉN</small><b>{r.almacen_id}</b></div><div><small>NOMBRE / REFERENCIA</small><b>{ref||"Sin nombre"}</b>{tipoDetectado&&<span>{tipoDetectado}</span>}</div><div><small>RECIBIDO MIAMI</small><b>{r.fecha_miami?new Date(r.fecha_miami).toLocaleDateString():"—"}</b></div></div><div className="gc-assign"><select value={f.clienteId||""} onChange={e=>setForm(x=>({...x,[r.id]:{...f,clienteId:e.target.value}}))}><option value="">Asignar cliente…</option>{clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select><select value={f.destino||""} onChange={e=>setForm(x=>({...x,[r.id]:{...f,destino:e.target.value}}))}><option value="">Destino…</option><option>Managua</option><option>Ometepe</option></select><select value={f.tipoEnvio||tipoDetectado||""} onChange={e=>setForm(x=>({...x,[r.id]:{...f,tipoEnvio:e.target.value}}))}><option value="">Tipo…</option><option>Aéreo</option><option>Marítimo</option></select><button className="btn btn-primary" disabled={asignando===r.id} onClick={()=>asignar(r)}>{asignando===r.id?"Asignando…":"Asignar y activar"}</button></div></article>})}</div>}
  </section>
  <section className="gc-panel"><div className="gc-panel-head"><div><h3>Historial de sincronización</h3><p>Resumen de lo que OEX hizo en Global Connect.</p></div></div><div className="gc-history">{runs.map(r=><details key={r.id}><summary><span>{new Date(r.creado_en).toLocaleString()}</span><b>{r.total_detectados} detectados · {r.prealertas_confirmadas} confirmados · {r.sin_asignar_nuevos} nuevos</b></summary><div className="gc-detail">{(r.detalle||[]).map((d,i)=><div key={i}><code>{d.tracking||d.almacenId||"—"}</code><span>{String(d.accion||"").replaceAll("_"," ")}</span></div>)}</div></details>)}</div>
  </section>
 </div>
}
