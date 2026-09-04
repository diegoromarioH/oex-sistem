// src/pages/paqueteria/TrackingsActivos.jsx
//
// Trackings ya confirmados (nacidos a mano, o confirmados desde
// Prealertas), avanzando por el pipeline real. Aquí es donde se les va
// cambiando el estado y registrando el peso, hasta que quedan listos para
// juntarse en un recibo.
import { useMemo, useState } from "react";
import { Layers, CheckCircle2, XCircle, HelpCircle, Package, Weight } from "lucide-react";
import { actualizarTracking, eliminarTracking } from "../../services/trackingsService";
import { estadosPorDestino, badgeEstado, esListoParaRetirar, esPendienteDeConfirmar, esListoParaRetiroProveedor } from "../../utils/estadosEnvio";
import { numero } from "../../utils/numero";
import { parseListaPesos, emparejarConTrackings } from "../../utils/parseListaPesos";
import PipelineProgress from "../../components/PipelineProgress";
import ModalRegistrarPeso from "../../components/ModalRegistrarPeso";

export default function TrackingsActivos({ prealertas, facturasProveedor = [], auditLog = [], rol, auth, mostrarToast, cargarDatos }) {
  const [busqueda, setBusqueda] = useState("");
  // Tracking pendiente de que le registren el peso antes de continuar el
  // cambio de estado — null = ningún modal abierto.
  const [pendientePeso, setPendientePeso] = useState(null);
  const [guardandoPeso, setGuardandoPeso] = useState(false);

  const activos = useMemo(() => {
    const q = busqueda.toLowerCase();
    const coincide = (t) =>
      !q ||
      (t.cliente || "").toLowerCase().includes(q) ||
      (t.clienteCodigo || "").toLowerCase().includes(q) ||
      (t.tracking || "").toLowerCase().includes(q) ||
      (t.almacenId || "").toLowerCase().includes(q);
    return prealertas.filter((t) => !esPendienteDeConfirmar(t)).filter(coincide);
  }, [prealertas, busqueda]);

  const actualizarCampo = async (t, campo, valor) => {
    try {
      await actualizarTracking({ tracking: t, field: campo, value: valor, auth });
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo actualizar.", "error");
    }
  };

  // Aplica de verdad el cambio de estado, ya con el peso resuelto (si
  // hacía falta). Separado de cambiarEstado() para poder llamarlo tanto
  // directo (cuando no hace falta pedir peso) como después de confirmar
  // el modal.
  const aplicarCambioEstado = async (t, nuevoEstado) => {
    if (esListoParaRetirar(nuevoEstado) && numero(t.peso) <= 0) {
      mostrarToast("Este tracking no tiene peso registrado. Ponle el peso antes de marcarlo como listo para retirar.", "warning");
      return;
    }

    const pipeline = estadosPorDestino(t.destino);
    const idxActual = pipeline.indexOf(t.estado);
    const idxNuevo = pipeline.indexOf(nuevoEstado);

    // No se puede avanzar más allá de Bodega OEX (Darío Import ya lo tiene
    // disponible) hasta que la factura de ese tracking esté TOTALMENTE
    // pagada — evita retirar/mover paquetes que todavía se deben.
    if (esListoParaRetiroProveedor(t.estado) && idxNuevo > idxActual) {
      const pagado = facturasProveedor.some(
        (f) => f.estado === "Pagada" && (f.trackings || []).some((tk) => tk.id === t.id)
      );
      if (!pagado) {
        mostrarToast("Este tracking está en Bodega OEX y su factura al proveedor todavía no está pagada. Págala en Finanzas → Proveedores antes de avanzarlo.", "warning");
        return;
      }
    }

    if (idxActual !== -1 && idxNuevo !== -1 && idxNuevo < idxActual) {
      const confirmar = window.confirm(
        `Vas a RETROCEDER el estado de "${t.estado}" a "${nuevoEstado}".\n\n¿Seguro que quieres hacer esto?`
      );
      if (!confirmar) return;
    }
    await actualizarCampo(t, "estado", nuevoEstado);
  };

  // Punto de entrada desde el selector de estado. Si va hacia "Bodega
  // OEX" y todavía no tiene peso, no se aplica el cambio directo — se
  // abre el modal para pedirlo ahí mismo (más natural que dejar un input
  // suelto en la fila esperando que alguien se acuerde de llenarlo).
  const cambiarEstado = async (t, nuevoEstado) => {
    if (nuevoEstado === "Bodega OEX" && numero(t.peso) <= 0) {
      setPendientePeso({ tracking: t, nuevoEstado });
      return;
    }
    await aplicarCambioEstado(t, nuevoEstado);
  };

  const confirmarPesoYContinuar = async (pesoTexto) => {
    if (!pendientePeso) return;
    setGuardandoPeso(true);
    try {
      const { tracking: t, nuevoEstado } = pendientePeso;
      await actualizarTracking({ tracking: t, field: "peso", value: pesoTexto, auth });
      await aplicarCambioEstado({ ...t, peso: numero(pesoTexto) }, nuevoEstado);
      setPendientePeso(null);
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo guardar el peso.", "error");
    } finally {
      setGuardandoPeso(false);
    }
  };

  // ===== Modo lote: pegar la lista del proveedor (No. Guía + Peso) =====
  const [loteAbierto, setLoteAbierto] = useState(false);
  const [textoLote, setTextoLote] = useState("");
  const [resultadoLote, setResultadoLote] = useState(null); // { reconocidas, noReconocidas } emparejadas
  const [seleccionLote, setSeleccionLote] = useState(() => new Set());
  const [aplicandoLote, setAplicandoLote] = useState(false);

  const analizarLote = () => {
    const { reconocidas, noReconocidas } = parseListaPesos(textoLote);
    const emparejadas = emparejarConTrackings(reconocidas, activos);
    setResultadoLote({ emparejadas, noReconocidas });
    // Preseleccionadas por defecto solo las que sí encontraron tracking —
    // las sin match no tienen nada que aplicar todavía.
    setSeleccionLote(new Set(emparejadas.filter((e) => e.tracking).map((e) => e.tracking.id)));
  };

  const limpiarLote = () => {
    setTextoLote("");
    setResultadoLote(null);
    setSeleccionLote(new Set());
  };

  const toggleSeleccionLote = (trackingId) => setSeleccionLote((prev) => {
    const nuevo = new Set(prev);
    if (nuevo.has(trackingId)) nuevo.delete(trackingId); else nuevo.add(trackingId);
    return nuevo;
  });

  const aplicarLote = async () => {
    if (!resultadoLote) return;
    const porAplicar = resultadoLote.emparejadas.filter((e) => e.tracking && seleccionLote.has(e.tracking.id));
    if (porAplicar.length === 0) {
      mostrarToast("No hay nada seleccionado para aplicar.", "warning");
      return;
    }
    setAplicandoLote(true);
    let exitosos = 0;
    try {
      for (const item of porAplicar) {
        try {
          await actualizarTracking({ tracking: item.tracking, field: "peso", value: String(item.peso), auth });
          await aplicarCambioEstado({ ...item.tracking, peso: item.peso }, "Bodega OEX");
          exitosos++;
        } catch (err) {
          console.log(`No se pudo aplicar ${item.identificador}:`, err);
        }
      }
      mostrarToast(`${exitosos} de ${porAplicar.length} tracking(s) actualizados a Bodega OEX.`);
      limpiarLote();
      setLoteAbierto(false);
      cargarDatos();
    } finally {
      setAplicandoLote(false);
    }
  };

  // El peso solo pide confirmación cuando ya HABÍA un valor guardado
  // (evita alertas molestas la primera vez que se pesa). Compara el valor
  // NUMÉRICO, no el texto — así "5" y "5.0" no cuentan como un cambio real.
  const manejarBlurPeso = (t, e) => {
    const textoNuevo = e.target.value;
    const nuevo = numero(textoNuevo);
    const anterior = numero(t.peso);
    if (nuevo === anterior) return;

    if (anterior > 0) {
      const confirmar = window.confirm(
        `Este tracking ya tenía un peso guardado: ${anterior} lb.\n\n¿Seguro que quieres cambiarlo a ${nuevo} lb?`
      );
      if (!confirmar) {
        e.target.value = String(anterior);
        return;
      }
    }
    actualizarCampo(t, "peso", textoNuevo);
  };

  const eliminar = async (t) => {
    if (rol !== "admin") return mostrarToast("Solo un administrador puede eliminar trackings.", "error");
    try {
      await eliminarTracking({ tracking: t, auth });
      mostrarToast("Tracking eliminado.");
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo eliminar.", "error");
    }
  };

  return (
    <div className="card">
      <div className="page-title" style={{ margin: "0 0 8px" }}>
        <h3>Envíos activos ({activos.length})</h3>
        <div className="segment">
          <button className="btn" onClick={() => setLoteAbierto((v) => !v)}>
            <Layers size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />
            {loteAbierto ? "Ocultar carga por lote" : "Cargar lote de Bodega OEX"}
          </button>
          <input className="input input-sm" placeholder="Buscar cliente, tracking, código o ID almacén" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
      </div>
      <p><small>Trackings ya confirmados, avanzando de estado. Cuando lleguen a un punto de retiro, se juntan en un recibo desde el Directorio de Clientes.</small></p>

      {loteAbierto && (
        <div className="card" style={{ background: "var(--surface-2, #f7f8fa)", marginBottom: 16 }}>
          <h4 style={{ margin: "0 0 4px" }}>Pegar lista del proveedor</h4>
          <p><small>Pega tal cual la lista que te manda el proveedor (ID de almacén + peso) — el sistema ignora encabezados, subtotales y descripciones solo.</small></p>
          <textarea
            className="input"
            style={{ minHeight: 140, fontFamily: "monospace", fontSize: "0.85rem" }}
            placeholder={"Ej.\nAÉREO\n208118\t1.10\n208655\t1.95\nMARÍTIMO\n191038\tRopa y accesorios\t0.65\n..."}
            value={textoLote}
            onChange={(e) => setTextoLote(e.target.value)}
          />
          <div className="segment mt-8">
            <button className="btn btn-primary" disabled={!textoLote.trim()} onClick={analizarLote}>Analizar lista</button>
            {resultadoLote && <button className="btn btn-ghost" onClick={limpiarLote}>Limpiar</button>}
          </div>

          {resultadoLote && (
            <div className="mt-16">
              <div className="grid-4">
                <div className="metric">
                  <b>Con match</b>
                  <span className="metric-value" style={{ color: "var(--success)" }}>
                    {resultadoLote.emparejadas.filter((e) => e.tracking).length}
                  </span>
                </div>
                <div className="metric">
                  <b>Sin match</b>
                  <span className="metric-value" style={{ color: "var(--warning, #b7791f)" }}>
                    {resultadoLote.emparejadas.filter((e) => !e.tracking).length}
                  </span>
                </div>
                <div className="metric">
                  <b>Líneas no reconocidas</b>
                  <span className="metric-value" style={{ color: resultadoLote.noReconocidas.length > 0 ? "var(--danger)" : undefined }}>
                    {resultadoLote.noReconocidas.length}
                  </span>
                </div>
                <div className="metric">
                  <b>Seleccionados para aplicar</b>
                  <span className="metric-value">{seleccionLote.size}</span>
                </div>
              </div>

              <div className="list mt-16">
                {resultadoLote.emparejadas.map((item, i) => (
                  <label
                    key={i}
                    className="row-card"
                    style={{ cursor: item.tracking ? "pointer" : "default", opacity: item.tracking ? 1 : 0.6 }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {item.tracking
                        ? <CheckCircle2 size={18} style={{ color: "var(--success)", flexShrink: 0 }} />
                        : <XCircle size={18} style={{ color: "var(--warning, #b7791f)", flexShrink: 0 }} />}
                      <input
                        type="checkbox"
                        style={{ display: item.tracking ? "inline" : "none" }}
                        checked={item.tracking ? seleccionLote.has(item.tracking.id) : false}
                        onChange={() => item.tracking && toggleSeleccionLote(item.tracking.id)}
                      />
                      <div>
                        <b>{item.identificador}</b> → {item.peso.toFixed(2)} lb
                        {item.tipoEnvioDetectado && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>{item.tipoEnvioDetectado}</span>}
                        <p style={{ margin: 0 }}>
                          {item.tracking
                            ? <small>{item.tracking.cliente} · {item.tracking.tracking || item.tracking.almacenId} · estado actual: {item.tracking.estado}</small>
                            : <small style={{ color: "var(--warning, #b7791f)" }}>Sin coincidencia — ningún tracking activo tiene este ID de almacén ni tracking</small>}
                        </p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              {resultadoLote.noReconocidas.length > 0 && (
                <div className="mt-16">
                  <p style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <HelpCircle size={16} style={{ color: "var(--danger)" }} /> <b>Líneas que no se pudieron leer</b>
                  </p>
                  <div className="list">
                    {resultadoLote.noReconocidas.map((n, i) => (
                      <div key={i} className="row-card"><code style={{ fontSize: "0.8rem" }}>{n.lineaOriginal}</code></div>
                    ))}
                  </div>
                </div>
              )}

              <button className="btn btn-primary mt-16" disabled={aplicandoLote || seleccionLote.size === 0} onClick={aplicarLote}>
                {aplicandoLote ? "Aplicando..." : `Aplicar a ${seleccionLote.size} tracking(s) → Bodega OEX`}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="list mt-8">
        {activos.map((t) => (
          <FilaTrackingActivo
            key={t.id}
            t={t}
            auditLog={auditLog}
            facturasProveedor={facturasProveedor}
            cambiarEstado={cambiarEstado}
            actualizarCampo={actualizarCampo}
            manejarBlurPeso={manejarBlurPeso}
            eliminar={eliminar}
          />
        ))}
        {activos.length === 0 && <p>Sin envíos activos por ahora.</p>}
      </div>

      {pendientePeso && (
        <ModalRegistrarPeso
          tracking={pendientePeso.tracking}
          nuevoEstado={pendientePeso.nuevoEstado}
          guardando={guardandoPeso}
          onConfirmar={confirmarPesoYContinuar}
          onCancelar={() => setPendientePeso(null)}
        />
      )}
    </div>
  );
}

// ---------- Fila compacta, colapsada por defecto ----------
// Con volumen alto, mostrar la línea de tiempo completa de cada tracking
// a la vez satura la pantalla. Por defecto se ve solo lo esencial en una
// línea; al hacer clic se despliega el pipeline y los controles de
// edición — el mismo patrón que ya usan Clientes y Proveedores.
function FilaTrackingActivo({ t, auditLog, facturasProveedor, cambiarEstado, actualizarCampo, manejarBlurPeso, eliminar }) {
  const [expandido, setExpandido] = useState(false);

  const esperandoPago = esListoParaRetiroProveedor(t.estado) &&
    !facturasProveedor.some((f) => f.estado === "Pagada" && (f.trackings || []).some((tk) => tk.id === t.id));

  return (
    <div className="row-card" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <button
        type="button"
        className="page-title"
        style={{ margin: 0, width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}
        onClick={() => setExpandido((v) => !v)}
      >
        <div>
          <b>{t.tracking || t.almacenId || "Sin código"}</b> <span className="badge badge-neutral">{t.tipoEnvio}</span>{" "}
          <span className={`badge ${badgeEstado(t.estado)}`}>{t.estado}</span>{" "}
          {esListoParaRetirar(t.estado) && <span className="badge badge-success">Listo para recibo</span>}
          {esperandoPago && <span className="badge badge-warning">Falta pago proveedor</span>}
          <p style={{ margin: "2px 0 0" }}>
            {t.cliente} · {t.clienteCodigo || "Sin registrar"} · {t.destino}
            {numero(t.peso) > 0 && ` · ${numero(t.peso).toFixed(1)} lb`}
          </p>
        </div>
        <div className="stack-gap-sm text-right">
          <small style={{ opacity: 0.6 }}>{expandido ? "Ocultar ▲" : "Ver detalle ▼"}</small>
        </div>
      </button>

      {expandido && (
        <div className="mt-8" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          <div className="page-title" style={{ margin: "0 0 4px" }}>
            <small style={{ opacity: 0.6 }}>{t.fecha}</small>
            <button className="btn btn-danger" onClick={() => eliminar(t)}>Eliminar</button>
          </div>

          <PipelineProgress estado={t.estado} destino={t.destino} tipoEnvio={t.tipoEnvio} auditLog={auditLog} registroCodigo={t.tracking || t.almacenId} />

          {esperandoPago && (
            <div className="info-box mt-8" style={{ background: "var(--warning-soft)", color: "var(--warning)" }}>
              Esperando pago al proveedor para poder avanzar — genera y paga su factura en Finanzas → Proveedores.
            </div>
          )}

          <div className="segment mt-8" style={{ alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <select className="input input-sm" value={t.estado} onChange={(e) => cambiarEstado(t, e.target.value)}>
              {estadosPorDestino(t.destino).filter((s) => s !== "Entregado").map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className={`badge ${badgeEstado(t.estado)}`}>{t.estado}</span>

            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <small style={{ opacity: 0.5, fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>ID almacén</small>
              <div style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--border)", borderRadius: 8, padding: "3px 8px", background: "var(--surface, #fff)" }}>
                <Package size={13} style={{ opacity: 0.45, flexShrink: 0 }} />
                <input
                  defaultValue={t.almacenId}
                  placeholder="—"
                  onBlur={(e) => e.target.value !== (t.almacenId || "") && actualizarCampo(t, "almacenId", e.target.value)}
                  style={{ border: "none", outline: "none", background: "transparent", width: 76, padding: 0, fontSize: "0.85rem" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <small style={{ opacity: 0.5, fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>Peso</small>
              <div style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--border)", borderRadius: 8, padding: "3px 8px", background: "var(--surface, #fff)" }}>
                <Weight size={13} style={{ opacity: 0.45, flexShrink: 0 }} />
                <input
                  type="number"
                  defaultValue={t.peso}
                  placeholder="0.0"
                  onBlur={(e) => manejarBlurPeso(t, e)}
                  style={{ border: "none", outline: "none", background: "transparent", width: 56, padding: 0, fontSize: "0.85rem" }}
                />
                <span style={{ opacity: 0.45, fontSize: "0.72rem" }}>lb</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}