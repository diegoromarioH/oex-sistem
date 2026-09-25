// src/services/ingresosService.js
import { supabase } from "../supabase";
import { numero } from "../utils/numero";
import { firmarPayload, registrarAuditoria } from "./coreService";
import { ajustarSaldoCuentaDinero } from "./cuentasDineroService";
import { postearAsiento, reversarAsientosDeOrigen } from "./ContabilidadService";
import { convertirMoneda, montoEnUSD, redondearDinero } from "../utils/conversionMoneda";

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
  const horaActual = new Date().toTimeString().slice(0, 8); // HH:MM:SS
  const monto = numero(form.monto);
  const moneda = form.moneda === "NIO" ? "NIO" : "USD";
  const monedaCuenta = form.cuentaDinero?.moneda || moneda;
  const tasaCambio = numero(form.tasaCambio);
  if (moneda !== monedaCuenta && tasaCambio <= 0) throw new Error("Configura una tasa de cambio válida para mover dinero entre USD y NIO.");
  const montoCuenta = form.cuentaDinero?.id ? convertirMoneda({ monto, monedaOrigen:moneda, monedaDestino:monedaCuenta, tasaCambio }) : null;
  const montoUSD = montoEnUSD({ monto, moneda, tasaCambio });
  const fechaISO = new Date(`${form.fecha}T${horaActual}`).toISOString();
  const { data: creado, error } = await supabase.from("ingresos_operativos").insert([{
    fecha_iso: fechaISO,
    categoria: form.categoria || "General",
    descripcion: form.descripcion,
    monto:redondearDinero(monto),
    moneda,
    tasa_cambio:tasaCambio > 0 ? tasaCambio : null,
    monto_cuenta:montoCuenta,
    cliente_id: form.cliente?.id || null,
    cliente_nombre: form.cliente?.nombre || "",
    cuenta_dinero_id: form.cuentaDinero?.id || null,
    ...firmarPayload(auth)
  }]).select().single();
  if (error) throw error;

  if (form.cuentaDinero?.id) {
    await ajustarSaldoCuentaDinero(form.cuentaDinero.id, montoCuenta);

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
            { cuentaCodigo: cuentaContable.codigo, cuentaDineroId: form.cuentaDinero.id, debe: montoUSD, haber: 0 },
            { cuentaCodigo: CUENTA_INGRESO, debe: 0, haber: montoUSD }
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
    await ajustarSaldoCuentaDinero(ingreso.cuentaDineroId, -numero(ingreso.montoCuenta || ingreso.monto));
  }

  await reversarAsientosDeOrigen({ origenModulo: "ingresos_operativos", origenId: ingreso.id, auth });

  await registrarAuditoria({
    ...auth, accion: "Eliminó ingreso", modulo: "Finanzas", registroCodigo: ingreso.categoria || "Ingreso",
    detalle: `${ingreso.descripcion} · $${numero(ingreso.monto).toFixed(2)}`
  });
};