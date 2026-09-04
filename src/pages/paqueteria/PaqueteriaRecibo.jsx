// src/pages/paqueteria/PaqueteriaRecibo.jsx
//
// Reemplaza al viejo "Registrar envío": ya no se arma un envío desde cero
// con trackings nuevos. Se elige un cliente EXISTENTE (los trackings ya
// están ligados a él desde que se registraron en Prealertas.jsx), se
// muestran solo los que ya están listos para retirar, y se generan como
// recibo (R00001...) — esto reemplaza también a "Factura consolidada".
import { useMemo, useState } from "react";
import { numero } from "../../utils/numero";
import { generarRecibo } from "../../services/trackingsService";
import { generarDetalleEnvio } from "../../services/pdfService";
import { perfilEstandarDestino, tarifaDesdePerfil, costoInternoDefaultPorTipo } from "../../utils/calculosPaqueteria";
import { esListoParaRetirar } from "../../utils/estadosEnvio";
import ClienteSelector from "../../components/ClienteSelector";
import TarifaSelect from "../../components/TarifaSelect";

export default function PaqueteriaRecibo({ prealertas, clientes, tarifas, empresa, auth, mostrarToast, cargarDatos }) {
  const [clienteId, setClienteId] = useState(null);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [generando, setGenerando] = useState(false);

  const clienteSeleccionado = clientes.find((c) => c.id === clienteId) || null;

  const trackingsListos = useMemo(() => {
    if (!clienteSeleccionado) return [];
    return prealertas.filter((t) => t.clienteId === clienteSeleccionado.id && esListoParaRetirar(t.estado));
  }, [prealertas, clienteSeleccionado]);

  // Un cliente podría (raramente) tener trackings listos de Managua Y
  // Ometepe al mismo tiempo — se agrupan por destino porque un recibo solo
  // puede tener un destino (columna `lugar` del envío).
  const gruposPorDestino = useMemo(() => {
    const mapa = {};
    trackingsListos.forEach((t) => {
      if (!mapa[t.destino]) mapa[t.destino] = [];
      mapa[t.destino].push(t);
    });
    return mapa;
  }, [trackingsListos]);

  return (
    <div className="card">
      <h3>Generar recibo</h3>
      <p>Elige un cliente para ver sus trackings que ya están listos para retirar. El recibo se genera solo con esos — el resto sigue su curso normal en Trackings.</p>

      <ClienteSelector
        clientes={clientes} clienteId={clienteId} nombre={clienteNombre} telefono={clienteTelefono}
        onEscribirNombre={setClienteNombre} onEscribirTelefono={setClienteTelefono}
        onSeleccionar={(c) => { setClienteId(c.id); setClienteNombre(c.nombre); setClienteTelefono(c.telefono); }}
      />

      {!clienteSeleccionado && <p className="mt-16">Selecciona un cliente existente de la lista para continuar.</p>}

      {clienteSeleccionado && trackingsListos.length === 0 && (
        <p className="mt-16">{clienteSeleccionado.nombre} no tiene trackings listos para retirar todavía.</p>
      )}

      {clienteSeleccionado && Object.entries(gruposPorDestino).map(([destino, trackings]) => (
        <GrupoRecibo
          key={destino}
          cliente={clienteSeleccionado}
          destino={destino}
          trackings={trackings}
          tarifas={tarifas}
          empresa={empresa}
          auth={auth}
          mostrarToast={mostrarToast}
          cargarDatos={cargarDatos}
          generando={generando}
          setGenerando={setGenerando}
        />
      ))}
    </div>
  );
}

function GrupoRecibo({ cliente, destino, trackings, tarifas, empresa, auth, mostrarToast, cargarDatos, generando, setGenerando }) {
  const [tarifaPerfil, setTarifaPerfil] = useState(perfilEstandarDestino(destino));
  const [tarifaPersonalizada, setTarifaPersonalizada] = useState("");
  const [descuento, setDescuento] = useState("");
  const [gastosExtras, setGastosExtras] = useState("");
  const [nota, setNota] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [seleccionados, setSeleccionados] = useState(() => new Set(trackings.map((t) => t.id)));

  const toggle = (id) => setSeleccionados((prev) => {
    const nuevo = new Set(prev);
    if (nuevo.has(id)) nuevo.delete(id); else nuevo.add(id);
    return nuevo;
  });

  const trackingsIncluidos = trackings.filter((t) => seleccionados.has(t.id));
  const totalLibras = trackingsIncluidos.reduce((a, t) => a + numero(t.peso), 0);
  const bruto = trackingsIncluidos.reduce(
    (a, t) => a + numero(t.peso) * tarifaDesdePerfil(tarifas, tarifaPerfil, t.tipoEnvio, tarifaPersonalizada),
    0
  );
  const total = Math.max(bruto - numero(descuento), 0);

  const generar = async () => {
    if (trackingsIncluidos.length === 0) {
      mostrarToast("Selecciona al menos un tracking.", "warning");
      return;
    }
    setGenerando(true);
    try {
      const { numeroRecibo, envio } = await generarRecibo({
        cliente, trackings: trackingsIncluidos, tarifas, tarifaPerfil, tarifaPersonalizada, descuento, gastosExtras, nota, fecha, auth
      });
      generarDetalleEnvio(envio, tarifas, empresa);
      mostrarToast(`Recibo ${numeroRecibo} generado — PDF descargado.`);
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo generar el recibo.", "error");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="mt-16" style={{ borderTop: "1px solid #D8DADD", paddingTop: 16 }}>
      <h4>{destino} — {trackings.length} tracking(s) listo(s)</h4>
      <div className="mini-tracking-list">
        {trackings.map((t) => (
          <label key={t.id} className="mini-tracking-row" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={seleccionados.has(t.id)} onChange={() => toggle(t.id)} />
            <b>{t.tracking || t.almacenId || "Sin código"}</b>
            <span className="badge badge-neutral">{t.tipoEnvio}</span>
            <span>{numero(t.peso).toFixed(2)} lb</span>
            <span className="badge badge-info">{t.estado}</span>
          </label>
        ))}
      </div>

      <div className="form-grid mt-16">
        <label>
          <span className="field-label">Fecha del recibo</span>
          <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
        </label>
        <TarifaSelect tarifas={tarifas} destino={destino} value={tarifaPerfil} onChange={setTarifaPerfil} />
        {tarifaPerfil === "personalizada" && (
          <label>
            <span className="field-label">Tarifa personalizada ($/lb)</span>
            <input className="input" type="number" value={tarifaPersonalizada} onChange={(e) => setTarifaPersonalizada(e.target.value)} />
          </label>
        )}
        <label>
          <span className="field-label">Descuento ($)</span>
          <input className="input" type="number" value={descuento} onChange={(e) => setDescuento(e.target.value)} />
        </label>
        <label>
          <span className="field-label">Gastos extra ($)</span>
          <input className="input" type="number" value={gastosExtras} onChange={(e) => setGastosExtras(e.target.value)} />
        </label>
      </div>
      <textarea className="input" placeholder="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />

      <div className="grid-4 mt-16">
        <div className="metric"><b>Trackings incluidos</b><span className="metric-value">{trackingsIncluidos.length}</span></div>
        <div className="metric"><b>Peso total</b><span className="metric-value">{totalLibras.toFixed(1)} lb</span></div>
        <div className="metric"><b>Total a cobrar</b><span className="metric-value">${total.toFixed(2)}</span></div>
      </div>

      <button className="btn btn-primary mt-16" disabled={generando} onClick={generar}>
        {generando ? "Generando..." : `Generar recibo (${destino})`}
      </button>
    </div>
  );
}