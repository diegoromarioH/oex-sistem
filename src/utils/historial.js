// src/utils/historial.js
//
// Arma el "seguimiento" de un pedido/envío a partir del audit_log que ya se
// registra en cada cambio de estado. No requiere tocar el esquema de la base
// de datos: audit_log ya guarda { registro_codigo, accion, detalle, fecha }
// cada vez que se llama a registrarAuditoria(...).

// auditLog: array normalizado (normalizarAudit), ya cargado en el estado de App.
// registroCodigo: envio.numero o pedido.numero
// modulo: "Paquetería" | "SHEIN"
export const historialRegistro = (auditLog, { modulo, registroCodigo }) => {
  if (!registroCodigo) return [];
  return auditLog
    .filter((a) => a.modulo === modulo && a.registro === registroCodigo)
    .slice() // no mutar el array original
    .sort((a, b) => new Date(a.fechaISO) - new Date(b.fechaISO)); // orden cronológico ascendente
};

// Versión resumida para mostrar como línea de tiempo simple:
// [{ fecha, titulo, detalle }]
export const lineaDeTiempo = (auditLog, { modulo, registroCodigo }) =>
  historialRegistro(auditLog, { modulo, registroCodigo }).map((a) => ({
    fecha: a.fecha,
    titulo: a.accion,
    detalle: a.detalle,
    usuario: a.usuario
  }));
