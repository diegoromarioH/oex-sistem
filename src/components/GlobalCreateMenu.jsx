import { useEffect, useRef, useState } from "react";
import { Plus, PackagePlus, Receipt, TrendingDown, TrendingUp, Truck, UserPlus } from "lucide-react";

const ACCIONES = [
  { label: "Registrar tracking", detalle: "Agregar un tracking manual", icono: PackagePlus, destino: ["paqueteria", "registrar"] },
  { label: "Generar recibo", detalle: "Cobrar trackings disponibles", icono: Receipt, destino: ["paqueteria", "nuevo"] },
  { label: "Nuevo cliente", detalle: "Abrir el registro de clientes", icono: UserPlus, destino: ["clientes"] },
  { label: "Registrar ingreso", detalle: "Agregar otro ingreso", icono: TrendingUp, destino: ["finanzas", "ingresos"] },
  { label: "Registrar gasto", detalle: "Agregar un gasto operativo", icono: TrendingDown, destino: ["finanzas", "gastos"] },
  { label: "Proveedor", detalle: "Facturas y pagos", icono: Truck, destino: ["finanzas", "proveedores"] }
];

export default function GlobalCreateMenu({ onNavigate }) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e) => {
      if (contenedor.current && !contenedor.current.contains(e.target)) setAbierto(false);
    };
    const escape = (e) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", cerrar);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  const elegir = (accion) => {
    onNavigate(...accion.destino);
    setAbierto(false);
  };

  return (
    <div className="global-create" ref={contenedor}>
      <button type="button" className="btn btn-primary global-create-trigger" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} aria-haspopup="menu">
        <Plus size={17} /><span>Nuevo</span>
      </button>
      {abierto && (
        <div className="global-create-menu" role="menu">
          <p>¿Qué deseas registrar?</p>
          {ACCIONES.map((accion) => (
            <button type="button" role="menuitem" key={accion.label} onClick={() => elegir(accion)}>
              <span><accion.icono size={16} /></span>
              <span><b>{accion.label}</b><small>{accion.detalle}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
