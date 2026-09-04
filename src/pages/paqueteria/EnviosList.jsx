// src/pages/paqueteria/EnviosList.jsx
import { useMemo, useState } from "react";
import { exportarEnviosExcel } from "../../services/excelService";
import { PIPELINE_MANAGUA, PIPELINE_OMETEPE } from "../../utils/estadosEnvio";
import EnvioItem from "./EnvioItem";

// Unión de ambos pipelines, sin duplicados, para el filtro (un envío puede
// estar en cualquiera de los dos según su destino).
const TODOS_LOS_ESTADOS = [...new Set([...PIPELINE_MANAGUA, ...PIPELINE_OMETEPE])];

export default function EnviosList({ envios, auditLog, rol, tarifas, empresa, cuentasDinero = [], auth, mostrarToast, cargarDatos }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return envios.filter((e) =>
      (!filtroEstado || e.estado === filtroEstado) &&
      (!q ||
        (e.cliente || "").toLowerCase().includes(q) ||
        (e.numero || "").toLowerCase().includes(q) ||
        (e.clienteCodigo || "").toLowerCase().includes(q) ||
        (e.trackings || []).some((t) => (t.codigo || "").toLowerCase().includes(q) || String(t.almacenId || "").toLowerCase().includes(q)))
    );
  }, [envios, busqueda, filtroEstado]);

  return (
    <div className="card">
      <div className="page-title">
        <h3> Todos los recibos </h3>
        <div className="actions">
          <input className="input input-sm" placeholder="Buscar cliente, número, tracking o ID almacén" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <select className="input input-sm" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            {TODOS_LOS_ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <button className="btn" onClick={() => exportarEnviosExcel(filtrados)}>Exportar Excel</button>
        </div>
      </div>

      <div className="list">
        {filtrados.map((e) => (
          <EnvioItem key={e.id} envio={e} auditLog={auditLog} rol={rol} tarifas={tarifas} empresa={empresa} cuentasDinero={cuentasDinero} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} mostrarPipeline={false} />
        ))}
        {filtrados.length === 0 && <p>No hay envíos que coincidan.</p>}
      </div>
    </div>
  );
}