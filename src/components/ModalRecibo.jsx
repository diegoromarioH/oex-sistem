// src/components/ModalRecibo.jsx
//
// Vista previa en pantalla de un recibo — igual de espíritu al modal
// "Detalles de Factura" de la landing pública de clientes, pero para el
// panel admin. No reemplaza la descarga de PDF (generarDetalleEnvio,
// usado en Paquetería/WhatsApp) — la ofrece como botón aparte, para
// cuando sí se necesite el archivo.
//
// Estilos en línea a propósito: es un overlay que no depende de ninguna
// clase CSS nueva que haya que copiar a mano al proyecto — solo
// reutiliza .card/.badge/.btn que ya existen.
import { FileText } from "lucide-react";
import { numero } from "../utils/numero";
import { generarDetalleEnvio } from "../services/pdfService";

export default function ModalRecibo({ envio, tarifas, empresa, onCerrar }) {
  if (!envio) return null;

  // total = bruto − descuento (ver generarRecibo en trackingsService.js),
  // así que el subtotal antes de descuento se reconstruye sumándolo de
  // vuelta — no hay un campo "subtotal" guardado aparte.
  const descuento = numero(envio.descuento);
  const subtotal = numero(envio.total) + descuento;
  const pctDescuento = subtotal > 0 ? (descuento / subtotal) * 100 : 0;
  const gastosExtras = numero(envio.gastosExtras);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16
      }}
      onClick={onCerrar}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: 440, maxHeight: "85vh", overflowY: "auto", padding: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <h3 style={{ margin: 0 }}>Detalles de Recibo</h3>
            <small style={{ opacity: 0.6 }}>{envio.numero}</small>
          </div>
          <button className="btn btn-ghost" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ background: "var(--info-soft, #eef4ff)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <b>Fecha:</b><span>{envio.fecha}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <b>Estado:</b><span className="badge badge-neutral">{envio.estado}</span>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span>Subtotal Paquetes:</span><b>${subtotal.toFixed(2)}</b>
          </div>
          {descuento > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, color: "var(--danger)" }}>
              <span>Descuento ({pctDescuento.toFixed(0)}%):</span><b>-${descuento.toFixed(2)}</b>
            </div>
          )}
          {gastosExtras > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span>Gastos extra:</span><b>${gastosExtras.toFixed(2)}</b>
            </div>
          )}
          <div style={{ borderTop: "1px solid var(--border)", margin: "10px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
            <b style={{ fontSize: "1.05rem" }}>Total Final:</b>
            <b style={{ fontSize: "1.15rem", color: "var(--success)" }}>${numero(envio.total).toFixed(2)}</b>
          </div>

          <b>Paquetes Vinculados ({(envio.trackings || []).length})</b>
          <div className="list mt-8">
            {(envio.trackings || []).map((t, i) => (
              <div key={i} className="row-card">
                <div>
                  <b>{t.codigo || t.almacenId || "Sin código"}</b>
                  <p style={{ margin: 0 }}><small>{t.tipoEnvio}{t.estado ? ` · ${t.estado}` : ""}</small></p>
                </div>
                <b>{numero(t.peso).toFixed(1)} lb</b>
              </div>
            ))}
            {(envio.trackings || []).length === 0 && <p>Sin trackings en este recibo.</p>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          <button className="btn" onClick={() => generarDetalleEnvio(envio, tarifas, empresa)}>
            <FileText size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />Factura
          </button>
          <button className="btn btn-primary" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}