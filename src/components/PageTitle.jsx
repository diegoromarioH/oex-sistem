// src/components/PageTitle.jsx
export default function PageTitle({ title, subtitle, children }) {
  return (
    <div className="page-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}
