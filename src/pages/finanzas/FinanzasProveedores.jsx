// src/pages/finanzas/FinanzasProveedores.jsx
//
// Tres cosas en una pantalla:
// 1) Maestro de proveedores — solo dos tipos: "Aduana / Flete" (ligado
//    a trackings, con cuadre estimado-vs-real) y "Transporte local"
//    (varios proveedores posibles, sin tracking, sin cuadre). Clic en
//    un proveedor abre su ficha con historial completo.
// 2) Generar factura: el formulario cambia según el tipo del proveedor
//    elegido — con trackings para Aduana/Flete, sin ellos para
//    Transporte local.
// 3) Facturas pendientes/parciales/pagadas, con botón para registrar pago.
import { useEffect, useMemo, useState } from "react";
import { numero } from "../../utils/numero";
import { formatoMoneda } from "../../utils/moneda";
import {
  crearProveedor, eliminarProveedor, actualizarProveedor, generarFacturaProveedor, calcularMontoEstimado,
  registrarPagoProveedor, listarPagosDeProveedor, TIPOS_PROVEEDOR
} from "../../services/proveedoresService";
import { esListoParaRetiroProveedor, esPendienteDeConfirmar } from "../../utils/estadosEnvio";
import { confirmarAccionCritica } from "../../services/coreService";

const proveedorVacio = { nombre: "", tipo: "Aduana / Flete", contacto: "", telefono: "", correo: "", notas: "" };

