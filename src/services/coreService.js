// src/services/coreService.js
// Funciones compartidas por todos los módulos: auditoría, generación de
// códigos OEX, y la carga general de las tablas.

import { supabase } from "../supabase";
import * as XLSX from "xlsx";
import {
  normalizarPedido, normalizarEnvio, normalizarPrealerta,
  normalizarGasto, normalizarIngreso, normalizarCliente, normalizarAudit,
  normalizarProveedor, normalizarFacturaProveedor, normalizarPagoProveedor
} from "../utils/clientes";

export const firmarPayload = ({ session, usuarioActual }) => ({
  created_by: session?.user?.id || null,
  created_by_name: usuarioActual?.nombre || usuarioActual?.email || session?.user?.email || "Usuario",
  updated_by: session?.user?.id || null,
  updated_by_name: usuarioActual?.nombre || usuarioActual?.email || session?.user?.email || "Usuario"
});

export const registrarAuditoria = async ({ session, usuarioActual, accion, modulo, registroCodigo = "", detalle = "", registroId = null }) => {
  try {
    await supabase.from("audit_log").insert([{
      user_id: session?.user?.id || null,
      user_name: usuarioActual?.nombre || usuarioActual?.email || session?.user?.email || "Usuario",
      accion,
      modulo,
      registro_id: registroId,
      registro_codigo: registroCodigo,
      detalle,
      created_at: new Date().toISOString()
    }]);
  } catch (error) {
    console.log("Audit log error", error);
  }
};

export const generarCodigoOEX = async (tipo = "P") => {
  const tipoLimpio = String(tipo || "P").toUpperCase().slice(0, 1);
  try {
    const { data, error } = await supabase.rpc("generar_codigo_oex", { p_tipo: tipoLimpio });
    if (!error && data) return data;
    console.log("No se pudo generar código por RPC:", error);
  } catch (error) {
    console.log("RPC generar_codigo_oex no disponible:", error);
  }
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const anio = String(ahora.getFullYear()).slice(-2);
  const fallback = String(Date.now()).slice(-4);
  return `OEX${tipoLimpio}${mes}${anio}${fallback}`;
};

// Saca iniciales de un nombre completo: primera letra del nombre + primera
// letra del apellido (última palabra). Si es una sola palabra, repite esa
// inicial. Si no hay nombre, usa "XX" en vez de fallar.
const inicialesCliente = (nombreCompleto = "") => {
  const partes = String(nombreCompleto).trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "XX";
  const inicial1 = partes[0][0];
  const inicial2 = partes.length > 1 ? partes[partes.length - 1][0] : partes[0][0];
  return (inicial1 + inicial2).toUpperCase();
};

export const generarCodigoCliente = async (nombre) => {
  const iniciales = inicialesCliente(nombre);
  try {
    const { data, error } = await supabase.rpc("generar_codigo_cliente_oex", { p_iniciales: iniciales });
    if (!error && data) return data;
    console.log("No se pudo generar código de cliente por RPC:", error);
  } catch (error) {
    console.log("RPC cliente no disponible", error);
  }
  // Fallback local si el RPC falla: mismas iniciales, consecutivo
  // aproximado con los últimos 4 dígitos del timestamp (no garantiza
  // secuencia perfecta, pero mantiene el formato visual).
  return `${iniciales}${String(Date.now()).slice(-4)}`;
};

// Numeración de recibo: R00001, R00002... — secuencial simple, sin fecha
// embebida, independiente de generarCodigoOEX (que sigue usando SHEIN).
export const generarCodigoRecibo = async () => {
  try {
    const { data, error } = await supabase.rpc("generar_codigo_recibo_oex");
    if (!error && data) return data;
    console.log("No se pudo generar código de recibo por RPC:", error);
  } catch (error) {
    console.log("RPC recibo no disponible", error);
  }
  return `R${String(Date.now()).slice(-5)}`;
};

// ===== Normalizadores de las tablas de Finanzas (Fase 1-4) =====
// Se definen acá mismo, separados de utils/clientes.js, porque son
// tablas nuevas propias de la parte contable — no hacía falta mezclarlas
// con los normalizadores de Paquetería/Clientes que ya vivían ahí.
const normalizarCuentaDinero = (row) => ({
  id: row.id,
  nombre: row.nombre,
  tipo: row.tipo,
  moneda: row.moneda || "USD",
  numeroCuenta: row.numero_cuenta || "",
  saldoInicial: row.saldo_inicial,
  saldoActual: row.saldo_actual,
  cuentaContableId: row.cuenta_contable_id,
  activa: row.activa,
  createdAt: row.created_at,
  createdByName: row.created_by_name
});

