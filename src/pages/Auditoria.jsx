// src/pages/Auditoria.jsx
import { useMemo, useState } from "react";
import PageTitle from "../components/PageTitle";

export default function Auditoria({ auditLog }) {
  const [busqueda, setBusqueda] = useState("");
  const [modulo, setModulo] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const modulos = useMemo(() => [...new Set(auditLog.map((a) => a.modulo))], [auditLog]);

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase();
    // fechaISO es un timestamp completo (created_at) — se comparan por
    // rango de día completo: desde las 00:00:00 del día "desde" hasta las
    // 23:59:59 del día "hasta", así el día seleccionado queda incluido
    // entero sin que el operador tenga que pensar en horas.
    const desde = fechaDesde ? new Date(`${fechaDesde}T00:00:00`) : null;
    const hasta = fechaHasta ? new Date(`${fechaHasta}T23:59:59`) : null;

    return auditLog.filter((a) => {
      if (modulo && a.modulo !== modulo) return false;
      if (q && !(a.registro.toLowerCase().includes(q) || a.usuario.toLowerCase().includes(q) || a.detalle.toLowerCase().includes(q))) return false;
      if (desde || hasta) {
        if (!a.fechaISO) return false;
        const fecha = new Date(a.fechaISO);
        if (desde && fecha < desde) return false;
        if (hasta && fecha > hasta) return false;
      }
      return true;
    });
  }, [auditLog, busqueda, modulo, fechaDesde, fechaHasta]);

  const hayFiltrosActivos = busqueda || modulo || fechaDesde || fechaHasta;
  const limpiarFiltros = () => {
    setBusqueda(""); setModulo(""); setFechaDesde(""); setFechaHasta("");
  };

  return (
    <div className="page">
      <PageTitle title="Auditoría" subtitle="Historial de acciones de todo el sistema">
        <input className="input input-sm" placeholder="Buscar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <select className="input input-sm" value={modulo} onChange={(e) => setModulo(e.target.value)}>
          <option value="">Todos los módulos</option>
          {modulos.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <label className="stack-gap-sm" style={{ display: "flex", alignItems: "center", gap: 6, flexDirection: "row" }}>
          <small>Desde</small>
          <input className="input input-sm" type="date" value={fechaDesde} max={fechaHasta || undefined} onChange={(e) => setFechaDesde(e.target.value)} />
        </label>
        <label className="stack-gap-sm" style={{ display: "flex", alignItems: "center", gap: 6, flexDirection: "row" }}>
          <small>Hasta</small>
          <input className="input input-sm" type="date" value={fechaHasta} min={fechaDesde || undefined} onChange={(e) => setFechaHasta(e.target.value)} />
        </label>
        {hayFiltrosActivos && <button className="btn btn-ghost" onClick={limpiarFiltros}>Limpiar filtros</button>}
      </PageTitle>

      <div className="card">
        {hayFiltrosActivos && <p><small>{filtrados.length} resultado{filtrados.length === 1 ? "" : "s"}</small></p>}
        <div className="list">
          {filtrados.map((a) => (
            <div key={a.id} className="row-card">
              <div>
                <b>{a.accion}</b> <span className="badge badge-neutral">{a.modulo}</span>
                <p>{a.registro} {a.detalle && `· ${a.detalle}`}</p>
                <small>{a.fecha} · {a.usuario}</small>
              </div>
            </div>
          ))}
          {filtrados.length === 0 && <p>Sin registros.</p>}
        </div>
      </div>
    </div>
  );
}