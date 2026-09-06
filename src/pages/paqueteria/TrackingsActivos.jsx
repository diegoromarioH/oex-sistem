// src/pages/paqueteria/TrackingsActivos.jsx
import { useMemo, useState } from "react";
import { Layers, CheckCircle2, XCircle, HelpCircle, Package, Weight, Clock3, ReceiptText } from "lucide-react";
import { actualizarTracking, eliminarTracking } from "../../services/trackingsService";
import { estadosPorDestino, badgeEstado, esListoParaRetirar, esPendienteDeConfirmar, esListoParaRetiroProveedor } from "../../utils/estadosEnvio";
import { limpiarTelefono } from "../../utils/clientes";
import { numero } from "../../utils/numero";
import { parseListaPesos, emparejarConTrackings } from "../../utils/parseListaPesos";
import { calcularDeadlineTracking, formatoRangoDeadline, textoPromesa } from "../../utils/deadlinesEntrega";
import { useFeriadosNicaragua } from "../../hooks/useFeriadosNicaragua";
import PipelineProgress from "../../components/PipelineProgress";
import ModalRegistrarPeso from "../../components/ModalRegistrarPeso";

const vincularCliente = (tracking, clientes = []) => {
  const porId = tracking.clienteId ? clientes.find((c) => c.id === tracking.clienteId) : null;
  if (porId) return { cliente: porId, motivo: "ID" };
  const codigo = String(tracking.clienteCodigo || "").trim().toUpperCase();
  if (codigo) {
    const porCodigo = clientes.find((c) => String(c.codigo || "").trim().toUpperCase() === codigo);
    if (porCodigo) return { cliente: porCodigo, motivo: "código" };
  }
  const telefono = limpiarTelefono(tracking.contacto);
  if (telefono) {
    const porTelefono = clientes.find((c) => limpiarTelefono(c.telefono) === telefono);
    if (porTelefono) return { cliente: porTelefono, motivo: "WhatsApp" };
  }
  return { cliente: null, motivo: null };
};

