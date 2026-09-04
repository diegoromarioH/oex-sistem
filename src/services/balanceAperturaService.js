// src/services/balanceAperturaService.js
//
// "Foto" con la que arranca la contabilidad formal: cuánto tiene la
// empresa (activos), cuánto debe (pasivos) y el capital de los dueños,
// en la fecha que se elija como inicio. Es un snapshot único — guardar
// reemplaza todo el balance anterior. Desde que existe el libro diario,
// cada vez que se guarda también se postea (reemplazando el anterior)
// como el primer asiento contable real, origen_modulo = 'apertura' —
// así el Balance General y el Estado de Resultados que se calculen a
// partir del libro diario parten de un punto de partida correcto.
import { supabase } from "../supabase";
import { numero } from "../utils/numero";
import { firmarPayload, registrarAuditoria } from "./coreService";
import { postearAsientoPorId, eliminarAsientosDeOrigen } from "./contabilidadService";

export const listarBalanceApertura = async () => {
  const { data, error } = await supabase.from("balance_apertura").select("*");
  if (error) throw error;
  return data;
};

export const obtenerConfiguracionContable = async () => {
  const { data, error } = await supabase.from("configuracion_contable").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  return data;
};

export const guardarFechaApertura = async ({ fechaApertura, auth }) => {
  if (!fechaApertura) throw new Error("Selecciona la fecha de apertura.");
  const { error } = await supabase.from("configuracion_contable").upsert([{
    id: 1,
    fecha_apertura: fechaApertura,
    updated_by: auth.session?.user?.id || null,
    updated_by_name: auth.usuarioActual?.nombre || auth.usuarioActual?.email || auth.session?.user?.email || "Usuario"
  }]);
  if (error) throw error;
};

// filas: [{ cuentaContableId, monto }]. Valida que Activos = Pasivos +
// Patrimonio antes de tocar la base de datos — si no cuadra, no guarda
// nada y explica la diferencia para que se corrija desde la UI.
export const guardarBalanceApertura = async ({ filas, cuentasContables, fechaApertura, auth }) => {
  const cuentaPorId = new Map(cuentasContables.map((c) => [c.id, c]));

  let totalActivo = 0, totalPasivo = 0, totalPatrimonio = 0;
  filas.forEach((f) => {
    const cuenta = cuentaPorId.get(f.cuentaContableId);
    if (!cuenta) return;
    const monto = numero(f.monto);
    if (cuenta.tipo === "activo") totalActivo += monto;
    if (cuenta.tipo === "pasivo") totalPasivo += monto;
    if (cuenta.tipo === "patrimonio") totalPatrimonio += monto;
  });

  const diferencia = totalActivo - totalPasivo - totalPatrimonio;
  if (Math.abs(diferencia) > 0.01) {
    throw new Error(
      `El balance no cuadra: activos $${totalActivo.toFixed(2)} vs. pasivos + patrimonio $${(totalPasivo + totalPatrimonio).toFixed(2)} ` +
      `(diferencia $${diferencia.toFixed(2)}). Ajusta el monto de Capital para que cuadre antes de guardar.`
    );
  }

  const filasConMonto = filas.filter((f) => numero(f.monto) !== 0);

  // Reemplaza todo el snapshot anterior — más simple y seguro que
  // intentar hacer upsert fila por fila cuando también hay que borrar
  // cuentas que quedaron en $0.
  const { error: errorBorrado } = await supabase.from("balance_apertura").delete().neq("id", 0);
  if (errorBorrado) throw errorBorrado;

  if (filasConMonto.length > 0) {
    const { error } = await supabase.from("balance_apertura").insert(
      filasConMonto.map((f) => ({
        cuenta_contable_id: f.cuentaContableId,
        monto: numero(f.monto),
        ...firmarPayload(auth)
      }))
    );
    if (error) throw error;
  }

  // Reemplaza también el asiento de apertura en el libro diario. Se
  // borra el anterior (si existía) y se postea uno nuevo con las líneas
  // vigentes — un snapshot no tiene historial de reversiones, solo una
  // versión vigente.
  await eliminarAsientosDeOrigen("apertura");
  if (filasConMonto.length > 0) {
    await postearAsientoPorId({
      fecha: fechaApertura ? `${fechaApertura}T12:00:00` : new Date().toISOString(),
      descripcion: "Balance de apertura",
      origenModulo: "apertura",
      origenId: null,
      auth,
      lineas: filasConMonto.map((f) => {
        const cuenta = cuentaPorId.get(f.cuentaContableId);
        const monto = numero(f.monto);
        // Activo es de naturaleza deudora → su saldo de apertura va al
        // Debe. Pasivo y Patrimonio son de naturaleza acreedora → van
        // al Haber. Esto es lo que hace que el asiento cuadre solo,
        // porque ya validamos arriba que Activo = Pasivo + Patrimonio.
        return cuenta.tipo === "activo"
          ? { cuentaContableId: f.cuentaContableId, debe: monto, haber: 0 }
          : { cuentaContableId: f.cuentaContableId, debe: 0, haber: monto };
      })
    });
  }

  await registrarAuditoria({
    ...auth, accion: "Guardó balance de apertura", modulo: "Finanzas",
    detalle: `Activos $${totalActivo.toFixed(2)} = Pasivos $${totalPasivo.toFixed(2)} + Patrimonio $${totalPatrimonio.toFixed(2)}`
  });
};