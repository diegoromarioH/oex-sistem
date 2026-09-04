// src/pages/finanzas/FinanzasIngresos.jsx
//
// Otros ingresos que no vienen automático de un pedido SHEIN ni de un
// recibo de Paquetería (seguro de envío, empaque especial, comisión,
// venta de cajas, etc.). Mismo patrón que FinanzasGastos.jsx: estado
// local, filtro de mes propio, y vínculo opcional a un cliente.
import { useMemo, useState } from "react";
import { numero } from "../../utils/numero";
import { formatoMoneda } from "../../utils/moneda";
import { guardarIngreso, eliminarIngreso } from "../../services/ingresosService";
import Select from "../../components/Select";

const nombreMes = (fechaISO) => {
  if (!fechaISO) return "Sin fecha";
  const d = new Date(fechaISO);
  const txt = d.toLocaleDateString("es-NI", { year: "numeric", month: "long" });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
};

export default function FinanzasIngresos({ ingresos, clientes = [], cuentasDinero = [], rol, auth, mostrarToast, cargarDatos }) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [categoria, setCategoria] = useState("General");
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  // "" = sin cliente, ingreso general (no ligado a nadie puntual).
  const [clienteIngresoId, setClienteIngresoId] = useState("");
  // Vínculo opcional a la cuenta de dinero (caja/banco) donde entra el
  // efectivo. "" = no se registra seguimiento de dinero para este ingreso.
  const [cuentaDineroId, setCuentaDineroId] = useState("");
  const [guardando, setGuardando] = useState(false);

  // "" = todos los meses. Filtro propio de esta página, independiente del
  // filtro de mes del Resumen.
  const [mesFiltro, setMesFiltro] = useState("");

  const mesesDisponibles = useMemo(() => {
    const set = new Set();
    ingresos.forEach((i) => set.add(nombreMes(i.fechaISO)));
    return [...set].sort((a, b) => (a < b ? 1 : -1));
  }, [ingresos]);

  const ingresosFiltrados = useMemo(
    () => (mesFiltro ? ingresos.filter((i) => nombreMes(i.fechaISO) === mesFiltro) : ingresos),
    [ingresos, mesFiltro]
  );

  const totalIngresos = ingresosFiltrados.reduce((a, i) => a + numero(i.monto), 0);
  const ingresosVinculados = ingresosFiltrados.filter((i) => i.clienteNombre).length;

  const ingresosPorCategoria = useMemo(() => {
    const mapa = new Map();
    ingresosFiltrados.forEach((i) => mapa.set(i.categoria, (mapa.get(i.categoria) || 0) + numero(i.monto)));
    return [...mapa.entries()]
      .map(([categoria, monto]) => ({ categoria, monto, pct: totalIngresos > 0 ? (monto / totalIngresos) * 100 : 0 }))
      .sort((a, b) => b.monto - a.monto);
  }, [ingresosFiltrados, totalIngresos]);

  const categoriaTop = ingresosPorCategoria[0]?.categoria || "—";

  const guardar = async () => {
    setGuardando(true);
    try {
      const cliente = clientes.find((c) => String(c.id) === String(clienteIngresoId)) || null;
      const cuentaDinero = cuentasDinero.find((c) => String(c.id) === String(cuentaDineroId)) || null;
      await guardarIngreso({ form: { fecha, categoria, descripcion, monto, cliente, cuentaDinero }, auth });
      mostrarToast("Ingreso registrado.");
      setDescripcion(""); setMonto(""); setClienteIngresoId(""); setCuentaDineroId("");
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo guardar.", "error");
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (ingreso) => {
    if (rol !== "admin") return mostrarToast("Solo un administrador puede eliminar ingresos.", "error");
    try {
      await eliminarIngreso({ ingreso, auth });
      mostrarToast("Ingreso eliminado.");
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo eliminar.", "error");
    }
  };

  return (
    <div>
      <div className="segment mt-8">
        <select className="input input-sm" value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)}>
          <option value="">Todos los meses</option>
          {mesesDisponibles.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div className="grid-4 mt-16">
        <div className="metric">
          <b>Total ingresos{mesFiltro ? ` — ${mesFiltro}` : ""}</b>
          <span className="metric-value" style={{ color: "var(--success)" }}>${totalIngresos.toFixed(2)}</span>
        </div>
        <div className="metric">
          <b>N° de ingresos</b>
          <span className="metric-value">{ingresosFiltrados.length}</span>
        </div>
        <div className="metric">
          <b>Categoría con más ingreso</b>
          <span className="metric-value" style={{ fontSize: "1.1rem" }}>{categoriaTop}</span>
        </div>
        <div className="metric">
          <b>Vinculados a cliente</b>
          <span className="metric-value">{ingresosVinculados}</span>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Registrar ingreso</h3>
          <div className="form-grid mt-16">
            <label><span className="field-label">Fecha</span><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
            <label>
              <span className="field-label">Categoría</span>
              <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                {["General", "Seguro de envío", "Empaque especial", "Compra personalizada", "Comisión", "Venta de cajas/insumos", "Otro"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <label className="mt-8"><span className="field-label">Descripción</span><input className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></label>
          <label className="mt-8"><span className="field-label">Monto ($)</span><input className="input" type="number" value={monto} onChange={(e) => setMonto(e.target.value)} /></label>
          {clientes.length > 0 && (
            <div className="mt-8">
              <Select
                label="¿Viene de un cliente puntual? (opcional)"
                value={clienteIngresoId}
                onChange={(e) => setClienteIngresoId(e.target.value)}
                options={[
                  { value: "", label: "No — ingreso general" },
                  ...clientes.map((c) => ({ value: c.id, label: `${c.nombre} (${c.codigo})` }))
                ]}
              />
            </div>
          )}
          {cuentasDinero.length > 0 && (
            <div className="mt-8">
              <Select
                label="¿En cuál cuenta entra el dinero? (opcional)"
                value={cuentaDineroId}
                onChange={(e) => setCuentaDineroId(e.target.value)}
                options={[
                  { value: "", label: "No registrar seguimiento de dinero" },
                  ...cuentasDinero.map((c) => ({ value: c.id, label: `${c.nombre} (saldo ${formatoMoneda(c.saldoActual ?? c.saldo_actual, c.moneda)})` }))
                ]}
              />
            </div>
          )}
          <button className="btn btn-primary mt-16" disabled={guardando} onClick={guardar}>{guardando ? "Guardando..." : "Registrar ingreso"}</button>
        </div>

        <div className="card">
          <h3>Ingresos{mesFiltro ? ` — ${mesFiltro}` : ""}</h3>
          <div className="list mt-16">
            {ingresosFiltrados.map((i) => (
              <div key={i.id} className="row-card">
                <div>
                  <b>{i.descripcion}</b> <span className="badge badge-neutral">{i.categoria}</span>{i.clienteNombre && <span className="badge badge-info"> {i.clienteNombre}</span>}
                  <p>Registrado por {i.creadoPor || "—"}</p>
                  <small>{i.fecha}</small>
                </div>
                <div className="stack-gap-sm text-right">
                  <b style={{ color: "var(--success)" }}>${numero(i.monto).toFixed(2)}</b>
                  <button className="btn btn-danger" onClick={() => eliminar(i)}>Eliminar</button>
                </div>
              </div>
            ))}
            {ingresosFiltrados.length === 0 && <p>Sin ingresos en este período.</p>}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Ingresos por categoría{mesFiltro ? ` — ${mesFiltro}` : ""}</h3>
        <div className="list mt-16">
          {ingresosPorCategoria.map((i) => (
            <div key={i.categoria} className="row-card">
              <div><b>{i.categoria}</b></div>
              <div className="stack-gap-sm text-right">
                <b>${i.monto.toFixed(2)}</b>
                <small>{i.pct.toFixed(0)}% del total</small>
              </div>
            </div>
          ))}
          {ingresosPorCategoria.length === 0 && <p>Sin ingresos registrados en este período.</p>}
        </div>
      </div>
    </div>
  );
}