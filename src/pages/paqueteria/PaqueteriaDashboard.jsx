// src/pages/paqueteria/PaqueteriaDashboard.jsx
// Panel de control de Paquetería: prealertas, trackings activos por destino
// y tipo, libras activas/históricas y resumen de recibos activos. Los
// trackings y los recibos se cuentan por separado para no duplicar paquetes.
import { useMemo, useState } from "react";
import { numero } from "../../utils/numero";
import { PIPELINE_MANAGUA, PIPELINE_OMETEPE, esPendienteDeConfirmar } from "../../utils/estadosEnvio";
import EnvioItem from "./EnvioItem";

const TODOS_LOS_ESTADOS = [...new Set([...PIPELINE_MANAGUA, ...PIPELINE_OMETEPE])];

const tipoDeTracking = (envio, tracking) => tracking.tipoEnvio || envio.tipoEnvio;

const MiniMetrica = ({ etiqueta, valor, detalle, activa, onClick }) => {
  const contenido = (
    <>
      <small style={{ opacity: 0.66, fontWeight: 700 }}>{etiqueta}</small>
      <strong style={{ display: "block", fontSize: "1.55rem", lineHeight: 1.1, marginTop: 5 }}>{valor}</strong>
      {detalle && <small style={{ display: "block", marginTop: 5, opacity: 0.5 }}>{detalle}</small>}
    </>
  );

  if (!onClick) {
    return (
      <div style={{ padding: "14px 16px", borderRadius: 12, background: "var(--surface-2, #f7f8fa)", minWidth: 0 }}>
        {contenido}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "14px 16px",
        borderRadius: 12,
        background: activa ? "var(--primary-soft, #eef6ff)" : "var(--surface-2, #f7f8fa)",
        border: activa ? "1px solid var(--primary, #2563eb)" : "1px solid transparent",
        textAlign: "left",
        cursor: "pointer",
        color: "inherit",
        minWidth: 0
      }}
    >
      {contenido}
    </button>
  );
};

