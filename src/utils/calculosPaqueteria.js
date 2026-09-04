// src/utils/calculosPaqueteria.js
//
// Funciones puras de Paquetería (registro, trackings y cotización), extraídas
// de App.jsx. No dependen de React ni de Supabase: reciben todo por parámetro
// y devuelven números/objetos. Esto permite probarlas con Vitest sin montar
// la app, y reutilizarlas igual en el formulario de registro, en la edición
// de un envío guardado, y en la cotización.

export const numero = (v) => Number(v || 0);

// Tasa de venta SHEIN, reutilizada también en la cotización de paquetería
// (línea 1075 del App.jsx original usaba el mismo 0.07 sin nombre).
export const TASA_VENTA = 0.07;

// Costo interno por defecto según tipo de envío. Antes vivía hardcodeado
// en dos lugares distintos (useEffect de paqTipoEnvio y convertirPrealertaAEnvio).
export const COSTO_INTERNO_DEFAULT = { "Marítimo": 1.5, "Aéreo": 4.5 };

export const costoInternoDefaultPorTipo = (tipoEnvio) =>
  COSTO_INTERNO_DEFAULT[tipoEnvio] ?? COSTO_INTERNO_DEFAULT["Marítimo"];

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

export const tarifaPorTipoEnvio = (tarifas, envio, tipo) =>
  tarifaDesdePerfil(tarifas, envio.tarifaPerfil || perfilEstandarDestino(envio.destino), tipo, envio.tarifaPersonalizada);

// ===== Costo interno por tracking (arregla el bug de tipos mixtos) =====
//
// Orden de prioridad:
// 1. Si el tracking trae su propio costoInterno guardado, se usa ese.
// 2. Si no, y el envío tiene un costoInternoLibra fijado manualmente (dato
//    histórico de envíos guardados antes de este cambio), se usa ese.
// 3. Si no hay ninguno de los dos, se usa el default según el TIPO REAL
//    de ese tracking (no el tipo global del formulario).
export const costoInternoPorTracking = (envio, tracking) => {
  if (tracking.costoInterno !== undefined && tracking.costoInterno !== "") {
    return numero(tracking.costoInterno);
  }
  if (envio.costoInternoLibra) return numero(envio.costoInternoLibra);
  return costoInternoDefaultPorTipo(tracking.tipoEnvio || envio.tipoEnvio);
};

// Reemplaza a calcularTotalesTrackings (línea 705 del original). Ahora también
// devuelve costoInternoTotal y gananciaReal calculados libra por libra según
// el tipo real de cada tracking, en vez de un solo costo para todo el envío.
export const calcularTotalesTrackings = (tarifas, envio, trackings) => {
  const libras = trackings.reduce((a, t) => a + numero(t.peso), 0);

  const bruto = trackings.reduce(
    (a, t) => a + numero(t.peso) * tarifaPorTipoEnvio(tarifas, envio, t.tipoEnvio || envio.tipoEnvio),
    0
  );
  const total = Math.max(bruto - numero(envio.descuento), 0);

  const costoInternoTotal = trackings.reduce(
    (a, t) => a + numero(t.peso) * costoInternoPorTracking(envio, t),
    0
  );
  const gananciaReal = total - costoInternoTotal - numero(envio.gastosExtras);

  return { libras, total, costoInternoTotal, gananciaReal };
};

// ===== Formulario "Registrar envío" (antes de guardar) =====
// `form` = { trackings, tarifaPerfil, tipoEnvio, tarifaPersonalizada, descuento, gastosExtras }
export const totalLibrasPaq = (trackings) => trackings.reduce((a, t) => a + numero(t.peso), 0);

export const subtotalPaq = (tarifas, form) =>
  form.trackings.reduce(
    (a, t) => a + numero(t.peso) * tarifaDesdePerfil(tarifas, form.tarifaPerfil, t.tipoEnvio || form.tipoEnvio, form.tarifaPersonalizada),
    0
  );

export const totalPaq = (tarifas, form) => Math.max(subtotalPaq(tarifas, form) - numero(form.descuento), 0);

export const costoInternoTotalPaq = (form) =>
  form.trackings.reduce((a, t) => {
    const costo = t.costoInterno !== undefined && t.costoInterno !== ""
      ? numero(t.costoInterno)
      : costoInternoDefaultPorTipo(t.tipoEnvio || form.tipoEnvio);
    return a + numero(t.peso) * costo;
  }, 0);

export const gananciaPaq = (tarifas, form) =>
  totalPaq(tarifas, form) - costoInternoTotalPaq(form) - numero(form.gastosExtras);

// ===== Cotización de paquetería (no genera tracking, solo estima) =====
export const costoItemCotPaq = (item) => numero(item.costo) * numero(item.unidades || 1);
export const taxItemCotPaq = (item) => costoItemCotPaq(item) * TASA_VENTA;
export const totalItemCotPaq = (item) => costoItemCotPaq(item) + taxItemCotPaq(item);
export const librasCotPaq = (items) => items.reduce((a, i) => a + numero(i.peso), 0);
export const totalProductosCotPaq = (items) => items.reduce((a, i) => a + totalItemCotPaq(i), 0);

export const totalEnvioCotPaq = (tarifas, form, items) =>
  librasCotPaq(items) * tarifaDesdePerfil(tarifas, form.tarifaPerfil, form.tipoEnvio, form.tarifaPersonalizada);

export const totalCotPaq = (tarifas, form, items) =>
  totalProductosCotPaq(items) + totalEnvioCotPaq(tarifas, form, items);

// ===== Tipo de envío real del envío (arregla que se guardara "Marítimo" fijo) =====
//
// El formulario de registro no tiene selector de tipo a nivel de envío — solo
// cada tracking tiene el suyo. Antes se guardaba siempre el valor inicial de
// paqTipoEnvio ("Marítimo"), sin importar los tipos reales de los trackings.
// Esta función deriva el tipo del envío A PARTIR de sus trackings:
// - Si todos son del mismo tipo, se usa ese tipo.
// - Si hay mezcla de marítimo y aéreo, se guarda "Mixto".
export const tipoEnvioResumen = (trackings, tipoDefault = "Marítimo") => {
  const tipos = [...new Set(trackings.map((t) => t.tipoEnvio || tipoDefault))];
  if (tipos.length === 0) return tipoDefault;
  if (tipos.length === 1) return tipos[0];
  return "Mixto";
};
