// src/pages/paqueteria/DarioImport.jsx
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Scale, Route, CheckCircle2, AlertTriangle } from "lucide-react";
import { listarDarioSync, sincronizarDario, mapearEstadoDario, aplicarEstadoDario, aplicarPesoDario } from "../../services/darioImportService";
import { numero } from "../../utils/numero";
import "../../styles/DarioImport.css";

const fmt = (n) => `${numero(n).toFixed(2)} lb`;
const mismoPeso = (a, b) => Math.abs(numero(a) - numero(b)) < 0.005;

export default function DarioImport({ prealertas = [], envios = [], tarifas, auth, mostrarToast, cargarDatos }) {
  const [sync, setSync] = useState([]);
  const [buscar, setBuscar] = useState("");
  const [destino, setDestino] = useState("todos");
  const [estado, setEstado] = useState("todos");
  const [diferencias, setDiferencias] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);

  const cargar = async () => {
    setCargando(true);
    try { setSync(await listarDarioSync()); }
    catch (e) { mostrarToast(e.message, "error"); }
    finally { setCargando(false); }
  };
  useEffect(() => { cargar(); }, []);

  const sincronizar = async () => {
    setSincronizando(true);
    try {
      const resultado = await sincronizarDario();
      mostrarToast("Darío actualizado: " + (resultado.matched || 0) + " coincidencias de " + (resultado.totalDario || 0) + " paquetes.", "success");
      await cargar();
    } catch (e) { mostrarToast(e.message || "No fue posible sincronizar con Darío.", "error"); }
    finally { setSincronizando(false); }
  };

  const base = useMemo(() => sync.map((d) => {
    const oex = prealertas.find((t) => String(t.id) === String(d.tracking_id)) || null;
    const estadoPropuesto = oex ? mapearEstadoDario(d.dario_estado, oex.destino) : null;
    const difEstado = Boolean(oex && estadoPropuesto && estadoPropuesto !== oex.estado);
    const difPeso = Boolean(oex && !mismoPeso(d.dario_peso_lb, oex.peso));
    return { d, oex, estadoPropuesto, difEstado, difPeso, tieneDiferencia: difEstado || difPeso };
  }), [sync, prealertas]);

  const filas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return base.filter(({ d, oex, tieneDiferencia }) => {
      if (q && !String(d.tracking_codigo).toLowerCase().includes(q) && !String(oex?.cliente || "").toLowerCase().includes(q)) return false;
      if (destino !== "todos" && oex?.destino !== destino) return false;
      if (estado !== "todos" && d.dario_estado !== estado) return false;
      if (diferencias && !tieneDiferencia) return false;
      return true;
    });
  }, [base, buscar, destino, estado, diferencias]);

  const estadosDario = useMemo(() => [...new Set(sync.map((x) => x.dario_estado).filter(Boolean))].sort(), [sync]);
  const resumen = useMemo(() => ({
    total: base.length,
    coinciden: base.filter((x) => !x.tieneDiferencia).length,
    diferencias: base.filter((x) => x.tieneDiferencia).length,
    peso: base.filter((x) => x.difPeso).length
  }), [base]);

  const aplicarEstado = async (fila) => {
    try {
      await aplicarEstadoDario({ trackingOEX: fila.oex, estadoDario: fila.d.dario_estado, auth });
      mostrarToast("Estado actualizado desde Darío.", "success");
      await cargarDatos(); await cargar();
    } catch (e) { mostrarToast(e.message, "error"); }
  };

  const aplicarPeso = async (fila) => {
    try {
      const envio = fila.oex?.envioId ? envios.find((e) => String(e.id) === String(fila.oex.envioId)) : null;
      if (envio && !window.confirm("Este tracking ya está en un recibo. Cambiar el peso puede recalcular el total y generar un ajuste contable. ¿Continuar?")) return;
      await aplicarPesoDario({ trackingOEX: fila.oex, pesoDario: fila.d.dario_peso_lb, envio, tarifas, auth });
      mostrarToast("Peso actualizado desde Darío.", "success");
      await cargarDatos(); await cargar();
    } catch (e) { mostrarToast(e.message, "error"); }
  };

  const limpiarFiltros = () => { setBuscar(""); setDestino("todos"); setEstado("todos"); setDiferencias(false); };

  return <section className="dario-import">
    <div className="dario-hero">
      <div><div className="dario-eyebrow">INTEGRACIÓN DE PROVEEDOR</div><h2>Darío Import</h2><p>Compara el estado y peso reportado por Darío con OEX antes de aplicar cambios.</p></div>
      <button className="btn btn-primary dario-sync-btn" onClick={sincronizar} disabled={sincronizando}><RefreshCw size={16} className={sincronizando ? "spin" : ""} />{sincronizando ? "Sincronizando…" : "Actualizar desde Darío"}</button>
    </div>

    <div className="dario-kpis">
      <div className="dario-kpi"><Route size={18}/><div><span>Sincronizados</span><strong>{resumen.total}</strong></div></div>
      <div className="dario-kpi"><CheckCircle2 size={18}/><div><span>Coinciden</span><strong>{resumen.coinciden}</strong></div></div>
      <div className="dario-kpi"><AlertTriangle size={18}/><div><span>Con diferencias</span><strong>{resumen.diferencias}</strong></div></div>
      <div className="dario-kpi"><Scale size={18}/><div><span>Peso diferente</span><strong>{resumen.peso}</strong></div></div>
    </div>

    <div className="panel dario-filters">
      <div className="dario-search"><Search size={17}/><input value={buscar} onChange={(e)=>setBuscar(e.target.value)} placeholder="Buscar tracking o cliente…" /></div>
      <select className="input" value={destino} onChange={(e)=>setDestino(e.target.value)}><option value="todos">Todos los destinos</option><option value="Managua">Managua</option><option value="Ometepe">Ometepe</option></select>
      <select className="input" value={estado} onChange={(e)=>setEstado(e.target.value)}><option value="todos">Todos los estados Darío</option>{estadosDario.map((x)=><option key={x} value={x}>{x}</option>)}</select>
      <label className="dario-check"><input type="checkbox" checked={diferencias} onChange={(e)=>setDiferencias(e.target.checked)} /> Solo diferencias</label>
      <button className="btn btn-ghost btn-sm" onClick={limpiarFiltros}>Limpiar</button>
    </div>

    <div className="panel dario-table-panel">
      <div className="dario-results"><strong>{filas.length}</strong> de {base.length} trackings</div>
      {cargando ? <p className="muted">Cargando sincronización…</p> : filas.length === 0 ? <div className="empty-state"><strong>No hay resultados con estos filtros.</strong><p>Prueba limpiando los filtros o actualizando desde Darío.</p></div> :
      <div className="table-wrap"><table className="dario-table"><thead><tr><th>Tracking</th><th>Estado Darío</th><th>Estado OEX</th><th>Peso Darío</th><th>Peso OEX</th><th>Destino</th><th>Acciones</th></tr></thead><tbody>
        {filas.map((fila) => <tr key={fila.d.id} className={fila.tieneDiferencia ? "has-difference" : ""}>
          <td><strong>{fila.d.tracking_codigo}</strong>{fila.oex?.cliente && <small>{fila.oex.cliente}</small>}</td>
          <td><span className="badge badge-neutral">{fila.d.dario_estado || "—"}</span></td>
          <td>{fila.oex ? <><span className="badge badge-info">{fila.oex.estado}</span>{fila.difEstado && <small className="dario-proposal">Darío propone → {fila.estadoPropuesto}</small>}</> : <span className="badge badge-warning">No encontrado</span>}</td>
          <td className={fila.difPeso ? "value-diff" : ""}>{fmt(fila.d.dario_peso_lb)}</td><td>{fila.oex ? fmt(fila.oex.peso) : "—"}</td><td>{fila.oex?.destino || "—"}</td>
          <td>{fila.oex && <div className="dario-actions"><button className="btn btn-ghost btn-sm" disabled={!fila.difEstado || Boolean(fila.oex.envioId)} onClick={()=>aplicarEstado(fila)}>Usar estado</button><button className="btn btn-ghost btn-sm" disabled={!fila.difPeso || numero(fila.d.dario_peso_lb)<=0} onClick={()=>aplicarPeso(fila)}>Usar peso</button></div>}</td>
        </tr>)}
      </tbody></table></div>}
    </div>
  </section>;
}
