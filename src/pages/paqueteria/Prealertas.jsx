// src/pages/paqueteria/Prealertas.jsx
//
// Solo la bandeja de trackings que llegaron de la landing pública sin
// confirmar todavía. El formulario de registro manual se movió a su
// propia pestaña (RegistrarTracking.jsx) — ese nace confirmado, no pasa
// por aquí.
import { useMemo, useState } from "react";
import { confirmarTracking, eliminarTracking } from "../../services/trackingsService";
import { esPendienteDeConfirmar } from "../../utils/estadosEnvio";
import { buscarClientesParecidos } from "../../utils/clientes";

export default function Prealertas({ prealertas, clientes, rol, auth, mostrarToast, cargarDatos }) {
  const [confirmando, setConfirmando] = useState(null);
  const [busqueda, setBusqueda] = useState("");

  const pendientes = useMemo(() => {
    const q = busqueda.toLowerCase();
    const coincide = (t) =>
      !q ||
      (t.cliente || "").toLowerCase().includes(q) ||
      (t.clienteCodigo || "").toLowerCase().includes(q) ||
      (t.tracking || "").toLowerCase().includes(q) ||
      (t.almacenId || "").toLowerCase().includes(q);
    return prealertas.filter(esPendienteDeConfirmar).filter(coincide);
  }, [prealertas, busqueda]);

  const confirmar = async (t) => {
    setConfirmando(t.id);
    try {
      await confirmarTracking({ tracking: t, clientesEnMemoria: clientes, auth });
      mostrarToast(`Tracking confirmado — pasó a Envíos activos.`);
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo confirmar.", "error");
    } finally {
      setConfirmando(null);
    }
  };

  const eliminar = async (t) => {
    if (rol !== "admin") return mostrarToast("Solo un administrador puede eliminar trackings.", "error");
    try {
      await eliminarTracking({ tracking: t, auth });
      mostrarToast("Tracking eliminado.");
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo eliminar.", "error");
    }
  };

  return (
    <div className="card">
      <div className="page-title" style={{ margin: "0 0 8px" }}>
        <h3>Pendientes de confirmar ({pendientes.length})</h3>
        <input className="input input-sm" placeholder="Buscar cliente, tracking, código o ID almacén" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </div>
      <p><small>Llegaron desde la landing pública. Confírmalos cuando el paquete realmente esté recibido — pasan a Envíos activos.</small></p>

      <div className="list mt-8">
        {pendientes.map((t) => {
          // Alerta de posible duplicado: alguien ya registrado con un
          // teléfono o código MUY parecido (un solo dígito/caracter
          // distinto) al de esta prealerta — típico de un typo. Solo
          // avisa, no bloquea la confirmación.
          const parecidos = buscarClientesParecidos(clientes, { telefono: t.contacto, codigo: t.clienteCodigo });

          return (
            <div key={t.id} className="row-card" style={{ flexDirection: "column", alignItems: "stretch", borderLeft: "3px solid #F4562D" }}>
              <div className="page-title" style={{ margin: 0 }}>
                <div>
                  <b>{t.tracking || t.almacenId || "Sin código"}</b> <span className="badge badge-neutral">{t.tipoEnvio}</span>{" "}
                  <span className="badge badge-warning">{t.estado || "Sin confirmar"}</span>
                  <p>{t.cliente} · {t.clienteCodigo || "Sin registrar"} · {t.destino}</p>
                  <small>{t.fecha}</small>
                </div>
                <div className="segment">
                  <button className="btn btn-primary" disabled={confirmando === t.id} onClick={() => confirmar(t)}>
                    {confirmando === t.id ? "Confirmando..." : "Confirmar recibido"}
                  </button>
                  <button className="btn btn-danger" onClick={() => eliminar(t)}>Eliminar</button>
                </div>
              </div>

              {parecidos.length > 0 && (
                <div className="mt-8" style={{ background: "#fff8e6", border: "1px solid #f0c94c", borderRadius: 8, padding: "8px 12px" }}>
                  <b style={{ color: "#8a6a00" }}>⚠️ Posible duplicado</b>
                  {parecidos.map((p) => (
                    <p key={p.id} style={{ margin: "4px 0 0" }}>
                      {p.motivoParecido === "telefono"
                        ? <>El WhatsApp de esta prealerta se parece mucho (un dígito distinto) al de <b>{p.nombre}</b> ({p.codigo} · {p.telefono}). ¿Es la misma persona?</>
                        : <>El código de esta prealerta se parece mucho (un caracter distinto) al de <b>{p.nombre}</b> ({p.codigo} · {p.telefono}). ¿Es la misma persona?</>}
                    </p>
                  ))}
                  <small>Revisa el WhatsApp/código antes de confirmar para no crear un cliente duplicado.</small>
                </div>
              )}
            </div>
          );
        })}
        {pendientes.length === 0 && <p>Sin trackings pendientes de confirmar.</p>}
      </div>
    </div>
  );
}