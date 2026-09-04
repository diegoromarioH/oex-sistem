// src/pages/paqueteria/EnvioItem.jsx
import { useState } from "react";
import { numero } from "../../utils/numero";
import { actualizarTrackingEnvio, actualizarEstadoEnvio, eliminarEnvio } from "../../services/enviosService";
import { generarDetalleEnvio } from "../../services/pdfService";
import { confirmarAccionCritica } from "../../services/coreService";
import { estadosPorDestino, badgeEstado, esListoParaRetirar } from "../../utils/estadosEnvio";
import Timeline from "../../components/Timeline";
import FormularioSaldarEnvio from "../../components/FormularioSaldarEnvio";
import PipelineProgress from "../../components/PipelineProgress";

export default function EnvioItem({ envio, auditLog, rol, tarifas, empresa, cuentasDinero = [], auth, mostrarToast, cargarDatos, mostrarPipeline = true }) {
  const [expandido, setExpandido] = useState(false);

  const guardarPeso = async (i, campo, valor) => {
    try {
      await actualizarTrackingEnvio({ envio, trackingIndex: i, field: campo, value: valor, tarifas, auth });
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo actualizar el tracking.", "error");
    }
  };

  const cambiarEstado = async (nuevoEstado) => {
    // Los estados tienen un orden jerárquico (Miami → ... → Entregado). Si
    // el nuevo estado queda ANTES del actual en ese orden, es un retroceso —
    // se permite (puede ser una corrección legítima), pero se advierte y
    // pide confirmación para evitar clics accidentales.
    const pipeline = estadosPorDestino(envio.destino);
    const idxActual = pipeline.indexOf(envio.estado);
    const idxNuevo = pipeline.indexOf(nuevoEstado);
    if (idxActual !== -1 && idxNuevo !== -1 && idxNuevo < idxActual) {
      const confirmar = window.confirm(
        `Vas a RETROCEDER el estado de "${envio.estado}" a "${nuevoEstado}".\n\n¿Seguro que quieres hacer esto?`
      );
      if (!confirmar) return;
    }

    try {
      await actualizarEstadoEnvio({
        envio, nuevoEstado, auth,
        prompts: {
          pedirMetodo: () => window.prompt("Método de pago:"),
          pedirReferencia: () => window.prompt("Referencia o comprobante:")
        }
      });
      mostrarToast(`Envío ${envio.numero} → ${nuevoEstado}`);
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo actualizar el estado.", "error");
    }
  };

  const eliminar = async () => {
    if (rol !== "admin") return mostrarToast("Solo un administrador puede eliminar envíos.", "error");
    if (!confirmarAccionCritica(`Vas a eliminar el envío ${envio.numero}.`)) return;
    try {
      await eliminarEnvio({ envio, auth });
      mostrarToast("Envío eliminado.");
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo eliminar.", "error");
    }
  };

  // WhatsApp no permite adjuntar archivos desde un link wa.me (solo texto).
  // Por eso primero descargamos el PDF de detalle (para que lo adjuntes tú
  // manualmente en el chat) y abrimos WhatsApp con un mensaje completo:
  // punto de retiro, dirección (si la configuraste en Configuración) y saldo.
  const avisarListoParaRetirar = () => {
    generarDetalleEnvio(envio, tarifas, empresa);
    const direccion = empresa.direccionesRetiro?.[envio.estado] || "";
    const saldo = numero(envio.saldo);
    const lineas = [
      `¡Buenas noticias, ${envio.cliente} , tu envío ${envio.numero} ya llegó y está listo para que lo retires en ${envio.estado}.`,
      direccion ? `Dirección: ${direccion}` : null,
      saldo > 0 ? `Saldo pendiente: $${saldo.toFixed(2)}` : "Sin saldo pendiente.",
      "Revisa el PDF adjunto con el detalle de tu envío. ¡Por favor, responde este mensaje para coordinar la entrega o el retiro de tu paquete. ! Muchas Gracias."
    ].filter(Boolean).join("\n");
    window.open(`https://wa.me/${(envio.contacto || "").replace(/\D/g, "")}?text=${encodeURIComponent(lineas)}`, "_blank");
    mostrarToast("PDF descargado — adjúntalo manualmente en el chat de WhatsApp que se abrió.");
  };

  return (
    <div className="row-card" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div className="page-title" style={{ margin: 0 }}>
        <div>
          <b>{envio.numero || "Sin cliente"}</b> <span className={`badge ${badgeEstado(envio.estado)}`}>{envio.estado}</span>{" "}
          <span className="badge badge-neutral">{envio.tipoEnvio}</span>
          <p>{envio.cliente || "Sin cliente"} · {envio.clienteCodigo || "Sin registrar"} · {envio.destino}</p>
          <small>{envio.fecha}</small>
        </div>
        <div className="stack-gap-sm text-right">
          <b>${numero(envio.total).toFixed(2)}</b>
          <small>{numero(envio.totalLibras).toFixed(1)} lb</small>
        </div>
      </div>

      {mostrarPipeline && <PipelineProgress estado={envio.estado} destino={envio.destino} />}

      <div className="segment mt-8">
        {envio.estado !== "Entregado" && (
          <select className="input input-sm" value={envio.estado} onChange={(e) => cambiarEstado(e.target.value)}>
            {estadosPorDestino(envio.destino).filter((e) => e !== "Entregado").map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        )}
        <button className="btn" onClick={() => generarDetalleEnvio(envio, tarifas, empresa)}>PDF detalle</button>
        <a className="btn btn-whatsapp" href={`https://wa.me/${(envio.contacto || "").replace(/\D/g, "")}?text=${encodeURIComponent(`Hola ${envio.cliente}, tu envío ${envio.numero} está en estado: ${envio.estado}.`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
        {esListoParaRetirar(envio.estado) && (
          <button className="btn btn-primary" onClick={avisarListoParaRetirar}>📦 Avisar listo para retirar</button>
        )}
        <div style={{ flexBasis: "100%" }}>
          <FormularioSaldarEnvio envio={envio} cuentasDinero={cuentasDinero} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} />
        </div>
        <button className="btn btn-ghost" onClick={() => setExpandido((v) => !v)}>{expandido ? "Ocultar trackings" : `Ver trackings (${envio.trackings.length})`}</button>
        <button className="btn btn-danger" onClick={eliminar}>Eliminar</button>
      </div>

      {expandido && (
        <div className="mini-tracking-list">
          {envio.trackings.map((t, i) => (
            <div className="mini-tracking-row" key={i}>
              <b>{t.codigo || "Sin código"}</b>
              {t.almacenId && <span className="badge badge-info">Almacén: {t.almacenId} (interno)</span>}
              <span className="badge badge-neutral">{t.tipoEnvio || envio.tipoEnvio}</span>
              <input
                className="input input-tiny"
                type="number"
                defaultValue={t.peso}
                placeholder="Peso lb"
                onBlur={(e) => e.target.value !== String(t.peso) && guardarPeso(i, "peso", e.target.value)}
              />
            </div>
          ))}
        </div>
      )}

      <Timeline auditLog={auditLog} modulo="Paquetería" registroCodigo={envio.numero} />
    </div>
  );
}