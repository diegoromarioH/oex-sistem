// src/utils/clientes.js
import { numero } from "./numero";

export const limpiarTelefono = (telefono) => {
  let limpio = String(telefono || "").replace(/\D/g, "");
  if (limpio.length === 8) limpio = `505${limpio}`;
  return limpio;
};

// Código local de RESPALDO, solo para registros huérfanos antiguos que no
// tengan clienteCodigo guardado (cliente_id null). Con resolverCliente()
// (src/services/clientesService.js) ya no deberían crearse más registros así.
export const codigoClienteRespaldo = (nombre = "", contacto = "") => {
  const limpioNombre = String(nombre || "CLIENTE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .toUpperCase();

  const partes = limpioNombre.split(/\s+/).filter(Boolean);
  const iniciales = (partes[0]?.slice(0, 3) || "CLI") + (partes[1]?.slice(0, 2) || "");
  const telefono = limpiarTelefono(contacto);
  const ultimos = telefono ? telefono.slice(-3) : "000";
  return `${iniciales}${ultimos}`;
};

export const buscarClientePorTelefono = (clientes, telefono) => {
  const tel = limpiarTelefono(telefono);
  if (!tel) return null;
  return clientes.find((c) => limpiarTelefono(c.telefono) === tel) || null;
};

// Cuenta en cuántas posiciones difieren dos strings de la MISMA longitud.
// Si las longitudes no coinciden, no se consideran "parecidos" bajo este
// criterio (un dígito de más/menos es otro tipo de error, no lo cubrimos
// aquí para no generar falsos positivos).
const diferenciasPosicionales = (a, b) => {
  if (a.length !== b.length) return null;
  let dif = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      dif++;
      if (dif > 1) return dif; // ya no es "un solo caracter distinto", no hace falta seguir
    }
  }
  return dif;
};

// Detecta clientes cuyo TELÉFONO o CÓDIGO se parecen mucho (un solo
// dígito/caracter distinto) al teléfono/código que se está por vincular.
// Es una alerta para que el operador revise antes de confirmar — un typo
// al escribir el WhatsApp o el código es el caso más común de cliente
// duplicado. No bloquea nada, solo avisa.
export const buscarClientesParecidos = (clientes, { telefono, codigo } = {}) => {
  const telNormalizado = limpiarTelefono(telefono);
  const codigoNormalizado = String(codigo || "").trim().toUpperCase();
  if (!telNormalizado && !codigoNormalizado) return [];

  const resultados = [];

  clientes.forEach((c) => {
    const telCliente = limpiarTelefono(c.telefono);
    const codigoCliente = String(c.codigo || "").toUpperCase();

    if (telNormalizado && telCliente && telNormalizado !== telCliente) {
      if (diferenciasPosicionales(telNormalizado, telCliente) === 1) {
        resultados.push({ ...c, motivoParecido: "telefono" });
        return;
      }
    }

    if (codigoNormalizado && codigoCliente && codigoNormalizado !== codigoCliente) {
      if (diferenciasPosicionales(codigoNormalizado, codigoCliente) === 1) {
        resultados.push({ ...c, motivoParecido: "codigo" });
      }
    }
  });

  return resultados;
};

