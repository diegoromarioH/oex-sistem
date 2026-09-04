// src/utils/fechas.js
// Cálculo de fechas hábiles en Nicaragua (feriados fijos) y textos de entrega.

const FERIADOS_FIJOS = ["01-01", "05-01", "07-19", "09-14", "09-15", "12-08", "12-25"];

export const esDiaHabilNicaragua = (fecha) => {
  const dia = fecha.getDay();
  const mmdd = `${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
  return dia !== 0 && dia !== 6 && !FERIADOS_FIJOS.includes(mmdd);
};

export const sumarDiasHabiles = (fechaInicial, dias) => {
  const fecha = new Date(fechaInicial);
  let agregados = 0;
  while (agregados < dias) {
    fecha.setDate(fecha.getDate() + 1);
    if (esDiaHabilNicaragua(fecha)) agregados += 1;
  }
  return fecha;
};

export const fechaLlegadaAproximada = (tipoEnvio) => {
  const dias = tipoEnvio === "Aéreo" ? 5 : 22;
  return sumarDiasHabiles(new Date(), dias).toLocaleDateString("es-NI", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
};

export const rangoEntregaTexto = (tipoEnvio) =>
  tipoEnvio === "Aéreo" ? "2 a 5 días hábiles" : "17 a 22 días hábiles";

export const enRango = (fechaISO, inicio, fin) => {
  if (!fechaISO) return false;
  const f = new Date(fechaISO);
  const desde = inicio ? new Date(`${inicio}T00:00:00`) : new Date("2000-01-01T00:00:00");
  const hasta = fin ? new Date(`${fin}T23:59:59`) : new Date("2999-12-31T23:59:59");
  return f >= desde && f <= hasta;
};