export default function FinanzasProveedores({ proveedores, prealertas, facturasProveedor, cuentasDinero = [], empresa, rol, auth, mostrarToast, cargarDatos }) {
  const [form, setForm] = useState(proveedorVacio);
  const [guardandoProveedor, setGuardandoProveedor] = useState(false);
  const [proveedorParaFactura, setProveedorParaFactura] = useState("");

  // Edición inline de un proveedor ya registrado — null = nadie en
  // edición; objeto = datos del proveedor que se está editando ahora.
  const [formEdicion, setFormEdicion] = useState(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  // Filtros de la lista de facturas al final de la pantalla.
  const [filtroDestino, setFiltroDestino] = useState("");
  const [filtroEstadoFactura, setFiltroEstadoFactura] = useState("");

  // Ficha de detalle de un proveedor — null = vista normal de la
  // pantalla, con id = se reemplaza todo por ProveedorDetalle.
  const [proveedorDetalleId, setProveedorDetalleId] = useState(null);

  const proveedorPorId = useMemo(() => new Map(proveedores.map((p) => [p.id, p])), [proveedores]);

  // Un tracking deja de estar "disponible para facturar a Aduana/Flete"
  // en cuanto ya tiene una factura Pendiente o Parcial de ESE tipo
  // cubriéndolo — aunque siga en Bodega OEX (ahí se queda hasta que se
  // pague, no hasta que se facture), no hay que dejar generarle una
  // segunda factura de aduana mientras espera su pago. Esta exclusión
  // NO aplica a Transporte local: un mismo paquete puede tener varios
  // traslados locales en su vida (bodega→sucursal, luego
  // sucursal→Ometepe), cada uno con su propia factura.
  const idsYaFacturadosAduana = useMemo(() => {
    const set = new Set();
    facturasProveedor
      .filter((f) => f.estado !== "Pagada" && proveedorPorId.get(f.proveedorId)?.tipo === "Aduana / Flete")
      .forEach((f) => (f.trackings || []).forEach((t) => set.add(t.id)));
    return set;
  }, [facturasProveedor, proveedorPorId]);

  // Pool de Aduana/Flete: solo lo que Darío ya tiene disponible para
  // retirar, y que no esté ya cubierto por otra factura pendiente.
  const trackingsListosAduana = useMemo(
    () => prealertas.filter((t) => esListoParaRetiroProveedor(t.estado) && !idsYaFacturadosAduana.has(t.id)),
    [prealertas, idsYaFacturadosAduana]
  );

  // Pool de Transporte local: cualquier tracking ya confirmado (no solo
  // los que están en Bodega OEX), porque un traslado local puede pasar
  // en cualquier punto del pipeline — de bodega a sucursal, de sucursal
  // a Ometepe, etc.
  const trackingsActivos = useMemo(
    () => prealertas.filter((t) => !esPendienteDeConfirmar(t)),
    [prealertas]
  );

  const totalPorPagar = useMemo(() => facturasProveedor.reduce((a, f) => a + numero(f.saldo), 0), [facturasProveedor]);
  const diferenciaAcumulada = useMemo(() => facturasProveedor.reduce((a, f) => a + numero(f.diferencia), 0), [facturasProveedor]);


  const guardarProveedor = async () => {
    if (!form.nombre.trim()) {
      mostrarToast("Escribe el nombre del proveedor.", "warning");
      return;
    }
    setGuardandoProveedor(true);
    try {
      await crearProveedor({ form, auth });
      mostrarToast("Proveedor creado.");
      setForm(proveedorVacio);
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo crear el proveedor.", "error");
    } finally {
      setGuardandoProveedor(false);
    }
  };

  const eliminar = async (p) => {
    if (rol !== "admin") return mostrarToast("Solo un administrador puede eliminar proveedores.", "error");
    if (!confirmarAccionCritica(`Vas a eliminar al proveedor ${p.nombre}.`)) return;
    try {
      await eliminarProveedor({ proveedor: p, auth });
      mostrarToast("Proveedor eliminado.");
      if (proveedorDetalleId === p.id) setProveedorDetalleId(null);
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo eliminar.", "error");
    }
  };

  const iniciarEdicion = (p) => setFormEdicion({ id: p.id, nombre: p.nombre, tipo: p.tipo, contacto: p.contacto || "", telefono: p.telefono || "", correo: p.correo || "", notas: p.notas || "" });
  const cancelarEdicion = () => setFormEdicion(null);

  const guardarEdicion = async () => {
    if (!formEdicion.nombre.trim()) return mostrarToast("Escribe el nombre del proveedor.", "warning");
    setGuardandoEdicion(true);
    try {
      await actualizarProveedor({ proveedor: { id: formEdicion.id }, form: formEdicion, auth });
      mostrarToast("Proveedor actualizado.");
      setFormEdicion(null);
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo actualizar.", "error");
    } finally {
      setGuardandoEdicion(false);
    }
  };

  // Destinos presentes en una factura — se saca de sus trackings (una
  // factura de Transporte local puede mezclar destinos si cubrió
  // trackings de ambos; Aduana/Flete normalmente es uno solo).
  const destinosDeFactura = (f) => new Set((f.trackings || []).map((t) => t.destino));

  const facturasFiltradas = useMemo(() => {
    return facturasProveedor.filter((f) => {
      if (filtroEstadoFactura && f.estado !== filtroEstadoFactura) return false;
      if (filtroDestino && !destinosDeFactura(f).has(filtroDestino)) return false;
      return true;
    });
  }, [facturasProveedor, filtroEstadoFactura, filtroDestino]);

  // ---------- Vista de detalle de un proveedor ----------
  if (proveedorDetalleId) {
    const proveedor = proveedores.find((p) => p.id === proveedorDetalleId);
    if (!proveedor) {
      setProveedorDetalleId(null);
      return null;
    }
    return (
      <ProveedorDetalle
        proveedor={proveedor}
        facturas={facturasProveedor.filter((f) => f.proveedorId === proveedor.id)}
        cuentasDinero={cuentasDinero}
        empresa={empresa}
        auth={auth}
        mostrarToast={mostrarToast}
        cargarDatos={cargarDatos}
        onVolver={() => setProveedorDetalleId(null)}
      />
    );
  }

  // ---------- Vista normal ----------
  return (
    <div>
      <div className="grid-4">
        <div className="metric">
          <b>Total por pagar</b>
          <span className="metric-value">${totalPorPagar.toFixed(2)}</span>
          <small style={{ display: "block", marginTop: 4, opacity: .6 }}>Suma de saldos pendientes</small>
        </div>
        <div className="metric">
          <b>Diferencia acumulada</b>
          <span className="metric-value" style={{ color: diferenciaAcumulada > 0 ? "var(--danger)" : "var(--success)" }}>
            {diferenciaAcumulada > 0 ? "+" : ""}${diferenciaAcumulada.toFixed(2)}
          </span>
          <small style={{ display: "block", marginTop: 4, opacity: .6 }}>Solo aplica a Aduana/Flete — real menos estimado</small>
        </div>
        <div className="metric">
          <b>Trackings listos para retirar</b>
          <span className="metric-value">{trackingsListosAduana.length}</span>
          <small style={{ display: "block", marginTop: 4, opacity: .6 }}>En "Bodega OEX" — Darío los tiene disponibles</small>
        </div>
        <div className="metric">
          <b>Proveedores</b>
          <span className="metric-value">{proveedores.length}</span>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Nuevo proveedor</h3>
          <div className="form-grid mt-16">
            <label><span className="field-label">Nombre</span><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></label>
            <label>
              <span className="field-label">Tipo</span>
              <select className="input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                {TIPOS_PROVEEDOR.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label><span className="field-label">Contacto</span><input className="input" value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} /></label>
            <label><span className="field-label">Teléfono</span><input className="input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></label>
          </div>
          <textarea className="input" placeholder="Notas" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          <button className="btn btn-primary mt-16" disabled={guardandoProveedor} onClick={guardarProveedor}>{guardandoProveedor ? "Guardando..." : "Crear proveedor"}</button>

          <div className="list mt-16">
            {proveedores.map((p) => {
              const editandoEstePro = formEdicion?.id === p.id;
              if (editandoEstePro) {
                return (
                  <div key={p.id} className="row-card" style={{ flexDirection: "column", alignItems: "stretch" }}>
                    <h4 style={{ margin: "0 0 8px" }}>Editando: {p.nombre}</h4>
                    <div className="form-grid">
                      <label><span className="field-label">Nombre</span><input className="input" value={formEdicion.nombre} onChange={(e) => setFormEdicion({ ...formEdicion, nombre: e.target.value })} /></label>
                      <label>
                        <span className="field-label">Tipo</span>
                        <select className="input" value={formEdicion.tipo} onChange={(e) => setFormEdicion({ ...formEdicion, tipo: e.target.value })}>
                          {TIPOS_PROVEEDOR.map((t) => <option key={t}>{t}</option>)}
                        </select>
                      </label>
                      <label><span className="field-label">Contacto</span><input className="input" value={formEdicion.contacto} onChange={(e) => setFormEdicion({ ...formEdicion, contacto: e.target.value })} /></label>
                      <label><span className="field-label">Teléfono</span><input className="input" value={formEdicion.telefono} onChange={(e) => setFormEdicion({ ...formEdicion, telefono: e.target.value })} /></label>
                    </div>
                    <textarea className="input mt-8" placeholder="Notas" value={formEdicion.notas} onChange={(e) => setFormEdicion({ ...formEdicion, notas: e.target.value })} />
                    <div className="segment mt-8">
                      <button className="btn btn-primary" disabled={guardandoEdicion} onClick={guardarEdicion}>{guardandoEdicion ? "Guardando..." : "Guardar cambios"}</button>
                      <button className="btn" onClick={cancelarEdicion}>Cancelar</button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={p.id} className="row-card" style={{ cursor: "pointer" }} onClick={() => setProveedorDetalleId(p.id)}>
                  <div>
                    <b>{p.nombre}</b> <span className="badge badge-neutral">{p.tipo}</span>
                    <p>{p.contacto} {p.telefono && `· ${p.telefono}`}</p>
                    <small>Clic para ver historial completo</small>
                  </div>
                  <div className="segment">
                    <button className="btn" onClick={(e) => { e.stopPropagation(); iniciarEdicion(p); }}>Editar</button>
                    <button className="btn btn-danger" onClick={(e) => { e.stopPropagation(); eliminar(p); }}>Eliminar</button>
                  </div>
                </div>
              );
            })}
            {proveedores.length === 0 && <p>Sin proveedores todavía.</p>}
          </div>
        </div>

        <GenerarFactura
          proveedores={proveedores}
          trackingsListosAduana={trackingsListosAduana}
          trackingsActivos={trackingsActivos}
          proveedorParaFactura={proveedorParaFactura}
          setProveedorParaFactura={setProveedorParaFactura}
          auth={auth}
          mostrarToast={mostrarToast}
          cargarDatos={cargarDatos}
        />
      </div>

      <div className="card">
        <div className="page-title" style={{ margin: "0 0 8px" }}>
          <h3>Facturas de proveedor ({facturasFiltradas.length}{facturasFiltradas.length !== facturasProveedor.length ? ` de ${facturasProveedor.length}` : ""})</h3>
          <div className="segment">
            <select className="input input-sm" value={filtroDestino} onChange={(e) => setFiltroDestino(e.target.value)}>
              <option value="">Todos los destinos</option>
              <option value="Ometepe">Ometepe</option>
              <option value="Managua">Managua</option>
            </select>
            <select className="input input-sm" value={filtroEstadoFactura} onChange={(e) => setFiltroEstadoFactura(e.target.value)}>
              <option value="">Todos los estados</option>
              <option value="Pendiente">Pendiente</option>
              <option value="Parcial">Parcial</option>
              <option value="Pagada">Pagada</option>
            </select>
            {(filtroDestino || filtroEstadoFactura) && (
              <button className="btn btn-ghost" onClick={() => { setFiltroDestino(""); setFiltroEstadoFactura(""); }}>Limpiar filtros</button>
            )}
          </div>
        </div>
        <div className="list mt-16">
          {facturasFiltradas.map((f) => (
            <FacturaRow key={f.id} factura={f} proveedores={proveedores} cuentasDinero={cuentasDinero} empresa={empresa} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} />
          ))}
          {facturasFiltradas.length === 0 && <p>Sin facturas que coincidan con estos filtros.</p>}
        </div>
      </div>
    </div>
  );
}

// ---------- Ficha de detalle de un proveedor ----------
function ProveedorDetalle({ proveedor, facturas, cuentasDinero = [], empresa, auth, mostrarToast, cargarDatos, onVolver }) {
  const [pagos, setPagos] = useState([]);
  const [cargandoPagos, setCargandoPagos] = useState(true);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(() => ({ nombre: proveedor.nombre, tipo: proveedor.tipo, contacto: proveedor.contacto || "", telefono: proveedor.telefono || "", correo: proveedor.correo || "", notas: proveedor.notas || "" }));
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setCargandoPagos(true);
    listarPagosDeProveedor(proveedor.id)
      .then(setPagos)
      .catch(() => setPagos([]))
      .finally(() => setCargandoPagos(false));
  }, [proveedor.id]);

  const totalFacturado = facturas.reduce((a, f) => a + numero(f.montoReal), 0);
  const totalPagado = facturas.reduce((a, f) => a + numero(f.abonado), 0);
  const saldoPendiente = facturas.reduce((a, f) => a + numero(f.saldo), 0);

  const facturaPorId = new Map(facturas.map((f) => [f.id, f]));

  const guardarEdicion = async () => {
    if (!form.nombre.trim()) return mostrarToast("Escribe el nombre del proveedor.", "warning");
    setGuardando(true);
    try {
      await actualizarProveedor({ proveedor, form, auth });
      mostrarToast("Proveedor actualizado.");
      setEditando(false);
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo actualizar.", "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <button className="btn btn-ghost" onClick={onVolver} style={{ marginBottom: 8 }}>← Volver a proveedores</button>

      {editando ? (
        <div className="card">
          <h3>Editar proveedor</h3>
          <div className="form-grid mt-16">
            <label><span className="field-label">Nombre</span><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></label>
            <label>
              <span className="field-label">Tipo</span>
              <select className="input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                {TIPOS_PROVEEDOR.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label><span className="field-label">Contacto</span><input className="input" value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} /></label>
            <label><span className="field-label">Teléfono</span><input className="input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></label>
          </div>
          <textarea className="input mt-8" placeholder="Notas" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          <div className="segment mt-16">
            <button className="btn btn-primary" disabled={guardando} onClick={guardarEdicion}>{guardando ? "Guardando..." : "Guardar cambios"}</button>
            <button className="btn" onClick={() => setEditando(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="page-title" style={{ margin: 0 }}>
          <div>
            <h3 style={{ margin: 0 }}>{proveedor.nombre}</h3>
            <p><span className="badge badge-neutral">{proveedor.tipo}</span> {proveedor.contacto} {proveedor.telefono && `· ${proveedor.telefono}`}</p>
            {proveedor.notas && <small>{proveedor.notas}</small>}
          </div>
          <button className="btn" onClick={() => setEditando(true)}>Editar</button>
        </div>
      )}

      <div className="grid-4 mt-16">
        <div className="metric"><b>Facturas</b><span className="metric-value">{facturas.length}</span></div>
        <div className="metric"><b>Total facturado</b><span className="metric-value">${totalFacturado.toFixed(2)}</span></div>
        <div className="metric"><b>Total pagado</b><span className="metric-value">${totalPagado.toFixed(2)}</span></div>
        <div className="metric"><b>Saldo pendiente</b><span className="metric-value" style={{ color: saldoPendiente > 0 ? "var(--danger)" : undefined }}>${saldoPendiente.toFixed(2)}</span></div>
      </div>

      <div className="card mt-16">
        <h3>Facturas ({facturas.length})</h3>
        <div className="list mt-16">
          {facturas.map((f) => (
            <FacturaRow key={f.id} factura={f} proveedores={[proveedor]} cuentasDinero={cuentasDinero} empresa={empresa} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} />
          ))}
          {facturas.length === 0 && <p>Sin facturas todavía.</p>}
        </div>
      </div>

      <div className="card mt-16">
        <h3>Historial de pagos</h3>
        {cargandoPagos && <p className="mt-8">Cargando...</p>}
        <div className="list mt-16">
          {!cargandoPagos && pagos.map((pago) => (
            <div key={pago.id} className="row-card">
              <div>
                <b>${numero(pago.monto).toFixed(2)}</b> <span className="badge badge-neutral">{pago.metodo}</span>
                <p>Factura {facturaPorId.get(pago.factura_id)?.numeroFactura || `#${pago.factura_id}`}{pago.referencia ? ` · Ref: ${pago.referencia}` : ""}</p>
                <small>{new Date(pago.fecha).toLocaleString("es-NI")} · {pago.created_by_name || "—"}</small>
              </div>
            </div>
          ))}
          {!cargandoPagos && pagos.length === 0 && <p>Sin pagos registrados todavía.</p>}
        </div>
      </div>
    </div>
  );
}

function GenerarFactura({ proveedores, trackingsListosAduana, trackingsActivos, proveedorParaFactura, setProveedorParaFactura, auth, mostrarToast, cargarDatos }) {
  const [seleccionados, setSeleccionados] = useState(() => new Set());
  const [montoReal, setMontoReal] = useState("");
  const [numeroFactura, setNumeroFactura] = useState("");
  const [nota, setNota] = useState("");
  const [link, setLink] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [busquedaTracking, setBusquedaTracking] = useState("");
  const [generando, setGenerando] = useState(false);

  const proveedorSeleccionado = proveedores.find((p) => String(p.id) === String(proveedorParaFactura));
  const esAduana = proveedorSeleccionado?.tipo === "Aduana / Flete";

  // Aduana/Flete: solo lo que Darío tiene disponible en Bodega OEX.
  // Transporte local: cualquier tracking activo — un mismo paquete
  // puede tener varios traslados locales en su vida, así que no se
  // restringe por estado ni por si ya está en otra factura.
  const poolBase = esAduana ? trackingsListosAduana : trackingsActivos;
  const poolFiltrado = useMemo(() => {
    if (esAduana || !busquedaTracking.trim()) return poolBase;
    const q = busquedaTracking.toLowerCase();
    return poolBase.filter((t) =>
      (t.tracking || "").toLowerCase().includes(q) ||
      (t.almacenId || "").toLowerCase().includes(q) ||
      (t.cliente || "").toLowerCase().includes(q) ||
      (t.destino || "").toLowerCase().includes(q)
    );
  }, [poolBase, busquedaTracking, esAduana]);

  const toggle = (id) => setSeleccionados((prev) => {
    const nuevo = new Set(prev);
    if (nuevo.has(id)) nuevo.delete(id); else nuevo.add(id);
    return nuevo;
  });

  const trackingsIncluidos = poolBase.filter((t) => seleccionados.has(t.id));
  const montoEstimado = esAduana ? calcularMontoEstimado(trackingsIncluidos) : numero(montoReal);
  const diferencia = numero(montoReal) - montoEstimado;

  const limpiar = () => {
    setSeleccionados(new Set());
    setMontoReal("");
    setNumeroFactura("");
    setNota("");
    setLink("");
    setFecha(new Date().toISOString().slice(0, 10));
    setBusquedaTracking("");
  };

  const generar = async () => {
    if (!proveedorSeleccionado) {
      mostrarToast("Selecciona un proveedor.", "warning");
      return;
    }
    if (esAduana && trackingsIncluidos.length === 0) {
      mostrarToast("Selecciona al menos un tracking.", "warning");
      return;
    }
    setGenerando(true);
    try {
      await generarFacturaProveedor({
        proveedor: proveedorSeleccionado,
        trackings: trackingsIncluidos,
        montoReal, numeroFactura, nota, link, fecha, auth
      });
      mostrarToast(
        esAduana
          ? `Factura generada — diferencia ${diferencia >= 0 ? "+" : ""}$${diferencia.toFixed(2)} vs. estimado.`
          : `Factura generada${trackingsIncluidos.length > 0 ? ` — ${trackingsIncluidos.length} tracking(s) ligado(s)` : ""}.`
      );
      limpiar();
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo generar la factura.", "error");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="card">
      <h3>Generar factura</h3>
      <p>Elige el proveedor. Con Aduana/Flete es obligatorio elegir trackings (para el cuadre); con Transporte local es opcional (solo para saber qué cubrió el traslado).</p>
      {proveedores.length === 0 && <p className="mt-8" style={{ color: "var(--warning)" }}>No hay proveedores creados todavía.</p>}

      <label className="mt-16">
        <span className="field-label">Proveedor</span>
        <select className="input" value={proveedorParaFactura} onChange={(e) => { setProveedorParaFactura(e.target.value); setSeleccionados(new Set()); setBusquedaTracking(""); }}>
          <option value="">Selecciona un proveedor…</option>
          {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.tipo})</option>)}
        </select>
      </label>

      {proveedorSeleccionado && (
        <>
          <div className="page-title mt-16" style={{ margin: "0 0 4px" }}>
            <span className="field-label" style={{ margin: 0 }}>
              Trackings {esAduana ? "(obligatorio elegir al menos 1)" : "(opcional)"}
            </span>
            {!esAduana && (
              <input
                className="input input-sm"
                placeholder="Buscar cliente, tracking o destino"
                value={busquedaTracking}
                onChange={(e) => setBusquedaTracking(e.target.value)}
              />
            )}
          </div>
          <div className="mini-tracking-list">
            {poolFiltrado.map((t) => (
              <label key={t.id} className="mini-tracking-row" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={seleccionados.has(t.id)} onChange={() => toggle(t.id)} />
                <b>{t.tracking || t.almacenId || "Sin código"}</b>
                <span className="badge badge-neutral">{t.tipoEnvio}</span>
                <span>{t.cliente} · {t.destino}</span>
                <span className="badge badge-info">{t.estado}</span>
                <span>{numero(t.peso).toFixed(2)} lb</span>
              </label>
            ))}
            {poolFiltrado.length === 0 && (
              <p>{esAduana ? "No hay trackings en \"Bodega OEX\" ahora mismo." : "Ningún tracking coincide con la búsqueda."}</p>
            )}
          </div>
        </>
      )}

      <div className="form-grid mt-16">
        <label><span className="field-label">N° de factura del proveedor</span><input className="input" value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} /></label>
        <label><span className="field-label">Monto real facturado ($)</span><input className="input" type="number" value={montoReal} onChange={(e) => setMontoReal(e.target.value)} /></label>
        <label><span className="field-label">Fecha de la factura</span><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} max={new Date().toISOString().slice(0, 10)} /></label>
      </div>
      <label className="mt-8">
        <span className="field-label">Link a la factura (opcional — foto, PDF, Drive...)</span>
        <input className="input" type="url" placeholder="https://..." value={link} onChange={(e) => setLink(e.target.value)} />
      </label>
      <textarea className="input mt-8" placeholder="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />

      {esAduana && (
        <div className="grid-4 mt-16">
          <div className="metric"><b>Trackings</b><span className="metric-value">{trackingsIncluidos.length}</span></div>
          <div className="metric"><b>Estimado</b><span className="metric-value">${montoEstimado.toFixed(2)}</span></div>
          <div className="metric">
            <b>Diferencia</b>
            <span className="metric-value" style={{ color: diferencia > 0 ? "var(--danger)" : "var(--success)" }}>
              {montoReal ? `${diferencia >= 0 ? "+" : ""}$${diferencia.toFixed(2)}` : "—"}
            </span>
          </div>
        </div>
      )}
      {!esAduana && trackingsIncluidos.length > 0 && (
        <div className="info-box mt-16">{trackingsIncluidos.length} tracking(s) ligado(s) a esta factura — solo trazabilidad, sin cuadre.</div>
      )}

      <button className="btn btn-primary mt-16" disabled={generando} onClick={generar}>{generando ? "Generando..." : "Generar factura"}</button>
    </div>
  );
}

