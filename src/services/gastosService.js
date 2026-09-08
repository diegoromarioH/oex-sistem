// src/services/gastosService.js
import { supabase } from "../supabase";
import { numero } from "../utils/numero";
import { firmarPayload, registrarAuditoria } from "./coreService";
import { ajustarSaldoCuentaDinero } from "./cuentasDineroService";
import { postearAsiento, reversarAsientosDeOrigen } from "./ContabilidadService";

// Categoría de gasto (texto libre en el formulario) → código de cuenta
// contable de tipo "gasto" en el catálogo. Si aparece una categoría que
// no está aquí, cae en Gastos Generales (6060) en vez de romper el
// guardado — mejor un asiento clasificado de más a "General" que
// bloquear el registro del gasto.
const CATEGORIA_A_CUENTA = {
  "General": "6060",
  "Transporte": "6010",
  "Bodega": "6020",
  "Aduana": "6030",
  "Salarios": "6040",
  "Publicidad": "6050"
};
const cuentaDeCategoria = (categoria) => CATEGORIA_A_CUENTA[categoria] || "6060";

export const guardarGasto = async ({ form, auth }) => {
  if (!form.descripcion.trim() || numero(form.monto) <= 0) {
    throw new Error("Completa descripción y monto.");
  }
  // Antes se guardaba con hora fija (T12:00:00) sin importar cuándo se
  // registraba realmente — por eso todos los gastos mostraban la misma
  // hora. Ahora se usa la fecha que elige el operador (puede ser un día
  // pasado) combinada con la hora real del momento en que se guarda.
  const horaActual = new Date().toTimeString().slice(0, 8); // HH:MM:SS
  const monto = numero(form.monto);
  const moneda = form.moneda === "NIO" ? "NIO" : "USD";
  const monedaCuenta = form.cuentaDinero?.moneda || moneda;
  const tasaCambio = numero(form.tasaCambio);
  if ((moneda === "NIO" || (form.cuentaDinero?.id && moneda !== monedaCuenta)) && tasaCambio <= 0) {
    throw new Error("Escribe una tasa de cambio válida para registrar el gasto en córdobas.");
  }
  const montoUSD = moneda === "NIO" ? monto / tasaCambio : monto;
  const montoCuenta = monedaCuenta === moneda
    ? monto
    : monedaCuenta === "NIO" ? montoUSD * tasaCambio : montoUSD;
  const fechaISO = new Date(`${form.fecha}T${horaActual}`).toISOString();
  const { data: creado, error } = await supabase.from("gastos_operativos").insert([{
    fecha_iso: fechaISO,
    categoria: form.categoria || "General",
    descripcion: form.descripcion,
    monto,
    moneda,
    tasa_cambio: tasaCambio > 0 ? tasaCambio : null,
    monto_cuenta: form.cuentaDinero?.id ? montoCuenta : null,
    // Vínculo opcional a proveedor — para pagos a proveedores que no son
    // Aduana/Flete (esos van por el flujo de factura por tracking en
    // proveedoresService.js). form.proveedor es el objeto completo del
    // proveedor elegido en el select, o null/"" si no aplica.
    proveedor_id: form.proveedor?.id || null,
    proveedor_nombre: form.proveedor?.nombre || "",
    // Cuenta de dinero (caja/banco) de donde sale el efectivo. Opcional
    // para no romper el flujo de quien no la use — ver cuentasDineroService.js.
    cuenta_dinero_id: form.cuentaDinero?.id || null,
    ...firmarPayload(auth)
  }]).select().single();
  if (error) throw error;

  if (form.cuentaDinero?.id) {
    await ajustarSaldoCuentaDinero(form.cuentaDinero.id, -montoCuenta);

    // Solo se postea al libro diario si la cuenta de dinero elegida
    // está vinculada a una cuenta contable de Activo (campo
    // cuenta_contable_id, ver Finanzas → Cuentas). Si no lo está, el
    // gasto se guarda igual y el saldo de caja se ajusta igual — solo
    // no queda asiento formal hasta que se vincule la cuenta.
    if (form.cuentaDinero.cuentaContableId) {
      const { data: cuentaContable } = await supabase
        .from("cuentas_contables").select("codigo").eq("id", form.cuentaDinero.cuentaContableId).single();
      if (cuentaContable) {
        await postearAsiento({
          fecha: fechaISO,
          descripcion: `Gasto: ${form.descripcion}`,
          origenModulo: "gastos_operativos",
          origenId: creado.id,
          auth,
          lineas: [
            { cuentaCodigo: cuentaDeCategoria(form.categoria), debe: montoUSD, haber: 0 },
            { cuentaCodigo: cuentaContable.codigo, cuentaDineroId: form.cuentaDinero.id, debe: 0, haber: montoUSD }
          ]
        });
      }
    }
  }

  await registrarAuditoria({
    ...auth, accion: "Registró gasto", modulo: "Finanzas", registroCodigo: form.categoria || "General",
    detalle: `${form.descripcion} · ${moneda === "NIO" ? "C$" : "$"}${monto.toFixed(2)}${form.cuentaDinero?.nombre ? ` · salió ${monedaCuenta === "NIO" ? "C$" : "$"}${montoCuenta.toFixed(2)} de ${form.cuentaDinero.nombre}` : ""}`
  });
};

export const eliminarGasto = async ({ gasto, auth }) => {
  const { error } = await supabase.from("gastos_operativos").delete().eq("id", gasto.id);
  if (error) throw error;

  // Si el gasto estaba vinculado a una cuenta de dinero, se le devuelve
  // el monto (el gasto ya no existe, así que ese dinero "vuelve").
  if (gasto.cuentaDineroId) {
    await ajustarSaldoCuentaDinero(gasto.cuentaDineroId, numero(gasto.montoCuenta || gasto.monto));
  }

  // Reversa el asiento si existía (no falla si nunca se posteó uno,
  // por ejemplo porque la cuenta de dinero no estaba vinculada).
  await reversarAsientosDeOrigen({ origenModulo: "gastos_operativos", origenId: gasto.id, auth });

  await registrarAuditoria({
    ...auth, accion: "Eliminó gasto", modulo: "Finanzas", registroCodigo: gasto.categoria || "Gasto",
    detalle: `${gasto.descripcion} · $${numero(gasto.monto).toFixed(2)}`
  });
};
