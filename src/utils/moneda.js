// src/utils/moneda.js
//
// Cada cuenta de dinero tiene su propia moneda (USD o NIO) — este
// helper centraliza el símbolo y el formato para no repetir la lógica
// de "cuál signo según la moneda" en cada pantalla que muestra un saldo.
export const simboloMoneda = (moneda) => (moneda === "NIO" ? "C$" : "$");

export const formatoMoneda = (monto, moneda) => `${simboloMoneda(moneda)}${Number(monto || 0).toFixed(2)}`;