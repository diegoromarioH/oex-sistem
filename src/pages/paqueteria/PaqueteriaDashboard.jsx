// src/pages/paqueteria/PaqueteriaDashboard.jsx
// Panel de control de Paquetería: cuántos trackings están prealertados,
// cuántos paquetes activos hay por destino (Ometepe/Managua) y por tipo
// (Aéreo/Marítimo), cuántas libras llevamos acumuladas de cada tipo, y una
// lista filtrable por estado donde cada envío es clickeable (reutiliza
// EnvioItem, que ya trae el detalle de trackings, PDF, WhatsApp, etc.).
import { useMemo, useState } from "react";
import { numero } from "../../utils/numero";
import { PIPELINE_MANAGUA, PIPELINE_OMETEPE, esPendienteDeConfirmar } from "../../utils/estadosEnvio";
import EnvioItem from "./EnvioItem";

const TODOS_LOS_ESTADOS = [...new Set([...PIPELINE_MANAGUA, ...PIPELINE_OMETEPE])];

// Tipo real de un tracking: usa el propio si lo tiene, si no cae al tipo
// general del envío (igual que en calculosPaqueteria.js).
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
  // Filtros que se activan al hacer clic en una tarjeta (toggle: clic de
  // nuevo la quita). Se combinan entre sí (AND).
  const [filtroDestino, setFiltroDestino] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState(null);
  const [mostrarPrealertas, setMostrarPrealertas] = useState(false);

  // Filtro manual de estado, independiente de las tarjetas.
  const [filtroEstado, setFiltroEstado] = useState("");
  const [soloActivos, setSoloActivos] = useState(true);

  const pendientesConfirmar = useMemo(() => prealertas.filter(esPendienteDeConfirmar), [prealertas]);

  // Un paquete pasa la mayor parte de su vida como tracking SUELTO (en
  // Envíos activos), no dentro de un recibo — los recibos solo se generan
  // al final, cuando ya está listo para retirar. Antes las tarjetas solo
  // contaban lo que ya estaba en un recibo, así que casi todo se quedaba
  // sin sumar. Ahora se combinan ambas fuentes en una sola lista.
  const todosLosTrackingsActivos = useMemo(() => {
    const sueltos = prealertas
      .filter((t) => !esPendienteDeConfirmar(t))
      .map((t) => ({
        peso: numero(t.peso),
        tipoEnvio: t.tipoEnvio,
        destino: t.destino,
        estado: t.estado
      }));

    const dentroDeRecibos = envios.flatMap((e) =>
      (e.trackings || []).map((t) => ({
        peso: numero(t.peso),
        tipoEnvio: t.tipoEnvio || e.tipoEnvio,
        destino: e.destino,
        estado: e.estado
      }))
    );

    return [...sueltos, ...dentroDeRecibos];
  }, [prealertas, envios]);

  const activosOmetepe = useMemo(
    () => todosLosTrackingsActivos.filter((t) => t.destino === "Ometepe" && t.estado !== "Entregado").length,
    [todosLosTrackingsActivos]
  );
  const activosManagua = useMemo(
    () => todosLosTrackingsActivos.filter((t) => t.destino === "Managua" && t.estado !== "Entregado").length,
    [todosLosTrackingsActivos]
  );
  const activosAereos = useMemo(
    () => todosLosTrackingsActivos.filter((t) => t.tipoEnvio === "Aéreo" && t.estado !== "Entregado").length,
    [todosLosTrackingsActivos]
  );
  const activosMaritimos = useMemo(
    () => todosLosTrackingsActivos.filter((t) => t.tipoEnvio === "Marítimo" && t.estado !== "Entregado").length,
    [todosLosTrackingsActivos]
  );

  // Libras acumuladas por tipo de tracking — total histórico y solo activos.
  const libras = useMemo(() => {
    let aereoTotal = 0, maritimoTotal = 0, aereoActivo = 0, maritimoActivo = 0;
    todosLosTrackingsActivos.forEach((t) => {
      if (t.tipoEnvio === "Aéreo") {
        aereoTotal += t.peso;
        if (t.estado !== "Entregado") aereoActivo += t.peso;
      } else if (t.tipoEnvio === "Marítimo") {
        maritimoTotal += t.peso;
        if (t.estado !== "Entregado") maritimoActivo += t.peso;
      }
    });
    return { aereoTotal, maritimoTotal, aereoActivo, maritimoActivo };
  }, [todosLosTrackingsActivos]);

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
          etiqueta="Paquetes Ometepe (activos)"
          valor={activosOmetepe}
          sublinea="No entregados"
          activa={filtroDestino === "Ometepe"}
          onClick={() => toggleDestino("Ometepe")}
        />
        <TarjetaResumen
          etiqueta="Paquetes Managua (activos)"
          valor={activosManagua}
          sublinea="No entregados"
          activa={filtroDestino === "Managua"}
          onClick={() => toggleDestino("Managua")}
        />
        <TarjetaResumen
          etiqueta="Envíos aéreos activos"
          valor={activosAereos}
          sublinea="No entregados"
          activa={filtroTipo === "Aéreo"}
          onClick={() => toggleTipo("Aéreo")}
        />
        <TarjetaResumen
          etiqueta="Envíos marítimos activos"
          valor={activosMaritimos}
          sublinea="No entregados"
          activa={filtroTipo === "Marítimo"}
          onClick={() => toggleTipo("Marítimo")}
        />
        <TarjetaResumen
          etiqueta="Libras aéreas"
          valor={`${libras.aereoActivo.toFixed(1)} lb`}
          sublinea={`Activas · ${libras.aereoTotal.toFixed(1)} lb histórico total`}
        />
        <TarjetaResumen
          etiqueta="Libras marítimas"
          valor={`${libras.maritimoActivo.toFixed(1)} lb`}
          sublinea={`Activas · ${libras.maritimoTotal.toFixed(1)} lb histórico total`}
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
          <h3> Recibos {filtroEstado ? `· ${filtroEstado}` : soloActivos ? "activos" : "(todos)"}</h3>
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
          {enviosFiltrados.length === 0 && <p>No hay envíos que coincidan con estos filtros.</p>}
        </div>
      </div>
    </div>
  );
}