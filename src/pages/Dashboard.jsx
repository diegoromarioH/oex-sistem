// src/pages/Dashboard.jsx
import { useMemo } from "react";
import {
  Package, TrendingUp, Wallet, Clock, Users, AlertCircle,
  MapPin, PieChart as PieChartIcon, History, ArrowRight, Warehouse,
  DollarSign, Hash
} from "lucide-react";
import { numero } from "../utils/numero";
import Metric from "../components/Metric";
import PageTitle from "../components/PageTitle";
import SeguimientoClientes from "../components/SeguimientoClientes";
import { esPendienteDeConfirmar, esListoParaRetiroProveedor } from "../utils/estadosEnvio";
import { costoInternoDefaultPorTipo } from "../utils/calculosPaqueteria";

// Paleta para el pastel de estados — se repite por ciclo si hay más
// estados que colores.
const COLORES_ESTADO = ["#7e3bed", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899", "#14b8a6", "#a855f7"];

// Colores fijos para distinguir Ometepe/Managua en el panel de Bodega OEX.
const COLOR_OMETEPE = "#3b82f6";
const COLOR_MANAGUA = "#f59e0b";

export default function Dashboard({ pedidos, envios, gastos, prealertas = [], empresa, cuentasDinero = [], auth, mostrarToast, cargarDatos, setVista, irAPrealertas }) {
  const ventasPaq = envios.reduce((a, e) => a + numero(e.total), 0);
  const gananciaPaq = envios.reduce((a, e) => a + numero(e.gananciaReal), 0);
  const totalGastos = gastos.reduce((a, g) => a + numero(g.monto), 0);
  const pendientesPaq = envios.filter((e) => e.estado !== "Entregado").length;
  // OJO: tracking_registros guarda TANTO lo pendiente de confirmar COMO
  // los trackings ya confirmados y activos (confirmarTracking() no borra
  // la fila, solo cambia el estado a "Miami" — se queda ahí hasta que se
  // genera el recibo). Por eso hay que filtrar con esPendienteDeConfirmar,
  // igual que en Prealertas.jsx y PaqueteriaDashboard.jsx.
  const prealertasSinRevisar = prealertas.filter(esPendienteDeConfirmar).length;

  const ultimos = [...pedidos.slice(0, 4).map((p) => ({ ...p, tipo: "SHEIN" })), ...envios.slice(0, 4).map((e) => ({ ...e, tipo: "Paquetería" }))]
    .sort((a, b) => new Date(b.fechaISO) - new Date(a.fechaISO))
    .slice(0, 6);

  // === Envíos por destino (barras) ===
  const enviosPorDestino = useMemo(() => {
    const mapa = new Map();
    envios.forEach((e) => {
      const key = e.destino || "Sin destino";
      mapa.set(key, (mapa.get(key) || 0) + 1);
    });
    const max = Math.max(1, ...mapa.values());
    return [...mapa.entries()]
      .map(([destino, cantidad]) => ({ destino, cantidad, pct: (cantidad / max) * 100 }))
      .sort((a, b) => b.cantidad - a.cantidad);
  }, [envios]);

  // === Envíos por estado (pastel con porcentaje) ===
  const enviosPorEstado = useMemo(() => {
    const mapa = new Map();
    envios.forEach((e) => {
      const key = e.estado || "Sin estado";
      mapa.set(key, (mapa.get(key) || 0) + 1);
    });
    const total = envios.length;
    return [...mapa.entries()]
      .map(([estado, cantidad], i) => ({
        estado,
        cantidad,
        pct: total > 0 ? (cantidad / total) * 100 : 0,
        color: COLORES_ESTADO[i % COLORES_ESTADO.length]
      }))
      .sort((a, b) => b.cantidad - a.cantidad);
  }, [envios]);

  // Construye el conic-gradient a partir de los porcentajes acumulados.
  const gradientePastel = useMemo(() => {
    let acumulado = 0;
    const partes = enviosPorEstado.map((e) => {
      const inicio = acumulado;
      acumulado += e.pct;
      return `${e.color} ${inicio}% ${acumulado}%`;
    });
    return partes.length > 0 ? `conic-gradient(${partes.join(", ")})` : null;
  }, [enviosPorEstado]);

  // === En Bodega OEX: listos para que Darío Import Logistic los facture y
  // OEX los retire. Mismo criterio de costo que proveedoresService.js
  // (costoInterno propio del tracking, si no el default por tipo) para que
  // el monto acá cuadre exacto con lo que sale al generar la factura real. ===
  const costoEstimadoTracking = (t) => {
    const costo = t.costoInterno !== undefined && t.costoInterno !== "" ? numero(t.costoInterno) : costoInternoDefaultPorTipo(t.tipoEnvio);
    return numero(t.peso) * costo;
  };

  const enBodegaOEX = useMemo(
    () => prealertas
      .filter((t) => esListoParaRetiroProveedor(t.estado))
      .map((t) => ({ ...t, montoEstimado: costoEstimadoTracking(t) }))
      .sort((a, b) => (a.destino === b.destino ? 0 : a.destino === "Ometepe" ? -1 : 1)),
    [prealertas]
  );
  const bodegaOmetepe = enBodegaOEX.filter((t) => t.destino === "Ometepe");
  const bodegaManagua = enBodegaOEX.filter((t) => t.destino === "Managua");
  const montoTotalBodega = enBodegaOEX.reduce((a, t) => a + t.montoEstimado, 0);
  const montoBodegaOmetepe = bodegaOmetepe.reduce((a, t) => a + t.montoEstimado, 0);
  const montoBodegaManagua = bodegaManagua.reduce((a, t) => a + t.montoEstimado, 0);

  return (
    <div className="page">
      <PageTitle title="Dashboard" subtitle="Resumen general del negocio" />

      <div
        className="card mt-16"
        role="button"
        tabIndex={0}
        onClick={() => irAPrealertas()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") irAPrealertas(); }}
        style={{
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderLeft: "4px solid #F4562D"
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <AlertCircle size={20} style={{ marginTop: 2, flexShrink: 0, color: "#F4562D" }} />
          <div>
            <b>
              {prealertasSinRevisar === 0
                ? "Sin prealertas pendientes"
                : `${prealertasSinRevisar} ${prealertasSinRevisar === 1 ? "prealerta sin revisar" : "prealertas sin revisar"}`}
            </b>
            <p>Trackings registrados que todavía no se han confirmado por GC.</p>
          </div>
        </div>
        <span className="badge badge-neutral">Ver prealertas <ArrowRight size={14} style={{ verticalAlign: "-2px" }} /></span>
      </div>

      <div className="grid-4">
        <Metric
          label={<><Package size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />Ventas Paquetería</>}
          value={`$${ventasPaq.toFixed(2)}`}
          onClick={() => setVista("paqueteria")}
        />
        <Metric
          label={<><TrendingUp size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />Ganancia real Paquetería</>}
          value={`$${gananciaPaq.toFixed(2)}`}
        />
        <Metric
          label={<><Wallet size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />Gastos operativos</>}
          value={`$${totalGastos.toFixed(2)}`}
          onClick={() => setVista("finanzas")}
        />
        <Metric
          label={<><Clock size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />Envíos pendientes</>}
          value={pendientesPaq}
          onClick={() => setVista("paqueteria")}
        />
        <Metric
          label={<><Users size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />Clientes registrados</>}
          value={pedidos.length + envios.length > 0 ? new Set([...pedidos.map((p) => p.clienteId), ...envios.map((e) => e.clienteId)].filter(Boolean)).size : 0}
          onClick={() => setVista("clientes")}
        />
      </div>

      <div className="grid-2">
        <div className="card">
          <h3><MapPin size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />Envíos por destino</h3>
          <div className="mt-16">
            {enviosPorDestino.map((d) => (
              <div key={d.destino} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <b>{d.destino}</b>
                  <span>{d.cantidad}</span>
                </div>
                <div style={{ background: "var(--border)", borderRadius: 6, height: 10, overflow: "hidden" }}>
                  <div style={{ width: `${d.pct}%`, height: "100%", background: "var(--module-color, #7e3bed)", borderRadius: 6 }} />
                </div>
              </div>
            ))}
            {enviosPorDestino.length === 0 && <p>Sin envíos registrados todavía.</p>}
          </div>
        </div>

        <div className="card">
          <h3><PieChartIcon size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />Envíos por estado</h3>
          <div className="mt-16" style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "relative", width: 150, height: 150, flexShrink: 0 }}>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  background: gradientePastel || "var(--border)",
                  WebkitMask: "radial-gradient(farthest-side, transparent 61%, #000 62%)",
                  mask: "radial-gradient(farthest-side, transparent 61%, #000 62%)"
                }}
              />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
                <b style={{ fontSize: "1.4rem" }}>{envios.length}</b>
                <small>envío(s)</small>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              {enviosPorEstado.map((e) => (
                <div key={e.estado} className="row-card">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: e.color, display: "inline-block", flexShrink: 0 }} />
                    <b>{e.estado}</b>
                  </div>
                  <div className="text-right">
                    <b>{e.cantidad}</b>
                    <small style={{ display: "block", opacity: 0.6 }}>{e.pct.toFixed(0)}%</small>
                  </div>
                </div>
              ))}
              {enviosPorEstado.length === 0 && <p>Sin envíos registrados todavía.</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3><Warehouse size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />En Bodega OEX — listos para retirar</h3>
        <p>Trackings que Darío Import Logistic ya tiene disponibles para que OEX pague y retire. El monto es el costo interno estimado (libra × costo por tipo de envío).</p>

        <div className="grid-4 mt-16">
          <div className="metric"><b>Total en bodega</b><span className="metric-value">{enBodegaOEX.length}</span></div>
          <div className="metric"><b>Monto total estimado</b><span className="metric-value">${montoTotalBodega.toFixed(2)}</span></div>
          <div className="metric">
            <b style={{ color: COLOR_OMETEPE }}>● Ometepe</b>
            <span className="metric-value" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "1.1rem" }}>
              <Package size={15} />{bodegaOmetepe.length}
              <span style={{ opacity: 0.35, fontWeight: 400 }}>|</span>
              <DollarSign size={15} />{montoBodegaOmetepe.toFixed(2)}
            </span>
          </div>
          <div className="metric">
            <b style={{ color: COLOR_MANAGUA }}>● Managua</b>
            <span className="metric-value" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "1.1rem" }}>
              <Package size={15} />{bodegaManagua.length}
              <span style={{ opacity: 0.35, fontWeight: 400 }}>|</span>
              <DollarSign size={15} />{montoBodegaManagua.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="grid-2 mt-16">
          <div className="card" style={{ borderLeft: `4px solid ${COLOR_OMETEPE}`, margin: 0 }}>
            <div className="page-title" style={{ margin: "0 0 8px" }}>
              <h4 style={{ margin: 0, display: "flex", alignItems: "center", gap: 6, color: COLOR_OMETEPE }}>
                <MapPin size={16} />Ometepe
              </h4>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Package size={14} /><b>{bodegaOmetepe.length}</b>
                <span style={{ opacity: 0.35 }}>|</span>
                <DollarSign size={14} /><b>${montoBodegaOmetepe.toFixed(2)}</b>
              </span>
            </div>
            <div className="list">
              {bodegaOmetepe.map((t) => (
                <div key={t.id} className="row-card">
                  <div>
                    <b><Hash size={13} style={{ verticalAlign: "-2px" }} />{t.tracking || "—"}</b> <span className="badge badge-neutral">{t.tipoEnvio}</span>
                    <p><Warehouse size={12} style={{ verticalAlign: "-1px" }} /> Almacén {t.almacenId || "—"} · {t.cliente} · {numero(t.peso).toFixed(1)} lb</p>
                  </div>
                  <b>${t.montoEstimado.toFixed(2)}</b>
                </div>
              ))}
              {bodegaOmetepe.length === 0 && <p>Nada para Ometepe por ahora.</p>}
            </div>
          </div>

          <div className="card" style={{ borderLeft: `4px solid ${COLOR_MANAGUA}`, margin: 0 }}>
            <div className="page-title" style={{ margin: "0 0 8px" }}>
              <h4 style={{ margin: 0, display: "flex", alignItems: "center", gap: 6, color: COLOR_MANAGUA }}>
                <MapPin size={16} />Managua
              </h4>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Package size={14} /><b>{bodegaManagua.length}</b>
                <span style={{ opacity: 0.35 }}>|</span>
                <DollarSign size={14} /><b>${montoBodegaManagua.toFixed(2)}</b>
              </span>
            </div>
            <div className="list">
              {bodegaManagua.map((t) => (
                <div key={t.id} className="row-card">
                  <div>
                    <b><Hash size={13} style={{ verticalAlign: "-2px" }} />{t.tracking || "—"}</b> <span className="badge badge-neutral">{t.tipoEnvio}</span>
                    <p><Warehouse size={12} style={{ verticalAlign: "-1px" }} /> Almacén {t.almacenId || "—"} · {t.cliente} · {numero(t.peso).toFixed(1)} lb</p>
                  </div>
                  <b>${t.montoEstimado.toFixed(2)}</b>
                </div>
              ))}
              {bodegaManagua.length === 0 && <p>Nada para Managua por ahora.</p>}
            </div>
          </div>
        </div>
        {enBodegaOEX.length === 0 && <p className="mt-16">Nada en Bodega OEX por ahora.</p>}
      </div>

      <SeguimientoClientes envios={envios} empresa={empresa} cuentasDinero={cuentasDinero} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} />

      <div className="card">
        <h3><History size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />Últimos movimientos</h3>
        <div className="list">
          {ultimos.map((item) => (
            <div key={`${item.tipo}-${item.id}`} className="row-card">
              <div>
                <b>{item.numero}</b> <span className="badge badge-neutral">{item.tipo}</span>
                <p>{item.cliente} · {item.fecha}</p>
              </div>
              <b>${numero(item.total).toFixed(2)}</b>
            </div>
          ))}
          {ultimos.length === 0 && <p>Sin movimientos todavía.</p>}
        </div>
      </div>
    </div>
  );
}