// src/components/Select.jsx
export default function Select({ label, value, onChange, options, className = "" }) {
  return (
    <label>
      {label && <span className="field-label">{label}</span>}
      <select className={`input ${className}`} value={value} onChange={onChange}>
        {options.map((opt) => (
          <option key={opt.value ?? opt} value={opt.value ?? opt}>{opt.label ?? opt}</option>
        ))}
      </select>
    </label>
  );
}
