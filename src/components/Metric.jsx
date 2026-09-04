// src/components/Metric.jsx
export default function Metric({ label, value, onClick, highlight = false }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      className={`metric ${onClick ? "clickable" : ""} ${highlight ? "highlight" : ""}`}
      onClick={onClick}
      type={onClick ? "button" : undefined}
    >
      <b>{label}</b>
      <span className="metric-value">{value}</span>
    </Tag>
  );
}