// src/pages/paqueteria/Paqueteria.jsx
import PageTitle from "../../components/PageTitle";
import PaqueteriaRecibo from "./PaqueteriaRecibo";
import PaqueteriaDashboard from "./PaqueteriaDashboard";
import EnvioItem from "./EnvioItem";
import EnviosList from "./EnviosList";
import Prealertas from "./Prealertas";
import RegistrarTracking from "./Registrartracking";
import TrackingsActivos from "./TrackingsActivos";
import DarioImport from "./DarioImport";
import GlobalConnection from "./GlobalConnection";
import { esPendienteDeConfirmar } from "../../utils/estadosEnvio";

export default function Paqueteria({ registroId, envios, prealertas, facturasProveedor, auditLog, clientes, proveedores = [], rol, tarifas, configOperativa, empresa, cuentasDinero = [], auth, mostrarToast, cargarDatos, vistaInicial: vista = "dashboard", onNavigate }) {
  const setVista = (subvista) => onNavigate("paqueteria", subvista);
  const recibo = registroId == null ? null : envios.find((envio) => envio.id === registroId);

  const pendientesConfirmar = prealertas.filter(esPendienteDeConfirmar).length;
  const trackingsActivos = prealertas.filter((t) => !esPendienteDeConfirmar(t) && t.estado !== "Entregado").length;

  return (
    <div className="page paqueteria-page">
      <PageTitle title="Paquetería" subtitle="Trackings, tarifas por destino/tipo y seguimiento de envíos">
        <button className={`nav-btn ${vista === "dashboard" ? "active" : ""}`} onClick={() => setVista("dashboard")}>Dashboard</button>
        <button className={`nav-btn ${vista === "lista" ? "active" : ""}`} onClick={() => setVista("lista")}>Recibos</button>
        <button className={`nav-btn ${vista === "nuevo" ? "active" : ""}`} onClick={() => setVista("nuevo")}>+ Generar recibo</button>
        <button className={`nav-btn ${vista === "registrar" ? "active" : ""}`} onClick={() => setVista("registrar")}>+ Registrar tracking</button>
        <button className={`nav-btn ${vista === "prealertas" ? "active" : ""}`} onClick={() => setVista("prealertas")}>Prealertas ({pendientesConfirmar})</button>
        <button className={`nav-btn nav-btn-envios-activos ${vista === "activos" ? "active" : ""}`} onClick={() => setVista("activos")}>Envíos activos ({trackingsActivos})</button>
        <button className={`nav-btn ${vista === "dario" ? "active" : ""}`} onClick={() => setVista("dario")}>Darío Import</button>
        <button className={`nav-btn ${vista === "global" ? "active" : ""}`} onClick={() => setVista("global")}>Global Connect</button>
      </PageTitle>

      {registroId != null && <button type="button" className="btn btn-ghost mt-8" onClick={() => setVista(vista)}>← Ver lista completa</button>}
      {vista === "dashboard" && <PaqueteriaDashboard envios={envios} prealertas={prealertas} auditLog={auditLog} rol={rol} tarifas={tarifas} empresa={empresa} cuentasDinero={cuentasDinero} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} />}
      {vista === "nuevo" && <PaqueteriaRecibo onVerRecibo={(id) => onNavigate("paqueteria", "lista", id)} prealertas={prealertas} clientes={clientes} tarifas={tarifas} proveedores={proveedores} configOperativa={configOperativa} empresa={empresa} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} />}
      {vista === "registrar" && <RegistrarTracking configOperativa={configOperativa} clientes={clientes} proveedores={proveedores} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} />}
      {vista === "prealertas" && <Prealertas key={registroId ?? "lista"} registroId={registroId} prealertas={prealertas} clientes={clientes} proveedores={proveedores} configOperativa={configOperativa} rol={rol} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} />}
      {vista === "activos" && <TrackingsActivos key={registroId ?? "lista"} registroId={registroId} configOperativa={configOperativa} prealertas={prealertas} envios={envios} clientes={clientes} proveedores={proveedores} facturasProveedor={facturasProveedor} auditLog={auditLog} rol={rol} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} onNavigate={onNavigate} />}
      {vista === "dario" && <DarioImport prealertas={prealertas} envios={envios} tarifas={tarifas} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} />}
      {vista === "global" && <GlobalConnection clientes={clientes} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} />}
      {vista === "lista" && registroId != null && (recibo
        ? <EnvioItem key={recibo.id} envio={recibo} auditLog={auditLog} rol={rol} tarifas={tarifas} empresa={empresa} cuentasDinero={cuentasDinero} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} />
        : <p>El recibo ya no está disponible.</p>)}
      {vista === "lista" && registroId == null && <EnviosList envios={envios} auditLog={auditLog} rol={rol} tarifas={tarifas} empresa={empresa} cuentasDinero={cuentasDinero} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} />}
    </div>
  );
}
