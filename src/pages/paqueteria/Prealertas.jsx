// src/pages/paqueteria/Prealertas.jsx
import { useMemo, useState } from "react";
import { confirmarTracking, eliminarTracking, actualizarPrealerta } from "../../services/trackingsService";
import { esPendienteDeConfirmar } from "../../utils/estadosEnvio";
import { buscarClientesParecidos, limpiarTelefono } from "../../utils/clientes";

export default function Prealertas({ prealertas, clientes, rol, auth, mostrarToast, cargarDatos }) {
  const [confirmando, setConfirmando] = useState(null);
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [form, setForm] = useState({});

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
    setForm({ cliente: t.cliente || "", contacto: t.contacto || "", clienteCodigo: t.clienteCodigo || "", destino: t.destino || "Managua", tipoEnvio: t.tipoEnvio || "Aéreo", codigo: t.tracking || "", almacenId: t.almacenId || "", nota: t.nota || "" });
  };
  const cambiar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const guardarEdicion = async (t) => {
    setGuardando(true);
    try {
      await actualizarPrealerta({ tracking: t, cambios: form, auth });
      mostrarToast("Prealerta actualizada.");
      setEditando(null);
      await cargarDatos();
    } catch (err) { mostrarToast(err.message || "No se pudo actualizar.", "error"); }
    finally { setGuardando(false); }
  };

  const confirmar = async (t) => {
    setConfirmando(t.id);
    try { await confirmarTracking({ tracking: t, clientesEnMemoria: clientes, auth }); mostrarToast("Tracking confirmado — pasó a Envíos activos."); cargarDatos(); }
    catch (err) { mostrarToast(err.message || "No se pudo confirmar.", "error"); }
    finally { setConfirmando(null); }
  };
  const eliminar = async (t) => {
    if (rol !== "admin") return mostrarToast("Solo un administrador puede eliminar trackings.", "error");
    try { await eliminarTracking({ tracking: t, auth }); mostrarToast("Tracking eliminado."); cargarDatos(); }
    catch (err) { mostrarToast(err.message || "No se pudo eliminar.", "error"); }
  };

  return <div className="card">
    <div className="page-title" style={{ margin: "0 0 8px" }}><h3>Pendientes de confirmar ({pendientes.length})</h3><input className="input input-sm" placeholder="Buscar cliente, tracking, código o ID almacén" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /></div>
    <p><small>Llegaron desde la landing pública. Puedes editarlos antes de confirmar si algún dato está incorrecto.</small></p>
    <div className="list mt-8">{pendientes.map((t) => {
      const vinculo = resolverVinculo(t); const c = vinculo?.cliente;
      const parecidos = vinculo ? [] : buscarClientesParecidos(clientes, { telefono: t.contacto, codigo: t.clienteCodigo });
      const nombre = c?.nombre || t.cliente || "Sin nombre"; const codigo = c?.codigo || t.clienteCodigo || "Sin registrar"; const tel = c?.telefono || t.contacto || "Sin WhatsApp";
      const estaEditando = editando === t.id;
      return <div key={t.id} className="row-card" style={{ flexDirection:"column",alignItems:"stretch",borderLeft:"3px solid #F4562D" }}>
        <div className="page-title" style={{margin:0}}><div><b>{t.tracking || t.almacenId || "Sin código"}</b> <span className="badge badge-neutral">{t.tipoEnvio}</span>{" "}<span className="badge badge-warning">{t.estado || "Sin confirmar"}</span>{c && <>{" "}<span className="badge badge-success">Vinculado por {vinculo.motivo}</span></>}<p><b>{nombre}</b> · {codigo} · {tel} · {t.destino}</p>{c && t.cliente && t.cliente.trim().toLowerCase() !== c.nombre.trim().toLowerCase() && <small>Nombre recibido: {t.cliente} → se usará {c.nombre}</small>}<small style={{display:"block"}}>{t.fecha}</small></div>
        <div className="segment"><button className="btn btn-ghost" onClick={() => estaEditando ? setEditando(null) : abrirEdicion(t)}>{estaEditando ? "Cancelar edición" : "Editar"}</button><button className="btn btn-primary" disabled={confirmando===t.id || estaEditando} onClick={() => confirmar(t)}>{confirmando===t.id?"Confirmando...":"Confirmar recibido"}</button><button className="btn btn-danger" onClick={() => eliminar(t)}>Eliminar</button></div></div>
        {estaEditando && <div className="mt-8" style={{background:"#f7f8fa",border:"1px solid #dfe3e8",borderRadius:10,padding:14}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}>
            <label>Nombre<input className="input" value={form.cliente} onChange={e=>cambiar("cliente",e.target.value)} /></label>
            <label>WhatsApp<input className="input" value={form.contacto} onChange={e=>cambiar("contacto",e.target.value)} /></label>
            <label>Código cliente<input className="input" value={form.clienteCodigo} onChange={e=>cambiar("clienteCodigo",e.target.value)} /></label>
            <label>Tracking<input className="input" value={form.codigo} onChange={e=>cambiar("codigo",e.target.value)} /></label>
            <label>ID almacén<input className="input" value={form.almacenId} onChange={e=>cambiar("almacenId",e.target.value)} /></label>
            <label>Destino<select className="input" value={form.destino} onChange={e=>cambiar("destino",e.target.value)}><option>Managua</option><option>Ometepe</option></select></label>
            <label>Tipo de envío<select className="input" value={form.tipoEnvio} onChange={e=>cambiar("tipoEnvio",e.target.value)}><option>Aéreo</option><option>Marítimo</option></select></label>
            <label>Nota<input className="input" value={form.nota} onChange={e=>cambiar("nota",e.target.value)} /></label>
          </div><div style={{marginTop:12,textAlign:"right"}}><button className="btn btn-primary" disabled={guardando} onClick={()=>guardarEdicion(t)}>{guardando?"Guardando...":"Guardar cambios"}</button></div>
        </div>}
        {!c && !estaEditando && <div className="mt-8" style={{background:"#f6f7f9",border:"1px solid #dfe3e8",borderRadius:8,padding:"8px 12px"}}><b>Cliente nuevo / Sin vincular</b><p style={{margin:"4px 0 0"}}>No encontramos coincidencia exacta por código ni WhatsApp.</p></div>}
        {parecidos.length>0 && !estaEditando && <div className="mt-8" style={{background:"#fff8e6",border:"1px solid #f0c94c",borderRadius:8,padding:"8px 12px"}}><b style={{color:"#8a6a00"}}>⚠️ Posible duplicado</b>{parecidos.map(p=><p key={p.id} style={{margin:"4px 0 0"}}>{p.motivoParecido==="telefono"?<>El WhatsApp se parece al de <b>{p.nombre}</b> ({p.codigo} · {p.telefono}).</>:<>El código se parece al de <b>{p.nombre}</b> ({p.codigo} · {p.telefono}).</>}</p>)}</div>}
      </div>;
    })}{pendientes.length===0 && <p>Sin trackings pendientes de confirmar.</p>}</div>
  </div>;
}
