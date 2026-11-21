import { Children, cloneElement, useEffect, useRef } from "react";
import { ChevronDown, LayoutGrid } from "lucide-react";

// src/components/PageTitle.jsx
export default function PageTitle({ title, subtitle, children, navigation = false }) {
  const opciones = navigation ? Children.toArray(children) : [];
  const activa = opciones.findIndex(opcion => opcion.props.className?.split(" ").includes("active"));
  const menu = useRef(null);
  const resumen = useRef(null);

  useEffect(() => {
    if (!navigation) return;
    const cerrarFuera = (evento) => {
      if (menu.current?.open && !menu.current.contains(evento.target)) menu.current.open = false;
    };
    document.addEventListener("pointerdown", cerrarFuera);
    return () => document.removeEventListener("pointerdown", cerrarFuera);
  }, [navigation]);

  const cerrarMenu = () => {
    menu.current.open = false;
    resumen.current.focus();
  };

  return (
    <div className="page-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && (navigation
        ? <>
            <nav className="actions page-navigation" aria-label={title}>{children}</nav>
            <details ref={menu} className="page-navigation-mobile" onKeyDown={evento => {
              if (evento.key === "Escape" && menu.current.open) {
                evento.stopPropagation();
                cerrarMenu();
              }
            }}>
              <summary ref={resumen}>
                <LayoutGrid size={17} aria-hidden="true" />
                <span>{opciones[activa]?.props.children ?? "Elegí una sección"}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <nav aria-label={`Secciones de ${title}`}>
                {opciones.map((opcion, indice) => cloneElement(opcion, {
                  type: "button",
                  "aria-current": indice === activa ? "page" : undefined,
                  onClick: evento => {
                    cerrarMenu();
                    opcion.props.onClick(evento);
                  }
                }))}
              </nav>
            </details>
          </>
        : <div className="actions">{children}</div>)}
    </div>
  );
}
