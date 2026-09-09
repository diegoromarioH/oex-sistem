// src/pages/paqueteria/EnviosList.jsx
import { useMemo, useState } from "react";
import { exportarEnviosExcel } from "../../services/excelService";
import { PIPELINE_MANAGUA, PIPELINE_OMETEPE } from "../../utils/estadosEnvio";
import EnvioItem from "./EnvioItem";
import { numero } from "../../utils/numero";

// En Recibos solo interesan los estados operativos desde Bodega OEX.
// La creación del recibo sigue permitida desde Tránsito Managua/Ometepe.
const desdeBodega = (pipeline) => pipeline.slice(Math.max(pipeline.indexOf("Bodega OEX"), 0));
const TODOS_LOS_ESTADOS = [...new Set([...desdeBodega(PIPELINE_MANAGUA), ...desdeBodega(PIPELINE_OMETEPE)])];

export default function EnviosList({ envios, auditLog, rol, tarifas, empresa, cuentasDinero = [], auth, mostrarToast, cargarDatos }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroPago, setFiltroPago] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroDestino, setFiltroDestino] = useState("");

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return envios.filter((e) =>
      (!filtroEstado || e.estado === filtroEstado) &&
      (!filtroPago || (filtroPago === "pagado" ? numero(e.saldo) <= 0.005 : numero(e.saldo) > 0.005)) &&
      (!filtroDestino || e.destino === filtroDestino) &&
      (!filtroTipo || (e.trackings || []).some((t) => (t.tipoEnvio || e.tipoEnvio) === filtroTipo) || e.tipoEnvio === filtroTipo) &&
      (!q ||
        (e.cliente || "").toLowerCase().includes(q) ||
        (e.numero || "").toLowerCase().includes(q) ||
        (e.clienteCodigo || "").toLowerCase().includes(q) ||
        (e.trackings || []).some((t) => (t.codigo || "").toLowerCase().includes(q) || String(t.almacenId || "").toLowerCase().includes(q)))
    );
  }, [envios, busqueda, filtroEstado, filtroPago, filtroTipo, filtroDestino]);

  const hayFiltros = busqueda || filtroEstado || filtroPago || filtroTipo || filtroDestino;
  const limpiarFiltros = () => {
    setBusqueda("");
    setFiltroEstado("");
    setFiltroPago("");
    setFiltroTipo("");
    setFiltroDestino("");
  };

  return (
    <div className="card recibos-card">
      <div className="page-title recibos-title">
        <div><h3>Todos los recibos</h3><small>{filtrados.length} de {envios.length} recibos</small></div>
        <div className="actions recibos-filtros">
          <input className="input input-sm" placeholder="Buscar cliente, número, tracking o ID almacén" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <select className="input input-sm" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            {TODOS_LOS_ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <select className="input input-sm" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Aéreo y marítimo</option>
            <option value="Aéreo">Aéreo</option>
            <option value="Marítimo">Marítimo</option>
          </select>
          <select className="input input-sm" value={filtroDestino} onChange={(e) => setFiltroDestino(e.target.value)}>
            <option value="">Managua y Ometepe</option>
            <option value="Managua">Managua</option>
            <option value="Ometepe">Ometepe</option>
          </select>
          <select className="input input-sm" value={filtroPago} onChange={(e) => setFiltroPago(e.target.value)}>
            <option value="">Pagados y no pagados</option>
            <option value="pagado">Pagados</option>
            <option value="pendiente">No pagados</option>
          </select>
          {hayFiltros && <button className="btn btn-ghost" onClick={limpiarFiltros}>Limpiar</button>}
          <button className="btn" onClick={() => exportarEnviosExcel(filtrados)}>Exportar Excel</button>
        </div>
      </div>

      <div className="list recibos-list">
        {filtrados.map((e) => (
          <EnvioItem key={e.id} envio={e} auditLog={auditLog} rol={rol} tarifas={tarifas} empresa={empresa} cuentasDinero={cuentasDinero} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} mostrarPipeline={false} compacto />
        ))}
        {filtrados.length === 0 && <p>No hay envíos que coincidan.</p>}
      </div>
    </div>
  );
}
