// src/pages/paqueteria/PaqueteriaDashboard.jsx
// Panel de control de Paquetería: prealertas, trackings activos por destino
// y tipo, libras activas y recibos activos. Los trackings y los recibos se
// cuentan por separado para no duplicar paquetes en las métricas.
import { useMemo, useState } from "react";
import { numero } from "../../utils/numero";
import { PIPELINE_MANAGUA, PIPELINE_OMETEPE, esPendienteDeConfirmar } from "../../utils/estadosEnvio";
import EnvioItem from "./EnvioItem";

const TODOS_LOS_ESTADOS = [...new Set([...PIPELINE_MANAGUA, ...PIPELINE_OMETEPE])];

const tipoDeTracking = (envio, tracking) => tracking.tipoEnvio || envio.tipoEnvio;

const TarjetaResumen = ({ etiqueta, valor, sublinea, activa, onClick }) => (
  <button
    type="button"
    className="metric"
    onClick={onClick}
    disabled={!onClick}
    style={{
      cursor: onClick ? "pointer" : "default",
      textAlign: "left",
      border: activa ? "2px solid #F4562D" : undefined,
      width: "100%"
    }}
  >
    <b>{etiqueta}</b>
    <span className="metric-value">{valor}</span>
    {sublinea && <small style={{ display: "block", marginTop: 4, opacity: 0.6 }}>{sublinea}</small>}
  </button>
);

