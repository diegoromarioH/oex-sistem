// src/pages/Finanzas/Finanzas.jsx
import { useEffect, useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Wallet, Landmark, Users, LineChart, ArrowRight, PiggyBank } from "lucide-react";
import { numero } from "../../utils/numero";
import { formatoMoneda } from "../../utils/moneda";
import { exportarReporteFinancieroExcel } from "../../services/excelService";
import { generarPDFReporteFinanciero } from "../../services/pdfService";
import { calcularEstadoResultados } from "../../services/estadoResultadosService";
import PageTitle from "../../components/PageTitle";
import FinanzasProveedores from "./FinanzasProveedores";
import FinanzasGastos from "./FinanzasGastos";
import FinanzasIngresos from "./FinanzasIngresos";
import FinanzasCuentas from "./FinanzasCuentas";
import FinanzasBalanceApertura from "./FinanzasBalanceApertura";
import FinanzasLibroDiario from "./FinanzasLibroDiario";
import FinanzasCorteCaja from "./FinanzasCorteCaja";
import FinanzasEstadoResultados from "./FinanzasEstadoResultados";

const nombreMes = (fechaISO) => {
  if (!fechaISO) return "Sin fecha";
  const d = new Date(fechaISO);
  const txt = d.toLocaleDateString("es-NI", { year: "numeric", month: "long" });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
};