export default function TrackingsActivos({ prealertas, envios = [], clientes = [], proveedores = [], facturasProveedor = [], auditLog = [], rol, auth, mostrarToast, cargarDatos }) {
  const feriados = useFeriadosNicaragua();
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const [filtroTipo, setFiltroTipo] = useState("Todos");
  const [filtroDestino, setFiltroDestino] = useState("Todos");
  const [pendientePeso, setPendientePeso] = useState(null);
  const [guardandoPeso, setGuardandoPeso] = useState(false);

  const estadosDisponibles = useMemo(() => {
    const estados = prealertas
      .filter((t) => !esPendienteDeConfirmar(t) && t.estado !== "Entregado")
      .map((t) => t.estado)
      .filter(Boolean);
    return [...new Set(estados)].sort((a, b) => a.localeCompare(b, "es"));
  }, [prealertas]);

  const activos = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return prealertas
      .filter((t) => !esPendienteDeConfirmar(t) && t.estado !== "Entregado")
      .map((t) => ({
        ...t,
        vinculacion: vincularCliente(t, clientes),
        proveedorAduana: proveedores.find((p) => String(p.id) === String(t.proveedorAduanaId)) || null,
        recibo: t.envioId ? envios.find((e) => String(e.id) === String(t.envioId)) || null : null,
        deadline: calcularDeadlineTracking(t, feriados)
      }))
      .filter((t) => filtroEstado === "Todos" || t.estado === filtroEstado)
      .filter((t) => filtroTipo === "Todos" || t.tipoEnvio === filtroTipo)
      .filter((t) => filtroDestino === "Todos" || t.destino === filtroDestino)
      .filter((t) => {
        const c = t.vinculacion.cliente;
        return !q ||
          (t.cliente||"").toLowerCase().includes(q) ||
          (t.clienteCodigo||"").toLowerCase().includes(q) ||
          (t.tracking||"").toLowerCase().includes(q) ||
          (t.almacenId||"").toLowerCase().includes(q) ||
          (t.proveedorAduana?.nombre||"").toLowerCase().includes(q) ||
          (t.recibo?.numero||"").toLowerCase().includes(q) ||
          (c?.nombre||"").toLowerCase().includes(q) ||
          (c?.codigo||"").toLowerCase().includes(q) ||
          (c?.telefono||"").toLowerCase().includes(q);
      });
  }, [prealertas, envios, clientes, proveedores, feriados, busqueda, filtroEstado, filtroTipo, filtroDestino]);

  const actualizarCampo = async (t, campo, valor) => {
    try {
      await actualizarTracking({ tracking:t, field:campo, value:valor, auth });
      await cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo actualizar.", "error");
    }
  };

  const aplicarCambioEstado = async (t, nuevoEstado) => {
    if (t.envioId) {
      mostrarToast(`Este tracking pertenece al recibo ${t.recibo?.numero || t.envioId}. Cambia el estado desde Recibos para mover todos sus paquetes juntos.`, "warning");
      return;
    }
    if (nuevoEstado === "Miami" && !String(t.almacenId || "").trim()) {
      mostrarToast("Registra primero el ID de almacén para marcarlo como Recibido en Miami.", "warning");
      return;
    }
    if (esListoParaRetirar(nuevoEstado) && numero(t.peso) <= 0) {
      mostrarToast("Este tracking no tiene peso registrado. Ponle el peso antes de marcarlo como listo para retirar.", "warning");
      return;
    }
    const pipeline = estadosPorDestino(t.destino);
    const idxActual = pipeline.indexOf(t.estado);
    const idxNuevo = pipeline.indexOf(nuevoEstado);
    if (esListoParaRetiroProveedor(t.estado) && idxNuevo > idxActual) {
      const pagado = facturasProveedor.some((f) => f.estado === "Pagada" && (f.trackings || []).some((tk) => tk.id === t.id));
      if (!pagado) {
        mostrarToast("Este tracking está en Bodega OEX y su factura al proveedor todavía no está pagada. Págala en Finanzas → Proveedores antes de avanzarlo.", "warning");
        return;
      }
    }
    if (idxActual !== -1 && idxNuevo !== -1 && idxNuevo < idxActual) {
      if (!window.confirm(`Vas a RETROCEDER el estado de "${t.estado}" a "${nuevoEstado}".\n\n¿Seguro que quieres hacer esto?`)) return;
    }
    await actualizarCampo(t, "estado", nuevoEstado);
  };

  const cambiarEstado = async (t, nuevoEstado) => {
    if (nuevoEstado === "Bodega OEX" && numero(t.peso) <= 0) {
      setPendientePeso({ tracking:t, nuevoEstado });
      return;
    }
    await aplicarCambioEstado(t, nuevoEstado);
  };

  const confirmarPesoYContinuar = async (pesoTexto) => {
    if (!pendientePeso) return;
    setGuardandoPeso(true);
    try {
      const { tracking:t, nuevoEstado } = pendientePeso;
      await actualizarTracking({ tracking:t, field:"peso", value:pesoTexto, auth });
      await aplicarCambioEstado({ ...t, peso:numero(pesoTexto) }, nuevoEstado);
      setPendientePeso(null);
      await cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo guardar el peso.", "error");
    } finally {
      setGuardandoPeso(false);
    }
  };

  const [loteAbierto,setLoteAbierto]=useState(false);
  const [textoLote,setTextoLote]=useState("");
  const [resultadoLote,setResultadoLote]=useState(null);
  const [seleccionLote,setSeleccionLote]=useState(()=>new Set());
  const [aplicandoLote,setAplicandoLote]=useState(false);

  const analizarLote=()=>{
    const {reconocidas,noReconocidas}=parseListaPesos(textoLote);
    const elegibles = activos.filter((t) => !t.envioId);
    const emparejadas=emparejarConTrackings(reconocidas,elegibles);
    setResultadoLote({emparejadas,noReconocidas});
    setSeleccionLote(new Set(emparejadas.filter(e=>e.tracking).map(e=>e.tracking.id)));
  };
  const limpiarLote=()=>{setTextoLote("");setResultadoLote(null);setSeleccionLote(new Set());};
  const toggleSeleccionLote=(trackingId)=>setSeleccionLote(prev=>{const nuevo=new Set(prev);if(nuevo.has(trackingId))nuevo.delete(trackingId);else nuevo.add(trackingId);return nuevo;});
  const aplicarLote=async()=>{
    if(!resultadoLote)return;
    const porAplicar=resultadoLote.emparejadas.filter(e=>e.tracking&&seleccionLote.has(e.tracking.id));
    if(!porAplicar.length)return mostrarToast("No hay nada seleccionado para aplicar.","warning");
    setAplicandoLote(true);
    let exitosos=0;
    try{
      for(const item of porAplicar){
        try{
          await actualizarTracking({tracking:item.tracking,field:"peso",value:String(item.peso),auth});
          await aplicarCambioEstado({...item.tracking,peso:item.peso},"Bodega OEX");
          exitosos++;
        }catch(err){console.log(`No se pudo aplicar ${item.identificador}:`,err);}
      }
      mostrarToast(`${exitosos} de ${porAplicar.length} tracking(s) actualizados a Bodega OEX.`);
      limpiarLote();
      setLoteAbierto(false);
      await cargarDatos();
    }finally{setAplicandoLote(false);}
  };

  const manejarBlurPeso=(t,e)=>{
    if (t.envioId) return;
    const textoNuevo=e.target.value,nuevo=numero(textoNuevo),anterior=numero(t.peso);
    if(nuevo===anterior)return;
    if(anterior>0&&!window.confirm(`Este tracking ya tenía un peso guardado: ${anterior} lb.\n\n¿Seguro que quieres cambiarlo a ${nuevo} lb?`)){
      e.target.value=String(anterior);return;
    }
    actualizarCampo(t,"peso",textoNuevo);
  };

  const eliminar=async(t)=>{
    if(t.envioId)return mostrarToast(`Este tracking pertenece al recibo ${t.recibo?.numero || t.envioId}.`,"warning");
    if(rol!=="admin")return mostrarToast("Solo un administrador puede eliminar trackings.","error");
    try{await eliminarTracking({tracking:t,auth});mostrarToast("Tracking eliminado.");await cargarDatos();}
    catch(err){mostrarToast(err.message||"No se pudo eliminar.","error");}
  };

  return <div className="card">
    <div className="page-title" style={{margin:"0 0 8px"}}>
      <h3>Envíos activos ({activos.length})</h3>
      <div className="segment" style={{flexWrap:"wrap"}}>
        <button className="btn" onClick={()=>setLoteAbierto(v=>!v)}><Layers size={14} style={{verticalAlign:"-2px",marginRight:4}}/>{loteAbierto?"Ocultar carga por lote":"Cargar lote de Bodega OEX"}</button>
        <select className="input input-sm" value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)}>
          <option value="Todos">Aéreo + Marítimo</option>
          <option value="Aéreo">Aéreos</option>
          <option value="Marítimo">Marítimos</option>
        </select>
        <select className="input input-sm" value={filtroDestino} onChange={e=>setFiltroDestino(e.target.value)}>
          <option value="Todos">Managua + Ometepe</option>
          <option value="Managua">Managua</option>
          <option value="Ometepe">Ometepe</option>
        </select>
        <select className="input input-sm" value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)}>
          <option value="Todos">Todos los estados</option>
          {estadosDisponibles.map(estado=><option key={estado} value={estado}>{estado}</option>)}
        </select>
        <input className="input input-sm" placeholder="Buscar cliente, tracking, recibo, proveedor o ID almacén" value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>
      </div>
    </div>
    <p><small>Los trackings con recibo siguen aquí para poder buscarlos. Su estado se cambia desde el recibo y se aplica a todos los paquetes del grupo. El deadline inicia al marcar Recibido en Miami.</small></p>

    {loteAbierto&&<div className="card" style={{background:"var(--surface-2, #f7f8fa)",marginBottom:16}}>
      <h4 style={{margin:"0 0 4px"}}>Pegar lista del proveedor</h4>
      <p><small>Pega tal cual la lista que te manda el proveedor (ID de almacén + peso).</small></p>
      <textarea className="input" style={{minHeight:140,fontFamily:"monospace",fontSize:"0.85rem"}} value={textoLote} onChange={e=>setTextoLote(e.target.value)}/>
      <div className="segment mt-8"><button className="btn btn-primary" disabled={!textoLote.trim()} onClick={analizarLote}>Analizar lista</button>{resultadoLote&&<button className="btn btn-ghost" onClick={limpiarLote}>Limpiar</button>}</div>
      {resultadoLote&&<div className="mt-16">
        <div className="grid-4"><div className="metric"><b>Con match</b><span className="metric-value" style={{color:"var(--success)"}}>{resultadoLote.emparejadas.filter(e=>e.tracking).length}</span></div><div className="metric"><b>Sin match</b><span className="metric-value">{resultadoLote.emparejadas.filter(e=>!e.tracking).length}</span></div><div className="metric"><b>Líneas no reconocidas</b><span className="metric-value">{resultadoLote.noReconocidas.length}</span></div><div className="metric"><b>Seleccionados</b><span className="metric-value">{seleccionLote.size}</span></div></div>
        <div className="list mt-16">{resultadoLote.emparejadas.map((item,i)=><label key={i} className="row-card" style={{cursor:item.tracking?"pointer":"default",opacity:item.tracking?1:.6}}><div style={{display:"flex",alignItems:"center",gap:10}}>{item.tracking?<CheckCircle2 size={18} style={{color:"var(--success)"}}/>:<XCircle size={18}/>}<input type="checkbox" style={{display:item.tracking?"inline":"none"}} checked={item.tracking?seleccionLote.has(item.tracking.id):false} onChange={()=>item.tracking&&toggleSeleccionLote(item.tracking.id)}/><div><b>{item.identificador}</b> → {item.peso.toFixed(2)} lb<p><small>{item.tracking?`${item.tracking.vinculacion?.cliente?.nombre||item.tracking.cliente} · ${item.tracking.estado}`:"Sin coincidencia"}</small></p></div></div></label>)}</div>
        {resultadoLote.noReconocidas.length>0&&<div className="mt-16"><p><HelpCircle size={16}/> <b>Líneas no reconocidas</b></p></div>}
        <button className="btn btn-primary mt-16" disabled={aplicandoLote||seleccionLote.size===0} onClick={aplicarLote}>{aplicandoLote?"Aplicando...":`Aplicar a ${seleccionLote.size} tracking(s) → Bodega OEX`}</button>
      </div>}
    </div>}

    <div className="list mt-8">{activos.map(t=><FilaTrackingActivo key={t.id} t={t} auditLog={auditLog} facturasProveedor={facturasProveedor} cambiarEstado={cambiarEstado} actualizarCampo={actualizarCampo} manejarBlurPeso={manejarBlurPeso} eliminar={eliminar}/>)}{activos.length===0&&<p>Sin envíos activos con estos filtros.</p>}</div>
    {pendientePeso&&<ModalRegistrarPeso tracking={pendientePeso.tracking} nuevoEstado={pendientePeso.nuevoEstado} guardando={guardandoPeso} onConfirmar={confirmarPesoYContinuar} onCancelar={()=>setPendientePeso(null)}/>} 
  </div>;
}

