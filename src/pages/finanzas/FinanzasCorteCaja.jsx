// src/pages/finanzas/FinanzasCorteCaja.jsx
//
// Una tarjeta por cada cuenta de dinero tipo "efectivo" (los bancos no
// se cuentan a mano, no aplica el patrón de corte de caja). Si tiene
// una caja abierta, muestra el esperado en vivo y el botón para
// cerrarla contando el efectivo real. Si no, permite abrir una nueva.
import { useEffect, useMemo, useState } from "react";
import { numero } from "../../utils/numero";
import { formatoMoneda } from "../../utils/moneda";
import { abrirCaja, cerrarCaja, obtenerCorteAbierto, calcularEsperadoEnVivo, listarCortesCaja } from "../../services/cortesCajaService";

function TarjetaCaja({ cuenta, auth, mostrarToast, cargarDatos }) {
  const [corteAbierto, setCorteAbierto] = useState(undefined); // undefined = cargando
  const [esperadoEnVivo, setEsperadoEnVivo] = useState(null);
  const [montoApertura, setMontoApertura] = useState("");
  const [montoCierre, setMontoCierre] = useState("");
  const [notas, setNotas] = useState("");
  const [mostrarFormCierre, setMostrarFormCierre] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);

  const cargar = async () => {
    const abierto = await obtenerCorteAbierto(cuenta.id);
    setCorteAbierto(abierto);
    if (abierto) {
      const esperado = await calcularEsperadoEnVivo(abierto, cuenta.id);
      setEsperadoEnVivo(esperado);
      setMontoCierre(esperado.toFixed(2));
    }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [cuenta.id]);

  const abrir = async () => {
    setProcesando(true);
    try {
      await abrirCaja({ cuentaDinero: cuenta, montoContado: montoApertura, auth });
      mostrarToast(`Caja "${cuenta.nombre}" abierta.`);
      setMontoApertura("");
      await cargar();
    } catch (err) {
      mostrarToast(err.message || "No se pudo abrir la caja.", "error");
    } finally {
      setProcesando(false);
    }
  };

  const cerrar = async () => {
    setProcesando(true);
    try {
      const { diferencia } = await cerrarCaja({ corte: corteAbierto, cuentaDinero: cuenta, montoContado: montoCierre, notas, auth });
      if (Math.abs(diferencia) > 0.01) {
        mostrarToast(`Caja cerrada — ${diferencia < 0 ? "faltante" : "sobrante"} de ${formatoMoneda(Math.abs(diferencia), cuenta.moneda)} registrado.`, "warning");
      } else {
        mostrarToast("Caja cerrada — cuadró exacto.");
      }
      setMostrarFormCierre(false);
      setNotas("");
      await cargar();
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo cerrar la caja.", "error");
    } finally {
      setProcesando(false);
    }
  };

  const verHistorial = async () => {
    if (!mostrarHistorial) {
      const datos = await listarCortesCaja(cuenta.id);
      setHistorial(datos.filter((c) => c.estado === "cerrado"));
    }
    setMostrarHistorial((v) => !v);
  };

  if (corteAbierto === undefined) return <div className="card"><p>Cargando...</p></div>;

  return (
    <div className="card">
      <div className="page-title" style={{ margin: 0 }}>
        <h3>{cuenta.nombre}</h3>
        {corteAbierto ? <span className="badge badge-success">Caja abierta</span> : <span className="badge badge-neutral">Cerrada</span>}
      </div>

      {!corteAbierto && (
        <>
          <p>Abre la caja contando el efectivo físico con el que arrancas el turno.</p>
          <div className="form-grid mt-16">
            <label>
              <span className="field-label">Monto contado al abrir ({cuenta.moneda === "NIO" ? "córdobas" : "dólares"})</span>
              <input className="input" type="number" value={montoApertura} onChange={(e) => setMontoApertura(e.target.value)} placeholder={numero(cuenta.saldoActual ?? cuenta.saldo_actual).toFixed(2)} />
            </label>
          </div>
          <button className="btn btn-primary mt-16" disabled={procesando} onClick={abrir}>
            {procesando ? "Abriendo..." : "Abrir caja"}
          </button>
        </>
      )}

      {corteAbierto && (
        <>
          <div className="grid-4 mt-16">
            <div className="metric">
              <b>Abierta desde</b>
              <span className="metric-value" style={{ fontSize: "1rem" }}>{new Date(corteAbierto.hora_apertura).toLocaleTimeString("es-NI")}</span>
            </div>
            <div className="metric">
              <b>Monto inicial</b>
              <span className="metric-value">{formatoMoneda(corteAbierto.saldo_apertura, cuenta.moneda)}</span>
            </div>
            <div className="metric">
              <b>Esperado ahora mismo</b>
              <span className="metric-value">{formatoMoneda(esperadoEnVivo ?? 0, cuenta.moneda)}</span>
            </div>
          </div>

          {!mostrarFormCierre ? (
            <button className="btn btn-primary mt-16" onClick={() => setMostrarFormCierre(true)}>Cerrar caja</button>
          ) : (
            <div className="mt-16" style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              <label>
                <span className="field-label">Monto contado al cerrar ({cuenta.moneda === "NIO" ? "córdobas" : "dólares"})</span>
                <input className="input" type="number" value={montoCierre} onChange={(e) => setMontoCierre(e.target.value)} />
              </label>
              {numero(montoCierre) !== esperadoEnVivo && (
                <p className="mt-8" style={{ color: numero(montoCierre) < esperadoEnVivo ? "var(--danger)" : "var(--success)" }}>
                  {numero(montoCierre) < esperadoEnVivo ? "Faltante" : "Sobrante"} de {formatoMoneda(Math.abs(numero(montoCierre) - esperadoEnVivo), cuenta.moneda)} — se registrará automáticamente.
                </p>
              )}
              <textarea className="input mt-8" placeholder="Nota (opcional — ej. explicación de la diferencia)" value={notas} onChange={(e) => setNotas(e.target.value)} />
              <div className="segment mt-8">
                <button className="btn btn-primary" disabled={procesando} onClick={cerrar}>{procesando ? "Cerrando..." : "Confirmar cierre"}</button>
                <button className="btn btn-ghost" onClick={() => setMostrarFormCierre(false)}>Cancelar</button>
              </div>
            </div>
          )}
        </>
      )}

      <button className="btn btn-ghost mt-16" onClick={verHistorial}>{mostrarHistorial ? "Ocultar historial ▲" : "Ver historial de cortes ▼"}</button>
      {mostrarHistorial && (
        <div className="list mt-8">
          {historial.map((c) => (
            <div key={c.id} className="row-card">
              <div>
                <b>{new Date(c.hora_apertura).toLocaleDateString("es-NI")}</b>
                <p>Apertura {formatoMoneda(c.saldo_apertura, cuenta.moneda)} · Esperado {formatoMoneda(c.saldo_esperado_cierre, cuenta.moneda)} · Contado {formatoMoneda(c.saldo_contado_cierre, cuenta.moneda)}</p>
                {c.notas && <small>{c.notas}</small>}
              </div>
              <span className={`badge ${Math.abs(numero(c.diferencia)) <= 0.01 ? "badge-success" : "badge-danger"}`}>
                {numero(c.diferencia) === 0 ? "Cuadró" : formatoMoneda(c.diferencia, cuenta.moneda)}
              </span>
            </div>
          ))}
          {historial.length === 0 && <p>Sin cortes anteriores.</p>}
        </div>
      )}
    </div>
  );
}

export default function FinanzasCorteCaja({ cuentasDinero = [], auth, mostrarToast, cargarDatos }) {
  const cuentasEfectivo = useMemo(
    () => cuentasDinero.filter((c) => c.tipo === "efectivo" && c.activa !== false),
    [cuentasDinero]
  );

  return (
    <div>
      <div className="info-box mt-8">
        El corte de caja solo aplica a cuentas de <b>efectivo</b> — un banco no se cuenta a mano. Al cerrar, el sistema compara lo que contaste contra lo que el libro diario dice que debería haber (apertura + movimientos del turno). Si no cuadra, se registra el faltante o sobrante automáticamente.
      </div>

      {cuentasEfectivo.length === 0 && (
        <div className="card mt-16"><p>No tienes cuentas de dinero tipo "efectivo" todavía. Créalas en Finanzas → Cuentas.</p></div>
      )}

      {cuentasEfectivo.map((cuenta) => (
        <TarjetaCaja key={cuenta.id} cuenta={cuenta} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} />
      ))}
    </div>
  );
}