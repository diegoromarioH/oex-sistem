// src/components/ModalRegistrarPeso.jsx
//
// Aparece justo en el momento en que un tracking pasa a "Bodega OEX" —
// el punto donde el proveedor (Aduana/Flete) factura por peso. En vez de
// depender de que alguien recuerde llenar el input suelto en la fila,
// se pide acá mismo, con foco automático, y solo entonces se completa
// el cambio de estado.
import { useEffect, useRef, useState } from "react";
import { Weight } from "lucide-react";
import { numero } from "../utils/numero";

export default function ModalRegistrarPeso({ tracking, nuevoEstado, onConfirmar, onCancelar, guardando }) {
  const [peso, setPeso] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    // Autofocus al abrir — que se pueda escribir de inmediato sin dar clic.
    inputRef.current?.focus();
  }, []);

  const confirmar = () => {
    if (numero(peso) <= 0) return;
    onConfirmar(peso);
  };

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
      onClick={onCancelar}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: 380, padding: 0, overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "24px 24px 8px", textAlign: "center" }}>
          <div
            style={{
              width: 52, height: 52, borderRadius: "50%",
              background: "color-mix(in srgb, var(--module-color, #7e3bed) 14%, transparent)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 12px"
            }}
          >
            <Weight size={24} style={{ color: "var(--module-color)" }} />
          </div>
          <h3 style={{ margin: 0 }}>{tracking.tracking || tracking.almacenId || "Sin código"}</h3>
          <p style={{ margin: "4px 0 0", opacity: 0.7 }}>{tracking.cliente} · {tracking.destino} · {tracking.tipoEnvio}</p>
        </div>

        <div style={{ padding: "16px 24px" }}>
          <p style={{ textAlign: "center", margin: "0 0 12px" }}>
            Este tracking pasa a <b>{nuevoEstado}</b> — registra el peso antes de continuar.
          </p>
          <div style={{ position: "relative" }}>
            <input
              ref={inputRef}
              className="input"
              type="number"
              step="0.1"
              min="0"
              placeholder="0.0"
              value={peso}
              onChange={(e) => setPeso(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmar()}
              style={{ fontSize: "1.6rem", fontWeight: 700, textAlign: "center", padding: "16px 48px" }}
            />
            <span style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", opacity: 0.5, fontWeight: 600 }}>lb</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "8px 24px 24px" }}>
          <button className="btn" style={{ flex: 1 }} onClick={onCancelar}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 2 }} disabled={numero(peso) <= 0 || guardando} onClick={confirmar}>
            {guardando ? "Guardando..." : "Confirmar y continuar"}
          </button>
        </div>
      </div>
    </div>
  );
}