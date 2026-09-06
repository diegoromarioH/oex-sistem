// src/App.jsx
import { useEffect, useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { useDatosOEX } from "./hooks/useDatosOEX";
import { useTarifas } from "./hooks/useTarifas";
import { useEmpresa } from "./hooks/useEmpresa";
import { useToast } from "./hooks/useToast";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Paqueteria from "./pages/paqueteria/Paqueteria";
import Finanzas from "./pages/finanzas/Finanzas";
import FinanzasReportes from "./pages/finanzas/FinanzasReportes";
import Clientes from "./pages/Clientes";
import Auditoria from "./pages/Auditoria";
import Configuracion from "./pages/Configuracion";
import Toast from "./components/Toast";
import SidebarNav from "./components/SidebarNav";
import logo from "./assets/logo.svg";
import "./styles/sidebar.css";
import { LayoutDashboard, Package, Wallet, Users, ShieldCheck, Settings, Receipt, FilePlus, PackagePlus, Bell, Truck, BarChart3, TrendingUp, TrendingDown, Landmark, Calculator, FileBarChart } from "lucide-react";

const MODULOS = [
  { id: "dashboard", label: "Dashboard", color: "var(--mod-dashboard)", icon: LayoutDashboard },
  { id: "paqueteria", label: "Paquetería", color: "var(--mod-paqueteria)", icon: Package, submenu: [
    { subvista: "dashboard", label: "Dashboard", descripcion: "KPIs, filtros y recibos activos", icon: LayoutDashboard },
    { subvista: "lista", label: "Recibos", descripcion: "Todos los recibos generados", icon: Receipt },
    { subvista: "nuevo", label: "Generar recibo", descripcion: "Crear recibo de trackings listos", icon: FilePlus },
    { subvista: "registrar", label: "Registrar tracking", descripcion: "Alta manual ligada a un cliente", icon: PackagePlus },
    { subvista: "prealertas", label: "Prealertas", descripcion: "Trackings sin confirmar de la landing", icon: Bell },
    { subvista: "activos", label: "Envíos activos", descripcion: "Trackings avanzando por el pipeline", icon: Truck }
  ]},
  { id: "finanzas", label: "Finanzas", color: "var(--mod-finanzas)", icon: Wallet, submenu: [
    { subvista: "resumen", label: "Resumen", descripcion: "KPIs, balance y costos del mes", icon: BarChart3 },
    { subvista: "ingresos", label: "Ingresos", descripcion: "Otros ingresos fuera de ventas", icon: TrendingUp },
    { subvista: "gastos", label: "Gastos", descripcion: "Gastos operativos por categoría", icon: TrendingDown },
    { subvista: "proveedores", label: "Proveedores", descripcion: "Facturas y pagos a proveedores", icon: Truck },
    { subvista: "cuentas", label: "Cuentas", descripcion: "Catálogo contable y cajas/bancos", icon: Landmark },
    { subvista: "caja", label: "Corte de caja", descripcion: "Apertura y cierre diario de efectivo", icon: Calculator },
    { subvista: "reportes", label: "Reportes", descripcion: "Resultados, libro diario y balance general", icon: FileBarChart }
  ]},
  { id: "clientes", label: "Clientes", color: "var(--mod-clientes)", icon: Users },
  { id: "auditoria", label: "Auditoría", color: "var(--mod-auditoria)", icon: ShieldCheck },
  { id: "configuracion", label: "Configuración", color: "var(--mod-configuracion)", icon: Settings }
];

const STORAGE_NAVEGACION = { vista: "oex_vista_actual", paqueteria: "oex_subvista_paqueteria", finanzas: "oex_subvista_finanzas" };
const vistaGuardadaValida = () => { const guardada = localStorage.getItem(STORAGE_NAVEGACION.vista); return MODULOS.some(m => m.id === guardada) ? guardada : "dashboard"; };
const subvistaGuardadaValida = (moduloId, fallback) => { const modulo = MODULOS.find(m => m.id === moduloId); const key = moduloId === "paqueteria" ? STORAGE_NAVEGACION.paqueteria : STORAGE_NAVEGACION.finanzas; const guardada = localStorage.getItem(key); return modulo?.submenu?.some(s => s.subvista === guardada) ? guardada : fallback; };

export default function App() {
  const { session, usuarioActual, rol, cargandoAuth, login, logout } = useAuth();
  const datos = useDatosOEX(session);
  const { tarifas, setTarifas } = useTarifas();
  const { empresa, setEmpresa } = useEmpresa();
  const { toast, mostrarToast } = useToast();
  const [vista, setVista] = useState(vistaGuardadaValida);
  const [subvistaPaqueteria, setSubvistaPaqueteria] = useState(() => subvistaGuardadaValida("paqueteria", "dashboard"));
  const [subvistaFinanzas, setSubvistaFinanzas] = useState(() => subvistaGuardadaValida("finanzas", "resumen"));
  useEffect(() => { localStorage.setItem(STORAGE_NAVEGACION.vista, vista); }, [vista]);
  useEffect(() => { localStorage.setItem(STORAGE_NAVEGACION.paqueteria, subvistaPaqueteria); }, [subvistaPaqueteria]);
  useEffect(() => { localStorage.setItem(STORAGE_NAVEGACION.finanzas, subvistaFinanzas); }, [subvistaFinanzas]);
  const irAPrealertas = () => { setVista("paqueteria"); setSubvistaPaqueteria("prealertas"); };
  const navegarA = (moduloId, subvista) => { setVista(moduloId); if (moduloId === "paqueteria") setSubvistaPaqueteria(subvista || "dashboard"); if (moduloId === "finanzas") setSubvistaFinanzas(subvista || "resumen"); setSidebarAbiertoMovil(false); };
  const [tema, setTema] = useState(() => localStorage.getItem("oex_tema") || "light");
  const [sidebarColapsado, setSidebarColapsado] = useState(() => localStorage.getItem("oex_sidebar_colapsado") === "1");
  const [sidebarAbiertoMovil, setSidebarAbiertoMovil] = useState(false);
  const toggleSidebarColapsado = () => setSidebarColapsado(actual => { const nuevo = !actual; localStorage.setItem("oex_sidebar_colapsado", nuevo ? "1" : "0"); return nuevo; });
  const cambiarTema = nuevo => { setTema(nuevo); localStorage.setItem("oex_tema", nuevo); };
  if (cargandoAuth) return <div className="page">Cargando…</div>;
  if (!session) return <Login onLogin={login} />;
  const auth = { session, usuarioActual };
  const moduloActivo = MODULOS.find(m => m.id === vista);
  const propsFinanzas = { pedidos:datos.pedidos, envios:datos.envios, gastos:datos.gastos, ingresos:datos.ingresos, clientes:datos.clientes, prealertas:datos.prealertas, proveedores:datos.proveedores, facturasProveedor:datos.facturasProveedor, cuentasContables:datos.cuentasContables, cuentasDinero:datos.cuentasDinero, balanceApertura:datos.balanceApertura, fechaApertura:datos.fechaApertura, empresa, rol, auth, mostrarToast, cargarDatos:datos.cargarDatos };
  return <div className="app-shell app-shell--sidebar" data-theme={tema} style={{ "--module-color": moduloActivo?.color }}>
    {sidebarAbiertoMovil && <div className="sidebar-backdrop" onClick={() => setSidebarAbiertoMovil(false)} />}
    <SidebarNav modulos={MODULOS} vistaActiva={vista} onNavigate={navegarA} colapsado={sidebarColapsado} onToggleColapso={toggleSidebarColapsado} abiertoMovil={sidebarAbiertoMovil} brand={<img src={logo} alt="OEX" />} brandLabel="OEX Sistema" />
    <div className="main-column"><div className="topbar-mini"><button className="hamburger" onClick={() => setSidebarAbiertoMovil(true)} aria-label="Abrir menú"><svg width="18" height="18" viewBox="0 0 18 18"><path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button><div className="segment" style={{ margin: "0 0 0 auto" }}><span className="badge badge-neutral">{usuarioActual?.nombre || usuarioActual?.email} · {rol}</span><button className="btn btn-ghost" onClick={logout}>Salir</button></div></div><div className="module-strip" />
      {vista === "dashboard" && <Dashboard pedidos={datos.pedidos} envios={datos.envios} gastos={datos.gastos} prealertas={datos.prealertas} empresa={empresa} cuentasDinero={datos.cuentasDinero} auth={auth} mostrarToast={mostrarToast} cargarDatos={datos.cargarDatos} setVista={setVista} irAPrealertas={irAPrealertas} />}
      {vista === "paqueteria" && <Paqueteria envios={datos.envios} prealertas={datos.prealertas} facturasProveedor={datos.facturasProveedor} auditLog={datos.auditLog} clientes={datos.clientes} rol={rol} tarifas={tarifas} empresa={empresa} cuentasDinero={datos.cuentasDinero} auth={auth} mostrarToast={mostrarToast} cargarDatos={datos.cargarDatos} vistaInicial={subvistaPaqueteria} />}
      {vista === "finanzas" && subvistaFinanzas !== "reportes" && <Finanzas {...propsFinanzas} vistaInicial={subvistaFinanzas} />}
      {vista === "finanzas" && subvistaFinanzas === "reportes" && <div className="page"><FinanzasReportes cuentasContables={datos.cuentasContables} mostrarToast={mostrarToast} /></div>}
      {vista === "clientes" && <Clientes clientes={datos.clientes} pedidos={datos.pedidos} envios={datos.envios} empresa={empresa} tarifas={tarifas} rol={rol} auth={auth} mostrarToast={mostrarToast} cargarDatos={datos.cargarDatos} />}
      {vista === "auditoria" && <Auditoria auditLog={datos.auditLog} />}
      {vista === "configuracion" && <Configuracion tarifas={tarifas} setTarifas={setTarifas} empresa={empresa} setEmpresa={setEmpresa} cuentasDinero={datos.cuentasDinero} rol={rol} tema={tema} setTema={cambiarTema} mostrarToast={mostrarToast} cargarDatos={datos.cargarDatos} />}
      <Toast toast={toast} />
    </div>
  </div>;
}