export default function PaqueteriaDashboard({ envios, prealertas, auditLog, rol, tarifas, empresa, cuentasDinero = [], auth, mostrarToast, cargarDatos }) {
  const [filtroDestino, setFiltroDestino] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState(null);
  const [mostrarPrealertas, setMostrarPrealertas] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [soloActivos, setSoloActivos] = useState(true);

  const pendientesConfirmar = useMemo(
    () => prealertas.filter(esPendienteDeConfirmar),
    [prealertas]
  );

  // Esta es exactamente la misma población que usa la pestaña
  // "Envíos activos": trackings confirmados que todavía viven sueltos.
  // Los trackings ya convertidos en recibo NO se vuelven a sumar aquí.
  const trackingsActivos = useMemo(
    () => prealertas.filter((t) => !esPendienteDeConfirmar(t)),
    [prealertas]
  );

  const activosOmetepe = useMemo(
    () => trackingsActivos.filter((t) => t.destino === "Ometepe").length,
    [trackingsActivos]
  );
  const activosManagua = useMemo(
    () => trackingsActivos.filter((t) => t.destino === "Managua").length,
    [trackingsActivos]
  );
  const activosAereos = useMemo(
    () => trackingsActivos.filter((t) => t.tipoEnvio === "Aéreo").length,
    [trackingsActivos]
  );
  const activosMaritimos = useMemo(
    () => trackingsActivos.filter((t) => t.tipoEnvio === "Marítimo").length,
    [trackingsActivos]
  );

  const libras = useMemo(() => {
    return trackingsActivos.reduce(
      (acc, t) => {
        const peso = numero(t.peso);
        if (t.tipoEnvio === "Aéreo") acc.aereo += peso;
        if (t.tipoEnvio === "Marítimo") acc.maritimo += peso;
        return acc;
      },
      { aereo: 0, maritimo: 0 }
    );
  }, [trackingsActivos]);

  const recibosActivos = useMemo(
    () => envios.filter((e) => e.estado !== "Entregado").length,
    [envios]
  );

  const toggleDestino = (d) => setFiltroDestino((actual) => (actual === d ? null : d));
  const toggleTipo = (t) => setFiltroTipo((actual) => (actual === t ? null : t));

  const limpiarFiltros = () => {
    setFiltroDestino(null);
    setFiltroTipo(null);
    setFiltroEstado("");
    setSoloActivos(true);
    setMostrarPrealertas(false);
  };

  const enviosFiltrados = useMemo(() => {
    return envios.filter((e) => {
      if (filtroEstado) {
        if (e.estado !== filtroEstado) return false;
      } else if (soloActivos && e.estado === "Entregado") {
        return false;
      }
      if (filtroDestino && e.destino !== filtroDestino) return false;
      if (filtroTipo && !(e.trackings || []).some((t) => tipoDeTracking(e, t) === filtroTipo)) return false;
      return true;
    });
  }, [envios, filtroEstado, soloActivos, filtroDestino, filtroTipo]);

  const hayFiltrosActivos = filtroDestino || filtroTipo || filtroEstado || !soloActivos || mostrarPrealertas;

  return (
    <div>
      <div className="grid-4">
        <TarjetaResumen
          etiqueta="Trackings prealertados"
          valor={pendientesConfirmar.length}
          sublinea={mostrarPrealertas ? "Ocultar lista ▲" : "Ver lista ▼"}
          activa={mostrarPrealertas}
          onClick={() => setMostrarPrealertas((v) => !v)}
        />
        <TarjetaResumen
          etiqueta="Envíos activos"
          valor={trackingsActivos.length}
          sublinea="Trackings confirmados"
        />
        <TarjetaResumen
          etiqueta="Paquetes Ometepe (activos)"
          valor={activosOmetepe}
          sublinea="Dentro de Envíos activos"
          activa={filtroDestino === "Ometepe"}
          onClick={() => toggleDestino("Ometepe")}
        />
        <TarjetaResumen
          etiqueta="Paquetes Managua (activos)"
          valor={activosManagua}
          sublinea="Dentro de Envíos activos"
          activa={filtroDestino === "Managua"}
          onClick={() => toggleDestino("Managua")}
        />
        <TarjetaResumen
          etiqueta="Aéreos activos"
          valor={activosAereos}
          sublinea="Dentro de Envíos activos"
          activa={filtroTipo === "Aéreo"}
          onClick={() => toggleTipo("Aéreo")}
        />
        <TarjetaResumen
          etiqueta="Marítimos activos"
          valor={activosMaritimos}
          sublinea="Dentro de Envíos activos"
          activa={filtroTipo === "Marítimo"}
          onClick={() => toggleTipo("Marítimo")}
        />
        <TarjetaResumen
          etiqueta="Libras aéreas activas"
          valor={`${libras.aereo.toFixed(1)} lb`}
          sublinea="Solo Envíos activos"
        />
        <TarjetaResumen
          etiqueta="Libras marítimas activas"
          valor={`${libras.maritimo.toFixed(1)} lb`}
          sublinea="Solo Envíos activos"
        />
        <TarjetaResumen
          etiqueta="Recibos activos"
          valor={recibosActivos}
          sublinea="No entregados"
        />
      </div>

      {mostrarPrealertas && (
        <div className="card">
          <h3>Trackings prealertados</h3>
          <div className="list mt-16">
            {pendientesConfirmar.map((p) => (
              <div key={p.id} className="row-card">
                <div>
                  <b>{p.tracking}</b> <span className="badge badge-neutral">{p.tipoEnvio}</span>
                  <p>{p.cliente} · {p.destino}</p>
                  <small>{p.fecha}</small>
                </div>
              </div>
            ))}
            {pendientesConfirmar.length === 0 && <p>Sin prealertas pendientes.</p>}
          </div>
        </div>
      )}

      <div className="card">
        <div className="page-title" style={{ margin: 0 }}>
          <h3>Recibos {filtroEstado ? `· ${filtroEstado}` : soloActivos ? "activos" : "(todos)"}</h3>
          <div className="segment">
            <select className="input input-sm" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
              <option value="">Filtrar por estado…</option>
              {TODOS_LOS_ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <label className="stack-gap-sm" style={{ display: "flex", alignItems: "center", gap: 6, flexDirection: "row" }}>
              <input type="checkbox" checked={soloActivos} disabled={!!filtroEstado} onChange={(e) => setSoloActivos(e.target.checked)} />
              <small>Solo activos (no entregados)</small>
            </label>
            {hayFiltrosActivos && <button className="btn btn-ghost" onClick={limpiarFiltros}>Limpiar filtros</button>}
          </div>
        </div>

        <div className="list mt-16">
          {enviosFiltrados.map((e) => (
            <EnvioItem key={e.id} envio={e} auditLog={auditLog} rol={rol} tarifas={tarifas} empresa={empresa} cuentasDinero={cuentasDinero} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} mostrarPipeline={false} />
          ))}
          {enviosFiltrados.length === 0 && <p>No hay recibos que coincidan con estos filtros.</p>}
        </div>
      </div>
    </div>
  );
}