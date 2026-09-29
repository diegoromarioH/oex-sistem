import { useEffect, useState } from "react";
import jsPDF from "jspdf";
import { listarCuentasDinero } from "../services/cuentasDineroService";
import { dineroSocio as dinero, fechaSocio as fecha, hoySocio, fechaISOSocio, listarRetirosSocio, gestionarRetiroSocio } from "../services/sociosFinanzasService";

export function descargarReciboSocio(r) {
  const doc = new jsPDF(); let y = 20;
  const escribir = (texto, size = 10) => {
    doc.setFontSize(size);
    for (const linea of doc.splitTextToSize(String(texto), 178)) {
      if (y > 275) { doc.addPage(); y = 20; }
      doc.text(linea, 16, y); y += size === 16 ? 10 : 6;
    }
  };
  escribir("OEX | Recibo de comisión " + r.numero, 16);
  escribir(r.socio_nombre, 12);
  escribir("Estado: " + r.estado + " | Solicitado: " + fecha(r.creado_en));
  escribir("Total: " + dinero(r.monto_usd) + " USD");
  escribir("Cuenta del socio: " + [r.banco, r.moneda_destino, r.numero_cuenta].filter(Boolean).join(" · "));
  escribir("Pagos del 1 al 5 de cada mes. Sin mínimo de retiro.");
  if (r.estado === "pagado") {
    escribir("Pagado: " + fecha(r.fecha_pago) + " | Referencia: " + r.referencia);
    escribir("Salida de cuenta: " + r.moneda_pago + " " + Number(r.monto_cuenta).toFixed(2));
  }
  if (r.estado === "anulado") escribir("Motivo: " + r.motivo_anulacion);
  y += 4;
  (r.socios_retiros_detalle || []).forEach(d => {
    escribir(d.numero_envio + " · " + d.cliente);
    escribir("Corte " + d.periodo + " | Utilidad " + dinero(d.utilidad) + " | " + d.porcentaje + "% | Comisión " + dinero(d.comision));
  });
  doc.save("OEX-" + r.numero + ".pdf");
}

