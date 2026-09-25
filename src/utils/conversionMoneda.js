import { numero } from "./numero";

export const redondearDinero = (valor, decimales = 2) => {
  const factor = 10 ** decimales;
  return Math.round((numero(valor) + Number.EPSILON) * factor) / factor;
};

export const convertirMoneda = ({ monto, monedaOrigen = "USD", monedaDestino = "USD", tasaCambio }) => {
  const origen = monedaOrigen === "NIO" ? "NIO" : "USD";
  const destino = monedaDestino === "NIO" ? "NIO" : "USD";
  const valor = numero(monto);
  if (origen === destino) return redondearDinero(valor);
  const tasa = numero(tasaCambio);
  if (tasa <= 0) throw new Error("Configura una tasa de cambio válida para convertir entre USD y NIO.");
  const usd = origen === "NIO" ? valor / tasa : valor;
  return redondearDinero(destino === "NIO" ? usd * tasa : usd);
};

export const montoEnUSD = ({ monto, moneda = "USD", tasaCambio }) =>
  convertirMoneda({ monto, monedaOrigen: moneda, monedaDestino: "USD", tasaCambio });
