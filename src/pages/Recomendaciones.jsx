import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, BadgeDollarSign, Check, Copy, Handshake, Link2, Pencil, Plus,
  Search, ShieldCheck, Tag, Trash2, Users, X
} from "lucide-react";
import PageTitle from "../components/PageTitle";
import {
  construirEnlaceRecomendacion,
  eliminarSocioRecomendacion,
  guardarSocioRecomendacion,
  listarClientesRecomendados,
  listarSociosRecomendacion,
  normalizarIdentificador,
} from "../services/recomendacionesService";
import "../styles/Recomendaciones.css";

const hoy = () => new Date().toISOString().slice(0, 10);
const FORM_INICIAL = {
  nombre: "", whatsapp: "+505 ", correo: "", foto_url: "", identificador: "",
  estado: "pendiente", porcentaje_utilidad: 20, tarifa_maritima: "", tarifa_aerea: "",
  tarifa_promocional_activa: false, metodo_pago: "", datos_pago: "", notas: "", fecha_ingreso: hoy(),
};

const ESTADOS = {
  activo: { texto: "Activo", clase: "badge-success" },
  pendiente: { texto: "Pendiente", clase: "badge-warning" },
  inactivo: { texto: "Inactivo", clase: "badge-neutral" },
  suspendido: { texto: "Suspendido", clase: "badge-danger" },
};

const textoError = (error) => {
  if (error?.code === "23505") return "Ese identificador de recomendación ya está en uso.";
  return error?.message || "No se pudo completar la acción.";
};

