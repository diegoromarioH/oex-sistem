// src/pages/paqueteria/Paqueteria.jsx
import { useEffect, useState } from "react";
import PageTitle from "../../components/PageTitle";
import PaqueteriaRecibo from "./PaqueteriaRecibo";
import PaqueteriaDashboard from "./PaqueteriaDashboard";
import EnviosList from "./EnviosList";
import Prealertas from "./Prealertas";
import RegistrarTracking from "./RegistrarTracking";
import TrackingsActivos from "./TrackingsActivos";
import { esPendienteDeConfirmar } from "../../utils/estadosEnvio";

export default function Paqueteria({ envios, prealertas, facturasProveedor, auditLog, clientes, rol, tarifas, empresa, cuentasDinero = [], auth, mostrarToast, cargarDatos, vistaInicial = "dashboard" }) {
  const [vista, setVista] = useState(vistaInicial);
  // El mega-menú del TopNav (App.jsx) puede pedir que Paquetería abra
  // directo en una sub-página específica aunque el módulo ya esté
  // montado — este efecto es lo que hace que el clic en el mega-menú
  // realmente navegue, no solo la primera vez que se entra al módulo.
  useEffect(() => { setVista(vistaInicial); }, [vistaInicial]);
  const pendientesConfirmar = prealertas.filter(esPendienteDeConfirmar).length;
  const trackingsActivos = prealertas.length - pendientesConfirmar;

  return (
    <div className="page">
      <PageTitle title="Paquetería" subtitle="Trackings, tarifas por destino/tipo y seguimiento de envíos">
        <button className={`nav-btn ${vista === "dashboard" ? "active" : ""}`} onClick={() => setVista("dashboard")}>Dashboard</button>
        <button className={`nav-btn ${vista === "lista" ? "active" : ""}`} onClick={() => setVista("lista")}>Recibos</button>
        <button className={`nav-btn ${vista === "nuevo" ? "active" : ""}`} onClick={() => setVista("nuevo")}>+ Generar recibo</button>
        <button className={`nav-btn ${vista === "registrar" ? "active" : ""}`} onClick={() => setVista("registrar")}>+ Registrar tracking</button>
        <button className={`nav-btn ${vista === "prealertas" ? "active" : ""}`} onClick={() => setVista("prealertas")}>Prealertas ({pendientesConfirmar})</button>
        <button className={`nav-btn ${vista === "activos" ? "active" : ""}`} onClick={() => setVista("activos")}>Envíos activos ({trackingsActivos})</button>
      </PageTitle>

      {vista === "dashboard" && <PaqueteriaDashboard envios={envios} prealertas={prealertas} auditLog={auditLog} rol={rol} tarifas={tarifas} empresa={empresa} cuentasDinero={cuentasDinero} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} />}
      {vista === "nuevo" && <PaqueteriaRecibo prealertas={prealertas} clientes={clientes} tarifas={tarifas} empresa={empresa} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} />}
      {vista === "registrar" && <RegistrarTracking clientes={clientes} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} />}
      {vista === "prealertas" && <Prealertas prealertas={prealertas} clientes={clientes} rol={rol} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} />}
      {vista === "activos" && <TrackingsActivos prealertas={prealertas} facturasProveedor={facturasProveedor} auditLog={auditLog} rol={rol} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} />}
      {vista === "lista" && <EnviosList envios={envios} auditLog={auditLog} rol={rol} tarifas={tarifas} empresa={empresa} cuentasDinero={cuentasDinero} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} />}
    </div>
  );
}