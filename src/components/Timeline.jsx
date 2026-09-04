// src/components/Timeline.jsx
// Seguimiento de un pedido/envío, construido desde el audit_log ya existente
// (ver src/utils/historial.js) — sin tocar el esquema de Supabase.
import { lineaDeTiempo } from "../utils/historial";

export default function Timeline({ auditLog, modulo, registroCodigo }) {
  const eventos = lineaDeTiempo(auditLog, { modulo, registroCodigo });
  if (eventos.length === 0) return null;

  return (
    <details>
      <summary className="timeline-summary">Seguimiento ({eventos.length})</summary>
      <ul className="timeline">
        {eventos.map((ev, i) => (
          <li key={i} className="timeline-item">
            <span className="timeline-dot" />
            <div>
              <span>{ev.titulo}{ev.detalle ? ` — ${ev.detalle}` : ""}</span>
              <small>{ev.fecha} · {ev.usuario}</small>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
