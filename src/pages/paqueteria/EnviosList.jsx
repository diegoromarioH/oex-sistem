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
        <button className="btn recibos-exportar" onClick={() => exportarEnviosExcel(filtrados)}>Exportar Excel</button>
      </div>

      <div className="recibos-toolbar">
        <input className="input input-sm recibos-search" placeholder="Buscar cliente, número, tracking o ID almacén" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />

        <div className="tracking-filter-group" aria-label="Filtrar recibos por tipo de envío">
          {[["", "Todos"], ["Aéreo", "Aéreos"], ["Marítimo", "Marítimos"]].map(([valor, etiqueta]) => (
            <button key={etiqueta} type="button" className={`tracking-filter-btn ${filtroTipo === valor ? "active" : ""}`} onClick={() => setFiltroTipo(valor)}>{etiqueta}</button>
          ))}
        </div>

        <div className="tracking-filter-group destino" aria-label="Filtrar recibos por destino">
          {[["", "Todos"], ["Managua", "Managua"], ["Ometepe", "Ometepe"]].map(([valor, etiqueta]) => (
            <button key={etiqueta} type="button" className={`tracking-filter-btn ${filtroDestino === valor ? "active" : ""}`} onClick={() => setFiltroDestino(valor)}>{etiqueta}</button>
          ))}
        </div>

        <div className="tracking-filter-group recibos-pago" aria-label="Filtrar recibos por pago">
          {[["", "Todos"], ["pagado", "Pagados"], ["pendiente", "No pagados"]].map(([valor, etiqueta]) => (
            <button key={etiqueta} type="button" className={`tracking-filter-btn ${filtroPago === valor ? "active" : ""}`} onClick={() => setFiltroPago(valor)}>{etiqueta}</button>
          ))}
        </div>

        <select className="input input-sm recibos-estado" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {TODOS_LOS_ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>

        {hayFiltros && <button className="btn btn-ghost recibos-limpiar" onClick={limpiarFiltros}>Limpiar</button>}
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
