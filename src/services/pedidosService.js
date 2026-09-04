// src/services/pedidosService.js
import { supabase } from "../supabase";
import { resumenShein, taxProductoShein, totalProductoShein, notaShein } from "../utils/calculosShein";
import { resolverCliente } from "./clientesService";
import { generarCodigoOEX, firmarPayload, registrarAuditoria } from "./coreService";
import { numero } from "../utils/numero";

export const guardarPedidoShein = async ({ form, clientesEnMemoria, auth }) => {
  const { cliente, contacto, estado, tipoEnvio, metodoPago, referencia, nota, modo, productos,
    tarifas, tarifaPerfil, tarifaPersonalizada, tipoDocumento, clienteTipoSeleccionado } = form;

  if (!cliente.trim()) throw new Error("Escribe el nombre del cliente.");
  if (!contacto.trim()) throw new Error("Escribe el WhatsApp del cliente.");
  if (estado === "Anticipo recibido" && (!metodoPago || !referencia.trim())) {
    throw new Error("Para pasar a Anticipo recibido debes indicar método de pago y referencia/comprobante.");
  }

  const ctx = { modo, tarifas, tarifaPerfil, tipoEnvio, tarifaPersonalizada };
  const r = resumenShein(productos, ctx);

  const productosGuardados = productos.map((p) => ({
    descripcion: p.descripcion,
    sku: p.sku,
    talla: p.talla,
    unidades: p.unidades,
    costo_prenda: numero(p.costo_prenda),
    tasa_venta: taxProductoShein(p),
    peso_libras: modo === "con_financiamiento" ? numero(p.peso_libras) : 0,
    total_producto: totalProductoShein(p, ctx)
  }));

  const clienteResuelto = await resolverCliente({
    clientesEnMemoria, nombre: cliente, telefono: contacto, tipo: clienteTipoSeleccionado || "General", auth
  });

  const numeroPedido = await generarCodigoOEX("S");
  const abono = estado === "Anticipo recibido" ? r.anticipo : 0;

  const { error } = await supabase.from("pedidos").insert([{
    numero_pedidos: numeroPedido,
    cliente_id: clienteResuelto.id,
    cliente_codigo: clienteResuelto.codigo,
    cliente_tipo: clienteResuelto.tipo,
    cliente,
    contacto,
    estado,
    tipo_envios: tipoEnvio,
    metodo_pago: estado === "Anticipo recibido" ? metodoPago : "",
    referencia_pago: referencia,
    nota: `${nota || ""}\n${notaShein({ modo, tipoDocumento })}\nModalidad: ${modo === "con_financiamiento" ? "Con financiamiento" : "Sin financiamiento"}`.trim(),
    total: r.total,
    abono,
    saldo: Math.max(r.total - abono, 0),
    productos: productosGuardados,
    creado_por: auth.usuarioActual?.nombre || "",
    ...firmarPayload(auth),
    fecha: new Date().toISOString()
  }]);

  if (error) throw error;

  await registrarAuditoria({
    ...auth, accion: "Creó pedido SHEIN", modulo: "SHEIN", registroCodigo: numeroPedido,
    detalle: `${cliente} · ${modo === "con_financiamiento" ? "CF" : "SF"} · $${r.total.toFixed(2)}`
  });

  return { numeroPedido, resumen: r };
};

export const actualizarEstadoPedido = async ({ pedido, nuevoEstado, prompts, auth }) => {
  let metodo = pedido.metodoPago || "";
  let referencia = pedido.referencia || "";
  let abono = numero(pedido.abono);
  const total = numero(pedido.total);

  if (nuevoEstado === "Anticipo recibido") {
    metodo = metodo || prompts.pedirMetodo() || "";
    referencia = referencia || prompts.pedirReferencia() || "";
    if (!metodo.trim() || !referencia.trim()) {
      throw new Error("No se puede pasar a Anticipo recibido sin método y referencia de pago.");
    }
    abono = abono > 0 ? abono : total * 0.6;
  }

  if (nuevoEstado === "Entregado" && total - abono > 0) {
    const refFinal = prompts.pedirReferenciaFinal(total - abono);
    if (!refFinal?.trim()) throw new Error("Referencia requerida para cerrar el pedido.");
    referencia = `${referencia || ""} | Pago final: ${refFinal}`.trim();
    abono = total;
  }

  const { error } = await supabase.from("pedidos").update({
    estado: nuevoEstado,
    metodo_pago: metodo,
    referencia_pago: referencia,
    abono,
    saldo: Math.max(total - abono, 0),
    updated_by: auth.session?.user?.id || null,
    updated_by_name: auth.usuarioActual?.nombre || auth.usuarioActual?.email || auth.session?.user?.email || "Usuario"
  }).eq("id", pedido.id);

  if (error) throw error;

  await registrarAuditoria({
    ...auth, accion: "Cambió estado", modulo: "SHEIN", registroCodigo: pedido.numero,
    detalle: `${pedido.estado} → ${nuevoEstado}`
  });
};

export const eliminarPedido = async ({ pedido, auth }) => {
  const { error } = await supabase.from("pedidos").delete().eq("id", pedido.id);
  if (error) throw error;
  await registrarAuditoria({ ...auth, accion: "Eliminó pedido", modulo: "SHEIN", registroCodigo: pedido.numero || "", detalle: pedido.cliente || "" });
};
