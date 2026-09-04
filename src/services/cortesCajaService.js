// src/services/cortesCajaService.js
//
// Corte de caja diario, estilo POS: se abre con un monto contado a
// mano, y al cerrar se cuenta de nuevo y se compara contra lo que el
// libro diario dice que debería haber (saldo de apertura + movimientos
// reales posteados a esa cuenta durante la sesión). Si no cuadra, se
// postea un asiento de ajuste automático — así el faltante/sobrante
// queda reflejado en el Estado de Resultados, no se pierde.
//
// Solo tiene sentido para cuentas de dinero tipo "efectivo" — un banco
// no se cuenta a mano, se concilia distinto (fuera del alcance de esto).
import { supabase } from "../supabase";
import { numero } from "../utils/numero";
import { firmarPayload, registrarAuditoria } from "./coreService";
import { postearAsiento } from "./ContabilidadService";

export const listarCortesCaja = async (cuentaDineroId) => {
  let query = supabase.from("cortes_caja").select("*").order("hora_apertura", { ascending: false });
  if (cuentaDineroId) query = query.eq("cuenta_dinero_id", cuentaDineroId);
  const { data, error } = await query.limit(200);
  if (error) throw error;
  return data;
};

export const obtenerCorteAbierto = async (cuentaDineroId) => {
  const { data, error } = await supabase
    .from("cortes_caja").select("*")
    .eq("cuenta_dinero_id", cuentaDineroId).eq("estado", "abierto")
    .maybeSingle();
  if (error) throw error;
  return data;
};

export const abrirCaja = async ({ cuentaDinero, montoContado, auth }) => {
  const yaAbierto = await obtenerCorteAbierto(cuentaDinero.id);
  if (yaAbierto) throw new Error(`"${cuentaDinero.nombre}" ya tiene una caja abierta desde ${new Date(yaAbierto.hora_apertura).toLocaleString("es-NI")}. Ciérrala antes de abrir una nueva.`);

  const { data, error } = await supabase.from("cortes_caja").insert([{
    cuenta_dinero_id: cuentaDinero.id,
    estado: "abierto",
    hora_apertura: new Date().toISOString(),
    saldo_apertura: numero(montoContado),
    ...firmarPayload(auth)
  }]).select().single();
  if (error) throw error;

  await registrarAuditoria({
    ...auth, accion: "Abrió caja", modulo: "Finanzas", registroCodigo: cuentaDinero.nombre,
    detalle: `Monto inicial contado: $${numero(montoContado).toFixed(2)}`
  });

  return data;
};

const movimientosDeSesion = async (cuentaDineroId, desde, hasta) => {
  const { data, error } = await supabase
    .from("movimientos_contables")
    .select("debe, haber, asientos_contables!inner(fecha)")
    .eq("cuenta_dinero_id", cuentaDineroId)
    .gte("asientos_contables.fecha", desde)
    .lte("asientos_contables.fecha", hasta);
  if (error) throw error;
  return data.reduce((a, m) => a + numero(m.debe) - numero(m.haber), 0);
};

export const cerrarCaja = async ({ corte, cuentaDinero, montoContado, notas, auth }) => {
  const horaCierre = new Date().toISOString();
  const movimientosSesion = await movimientosDeSesion(cuentaDinero.id, corte.hora_apertura, horaCierre);
  const esperado = numero(corte.saldo_apertura) + movimientosSesion;
  const contado = numero(montoContado);
  const diferencia = contado - esperado;

  const { error } = await supabase.from("cortes_caja").update({
    estado: "cerrado",
    hora_cierre: horaCierre,
    saldo_esperado_cierre: esperado,
    saldo_contado_cierre: contado,
    diferencia,
    notas: notas || "",
    cerrado_by: auth.session?.user?.id || null,
    cerrado_by_name: auth.usuarioActual?.nombre || auth.usuarioActual?.email || auth.session?.user?.email || "Usuario"
  }).eq("id", corte.id);
  if (error) throw error;

  if (Math.abs(diferencia) > 0.01 && cuentaDinero.cuentaContableId) {
    const { data: cuentaContable } = await supabase
      .from("cuentas_contables").select("codigo").eq("id", cuentaDinero.cuentaContableId).single();

    if (cuentaContable) {
      const esFaltante = diferencia < 0;
      const monto = Math.abs(diferencia);
      await postearAsiento({
        fecha: horaCierre,
        descripcion: `${esFaltante ? "Faltante" : "Sobrante"} de caja · ${cuentaDinero.nombre} · corte #${corte.id}`,
        origenModulo: "cortes_caja",
        origenId: corte.id,
        auth,
        lineas: esFaltante
          ? [
              { cuentaCodigo: "6070", debe: monto, haber: 0 },
              { cuentaCodigo: cuentaContable.codigo, cuentaDineroId: cuentaDinero.id, debe: 0, haber: monto }
            ]
          : [
              { cuentaCodigo: cuentaContable.codigo, cuentaDineroId: cuentaDinero.id, debe: monto, haber: 0 },
              { cuentaCodigo: "4030", debe: 0, haber: monto }
            ]
      });
    }

    await supabase.from("cuentas_dinero").update({ saldo_actual: contado }).eq("id", cuentaDinero.id);
  }

  await registrarAuditoria({
    ...auth, accion: "Cerró caja", modulo: "Finanzas", registroCodigo: cuentaDinero.nombre,
    detalle: `Esperado $${esperado.toFixed(2)} · Contado $${contado.toFixed(2)} · Diferencia $${diferencia.toFixed(2)}`
  });

  return { esperado, contado, diferencia };
};

export const calcularEsperadoEnVivo = async (corte, cuentaDineroId) => {
  const movimientosSesion = await movimientosDeSesion(cuentaDineroId, corte.hora_apertura, new Date().toISOString());
  return numero(corte.saldo_apertura) + movimientosSesion;
};