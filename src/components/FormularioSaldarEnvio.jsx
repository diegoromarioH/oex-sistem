// src/components/FormularioSaldarEnvio.jsx
// Único punto donde se registra el pago con el que un cliente salda su
// envío (transferencia o efectivo) y se marca como Entregado. Se usa
// desde EnvioItem (Envíos, Dashboard de Paquetería) y desde
// SeguimientoClientes (Dashboard principal), para que el flujo sea
// siempre el mismo en toda la app.
//
// `cuentasDinero`: las cuentas de Finanzas → Cuentas — es la ÚNICA
// fuente de "a qué cuenta entra el dinero". Antes existía también una
// lista de texto libre en Configuración ("Cuentas para transferencias"),
// separada de esto y sin saldo real; se unificaron en una sola cosa para
// no tener dos sistemas de cuentas que no se conocían entre sí. Si no
// hay ninguna cuenta del tipo que corresponde, el formulario lo dice
// claro y no deja confirmar — hay que crearla primero en Finanzas → Cuentas.
import { useState } from "react";
import { numero } from "../utils/numero";
import { formatoMoneda } from "../utils/moneda";
import { saldarEnvio } from "../services/enviosService";
import { solicitarNavegacion } from "../utils/navegacion";

export default function FormularioSaldarEnvio({ envio, cuentasDinero = [], empresa, auth, mostrarToast, cargarDatos, etiquetaBoton = "Marcar retirado y saldar" }) {
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [metodo, setMetodo] = useState("Transferencia");
  const [recibidoPor, setRecibidoPor] = useState("");
  const [cuentaDineroId, setCuentaDineroId] = useState("");
  const [tasaCambio, setTasaCambio] = useState(String(empresa?.tipoCambio || ""));
  const [monedaPago, setMonedaPago] = useState("USD");
  const [guardando, setGuardando] = useState(false);

  // Ya está entregado y sin saldo: no hay nada que saldar, no mostramos nada.
  if (envio.estado === "Entregado" && numero(envio.saldo) <= 0) return null;

  // Transferencia → cuentas tipo "banco"; Efectivo → cuentas tipo "efectivo".
  const cuentasDelMetodo = cuentasDinero.filter(
    (c) => c.activa !== false && c.tipo === (metodo === "Transferencia" ? "banco" : "efectivo")
  );
  const cuentaDineroSeleccionada = cuentasDelMetodo.find((c) => String(c.id) === String(cuentaDineroId)) || null;

  const cambiarMetodo = (nuevo) => {
    setMetodo(nuevo);
    setCuentaDineroId("");
  };

  const confirmar = async () => {
    if (!cuentaDineroSeleccionada) {
      mostrarToast("Selecciona a qué cuenta entra el pago.", "warning");
      return;
    }
    setGuardando(true);
    try {
      await saldarEnvio({
        envio,
        pago: { metodo, moneda: monedaPago, recibidoPor: metodo === "Efectivo" ? recibidoPor : undefined },
        cuentaDinero: cuentaDineroSeleccionada,
        fecha,
        tasaCambio,
        auth
      });
      mostrarToast(`Envío ${envio.numero} saldado y marcado como retirado.`);
      setAbierto(false);
      setRecibidoPor("");
      setCuentaDineroId("");
      setFecha(new Date().toISOString().slice(0, 10));
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo registrar el pago.", "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <button type="button" className="btn btn-primary" onClick={() => setAbierto((v) => !v)}>
        {abierto ? "Cancelar" : etiquetaBoton}
      </button>

      {abierto && (
        <div className="form-grid mt-8" style={{ borderTop: "1px solid #D8DADD", paddingTop: 12 }}>
          <label>
            <span className="field-label">Fecha del pago</span>
            <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
          </label>
          <label>
            <span className="field-label">Método de pago</span>
            <select className="input" value={metodo} onChange={(e) => cambiarMetodo(e.target.value)}>
              <option value="Transferencia">Transferencia</option>
              <option value="Efectivo">Efectivo</option>
            </select>
          </label>
          <label>
            <span className="field-label">Moneda recibida</span>
            <select className="input" value={monedaPago} onChange={(e) => setMonedaPago(e.target.value)}>
              <option value="USD">Dólares (USD)</option>
              <option value="NIO">Córdobas (NIO)</option>
            </select>
          </label>

          {metodo === "Efectivo" && (
            <label>
              <span className="field-label">¿Quién recibió el efectivo?</span>
              <input className="input" placeholder="Nombre de quien recibe" value={recibidoPor} onChange={(e) => setRecibidoPor(e.target.value)} />
            </label>
          )}

          {cuentasDelMetodo.length > 0 ? (
            <label>
              <span className="field-label">¿A qué cuenta entra el dinero?</span>
              <select className="input" value={cuentaDineroId} onChange={(e) => setCuentaDineroId(e.target.value)}>
                <option value="">Selecciona una cuenta…</option>
                {cuentasDelMetodo.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre} (saldo {formatoMoneda(c.saldoActual ?? c.saldo_actual, c.moneda)})</option>
                ))}
              </select>
            </label>
          ) : (
            <p style={{ color: "var(--danger)" }}>
              No tienes cuentas de dinero tipo "{metodo === "Transferencia" ? "banco" : "efectivo"}" — créala en Finanzas → <button type="button" className="inline-navigation-link" onClick={() => solicitarNavegacion("finanzas", "cuentas")}>Cuentas</button> antes de continuar.
            </p>
          )}

          {(cuentaDineroSeleccionada?.moneda === "NIO" || monedaPago === "NIO") && (
            <label>
              <span className="field-label">Tipo de cambio (C$ por US$1)</span>
              <input className="input" type="number" min="0" step="0.01" value={tasaCambio} onChange={(e) => setTasaCambio(e.target.value)} />
              <small>
                Cliente entrega {formatoMoneda(monedaPago === "NIO" ? numero(envio.saldo) * numero(tasaCambio) : numero(envio.saldo), monedaPago)}. {" "}
                Entrarán {formatoMoneda(cuentaDineroSeleccionada?.moneda === "NIO" ? numero(envio.saldo) * numero(tasaCambio) : numero(envio.saldo), cuentaDineroSeleccionada?.moneda)} a la cuenta.
              </small>
            </label>
          )}

          <button className="btn btn-primary" disabled={guardando || !cuentaDineroSeleccionada} onClick={confirmar} style={{ alignSelf: "end" }}>
            {guardando ? "Guardando..." : `Confirmar pago de $${numero(envio.saldo).toFixed(2)}`}
          </button>
        </div>
      )}
    </div>
  );
}