const PanelResumen = ({ titulo, subtitulo, destacado, destacadoDetalle, destacadoDetalleStyle, items, columnas = 3 }) => (
  <section className="card" style={{ margin: 0, padding: 18 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 14 }}>
      <div>
        <h3 style={{ margin: 0 }}>{titulo}</h3>
        {subtitulo && <small style={{ opacity: 0.58 }}>{subtitulo}</small>}
      </div>
      {destacado !== undefined && (
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <strong style={{ fontSize: "2rem", lineHeight: 1 }}>{destacado}</strong>
          {destacadoDetalle && (
            <small
              style={{
                display: "block",
                marginTop: 5,
                opacity: destacadoDetalleStyle ? 1 : 0.5,
                ...destacadoDetalleStyle
              }}
            >
              {destacadoDetalle}
            </small>
          )}
        </div>
      )}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))`, gap: 10 }}>
      {items.map((item) => <MiniMetrica key={item.etiqueta} {...item} />)}
    </div>
  </section>
);

export default function PaqueteriaDashboard({ envios, prealertas, auditLog, rol, tarifas, empresa, cuentasDinero = [], auth, mostrarToast, cargarDatos }) {
  const [filtroDestino, setFiltroDestino] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState(null);
  const [mostrarPrealertas, setMostrarPrealertas] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [soloActivos, setSoloActivos] = useState(true);
  const [filtroPago, setFiltroPago] = useState("");
  const [busquedaRecibo, setBusquedaRecibo] = useState("");

  const pendientesConfirmar = useMemo(
    () => prealertas.filter(esPendienteDeConfirmar),
    [prealertas]
  );

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

  const librasActivas = useMemo(() => {
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

  const librasHistoricas = useMemo(() => {
    const acumulado = { aereo: 0, maritimo: 0 };

    trackingsActivos.forEach((t) => {
      const peso = numero(t.peso);
      if (t.tipoEnvio === "Aéreo") acumulado.aereo += peso;
      if (t.tipoEnvio === "Marítimo") acumulado.maritimo += peso;
    });

    envios.forEach((e) => {
      (e.trackings || []).forEach((t) => {
        const peso = numero(t.peso);
        const tipo = tipoDeTracking(e, t);
        if (tipo === "Aéreo") acumulado.aereo += peso;
        if (tipo === "Marítimo") acumulado.maritimo += peso;
      });
    });

    return { ...acumulado, total: acumulado.aereo + acumulado.maritimo };
  }, [trackingsActivos, envios]);

  const recibosActivosLista = useMemo(
    () => envios.filter((e) => e.estado !== "Entregado"),
    [envios]
  );

  const resumenRecibos = useMemo(() => {
    let aereos = 0;
    let maritimos = 0;
    let mixtos = 0;
    let managua = 0;
    let ometepe = 0;
    const clientesUnicos = new Set();

    recibosActivosLista.forEach((e) => {
      const tipos = new Set((e.trackings || []).map((t) => tipoDeTracking(e, t)).filter(Boolean));
      if (tipos.size === 0 && e.tipoEnvio) tipos.add(e.tipoEnvio);

      if (tipos.size > 1) mixtos += 1;
      else if (tipos.has("Aéreo")) aereos += 1;
      else if (tipos.has("Marítimo")) maritimos += 1;

      if (e.destino === "Managua") managua += 1;
      if (e.destino === "Ometepe") ometepe += 1;

      if (e.clienteId) clientesUnicos.add(`id:${e.clienteId}`);
      else if (e.clienteCodigo) clientesUnicos.add(`codigo:${String(e.clienteCodigo).toUpperCase()}`);
      else if (e.contacto) clientesUnicos.add(`tel:${String(e.contacto).replace(/\D/g, "")}`);
      else if (e.cliente) clientesUnicos.add(`nombre:${String(e.cliente).trim().toLowerCase()}`);
    });

    return {
      total: recibosActivosLista.length,
      aereos,
      maritimos,
      mixtos,
      managua,
      ometepe,
      clientes: clientesUnicos.size
    };
  }, [recibosActivosLista]);

  const toggleDestino = (d) => setFiltroDestino((actual) => (actual === d ? null : d));
  const toggleTipo = (t) => setFiltroTipo((actual) => (actual === t ? null : t));

  const limpiarFiltros = () => {
    setFiltroDestino(null);
    setFiltroTipo(null);
    setFiltroEstado("");
    setSoloActivos(true);
    setFiltroPago("");
    setBusquedaRecibo("");
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
      if (filtroPago === "pagado" && numero(e.saldo) > 0.005) return false;
      if (filtroPago === "pendiente" && numero(e.saldo) <= 0.005) return false;
      const q = busquedaRecibo.trim().toLowerCase();
      if (q && !(e.cliente || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [envios, filtroEstado, soloActivos, filtroDestino, filtroTipo, filtroPago, busquedaRecibo]);

  const hayFiltrosActivos = filtroDestino || filtroTipo || filtroEstado || filtroPago || busquedaRecibo || !soloActivos || mostrarPrealertas;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14, marginBottom: 18 }}>
        <PanelResumen
          titulo="Operación actual"
          subtitulo="Trackings antes de convertirse en recibo"
          destacado={trackingsActivos.length}
          destacadoDetalle="envíos activos"
          columnas={2}
          items={[
            {
              etiqueta: "Prealertas",
              valor: pendientesConfirmar.length,
              detalle: mostrarPrealertas ? "Ocultar lista ▲" : "Ver lista ▼",
              activa: mostrarPrealertas,
              onClick: () => setMostrarPrealertas((v) => !v)
            },
            { etiqueta: "Ometepe", valor: activosOmetepe, detalle: "activos", activa: filtroDestino === "Ometepe", onClick: () => toggleDestino("Ometepe") },
            { etiqueta: "Managua", valor: activosManagua, detalle: "activos", activa: filtroDestino === "Managua", onClick: () => toggleDestino("Managua") },
            { etiqueta: "Aéreos / Marítimos", valor: `${activosAereos} / ${activosMaritimos}`, detalle: "aéreos · marítimos" }
          ]}
        />

        <PanelResumen
          titulo="Peso"
          subtitulo="Volumen actual e histórico"
          destacado={`${librasHistoricas.total.toFixed(1)} lb`}
          destacadoDetalle="histórico total"
          columnas={2}
          items={[
            { etiqueta: "Aéreas activas", valor: `${librasActivas.aereo.toFixed(1)} lb` },
            { etiqueta: "Marítimas activas", valor: `${librasActivas.maritimo.toFixed(1)} lb` },
            { etiqueta: "Aéreo histórico", valor: `${librasHistoricas.aereo.toFixed(1)} lb` },
            { etiqueta: "Marítimo histórico", valor: `${librasHistoricas.maritimo.toFixed(1)} lb` }
          ]}
        />

        <PanelResumen
          titulo="Recibos activos"
          subtitulo="No entregados"
          destacado={resumenRecibos.total}
          destacadoDetalle={`${resumenRecibos.clientes} clientes únicos`}
          destacadoDetalleStyle={{ color: "var(--primary, #2563eb)", fontWeight: 800, fontSize: "0.9rem" }}
          columnas={2}
          items={[
            { etiqueta: "Aéreos", valor: resumenRecibos.aereos, detalle: resumenRecibos.mixtos ? `${resumenRecibos.mixtos} mixto(s)` : undefined },
            { etiqueta: "Marítimos", valor: resumenRecibos.maritimos, detalle: resumenRecibos.mixtos ? `${resumenRecibos.mixtos} mixto(s)` : undefined },
            { etiqueta: "Managua", valor: resumenRecibos.managua },
            { etiqueta: "Ometepe", valor: resumenRecibos.ometepe }
          ]}
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
            <input className="input input-sm" placeholder="Buscar por nombre" value={busquedaRecibo} onChange={(e) => setBusquedaRecibo(e.target.value)} />
            <select className="input input-sm" value={filtroPago} onChange={(e) => setFiltroPago(e.target.value)}><option value="">Pagados y no pagados</option><option value="pagado">Pagados</option><option value="pendiente">No pagados</option></select>
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
