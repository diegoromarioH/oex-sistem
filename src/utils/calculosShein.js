// src/utils/calculosShein.js
//
// Funciones puras del módulo SHEIN. Antes vivían como funciones locales
// dentro de App.jsx (líneas 675-739 de la versión original) mezcladas con
// el resto de la lógica. Los números de negocio (7% tasa de venta, 60%
// anticipo) ahora son constantes con nombre en vez de literales sueltos.

import { numero } from "./numero";

export const SHEIN_TASA_VENTA = 0.07;
export const SHEIN_ANTICIPO_PORCENTAJE = 0.6;

export const perfilEstandarDestino = (destino) =>
  destino === "Managua" ? "managua_estandar" : "ometepe_estandar";

export const tarifaDesdePerfil = (tarifas, perfil, tipoEnvio, personalizada = "") => {
  if (perfil === "personalizada") return numero(personalizada);
  const t = tarifas[perfil];
  if (!t) return 0;
  return tipoEnvio === "Aéreo" ? numero(t.aereo) : numero(t.maritimo);
};

export const tarifasDestino = (tarifas, destino) =>
  Object.entries(tarifas).filter(([key, t]) => key === "personalizada" || t.destino === destino);

// Cuando el usuario cambia el destino, la tarifa seleccionada debe seguir
// correspondiendo a ese destino.
export const perfilAlCambiarDestino = (nuevoDestino, perfilActual) =>
  perfilActual === "personalizada" ? perfilActual : perfilEstandarDestino(nuevoDestino);

export const costoProductoShein = (p) => numero(p.costo_prenda) * numero(p.unidades || 1);
export const taxProductoShein = (p) => costoProductoShein(p) * SHEIN_TASA_VENTA;

export const pesoProductoShein = (p, modo) => (modo === "con_financiamiento" ? numero(p.peso_libras) : 0);
export const comisionProductoShein = (p, modo) => (modo === "con_financiamiento" ? numero(p.comision) : 0);

export const costoPesoProductoShein = (p, modo, tarifas, tarifaPerfil, tipoEnvio, tarifaPersonalizada) =>
  pesoProductoShein(p, modo) * tarifaDesdePerfil(tarifas, tarifaPerfil, tipoEnvio, tarifaPersonalizada);

// SHEIN siempre suma la tasa de venta al costo del producto.
// En CF (con financiamiento) se suma además el costo de peso: libras × tarifa.
// En SF (sin financiamiento) el peso NO se suma aquí; se cobra cuando el
// paquete esté listo para retirar (se cotiza aparte, en Paquetería).
export const totalProductoShein = (p, ctx) => {
  const { modo, tarifas, tarifaPerfil, tipoEnvio, tarifaPersonalizada } = ctx;
  return (
    costoProductoShein(p) +
    taxProductoShein(p) +
    costoPesoProductoShein(p, modo, tarifas, tarifaPerfil, tipoEnvio, tarifaPersonalizada) +
    comisionProductoShein(p, modo)
  );
};

// ctx = { modo, tarifas, tarifaPerfil, tipoEnvio, tarifaPersonalizada }
export const resumenShein = (productos, ctx) => {
  const { modo, tarifas, tarifaPerfil, tipoEnvio, tarifaPersonalizada } = ctx;
  const productosTotal = productos.reduce((a, p) => a + costoProductoShein(p), 0);
  const tax = productos.reduce((a, p) => a + taxProductoShein(p), 0);
  const peso = productos.reduce((a, p) => a + costoPesoProductoShein(p, modo, tarifas, tarifaPerfil, tipoEnvio, tarifaPersonalizada), 0);
  const comisiones = productos.reduce((a, p) => a + comisionProductoShein(p, modo), 0);
  const total = productos.reduce((a, p) => a + totalProductoShein(p, ctx), 0);
  const anticipo = modo === "con_financiamiento" ? total * SHEIN_ANTICIPO_PORCENTAJE : total;
  const saldo = Math.max(total - anticipo, 0);
  return { productos: productosTotal, tax, peso, comisiones, total, anticipo, saldo };
};

export const notaShein = ({ modo, tipoDocumento }) => {
  const baseCotizacion = "Cotización válida por 24 horas. Pasada la vigencia de la cotización, el precio, disponibilidad y fecha aproximada de entrega pueden variar.";
  if (modo === "sin_financiamiento") {
    const nota = "Modalidad SF: el costo del envío por peso se calcula y cobra cuando el paquete esté listo para retirar.";
    return tipoDocumento === "cotizacion" ? `${baseCotizacion} ${nota}` : nota;
  }
  const notaFinanciamiento = `Modalidad CF: para confirmar el pedido se requiere el ${SHEIN_ANTICIPO_PORCENTAJE * 100}% de depósito de su compra.`;
  return tipoDocumento === "cotizacion" ? `${baseCotizacion} ${notaFinanciamiento}` : notaFinanciamiento;
};

export const productoVacio = () => ({
  descripcion: "", sku: "", talla: "", unidades: "1", costo_prenda: "", peso_libras: "", comision: ""
});
