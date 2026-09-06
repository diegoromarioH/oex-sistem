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
    window.open(`https://wa.me/${(envio.contacto || "").replace(/\D/g, "")}?text=${encodeURIComponent(lineas)}`, "_blank");
    mostrarToast("PDF descargado — adjúntalo manualmente en el chat de WhatsApp que se abrió.");
  };

  const pipeline = estadosPorDestino(envio.destino);
  const idxBodega = pipeline.indexOf("Bodega OEX");
  const idxActual = pipeline.indexOf(envio.estado);
  const estadosRecibo = (idxActual >= idxBodega ? pipeline.slice(Math.max(idxBodega, 0)) : pipeline).filter((e) => e !== "Entregado");

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
            {estadosRecibo.map((e) => <option key={e} value={e}>{e}</option>)}
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
            </div>
          ))}
        </div>
      )}

      <Timeline auditLog={auditLog} modulo="Paquetería" registroCodigo={envio.numero} />
    </div>
  );
}
