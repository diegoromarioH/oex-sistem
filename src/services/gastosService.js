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
  return creado;
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


// Solo son elegibles para costeo directo los trackings incluidos en una factura de proveedor completamente pagada.
// Una factura anulada nunca habilita trackings. Se compara por id y también por código para tolerar snapshots históricos.
export const listarTrackingsPagadosProveedor = async () => {
  const { data: facturas, error } = await supabase
    .from("facturas_proveedor")
    .select("id,estado,saldo,trackings")
    .eq("estado", "Pagada")
    .lte("saldo", 0.01);
  if (error) throw error;
  const ids = new Set(), codigos = new Set();
  (facturas || []).forEach((f) => (f.trackings || []).forEach((t) => {
    if (t?.id) ids.add(String(t.id));
    const codigo = String(t?.codigo || t?.tracking || "").trim();
    if (codigo) codigos.add(codigo);
  }));
  const { data: trackings, error: et } = await supabase
    .from("trackings")
    .select("id,codigo,peso,tipo_envio,destino,estado,cliente_id,envio_id");
  if (et) throw et;
  return (trackings || []).filter((t) => ids.has(String(t.id)) || codigos.has(String(t.codigo || "").trim()));
};

// --- Costeo analítico por tracking ---
// Estos vínculos NO crean gastos, NO mueven caja y NO generan asientos.
// Solo distribuyen un gasto ya registrado para medir el costo real por tracking.
export const listarAsignacionesGastosTracking = async () => {
  const { data, error } = await supabase
    .from("gastos_tracking")
    .select("id,gasto_id,tracking_id,monto_asignado_usd,metodo_distribucion,peso_snapshot,tracking_codigo_snapshot,created_at,created_by,created_by_name");
  if (error) throw error;
  return data || [];
};

export const guardarAsignacionesGastoTracking = async ({ gasto, asignaciones = [], metodo = "manual", auth }) => {
  if (!gasto?.id) throw new Error("Gasto inválido.");
  const montoGastoUSD = gasto.moneda === "NIO" && numero(gasto.tasaCambio) > 0
    ? numero(gasto.monto) / numero(gasto.tasaCambio)
    : numero(gasto.monto);
  const limpias = asignaciones
    .map((a) => ({
      tracking_id: a.trackingId || a.tracking_id,
      monto_asignado_usd: numero(a.montoAsignadoUSD ?? a.monto_asignado_usd),
      peso_snapshot: numero(a.peso),
      tracking_codigo_snapshot: String(a.codigo || a.trackingCodigo || "").trim()
    }))
    .filter((a) => a.tracking_id && a.monto_asignado_usd > 0);
  const ids = new Set(limpias.map((a) => String(a.tracking_id)));
  if (ids.size !== limpias.length) throw new Error("Un tracking no puede repetirse dentro del mismo gasto.");
  const total = limpias.reduce((s, a) => s + a.monto_asignado_usd, 0);
  if (total > montoGastoUSD + 0.005) throw new Error("La distribución no puede superar el monto total del gasto.");
  const metodoSeguro = ["manual", "peso", "igual"].includes(metodo) ? metodo : "manual";

  const { error: borrarError } = await supabase.from("gastos_tracking").delete().eq("gasto_id", gasto.id);
  if (borrarError) throw borrarError;
  if (limpias.length) {
    const filas = limpias.map((a) => ({
      gasto_id: gasto.id,
      tracking_id: a.tracking_id,
      monto_asignado_usd: a.monto_asignado_usd,
      metodo_distribucion: metodoSeguro,
      peso_snapshot: a.peso_snapshot,
      tracking_codigo_snapshot: a.tracking_codigo_snapshot,
      created_by: auth?.userId || auth?.id || null,
      created_by_name: auth?.userName || auth?.nombre || auth?.email || null
    }));
    const { error } = await supabase.from("gastos_tracking").insert(filas);
    if (error) throw error;
  }
  await registrarAuditoria({
    ...auth,
    accion: "Distribuyó gasto entre trackings",
    modulo: "Finanzas",
    registroCodigo: gasto.categoria || "Gasto",
    detalle: `${gasto.descripcion || "Gasto"} · $${total.toFixed(2)} asignados a ${limpias.length} tracking(s) · método ${metodoSeguro}`
  });
};

export const costosDirectosPorTracking = (asignaciones = []) => {
  const mapa = new Map();
  asignaciones.forEach((a) => {
    const id = String(a.tracking_id || a.trackingId || "");
    if (!id) return;
    mapa.set(id, (mapa.get(id) || 0) + numero(a.monto_asignado_usd ?? a.montoAsignadoUSD));
  });
  return mapa;
};
