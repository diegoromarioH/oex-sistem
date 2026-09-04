// src/components/PipelineProgress.jsx
// Barra visual de progreso del pipeline de estados (Miami → ... →
// Entregado). Reemplaza/complementa el badge de texto plano con algo que
// se lee de un vistazo, horizontal, con un ícono real por parada:
//   - Miami                    -> caja (📦 salió de bodega)
//   - Tránsito NI               -> avión o barco, según tipoEnvio
//   - Nicaragua                   -> ciudad
//   - Bodega OEX               -> camioncito
//   - Otros tramos "Tránsito X"  -> barco (ej. cruce a Ometepe)
//   - Punto de entrega final     -> tienda (Ometepe, Veracruz, Punto UNI...)
//   - Entregado                  -> check
// Completados quedan en verde (con una insignia de check), el actual
// resaltado y pulsando en el color del módulo, lo que falta en gris.
//
// Uso: <PipelineProgress estado={envio.estado} destino={envio.destino} tipoEnvio={envio.tipoEnvio} />
// No renderiza nada si el estado no es parte del pipeline real (ej. un
// tracking todavía "Prealertado" sin confirmar).
import { Check, Package, Plane, Ship, TowerControl, Truck, Store, CheckCircle2, Warehouse } from "lucide-react";
import { estadosPorDestino } from "../utils/estadosEnvio";
import "./PipelineProgress.css";

const quitarAcentos = (s = "") =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Decide qué ícono real le corresponde a cada parada del pipeline según
// su nombre. Es por palabra clave a propósito: así funciona sin importar
// cuál sea el destino final (Ometepe, Veracruz, Punto UNI, etc.) — si la
// parada no matchea nada conocido, se asume que es un punto de entrega y
// se muestra una tienda.
function iconoDePaso(paso, tipoEnvio) {
  const p = quitarAcentos(paso);
  const esAereo = quitarAcentos(tipoEnvio || "").includes("aereo");

  if (p.includes("entregado")) return CheckCircle2;
  if (p === "miami") return Package;
  if (p.includes("nicaragua")) return TowerControl; // aeropuerto
  if (p.includes("oex")) return Warehouse; // bodega
  if (p.includes("transito ni")) return esAereo ? Plane : Ship;
  if (p.includes("transito managua")) return Truck; // camioncito de reparto local
  if (p.includes("transito")) return Ship; // otros tramos en tránsito (ej. cruce a Ometepe)
  return Store; // punto de entrega final
}

const formatoCorto = (fechaISO) => {
  if (!fechaISO) return null;
  return new Date(fechaISO).toLocaleDateString("es-NI", { day: "2-digit", month: "2-digit" });
};

// Reconstruye en qué fecha el tracking llegó a cada parada, a partir del
// audit_log — mismo dato que ya usa Timeline.jsx, pero acá se busca el
// registro puntual que dejó actualizarTracking() al cambiar el campo
// "estado" (ver trackingsService.js: accion "Actualizó tracking", detalle
// "estado: <paso>"). El primer paso del pipeline (ej. "Miami") no queda
// registrado como CAMBIO de estado porque el tracking nace ahí — para
// ese cae al registro de creación/confirmación en su lugar.
//
// Cuando se SALTA de un paso a otro más adelante (ej. Miami -> Bodega
// OEX directo, sin pasar el estado por Tránsito NI/Nicaragua uno por
// uno), los pasos de en medio nunca tuvieron su propio evento — no hay
// forma de saber la fecha exacta en la que "pasaron" por ahí. En vez de
// dejarlos en blanco, se les asigna la fecha del salto que los superó
// (la del siguiente paso que sí tiene fecha real): sabemos que para esa
// fecha ya habían quedado atrás.
function construirFechasPorPaso({ auditLog, registroCodigo, pasos, idxActual }) {
  if (!auditLog || !registroCodigo) return {};
  const entradas = auditLog.filter((a) => a.modulo === "Trackings" && a.registro === registroCodigo);

  const mapa = {};
  pasos.forEach((paso) => {
    const evento = entradas.find((a) => a.accion === "Actualizó tracking" && a.detalle === `estado: ${paso}`);
    if (evento) mapa[paso] = formatoCorto(evento.fechaISO);
  });

  if (pasos[0] && !mapa[pasos[0]]) {
    const creacion = entradas.find((a) => a.accion === "Registró tracking" || a.accion === "Confirmó tracking recibido");
    if (creacion) mapa[pasos[0]] = formatoCorto(creacion.fechaISO);
  }

  // Relleno hacia atrás: un paso sin fecha propia toma la del siguiente
  // paso (hacia idxActual) que sí la tenga.
  let ultimaFechaConocida = null;
  for (let i = idxActual; i >= 0; i--) {
    const paso = pasos[i];
    if (mapa[paso]) {
      ultimaFechaConocida = mapa[paso];
    } else if (ultimaFechaConocida) {
      mapa[paso] = ultimaFechaConocida;
    }
  }

  return mapa;
}

export default function PipelineProgress({ estado, destino, tipoEnvio, auditLog, registroCodigo }) {
  const pasos = estadosPorDestino(destino);
  const idxActual = pasos.indexOf(estado);

  if (idxActual === -1) return null;

  const fechasPorPaso = construirFechasPorPaso({ auditLog, registroCodigo, pasos, idxActual });

  return (
    <div className="pipeline-progress" role="list" aria-label="Progreso del envío">
      {pasos.map((paso, i) => {
        const completado = i < idxActual;
        const actual = i === idxActual;
        const Icono = iconoDePaso(paso, tipoEnvio);
        const fecha = fechasPorPaso[paso];
        return (
          <div key={paso} role="listitem" className={`pipeline-step ${completado ? "completado" : ""} ${actual ? "actual" : ""}`}>
            <div className="pipeline-dot">
              <Icono size={17} strokeWidth={2.3} />
              {completado && (
                <span className="pipeline-check-badge">
                  <Check size={10} strokeWidth={3.5} />
                </span>
              )}
            </div>
            <span className="pipeline-label">{paso}</span>
            {(completado || actual) && <span className="pipeline-fecha">{fecha || "—"}</span>}
          </div>
        );
      })}
    </div>
  );
}