const normalizarCuentaContable = (row) => ({
  id: row.id,
  codigo: row.codigo,
  nombre: row.nombre,
  tipo: row.tipo,
  cuentaPadreId: row.cuenta_padre_id,
  naturaleza: row.naturaleza,
  activa: row.activa,
  createdAt: row.created_at
});

const normalizarFilaBalanceApertura = (row) => ({
  id: row.id,
  cuentaContableId: row.cuenta_contable_id,
  monto: row.monto,
  createdAt: row.created_at
});

export const cargarDatos = async () => {
  const [
    pedidosRes, enviosRes, prealertasRes, gastosRes, ingresosRes, clientesRes, auditRes,
    proveedoresRes, facturasProveedorRes, pagosProveedorRes,
    cuentasDineroRes, cuentasContablesRes, balanceAperturaRes, configuracionContableRes
  ] = await Promise.all([
    supabase.from("pedidos").select("*").order("fecha", { ascending: false }),
    supabase.from("envios").select("*").order("fecha", { ascending: false }),
    supabase.from("tracking_registros").select("*").order("fecha", { ascending: false }),
    supabase.from("gastos_operativos").select("*").order("fecha_iso", { ascending: false }),
    supabase.from("ingresos_operativos").select("*").order("fecha_iso", { ascending: false }),
    supabase.from("clientes").select("*").order("created_at", { ascending: false }),
    supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(300),
    supabase.from("proveedores").select("*").order("nombre", { ascending: true }),
    supabase.from("facturas_proveedor").select("*").order("fecha", { ascending: false }),
    supabase.from("pagos_proveedor").select("*").order("fecha", { ascending: false }),
    supabase.from("cuentas_dinero").select("*").order("nombre", { ascending: true }),
    supabase.from("cuentas_contables").select("*").order("codigo", { ascending: true }),
    supabase.from("balance_apertura").select("*"),
    supabase.from("configuracion_contable").select("*").eq("id", 1).maybeSingle()
  ]);

  if (pedidosRes.error) console.log("Error pedidos", pedidosRes.error);
  if (enviosRes.error) console.log("Error envíos", enviosRes.error);
  if (prealertasRes.error) console.log("Error prealertas", prealertasRes.error);
  if (gastosRes.error) console.log("Error gastos", gastosRes.error);
  if (ingresosRes.error) console.log("Error ingresos", ingresosRes.error);
  if (clientesRes.error) console.log("Error clientes", clientesRes.error);
  if (auditRes.error) console.log("Error audit log", auditRes.error);
  if (proveedoresRes.error) console.log("Error proveedores", proveedoresRes.error);
  if (facturasProveedorRes.error) console.log("Error facturas de proveedor", facturasProveedorRes.error);
  if (pagosProveedorRes.error) console.log("Error pagos a proveedor", pagosProveedorRes.error);
  if (cuentasDineroRes.error) console.log("Error cuentas de dinero", cuentasDineroRes.error);
  if (cuentasContablesRes.error) console.log("Error cuentas contables", cuentasContablesRes.error);
  if (balanceAperturaRes.error) console.log("Error balance de apertura", balanceAperturaRes.error);
  if (configuracionContableRes.error) console.log("Error configuración contable", configuracionContableRes.error);

  return {
    pedidos: (pedidosRes.data || []).map(normalizarPedido),
    envios: (enviosRes.data || []).map(normalizarEnvio),
    prealertas: (prealertasRes.data || []).map(normalizarPrealerta),
    gastos: (gastosRes.data || []).map(normalizarGasto),
    ingresos: (ingresosRes.data || []).map(normalizarIngreso),
    clientes: (clientesRes.data || []).map(normalizarCliente),
    auditLog: (auditRes.data || []).map(normalizarAudit),
    proveedores: (proveedoresRes.data || []).map(normalizarProveedor),
    facturasProveedor: (facturasProveedorRes.data || []).map(normalizarFacturaProveedor),
    pagosProveedor: (pagosProveedorRes.data || []).map(normalizarPagoProveedor),
    cuentasDinero: (cuentasDineroRes.data || []).map(normalizarCuentaDinero),
    cuentasContables: (cuentasContablesRes.data || []).map(normalizarCuentaContable),
    balanceApertura: (balanceAperturaRes.data || []).map(normalizarFilaBalanceApertura),
    fechaApertura: configuracionContableRes.data?.fecha_apertura || null
  };
};

