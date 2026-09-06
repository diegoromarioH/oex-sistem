const PROMESAS = {
  Managua: { "Aéreo": [3, 5], "Marítimo": [16, 19] },
  Ometepe: { "Aéreo": [4, 6], "Marítimo": [17, 20] }
};

const fechaLocal = (valor) => {
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const claveFecha = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

export const promesaPorDestinoTipo = (destino, tipoEnvio) =>
  PROMESAS[destino]?.[tipoEnvio] || null;

export const textoPromesa = (destino, tipoEnvio) => {
  const p = promesaPorDestinoTipo(destino, tipoEnvio);
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

export const calcularDeadlineTracking = (tracking, feriados = [], hoy = new Date()) => {
  const promesa = promesaPorDestinoTipo(tracking?.destino, tracking?.tipoEnvio);
  const inicio = fechaLocal(tracking?.fechaMiami);
  if (!promesa || !inicio) return null;
  const fechaMin = sumarDiasHabiles(inicio, promesa[0], feriados);
  const fechaMax = sumarDiasHabiles(inicio, promesa[1], feriados);
  const restantes = diasHabilesEntre(hoy, fechaMax, feriados);
  let estadoDeadline = "en_tiempo";
  if (restantes < 0) estadoDeadline = "vencido";
  else if (restantes <= 2) estadoDeadline = "proximo";
  return { fechaMin, fechaMax, diasMin: promesa[0], diasMax: promesa[1], restantes, estadoDeadline };
};

export const formatoRangoDeadline = (deadline) => {
  if (!deadline?.fechaMin || !deadline?.fechaMax) return "";
  const opts = { day: "2-digit", month: "short" };
  const a = deadline.fechaMin.toLocaleDateString("es-NI", opts);
  const b = deadline.fechaMax.toLocaleDateString("es-NI", opts);
  return `${a} – ${b}`;
};