export const obtenerTrackingsCrudos = (valor) => {
  if (!valor) return [];
  if (Array.isArray(valor)) return valor;
  if (typeof valor === "string") {
    try {
      const parsed = JSON.parse(valor);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

// ===== Normalizadores fila-de-supabase -> objeto de la app =====

export const normalizarCliente = (c) => ({
  id: c.id,
  codigo: c.codigo_cliente || "",
  nombre: c.nombre || "",
  telefono: c.telefono || "",
  correo: c.correo || "",
  direccion: c.direccion || "",
  tipo: c.tipo_cliente || "General",
  tarifaPreferencial: c.tarifa_preferencial || "",
  observaciones: c.observaciones || "",
  createdBy: c.created_by_name || "",
  updatedBy: c.updated_by_name || "",
  createdAt: c.created_at || "",
  fecha: c.created_at ? new Date(c.created_at).toLocaleString("es-NI") : ""
});

export const normalizarAudit = (a) => ({
  id: a.id,
  fechaISO: a.created_at || "",
  fecha: a.created_at ? new Date(a.created_at).toLocaleString("es-NI") : "",
  usuario: a.user_name || "",
  accion: a.accion || "",
  modulo: a.modulo || "",
  registro: a.registro_codigo || "",
  detalle: a.detalle || ""
});

export const normalizarPedido = (p) => ({
  id: p.id,
  numero: p.numero_pedidos || "",
  cliente: p.cliente || "",
  contacto: p.contacto || "",
  estado: p.estado || "Cotización",
  tipoEnvio: p.tipo_envios || "",
  metodoPago: p.metodo_pago || "",
  referencia: p.referencia_pago || "",
  nota: p.nota || "",
  productos: Array.isArray(p.productos) ? p.productos : [],
  total: numero(p.total),
  abono: numero(p.abono),
  saldo: numero(p.saldo),
  clienteId: p.cliente_id || null,
  clienteCodigo: p.cliente_codigo || "",
  clienteTipo: p.cliente_tipo || "",
  creadoPor: p.creado_por || p.created_by_name || "",
  updatedBy: p.updated_by_name || "",
  fechaISO: p.fecha || "",
  fecha: p.fecha ? new Date(p.fecha).toLocaleString("es-NI") : ""
});

export const normalizarEnvio = (e) => ({
  id: e.id,
  numero: e.numero_envios || "",
  cliente: e.cliente || "",
  contacto: e.contacto || "",
  destino: e.lugar || "",
  tipoEnvio: e.tipo_envios || "",
  estado: e.estado || "Miami",
  metodoPago: e.metodo_pago || "",
  referencia: e.referencia_pago || "",
  abono: numero(e.abono),
  saldo: numero(e.saldo),
  tarifa: numero(e.tarifa),
  tarifaPerfil: e.tarifa_perfil || (e.lugar === "Managua" ? "managua_estandar" : "ometepe_estandar"),
  tarifaPersonalizada: numero(e.tarifa_personalizada),
  descuento: numero(e.descuento),
  costoInternoLibra: numero(e.costo_interno_libra),
  gastosExtras: numero(e.gastos_extras),
  notaGastos: e.nota_gastos || "",
  costoInternoTotal: numero(e.costo_interno_total),
  gananciaReal: numero(e.ganancia_real),
  totalLibras: numero(e.total_libras),
  total: numero(e.total),
  trackings: obtenerTrackingsCrudos(e.trackings),
  clienteId: e.cliente_id || null,
  clienteCodigo: e.cliente_codigo || "",
  clienteTipo: e.cliente_tipo || "",
  creadoPor: e.creado_por || e.created_by_name || "",
  updatedBy: e.updated_by_name || "",
  fechaISO: e.fecha || "",
  fecha: e.fecha ? new Date(e.fecha).toLocaleString("es-NI") : ""
});

// El tracking ahora vive ligado siempre a un cliente (cliente_id), no a un
// envío — el envío/recibo se genera después, a partir de los trackings que
// ya estén listos. Se agregan almacenId/peso/costoInterno porque antes solo
// existían dentro de envio.trackings (JSON), y ahora un tracking puede vivir
// suelto (en tracking_registros) antes de convertirse en parte de un recibo.
export const normalizarPrealerta = (t) => ({
  id: t.id,
  clienteId: t.cliente_id || null,
  clienteCodigo: t.cliente_codigo || "",
  clienteTipo: t.cliente_tipo || "",
  cliente: t.cliente || "",
  contacto: t.contacto || "",
  destino: t.destino || "Ometepe",
  tipoEnvio: t.tipo_envio || "Marítimo",
  tracking: t.tracking || t.codigo || "",
  almacenId: t.almacen_id || "",
  peso: numero(t.peso),
  costoInterno: t.costo_interno ?? "",
  nota: t.nota || "",
  estado: t.estado || "Miami",
  fechaISO: t.fecha || "",
  fecha: t.fecha ? new Date(t.fecha).toLocaleString("es-NI") : ""
});

export const normalizarGasto = (g) => ({
  id: g.id,
  fechaISO: g.fecha_iso || "",
  fecha: g.fecha_iso ? new Date(g.fecha_iso).toLocaleString("es-NI") : "",
  categoria: g.categoria || "General",
  descripcion: g.descripcion || "",
  monto: numero(g.monto),
  proveedorId: g.proveedor_id || null,
  proveedorNombre: g.proveedor_nombre || "",
  cuentaDineroId: g.cuenta_dinero_id || null,
  creadoPor: g.creado_por || g.created_by_name || ""
});

// Agregado: faltaba este normalizador — coreService.js lo importa para
// procesar los ingresos (módulo de Finanzas > Ingresos) y sin él Vite
// lanzaba "does not provide an export named 'normalizarIngreso'".
export const normalizarIngreso = (i) => ({
  id: i.id,
  fechaISO: i.fecha_iso || "",
  fecha: i.fecha_iso ? new Date(i.fecha_iso).toLocaleString("es-NI") : "",
  categoria: i.categoria || "General",
  descripcion: i.descripcion || "",
  monto: numero(i.monto),
  clienteId: i.cliente_id || null,
  clienteNombre: i.cliente_nombre || "",
  cuentaDineroId: i.cuenta_dinero_id || null,
  creadoPor: i.created_by_name || ""
});

export const normalizarProveedor = (p) => ({
  id: p.id,
  nombre: p.nombre || "",
  tipo: p.tipo || "Otro",
  contacto: p.contacto || "",
  telefono: p.telefono || "",
  correo: p.correo || "",
  notas: p.notas || "",
  createdAt: p.created_at || ""
});

export const normalizarFacturaProveedor = (f) => ({
  id: f.id,
  proveedorId: f.proveedor_id,
  numeroFactura: f.numero_factura || "",
  fechaISO: f.fecha || "",
  fecha: f.fecha ? new Date(f.fecha).toLocaleString("es-NI") : "",
  trackings: Array.isArray(f.trackings) ? f.trackings : [],
  montoEstimado: numero(f.monto_estimado),
  montoReal: numero(f.monto_real),
  diferencia: numero(f.monto_real) - numero(f.monto_estimado),
  abonado: numero(f.abonado),
  saldo: numero(f.saldo),
  estado: f.estado || "Pendiente",
  nota: f.nota || "",
  // Faltaba mapear este campo (migración 005) — sin esto, factura.link
  // siempre llegaba undefined y el badge "Ver factura ↗" nunca aparecía
  // aunque el link sí estuviera guardado en la base de datos.
  link: f.link || ""
});

export const normalizarPagoProveedor = (p) => ({
  id: p.id,
  facturaId: p.factura_id,
  fechaISO: p.fecha || "",
  fecha: p.fecha ? new Date(p.fecha).toLocaleString("es-NI") : "",
  monto: numero(p.monto),
  metodo: p.metodo || "",
  cuenta: p.cuenta || "",
  cuentaDineroId: p.cuenta_dinero_id || null,
  referencia: p.referencia || "",
  nota: p.nota || "",
  creadoPor: p.created_by_name || ""
});