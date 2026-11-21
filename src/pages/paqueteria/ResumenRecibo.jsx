import { ReceiptText } from "lucide-react";
import { numero } from "../../utils/numero";
import { badgeEstado, esListoParaRetirar } from "../../utils/estadosEnvio";
import "../../styles/Recibos.css";

export default function ResumenRecibo({ envio, paquetes = envio.trackings?.length ?? 0 }) {
  const saldo = numero(envio.saldo);
  const pendiente = saldo > 0.005;
  const estado = esListoParaRetirar(envio.estado) ? `Listo para retirar · ${envio.estado}` : envio.estado;
  return (
    <div className="recibo-resumen">
      <div className="recibo-identidad">
        <span className="recibo-icono"><ReceiptText size={19} aria-hidden="true" /></span>
        <div>
          <span className="recibo-codigo">{envio.numero || "Recibo"}{envio.clienteCodigo && ` · ${envio.clienteCodigo}`}</span>
          <h4>{envio.cliente || "Sin cliente"}</h4>
          <p>{[envio.destino, `${paquetes} ${paquetes === 1 ? "paquete" : "paquetes"}`, `${numero(envio.totalLibras).toFixed(1)} lb`, envio.tipoEnvio].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <div className="recibo-estados">
        <span className={`badge ${badgeEstado(envio.estado)}`}>{estado}</span>
        {!pendiente && <span className="badge badge-success">Sin saldo</span>}
        {envio.fecha && <small>{envio.fecha}</small>}
      </div>
      <div className="recibo-importe">
        <small>{pendiente ? "Saldo pendiente" : "Total del recibo"}</small>
        <strong>${(pendiente ? saldo : numero(envio.total)).toFixed(2)}</strong>
        {pendiente && <small>Total ${numero(envio.total).toFixed(2)}</small>}
      </div>
    </div>
  );
}
