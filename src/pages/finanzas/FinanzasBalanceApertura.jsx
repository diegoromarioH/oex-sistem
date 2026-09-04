// src/pages/finanzas/FinanzasBalanceApertura.jsx
//
// La "foto" con la que arranca la contabilidad formal. Se completa una
// sola vez (editable mientras no se cierre) y es el punto de partida
// del futuro Balance General: Activos = Pasivos + Patrimonio, en la
// fecha de apertura elegida.
import { useEffect, useMemo, useState } from "react";
import { numero } from "../../utils/numero";
import { guardarBalanceApertura, guardarFechaApertura } from "../../services/balanceAperturaService";

const TITULOS = { activo: "Activos", pasivo: "Pasivos", patrimonio: "Patrimonio" };

export default function FinanzasBalanceApertura({ cuentasContables = [], cuentasDinero = [], balanceApertura = [], fechaApertura, rol, auth, mostrarToast, cargarDatos }) {
  const cuentasBalance = useMemo(
    () => cuentasContables.filter((c) => ["activo", "pasivo", "patrimonio"].includes(c.tipo) && c.activa !== false),
    [cuentasContables]
  );

  const [montos, setMontos] = useState({});
  const [fecha, setFecha] = useState(fechaApertura || new Date().toISOString().slice(0, 10));
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const inicial = {};
    cuentasBalance.forEach((c) => { inicial[c.id] = ""; });
    balanceApertura.forEach((f) => { inicial[f.cuentaContableId] = String(f.monto); });
    setMontos(inicial);
  }, [cuentasBalance, balanceApertura]);

  const setMonto = (id, valor) => setMontos((m) => ({ ...m, [id]: valor }));

  const totales = useMemo(() => {
    let activo = 0, pasivo = 0, patrimonio = 0;
    cuentasBalance.forEach((c) => {
      const v = numero(montos[c.id]);
      if (c.tipo === "activo") activo += v;
      if (c.tipo === "pasivo") pasivo += v;
      if (c.tipo === "patrimonio") patrimonio += v;
    });
    return { activo, pasivo, patrimonio, diferencia: activo - pasivo - patrimonio };
  }, [cuentasBalance, montos]);

  const cuadra = Math.abs(totales.diferencia) <= 0.01;

  // Trae el saldo_inicial de cada cuenta de dinero hacia la cuenta
  // contable de Activo con la que esté vinculada (ver campo
  // cuenta_contable_id en Finanzas → Cuentas). Solo copia — no borra
  // montos de cuentas que no estén vinculadas a ninguna cuenta de dinero.
  const autocompletarCaja = () => {
    const vinculadas = cuentasDinero.filter((cd) => cd.cuentaContableId);
    if (vinculadas.length === 0) {
      return mostrarToast("Ninguna cuenta de dinero está vinculada a una cuenta contable todavía (edítala en Finanzas → Cuentas).", "error");
    }
    const nuevos = { ...montos };
    vinculadas.forEach((cd) => {
      nuevos[cd.cuentaContableId] = String(numero(cd.saldoInicial ?? cd.saldo_inicial));
    });
    setMontos(nuevos);
    mostrarToast("Saldos copiados desde Cuentas de dinero.");
  };

  // Ajusta la cuenta de Capital (o la primera de Patrimonio si no existe
  // "3010") para que el balance cuadre exactamente con lo que ya
  // escribiste en el resto de cuentas.
  const ajustarCapital = () => {
    const cuentaCapital = cuentasBalance.find((c) => c.codigo === "3010") || cuentasBalance.find((c) => c.tipo === "patrimonio");
    if (!cuentaCapital) return mostrarToast("No hay ninguna cuenta de Patrimonio en el catálogo todavía.", "error");
    const patrimonioSinCapital = totales.patrimonio - numero(montos[cuentaCapital.id]);
    const nuevoCapital = totales.activo - totales.pasivo - patrimonioSinCapital;
    setMonto(cuentaCapital.id, String(nuevoCapital));
    mostrarToast(`Capital ajustado a $${nuevoCapital.toFixed(2)} para que el balance cuadre.`);
  };

  const guardar = async () => {
    if (rol !== "admin") return mostrarToast("Solo un administrador puede definir el balance de apertura.", "error");
    setGuardando(true);
    try {
      await guardarFechaApertura({ fechaApertura: fecha, auth });
      const filas = cuentasBalance.map((c) => ({ cuentaContableId: c.id, monto: numero(montos[c.id]) }));
      await guardarBalanceApertura({ filas, cuentasContables, auth });
      mostrarToast("Balance de apertura guardado.");
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo guardar.", "error");
    } finally {
      setGuardando(false);
    }
  };

  const Grupo = ({ tipo }) => {
    const filas = cuentasBalance.filter((c) => c.tipo === tipo);
    return (
      <div className="card">
        <h3>{TITULOS[tipo]}</h3>
        <div className="list mt-16">
          {filas.map((c) => (
            <div key={c.id} className="row-card">
              <div><b>{c.codigo} · {c.nombre}</b></div>
              <input
                className="input input-sm"
                type="number"
                style={{ maxWidth: 160, textAlign: "right" }}
                value={montos[c.id] ?? ""}
                onChange={(e) => setMonto(c.id, e.target.value)}
                placeholder="0.00"
              />
            </div>
          ))}
          {filas.length === 0 && <p>No hay cuentas de tipo {TITULOS[tipo].toLowerCase()} en el catálogo — créalas en Finanzas → Cuentas.</p>}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="info-box mt-8">
        El balance de apertura es la foto con la que arranca la contabilidad formal: cuánto tiene la empresa (activos), cuánto debe (pasivos) y cuál es el capital de los dueños, en la fecha en que empiezas a llevar este control. Los tres deben cuadrar: <b>Activos = Pasivos + Patrimonio</b>.
      </div>

      <div className="card">
        <h3>Fecha de apertura</h3>
        <label className="mt-8">
          <span className="field-label">¿Desde cuándo arranca la contabilidad formal?</span>
          <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
      </div>

      <div className="grid-4 mt-16">
        <div className="metric"><b>Total activos</b><span className="metric-value">${totales.activo.toFixed(2)}</span></div>
        <div className="metric"><b>Total pasivos</b><span className="metric-value">${totales.pasivo.toFixed(2)}</span></div>
        <div className="metric"><b>Total patrimonio</b><span className="metric-value">${totales.patrimonio.toFixed(2)}</span></div>
        <div className="metric">
          <b>Diferencia (debe ser $0)</b>
          <span className="metric-value" style={{ color: cuadra ? "var(--success)" : "var(--danger)" }}>${totales.diferencia.toFixed(2)}</span>
        </div>
      </div>

      <div className="segment mt-16">
        <button className="btn" onClick={autocompletarCaja}>Copiar saldos desde Cuentas de dinero</button>
        <button className="btn" onClick={ajustarCapital}>Ajustar Capital para que cuadre</button>
      </div>

      <Grupo tipo="activo" />
      <Grupo tipo="pasivo" />
      <Grupo tipo="patrimonio" />

      <button className="btn btn-primary mt-16" disabled={guardando || !cuadra} onClick={guardar}>
        {guardando ? "Guardando..." : "Guardar balance de apertura"}
      </button>
      {!cuadra && <p style={{ color: "var(--danger)" }}>El balance no cuadra todavía — usa "Ajustar Capital" o corrige los montos antes de guardar.</p>}
    </div>
  );
}