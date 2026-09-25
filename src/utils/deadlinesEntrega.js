export const PROMESAS_DEFAULT = {\n  Managua: { "Aéreo": [5, 7], "Marítimo": [16, 19] },\n  Ometepe: { "Aéreo": [5, 7], "Marítimo": [18, 20] }\n};

const fechaLocal = (valor) => {
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const claveFecha = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

export const promesaPorDestinoTipo = (destino, tipoEnvio, tiemposEntrega = PROMESAS_DEFAULT) =>
  tiemposEntrega?.[destino]?.[tipoEnvio] || PROMESAS_DEFAULT[destino]?.[tipoEnvio] || null;

export const textoPromesa = (destino, tipoEnvio, tiemposEntrega = PROMESAS_DEFAULT) => {
  const p = promesaPorDestinoTipo(destino, tipoEnvio, tiemposEntrega);
  return p ? `${p[0]}–${p[1]} días hábiles desde recepción en Miami` : "";
};

export const esDiaHabilNicaragua = (fecha, feriados = []) => {
  const d = fechaLocal(fecha);
  if (!d) return false;
  const dia = d.getDay();
  if (dia === 0 || dia === 6) return false;
  const set = feriados instanceof Set ? feriados : new Set(feriados.map((f) => typeof f === "string" ? f : f.fecha));
  return !set.has(claveFecha(d));
};

export const sumarDiasHabiles = (fechaInicio, cantidad, feriados = []) => {
  const d = fechaLocal(fechaInicio);
  if (!d) return null;
  let restantes = cantidad;
  while (restantes > 0) {
    d.setDate(d.getDate() + 1);
    if (esDiaHabilNicaragua(d, feriados)) restantes -= 1;
  }
  return d;
};

export const diasHabilesEntre = (desde, hasta, feriados = []) => {
  const a = fechaLocal(desde), b = fechaLocal(hasta);
  if (!a || !b) return null;
  if (a.getTime() === b.getTime()) return 0;
  const signo = a < b ? 1 : -1;
  let actual = new Date(a), total = 0;
  while ((signo > 0 && actual < b) || (signo < 0 && actual > b)) {
    actual.setDate(actual.getDate() + signo);
    if (esDiaHabilNicaragua(actual, feriados)) total += signo;
  }
  return total;
};

const umbralAlertaPorTipo = (tipoEnvio = "") => {
  const tipo = String(tipoEnvio).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return tipo.includes("marit") ? 3 : tipo.includes("aereo") ? 1 : 2;
};

export const calcularDeadlineTracking = (tracking, feriados = [], hoy = new Date(), tiemposEntrega = PROMESAS_DEFAULT) => {
  const promesa = promesaPorDestinoTipo(tracking?.destino, tracking?.tipoEnvio, tiemposEntrega);
  const inicio = fechaLocal(tracking?.fechaMiami);
  if (!promesa || !inicio) return null;
  const fechaMin = sumarDiasHabiles(inicio, promesa[0], feriados);
  const fechaMax = sumarDiasHabiles(inicio, promesa[1], feriados);
  const restantes = diasHabilesEntre(hoy, fechaMax, feriados);
  const umbralAlerta = umbralAlertaPorTipo(tracking?.tipoEnvio);
  let estadoDeadline = "en_tiempo";
  if (restantes < 0) estadoDeadline = "vencido";
  else if (restantes <= umbralAlerta) estadoDeadline = "proximo";
  return { fechaMin, fechaMax, diasMin: promesa[0], diasMax: promesa[1], restantes, umbralAlerta, estadoDeadline };
};

export const formatoFechaEstimada = (deadline) => {
  if (!deadline?.fechaMax) return "";
  return deadline.fechaMax.toLocaleDateString("es-NI", { day: "2-digit", month: "short", year: "numeric" });
};

// Compatibilidad con componentes antiguos: ahora devuelve solo la fecha máxima estimada.
export const formatoRangoDeadline = formatoFechaEstimada;
