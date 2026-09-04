// src/services/ingresosService.js
import { supabase } from "../supabase";
import { numero } from "../utils/numero";
import { firmarPayload, registrarAuditoria } from "./coreService";
import { ajustarSaldoCuentaDinero } from "./cuentasDineroService";
import { postearAsiento, reversarAsientosDeOrigen } from "./contabilidadService";

// Todas las categorías de este módulo (seguro de envío, empaque
// especial, comisión, etc.) son por definición "ingresos que no vienen
// de una venta de paquetería" — por eso todas van a la misma cuenta
// contable 4020 Otros Ingresos, sin necesidad de sub-cuenta por
// categoría. La venta de paquetería (4010) se postea desde otro flujo,
// no desde este módulo.
const CUENTA_INGRESO = "4020";

export const guardarIngreso = async ({ form, auth }) => {
  if (!form.descripcion.trim() || numero(form.monto) <= 0) {
    throw new Error("Completa descripción y monto.");
  }
  // Mismo criterio que guardarGasto: la fecha que elige el operador
  // (puede ser un día pasado) combinada con la hora real del momento en
  // que se guarda, no una hora fija.
  const horaActual = new Date().toTimeString().slice(0, 8); // HH:MM:SS
  const monto = numero(form.monto);
  const fechaISO = new Date(`${form.fecha}T${horaActual}`).toISOString();
  const { data: creado, error } = await supabase.from("ingresos_operativos").insert([{
    fecha_iso: fechaISO,
    categoria: form.categoria || "General",
    descripcion: form.descripcion,
    monto,
    // Vínculo opcional a cliente — para ingresos que sí vienen de un
    // cliente puntual (ej. cobro de seguro, empaque especial) pero que no
    // encajan como un pedido SHEIN ni un recibo de Paquetería.
    cliente_id: form.cliente?.id || null,
    cliente_nombre: form.cliente?.nombre || "",
    // Cuenta de dinero (caja/banco) donde entra el efectivo. Opcional.
    cuenta_dinero_id: form.cuentaDinero?.id || null,
    ...firmarPayload(auth)
  }]).select().single();
  if (error) throw error;

  if (form.cuentaDinero?.id) {
    await ajustarSaldoCuentaDinero(form.cuentaDinero.id, monto);

    // Igual que en gastosService: solo se postea si la cuenta de dinero
    // ya está vinculada a una cuenta contable de Activo.
    if (form.cuentaDinero.cuentaContableId) {
      const { data: cuentaContable } = await supabase
        .from("cuentas_contables").select("codigo").eq("id", form.cuentaDinero.cuentaContableId).single();
      if (cuentaContable) {
        await postearAsiento({
          fecha: fechaISO,
          descripcion: `Ingreso: ${form.descripcion}`,
          origenModulo: "ingresos_operativos",
          origenId: creado.id,
          auth,
          lineas: [
            { cuentaCodigo: cuentaContable.codigo, cuentaDineroId: form.cuentaDinero.id, debe: monto, haber: 0 },
            { cuentaCodigo: CUENTA_INGRESO, debe: 0, haber: monto }
          ]
        });
      }
    }
  }

  await registrarAuditoria({
    ...auth, accion: "Registró ingreso", modulo: "Finanzas", registroCodigo: form.categoria || "General",
    detalle: `${form.descripcion} · $${monto.toFixed(2)}${form.cliente?.nombre ? " · " + form.cliente.nombre : ""}${form.cuentaDinero?.nombre ? " · " + form.cuentaDinero.nombre : ""}`
  });
};

export const eliminarIngreso = async ({ ingreso, auth }) => {
  const { error } = await supabase.from("ingresos_operativos").delete().eq("id", ingreso.id);
  if (error) throw error;

  if (ingreso.cuentaDineroId) {
    await ajustarSaldoCuentaDinero(ingreso.cuentaDineroId, -numero(ingreso.monto));
  }

  await reversarAsientosDeOrigen({ origenModulo: "ingresos_operativos", origenId: ingreso.id, auth });

  await registrarAuditoria({
    ...auth, accion: "Eliminó ingreso", modulo: "Finanzas", registroCodigo: ingreso.categoria || "Ingreso",
    detalle: `${ingreso.descripcion} · $${numero(ingreso.monto).toFixed(2)}`
  });
};