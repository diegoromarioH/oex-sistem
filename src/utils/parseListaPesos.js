// src/utils/parseListaPesos.js
//
// Interpreta el texto que se pega de la factura/lista del proveedor
// (ej. "Detalle de paquetes entregados") y saca pares
// {identificador, peso}. Se diseñó tolerante a variaciones de formato
// porque el proveedor puede cambiar — no depende de columnas exactas,
// solo de dos reglas simples por línea:
//
//   - El PRIMER token de la línea es el identificador (ID de almacén o
//     tracking, según lo que use ese proveedor).
//   - El ÚLTIMO token numérico de la línea es el peso en libras.
//   - Todo lo que quede en medio es descripción y se ignora para el
//     match (el proveedor casi nunca describe igual que como está
//     guardado en el sistema).
//
// Se descartan solas las líneas de encabezado ("No. Guía", "Descripción",
// "Peso (lb)"), subtotales ("Subtotal AÉREO", "TOTAL"), y las líneas que
// son solo un rótulo de sección ("AÉREO", "MARÍTIMO") — estas últimas se
// usan para saber el tipo de envío de las líneas que siguen, útil como
// dato de referencia en la vista previa, aunque no es obligatorio para
// el match (el tracking ya tiene su propio tipoEnvio guardado).

const PALABRAS_IGNORAR = /^(no\.?\s*gu[ií]a|descripci[oó]n|peso|detalle de paquetes|subtotal|total)\b/i;

const TIPOS_CONOCIDOS = [
  { patron: /^a[eé]reo/i, tipo: "Aéreo" },
  { patron: /^mar[ií]timo/i, tipo: "Marítimo" }
];

// ¿La línea es puro texto sin ningún dígito? — normalmente un rótulo de
// sección o un encabezado suelto que sobrevivió al copiar/pegar.
const esSoloTexto = (linea) => !/\d/.test(linea);

export const parseListaPesos = (textoCrudo) => {
  const lineas = String(textoCrudo || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\t/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const reconocidas = [];
  const noReconocidas = [];
  let tipoEnvioActual = null;

  for (const linea of lineas) {
    if (PALABRAS_IGNORAR.test(linea)) continue; // encabezado o subtotal/total, se ignora en silencio

    if (esSoloTexto(linea)) {
      const tipo = TIPOS_CONOCIDOS.find((t) => t.patron.test(linea));
      if (tipo) tipoEnvioActual = tipo.tipo; // rótulo de sección reconocido, sigue
      // si no coincide con ningún tipo conocido, se ignora igual (es
      // probablemente un encabezado de columna que no filtramos arriba)
      continue;
    }

    const tokens = linea.split(" ");
    const primero = tokens[0];
    const ultimo = tokens[tokens.length - 1];

    const pesoTexto = ultimo.replace(",", ".");
    const pesoValido = /^\d+(\.\d+)?$/.test(pesoTexto);
    const identificadorValido = /[A-Za-z0-9]{3,}/.test(primero) && /\d/.test(primero);

    if (pesoValido && identificadorValido && primero !== ultimo) {
      reconocidas.push({
        identificador: primero,
        peso: Number(pesoTexto),
        tipoEnvioDetectado: tipoEnvioActual,
        lineaOriginal: linea
      });
    } else {
      noReconocidas.push({ lineaOriginal: linea });
    }
  }

  return { reconocidas, noReconocidas };
};

// Empareja cada línea reconocida con un tracking real del sistema —
// primero por ID de almacén (el caso más común, ver Darío Import), y si
// no, por el código de tracking directo (por si algún proveedor entrega
// el tracking real en vez del ID de almacén).
export const emparejarConTrackings = (reconocidas, trackings) => {
  return reconocidas.map((r) => {
    const idBuscado = r.identificador.toLowerCase();
    const encontrado = trackings.find(
      (t) => (t.almacenId || "").toLowerCase() === idBuscado || (t.tracking || "").toLowerCase() === idBuscado
    );
    return { ...r, tracking: encontrado || null };
  });
};