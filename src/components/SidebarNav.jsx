// src/components/SidebarNav.jsx
import { useEffect, useState } from "react";

const ChevronAbajo = ({ abierto }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ transform: abierto ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}>
    <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronColapsar = ({ colapsado }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style={{ transform: colapsado ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}>
    <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function SidebarNav({ modulos, vistaActiva, subvistaActiva, onNavigate, colapsado, onToggleColapso, abiertoMovil, brand, brandLabel }) {
  const [expandido, setExpandido] = useState(vistaActiva);

  useEffect(() => {
    if (vistaActiva) setExpandido(vistaActiva);
  }, [vistaActiva]);

  const toggleExpandido = (id) => setExpandido((actual) => (actual === id ? null : id));

  const clickModulo = (m, activo, abierto, tieneSubmenu) => {
    if (!tieneSubmenu) {
      onNavigate(m.id);
      return;
    }

    // Si ya estamos dentro del módulo, el clic sobre toda la fila funciona
    // como acordeón: abre/cierra sin sacarnos de la subpágina actual.
    if (activo) {
      setExpandido(abierto ? null : m.id);
      return;
    }

    // Si es otro módulo, navega a su vista por defecto y lo deja abierto.
    onNavigate(m.id);
    setExpandido(m.id);
  };

  return (
    <aside className={`sidebar ${colapsado ? "sidebar--colapsado" : ""} ${abiertoMovil ? "sidebar--abierta-movil" : ""}`}>
      <button type="button" className="sidebar-brand" onClick={() => onNavigate("dashboard")}>
        {brand}
        {!colapsado && <b>{brandLabel}</b>}
      </button>

      <nav className="sidebar-nav">
        {modulos.map((m) => {
          const tieneSubmenu = m.submenu && m.submenu.length > 0;
          const activo = vistaActiva === m.id;
          const abierto = expandido === m.id;
          return (
            <div key={m.id} className="sidebar-seccion" style={{ "--module-color": m.color }}>
              <div className={`sidebar-modulo ${activo ? "active" : ""}`}>
                <button
                  type="button"
                  className="sidebar-modulo-btn"
                  onClick={() => clickModulo(m, activo, abierto, tieneSubmenu)}
                  title={colapsado ? m.label : undefined}
                  aria-expanded={tieneSubmenu ? abierto : undefined}
                >
                  {m.icon && <m.icon className="sidebar-icono" size={19} strokeWidth={2} />}
                  {!colapsado && <span className="sidebar-modulo-label">{m.label}</span>}
                </button>

                {!colapsado && tieneSubmenu && (
                  <button
                    type="button"
                    className="sidebar-chevron"
                    aria-expanded={abierto}
                    aria-label={`${abierto ? "Ocultar" : "Mostrar"} páginas de ${m.label}`}
                    onClick={() => toggleExpandido(m.id)}
                  >
                    <ChevronAbajo abierto={abierto} />
                  </button>
                )}
              </div>

              {!colapsado && tieneSubmenu && abierto && (
                <div className="sidebar-submenu" role="menu">
                  {m.submenu.map((item) => {
                    const subActivo = activo && subvistaActiva === item.subvista;
                    return (
                      <button
                        key={item.subvista}
                        type="button"
                        role="menuitem"
                        className={`sidebar-subitem ${subActivo ? "active" : ""}`}
                        onClick={() => onNavigate(m.id, item.subvista)}
                      >
                        {item.icon && <item.icon className="sidebar-subitem-icono" size={15} strokeWidth={2} />}
                        <span className="sidebar-subitem-texto">
                          <b>{item.label}</b>
                          <small>{item.descripcion}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <button type="button" className="sidebar-colapsar" onClick={onToggleColapso} aria-label={colapsado ? "Expandir menú" : "Colapsar menú"}>
        <ChevronColapsar colapsado={colapsado} />
        {!colapsado && <span>Colapsar</span>}
      </button>
    </aside>
  );
}
