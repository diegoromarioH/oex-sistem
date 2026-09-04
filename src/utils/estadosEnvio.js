// src/utils/estadosEnvio.js
//
// Pipeline real de OEX, con dos rutas segun destino (tabla que compartiste):
//
//   MANAGUA: Miami -> Transito NI -> Nicaragua -> Bodega OEX -> Transito Managua
//            -> Punto UNI -> Jardines de Veracruz -> Entregado
//
//   OMETEPE: Miami -> Transito NI -> Nicaragua -> Bodega OEX -> Transito Ometepe
//            -> Ometepe -> Entregado
//
// Los primeros 4 pasos son comunes a ambos destinos (todo entra por Managua
// antes de dividirse). "Punto UNI", "Jardines de Veracruz" y "Ometepe" son
// los puntos de retiro final: cuando el envio llega a cualquiera de esos
// 3 estados, ya esta listo para que el cliente lo recoja.

const PIPELINE_COMUN = ["Miami", "Tránsito NI", "Nicaragua", "Bodega OEX"];

export const PIPELINE_MANAGUA = [...PIPELINE_COMUN, "Tránsito Managua", "Punto UNI", "Jardines de Veracruz", "Entregado"];
export const PIPELINE_OMETEPE = [...PIPELINE_COMUN, "Tránsito Ometepe", "Ometepe", "Entregado"];

export const estadosPorDestino = (destino) => (destino === "Managua" ? PIPELINE_MANAGUA : PIPELINE_OMETEPE);

// Un tracking está "pendiente de confirmar" cuando su estado no es parte
// del pipeline real (ej. llegó de la landing pública con "Prealertado" u
// otro valor que no es Miami/Tránsito/etc.) — necesita el botón de
// "Confirmar recibido" antes de poder tratarse como cualquier otro
// tracking. Misma regla que ya usa Prealertas.jsx, ahora reutilizable.
export const esPendienteDeConfirmar = (tracking) => !estadosPorDestino(tracking.destino).includes(tracking.estado);

// Unicos estados donde el envio ya se puede retirar en un punto fisico -
// se usan para habilitar el aviso de WhatsApp "Listo para retirar".
export const ESTADOS_LISTO_PARA_RETIRAR = ["Punto UNI", "Jardines de Veracruz", "Ometepe"];

export const esListoParaRetirar = (estado) => ESTADOS_LISTO_PARA_RETIRAR.includes(estado);

// Punto donde Darío Import Logistic (proveedor de flete/aduana) tiene el
// paquete disponible para que OEX pague y retire — acá nace la factura
// real del proveedor. Es UN solo estado (no una lista) porque aplica igual
// a Managua/Ometepe y marítimo/aéreo: "Aduana" y "Sucursal" ya se combinan
// en el estado "Nicaragua", y justo el siguiente paso ("Bodega OEX") es
// cuando Darío Import Logistic lo marca como disponible para retiro.
export const ESTADO_LISTO_RETIRO_PROVEEDOR = "Bodega OEX";
export const esListoParaRetiroProveedor = (estado) => estado === ESTADO_LISTO_RETIRO_PROVEEDOR;

// A dónde avanza un tracking una vez que OEX ya pagó y retiró de Darío —
// depende del destino porque de ahí en adelante los pipelines se separan.
export const siguienteEstadoTrasRetiroProveedor = (destino) =>
  destino === "Managua" ? "Tránsito Managua" : "Tránsito Ometepe";

// Clasificación de 3 categorías para el panel de seguimiento del Dashboard.
export const CATEGORIA_TRANSITO = "transito";
export const CATEGORIA_POR_RETIRAR = "retirar";
export const CATEGORIA_ENTREGADO = "entregado";

export const categoriaEnvio = (estado) => {
  if (estado === "Entregado") return CATEGORIA_ENTREGADO;
  if (esListoParaRetirar(estado)) return CATEGORIA_POR_RETIRAR;
  return CATEGORIA_TRANSITO;
};

const BADGE_POR_ESTADO = {
  "Miami": "badge-neutral",
  "Tránsito NI": "badge-warning",
  "Nicaragua": "badge-info",
  "Bodega OEX": "badge-warning",
  "Tránsito Managua": "badge-warning",
  "Tránsito Ometepe": "badge-warning",
  "Punto UNI": "badge-info",
  "Jardines de Veracruz": "badge-info",
  "Ometepe": "badge-info",
  "Entregado": "badge-success"
};

export const badgeEstado = (estado) => BADGE_POR_ESTADO[estado] || "badge-neutral";

// Se mantienen exportados por compatibilidad con importaciones existentes;
// usar estadosPorDestino(destino) para obtener la lista correcta.
export const ESTADOS_ENVIO = PIPELINE_OMETEPE;
export const BADGE_ESTADO_ENVIO = BADGE_POR_ESTADO;