export const confirmarAccionCritica = (mensaje) => {
  const texto = window.prompt(`${mensaje}\n\nEscribe BORRAR para confirmar:`);
  return texto === "BORRAR";
};

// Antes de borrar, descarga un respaldo en Excel de exactamente lo que se
// va a borrar — una hoja por tabla. Si falla la descarga del respaldo, NO
// se procede a borrar (mejor no borrar que borrar sin copia).
export const reiniciarDatosOperativos = async (tipo) => {
  const TABLAS = {
    pedidos: "pedidos",
    envios: "envios",
    prealertas: "tracking_registros",
    gastos: "gastos_operativos"
  };
  const tablasAfectadas = tipo === "todo" ? Object.values(TABLAS) : [TABLAS[tipo]];

  try {
    const libro = XLSX.utils.book_new();
    for (const tabla of tablasAfectadas) {
      const { data, error } = await supabase.from(tabla).select("*");
      if (error) throw error;
      const hoja = XLSX.utils.json_to_sheet(data || []);
      XLSX.utils.book_append_sheet(libro, hoja, tabla.slice(0, 31));
    }
    const fechaArchivo = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(libro, `respaldo-antes-de-borrar-${fechaArchivo}.xlsx`);
  } catch (err) {
    return err;
  }

  const acciones = [];
  if (tipo === "pedidos" || tipo === "todo") acciones.push(supabase.from("pedidos").delete().not("id", "is", null));
  if (tipo === "envios" || tipo === "todo") acciones.push(supabase.from("envios").delete().not("id", "is", null));
  if (tipo === "prealertas" || tipo === "todo") acciones.push(supabase.from("tracking_registros").delete().not("id", "is", null));
  if (tipo === "gastos" || tipo === "todo") acciones.push(supabase.from("gastos_operativos").delete().not("id", "is", null));
  const resultados = await Promise.all(acciones);
  return resultados.find((r) => r.error)?.error || null;
};

// Igual que reiniciarDatosOperativos pero para la parte contable (Fase
// 1-6): gastos, ingresos, proveedores/facturas/pagos, libro diario,
// cortes de caja y balance de apertura. Las CUENTAS en sí (cuentas_dinero,
// cuentas_contables, proveedores) NO se borran — son configuración, no
// datos de prueba — pero el saldo de cada cuenta de dinero se resetea a
// su saldo_inicial, para que quede listo para arrancar de cero.
export const reiniciarDatosFinancieros = async () => {
  const TABLAS = [
    "movimientos_contables", "asientos_contables", "cortes_caja",
    "pagos_proveedor", "facturas_proveedor",
    "gastos_operativos", "ingresos_operativos",
    "balance_apertura"
  ];

  try {
    const libro = XLSX.utils.book_new();
    for (const tabla of TABLAS) {
      const { data, error } = await supabase.from(tabla).select("*");
      if (error) throw error;
      const hoja = XLSX.utils.json_to_sheet(data || []);
      XLSX.utils.book_append_sheet(libro, hoja, tabla.slice(0, 31));
    }
    const fechaArchivo = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(libro, `respaldo-finanzas-antes-de-borrar-${fechaArchivo}.xlsx`);
  } catch (err) {
    return err;
  }

  // Orden importa: primero las líneas de asientos (dependen del asiento),
  // luego los asientos, luego el resto — para no chocar con llaves foráneas.
  const orden = [
    "movimientos_contables", "asientos_contables", "cortes_caja",
    "pagos_proveedor", "facturas_proveedor",
    "gastos_operativos", "ingresos_operativos",
    "balance_apertura"
  ];
  for (const tabla of orden) {
    const { error } = await supabase.from(tabla).delete().not("id", "is", null);
    if (error) return error;
  }

  // Resetea el saldo de cada cuenta de dinero a su saldo inicial (no las
  // borra — son configuración que probablemente quieras conservar).
  const { data: cuentas, error: errorCuentas } = await supabase.from("cuentas_dinero").select("id, saldo_inicial");
  if (errorCuentas) return errorCuentas;
  for (const c of cuentas || []) {
    const { error } = await supabase.from("cuentas_dinero").update({ saldo_actual: c.saldo_inicial }).eq("id", c.id);
    if (error) return error;
  }

  return null;
};