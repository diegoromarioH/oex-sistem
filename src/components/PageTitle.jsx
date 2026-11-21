import { Children } from "react";

// src/components/PageTitle.jsx
export default function PageTitle({ title, subtitle, children, navigation = false }) {
  const opciones = navigation ? Children.toArray(children) : [];
  const activa = opciones.findIndex(opcion => opcion.props.className?.split(" ").includes("active"));
  return (
    <div className="page-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && (navigation
        ? <>
            <nav className="actions page-navigation" aria-label={title}>{children}</nav>
            <select className="input page-navigation-mobile" aria-label={`Sección de ${title}`} value={activa} onChange={e => opciones[e.target.value]?.props.onClick()}>
              {activa < 0 && <option value={-1} disabled>Elegí una sección</option>}
              {opciones.map((opcion, indice) => <option key={opcion.key} value={indice}>{opcion.props.children}</option>)}
            </select>
          </>
        : <div className="actions">{children}</div>)}
    </div>
  );
}
