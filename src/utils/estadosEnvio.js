// src/utils/estadosEnvio.js
const PIPELINE_COMUN = ["Miami", "Tránsito NI", "Nicaragua", "Bodega OEX"];

export const PIPELINE_MANAGUA = [...PIPELINE_COMUN, "Tránsito Managua", "Punto UNI", "Jardines de Veracruz", "Entregado"];
export const PIPELINE_OMETEPE = [...PIPELINE_COMUN, "Tránsito Ometepe", "Ometepe", "Entregado"];

export const estadosPorDestino = (destino) => (destino === "Managua" ? PIPELINE_MANAGUA : PIPELINE_OMETEPE);

// Las prealertas de la landing siguen requiriendo confirmación antes de entrar
// al pipeline. Un tracking creado manualmente puede nacer como "Prealertado"
// y aun así se considera parte de Envíos activos para que el operador pueda
// completar su ID de almacén cuando el proveedor lo reciba en Miami.
export const esPendienteDeConfirmar = (tracking) => {
  if (tracking?.origenRegistro === "manual" && tracking?.estado === "Prealertado") return false;
  return !estadosPorDestino(tracking.destino).includes(tracking.estado);
};

export const ESTADOS_LISTO_PARA_RETIRAR = ["Punto UNI", "Jardines de Veracruz", "Ometepe"];
export const esListoParaRetirar = (estado) => ESTADOS_LISTO_PARA_RETIRAR.includes(estado);

export const ESTADO_LISTO_RETIRO_PROVEEDOR = "Bodega OEX";
export const esListoParaRetiroProveedor = (estado) => estado === ESTADO_LISTO_RETIRO_PROVEEDOR;

export const siguienteEstadoTrasRetiroProveedor = (destino) => destino === "Managua" ? "Tránsito Managua" : "Tránsito Ometepe";

// Un recibo se genera cuando el paquete ya salió de Bodega OEX hacia su
// destino final. También puede generarse en cualquiera de los estados
// posteriores, conservando el estado operativo real en el recibo.
export const esEstadoDisponibleParaRecibo = (estado, destino) => {
  const pipeline = estadosPorDestino(destino);
  const inicio = pipeline.indexOf(destino === "Managua" ? "Tránsito Managua" : "Tránsito Ometepe");
  const actual = pipeline.indexOf(estado);
  return inicio >= 0 && actual >= inicio;
};

export const CATEGORIA_TRANSITO = "transito";
export const CATEGORIA_POR_RETIRAR = "retirar";
export const CATEGORIA_ENTREGADO = "entregado";

export const categoriaEnvio = (estado) => {
  if (estado === "Entregado") return CATEGORIA_ENTREGADO;
  if (esListoParaRetirar(estado)) return CATEGORIA_POR_RETIRAR;
  return CATEGORIA_TRANSITO;
};

const BADGE_POR_ESTADO = {
  "Prealertado": "badge-neutral",
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
export const ESTADOS_ENVIO = PIPELINE_OMETEPE;
export const BADGE_ESTADO_ENVIO = BADGE_POR_ESTADO;
