// src/services/cuentasDineroService.js
//
// "Seguimiento de dinero" — Fase 1. Cada cuenta_dinero (Caja General,
// Banco X, Banco Y...) mantiene su saldo_actual al día porque
// gastosService / ingresosService / proveedoresService llaman a
// ajustarSaldoCuentaDinero() cada vez que un movimiento elige esa
// cuenta. No hay libro diario todavía: esto es la versión simple y
// directa. Cuando exista el libro diario (Fase 3), este saldo pasará a
// derivarse de la suma de movimientos contables en vez de mantenerse
// como contador — la interfaz de esta función no debería necesitar
// cambiar para quien la consuma.
import { supabase } from "../supabase";
import { numero } from "../utils/numero";
import { firmarPayload, registrarAuditoria } from "./coreService";
import { postearAsiento } from "./ContabilidadService";
import { formatoMoneda } from "../utils/moneda";

export const listarCuentasDinero = async () => {
  const { data, error } = await supabase.from("cuentas_dinero").select("*").order("nombre");
  if (error) throw error;
  return data;
};

export const crearCuentaDinero = async ({ form, auth }) => {
  if (!form.nombre?.trim()) throw new Error("Escribe el nombre de la cuenta.");
  if (!form.tipo) throw new Error("Selecciona el tipo de cuenta (efectivo o banco).");
  const saldoInicial = numero(form.saldoInicial);
  const moneda = form.moneda === "NIO" ? "NIO" : "USD";
  const { error } = await supabase.from("cuentas_dinero").insert([{
    nombre: form.nombre.trim(),
    tipo: form.tipo,
    moneda,
    numero_cuenta: form.numeroCuenta || "",
    saldo_inicial: saldoInicial,
    saldo_actual: saldoInicial,
    cuenta_contable_id: form.cuentaContableId || null,
    ...firmarPayload(auth)
  }]);
  if (error) throw error;
  await registrarAuditoria({
    ...auth, accion: "Creó cuenta de dinero", modulo: "Finanzas",
    registroCodigo: form.nombre.trim(), detalle: `${moneda} · Saldo inicial ${saldoInicial.toFixed(2)}`
  });
};

export const desactivarCuentaDinero = async ({ cuenta, auth }) => {
  const { error } = await supabase.from("cuentas_dinero").update({ activa: false }).eq("id", cuenta.id);
  if (error) throw error;
  await registrarAuditoria({
    ...auth, accion: "Desactivó cuenta de dinero", modulo: "Finanzas", registroCodigo: cuenta.nombre
  });
};

export const ajustarSaldoCuentaDinero = async (cuentaDineroId, delta) => {
  if (!cuentaDineroId || numero(delta) === 0) return;
  const { data: cuenta, error: errorLectura } = await supabase
    .from("cuentas_dinero").select("saldo_actual").eq("id", cuentaDineroId).single();
  if (errorLectura) throw errorLectura;
  const nuevoSaldo = numero(cuenta.saldo_actual) + numero(delta);
  const { error } = await supabase.from("cuentas_dinero").update({ saldo_actual: nuevoSaldo }).eq("id", cuentaDineroId);
  if (error) throw error;
};

export const transferirEntreCuentas = async ({ cuentaOrigen, cuentaDestino, monto, nota, tasaCambio, auth }) => {
  const montoOrigen = numero(monto);
  if (montoOrigen <= 0) throw new Error("El monto debe ser mayor a cero.");
  if (cuentaOrigen.id === cuentaDestino.id) throw new Error("La cuenta de origen y destino no pueden ser la misma.");
  if (montoOrigen > numero(cuentaOrigen.saldoActual ?? cuentaOrigen.saldo_actual) + 0.01) {
    throw new Error(`"${cuentaOrigen.nombre}" no tiene saldo suficiente para esta transferencia.`);
  }

  let montoDestino = montoOrigen;
  let montoUSD = montoOrigen;

  if (cuentaOrigen.moneda !== cuentaDestino.moneda) {
    if (!tasaCambio || tasaCambio <= 0) {
      throw new Error("Configura la tasa de cambio en Configuración → Empresa y documentos antes de transferir entre monedas distintas.");
    }
    montoUSD = cuentaOrigen.moneda === "NIO" ? montoOrigen / tasaCambio : montoOrigen;
    montoDestino = cuentaDestino.moneda === "NIO" ? montoUSD * tasaCambio : montoUSD;
  } else if (cuentaOrigen.moneda === "NIO" && tasaCambio > 0) {
    montoUSD = montoOrigen / tasaCambio;
  }

  await ajustarSaldoCuentaDinero(cuentaOrigen.id, -montoOrigen);
  await ajustarSaldoCuentaDinero(cuentaDestino.id, montoDestino);

  if (cuentaOrigen.cuentaContableId && cuentaDestino.cuentaContableId) {
    const { data: cuentasContables } = await supabase
      .from("cuentas_contables").select("id, codigo")
      .in("id", [cuentaOrigen.cuentaContableId, cuentaDestino.cuentaContableId]);
    const codigoOrigen = cuentasContables?.find((c) => c.id === cuentaOrigen.cuentaContableId)?.codigo;
    const codigoDestino = cuentasContables?.find((c) => c.id === cuentaDestino.cuentaContableId)?.codigo;

    if (codigoOrigen && codigoDestino) {
      await postearAsiento({
        fecha: new Date().toISOString(),
        descripcion: `Transferencia: ${cuentaOrigen.nombre} → ${cuentaDestino.nombre}`,
        origenModulo: "transferencia_cuentas",
        origenId: null,
        auth,
        lineas: [
          { cuentaCodigo: codigoDestino, cuentaDineroId: cuentaDestino.id, debe: montoUSD, haber: 0 },
          { cuentaCodigo: codigoOrigen, cuentaDineroId: cuentaOrigen.id, debe: 0, haber: montoUSD }
        ]
      });
    }
  }

  await registrarAuditoria({
    ...auth, accion: "Transferencia entre cuentas", modulo: "Finanzas",
    registroCodigo: `${cuentaOrigen.nombre} → ${cuentaDestino.nombre}`,
    detalle: `${formatoMoneda(montoOrigen, cuentaOrigen.moneda)} → ${formatoMoneda(montoDestino, cuentaDestino.moneda)}${nota ? " · " + nota : ""}`
  });

  return { montoDestino };
};