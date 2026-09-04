// src/pages/finanzas/FinanzasGastos.jsx
//
// Gestión de gastos operativos como página propia dentro de Finanzas,
// con el mismo patrón que FinanzasProveedores.jsx: estado local, filtro
// de mes propio (no depende del filtro del Resumen) y su propio
// desglose por categoría.
import { useMemo, useState } from "react";
import { numero } from "../../utils/numero";
import { formatoMoneda } from "../../utils/moneda";
import { guardarGasto, eliminarGasto } from "../../services/gastosService";
import Select from "../../components/Select";

const nombreMes = (fechaISO) => {
  if (!fechaISO) return "Sin fecha";
  const d = new Date(fechaISO);
  const txt = d.toLocaleDateString("es-NI", { year: "numeric", month: "long" });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
};

export default function FinanzasGastos({ gastos, proveedores = [], cuentasDinero = [], rol, auth, mostrarToast, cargarDatos }) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [categoria, setCategoria] = useState("General");
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  // Vínculo opcional a proveedor — para pagos a proveedores que NO son
  // Aduana/Flete (esos van por factura-por-tracking en Finanzas → Proveedores).
  // "" = sin proveedor, gasto normal (luz, internet, etc.).
  const [proveedorGastoId, setProveedorGastoId] = useState("");
  // Vínculo opcional a la cuenta de dinero (caja/banco) de donde sale el
  // efectivo. "" = no se registra seguimiento de dinero para este gasto.
  const [cuentaDineroId, setCuentaDineroId] = useState("");
  const [guardando, setGuardando] = useState(false);

  // "" = todos los meses. Filtro propio de esta página, independiente
  // del filtro de mes del Resumen.
  const [mesFiltro, setMesFiltro] = useState("");

  const mesesDisponibles = useMemo(() => {
    const set = new Set();
    gastos.forEach((g) => set.add(nombreMes(g.fechaISO)));
    return [...set].sort((a, b) => (a < b ? 1 : -1));
  }, [gastos]);

  const gastosFiltrados = useMemo(
    () => (mesFiltro ? gastos.filter((g) => nombreMes(g.fechaISO) === mesFiltro) : gastos),
    [gastos, mesFiltro]
  );

  const totalGastos = gastosFiltrados.reduce((a, g) => a + numero(g.monto), 0);
  const gastosVinculados = gastosFiltrados.filter((g) => g.proveedorNombre).length;

  const gastosPorCategoria = useMemo(() => {
    const mapa = new Map();
    gastosFiltrados.forEach((g) => mapa.set(g.categoria, (mapa.get(g.categoria) || 0) + numero(g.monto)));
    return [...mapa.entries()]
      .map(([categoria, monto]) => ({ categoria, monto, pct: totalGastos > 0 ? (monto / totalGastos) * 100 : 0 }))
      .sort((a, b) => b.monto - a.monto);
  }, [gastosFiltrados, totalGastos]);

  const categoriaTop = gastosPorCategoria[0]?.categoria || "—";

  const guardar = async () => {
    setGuardando(true);
    try {
      const proveedor = proveedores.find((p) => String(p.id) === String(proveedorGastoId)) || null;
      const cuentaDinero = cuentasDinero.find((c) => String(c.id) === String(cuentaDineroId)) || null;
      await guardarGasto({ form: { fecha, categoria, descripcion, monto, proveedor, cuentaDinero }, auth });
      mostrarToast("Gasto registrado.");
      setDescripcion(""); setMonto(""); setProveedorGastoId(""); setCuentaDineroId("");
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo guardar.", "error");
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (gasto) => {
    if (rol !== "admin") return mostrarToast("Solo un administrador puede eliminar gastos.", "error");
    try {
      await eliminarGasto({ gasto, auth });
      mostrarToast("Gasto eliminado.");
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
          <b>Total gastos{mesFiltro ? ` — ${mesFiltro}` : ""}</b>
          <span className="metric-value">${totalGastos.toFixed(2)}</span>
        </div>
        <div className="metric">
          <b>N° de gastos</b>
          <span className="metric-value">{gastosFiltrados.length}</span>
        </div>
        <div className="metric">
          <b>Categoría con más gasto</b>
          <span className="metric-value" style={{ fontSize: "1.1rem" }}>{categoriaTop}</span>
        </div>
        <div className="metric">
          <b>Vinculados a proveedor</b>
          <span className="metric-value">{gastosVinculados}</span>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Registrar gasto</h3>
          <div className="form-grid mt-16">
            <label><span className="field-label">Fecha</span><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
            <label>
              <span className="field-label">Categoría</span>
              <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                {["General", "Transporte", "Bodega", "Aduana", "Salarios", "Publicidad"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <label className="mt-8"><span className="field-label">Descripción</span><input className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></label>
          <label className="mt-8"><span className="field-label">Monto ($)</span><input className="input" type="number" value={monto} onChange={(e) => setMonto(e.target.value)} /></label>
          {proveedores.length > 0 && (
            <div className="mt-8">
              <Select
                label="¿Es un pago a un proveedor? (opcional)"
                value={proveedorGastoId}
                onChange={(e) => setProveedorGastoId(e.target.value)}
                options={[
                  { value: "", label: "No — gasto general" },
                  ...proveedores.map((p) => ({ value: p.id, label: `${p.nombre} (${p.tipo})` }))
                ]}
              />
            </div>
          )}
          {cuentasDinero.length > 0 && (
            <div className="mt-8">
              <Select
                label="¿De cuál cuenta sale el dinero? (opcional)"
                value={cuentaDineroId}
                onChange={(e) => setCuentaDineroId(e.target.value)}
                options={[
                  { value: "", label: "No registrar seguimiento de dinero" },
                  ...cuentasDinero.map((c) => ({ value: c.id, label: `${c.nombre} (saldo ${formatoMoneda(c.saldoActual ?? c.saldo_actual, c.moneda)})` }))
                ]}
              />
            </div>
          )}
          <button className="btn btn-primary mt-16" disabled={guardando} onClick={guardar}>{guardando ? "Guardando..." : "Registrar gasto"}</button>
        </div>

        <div className="card">
          <h3>Gastos{mesFiltro ? ` — ${mesFiltro}` : ""}</h3>
          <div className="list mt-16">
            {gastosFiltrados.map((g) => (
              <div key={g.id} className="row-card">
                <div>
                  <b>{g.descripcion}</b> <span className="badge badge-neutral">{g.categoria}</span>{g.proveedorNombre && <span className="badge badge-info"> {g.proveedorNombre}</span>}
                  <p>Registrado por {g.creadoPor || "—"}</p>
                  <small>{g.fecha}</small>
                </div>
                <div className="stack-gap-sm text-right">
                  <b>${numero(g.monto).toFixed(2)}</b>
                  <button className="btn btn-danger" onClick={() => eliminar(g)}>Eliminar</button>
                </div>
              </div>
            ))}
            {gastosFiltrados.length === 0 && <p>Sin gastos en este período.</p>}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Gastos por categoría{mesFiltro ? ` — ${mesFiltro}` : ""}</h3>
        <div className="list mt-16">
          {gastosPorCategoria.map((g) => (
            <div key={g.categoria} className="row-card">
              <div><b>{g.categoria}</b></div>
              <div className="stack-gap-sm text-right">
                <b>${g.monto.toFixed(2)}</b>
                <small>{g.pct.toFixed(0)}% del total</small>
              </div>
            </div>
          ))}
          {gastosPorCategoria.length === 0 && <p>Sin gastos registrados en este período.</p>}
        </div>
      </div>
    </div>
  );
}