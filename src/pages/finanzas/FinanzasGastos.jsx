// src/pages/finanzas/FinanzasGastos.jsx
//
// Gestión de gastos operativos como página propia dentro de Finanzas,
// con el mismo patrón que FinanzasProveedores.jsx: estado local, filtro
// de mes propio (no depende del filtro del Resumen) y su propio
// desglose por categoría.
import { useEffect, useMemo, useState } from "react";
import { numero } from "../../utils/numero";
import { formatoMoneda } from "../../utils/moneda";
import { guardarGasto, eliminarGasto, listarTrackingsPagadosProveedor, guardarAsignacionesGastoTracking } from "../../services/gastosService";
import Select from "../../components/Select";

const nombreMes = (fechaISO) => {
  if (!fechaISO) return "Sin fecha";
  const d = new Date(fechaISO);
  const txt = d.toLocaleDateString("es-NI", { year: "numeric", month: "long" });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
};

export default function FinanzasGastos({ gastos, proveedores = [], cuentasDinero = [], empresa, rol, auth, mostrarToast, cargarDatos }) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [categoria, setCategoria] = useState("General");
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState("USD");
  const [tasaCambio, setTasaCambio] = useState(String(empresa?.tipoCambio || ""));
  // Vínculo opcional a proveedor — para pagos a proveedores que NO son
  // Aduana/Flete (esos van por factura-por-tracking en Finanzas → Proveedores).
  // "" = sin proveedor, gasto normal (luz, internet, etc.).
  const [proveedorGastoId, setProveedorGastoId] = useState("");
  // Vínculo opcional a la cuenta de dinero (caja/banco) de donde sale el
  // efectivo. "" = no se registra seguimiento de dinero para este gasto.
  const [cuentaDineroId, setCuentaDineroId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [vincularTrackings, setVincularTrackings] = useState(false);
  const [destinoCosto, setDestinoCosto] = useState("Ometepe");
  const [busquedaTracking, setBusquedaTracking] = useState("");
  const [trackingsElegibles, setTrackingsElegibles] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [metodoDistribucion, setMetodoDistribucion] = useState("peso");
  useEffect(() => { let activo=true; listarTrackingsPagadosProveedor().then(data=>{if(activo)setTrackingsElegibles(data)}).catch(()=>{if(activo)setTrackingsElegibles([])}); return()=>{activo=false}; }, [gastos]);
  const trackingsVisibles = useMemo(() => { const q=busquedaTracking.trim().toLowerCase(); return trackingsElegibles.filter(t=>String(t.destino||"").trim().toLowerCase()===destinoCosto.toLowerCase()&&(!q||String(t.codigo||"").toLowerCase().includes(q))); }, [trackingsElegibles,destinoCosto,busquedaTracking]);
  const toggleTracking = tracking => setSeleccionados(actual=>actual.some(t=>String(t.id)===String(tracking.id))?actual.filter(t=>String(t.id)!==String(tracking.id)):[...actual,tracking]);
  const montoUSDFormulario = moneda==="NIO"&&numero(tasaCambio)>0?numero(monto)/numero(tasaCambio):numero(monto);
  const asignacionesCalculadas = useMemo(()=>{ if(!seleccionados.length||montoUSDFormulario<=0)return[]; if(metodoDistribucion==="igual"){const base=montoUSDFormulario/seleccionados.length;return seleccionados.map((t,i)=>({...t,montoAsignadoUSD:i===seleccionados.length-1?montoUSDFormulario-base*(seleccionados.length-1):base}));} const pesoTotal=seleccionados.reduce((s,t)=>s+numero(t.peso),0);if(pesoTotal<=0)return[];let acumulado=0;return seleccionados.map((t,i)=>{const valor=i===seleccionados.length-1?montoUSDFormulario-acumulado:montoUSDFormulario*numero(t.peso)/pesoTotal;acumulado+=valor;return{...t,montoAsignadoUSD:valor};});},[seleccionados,montoUSDFormulario,metodoDistribucion]);

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

  const montoUSD = (g) => g.moneda === "NIO" && numero(g.tasaCambio) > 0 ? numero(g.monto) / numero(g.tasaCambio) : numero(g.monto);
  const totalGastos = gastosFiltrados.reduce((a, g) => a + montoUSD(g), 0);
  const gastosVinculados = gastosFiltrados.filter((g) => g.proveedorNombre).length;

  const gastosPorCategoria = useMemo(() => {
    const mapa = new Map();
    gastosFiltrados.forEach((g) => mapa.set(g.categoria, (mapa.get(g.categoria) || 0) + montoUSD(g)));
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
      if(vincularTrackings&&seleccionados.length===0)throw new Error("Selecciona al menos un tracking.");
      if(vincularTrackings&&metodoDistribucion==="peso"&&asignacionesCalculadas.length===0)throw new Error("Los trackings seleccionados necesitan peso para distribuir el gasto.");
      const creado=await guardarGasto({ form:{fecha,categoria,descripcion,monto,moneda,tasaCambio,proveedor,cuentaDinero},auth });
      if(vincularTrackings)await guardarAsignacionesGastoTracking({gasto:{...creado,moneda,tasaCambio,monto},asignaciones:asignacionesCalculadas.map(t=>({trackingId:t.id,codigo:t.codigo,peso:t.peso,montoAsignadoUSD:t.montoAsignadoUSD})),metodo:metodoDistribucion,auth});
      mostrarToast(vincularTrackings?"Gasto registrado y distribuido entre trackings.":"Gasto registrado.");
      setDescripcion(""); setMonto(""); setProveedorGastoId(""); setCuentaDineroId(""); setSeleccionados([]); setBusquedaTracking(""); setVincularTrackings(false);
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
          <div className="form-grid mt-8">
            <label><span className="field-label">Moneda del gasto</span><select className="input" value={moneda} onChange={(e) => setMoneda(e.target.value)}><option value="USD">Dólares (USD)</option><option value="NIO">Córdobas (NIO)</option></select></label>
            <label><span className="field-label">Monto ({moneda === "NIO" ? "C$" : "$"})</span><input className="input" type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} /></label>
          </div>
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
                  ...cuentasDinero.filter((c) => c.activa !== false).map((c) => ({ value: c.id, label: `${c.nombre} · ${c.moneda} (saldo ${formatoMoneda(c.saldoActual ?? c.saldo_actual, c.moneda)})` }))
                ]}
              />
            </div>
          )}
          {(moneda === "NIO" || (cuentaDineroId && cuentasDinero.find((c) => String(c.id) === String(cuentaDineroId))?.moneda !== moneda)) && (
            <label className="mt-8"><span className="field-label">Tipo de cambio (C$ por US$1)</span><input className="input" type="number" min="0" step="0.01" value={tasaCambio} onChange={(e) => setTasaCambio(e.target.value)} /></label>
          )}
          <div className="card mt-16" style={{padding:14,boxShadow:"none"}}>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}><input type="checkbox" checked={vincularTrackings} onChange={e=>setVincularTrackings(e.target.checked)}/><b>Este gasto corresponde a paquetes específicos</b></label>
            <small style={{display:"block",marginTop:5,opacity:.7}}>Solo distribuye el gasto para medir costo real. No crea otro gasto ni mueve dinero nuevamente.</small>
            {vincularTrackings&&<div className="mt-16"><div className="form-grid">
              <label><span className="field-label">Destino del flete</span><select className="input" value={destinoCosto} onChange={e=>{setDestinoCosto(e.target.value);setSeleccionados([])}}><option>Ometepe</option><option>Managua</option></select></label>
              <label><span className="field-label">Buscar tracking</span><input className="input" placeholder="Escribe todo o parte del tracking" value={busquedaTracking} onChange={e=>setBusquedaTracking(e.target.value)}/></label>
            </div><div className="segment mt-8"><button type="button" className={metodoDistribucion==="peso"?"btn btn-primary":"btn"} onClick={()=>setMetodoDistribucion("peso")}>Por peso</button><button type="button" className={metodoDistribucion==="igual"?"btn btn-primary":"btn"} onClick={()=>setMetodoDistribucion("igual")}>Partes iguales</button></div>
            <div className="list mt-8" style={{maxHeight:260,overflowY:"auto"}}>{trackingsVisibles.map(t=>{const marcado=seleccionados.some(s=>String(s.id)===String(t.id));return <label key={t.id} className="row-card" style={{cursor:"pointer"}}><div style={{display:"flex",alignItems:"flex-start",gap:9}}><input type="checkbox" checked={marcado} onChange={()=>toggleTracking(t)}/><div><b>{t.codigo}</b><p>{numero(t.peso).toFixed(2)} lb · {t.tipo_envio||"—"} · {t.destino} · {t.estado||"—"}</p></div></div></label>})}{trackingsVisibles.length===0&&<p style={{padding:8}}>No hay trackings pagados al proveedor que coincidan con este destino/búsqueda.</p>}</div>
            {seleccionados.length>0&&<div className="mt-8" style={{padding:10,border:"1px solid var(--border)",borderRadius:10}}><b>{seleccionados.length} tracking(s) seleccionados · {formatoMoneda(montoUSDFormulario,"USD")} a distribuir</b><div className="list mt-8">{asignacionesCalculadas.map(t=><div key={t.id} style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:12}}><span>{t.codigo} · {numero(t.peso).toFixed(2)} lb</span><b>{formatoMoneda(numero(t.montoAsignadoUSD),"USD")}</b></div>)}</div><small style={{display:"block",marginTop:7,opacity:.7}}>Total distribuido: {formatoMoneda(asignacionesCalculadas.reduce((s,t)=>s+numero(t.montoAsignadoUSD),0),"USD")} / {formatoMoneda(montoUSDFormulario,"USD")} · No se duplica el gasto.</small></div>}</div>}
          </div>
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
                  <b>{formatoMoneda(numero(g.monto), g.moneda)}</b>
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
