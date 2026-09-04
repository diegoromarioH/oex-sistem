// src/App.jsx
// Orquestador general: sesión, navegación entre módulos y layout. Toda la
// lógica de negocio vive en src/services y src/utils; el render de cada
// módulo vive en src/pages.
import { useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { useDatosOEX } from "./hooks/useDatosOEX";
import { useTarifas } from "./hooks/useTarifas";
import { useEmpresa } from "./hooks/useEmpresa";
import { useToast } from "./hooks/useToast";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Paqueteria from "./pages/paqueteria/Paqueteria";
import Finanzas from "./pages/finanzas/Finanzas";
import Clientes from "./pages/Clientes";
import Auditoria from "./pages/Auditoria";
import Configuracion from "./pages/Configuracion";
import Toast from "./components/Toast";
import SidebarNav from "./components/SidebarNav";
import logo from "./assets/logo.svg";
import "./styles/sidebar.css";
import {
  LayoutDashboard, Package, Wallet, Users, ShieldCheck, Settings,
  Receipt, FilePlus, PackagePlus, Bell, Truck,
  BarChart3, TrendingUp, TrendingDown, Landmark, ClipboardList, BookOpen, Calculator, LineChart
} from "lucide-react";


const MODULOS = [
  { id: "dashboard", label: "Dashboard", color: "var(--mod-dashboard)", icon: LayoutDashboard },
  {
    id: "paqueteria", label: "Paquetería", color: "var(--mod-paqueteria)", icon: Package,
    submenu: [
      { subvista: "dashboard", label: "Dashboard", descripcion: "KPIs, filtros y recibos activos", icon: LayoutDashboard },
      { subvista: "lista", label: "Recibos", descripcion: "Todos los recibos generados", icon: Receipt },
      { subvista: "nuevo", label: "Generar recibo", descripcion: "Crear recibo de trackings listos", icon: FilePlus },
      { subvista: "registrar", label: "Registrar tracking", descripcion: "Alta manual ligada a un cliente", icon: PackagePlus },
      { subvista: "prealertas", label: "Prealertas", descripcion: "Trackings sin confirmar de la landing", icon: Bell },
      { subvista: "activos", label: "Envíos activos", descripcion: "Trackings avanzando por el pipeline", icon: Truck }
    ]
  },
  {
    id: "finanzas", label: "Finanzas", color: "var(--mod-finanzas)", icon: Wallet,
    submenu: [
      { subvista: "resumen", label: "Resumen", descripcion: "KPIs, balance y costos del mes", icon: BarChart3 },
      { subvista: "ingresos", label: "Ingresos", descripcion: "Otros ingresos fuera de ventas", icon: TrendingUp },
      { subvista: "gastos", label: "Gastos", descripcion: "Gastos operativos por categoría", icon: TrendingDown },
      { subvista: "proveedores", label: "Proveedores", descripcion: "Facturas y pagos a proveedores", icon: Truck },
      { subvista: "cuentas", label: "Cuentas", descripcion: "Catálogo contable y cajas/bancos", icon: Landmark },
      { subvista: "apertura", label: "Balance inicial", descripcion: "Punto de partida contable", icon: ClipboardList },
      { subvista: "libro", label: "Libro diario", descripcion: "Asientos contables generados", icon: BookOpen },
      { subvista: "caja", label: "Corte de caja", descripcion: "Apertura y cierre diario de efectivo", icon: Calculator },
      { subvista: "resultados", label: "Estado de resultados", descripcion: "Utilidad del mes, comparativo", icon: LineChart }
    ]
  },
  { id: "clientes", label: "Clientes", color: "var(--mod-clientes)", icon: Users },
  { id: "auditoria", label: "Auditoría", color: "var(--mod-auditoria)", icon: ShieldCheck },
  { id: "configuracion", label: "Configuración", color: "var(--mod-configuracion)", icon: Settings }
];

export default function App() {
  const { session, usuarioActual, rol, cargandoAuth, login, logout } = useAuth();
  const datos = useDatosOEX(session);
  const { tarifas, setTarifas } = useTarifas();
  const { empresa, setEmpresa } = useEmpresa();
  const { toast, mostrarToast } = useToast();
  const [vista, setVista] = useState("dashboard");
  // Pestaña con la que abre Paquetería/Finanzas la próxima vez que se
  // entre a ese módulo. Normalmente su propio default ("dashboard" /
  // "resumen"), pero el mega-menú del TopNav o algún atajo interno
  // (como el banner de prealertas del Dashboard) puede forzarla a una
  // sub-página específica.
  const [subvistaPaqueteria, setSubvistaPaqueteria] = useState("dashboard");
  const [subvistaFinanzas, setSubvistaFinanzas] = useState("resumen");
  const irAPrealertas = () => {
    setVista("paqueteria");
    setSubvistaPaqueteria("prealertas");
  };
  // Handler único para el sidebar: si el módulo clickeado trae una
  // sub-página específica la aplica, si no, cae en el default de ese
  // módulo. También cierra el drawer en móvil — sin esto, elegir una
  // página no cerraría el menú y taparía el contenido.
  const navegarA = (moduloId, subvista) => {
    setVista(moduloId);
    if (moduloId === "paqueteria") setSubvistaPaqueteria(subvista || "dashboard");
    if (moduloId === "finanzas") setSubvistaFinanzas(subvista || "resumen");
    setSidebarAbiertoMovil(false);
  };
  const [tema, setTema] = useState(() => localStorage.getItem("oex_tema") || "light");
  // Modo colapsado (solo íconos) — persiste igual que el tema, para que
  // no se reinicie cada vez que se recarga la página.
  const [sidebarColapsado, setSidebarColapsado] = useState(() => localStorage.getItem("oex_sidebar_colapsado") === "1");
  const [sidebarAbiertoMovil, setSidebarAbiertoMovil] = useState(false);
  const toggleSidebarColapsado = () => {
    setSidebarColapsado((actual) => {
      const nuevo = !actual;
      localStorage.setItem("oex_sidebar_colapsado", nuevo ? "1" : "0");
      return nuevo;
    });
  };

  const cambiarTema = (nuevo) => {
    setTema(nuevo);
    localStorage.setItem("oex_tema", nuevo);
  };

  if (cargandoAuth) {
    return <div className="page">Cargando…</div>;
  }

  if (!session) {
    return <Login onLogin={login} />;
  }

  const auth = { session, usuarioActual };
  const moduloActivo = MODULOS.find((m) => m.id === vista);

  return (
    <div className="app-shell app-shell--sidebar" data-theme={tema} style={{ "--module-color": moduloActivo?.color }}>
      {sidebarAbiertoMovil && <div className="sidebar-backdrop" onClick={() => setSidebarAbiertoMovil(false)} />}

      <SidebarNav
        modulos={MODULOS}
        vistaActiva={vista}
        onNavigate={navegarA}
        colapsado={sidebarColapsado}
        onToggleColapso={toggleSidebarColapsado}
        abiertoMovil={sidebarAbiertoMovil}
        brand={<img src={logo} alt="OEX" />}
        brandLabel="OEX Sistema"
      />

      <div className="main-column">
        <div className="topbar-mini">
          <button className="hamburger" onClick={() => setSidebarAbiertoMovil(true)} aria-label="Abrir menú">
            <svg width="18" height="18" viewBox="0 0 18 18"><path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
          <div className="segment" style={{ margin: "0 0 0 auto" }}>
            <span className="badge badge-neutral">{usuarioActual?.nombre || usuarioActual?.email} · {rol}</span>
            <button className="btn btn-ghost" onClick={logout}>Salir</button>
          </div>
        </div>
        <div className="module-strip" />

        {vista === "dashboard" && <Dashboard pedidos={datos.pedidos} envios={datos.envios} gastos={datos.gastos} prealertas={datos.prealertas} empresa={empresa} cuentasDinero={datos.cuentasDinero} auth={auth} mostrarToast={mostrarToast} cargarDatos={datos.cargarDatos} setVista={setVista} irAPrealertas={irAPrealertas} />}
        {vista === "paqueteria" && <Paqueteria envios={datos.envios} prealertas={datos.prealertas} facturasProveedor={datos.facturasProveedor} auditLog={datos.auditLog} clientes={datos.clientes} rol={rol} tarifas={tarifas} empresa={empresa} cuentasDinero={datos.cuentasDinero} auth={auth} mostrarToast={mostrarToast} cargarDatos={datos.cargarDatos} vistaInicial={subvistaPaqueteria} />}
        {vista === "finanzas" && <Finanzas pedidos={datos.pedidos} envios={datos.envios} gastos={datos.gastos} ingresos={datos.ingresos} clientes={datos.clientes} prealertas={datos.prealertas} proveedores={datos.proveedores} facturasProveedor={datos.facturasProveedor} cuentasContables={datos.cuentasContables} cuentasDinero={datos.cuentasDinero} balanceApertura={datos.balanceApertura} fechaApertura={datos.fechaApertura} empresa={empresa} rol={rol} auth={auth} mostrarToast={mostrarToast} cargarDatos={datos.cargarDatos} vistaInicial={subvistaFinanzas} />}
        {vista === "clientes" && <Clientes clientes={datos.clientes} pedidos={datos.pedidos} envios={datos.envios} empresa={empresa} tarifas={tarifas} rol={rol} auth={auth} mostrarToast={mostrarToast} cargarDatos={datos.cargarDatos} />}
        {vista === "auditoria" && <Auditoria auditLog={datos.auditLog} />}
        {vista === "configuracion" && <Configuracion tarifas={tarifas} setTarifas={setTarifas} empresa={empresa} setEmpresa={setEmpresa} cuentasDinero={datos.cuentasDinero} rol={rol} tema={tema} setTema={cambiarTema} mostrarToast={mostrarToast} cargarDatos={datos.cargarDatos} />}

        <Toast toast={toast} />
      </div>
    </div>
  );
}