// src/pages/paqueteria/DarioImport.jsx
import { useEffect, useMemo, useState } from "react";
import { listarDarioSync, mapearEstadoDario, aplicarEstadoDario, aplicarPesoDario } from "../../services/darioImportService";
import { numero } from "../../utils/numero";

const fmt = (n) => `${numero(n).toFixed(2)} lb`;

export default function DarioImport({ prealertas = [], envios = [], tarifas, auth, mostrarToast, cargarDatos }) {
  const [sync, setSync] = useState([]);
  const [buscar, setBuscar] = useState("");
  const [cargando, setCargando] = useState(true);

  const cargar = async () => {
    setCargando(true);
    try { setSync(await listarDarioSync()); }
    catch (e) { mostrarToast(e.message, "error"); }
    finally { setCargando(false); }
  };
  useEffect(() => { cargar(); }, []);

  const filas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return sync.map((d) => {
      const oex = prealertas.find((t) => String(t.id) === String(d.tracking_id)) || null;
      const estadoPropuesto = oex ? mapearEstadoDario(d.dario_estado, oex.destino) : null;
      return { d, oex, estadoPropuesto };
    }).filter(({ d, oex }) => !q || String(d.tracking_codigo).toLowerCase().includes(q) || String(oex?.cliente || "").toLowerCase().includes(q));
  }, [sync, prealertas, buscar]);

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

  return <section>
    <div className="panel">
      <div className="panel-header"><div><h3>Darío Import</h3><p className="muted">Comparador logístico de estados y pesos. No modifica pagos de proveedor.</p></div><button className="btn btn-ghost" onClick={cargar}>Actualizar</button></div>
      <div className="form-row"><input className="input" value={buscar} onChange={(e)=>setBuscar(e.target.value)} placeholder="Buscar tracking o cliente…" /></div>
    </div>
    <div className="panel">
      {cargando ? <p className="muted">Cargando sincronización…</p> : filas.length === 0 ? <div className="empty-state"><strong>Aún no hay paquetes sincronizados.</strong><p>La estructura está lista. Cuando el conector seguro de Darío guarde paquetes, aparecerán aquí para revisión.</p></div> :
      <div className="table-wrap"><table><thead><tr><th>Tracking</th><th>Darío</th><th>OEX</th><th>Peso Darío</th><th>Peso OEX</th><th>Destino</th><th>Acciones</th></tr></thead><tbody>
        {filas.map((fila) => <tr key={fila.d.id}><td><strong>{fila.d.tracking_codigo}</strong></td><td>{fila.d.dario_estado || "—"}</td><td>{fila.oex ? <><span>{fila.oex.estado}</span>{fila.estadoPropuesto && fila.estadoPropuesto !== fila.oex.estado && <div className="muted">→ {fila.estadoPropuesto}</div>}</> : "No encontrado"}</td><td>{fmt(fila.d.dario_peso_lb)}</td><td>{fila.oex ? fmt(fila.oex.peso) : "—"}</td><td>{fila.oex?.destino || "—"}</td><td>{fila.oex && <div className="actions"><button className="btn btn-ghost btn-sm" disabled={!fila.estadoPropuesto || fila.estadoPropuesto === fila.oex.estado || Boolean(fila.oex.envioId)} onClick={()=>aplicarEstado(fila)}>Usar estado Darío</button><button className="btn btn-ghost btn-sm" disabled={numero(fila.d.dario_peso_lb)<=0 || Math.abs(numero(fila.d.dario_peso_lb)-numero(fila.oex.peso))<0.005} onClick={()=>aplicarPeso(fila)}>Usar peso Darío</button></div>}</td></tr>)}
      </tbody></table></div>}
    </div>
  </section>;
}