export default function RetirosSocios({ socioId, mostrarToast, alCambiar, revision = 0 }) {
  const [retiros, setRetiros] = useState([]), [cuentas, setCuentas] = useState([]);
  const [error, setError] = useState(""), [cargando, setCargando] = useState(true);
  const [recibo, setRecibo] = useState(null), [guardando, setGuardando] = useState(false);
  const [filtro, setFiltro] = useState(""), [version, setVersion] = useState(0);
  const [form, setForm] = useState({});
  useEffect(() => {
    let activo = true; setCargando(true); setError("");
    Promise.all([listarRetirosSocio(socioId), listarCuentasDinero()]).then(([r, c]) => {
      if (activo) { setRetiros(r); setCuentas(c.filter(cuenta => cuenta.activa)); }
    }).catch(e => { if (activo) setError(e.message); }).finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [socioId, revision, version]);
  const abrir = r => { setRecibo(r); setForm({ accion: "pagar", cuenta: "", fecha: hoySocio(), tasa: "", referencia: "", comprobante: "", motivo: "" }); };
  const guardar = async e => {
    e.preventDefault(); setGuardando(true);
    try {
      await gestionarRetiroSocio(recibo.id, form);
      mostrarToast?.(form.accion === "pagar" ? "Pago del socio registrado." : "Solicitud anulada. Las comisiones vuelven a estar disponibles.");
      setRecibo(null); setVersion(v => v + 1); alCambiar?.();
    } catch (err) { mostrarToast?.(err.message, "error"); }
    finally { setGuardando(false); }
  };
  const campo = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const cuenta = cuentas.find(c => String(c.id) === form.cuenta);
  const salida = recibo ? Number(recibo.monto_usd) * (cuenta?.moneda === "NIO" ? Number(form.tasa || 0) : 1) : 0;
  return <section className="card">
    <div className="page-title"><h3>{socioId ? "Historial de retiros" : "Pagos a socios"}</h3><button className="btn" disabled={cargando} onClick={() => setVersion(v => v + 1)}>Actualizar</button></div>
    <p className="muted">Cada solicitud genera una obligación. El pago cancela esa obligación y registra una sola salida de caja o banco.</p>
    <select className="input" value={filtro} onChange={e => setFiltro(e.target.value)} aria-label="Estado del retiro"><option value="">Todos los estados</option><option value="pendiente">Pendientes de pago</option><option value="pagado">Pagados</option><option value="anulado">Anulados</option></select>
    {cargando ? <p>Cargando retiros…</p> : error ? <p role="alert">{error}</p> : <div className="list mt-16">
      {retiros.filter(r => !filtro || r.estado === filtro).map(r => <div key={r.id} className="row-card" style={{ flexWrap: "wrap", gap: 12 }}>
        <div><b>{r.numero} · {r.socio_nombre}</b><p>{fecha(r.creado_en)} · {r.estado} · {r.socios_retiros_detalle.length} envío(s)</p>
          <small>{[r.banco, r.moneda_destino, r.numero_cuenta].filter(Boolean).join(" · ") || "Cuenta del socio sin definir"}</small>
          {r.estado === "pagado" && <p>Pago {fecha(r.fecha_pago)} · {r.referencia} · {r.moneda_pago} {Number(r.monto_cuenta).toFixed(2)}</p>}
          {r.estado === "anulado" && <p>{r.motivo_anulacion}</p>}
          <details><summary>Ver detalle del corte</summary>{r.socios_retiros_detalle.map(d => <p key={d.id}>{d.numero_envio} · {d.cliente} · {d.periodo} · {dinero(d.comision)}</p>)}</details>
        </div>
        <div className="stack-gap-sm"><b>{dinero(r.monto_usd)}</b><button className="btn" onClick={() => descargarReciboSocio(r)}>Descargar recibo PDF</button>{r.estado === "pendiente" && <button className="btn btn-primary" onClick={() => abrir(r)}>Gestionar recibo</button>}</div>
      </div>)}
      {!retiros.filter(r => !filtro || r.estado === filtro).length && <p>No hay retiros en este estado.</p>}
    </div>}
    {recibo && <div className="modal-overlay"><form className="modal-card" style={{ width: "min(600px, 94vw)", maxHeight: "90vh", overflowY: "auto" }} onSubmit={guardar}>
      <h2>Gestionar {recibo.numero}</h2><p>{recibo.socio_nombre} · {dinero(recibo.monto_usd)}</p>
      <div className="segment"><button type="button" disabled={guardando} className={form.accion === "pagar" ? "btn btn-primary" : "btn"} onClick={() => campo("accion", "pagar")}>Registrar pago</button><button type="button" disabled={guardando} className={form.accion === "anular" ? "btn btn-danger" : "btn"} onClick={() => campo("accion", "anular")}>Anular solicitud</button></div>
      {form.accion === "pagar" ? <div className="form-grid mt-16">
        <label><span className="field-label">Cuenta de origen *</span><select className="input" required value={form.cuenta} onChange={e => campo("cuenta", e.target.value)}><option value="">Selecciona una cuenta</option>{cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre} · {c.moneda} · saldo {Number(c.saldo_actual).toFixed(2)}</option>)}</select></label>
        <label><span className="field-label">Fecha del pago *</span><input className="input" required type="date" min={fechaISOSocio(recibo.creado_en)} max={hoySocio()} value={form.fecha} onChange={e => campo("fecha", e.target.value)} /></label>
        {cuenta?.moneda === "NIO" && <label><span className="field-label">Tipo de cambio (C$ por US$1) *</span><input className="input" required type="number" min="0.01" step="0.0001" value={form.tasa} onChange={e => campo("tasa", e.target.value)} /></label>}
        <label><span className="field-label">Referencia del pago *</span><input className="input" required minLength={3} maxLength={200} value={form.referencia} onChange={e => campo("referencia", e.target.value)} /></label>
        <label><span className="field-label">Enlace al comprobante (opcional)</span><input className="input" type="url" value={form.comprobante} onChange={e => campo("comprobante", e.target.value)} /></label>
        <p>Salida: {cuenta?.moneda || "USD"} {salida.toFixed(2)}. Pagos del 1 al 5, a partir del período del corte.</p>
      </div> : <label className="mt-16"><span className="field-label">Motivo de anulación *</span><textarea className="input" required minLength={3} maxLength={500} value={form.motivo} onChange={e => campo("motivo", e.target.value)} /></label>}
      <div className="modal-actions"><button className="btn" type="button" disabled={guardando} onClick={() => setRecibo(null)}>Cerrar</button><button className="btn btn-primary" disabled={guardando}>{guardando ? "Guardando…" : form.accion === "pagar" ? "Confirmar pago" : "Confirmar anulación"}</button></div>
    </form></div>}
  </section>;
}
