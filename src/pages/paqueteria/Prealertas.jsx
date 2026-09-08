// src/pages/paqueteria/Prealertas.jsx
import { useMemo, useState } from "react";
import { confirmarTracking, eliminarTracking, actualizarPrealerta } from "../../services/trackingsService";
import { esPendienteDeConfirmar } from "../../utils/estadosEnvio";
import { buscarClientesParecidos, limpiarTelefono } from "../../utils/clientes";

export default function Prealertas({ prealertas, clientes, proveedores = [], rol, auth, mostrarToast, cargarDatos }) {
  const [confirmando, setConfirmando] = useState(null);
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [form, setForm] = useState({});
  const [confirmForm, setConfirmForm] = useState({});

  const proveedoresAduana = useMemo(() => proveedores.filter((p) => p.tipo === "Aduana / Flete"), [proveedores]);
  const diasEnPrealerta = (t) => Math.max(0, Math.floor((Date.now() - new Date(t.fechaISO || t.fecha).getTime()) / 86400000));

  const resolverVinculo = (t) => {
    const codigo = String(t.clienteCodigo || "").trim().toUpperCase();
    if (codigo) {
      const porCodigo = clientes.find((c) => String(c.codigo || "").trim().toUpperCase() === codigo);
      if (porCodigo) return { cliente: porCodigo, motivo: "código" };
    }
    const telefono = limpiarTelefono(t.contacto);
    if (telefono) {
      const porTelefono = clientes.find((c) => limpiarTelefono(c.telefono) === telefono);
      if (porTelefono) return { cliente: porTelefono, motivo: "WhatsApp" };
    }
    if (t.clienteId) {
      const porId = clientes.find((c) => c.id === t.clienteId);
      if (porId) return { cliente: porId, motivo: "cliente" };
    }
    return null;
  };

  const pendientes = useMemo(() => {
    const q = busqueda.toLowerCase();
    return prealertas.filter(esPendienteDeConfirmar).filter((t) => {
      const c = resolverVinculo(t)?.cliente;
      return !q || [t.cliente,t.clienteCodigo,t.contacto,t.tracking,t.almacenId,c?.nombre,c?.codigo,c?.telefono].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [prealertas, clientes, busqueda]);

  const abrirEdicion = (t) => {
    setEditando(t.id);
    setForm({ cliente:t.cliente||"", contacto:t.contacto||"", clienteCodigo:t.clienteCodigo||"", destino:t.destino||"Managua", tipoEnvio:t.tipoEnvio||"Aéreo", codigo:t.tracking||"", almacenId:t.almacenId||"", nota:t.nota||"" });
  };
  const cambiar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const guardarEdicion = async (t) => {
    setGuardando(true);
    try { await actualizarPrealerta({ tracking:t, cambios:form, auth }); mostrarToast("Prealerta actualizada."); setEditando(null); await cargarDatos(); }
    catch (err) { mostrarToast(err.message || "No se pudo actualizar.", "error"); }
    finally { setGuardando(false); }
  };

  const abrirConfirmacion = (t) => {
    if (confirmando === t.id) { setConfirmando(null); return; }
    setConfirmando(t.id);
    setConfirmForm((prev) => ({ ...prev, [t.id]: { proveedorId: prev[t.id]?.proveedorId || "", almacenId: prev[t.id]?.almacenId || t.almacenId || "" } }));
  };

  const confirmar = async (t) => {
    const datos = confirmForm[t.id] || {};
    const proveedor = proveedoresAduana.find((p) => String(p.id) === String(datos.proveedorId));
    if (!proveedor) return mostrarToast("Selecciona el proveedor de Aduana / Flete.", "warning");
    if (!String(datos.almacenId || "").trim()) return mostrarToast("Escribe el ID de almacén.", "warning");

    try {
      await confirmarTracking({ tracking:t, clientesEnMemoria:clientes, proveedorAduana:proveedor, almacenId:datos.almacenId, auth });
      mostrarToast(`Tracking confirmado con ${proveedor.nombre}.`);
      setConfirmando(null);
      await cargarDatos();
    } catch (err) { mostrarToast(err.message || "No se pudo confirmar.", "error"); }
  };

  const eliminar = async (t) => {
    if (rol !== "admin") return mostrarToast("Solo un administrador puede eliminar trackings.", "error");
    try { await eliminarTracking({ tracking:t, auth }); mostrarToast("Tracking eliminado."); cargarDatos(); }
    catch (err) { mostrarToast(err.message || "No se pudo eliminar.", "error"); }
  };

  return <div className="card">
    <div className="page-title" style={{ margin:"0 0 8px" }}><h3>Pendientes de confirmar ({pendientes.length})</h3><input className="input input-sm" placeholder="Buscar cliente, tracking, código o ID almacén" value={busqueda} onChange={(e)=>setBusqueda(e.target.value)} /></div>
    <p><small>Al confirmar, selecciona el proveedor de Aduana / Flete y registra el ID de almacén con el que fue recibido en Miami.</small></p>
    <div className="list mt-8">{pendientes.map((t)=>{
      const vinculo=resolverVinculo(t); const c=vinculo?.cliente;
      const parecidos=vinculo?[]:buscarClientesParecidos(clientes,{telefono:t.contacto,codigo:t.clienteCodigo});
      const nombre=c?.nombre||t.cliente||"Sin nombre"; const codigo=c?.codigo||t.clienteCodigo||"Sin registrar"; const tel=c?.telefono||t.contacto||"Sin WhatsApp";
      const estaEditando=editando===t.id; const estaConfirmando=confirmando===t.id; const cf=confirmForm[t.id]||{};
      const proveedorSel=proveedoresAduana.find((p)=>String(p.id)===String(cf.proveedorId));
      const tarifa=proveedorSel ? (t.tipoEnvio==="Aéreo"?proveedorSel.tarifaAereo:proveedorSel.tarifaMaritimo) : null;
      return <div key={t.id} className="row-card" style={{flexDirection:"column",alignItems:"stretch",borderLeft:"3px solid #F4562D"}}>
        <div className="page-title" style={{margin:0}}><div><b>{t.tracking||t.almacenId||"Sin código"}</b> <span className="badge badge-neutral">{t.tipoEnvio}</span>{" "}<span className="badge badge-warning">{t.estado||"Sin confirmar"}</span>{diasEnPrealerta(t)>=7&&<>{" "}<span className="badge badge-warning" title="Esta prealerta lleva una semana o más sin confirmarse">⚠ {diasEnPrealerta(t)} días en prealerta</span></>}{c&&<>{" "}<span className="badge badge-success">Vinculado por {vinculo.motivo}</span></>}<p><b>{nombre}</b> · {codigo} · {tel} · {t.destino}</p><small style={{display:"block"}}>{t.fecha}</small></div>
        <div className="segment"><button className="btn btn-ghost" onClick={()=>estaEditando?setEditando(null):abrirEdicion(t)}>{estaEditando?"Cancelar edición":"Editar"}</button><button className="btn btn-primary" disabled={estaEditando} onClick={()=>abrirConfirmacion(t)}>{estaConfirmando?"Cancelar confirmación":"Confirmar recibido"}</button><button className="btn btn-danger" onClick={()=>eliminar(t)}>Eliminar</button></div></div>

        {estaConfirmando && !estaEditando && <div className="mt-8" style={{background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:10,padding:14}}>
          <div className="form-grid">
            <label><span className="field-label">Proveedor Aduana / Flete</span><select className="input" value={cf.proveedorId||""} onChange={(e)=>setConfirmForm((prev)=>({...prev,[t.id]:{...(prev[t.id]||{}),proveedorId:e.target.value}}))}><option value="">Selecciona proveedor…</option>{proveedoresAduana.map((p)=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select>{proveedorSel&&<small>Tarifa interna: ${Number(tarifa||0).toFixed(2)}/lb · {t.tipoEnvio}</small>}</label>
            <label><span className="field-label">ID almacén</span><input className="input" value={cf.almacenId||""} onChange={(e)=>setConfirmForm((prev)=>({...prev,[t.id]:{...(prev[t.id]||{}),almacenId:e.target.value}}))} placeholder="Obligatorio" /></label>
          </div>
          <div style={{marginTop:12,textAlign:"right"}}><button className="btn btn-primary" onClick={()=>confirmar(t)}>Confirmar y pasar a Miami</button></div>
        </div>}

        {estaEditando && <div className="mt-8" style={{background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:10,padding:14}}><div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}>
          <label>Nombre<input className="input" value={form.cliente} onChange={e=>cambiar("cliente",e.target.value)} /></label>
          <label>WhatsApp<input className="input" value={form.contacto} onChange={e=>cambiar("contacto",e.target.value)} /></label>
          <label>Código cliente<input className="input" value={form.clienteCodigo} onChange={e=>cambiar("clienteCodigo",e.target.value)} /></label>
          <label>Tracking<input className="input" value={form.codigo} onChange={e=>cambiar("codigo",e.target.value)} /></label>
          <label>ID almacén<input className="input" value={form.almacenId} onChange={e=>cambiar("almacenId",e.target.value)} /></label>
          <label>Destino<select className="input" value={form.destino} onChange={e=>cambiar("destino",e.target.value)}><option>Managua</option><option>Ometepe</option></select></label>
          <label>Tipo de envío<select className="input" value={form.tipoEnvio} onChange={e=>cambiar("tipoEnvio",e.target.value)}><option>Aéreo</option><option>Marítimo</option></select></label>
          <label>Nota del tracking<input className="input" maxLength={160} value={form.nota} onChange={e=>cambiar("nota",e.target.value)} /></label>
        </div><div style={{marginTop:12,textAlign:"right"}}><button className="btn btn-primary" disabled={guardando} onClick={()=>guardarEdicion(t)}>{guardando?"Guardando...":"Guardar cambios"}</button></div></div>}
        {!c&&!estaEditando&&<div className="mt-8" style={{background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:8,padding:"8px 12px"}}><b>Cliente nuevo / Sin vincular</b><p style={{margin:"4px 0 0"}}>No encontramos coincidencia exacta por código ni WhatsApp.</p></div>}
        {parecidos.length>0&&!estaEditando&&<div className="mt-8" style={{background:"#fff8e6",border:"1px solid #f0c94c",borderRadius:8,padding:"8px 12px"}}><b style={{color:"#8a6a00"}}>⚠️ Posible duplicado</b>{parecidos.map(p=><p key={p.id} style={{margin:"4px 0 0"}}>{p.motivoParecido==="telefono"?<>El WhatsApp se parece al de <b>{p.nombre}</b> ({p.codigo} · {p.telefono}).</>:<>El código se parece al de <b>{p.nombre}</b> ({p.codigo} · {p.telefono}).</>}</p>)}</div>}
      </div>;
    })}{pendientes.length===0&&<p>Sin trackings pendientes de confirmar.</p>}</div>
  </div>;
}
