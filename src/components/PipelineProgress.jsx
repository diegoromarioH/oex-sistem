// src/components/PipelineProgress.jsx
import { useEffect, useRef } from "react";
import { Check, Package, Plane, Ship, TowerControl, Truck, Store, CheckCircle2, Warehouse } from "lucide-react";
import { estadosPorDestino } from "../utils/estadosEnvio";
import "./PipelineProgress.css";

const quitarAcentos = (s = "") =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function iconoDePaso(paso, tipoEnvio) {
  const p = quitarAcentos(paso);
  const esAereo = quitarAcentos(tipoEnvio || "").includes("aereo");
  if (p.includes("entregado")) return CheckCircle2;
  if (p === "miami") return Package;
  if (p.includes("nicaragua")) return TowerControl;
  if (p.includes("oex")) return Warehouse;
  if (p.includes("transito ni")) return esAereo ? Plane : Ship;
  if (p.includes("transito managua")) return Truck;
  if (p.includes("transito")) return Ship;
  return Store;
}

const formatoCorto = (fechaISO) => {
  if (!fechaISO) return null;
  return new Date(fechaISO).toLocaleDateString("es-NI", { day: "2-digit", month: "2-digit" });
};

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

  let ultimaFechaConocida = null;
  for (let i = idxActual; i >= 0; i--) {
    const paso = pasos[i];
    if (mapa[paso]) ultimaFechaConocida = mapa[paso];
    else if (ultimaFechaConocida) mapa[paso] = ultimaFechaConocida;
  }

  return mapa;
}

export default function PipelineProgress({ estado, destino, tipoEnvio, auditLog, registroCodigo }) {
  const pasos = estadosPorDestino(destino);
  const idxActual = pasos.indexOf(estado);
  const scrollRef = useRef(null);

  useEffect(() => {
    const contenedor = scrollRef.current;
    if (!contenedor || idxActual < 0) return;

    const actual = contenedor.querySelector(".pipeline-step.actual");
    if (!actual) return;

    const objetivo = actual.offsetLeft - (contenedor.clientWidth - actual.offsetWidth) / 2;
    contenedor.scrollTo({ left: Math.max(0, objetivo), behavior: "smooth" });
  }, [estado, destino, idxActual]);

  if (idxActual === -1) return null;

  const fechasPorPaso = construirFechasPorPaso({ auditLog, registroCodigo, pasos, idxActual });

  return (
    <div
      ref={scrollRef}
      className="pipeline-progress"
      role="list"
      aria-label="Progreso del envío. Desliza horizontalmente para ver todas las etapas."
    >
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