export default function Recomendaciones({ rol, auth, mostrarToast }) {
  const [socios, setSocios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [formAbierto, setFormAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [busqueda, setBusqueda] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [clientesRecomendados, setClientesRecomendados] = useState([]);
  const [socioDetalleId, setSocioDetalleId] = useState(null);

  const cargar = async () => {
    setCargando(true);
    try {
      const [sociosData, clientesData] = await Promise.all([listarSociosRecomendacion(), listarClientesRecomendados()]);
      setSocios(sociosData);
      setClientesRecomendados(clientesData);
    }
    catch (error) { mostrarToast?.("Error", textoError(error), "error"); }
    finally { setCargando(false); }
  };

  useEffect(() => { cargar(); }, []);

  const metricas = useMemo(() => ({
    total: socios.length,
    activos: socios.filter(s => s.estado === "activo").length,
    pendientes: socios.filter(s => s.estado === "pendiente").length,
    promocional: socios.filter(s => s.tarifa_promocional_activa).length,
  }), [socios]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return socios.filter(s => {
      const coincideEstado = !estadoFiltro || s.estado === estadoFiltro;
      const coincideTexto = !q || [s.nombre, s.whatsapp, s.correo, s.identificador]
        .some(v => String(v || "").toLowerCase().includes(q));
      return coincideEstado && coincideTexto;
    });
  }, [socios, busqueda, estadoFiltro]);

  const abrirNuevo = () => {
    setEditandoId(null);
    setForm(FORM_INICIAL);
    setFormAbierto(true);
  };

  const abrirEditar = (socio) => {
    setEditandoId(socio.id);
    setForm({
      nombre: socio.nombre || "", whatsapp: socio.whatsapp || "+505 ", correo: socio.correo || "",
      foto_url: socio.foto_url || "", identificador: socio.identificador || "", estado: socio.estado || "pendiente",
      porcentaje_utilidad: socio.porcentaje_utilidad ?? 20, tarifa_maritima: socio.tarifa_maritima ?? "",
      tarifa_aerea: socio.tarifa_aerea ?? "", tarifa_promocional_activa: Boolean(socio.tarifa_promocional_activa),
      metodo_pago: socio.metodo_pago || "", datos_pago: socio.datos_pago || "", notas: socio.notas || "",
      fecha_ingreso: socio.fecha_ingreso || hoy(),
    });
    setFormAbierto(true);
  };

  const actualizar = (campo, valor) => setForm(actual => ({ ...actual, [campo]: valor }));

  const cambiarNombre = (nombre) => setForm(actual => ({
    ...actual,
    nombre,
    identificador: editandoId || actual.identificador ? actual.identificador : normalizarIdentificador(nombre),
  }));

  const guardar = async (evento) => {
    evento.preventDefault();
    setGuardando(true);
    try {
      await guardarSocioRecomendacion({ ...form, id: editandoId }, auth);
      mostrarToast?.("Guardado", editandoId ? "Socio OEX actualizado." : "Socio OEX agregado.");
      setFormAbierto(false);
      await cargar();
    } catch (error) { mostrarToast?.("No se pudo guardar", textoError(error), "error"); }
    finally { setGuardando(false); }
  };

  const eliminar = async (socio) => {
    if (rol !== "admin") return;
    if (!window.confirm(`¿Eliminar a ${socio.nombre} del programa? Esta acción no se puede deshacer.`)) return;
    try {
      await eliminarSocioRecomendacion(socio.id);
      mostrarToast?.("Eliminado", "El Socio OEX fue eliminado.");
      await cargar();
    } catch (error) { mostrarToast?.("No se pudo eliminar", textoError(error), "error"); }
  };

  const copiar = async (identificador) => {
    const enlace = construirEnlaceRecomendacion(identificador);
    try { await navigator.clipboard.writeText(enlace); mostrarToast?.("Enlace copiado", enlace); }
    catch { mostrarToast?.("Enlace", enlace); }
  };

  const socioDetalle = socios.find((s) => s.id === socioDetalleId) || null;
  if (socioDetalle) {
    const clientesDelSocio = clientesRecomendados.filter((c) => String(c.socio_recomendacion_id) === String(socioDetalle.id));
    const iniciales = socioDetalle.nombre.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
    return <div className="page recomendaciones-page">
      <button className="btn btn-ghost" onClick={() => setSocioDetalleId(null)} style={{ marginBottom: 8 }}><ArrowLeft size={16} />Volver a Recomendaciones</button>
      <PageTitle title={socioDetalle.nombre} subtitle={`Socio OEX · ${socioDetalle.identificador.toUpperCase()}`}>
        <button className="btn" onClick={() => copiar(socioDetalle.identificador)}><Copy size={15} />Copiar enlace</button>
        <button className="btn" onClick={() => abrirEditar(socioDetalle)}><Pencil size={15} />Editar socio</button>
      </PageTitle>
      <div className="card socio-ficha-resumen">
        {socioDetalle.foto_url ? <img src={socioDetalle.foto_url} alt="" /> : <span className="socio-avatar socio-avatar-grande">{iniciales}</span>}
        <div><span className="badge badge-warning"><Tag size={13} />{socioDetalle.identificador.toUpperCase()}</span><p>{socioDetalle.whatsapp || "Sin WhatsApp"}{socioDetalle.correo ? ` · ${socioDetalle.correo}` : ""}</p></div>
      </div>
      <div className="grid-4 recomendaciones-metricas">
        <div className="metric"><Users size={20} /><b>Clientes recomendados</b><span className="metric-value">{clientesDelSocio.length}</span></div>
        <div className="metric"><BadgeDollarSign size={20} /><b>Ganancia</b><span className="metric-value">{Number(socioDetalle.porcentaje_utilidad).toFixed(0)}%</span></div>
        <div className="metric"><ShieldCheck size={20} /><b>Estado</b><span className="metric-value" style={{ fontSize: 18 }}>{ESTADOS[socioDetalle.estado]?.texto || "Pendiente"}</span></div>
        <div className="metric"><Tag size={20} /><b>Tarifa promocional</b><span className="metric-value" style={{ fontSize: 18 }}>{socioDetalle.tarifa_promocional_activa ? "Activa" : "No activa"}</span></div>
      </div>
      <div className="card">
        <h3>Clientes vinculados</h3>
        <div className="list mt-16">{clientesDelSocio.map((cliente) => <div className="row-card" key={cliente.id}><div><b>{cliente.nombre}</b> <span className="badge badge-info">{cliente.codigo_cliente || "Sin código"}</span><p>{cliente.telefono || "Sin teléfono"}</p></div><small>{cliente.recomendacion_origen === "enlace" ? "Enlace personal" : "Asignación manual"}{cliente.recomendacion_fecha ? ` · ${new Date(cliente.recomendacion_fecha).toLocaleDateString("es-NI")}` : ""}</small></div>)}</div>
        {clientesDelSocio.length === 0 && <p className="muted">Todavía no hay clientes asociados con este identificador.</p>}
      </div>
    </div>;
  }

  return <div className="page recomendaciones-page">
    <PageTitle
      title="Programa de Recomendaciones"
      subtitle="Administra los Socios OEX, sus beneficios y enlaces de recomendación."
    >
      <button type="button" className="btn btn-primary" onClick={abrirNuevo}><Plus size={16} />Agregar Socio OEX</button>
    </PageTitle>

    <div className="grid-4 recomendaciones-metricas">
      <div className="metric"><Handshake size={20} /><b>Socios registrados</b><span className="metric-value">{metricas.total}</span></div>
      <div className="metric"><ShieldCheck size={20} /><b>Socios activos</b><span className="metric-value">{metricas.activos}</span></div>
      <div className="metric"><Users size={20} /><b>Pendientes</b><span className="metric-value">{metricas.pendientes}</span></div>
      <div className="metric"><Tag size={20} /><b>Tarifa promocional</b><span className="metric-value">{metricas.promocional}</span></div>
    </div>

    <div className="info-box recomendaciones-aviso">
      <Link2 size={17} /> Las asignaciones manuales ya están disponibles desde la ficha del cliente. El enlace personal queda preparado para la asociación automática de la prealerta.
    </div>

    <div className="card recomendaciones-filtros">
      <label className="recomendaciones-busqueda">
        <Search size={17} />
        <input className="input" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre, teléfono, correo o identificador" />
      </label>
      <select className="input input-sm" value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)} aria-label="Filtrar por estado">
        <option value="">Todos los estados</option>
        <option value="activo">Activo</option>
        <option value="pendiente">Pendiente</option>
        <option value="inactivo">Inactivo</option>
        <option value="suspendido">Suspendido</option>
      </select>
    </div>

    {cargando ? <div className="card muted">Cargando Socios OEX…</div> : filtrados.length === 0 ? (
      <div className="card recomendaciones-vacio"><Handshake size={34} /><b>No hay Socios OEX para mostrar</b><span>Agrega el primero o cambia los filtros.</span></div>
    ) : <div className="recomendaciones-tabla-wrap card">
      <table className="recomendaciones-tabla">
        <thead><tr><th>Socio OEX</th><th>Clientes</th><th>Estado</th><th>Ganancia</th><th>Tarifa promocional</th><th>Enlace</th><th aria-label="Acciones" /></tr></thead>
        <tbody>{filtrados.map(socio => {
          const estado = ESTADOS[socio.estado] || ESTADOS.pendiente;
          const iniciales = socio.nombre.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
          return <tr key={socio.id}>
            <td><button type="button" className="socio-identidad socio-identidad-boton" onClick={() => setSocioDetalleId(socio.id)}>
              {socio.foto_url ? <img src={socio.foto_url} alt="" /> : <span className="socio-avatar">{iniciales}</span>}
              <div><strong>{socio.nombre}</strong><small>{socio.whatsapp || socio.correo || "Sin contacto registrado"}</small></div>
            </button></td>
            <td><strong>{clientesRecomendados.filter(c => String(c.socio_recomendacion_id) === String(socio.id)).length}</strong></td>
            <td><span className={`badge ${estado.clase}`}>{estado.texto}</span></td>
            <td><strong>{Number(socio.porcentaje_utilidad).toFixed(0)}%</strong><small className="tabla-subtexto">de utilidad elegible</small></td>
            <td>{socio.tarifa_promocional_activa ? <span className="badge badge-success"><Check size={12} />Activa</span> : <span className="badge badge-neutral">No activa</span>}</td>
            <td><button type="button" className="enlace-copiar" onClick={() => copiar(socio.identificador)} title="Copiar enlace"><code>/prealerta/{socio.identificador}</code><Copy size={14} /></button></td>
            <td><div className="acciones-tabla">
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => abrirEditar(socio)} aria-label={`Editar ${socio.nombre}`}><Pencil size={16} /></button>
              {rol === "admin" && <button type="button" className="btn btn-ghost btn-icon accion-eliminar" onClick={() => eliminar(socio)} aria-label={`Eliminar ${socio.nombre}`}><Trash2 size={16} /></button>}
            </div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>}

    {formAbierto && <div className="modal-overlay" role="presentation" onMouseDown={e => e.target === e.currentTarget && setFormAbierto(false)}>
      <form className="modal-card recomendaciones-form" onSubmit={guardar}>
        <div className="modal-header"><div><h2>{editandoId ? "Editar Socio OEX" : "Agregar Socio OEX"}</h2><p>Información administrativa del Programa de Recomendaciones.</p></div><button type="button" className="btn btn-ghost btn-icon" onClick={() => setFormAbierto(false)} aria-label="Cerrar"><X size={19} /></button></div>
        <div className="form-grid">
          <label><span className="field-label">Nombre completo *</span><input className="input" required value={form.nombre} onChange={e => cambiarNombre(e.target.value)} /></label>
          <label><span className="field-label">WhatsApp</span><input className="input" value={form.whatsapp} onChange={e => actualizar("whatsapp", e.target.value)} /></label>
          <label><span className="field-label">Correo</span><input className="input" type="email" value={form.correo} onChange={e => actualizar("correo", e.target.value)} /></label>
          <label><span className="field-label">URL de foto o avatar</span><input className="input" type="url" value={form.foto_url} onChange={e => actualizar("foto_url", e.target.value)} placeholder="https://…" /></label>
          <label><span className="field-label">Identificador *</span><input className="input" required value={form.identificador} onChange={e => actualizar("identificador", normalizarIdentificador(e.target.value))} placeholder="maria25" /><small className="field-help">oexni.com/prealerta/{form.identificador || "identificador"}</small></label>
          <label><span className="field-label">Estado</span><select className="input" value={form.estado} onChange={e => actualizar("estado", e.target.value)}><option value="pendiente">Pendiente</option><option value="activo">Activo</option><option value="inactivo">Inactivo</option><option value="suspendido">Suspendido</option></select></label>
          <label><span className="field-label">Ganancia sobre utilidad (%)</span><input className="input" type="number" min="0" max="100" step="0.01" value={form.porcentaje_utilidad} onChange={e => actualizar("porcentaje_utilidad", e.target.value)} /></label>
          <label><span className="field-label">Fecha de ingreso</span><input className="input" type="date" value={form.fecha_ingreso} onChange={e => actualizar("fecha_ingreso", e.target.value)} /></label>
          <label><span className="field-label">Tarifa marítima personal</span><input className="input" type="number" min="0" step="0.01" value={form.tarifa_maritima} onChange={e => actualizar("tarifa_maritima", e.target.value)} placeholder="Sin definir" /></label>
          <label><span className="field-label">Tarifa aérea personal</span><input className="input" type="number" min="0" step="0.01" value={form.tarifa_aerea} onChange={e => actualizar("tarifa_aerea", e.target.value)} placeholder="Sin definir" /></label>
          <label><span className="field-label">Método de pago</span><input className="input" value={form.metodo_pago} onChange={e => actualizar("metodo_pago", e.target.value)} placeholder="Transferencia, efectivo…" /></label>
          <label><span className="field-label">Datos para el pago</span><input className="input" value={form.datos_pago} onChange={e => actualizar("datos_pago", e.target.value)} placeholder="Cuenta o referencia" /></label>
        </div>
        <label className="switch-row"><input type="checkbox" checked={form.tarifa_promocional_activa} onChange={e => actualizar("tarifa_promocional_activa", e.target.checked)} /><span><b>Tarifa promocional activa</b><small>Se aplica únicamente a los envíos personales del Socio OEX.</small></span></label>
        <label><span className="field-label">Notas internas</span><textarea className="input" value={form.notas} onChange={e => actualizar("notas", e.target.value)} placeholder="Observaciones administrativas…" /></label>
        <div className="modal-actions"><button type="button" className="btn" onClick={() => setFormAbierto(false)}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={guardando}><BadgeDollarSign size={16} />{guardando ? "Guardando…" : "Guardar Socio OEX"}</button></div>
      </form>
    </div>}
  </div>;
}
