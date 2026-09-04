// src/pages/finanzas/FinanzasLibroDiario.jsx
//
// Consulta del libro diario — cada asiento con sus líneas de debe/haber.
// Es puramente de lectura: los asientos se generan solos desde
// gastosService, ingresosService, proveedoresService y
// balanceAperturaService. Nadie captura un asiento a mano acá todavía.
import { useEffect, useState } from "react";
import { numero } from "../../utils/numero";
import { listarLibroDiario } from "../../services/contabilidadService";

const ORIGEN_LABEL = {
  gastos_operativos: "Gasto",
  ingresos_operativos: "Ingreso",
  facturas_proveedor: "Factura proveedor",
  pagos_proveedor: "Pago a proveedor",
  apertura: "Apertura",
  gastos_operativos_reversion: "Reversión de gasto",
  ingresos_operativos_reversion: "Reversión de ingreso"
};

export default function FinanzasLibroDiario() {
  const [asientos, setAsientos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [expandido, setExpandido] = useState(null);

  useEffect(() => {
    listarLibroDiario()
      .then(setAsientos)
      .catch(() => setAsientos([]))
      .finally(() => setCargando(false));
  }, []);

  const totalLineas = (asiento, campo) =>
    (asiento.movimientos_contables || []).reduce((a, m) => a + numero(m[campo]), 0);

  return (
    <div>
      <div className="info-box mt-8">
        Cada asiento nace solo cuando registras un gasto, un ingreso, una factura o un pago a proveedor con una cuenta de dinero vinculada a una cuenta contable. Si algo no aparece aquí, revisa que la cuenta de dinero usada tenga su cuenta contable asignada en Finanzas → Cuentas.
      </div>

      {cargando && <p className="mt-16">Cargando...</p>}

      <div className="list mt-16">
        {asientos.map((asiento) => {
          const debe = totalLineas(asiento, "debe");
          const abierto = expandido === asiento.id;
          return (
            <div key={asiento.id} className="card" style={{ marginBottom: 8 }}>
              <button
                type="button"
                className="row-card"
                style={{ width: "100%", cursor: "pointer", background: "none", border: "none" }}
                onClick={() => setExpandido(abierto ? null : asiento.id)}
              >
                <div>
                  <b>{asiento.descripcion}</b> <span className="badge badge-neutral">{ORIGEN_LABEL[asiento.origen_modulo] || asiento.origen_modulo}</span>
                  <p>{new Date(asiento.fecha).toLocaleString("es-NI")} · {asiento.created_by_name || "—"}</p>
                </div>
                <div className="stack-gap-sm text-right">
                  <b>${debe.toFixed(2)}</b>
                  <small>{abierto ? "Ocultar líneas ▲" : "Ver líneas ▼"}</small>
                </div>
              </button>

              {abierto && (
                <table className="mt-16" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "4px 8px" }}>Cuenta</th>
                      <th style={{ padding: "4px 8px", textAlign: "right" }}>Debe</th>
                      <th style={{ padding: "4px 8px", textAlign: "right" }}>Haber</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(asiento.movimientos_contables || []).map((m, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "4px 8px" }}>{m.cuentas_contables?.codigo} · {m.cuentas_contables?.nombre}</td>
                        <td style={{ padding: "4px 8px", textAlign: "right" }}>{numero(m.debe) > 0 ? `$${numero(m.debe).toFixed(2)}` : ""}</td>
                        <td style={{ padding: "4px 8px", textAlign: "right" }}>{numero(m.haber) > 0 ? `$${numero(m.haber).toFixed(2)}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
        {!cargando && asientos.length === 0 && <p>Todavía no hay asientos en el libro diario.</p>}
      </div>
    </div>
  );
}