// Tarjeta de KPI clickeable — al presionarla abre/cierra el detalle de los
// registros que componen ese número, útil para auditoría rápida.
const TarjetaKPI = ({ etiqueta, valor, activa, onClick, etiquetaAccion, icono: Icono, color }) => (
  <button
    type="button"
    className="metric"
    onClick={onClick}
    style={{
      cursor: "pointer",
      textAlign: "left",
      border: activa ? "2px solid #F4562D" : undefined,
      width: "100%"
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {Icono && <Icono size={16} style={{ color: color || "var(--module-color)", flexShrink: 0 }} />}
      <b>{etiqueta}</b>
    </div>
    <span className="metric-value" style={{ color: color || undefined }}>${valor.toFixed(2)}</span>
    <small style={{ display: "block", marginTop: 4, opacity: 0.6 }}>{etiquetaAccion || (activa ? "Ocultar detalle ▲" : "Ver detalle ▼")}</small>
  </button>
);

export default function Finanzas({ envios, gastos, ingresos = [], clientes = [], prealertas = [], proveedores = [], facturasProveedor = [], cuentasContables = [], cuentasDinero = [], balanceApertura = [], fechaApertura, empresa, rol, auth, mostrarToast, cargarDatos, vistaInicial = "resumen" }) {
  const [vista, setVista] = useState(vistaInicial);
  // El mega-menú del TopNav (App.jsx) puede pedir que Finanzas abra
  // directo en una sub-página específica (ej. "Libro diario") aunque el
  // módulo ya esté montado — este efecto es lo que hace que el clic
  // en el mega-menú realmente navegue, no solo en el primer montaje.
  useEffect(() => { setVista(vistaInicial); }, [vistaInicial]);

  // "" = todos los meses. El filtro afecta KPIs, detalle por tarjeta,
  // gastos por categoría, top clientes y las exportaciones.
  const [mesFiltro, setMesFiltro] = useState("");
  // Cuál tarjeta de KPI tiene su detalle abierto (null = ninguna).
  const [panelAbierto, setPanelAbierto] = useState(null);

  const mesesDisponibles = useMemo(() => {
    const set = new Set();
    envios.forEach((e) => set.add(nombreMes(e.fechaISO)));
    gastos.forEach((g) => set.add(nombreMes(g.fechaISO)));
    facturasProveedor.forEach((f) => set.add(nombreMes(f.fechaISO)));
    return [...set].sort((a, b) => (a < b ? 1 : -1));
  }, [envios, gastos, facturasProveedor]);

  // mesFiltro es solo una etiqueta de texto ("Agosto 2026") — para poder
  // consultar el libro diario (que necesita fechas ISO reales) hace falta
  // saber a qué año/mes corresponde esa etiqueta. Se arma una sola vez
  // recorriendo las mismas fechas de arriba.
  const mesInfoPorLabel = useMemo(() => {
    const mapa = new Map();
    const registrar = (fechaISO) => {
      if (!fechaISO || mapa.has(nombreMes(fechaISO))) return;
      const d = new Date(fechaISO);
      mapa.set(nombreMes(fechaISO), { anio: d.getFullYear(), mes: d.getMonth() });
    };
    envios.forEach((e) => registrar(e.fechaISO));
    gastos.forEach((g) => registrar(g.fechaISO));
    facturasProveedor.forEach((f) => registrar(f.fechaISO));
    return mapa;
  }, [envios, gastos, facturasProveedor]);

  // Rango real (ISO) para la consulta al libro diario: el mes elegido, o
  // "desde siempre hasta hoy" si no hay filtro de mes activo.
  const rangoLedger = useMemo(() => {
    const info = mesFiltro ? mesInfoPorLabel.get(mesFiltro) : null;
    if (info) {
      const desde = new Date(info.anio, info.mes, 1, 0, 0, 0);
      const hasta = new Date(info.anio, info.mes + 1, 0, 23, 59, 59);
      return { desde: desde.toISOString(), hasta: hasta.toISOString() };
    }
    return { desde: "1970-01-01T00:00:00.000Z", hasta: new Date().toISOString() };
  }, [mesFiltro, mesInfoPorLabel]);

  // Ingresos/Costos/Gastos/Utilidad calculados DIRECTO del libro diario —
  // la misma función que usa Finanzas → Estado de Resultados, así las 4
  // tarjetas de arriba del Resumen son garantizado el mismo número, no un
  // cálculo aparte que podría desviarse.
  const [resultadoLedger, setResultadoLedger] = useState(null);
  const [cargandoLedger, setCargandoLedger] = useState(true);
  useEffect(() => {
    let cancelado = false;
    setCargandoLedger(true);
    calcularEstadoResultados(rangoLedger)
      .then((r) => { if (!cancelado) setResultadoLedger(r); })
      .catch(() => { if (!cancelado) setResultadoLedger(null); })
      .finally(() => { if (!cancelado) setCargandoLedger(false); });
    return () => { cancelado = true; };
  }, [rangoLedger.desde, rangoLedger.hasta]);

  const enviosFiltrados = useMemo(
    () => (mesFiltro ? envios.filter((e) => nombreMes(e.fechaISO) === mesFiltro) : envios),
    [envios, mesFiltro]
  );
  const gastosFiltrados = useMemo(
    () => (mesFiltro ? gastos.filter((g) => nombreMes(g.fechaISO) === mesFiltro) : gastos),
    [gastos, mesFiltro]
  );
  const ingresosFiltrados = useMemo(
    () => (mesFiltro ? ingresos.filter((i) => nombreMes(i.fechaISO) === mesFiltro) : ingresos),
    [ingresos, mesFiltro]
  );
  // Costos de Aduana/Flete (ej. Darío Import): NO se registran como gasto
  // operativo, sino como factura de proveedor (ver FinanzasProveedores.jsx),
  // por eso hay que traerlos aparte para que el dashboard los refleje.
  const facturasProveedorFiltradas = useMemo(
    () => (mesFiltro ? facturasProveedor.filter((f) => nombreMes(f.fechaISO) === mesFiltro) : facturasProveedor),
    [facturasProveedor, mesFiltro]
  );

  const ventasPaq = enviosFiltrados.reduce((a, e) => a + numero(e.total), 0);
  // OJO: gananciaReal (por envío) YA tiene restado el costo interno
  // ESTIMADO (peso × tarifa interna) — ver calcularTotalesTrackings() en
  // calculosPaqueteria.js. Por eso NO se puede volver a restar el monto
  // REAL de la factura del proveedor acá, o el costo del flete se
  // contaría dos veces. Solo se resta la DIFERENCIA (real − estimado):
  // si Darío cobra justo lo estimado, la diferencia es $0 y no cambia
  // nada; si cobra más, se resta esa parte extra; si cobra menos, se
  // suma de vuelta lo que se había sobrestimado.
  const gananciaPaq = enviosFiltrados.reduce((a, e) => a + numero(e.gananciaReal), 0);
  const totalGastos = gastosFiltrados.reduce((a, g) => a + numero(g.monto), 0);
  const totalOtrosIngresos = ingresosFiltrados.reduce((a, i) => a + numero(i.monto), 0);
  const costosAduanaFlete = facturasProveedorFiltradas.reduce((a, f) => a + numero(f.montoReal), 0);
  const saldoAduanaFlete = facturasProveedorFiltradas.reduce((a, f) => a + numero(f.saldo), 0);
  const diferenciaAduanaFlete = facturasProveedorFiltradas.reduce((a, f) => a + numero(f.diferencia), 0);
  const utilidadNeta = gananciaPaq + totalOtrosIngresos - totalGastos - diferenciaAduanaFlete;
  // Ingresos totales = todo lo que entra, antes de restar nada — el
  // primer renglón de cualquier estado de resultados.
  const ingresosTotales = ventasPaq + totalOtrosIngresos;

  // === Costos por proveedor de Aduana/Flete, para el desglose (ej. si en
  // el futuro hay más de uno además de Darío Import) ===
  const costosPorProveedorAduanaFlete = useMemo(() => {
    const mapa = new Map();
    facturasProveedorFiltradas.forEach((f) => {
      const prov = proveedores.find((p) => p.id === f.proveedorId);
      const nombre = prov?.nombre || "Proveedor eliminado";
      if (!mapa.has(f.proveedorId)) mapa.set(f.proveedorId, { nombre, total: 0, facturas: 0 });
      const entry = mapa.get(f.proveedorId);
      entry.total += numero(f.montoReal);
      entry.facturas += 1;
    });
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [facturasProveedorFiltradas, proveedores]);

  // === Cobrado vs pendiente de cobro ===
  // Un envío con saldo > 0 significa que el cliente todavía no ha pagado
  // completo — su parte de la ganancia real todavía no está "cobrada".
  const gananciaCobrada = enviosFiltrados
    .filter((e) => numero(e.saldo) <= 0)
    .reduce((a, e) => a + numero(e.gananciaReal), 0);
  const gananciaPendienteCobro = enviosFiltrados
    .filter((e) => numero(e.saldo) > 0)
    .reduce((a, e) => a + numero(e.gananciaReal), 0);
  const totalPorCobrar = enviosFiltrados
    .filter((e) => numero(e.saldo) > 0)
    .reduce((a, e) => a + numero(e.saldo), 0);

  const clientesPorCobrar = useMemo(() => {
    const mapa = new Map();
    enviosFiltrados.filter((e) => numero(e.saldo) > 0).forEach((e) => {
      if (!e.clienteId) return;
      if (!mapa.has(e.clienteId)) mapa.set(e.clienteId, { nombre: e.cliente, codigo: e.clienteCodigo, saldo: 0, envios: 0 });
      const entry = mapa.get(e.clienteId);
      entry.saldo += numero(e.saldo);
      entry.envios += 1;
    });
    return [...mapa.values()].sort((a, b) => b.saldo - a.saldo);
  }, [enviosFiltrados]);

  const kpis = { ventasPaq, gananciaPaq, totalOtrosIngresos, totalGastos, costosAduanaFlete, diferenciaAduanaFlete, utilidadNeta };

  // === Ventas, ganancia y balance por mes (siempre TODOS los meses, es la
  // vista de contexto general — no se filtra, para poder comparar meses). ===
  const ventasPorMes = useMemo(() => {
    const mapa = new Map();
    const acumular = (fechaISO, campo, valor) => {
      const key = nombreMes(fechaISO);
      if (!mapa.has(key)) mapa.set(key, { mes: key, paqueteria: 0, gananciaPaq: 0, gastos: 0, otrosIngresos: 0, costosProveedor: 0, diferenciaProveedor: 0 });
      mapa.get(key)[campo] += valor;
    };
    envios.forEach((e) => {
      acumular(e.fechaISO, "paqueteria", numero(e.total));
      acumular(e.fechaISO, "gananciaPaq", numero(e.gananciaReal));
    });
    gastos.forEach((g) => acumular(g.fechaISO, "gastos", numero(g.monto)));
    ingresos.forEach((i) => acumular(i.fechaISO, "otrosIngresos", numero(i.monto)));
    facturasProveedor.forEach((f) => {
      // costosProveedor: monto real facturado, solo informativo (badge).
      // diferenciaProveedor: lo que realmente afecta el balance (ver nota
      // arriba sobre por qué no se puede restar el monto real completo).
      acumular(f.fechaISO, "costosProveedor", numero(f.montoReal));
      acumular(f.fechaISO, "diferenciaProveedor", numero(f.diferencia));
    });
    return [...mapa.values()]
      .map((m) => ({ ...m, balance: m.gananciaPaq + m.otrosIngresos - m.gastos - m.diferenciaProveedor }))
      .sort((a, b) => (a.mes < b.mes ? 1 : -1));
  }, [envios, gastos, ingresos, facturasProveedor]);

  // === Gastos por categoría (respeta el filtro de mes) — ya no se muestra
  // en el Resumen (vive en Finanzas → Gastos), pero se sigue usando para
  // los reportes exportados en Excel/PDF. ===
  const gastosPorCategoria = useMemo(() => {
    const mapa = new Map();
    gastosFiltrados.forEach((g) => mapa.set(g.categoria, (mapa.get(g.categoria) || 0) + numero(g.monto)));
    return [...mapa.entries()].map(([categoria, monto]) => ({ categoria, monto, pct: totalGastos > 0 ? (monto / totalGastos) * 100 : 0 })).sort((a, b) => b.monto - a.monto);
  }, [gastosFiltrados, totalGastos]);

  // === Top clientes (respeta el filtro de mes) ===
  const topClientes = useMemo(() => {
    const mapa = new Map();
    const acumular = (clienteId, nombre, codigo, valor) => {
      if (!clienteId) return;
      const key = clienteId;
      if (!mapa.has(key)) mapa.set(key, { nombre, codigo, total: 0, pedidos: 0 });
      const entry = mapa.get(key);
      entry.total += valor;
      entry.pedidos += 1;
    };
    enviosFiltrados.forEach((e) => acumular(e.clienteId, e.cliente, e.clienteCodigo, numero(e.total)));
    return [...mapa.values()].sort((a, b) => b.total - a.total).slice(0, 8);
  }, [enviosFiltrados]);

  const exportarExcel = () => {
    exportarReporteFinancieroExcel({
      pedidos: [], envios: enviosFiltrados, gastos: gastosFiltrados,
      ventasPorMes, gastosPorCategoria, topClientes, kpis
    });
    mostrarToast(`Reporte Excel descargado${mesFiltro ? ` (${mesFiltro})` : ""}.`);
  };

  const exportarPDF = () => {
    generarPDFReporteFinanciero({ ventasPorMes, gastosPorCategoria, topClientes, kpis, empresa });
    mostrarToast(`Reporte PDF descargado${mesFiltro ? ` (${mesFiltro})` : ""}.`);
  };

  const togglePanel = (panel) => setPanelAbierto((actual) => (actual === panel ? null : panel));

  return (
    <div className="page">
      <PageTitle title="Finanzas" subtitle="Ventas, ganancia real, gastos e informes">
        <button className={`nav-btn ${vista === "resumen" ? "active" : ""}`} onClick={() => setVista("resumen")}>Resumen</button>
        <button className={`nav-btn ${vista === "ingresos" ? "active" : ""}`} onClick={() => setVista("ingresos")}>Ingresos</button>
        <button className={`nav-btn ${vista === "gastos" ? "active" : ""}`} onClick={() => setVista("gastos")}>Gastos</button>
        <button className={`nav-btn ${vista === "proveedores" ? "active" : ""}`} onClick={() => setVista("proveedores")}>Proveedores</button>
        <button className={`nav-btn ${vista === "cuentas" ? "active" : ""}`} onClick={() => setVista("cuentas")}>Cuentas</button>
        <button className={`nav-btn ${vista === "apertura" ? "active" : ""}`} onClick={() => setVista("apertura")}>Balance inicial</button>
        <button className={`nav-btn ${vista === "libro" ? "active" : ""}`} onClick={() => setVista("libro")}>Libro diario</button>
        <button className={`nav-btn ${vista === "caja" ? "active" : ""}`} onClick={() => setVista("caja")}>Corte de caja</button>
        <button className={`nav-btn ${vista === "resultados" ? "active" : ""}`} onClick={() => setVista("resultados")}>Estado de resultados</button>
      </PageTitle>

      {vista === "resumen" && (
        <div className="segment mt-8">
          <select className="input input-sm" value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)}>
            <option value="">Todos los meses</option>
            {mesesDisponibles.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button className="btn" onClick={exportarExcel}>Exportar Excel</button>
          <button className="btn" onClick={exportarPDF}>Exportar PDF</button>
        </div>
      )}

      {vista === "ingresos" && (
        <FinanzasIngresos
          ingresos={ingresos}
          clientes={clientes}
          cuentasDinero={cuentasDinero}
          rol={rol}
          auth={auth}
          mostrarToast={mostrarToast}
          cargarDatos={cargarDatos}
        />
      )}

      {vista === "gastos" && (
        <FinanzasGastos
          gastos={gastos}
          proveedores={proveedores}
          cuentasDinero={cuentasDinero}
          rol={rol}
          auth={auth}
          mostrarToast={mostrarToast}
          cargarDatos={cargarDatos}
        />
      )}

      {vista === "proveedores" && (
        <FinanzasProveedores
          proveedores={proveedores}
          prealertas={prealertas}
          facturasProveedor={facturasProveedor}
          cuentasDinero={cuentasDinero}
          empresa={empresa}
          rol={rol}
          auth={auth}
          mostrarToast={mostrarToast}
          cargarDatos={cargarDatos}
        />
      )}

      {vista === "cuentas" && (
        <FinanzasCuentas
          cuentasContables={cuentasContables}
          cuentasDinero={cuentasDinero}
          empresa={empresa}
          rol={rol}
          auth={auth}
          mostrarToast={mostrarToast}
          cargarDatos={cargarDatos}
        />
      )}

      {vista === "apertura" && (
        <FinanzasBalanceApertura
          cuentasContables={cuentasContables}
          cuentasDinero={cuentasDinero}
          balanceApertura={balanceApertura}
          fechaApertura={fechaApertura}
          rol={rol}
          auth={auth}
          mostrarToast={mostrarToast}
          cargarDatos={cargarDatos}
        />
      )}

      {vista === "libro" && <FinanzasLibroDiario />}

      {vista === "caja" && (
        <FinanzasCorteCaja
          cuentasDinero={cuentasDinero}
          auth={auth}
          mostrarToast={mostrarToast}
          cargarDatos={cargarDatos}
        />
      )}

      {vista === "resultados" && <FinanzasEstadoResultados />}

      {vista === "resumen" && (
      <>
      <div className="page-title" style={{ margin: "16px 0 4px" }}>
        <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <Landmark size={18} style={{ color: "var(--module-color)" }} /> Resumen contable{mesFiltro ? ` — ${mesFiltro}` : ""}
        </h3>
        {cargandoLedger && <small style={{ opacity: 0.6 }}>Calculando desde el libro diario...</small>}
      </div>
      <div className="grid-4">
        <TarjetaKPI etiqueta="Ingresos totales" valor={resultadoLedger?.ingresos ?? ingresosTotales} icono={TrendingUp} color="var(--success)" activa={false} etiquetaAccion="Ventas + otros ingresos" onClick={() => togglePanel("paqueteria")} />
        <TarjetaKPI etiqueta="Costos" valor={resultadoLedger?.costos ?? costosAduanaFlete} icono={PiggyBank} color="var(--warning, #b7791f)" activa={false} etiquetaAccion="Ir a Proveedores →" onClick={() => setVista("proveedores")} />
        <TarjetaKPI etiqueta="Gastos operativos" valor={resultadoLedger?.gastos ?? totalGastos} icono={TrendingDown} color="var(--danger)" activa={false} etiquetaAccion="Ir a Gastos →" onClick={() => setVista("gastos")} />
        <TarjetaKPI etiqueta="Utilidad neta" valor={resultadoLedger?.utilidad ?? utilidadNeta} icono={LineChart} color={(resultadoLedger?.utilidad ?? utilidadNeta) >= 0 ? "var(--success)" : "var(--danger)"} activa={false} etiquetaAccion="Ver Estado de Resultados →" onClick={() => setVista("resultados")} />
      </div>

      {!cargandoLedger && resultadoLedger && Math.abs(resultadoLedger.utilidad - utilidadNeta) > 0.5 && (
        <div className="info-box" style={{ borderColor: "var(--warning, #b7791f)" }}>
          ⚠️ El libro diario (${resultadoLedger.utilidad.toFixed(2)}) y el cálculo rápido operativo (${utilidadNeta.toFixed(2)}) no coinciden — diferencia de ${Math.abs(resultadoLedger.utilidad - utilidadNeta).toFixed(2)}.
          <br /><small>Lo más probable: algún gasto, ingreso o pago se registró sin elegir una cuenta de dinero (o la cuenta elegida no está vinculada a una cuenta contable), así que no posteó al libro diario. Revisa Finanzas → Libro diario para encontrar qué falta.</small>
        </div>
      )}

      <div className="info-box" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span>
          Las 4 tarjetas de arriba salen directo del libro diario — es el <b>mismo cálculo exacto</b> que el Estado de Resultados, no uno aparte.
          <br /><small>El resto de esta pantalla (Paquetería, Costos por proveedor, etc.) sigue siendo el detalle operativo rápido, calculado directo de los registros — útil para auditar, pero el número que manda es el de arriba.</small>
        </span>
        <button className="btn btn-ghost" onClick={() => setVista("resultados")} style={{ whiteSpace: "nowrap" }}>
          Ver Estado de Resultados <ArrowRight size={14} style={{ verticalAlign: "-2px", marginLeft: 4 }} />
        </button>
      </div>

      <div className="page-title" style={{ margin: "24px 0 4px" }}>
        <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <TrendingUp size={18} style={{ color: "var(--module-color)" }} /> Paquetería{mesFiltro ? ` — ${mesFiltro}` : ""}
        </h3>
      </div>
      <div className="grid-4">
        <TarjetaKPI etiqueta="Ventas Paquetería" valor={ventasPaq} icono={TrendingUp} activa={panelAbierto === "paqueteria"} onClick={() => togglePanel("paqueteria")} />
        <TarjetaKPI etiqueta="Ganancia real Paquetería" valor={gananciaPaq} icono={LineChart} activa={panelAbierto === "ganancia"} onClick={() => togglePanel("ganancia")} />
        <TarjetaKPI etiqueta="Otros ingresos" valor={totalOtrosIngresos} icono={PiggyBank} color="var(--success)" activa={false} etiquetaAccion="Ir a Ingresos →" onClick={() => setVista("ingresos")} />
      </div>

      <div className="card">
        <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}><Users size={18} style={{ color: "var(--module-color)" }} /> Cuentas por cobrar{mesFiltro ? ` — ${mesFiltro}` : ""}</h3>
        <p>La ganancia real de Paquetería incluye envíos que el cliente todavía no ha terminado de pagar.</p>
        <div className="grid-4 mt-16">
          <div className="metric"><b>Ganancia cobrada</b><span className="metric-value">${gananciaCobrada.toFixed(2)}</span></div>
          <div className="metric"><b>Ganancia pendiente de cobro</b><span className="metric-value">${gananciaPendienteCobro.toFixed(2)}</span></div>
          <div className="metric"><b>Total por cobrar (saldo)</b><span className="metric-value">${totalPorCobrar.toFixed(2)}</span></div>
          <div className="metric"><b>Clientes con saldo</b><span className="metric-value">{clientesPorCobrar.length}</span></div>
        </div>
        <div className="list mt-16">
          {clientesPorCobrar.map((c) => (
            <div key={c.codigo || c.nombre} className="row-card">
              <div><b>{c.nombre}</b> <span className="badge badge-info">{c.codigo || "Sin código"}</span><p>{c.envios} envío(s) con saldo pendiente</p></div>
              <b style={{ color: "#c0392b" }}>${c.saldo.toFixed(2)}</b>
            </div>
          ))}
          {clientesPorCobrar.length === 0 && <p>Nadie tiene saldo pendiente en este período. 🎉</p>}
        </div>
      </div>

      <div className="card">
        <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}><Wallet size={18} style={{ color: "var(--module-color)" }} /> Dinero disponible</h3>
        <p>Saldo actual de cada cuenta de caja/banco — se actualiza automáticamente con cada gasto, ingreso o pago registrado que la elige.</p>
        <div className="list mt-16">
          {cuentasDinero.filter((c) => c.activa !== false).map((c) => (
            <div key={c.id} className="row-card">
              <div><b>{c.nombre}</b> <span className="badge badge-neutral">{c.tipo === "banco" ? "Banco" : "Efectivo"}</span></div>
              <b>{formatoMoneda(c.saldoActual ?? c.saldo_actual, c.moneda)}</b>
            </div>
          ))}
          {cuentasDinero.length === 0 && <p>Todavía no has creado cuentas de dinero.</p>}
        </div>
        <button className="btn mt-16" onClick={() => setVista("cuentas")}>Ir a Cuentas →</button>
      </div>

      <div className="card">
        <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}><PiggyBank size={18} style={{ color: "var(--module-color)" }} /> Costos por proveedor{mesFiltro ? ` — ${mesFiltro}` : ""}</h3>
        <p>Lo que facturan tus proveedores (Aduana/Flete y Transporte local) — se registra por factura, no como gasto operativo, y también se descuenta de la utilidad neta.</p>
        <div className="grid-4 mt-16">
          <div className="metric"><b>Total facturado (real)</b><span className="metric-value">${costosAduanaFlete.toFixed(2)}</span></div>
          <div className="metric">
            <b>Diferencia vs. estimado</b>
            <span className="metric-value" style={{ color: diferenciaAduanaFlete > 0 ? "var(--danger)" : "var(--success)" }}>
              {diferenciaAduanaFlete >= 0 ? "+" : ""}${diferenciaAduanaFlete.toFixed(2)}
            </span>
            <small style={{ display: "block", marginTop: 4, opacity: .6 }}>Esto es lo único que se resta en la utilidad neta</small>
          </div>
          <div className="metric"><b>Saldo pendiente de pago</b><span className="metric-value">${saldoAduanaFlete.toFixed(2)}</span></div>
          <div className="metric"><b>Facturas en el período</b><span className="metric-value">{facturasProveedorFiltradas.length}</span></div>
        </div>
        <div className="list mt-16">
          {costosPorProveedorAduanaFlete.map((p) => (
            <div key={p.nombre} className="row-card">
              <div><b>{p.nombre}</b><p>{p.facturas} factura(s)</p></div>
              <b>${p.total.toFixed(2)}</b>
            </div>
          ))}
          {costosPorProveedorAduanaFlete.length === 0 && <p>Sin facturas de Aduana/Flete en este período.</p>}
        </div>
        <button className="btn mt-16" onClick={() => setVista("proveedores")}>Ir a Proveedores →</button>
      </div>

      {/* === Detalle de la tarjeta seleccionada, para auditoría === */}
      {panelAbierto === "paqueteria" && (
        <div className="card">
          <h3>Detalle · Ventas Paquetería{mesFiltro ? ` — ${mesFiltro}` : ""}</h3>
          <div className="list mt-16">
            {enviosFiltrados.map((e) => (
              <div key={e.id} className="row-card">
                <div><b>{e.numero}</b> <span className="badge badge-neutral">{e.estado}</span><p>{e.cliente} · {e.clienteCodigo || "Sin registrar"} · {e.destino}</p><small>{e.fecha}</small></div>
                <b>${numero(e.total).toFixed(2)}</b>
              </div>
            ))}
            {enviosFiltrados.length === 0 && <p>Sin envíos en este período.</p>}
          </div>
        </div>
      )}

      {panelAbierto === "ganancia" && (
        <div className="card">
          <h3>Detalle · Ganancia real Paquetería{mesFiltro ? ` — ${mesFiltro}` : ""}</h3>
          <div className="list mt-16">
            {enviosFiltrados.map((e) => (
              <div key={e.id} className="row-card">
                <div><b>{e.numero}</b><p>{e.cliente} · Total ${numero(e.total).toFixed(2)} − costo interno ${numero(e.costoInternoTotal).toFixed(2)}</p><small>{e.fecha}</small></div>
                <b>${numero(e.gananciaReal).toFixed(2)}</b>
              </div>
            ))}
            {enviosFiltrados.length === 0 && <p>Sin envíos en este período.</p>}
          </div>
        </div>
      )}

      <div className="card">
        <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}><LineChart size={18} style={{ color: "var(--module-color)" }} /> Ventas, gastos y balance por mes</h3>
        <p>Balance = ganancia real de Paquetería del mes − gastos del mes − costos de Aduana/Flete del mes. Haz clic en un mes para filtrar toda la página por ese período.</p>
        <div className="list mt-16">
          {ventasPorMes.map((m) => (
            <button
              type="button"
              key={m.mes}
              className="row-card"
              onClick={() => setMesFiltro(m.mes)}
              style={{ cursor: "pointer", width: "100%", textAlign: "left", border: mesFiltro === m.mes ? "2px solid #F4562D" : undefined }}
            >
              <div><b>{m.mes}</b></div>
              <div className="segment">
                <span className="badge badge-info">Paquetería ${m.paqueteria.toFixed(2)}</span>
                <span className="badge badge-success">Otros ingresos ${m.otrosIngresos.toFixed(2)}</span>
                <span className="badge badge-danger">Gastos ${m.gastos.toFixed(2)}</span>
                <span className="badge badge-neutral">Aduana/Flete facturado ${m.costosProveedor.toFixed(2)}</span>
                <span className="badge badge-danger">Ajuste Aduana/Flete {m.diferenciaProveedor >= 0 ? "+" : ""}${m.diferenciaProveedor.toFixed(2)}</span>
                <span
                  className="badge badge-info"
                  style={{ color: m.balance >= 0 ? "#1a7f37" : "#c0392b", fontWeight: "bold" }}
                >
                  Balance ${m.balance.toFixed(2)}
                </span>
              </div>
            </button>
          ))}
          {ventasPorMes.length === 0 && <p>Todavía no hay movimientos para agrupar por mes.</p>}
        </div>
      </div>

      <div className="card">
        <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}><Users size={18} style={{ color: "var(--module-color)" }} /> Top clientes por monto total{mesFiltro ? ` — ${mesFiltro}` : ""}</h3>
        <div className="list mt-16">
          {topClientes.map((c) => (
            <div key={c.codigo} className="row-card">
              <div><b>{c.nombre}</b> <span className="badge badge-info">{c.codigo}</span><p>{c.pedidos} envío(s)</p></div>
              <b>${c.total.toFixed(2)}</b>
            </div>
          ))}
          {topClientes.length === 0 && <p>Todavía no hay envíos vinculados a un cliente en este período.</p>}
        </div>
      </div>
      </>
      )}
    </div>
  );
}