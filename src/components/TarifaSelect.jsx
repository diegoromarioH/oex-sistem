// src/components/TarifaSelect.jsx
import { tarifasDestino } from "../utils/calculosPaqueteria";

export default function TarifaSelect({ tarifas, destino, value, onChange, label = "Tarifa" }) {
  const opciones = tarifasDestino(tarifas, destino);
  return (
    <label>
      <span className="field-label">{label}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {opciones.map(([key, t]) => (
          <option key={key} value={key}>{t.label || key}</option>
        ))}
        <option value="personalizada">Tarifa personalizada</option>
      </select>
    </label>
  );
}
