// src/pages/paqueteria/EnvioItem.jsx
import { useState } from "react";
import { limpiarTelefono } from "../../utils/clientes";
import { numero } from "../../utils/numero";
import { actualizarTrackingEnvio, actualizarEstadoEnvio, eliminarEnvio } from "../../services/enviosService";
import { generarDetalleEnvio } from "../../services/pdfService";
import { confirmarAccionCritica } from "../../services/coreService";
import { estadosPorDestino, badgeEstado, esListoParaRetirar } from "../../utils/estadosEnvio";
import Timeline from "../../components/Timeline";
import FormularioSaldarEnvio from "../../components/FormularioSaldarEnvio";
import ResumenRecibo from "./ResumenRecibo";
import PipelineProgress from "../../components/PipelineProgress";

export default function EnvioItem({ envio, auditLog, rol, tarifas, empresa, cuentasDinero = [], auth, mostrarToast, cargarDatos, mostrarPipeline = true }) {
  const [expandido, setExpandido] = useState(false);
  const tieneSaldo = numero(envio.saldo) > 0;
  const listo = esListoParaRetirar(envio.estado);
  const mostrarCobro = listo || (envio.estado === "Entregado" && tieneSaldo);
  const etiquetaCobro = tieneSaldo ? "Saldar y marcar retirado" : "Marcar retirado";
  const telefono = limpiarTelefono(envio.contacto);
  const whatsappUrl = /^[1-9][0-9]{7,14}$/.test(telefono) ? `https://wa.me/${telefono}` : null;
  const mensajeEstado = `Hola ${envio.cliente}, tu envío ${envio.numero} está en estado: ${envio.estado}.`;

  const guardarPeso = async (i, campo, valor) => {
    try {
      await actualizarTrackingEnvio({ envio, trackingIndex: i, field: campo, value: valor, tarifas, auth });
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo actualizar el tracking.", "error");
    }
  };

  const cambiarEstado = async (nuevoEstado) => {
    const pipeline = estadosPorDestino(envio.destino);
    const idxActual = pipeline.indexOf(envio.estado);
    const idxNuevo = pipeline.indexOf(nuevoEstado);
    const idxBodega = pipeline.indexOf("Bodega OEX");
    const reciboNuevoDesdeBodega = idxActual >= idxBodega;

    if (reciboNuevoDesdeBodega && idxNuevo !== -1 && idxNuevo < idxBodega) {
      mostrarToast("Un recibo que ya está en Bodega OEX no puede retroceder a estados anteriores a Bodega OEX.", "warning");
      return;
    }
    if (idxActual !== -1 && idxNuevo !== -1 && idxNuevo < idxActual) {
      const confirmar = window.confirm(
        `Vas a RETROCEDER el estado de "${envio.estado}" a "${nuevoEstado}".\n\nEste cambio también se aplicará a todos los trackings del recibo. ¿Seguro que quieres hacerlo?`
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
      mostrarToast(`Recibo ${envio.numero} → ${nuevoEstado}. Trackings sincronizados.`);
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo actualizar el estado.", "error");
    }
  };

  const eliminar = async () => {
    if (rol !== "admin") return mostrarToast("Solo un administrador puede eliminar envíos.", "error");
    if (!confirmarAccionCritica(`Vas a eliminar el recibo ${envio.numero}. Los trackings quedarán nuevamente independientes.`)) return;
    try {
      await eliminarEnvio({ envio, auth });
      mostrarToast("Recibo eliminado. Los trackings quedaron desvinculados.");
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo eliminar.", "error");
    }
  };

  const avisarListoParaRetirar = () => {
    generarDetalleEnvio(envio, tarifas, empresa);
    const direccion = empresa.direccionesRetiro?.[envio.estado] || "";
    const saldo = numero(envio.saldo);
    const lineas = [
      `¡Buenas noticias, ${envio.cliente}! Tu envío ${envio.numero} ya llegó y está listo para que lo retires en ${envio.estado}.`,
      direccion ? `Dirección: ${direccion}` : null,
      saldo > 0 ? `Saldo pendiente: $${saldo.toFixed(2)}` : "Sin saldo pendiente.",
      "Revisa el PDF adjunto con el detalle de tu envío. Por favor, responde este mensaje para coordinar la entrega o el retiro. ¡Muchas gracias!"
    ].filter(Boolean).join("\n");
    window.open(`${whatsappUrl}?text=${encodeURIComponent(lineas)}`, "_blank");
    mostrarToast("PDF descargado — adjúntalo manualmente en el chat de WhatsApp que se abrió.");
  };

  const pipeline = estadosPorDestino(envio.destino);
  const idxBodega = pipeline.indexOf("Bodega OEX");
  const idxActual = pipeline.indexOf(envio.estado);
  const estadosRecibo = (idxActual >= idxBodega ? pipeline.slice(Math.max(idxBodega, 0)) : pipeline).filter((e) => e !== "Entregado");

  return (
    <article className="recibo-operativo">
      <ResumenRecibo envio={envio} />
      {mostrarPipeline && <PipelineProgress estado={envio.estado} destino={envio.destino} />}
      {mostrarCobro && <FormularioSaldarEnvio envio={envio} cuentasDinero={cuentasDinero} empresa={empresa} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} etiquetaBoton={etiquetaCobro} />}
      <div className="recibo-acciones">
        {whatsappUrl && <a className="btn btn-whatsapp" href={`${whatsappUrl}?text=${encodeURIComponent(mensajeEstado)}`} target="_blank" rel="noreferrer">WhatsApp</a>}
        <button type="button" className={`btn ${!mostrarCobro && envio.estado !== "Entregado" ? "btn-primary" : "btn-ghost"}`} aria-expanded={expandido} onClick={() => setExpandido((v) => !v)}>
          {expandido ? "Cerrar detalles" : "Más"}
        </button>
      </div>

      {expandido && (
        <div className="recibo-panel">
          <div className="recibo-acciones">
            {envio.estado !== "Entregado" && (
              <select className="input input-sm" aria-label="Estado del envío" value={envio.estado} onChange={(e) => cambiarEstado(e.target.value)}>
                {!estadosRecibo.includes(envio.estado) && <option value={envio.estado}>{envio.estado}</option>}
                {estadosRecibo.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            )}
            <button type="button" className="btn" onClick={() => generarDetalleEnvio(envio, tarifas, empresa)}>Descargar PDF</button>
            {whatsappUrl && listo && <button type="button" className="btn" onClick={avisarListoParaRetirar} title="Descarga el PDF para adjuntarlo en WhatsApp">Avisar retiro y descargar PDF</button>}
            {rol === "admin" && <button type="button" className="btn btn-danger" onClick={eliminar}>Eliminar</button>}
          </div>
          {!mostrarCobro && <FormularioSaldarEnvio envio={envio} cuentasDinero={cuentasDinero} empresa={empresa} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} />}
        </div>
      )}

      {expandido && (
        <div className="mini-tracking-list recibo-panel">
          <h4>Paquetes ({envio.trackings.length})</h4>
          {envio.trackings.map((t, i) => (
            <div className="mini-tracking-row" key={i}>
              <b>{t.tracking || t.codigo || "Sin código"}</b>
              {t.almacenId && <span className="badge badge-info">Almacén: {t.almacenId} (interno)</span>}
              <span className="badge badge-neutral">{t.tipoEnvio || envio.tipoEnvio}</span>
              <span className={`badge ${badgeEstado(t.estado || envio.estado)}`}>{t.estado || envio.estado}</span>
              <input
                className="input input-tiny"
                type="number"
                defaultValue={t.peso}
                placeholder="Peso lb"
                onBlur={(e) => e.target.value !== String(t.peso) && guardarPeso(i, "peso", e.target.value)}
              />
              <input className="input input-sm" maxLength={160} defaultValue={t.nota || ""} placeholder="Nota del tracking" onBlur={(e) => e.target.value !== String(t.nota || "") && guardarPeso(i, "nota", e.target.value.slice(0,160))} />
            </div>
          ))}
        </div>
      )}

      {expandido && <Timeline auditLog={auditLog} modulo="Paquetería" registroCodigo={envio.numero} />}
    </article>
  );
}
