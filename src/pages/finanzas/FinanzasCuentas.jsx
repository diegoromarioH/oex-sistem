// src/pages/finanzas/FinanzasCuentas.jsx
//
// Catálogo de cuentas contables + cuentas de dinero (caja/bancos), cada
// una con su propia moneda (USD o NIO). Arriba de todo, un resumen tipo
// "tesorería" — cada cuenta convertida a ambas monedas usando la tasa de
// cambio de Configuración, con el total (sumatoria) al final.
import { useMemo, useState } from "react";
import { numero } from "../../utils/numero";
import { crearCuentaContable, desactivarCuentaContable } from "../../services/catalogoCuentasService";
import { crearCuentaDinero, desactivarCuentaDinero, transferirEntreCuentas } from "../../services/cuentasDineroService";
import { formatoMoneda } from "../../utils/moneda";
import Select from "../../components/Select";

const TIPOS_CUENTA = [
  { value: "activo", label: "Activo" },
  { value: "pasivo", label: "Pasivo" },
  { value: "patrimonio", label: "Patrimonio" },
  { value: "ingreso", label: "Ingreso" },
  { value: "costo", label: "Costo" },
  { value: "gasto", label: "Gasto" }
];

export default function FinanzasCuentas({ cuentasContables = [], cuentasDinero = [], empresa, rol, auth, mostrarToast, cargarDatos }) {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("gasto");
  const [naturaleza, setNaturaleza] = useState("deudora");
  const [guardandoCuenta, setGuardandoCuenta] = useState(false);

  const [nombreDinero, setNombreDinero] = useState("");
  const [tipoDinero, setTipoDinero] = useState("efectivo");
  const [monedaDinero, setMonedaDinero] = useState("USD");
  const [saldoInicial, setSaldoInicial] = useState("");
  // Vínculo opcional a una cuenta de Activo del catálogo — permite que
  // el Balance de apertura copie este saldo automáticamente (botón
  // "Copiar saldos desde Cuentas de dinero").
  const [cuentaContableDineroId, setCuentaContableDineroId] = useState("");
  const [guardandoDinero, setGuardandoDinero] = useState(false);

  // Transferir entre cuentas propias.
  const [cuentaOrigenId, setCuentaOrigenId] = useState("");
  const [cuentaDestinoId, setCuentaDestinoId] = useState("");
  const [montoTransferencia, setMontoTransferencia] = useState("");
  const [notaTransferencia, setNotaTransferencia] = useState("");
  const [transfiriendo, setTransfiriendo] = useState(false);

  const cuentasActivas = useMemo(() => cuentasContables.filter((c) => c.activa !== false), [cuentasContables]);
  const cuentasActivoDisponibles = useMemo(() => cuentasActivas.filter((c) => c.tipo === "activo"), [cuentasActivas]);
  const cuentasDineroActivas = useMemo(() => cuentasDinero.filter((c) => c.activa !== false), [cuentasDinero]);

  // Tasa de cambio ya configurada en Configuración → Empresa (C$ por
  // US$1) — no se duplica un campo aparte para esto.
  const tasaCambio = numero(empresa?.tipoCambio) || 0;

  // Cada cuenta convertida a las dos monedas, para el resumen tipo
  // tesorería (igual espíritu a la hoja de cálculo que ya usabas).
  const filasResumen = useMemo(() => {
    return cuentasDineroActivas.map((c) => {
      const saldo = numero(c.saldoActual ?? c.saldo_actual);
      const enDolares = c.moneda === "NIO" ? (tasaCambio > 0 ? saldo / tasaCambio : 0) : saldo;
      const enCordobas = c.moneda === "NIO" ? saldo : saldo * tasaCambio;
      return { ...c, saldo, enDolares, enCordobas };
    });
  }, [cuentasDineroActivas, tasaCambio]);

  const sumatoriaDolares = filasResumen.reduce((a, f) => a + f.enDolares, 0);
  const sumatoriaCordobas = filasResumen.reduce((a, f) => a + f.enCordobas, 0);

  const guardarCuentaContable = async () => {
    setGuardandoCuenta(true);
    try {
      await crearCuentaContable({ form: { codigo, nombre, tipo, naturaleza }, auth });
      mostrarToast("Cuenta contable creada.");
      setCodigo(""); setNombre("");
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo guardar.", "error");
    } finally {
      setGuardandoCuenta(false);
    }
  };

  const eliminarCuentaContable = async (cuenta) => {
    if (rol !== "admin") return mostrarToast("Solo un administrador puede desactivar cuentas.", "error");
    try {
      await desactivarCuentaContable({ cuenta, auth });
      mostrarToast("Cuenta desactivada.");
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo desactivar.", "error");
    }
  };

  const guardarCuentaDinero = async () => {
    setGuardandoDinero(true);
    try {
      await crearCuentaDinero({ form: { nombre: nombreDinero, tipo: tipoDinero, moneda: monedaDinero, saldoInicial, cuentaContableId: cuentaContableDineroId || null }, auth });
      mostrarToast("Cuenta de dinero creada.");
      setNombreDinero(""); setSaldoInicial(""); setCuentaContableDineroId(""); setMonedaDinero("USD");
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo guardar.", "error");
    } finally {
      setGuardandoDinero(false);
    }
  };

  const eliminarCuentaDineroHandler = async (cuenta) => {
    if (rol !== "admin") return mostrarToast("Solo un administrador puede desactivar cuentas.", "error");
    try {
      await desactivarCuentaDinero({ cuenta, auth });
      mostrarToast("Cuenta de dinero desactivada.");
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo desactivar.", "error");
    }
  };

  const cuentaOrigen = cuentasDineroActivas.find((c) => String(c.id) === String(cuentaOrigenId)) || null;
  const cuentaDestino = cuentasDineroActivas.find((c) => String(c.id) === String(cuentaDestinoId)) || null;
  const cuentasDestinoDisponibles = cuentasDineroActivas.filter((c) => String(c.id) !== String(cuentaOrigenId));

  // Vista previa de la conversión, para que quede claro cuánto va a
  // recibir el destino ANTES de confirmar — sobre todo si son monedas
  // distintas, donde el monto que escribes (en la moneda del origen) no
  // es el mismo número que va a entrar al destino.
  const previewDestino = useMemo(() => {
    if (!cuentaOrigen || !cuentaDestino) return null;
    const monto = numero(montoTransferencia);
    if (monto <= 0) return null;
    if (cuentaOrigen.moneda === cuentaDestino.moneda) return monto;
    if (tasaCambio <= 0) return null;
    const montoUSD = cuentaOrigen.moneda === "NIO" ? monto / tasaCambio : monto;
    return cuentaDestino.moneda === "NIO" ? montoUSD * tasaCambio : montoUSD;
  }, [cuentaOrigen, cuentaDestino, montoTransferencia, tasaCambio]);

  const transferir = async () => {
    if (!cuentaOrigen || !cuentaDestino) return mostrarToast("Selecciona cuenta de origen y destino.", "warning");
    setTransfiriendo(true);
    try {
      const { montoDestino } = await transferirEntreCuentas({
        cuentaOrigen, cuentaDestino, monto: montoTransferencia, nota: notaTransferencia, tasaCambio, auth
      });
      mostrarToast(`Transferido: ${formatoMoneda(montoTransferencia, cuentaOrigen.moneda)} → ${formatoMoneda(montoDestino, cuentaDestino.moneda)}.`);
      setCuentaOrigenId(""); setCuentaDestinoId(""); setMontoTransferencia(""); setNotaTransferencia("");
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo transferir.", "error");
    } finally {
      setTransfiriendo(false);
    }
  };

  return (
    <div>
      <div className="card mt-8">
        <div className="page-title" style={{ margin: 0 }}>
          <h3>Resumen de cuentas</h3>
          <small style={{ opacity: 0.7 }}>
            Tasa de cambio: {tasaCambio > 0 ? `C$ ${tasaCambio.toFixed(2)} por US$1` : "no configurada"} · <i>Configuración → Empresa y documentos</i>
          </small>
        </div>

        {tasaCambio === 0 && (
          <div className="info-box mt-8">
            No tienes una tasa de cambio configurada — ve a Configuración → Empresa y documentos y ponla, o las cuentas en córdobas no se van a poder convertir a dólares.
          </div>
        )}

        <div className="mt-16" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid var(--border)" }}>
                <th style={{ padding: "6px 8px" }}>Cuenta</th>
                <th style={{ padding: "6px 8px" }}>Moneda</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Saldo</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Equivalente $</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Equivalente C$</th>
              </tr>
            </thead>
            <tbody>
              {filasResumen.map((f) => (
                <tr key={f.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 8px" }}><b>{f.nombre}</b> <span className="badge badge-neutral">{f.tipo === "banco" ? "Banco" : "Efectivo"}</span></td>
                  <td style={{ padding: "6px 8px" }}>{f.moneda === "NIO" ? "C$" : "$"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{f.moneda === "NIO" ? `C$ ${f.saldo.toFixed(2)}` : `$${f.saldo.toFixed(2)}`}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>${f.enDolares.toFixed(2)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>C$ {f.enCordobas.toFixed(2)}</td>
                </tr>
              ))}
              {filasResumen.length === 0 && (
                <tr><td colSpan={5} style={{ padding: "12px 8px" }}>Todavía no tienes cuentas de dinero activas.</td></tr>
              )}
            </tbody>
            {filasResumen.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                  <td style={{ padding: "8px" }} colSpan={3}>Sumatoria</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>${sumatoriaDolares.toFixed(2)}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>C$ {sumatoriaCordobas.toFixed(2)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Transferir entre cuentas</h3>
        <p>Mueve dinero entre dos de tus propias cuentas — no es un gasto ni un ingreso. Si son monedas distintas, se convierte con la tasa de cambio de arriba.</p>
        {cuentasDineroActivas.length < 2 ? (
          <p className="mt-8">Necesitas al menos 2 cuentas de dinero activas para transferir entre ellas.</p>
        ) : (
          <>
            <div className="form-grid mt-16">
              <label>
                <span className="field-label">Desde</span>
                <select className="input" value={cuentaOrigenId} onChange={(e) => { setCuentaOrigenId(e.target.value); if (e.target.value === cuentaDestinoId) setCuentaDestinoId(""); }}>
                  <option value="">Selecciona la cuenta de origen…</option>
                  {cuentasDineroActivas.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre} (saldo {formatoMoneda(c.saldoActual ?? c.saldo_actual, c.moneda)})</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="field-label">Hacia</span>
                <select className="input" value={cuentaDestinoId} onChange={(e) => setCuentaDestinoId(e.target.value)} disabled={!cuentaOrigenId}>
                  <option value="">Selecciona la cuenta destino…</option>
                  {cuentasDestinoDisponibles.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre} (saldo {formatoMoneda(c.saldoActual ?? c.saldo_actual, c.moneda)})</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="field-label">Monto {cuentaOrigen ? `(en ${cuentaOrigen.moneda === "NIO" ? "córdobas" : "dólares"})` : ""}</span>
                <input className="input" type="number" value={montoTransferencia} onChange={(e) => setMontoTransferencia(e.target.value)} />
              </label>
              <label><span className="field-label">Nota (opcional)</span><input className="input" value={notaTransferencia} onChange={(e) => setNotaTransferencia(e.target.value)} /></label>
            </div>

            {cuentaOrigen && cuentaDestino && numero(montoTransferencia) > 0 && (
              previewDestino !== null ? (
                <div className="info-box mt-16">
                  {cuentaDestino.nombre} va a recibir <b>{formatoMoneda(previewDestino, cuentaDestino.moneda)}</b>
                  {cuentaOrigen.moneda !== cuentaDestino.moneda && ` (convertido desde ${formatoMoneda(montoTransferencia, cuentaOrigen.moneda)})`}.
                </div>
              ) : (
                <div className="info-box mt-16" style={{ color: "var(--danger)" }}>
                  Falta configurar la tasa de cambio para convertir entre {cuentaOrigen.moneda} y {cuentaDestino.moneda}.
                </div>
              )
            )}

            <button className="btn btn-primary mt-16" disabled={transfiriendo || !cuentaOrigen || !cuentaDestino} onClick={transferir}>
              {transfiriendo ? "Transfiriendo..." : "Transferir"}
            </button>
          </>
        )}
      </div>

      <div className="grid-4">
        <div className="metric">
          <b>Cuentas de dinero activas</b>
          <span className="metric-value">{cuentasDineroActivas.length}</span>
        </div>
        <div className="metric">
          <b>Cuentas contables activas</b>
          <span className="metric-value">{cuentasActivas.length}</span>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Cuentas de dinero (caja / bancos)</h3>
          <p>Cada gasto, ingreso o pago a proveedor puede elegir de cuál de estas sale o entra el dinero. El saldo se actualiza solo.</p>
          <div className="form-grid mt-16">
            <label><span className="field-label">Nombre</span><input className="input" placeholder="Ej. Banco BAC" value={nombreDinero} onChange={(e) => setNombreDinero(e.target.value)} /></label>
            <label>
              <span className="field-label">Tipo</span>
              <select className="input" value={tipoDinero} onChange={(e) => setTipoDinero(e.target.value)}>
                <option value="efectivo">Efectivo</option>
                <option value="banco">Banco</option>
              </select>
            </label>
          </div>
          <div className="form-grid mt-8">
            <label>
              <span className="field-label">Moneda</span>
              <select className="input" value={monedaDinero} onChange={(e) => setMonedaDinero(e.target.value)}>
                <option value="USD">Dólares (US$)</option>
                <option value="NIO">Córdobas (C$)</option>
              </select>
            </label>
            <label><span className="field-label">Saldo inicial</span><input className="input" type="number" value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} /></label>
          </div>
          {cuentasActivoDisponibles.length > 0 && (
            <div className="mt-8">
              <Select
                label="¿A cuál cuenta contable de Activo corresponde? (opcional, recomendado)"
                value={cuentaContableDineroId}
                onChange={(e) => setCuentaContableDineroId(e.target.value)}
                options={[
                  { value: "", label: "Sin vincular" },
                  ...cuentasActivoDisponibles.map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nombre}` }))
                ]}
              />
            </div>
          )}
          <button className="btn btn-primary mt-16" disabled={guardandoDinero} onClick={guardarCuentaDinero}>
            {guardandoDinero ? "Guardando..." : "Crear cuenta de dinero"}
          </button>

          <div className="list mt-16">
            {cuentasDineroActivas.map((c) => (
              <div key={c.id} className="row-card">
                <div>
                  <b>{c.nombre}</b> <span className="badge badge-neutral">{c.tipo === "banco" ? "Banco" : "Efectivo"}</span> <span className="badge badge-info">{c.moneda === "NIO" ? "C$" : "$"}</span>
                  <p>Saldo inicial {c.moneda === "NIO" ? "C$" : "$"}{numero(c.saldoInicial ?? c.saldo_inicial).toFixed(2)}</p>
                </div>
                <div className="stack-gap-sm text-right">
                  <b>{c.moneda === "NIO" ? "C$" : "$"}{numero(c.saldoActual ?? c.saldo_actual).toFixed(2)}</b>
                  <button className="btn btn-danger" onClick={() => eliminarCuentaDineroHandler(c)}>Desactivar</button>
                </div>
              </div>
            ))}
            {cuentasDineroActivas.length === 0 && <p>Todavía no hay cuentas de dinero.</p>}
          </div>
        </div>

        <div className="card">
          <h3>Catálogo de cuentas contables</h3>
          <p>Clasificación base para los reportes de Finanzas (Estado de Resultados, Balance General).</p>
          <div className="form-grid mt-16">
            <label><span className="field-label">Código</span><input className="input" placeholder="Ej. 6060" value={codigo} onChange={(e) => setCodigo(e.target.value)} /></label>
            <label><span className="field-label">Nombre</span><input className="input" placeholder="Ej. Mantenimiento" value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
          </div>
          <div className="form-grid mt-8">
            <label>
              <span className="field-label">Tipo</span>
              <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_CUENTA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label>
              <span className="field-label">Naturaleza</span>
              <select className="input" value={naturaleza} onChange={(e) => setNaturaleza(e.target.value)}>
                <option value="deudora">Deudora</option>
                <option value="acreedora">Acreedora</option>
              </select>
            </label>
          </div>
          <button className="btn btn-primary mt-16" disabled={guardandoCuenta} onClick={guardarCuentaContable}>
            {guardandoCuenta ? "Guardando..." : "Crear cuenta"}
          </button>

          <div className="list mt-16">
            {cuentasActivas.map((c) => (
              <div key={c.id} className="row-card">
                <div>
                  <b>{c.codigo} · {c.nombre}</b> <span className="badge badge-neutral">{c.tipo}</span>
                  <p>Naturaleza {c.naturaleza}</p>
                </div>
                <button className="btn btn-danger" onClick={() => eliminarCuentaContable(c)}>Desactivar</button>
              </div>
            ))}
            {cuentasActivas.length === 0 && <p>Todavía no hay cuentas en el catálogo.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}