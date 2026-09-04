// src/services/clientesService.js
//
// Resuelve un cliente por telefono, garantizando UN SOLO codigo por persona.
// Se usa en guardarPedidoShein / guardarEnvio / guardarCotizacionPaq en vez de
// dejar cliente_id en null cuando el operador escribe el nombre a mano sin
// pasar por el ClienteSelector.

import { supabase } from "../supabase";
import { limpiarTelefono, buscarClientePorTelefono } from "../utils/clientes";
import { generarCodigoCliente, firmarPayload, registrarAuditoria } from "./coreService";

export { buscarClientePorTelefono };

// Busca-o-crea de forma atomica contra Supabase. Requiere idealmente un
// indice/constraint UNIQUE sobre el telefono normalizado en la tabla
// `clientes` (ver nota al final de este archivo).
export const resolverCliente = async ({ clientesEnMemoria, nombre, telefono, tipo = "General", codigo = "", auth }) => {
  // Si ya viene un código de cliente (ej. desde una prealerta de la landing
  // donde el cliente marcó "ya soy cliente" y escribió su código), es la
  // señal MÁS confiable — se busca por código antes que por teléfono, para
  // no crear un cliente duplicado cuando el teléfono vino vacío o distinto
  // al que tenía registrado. Si el código no coincide con nadie (typo, por
  // ejemplo), seguimos al flujo normal en vez de bloquear la operación.
  const codigoLimpio = String(codigo || "").trim().toUpperCase();
  if (codigoLimpio) {
    const enMemoriaPorCodigo = clientesEnMemoria.find((c) => (c.codigo || "").toUpperCase() === codigoLimpio);
    if (enMemoriaPorCodigo) {
      return { id: enMemoriaPorCodigo.id, codigo: enMemoriaPorCodigo.codigo, nombre: enMemoriaPorCodigo.nombre, telefono: enMemoriaPorCodigo.telefono, tipo: enMemoriaPorCodigo.tipo, esNuevo: false };
    }
    const { data: porCodigo } = await supabase.from("clientes").select("*").ilike("codigo_cliente", codigoLimpio).limit(1);
    if (porCodigo && porCodigo.length > 0) {
      const c = porCodigo[0];
      return { id: c.id, codigo: c.codigo_cliente, nombre: c.nombre, telefono: c.telefono, tipo: c.tipo_cliente, esNuevo: false };
    }
  }

  const enMemoria = buscarClientePorTelefono(clientesEnMemoria, telefono);
  if (enMemoria) {
    return { id: enMemoria.id, codigo: enMemoria.codigo, nombre: enMemoria.nombre, telefono: enMemoria.telefono, tipo: enMemoria.tipo, esNuevo: false };
  }

  const telNormalizado = limpiarTelefono(telefono);
  if (telNormalizado) {
    const { data: existentes } = await supabase.from("clientes").select("*").eq("telefono", telNormalizado).limit(1);
    if (existentes && existentes.length > 0) {
      const c = existentes[0];
      return { id: c.id, codigo: c.codigo_cliente, nombre: c.nombre, telefono: c.telefono, tipo: c.tipo_cliente, esNuevo: false };
    }
  }

  const codigoGenerado = await generarCodigoCliente(nombre);
  const { data: creado, error } = await supabase
    .from("clientes")
    .insert([{
      codigo_cliente: codigoGenerado,
      nombre,
      telefono: telNormalizado || telefono,
      correo: "",
      direccion: "",
      tipo_cliente: tipo,
      tarifa_preferencial: "",
      observaciones: "Creado automáticamente al registrar un pedido/envío.",
      created_at: new Date().toISOString(),
      ...firmarPayload(auth)
    }])
    .select()
    .single();

  if (error) {
    if (error.code === "23505" && telNormalizado) {
      const { data: reintento } = await supabase.from("clientes").select("*").eq("telefono", telNormalizado).limit(1);
      if (reintento && reintento.length > 0) {
        const c = reintento[0];
        return { id: c.id, codigo: c.codigo_cliente, nombre: c.nombre, telefono: c.telefono, tipo: c.tipo_cliente, esNuevo: false };
      }
    }
    throw error;
  }

  await registrarAuditoria({ ...auth, accion: "Creó cliente (automático)", modulo: "Clientes", registroCodigo: codigoGenerado, detalle: nombre });
  return { id: creado.id, codigo: creado.codigo_cliente, nombre: creado.nombre, telefono: creado.telefono, tipo: creado.tipo_cliente, esNuevo: true };
};

export const guardarClienteManual = async ({ id, form, clientesEnMemoria, auth }) => {
  if (!id) {
    const existente = buscarClientePorTelefono(clientesEnMemoria, form.telefono);
    if (existente) {
      const err = new Error(`Ya existe un cliente con ese teléfono: ${existente.codigo} · ${existente.nombre}. Edítalo en vez de crear uno nuevo.`);
      err.tipo = "duplicado";
      err.clienteExistente = existente;
      throw err;
    }

    const codigo = await generarCodigoCliente(form.nombre);
    const { error } = await supabase.from("clientes").insert([{
      codigo_cliente: codigo,
      nombre: form.nombre,
      telefono: form.telefono,
      correo: form.correo,
      direccion: form.direccion,
      tipo_cliente: form.tipo,
      tarifa_preferencial: "",
      observaciones: form.observaciones,
      created_at: new Date().toISOString(),
      ...firmarPayload(auth)
    }]);
    if (error) throw error;
    await registrarAuditoria({ ...auth, accion: "Creó cliente", modulo: "Clientes", registroCodigo: codigo, detalle: `${form.nombre} · ${form.tipo}` });
    return codigo;
  }

  const { error } = await supabase.from("clientes").update({
    nombre: form.nombre,
    telefono: form.telefono,
    correo: form.correo,
    direccion: form.direccion,
    tipo_cliente: form.tipo,
    observaciones: form.observaciones,
    updated_by: auth.session?.user?.id || null,
    updated_by_name: auth.usuarioActual?.nombre || auth.usuarioActual?.email || auth.session?.user?.email || "Usuario"
  }).eq("id", id);
  if (error) throw error;
  await registrarAuditoria({ ...auth, accion: "Editó cliente", modulo: "Clientes", registroCodigo: clientesEnMemoria.find((c) => c.id === id)?.codigo || "", detalle: `${form.nombre} · ${form.tipo}` });
  return null;
};

export const eliminarCliente = async ({ cliente, auth }) => {
  const { error } = await supabase.from("clientes").delete().eq("id", cliente.id);
  if (error) throw error;
  await registrarAuditoria({ ...auth, accion: "Eliminó cliente", modulo: "Clientes", registroCodigo: cliente.codigo || "", detalle: cliente.nombre || "" });
};

/*
  NOTA DE BASE DE DATOS (revisar/agregar en supabase/schema.sql):

    ALTER TABLE clientes ADD CONSTRAINT clientes_telefono_unico UNIQUE (telefono);

  Asegura que TODO telefono se guarde ya normalizado (505XXXXXXXX), igual que
  limpiarTelefono() aqui, para que la constraint detecte cuando es la misma
  persona aunque llegue con formato distinto.
*/