function FilaTrackingActivo({ t, auditLog, facturasProveedor, cambiarEstado, actualizarCampo, manejarBlurPeso, eliminar }) {
  const [expandido,setExpandido]=useState(false);
  const c=t.vinculacion?.cliente;
  const nombreMostrar=c?.nombre||t.cliente;
  const codigoMostrar=c?.codigo||t.clienteCodigo||"Sin registrar";
  const telefonoMostrar=c?.telefono||t.contacto||"";
  const esperandoPago=esListoParaRetiroProveedor(t.estado)&&!facturasProveedor.some(f=>f.estado==="Pagada"&&(f.trackings||[]).some(tk=>tk.id===t.id));
  const opcionesEstado=t.estado==="Prealertado"?["Prealertado",...estadosPorDestino(t.destino).filter(s=>s!=="Entregado")]:estadosPorDestino(t.destino).filter(s=>s!=="Entregado");
  const deadline=t.deadline;
  const badgeDeadline=deadline?.estadoDeadline==="vencido"?"badge-danger":deadline?.estadoDeadline==="proximo"?"badge-warning":"badge-success";
  const textoEstado=deadline?.estadoDeadline==="vencido"?"Deadline vencido":deadline?.estadoDeadline==="proximo"?`${deadline.restantes} día${deadline.restantes===1?"":"s"} hábil${deadline.restantes===1?"":"es"}`:"En tiempo";
  const vinculado=Boolean(t.envioId);

  return <div className="row-card" style={{flexDirection:"column",alignItems:"stretch"}}>
    <button type="button" className="page-title" style={{margin:0,width:"100%",background:"none",border:"none",cursor:"pointer",textAlign:"left",padding:0}} onClick={()=>setExpandido(v=>!v)}>
      <div>
        <b>{t.tracking||t.almacenId||"Sin código"}</b>{" "}
        <span className="badge badge-neutral">{t.tipoEnvio}</span>{" "}
        <span className={`badge ${badgeEstado(t.estado)}`}>{t.estado}</span>{" "}
        {t.proveedorAduana&&<span className="badge badge-info">{t.proveedorAduana.nombre}</span>}{" "}
        {t.recibo&&<span className="badge badge-info"><ReceiptText size={12} style={{verticalAlign:"-2px",marginRight:3}}/>{t.recibo.numero}</span>}{" "}
        {deadline&&<span className={`badge ${badgeDeadline}`}>{textoEstado}</span>}{" "}
        {!vinculado&&t.estado==="Bodega OEX"&&<span className="badge badge-success">Listo para recibo</span>}{" "}
        {esperandoPago&&!vinculado&&<span className="badge badge-warning">Falta pago proveedor</span>}
        <p style={{margin:"2px 0 0"}}>{nombreMostrar} · {codigoMostrar}{telefonoMostrar?` · ${telefonoMostrar}`:""} · {t.destino}{numero(t.peso)>0&&` · ${numero(t.peso).toFixed(1)} lb`}</p>
        {deadline&&<small style={{display:"block",marginTop:3}}><Clock3 size={12} style={{verticalAlign:"-2px",marginRight:4}}/>Entrega prometida: <b>{formatoRangoDeadline(deadline)}</b> · {textoPromesa(t.destino,t.tipoEnvio)}</small>}
        {t.proveedorAduana&&<small style={{display:"block"}}>Costo interno: ${numero(t.costoInterno).toFixed(2)}/lb · ID almacén: {t.almacenId||"pendiente"}</small>}
        {t.recibo&&<small style={{display:"block"}}>Incluido en recibo <b>{t.recibo.numero}</b> · el estado se administra como grupo.</small>}
      </div>
      <div className="stack-gap-sm text-right"><small>{expandido?"Ocultar ▲":"Ver detalle ▼"}</small></div>
    </button>

    {expandido&&<div className="mt-8" style={{borderTop:"1px solid var(--border)",paddingTop:10}}>
      <div className="page-title" style={{margin:"0 0 4px"}}><small>{t.fecha}</small>{!vinculado&&<button className="btn btn-danger" onClick={()=>eliminar(t)}>Eliminar</button>}</div>
      {deadline&&<div className="info-box mt-8" style={{background:deadline.estadoDeadline==="vencido"?"var(--danger-soft)":deadline.estadoDeadline==="proximo"?"var(--warning-soft)":"var(--success-soft)",color:deadline.estadoDeadline==="vencido"?"var(--danger)":deadline.estadoDeadline==="proximo"?"var(--warning)":"var(--success)"}}><b>Promesa OEX:</b> {formatoRangoDeadline(deadline)} · {textoEstado}. Inicio: recibido en Miami el {new Date(t.fechaMiami).toLocaleDateString("es-NI")}.</div>}
      <PipelineProgress estado={t.estado} destino={t.destino} tipoEnvio={t.tipoEnvio} auditLog={auditLog} registroCodigo={t.tracking||t.almacenId}/>
      {vinculado&&<div className="info-box mt-8"><ReceiptText size={15} style={{verticalAlign:"-3px",marginRight:5}}/>Este paquete pertenece al recibo <b>{t.recibo?.numero || t.envioId}</b>. Para mantener todos los paquetes sincronizados, cambia el estado desde Recibos.</div>}
      {esperandoPago&&!vinculado&&<div className="info-box mt-8">Esperando pago al proveedor para poder avanzar.</div>}
      <div className="segment mt-8" style={{alignItems:"center",flexWrap:"wrap",gap:10}}>
        <select className="input input-sm" value={t.estado} disabled={vinculado} onChange={e=>cambiarEstado(t,e.target.value)}>{opcionesEstado.map(s=><option key={s} value={s}>{s}</option>)}</select>
        <div style={{display:"flex",flexDirection:"column",gap:2}}><small>ID almacén</small><div style={{display:"flex",alignItems:"center",gap:6,border:"1px solid var(--border)",borderRadius:8,padding:"3px 8px"}}><Package size={13}/><input disabled={vinculado} defaultValue={t.almacenId} placeholder="—" onBlur={e=>e.target.value!==(t.almacenId||"")&&actualizarCampo(t,"almacenId",e.target.value)} style={{border:"none",outline:"none",background:"transparent",width:90}}/></div></div>
        <div style={{display:"flex",flexDirection:"column",gap:2}}><small>Peso</small><div style={{display:"flex",alignItems:"center",gap:6,border:"1px solid var(--border)",borderRadius:8,padding:"3px 8px"}}><Weight size={13}/><input disabled={vinculado} type="number" defaultValue={t.peso} placeholder="0.0" onBlur={e=>manejarBlurPeso(t,e)} style={{border:"none",outline:"none",background:"transparent",width:56}}/><span>lb</span></div></div>
      </div>
    </div>}
  </div>;
}
