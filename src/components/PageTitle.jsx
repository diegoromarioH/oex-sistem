// src/components/PageTitle.jsx
export default function PageTitle({ title, subtitle, children, navigation = false }) {
  return (
    <div className="page-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && (navigation
        ? <nav className="actions page-navigation" aria-label={title}>{children}</nav>
        : <div className="actions">{children}</div>)}
    </div>
  );
}
