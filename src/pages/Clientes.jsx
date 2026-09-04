// src/pages/Clientes.jsx
import { useMemo, useState } from "react";
import { UserPlus, PieChart as PieChartIcon, History as HistoryIcon, Pencil, X, ArrowLeft, Search, FileText, Weight } from "lucide-react";
import { numero } from "../utils/numero";
import { guardarClienteManual, eliminarCliente } from "../services/clientesService";
import { exportarClientesExcel } from "../services/excelService";
import { confirmarAccionCritica } from "../services/coreService";
import ModalRecibo from "../components/ModalRecibo";
import PageTitle from "../components/PageTitle";

const formVacio = { nombre: "", telefono: "", correo: "", direccion: "", tipo: "General", observaciones: "" };

// Paleta para el pastel de tipos de cliente.
const COLORES_TIPO = ["#7e3bed", "#22c55e", "#f59e0b", "#3b82f6", "#ec4899", "#14b8a6"];

export default function Clientes({ clientes, envios, empresa, tarifas, rol, auth, mostrarToast, cargarDatos }) {
  const [form, setForm] = useState(formVacio);
  const [editandoId, setEditandoId] = useState(null);
  // Controla el panel de "Nuevo cliente" — antes el formulario siempre
  // estaba visible en una columna fija; ahora aparece solo al pulsar
  // "Agregar cliente", igual que el resto de flujos de "+ X" del sistema.
  const [formAbierto, setFormAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Antes "Ver historial" expandía la fila del cliente inline. Ahora
  // navega a una vista de detalle completa (misma pantalla, cambia de
  // pestaña) — más espacio para el historial y deja la lista libre de
  // clic accidental sobre otro cliente mientras revisas uno.
  const [vista, setVista] = useState("lista"); // "lista" | "detalle"
  const [clienteDetalleId, setClienteDetalleId] = useState(null);

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase();
    return clientes.filter((c) => !q || c.nombre.toLowerCase().includes(q) || c.telefono.includes(q) || c.codigo.toLowerCase().includes(q));
  }, [clientes, busqueda]);

  const enviosDe = (clienteId) => envios.filter((e) => e.clienteId === clienteId);
  const totalGastadoDe = (clienteId) => enviosDe(clienteId).reduce((a, e) => a + numero(e.total), 0);

  // === Clientes por tipo (pastel con porcentaje) ===
  const clientesPorTipo = useMemo(() => {
    const mapa = new Map();
    clientes.forEach((c) => {
      const key = c.tipo || "General";
      mapa.set(key, (mapa.get(key) || 0) + 1);
    });
    const total = clientes.length;
    return [...mapa.entries()]
      .map(([tipo, cantidad], i) => ({
        tipo,
        cantidad,
        pct: total > 0 ? (cantidad / total) * 100 : 0,
        color: COLORES_TIPO[i % COLORES_TIPO.length]
      }))
      .sort((a, b) => b.cantidad - a.cantidad);
  }, [clientes]);

  const gradienteTipos = useMemo(() => {
    let acumulado = 0;
    const partes = clientesPorTipo.map((t) => {
      const inicio = acumulado;
      acumulado += t.pct;
      return `${t.color} ${inicio}% ${acumulado}%`;
    });
    return partes.length > 0 ? `conic-gradient(${partes.join(", ")})` : null;
  }, [clientesPorTipo]);

  const abrirNuevo = () => {
    setForm(formVacio);
    setEditandoId(null);
    setFormAbierto(true);
  };

  const cerrarFormNuevo = () => {
    setForm(formVacio);
    setFormAbierto(false);
  };

  // Editar abre el formulario EN LA MISMA fila del cliente (lista) o
  // dentro de su ficha (detalle) — misma función, dos sitios de render.
  const editar = (c) => {
    setFormAbierto(false);
    setForm({ nombre: c.nombre, telefono: c.telefono, correo: c.correo, direccion: c.direccion, tipo: c.tipo, observaciones: c.observaciones });
    setEditandoId(c.id);
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setForm(formVacio);
  };

  const guardar = async () => {
    if (!form.nombre.trim() || !form.telefono.trim()) {
      mostrarToast("Nombre y teléfono son obligatorios.", "warning");
      return;
    }
    setGuardando(true);
    try {
      await guardarClienteManual({ id: editandoId, form, clientesEnMemoria: clientes, auth });
      mostrarToast(editandoId ? "Cliente actualizado." : "Cliente creado.");
      setForm(formVacio);
      setEditandoId(null);
      setFormAbierto(false);
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo guardar el cliente.", "error");
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (c) => {
    if (rol !== "admin") return mostrarToast("Solo un administrador puede eliminar clientes.", "error");
    if (!confirmarAccionCritica(`Vas a eliminar al cliente ${c.codigo} · ${c.nombre}.`)) return;
    try {
      await eliminarCliente({ cliente: c, auth });
      mostrarToast("Cliente eliminado.");
      if (vista === "detalle" && clienteDetalleId === c.id) setVista("lista");
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo eliminar.", "error");
    }
  };

  const verDetalle = (c) => {
    setEditandoId(null);
    setClienteDetalleId(c.id);
    setVista("detalle");
  };

  // Campos del formulario, reutilizados en los tres contextos donde
  // aparece: "Nuevo cliente", editar en línea desde la lista, y editar
  // desde la ficha de detalle.
  const camposForm = (
    <>
      <div className="form-grid mt-16">
        <label><span className="field-label">Nombre</span><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></label>
        <label><span className="field-label">Teléfono</span><input className="input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></label>
        <label><span className="field-label">Correo</span><input className="input" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} /></label>
        <label>
          <span className="field-label">Tipo</span>
          <select className="input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            {["General", "Emprendedor", "Empresarial"].map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <label className="mt-8"><span className="field-label">Dirección</span><input className="input" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></label>
      <textarea className="input mt-8" placeholder="Observaciones" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
    </>
  );

  const clienteDetalle = vista === "detalle" ? clientes.find((c) => c.id === clienteDetalleId) : null;

  // ---------- Vista de detalle: historial completo de un cliente ----------
  if (vista === "detalle") {
    if (!clienteDetalle) {
      // El cliente pudo haberse eliminado desde otra pestaña — no dejar
      // la vista de detalle colgada apuntando a nada.
      setVista("lista");
      return null;
    }
    return (
      <ClienteDetalle
        cliente={clienteDetalle}
        envios={enviosDe(clienteDetalle.id)}
        totalGastado={totalGastadoDe(clienteDetalle.id)}
        empresa={empresa}
        tarifas={tarifas}
        editando={editandoId === clienteDetalle.id}
        camposForm={camposForm}
        guardando={guardando}
        rol={rol}
        onVolver={() => setVista("lista")}
        onEditar={() => editar(clienteDetalle)}
        onGuardar={guardar}
        onCancelarEdicion={cancelarEdicion}
        onEliminar={() => eliminar(clienteDetalle)}
      />
    );
  }

  // ---------- Vista de lista ----------
  return (
    <div className="page">
      <PageTitle title="Clientes" subtitle="Un solo código por cliente — se resuelve automáticamente por teléfono">
        <button className="btn btn-primary" onClick={abrirNuevo}>
          <UserPlus size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />Agregar cliente
        </button>
        <button className="btn" onClick={() => exportarClientesExcel(clientes)}>Exportar Excel</button>
      </PageTitle>

      {formAbierto && (
        <div className="card mt-16">
          <div className="page-title" style={{ margin: 0 }}>
            <h3>Nuevo cliente</h3>
            <button className="btn btn-ghost" onClick={cerrarFormNuevo}><X size={16} /></button>
          </div>
          {camposForm}
          <div className="segment mt-16">
            <button className="btn btn-primary" disabled={guardando} onClick={guardar}>{guardando ? "Guardando..." : "Crear cliente"}</button>
            <button className="btn" onClick={cerrarFormNuevo}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="card mt-16">
        <h3><PieChartIcon size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />Clientes por tipo</h3>
        <div className="mt-16" style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", width: 140, height: 140, flexShrink: 0 }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background: gradienteTipos || "var(--border)",
                WebkitMask: "radial-gradient(farthest-side, transparent 61%, #000 62%)",
                mask: "radial-gradient(farthest-side, transparent 61%, #000 62%)"
              }}
            />
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
              <b style={{ fontSize: "1.3rem" }}>{clientes.length}</b>
              <small>cliente(s)</small>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            {clientesPorTipo.map((t) => (
              <div key={t.tipo} className="row-card">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: t.color, display: "inline-block", flexShrink: 0 }} />
                  <b>{t.tipo}</b>
                </div>
                <div className="text-right">
                  <b>{t.cantidad}</b>
                  <small style={{ display: "block", opacity: 0.6 }}>{t.pct.toFixed(0)}%</small>
                </div>
              </div>
            ))}
            {clientesPorTipo.length === 0 && <p>Sin clientes registrados todavía.</p>}
          </div>
        </div>
      </div>

      <div className="card mt-16">
        <div className="page-title" style={{ margin: "0 0 8px" }}>
          <h3>Directorio</h3>
          <input className="input input-sm" placeholder="Buscar nombre, teléfono o código" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <div className="list">
          {filtrados.map((c) => {
            const enviosDelCliente = enviosDe(c.id);
            const editando = editandoId === c.id;
            const saldoTotal = enviosDelCliente.reduce((a, e) => a + numero(e.saldo), 0);
            // envios ya viene ordenado desc por fecha desde cargarDatos(), así
            // que el primero de la lista filtrada es el más reciente.
            const ultimoEnvio = enviosDelCliente[0];

            return (
              <div key={c.id} className="row-card" style={{ flexDirection: "column", alignItems: "stretch" }}>
                {editando ? (
                  <div>
                    <div className="page-title" style={{ margin: "0 0 4px" }}>
                      <h4 style={{ margin: 0 }}>Editando: {c.nombre} <span className="badge badge-info">{c.codigo || "Sin código"}</span></h4>
                    </div>
                    {camposForm}
                    <div className="segment mt-16">
                      <button className="btn btn-primary" disabled={guardando} onClick={guardar}>{guardando ? "Guardando..." : "Guardar cambios"}</button>
                      <button className="btn" onClick={cancelarEdicion}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="page-title" style={{ margin: 0 }}>
                    <div>
                      <b>{c.nombre}</b> <span className="badge badge-info">{c.codigo || "Sin código"}</span> <span className="badge badge-neutral">{c.tipo || "General"}</span>
                      <p>{c.telefono} {c.correo && `· ${c.correo}`}</p>
                      <small>
                        {enviosDelCliente.length} envío(s) · gastado ${totalGastadoDe(c.id).toFixed(2)}
                        {saldoTotal > 0 && <span style={{ color: "#c0392b" }}> · saldo ${saldoTotal.toFixed(2)}</span>}
                        {ultimoEnvio && ` · último envío ${ultimoEnvio.fecha}`}
                      </small>
                    </div>
                    <div className="segment">
                      <button className="btn" onClick={() => verDetalle(c)}>
                        <HistoryIcon size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />Ver detalle
                      </button>
                      <button className="btn" onClick={() => editar(c)}>
                        <Pencil size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />Editar
                      </button>
                      <button className="btn btn-danger" onClick={() => eliminar(c)}>Eliminar</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filtrados.length === 0 && <p>No hay clientes que coincidan.</p>}
        </div>
      </div>
    </div>
  );
}

// ---------- Ficha de detalle de un cliente ----------
// Página completa (no un panel inline) con el perfil del cliente y su
// historial completo de recibos/envíos. Trae su propio buscador porque
// un cliente frecuente puede acumular muchos envíos y desplazarse por
// todos sin filtro sería incómodo.
function ClienteDetalle({ cliente, envios, totalGastado, empresa, tarifas, editando, camposForm, guardando, rol, onVolver, onEditar, onGuardar, onCancelarEdicion, onEliminar }) {
  const [busquedaEnvio, setBusquedaEnvio] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  const estadosDisponibles = useMemo(() => [...new Set(envios.map((e) => e.estado))], [envios]);

  const enviosFiltrados = useMemo(() => {
    const q = busquedaEnvio.toLowerCase();
    return envios.filter((e) =>
      (!filtroEstado || e.estado === filtroEstado) &&
      (!q || (e.numero || "").toLowerCase().includes(q) || (e.destino || "").toLowerCase().includes(q))
    );
  }, [envios, busquedaEnvio, filtroEstado]);

  const saldoTotal = envios.reduce((a, e) => a + numero(e.saldo), 0);
  const librasTotales = envios.reduce((a, e) => a + numero(e.totalLibras), 0);
  const clienteDesde = cliente.fecha ? cliente.fecha.split(",")[0] : "—";

  const [envioParaVer, setEnvioParaVer] = useState(null);

  return (
    <div className="page">
      <button className="btn btn-ghost" onClick={onVolver} style={{ marginBottom: 8 }}>
        <ArrowLeft size={16} style={{ verticalAlign: "-2px", marginRight: 4 }} />Volver a Clientes
      </button>

      <PageTitle
        title={cliente.nombre}
        subtitle={`${cliente.codigo || "Sin código"} · ${cliente.tipo || "General"} · Cliente desde ${clienteDesde}`}
      >
        {!editando && (
          <>
            <button className="btn" onClick={onEditar}>
              <Pencil size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />Editar
            </button>
            <button className="btn btn-danger" onClick={onEliminar}>Eliminar</button>
          </>
        )}
      </PageTitle>

      {editando ? (
        <div className="card mt-16">
          <h3>Editar cliente</h3>
          {camposForm}
          <div className="segment mt-16">
            <button className="btn btn-primary" disabled={guardando} onClick={onGuardar}>{guardando ? "Guardando..." : "Guardar cambios"}</button>
            <button className="btn" onClick={onCancelarEdicion}>Cancelar</button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid-4 mt-16">
            <div className="metric"><b>Envíos totales</b><span className="metric-value">{envios.length}</span></div>
            <div className="metric">
              <b>Libras totales</b>
              <span className="metric-value">{librasTotales.toFixed(1)} lb</span>
            </div>
            <div className="metric"><b>Total gastado</b><span className="metric-value">${totalGastado.toFixed(2)}</span></div>
            <div className="metric"><b>Saldo pendiente</b><span className="metric-value" style={{ color: saldoTotal > 0 ? "var(--danger)" : undefined }}>${saldoTotal.toFixed(2)}</span></div>
          </div>

          <div className="card mt-16">
            <p><b>Teléfono:</b> {cliente.telefono || "—"}</p>
            {cliente.correo && <p><b>Correo:</b> {cliente.correo}</p>}
            {cliente.direccion && <p><b>Dirección:</b> {cliente.direccion}</p>}
            {cliente.observaciones && <p><b>Observaciones:</b> {cliente.observaciones}</p>}
          </div>

          <div className="card mt-16">
            <div className="page-title" style={{ margin: "0 0 8px" }}>
              <h3>Historial de envíos ({enviosFiltrados.length}{enviosFiltrados.length !== envios.length ? ` de ${envios.length}` : ""})</h3>
              <div className="segment">
                {estadosDisponibles.length > 1 && (
                  <select className="input input-sm" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                    <option value="">Todos los estados</option>
                    {estadosDisponibles.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                )}
                <div style={{ position: "relative" }}>
                  <Search size={14} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }} />
                  <input
                    className="input input-sm"
                    style={{ paddingLeft: 28 }}
                    placeholder="Buscar por número o destino"
                    value={busquedaEnvio}
                    onChange={(e) => setBusquedaEnvio(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="list">
              {enviosFiltrados.map((e) => (
                <div key={e.id} className="row-card">
                  <div>
                    <b>{e.numero}</b> <span className="badge badge-neutral">{e.estado}</span> <span className="badge badge-info">{e.tipoEnvio}</span>
                    <p>{e.destino} · {(e.trackings || []).length} tracking(s) · {numero(e.totalLibras).toFixed(1)} lb</p>
                    <small>{e.fecha}</small>
                  </div>
                  <div className="stack-gap-sm text-right">
                    <b>${numero(e.total).toFixed(2)}</b>
                    {numero(e.saldo) > 0 && <small style={{ color: "var(--danger)" }}>Saldo: ${numero(e.saldo).toFixed(2)}</small>}
                    <button className="btn btn-sm" onClick={() => setEnvioParaVer(e)}>
                      <FileText size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />Ver recibo
                    </button>
                  </div>
                </div>
              ))}
              {enviosFiltrados.length === 0 && envios.length > 0 && <p>Ningún envío coincide con el filtro.</p>}
              {envios.length === 0 && <p>Este cliente todavía no tiene envíos registrados.</p>}
            </div>
          </div>
        </>
      )}

      {envioParaVer && (
        <ModalRecibo envio={envioParaVer} tarifas={tarifas} empresa={empresa} onCerrar={() => setEnvioParaVer(null)} />
      )}
    </div>
  );
}