function FacturaRow({ factura, proveedores, cuentasDinero = [], empresa, auth, mostrarToast, cargarDatos }) {
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("Transferencia");
  const [referencia, setReferencia] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [cuentaDineroId, setCuentaDineroId] = useState("");
  const [guardando, setGuardando] = useState(false);

  const proveedor = proveedores.find((p) => p.id === factura.proveedorId);
  const tieneTrackings = (factura.trackings || []).length > 0;

  // Transferencia → cuentas tipo "banco"; Efectivo → cuentas tipo
  // "efectivo" — mismo criterio que FormularioSaldarEnvio.jsx. Es la
  // ÚNICA fuente de "de dónde sale el pago" (antes existía también una
  // lista de texto libre en Configuración, sin saldo real; se unificaron).
  const cuentasDelMetodo = cuentasDinero.filter(
    (c) => c.activa !== false && c.tipo === (metodo === "Transferencia" ? "banco" : "efectivo")
  );
  const cuentaDineroSeleccionada = cuentasDelMetodo.find((c) => String(c.id) === String(cuentaDineroId)) || null;

  const cambiarMetodo = (nuevo) => {
    setMetodo(nuevo);
    setCuentaDineroId("");
  };

  const pagar = async () => {
    if (!cuentaDineroSeleccionada) {
      mostrarToast("Selecciona de cuál cuenta sale el pago.", "warning");
      return;
    }
    setGuardando(true);
    try {
      await registrarPagoProveedor({
        factura, proveedor, monto, metodo,
        cuentaDinero: cuentaDineroSeleccionada,
        referencia, fecha, auth
      });
      mostrarToast("Pago registrado.");
      setMonto(""); setReferencia(""); setCuentaDineroId(""); setAbierto(false);
      setFecha(new Date().toISOString().slice(0, 10));
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo registrar el pago.", "error");
    } finally {
      setGuardando(false);
    }
  };

  const badgeEstado = factura.estado === "Pagada" ? "badge-success" : factura.estado === "Parcial" ? "badge-warning" : "badge-neutral";

  return (
    <div className="row-card" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div className="page-title" style={{ margin: 0 }}>
        <div>
          <b>{proveedor?.nombre || "Proveedor"}</b> <span className={`badge ${badgeEstado}`}>{factura.estado}</span>
          {factura.numeroFactura && <span className="badge badge-neutral"> {factura.numeroFactura}</span>}
          {factura.link && (
            <a href={factura.link} target="_blank" rel="noreferrer" className="badge badge-info" style={{ textDecoration: "none" }}>
              Ver factura ↗
            </a>
          )}
          <p>
            {tieneTrackings
              ? <>{factura.trackings.length} tracking(s) · real ${factura.montoReal.toFixed(2)} · estimado ${factura.montoEstimado.toFixed(2)}</>
              : <>Real ${factura.montoReal.toFixed(2)} · sin tracking asociado</>}
          </p>
          <small>
            {tieneTrackings && (
              <>Diferencia: <span style={{ color: factura.diferencia > 0 ? "var(--danger)" : "var(--success)" }}>{factura.diferencia >= 0 ? "+" : ""}${factura.diferencia.toFixed(2)}</span> · </>
            )}
            {factura.fecha}
          </small>
          {factura.nota && <p><small>{factura.nota}</small></p>}
        </div>
        <div className="stack-gap-sm text-right">
          <b>${factura.saldo.toFixed(2)}</b>
          <small>saldo pendiente</small>
        </div>
      </div>

      {factura.saldo > 0 && (
        <div className="segment mt-8">
          <button className="btn" onClick={() => setAbierto((v) => !v)}>{abierto ? "Cancelar" : "Registrar pago"}</button>
        </div>
      )}

      {abierto && (
        <div className="form-grid mt-8" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <label><span className="field-label">Monto ($)</span><input className="input" type="number" value={monto} onChange={(e) => setMonto(e.target.value)} /></label>
          <label>
            <span className="field-label">Método</span>
            <select className="input" value={metodo} onChange={(e) => cambiarMetodo(e.target.value)}>
              <option value="Transferencia">Transferencia</option>
              <option value="Efectivo">Efectivo</option>
            </select>
          </label>
          <label><span className="field-label">Fecha del pago</span><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} max={new Date().toISOString().slice(0, 10)} /></label>
          <label><span className="field-label">Referencia (opcional)</span><input className="input" value={referencia} onChange={(e) => setReferencia(e.target.value)} /></label>

          {cuentasDelMetodo.length > 0 ? (
            <label>
              <span className="field-label">¿De cuál cuenta sale el pago?</span>
              <select className="input" value={cuentaDineroId} onChange={(e) => setCuentaDineroId(e.target.value)}>
                <option value="">Selecciona una cuenta…</option>
                {cuentasDelMetodo.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre} (saldo {formatoMoneda(c.saldoActual ?? c.saldo_actual, c.moneda)})</option>
                ))}
              </select>
            </label>
          ) : (
            <p style={{ color: "var(--danger)", gridColumn: "1 / -1" }}>
              No tienes cuentas de dinero tipo "{metodo === "Transferencia" ? "banco" : "efectivo"}" — créala en Finanzas → Cuentas antes de continuar.
            </p>
          )}
          {cuentaDineroSeleccionada && (() => {
            const tasaCambio = numero(empresa?.tipoCambio) || 0;
            const saldoCuenta = numero(cuentaDineroSeleccionada.saldoActual ?? cuentaDineroSeleccionada.saldo_actual);
            // El monto de la factura siempre está en dólares — si la
            // cuenta es en córdobas, hay que convertir el saldo a
            // dólares antes de comparar (comparar números crudos entre
            // monedas distintas daría un resultado falso).
            const saldoEnUSD = cuentaDineroSeleccionada.moneda === "NIO"
              ? (tasaCambio > 0 ? saldoCuenta / tasaCambio : null)
              : saldoCuenta;
            if (saldoEnUSD === null) {
              return (
                <p style={{ color: "var(--danger)", gridColumn: "1 / -1" }}>
                  Configura la tasa de cambio en Configuración para poder comparar el saldo de esta cuenta en córdobas contra el monto en dólares.
                </p>
              );
            }
            if (numero(monto) <= saldoEnUSD) return null;
            return (
              <p style={{ color: "var(--danger)", gridColumn: "1 / -1" }}>
                Ojo: "{cuentaDineroSeleccionada.nombre}" tiene {formatoMoneda(saldoCuenta, cuentaDineroSeleccionada.moneda)}
                {cuentaDineroSeleccionada.moneda === "NIO" && ` (≈ $${saldoEnUSD.toFixed(2)})`} — menos que el monto que vas a pagar.
              </p>
            );
          })()}

          <button className="btn btn-primary" disabled={guardando || !cuentaDineroSeleccionada} onClick={pagar} style={{ alignSelf: "end" }}>
            {guardando ? "Guardando..." : `Confirmar pago de $${numero(monto).toFixed(2)}`}
          </button>
        </div>
      )}
    </div>
  );
}