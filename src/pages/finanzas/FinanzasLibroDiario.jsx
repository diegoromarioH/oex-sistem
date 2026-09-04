// src/pages/finanzas/FinanzasLibroDiario.jsx
//
// Consulta del libro diario — cada asiento con sus líneas de debe/haber.
// Es puramente de lectura: los asientos se generan solos desde
// gastosService, ingresosService, proveedoresService y
// balanceAperturaService. Nadie captura un asiento a mano acá todavía.
import { useEffect, useState } from "react";
import { numero } from "../../utils/numero";
import { listarLibroDiario } from "../../services/ContabilidadService";

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

  if (cargando) return <div className="card"><p>Cargando libro diario…</p></div>;

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3>Libro diario</h3>
          <p className="muted">Asientos generados automáticamente por las operaciones del sistema.</p>
        </div>
      </div>

      {!asientos.length ? (
        <div className="empty-state">No hay asientos contables todavía.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Fecha</th><th>Descripción</th><th>Origen</th><th>Usuario</th><th>Debe</th><th>Haber</th></tr>
            </thead>
            <tbody>
              {asientos.map((a) => {
                const lineas = a.movimientos_contables || [];
                const debe = lineas.reduce((s, l) => s + numero(l.debe), 0);
                const haber = lineas.reduce((s, l) => s + numero(l.haber), 0);
                const abierto = expandido === a.id;
                return [
                  <tr key={a.id} onClick={() => setExpandido(abierto ? null : a.id)} style={{ cursor: "pointer" }}>
                    <td>{new Date(a.fecha).toLocaleDateString("es-NI")}</td>
                    <td>{a.descripcion}</td>
                    <td><span className="badge badge-neutral">{ORIGEN_LABEL[a.origen_modulo] || a.origen_modulo}</span></td>
                    <td>{a.created_by_name || "—"}</td>
                    <td>${debe.toFixed(2)}</td>
                    <td>${haber.toFixed(2)}</td>
                  </tr>,
                  abierto && (
                    <tr key={`${a.id}-detalle`}>
                      <td colSpan="6" style={{ padding: "0 16px 16px" }}>
                        <div className="table-wrap" style={{ marginTop: 8 }}>
                          <table className="table">
                            <thead><tr><th>Cuenta</th><th>Debe</th><th>Haber</th></tr></thead>
                            <tbody>
                              {lineas.map((l, i) => (
                                <tr key={i}>
                                  <td>{l.cuentas_contables ? `${l.cuentas_contables.codigo} · ${l.cuentas_contables.nombre}` : "—"}</td>
                                  <td>${numero(l.debe).toFixed(2)}</td>
                                  <td>${numero(l.haber).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}