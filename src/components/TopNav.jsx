// src/components/TopNav.jsx
//
// Barra de navegación superior con mega-menú al hacer hover. Cada
// módulo en MODULOS (definido en App.jsx) puede traer un array
// `submenu` con sus sub-páginas — si lo trae, aparece un chevron y,
// al pasar el mouse (o al tocar el chevron en pantallas táctiles), un
// panel con cada sub-página, su descripción corta y un punto del color
// del módulo.
//
// Comportamiento:
// - Clic en el pill del módulo → navega a la vista por defecto de ese
//   módulo (igual que antes).
// - Hover sobre el pill (con submenu) → tras ~150ms abre el panel.
// - Clic en el chevron → abre/cierra el panel sin navegar (para touch,
//   donde no existe hover).
// - Esc, clic afuera, o elegir un ítem → cierra el panel.
import { useEffect, useRef, useState } from "react";

const Chevron = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function TopNav({ modulos, vistaActiva, onNavigate }) {
  const [abierto, setAbierto] = useState(null); // id del módulo con panel abierto, o null
  const contenedorRef = useRef(null);
  const cierreTimeoutRef = useRef(null);

  const cancelarCierre = () => {
    if (cierreTimeoutRef.current) {
      clearTimeout(cierreTimeoutRef.current);
      cierreTimeoutRef.current = null;
    }
  };
  const programarCierre = () => {
    cancelarCierre();
    cierreTimeoutRef.current = setTimeout(() => setAbierto(null), 180);
  };

  // Cierra al hacer clic afuera o al presionar Escape — necesario sobre
  // todo para el modo touch, donde el panel se abre con el chevron y
  // se queda abierto hasta que el usuario lo cierra explícitamente.
  useEffect(() => {
    if (!abierto) return;
    const alClicAfuera = (e) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setAbierto(null);
    };
    const alEscape = (e) => { if (e.key === "Escape") setAbierto(null); };
    document.addEventListener("mousedown", alClicAfuera);
    document.addEventListener("keydown", alEscape);
    return () => {
      document.removeEventListener("mousedown", alClicAfuera);
      document.removeEventListener("keydown", alEscape);
    };
  }, [abierto]);

  const elegir = (moduloId, subvista) => {
    setAbierto(null);
    onNavigate(moduloId, subvista);
  };

  return (
    <nav className="nav nav--con-dropdown" ref={contenedorRef}>
      {modulos.map((m) => {
        const tieneSubmenu = m.submenu && m.submenu.length > 0;
        const estaAbierto = abierto === m.id;
        return (
          <div
            key={m.id}
            className="nav-item"
            onMouseEnter={() => { if (tieneSubmenu) { cancelarCierre(); setAbierto(m.id); } }}
            onMouseLeave={() => { if (tieneSubmenu) programarCierre(); }}
          >
            <button
              className={`nav-btn ${vistaActiva === m.id ? "active" : ""}`}
              style={{ "--module-color": m.color }}
              onClick={() => elegir(m.id)}
            >
              {m.label}
            </button>

            {tieneSubmenu && (
              <button
                type="button"
                className="nav-chevron"
                aria-haspopup="menu"
                aria-expanded={estaAbierto}
                aria-label={`Ver páginas de ${m.label}`}
                onClick={(e) => { e.stopPropagation(); cancelarCierre(); setAbierto(estaAbierto ? null : m.id); }}
              >
                <Chevron />
              </button>
            )}

            {tieneSubmenu && estaAbierto && (
              <div className="nav-dropdown" role="menu" style={{ "--module-color": m.color }}>
                {m.submenu.map((item) => (
                  <button
                    key={item.subvista}
                    type="button"
                    role="menuitem"
                    className="nav-dropdown-item"
                    onClick={() => elegir(m.id, item.subvista)}
                  >
                    <span className="nav-dropdown-dot" />
                    <span className="nav-dropdown-texto">
                      <b>{item.label}</b>
                      <small>{item.descripcion}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}