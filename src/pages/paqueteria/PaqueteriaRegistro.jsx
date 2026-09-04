// src/pages/paqueteria/PaqueteriaRegistro.jsx
import { useState } from "react";
import { numero } from "../../utils/numero";
import {
  perfilEstandarDestino, totalPaq, costoInternoTotalPaq, gananciaPaq,
  costoInternoDefaultPorTipo, tarifaDesdePerfil, tipoEnvioResumen
} from "../../utils/calculosPaqueteria";
import { guardarEnvio } from "../../services/enviosService";
import { estadosPorDestino } from "../../utils/estadosEnvio";
import TarifaSelect from "../../components/TarifaSelect";
import ClienteSelector from "../../components/ClienteSelector";
import Select from "../../components/Select";

// almacenId: el ID que asigna tu courier (Global Connection) al recibir el
// paquete en Miami, ANTES de que exista número de tracking. Es un dato
// distinto de "codigo" (el tracking real) — se guarda aparte.
const trackingVacio = () => ({ codigo: "", almacenId: "", peso: "", tipoEnvio: "Marítimo", costoInterno: "" });

export default function PaqueteriaRegistro({ tarifas, clientes, auth, mostrarToast, cargarDatos }) {
  const [cliente, setCliente] = useState("");
  const [contacto, setContacto] = useState("");
  const [clienteId, setClienteId] = useState(null);
  const [clienteTipoSeleccionado, setClienteTipoSeleccionado] = useState("General");
  const [destino, setDestino] = useState("Ometepe");
  const [tarifaPerfil, setTarifaPerfil] = useState("ometepe_estandar");
  const [tarifaPersonalizada, setTarifaPersonalizada] = useState("");
  const [estado, setEstado] = useState(estadosPorDestino("Ometepe")[0]);
  const [descuento, setDescuento] = useState("");
  const [gastosExtras, setGastosExtras] = useState("");
  const [nota, setNota] = useState("");
  const [trackings, setTrackings] = useState([trackingVacio()]);
  const [guardando, setGuardando] = useState(false);
  const [mostrarCostoInterno, setMostrarCostoInterno] = useState(false);

  const cambiarDestino = (nuevo) => {
    setDestino(nuevo);
    setTarifaPerfil((actual) => (actual === "personalizada" ? actual : perfilEstandarDestino(nuevo)));
    setEstado((actual) => (estadosPorDestino(nuevo).includes(actual) ? actual : estadosPorDestino(nuevo)[0]));
  };

  const cambiarTracking = (i, campo, valor) => {
    setTrackings((prev) => prev.map((t, idx) => (idx === i ? { ...t, [campo]: valor } : t)));
  };
  const agregarTracking = () => setTrackings((prev) => [...prev, trackingVacio()]);
  const quitarTracking = (i) => setTrackings((prev) => prev.filter((_, idx) => idx !== i));

  const tipoEnvioDerivado = tipoEnvioResumen(trackings);
  const form = { trackings, tarifaPerfil, tipoEnvio: tipoEnvioDerivado, tarifaPersonalizada, descuento, gastosExtras };
  const total = totalPaq(tarifas, form);
  const costoInterno = costoInternoTotalPaq(form);
  const ganancia = gananciaPaq(tarifas, form);

  const limpiar = () => {
    setCliente(""); setContacto(""); setClienteId(null); setClienteTipoSeleccionado("General");
    setEstado(estadosPorDestino(destino)[0]); setDescuento(""); setGastosExtras(""); setNota("");
    setTrackings([trackingVacio()]);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const { numeroEnvio } = await guardarEnvio({
        form: { cliente, contacto, destino, tarifaPerfil, tarifaPersonalizada, estado, trackings, descuento, gastosExtras, nota, tarifas, clienteTipoSeleccionado },
        clientesEnMemoria: clientes,
        auth
      });
      mostrarToast(`Envío ${numeroEnvio} guardado.`);
      limpiar();
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo guardar el envío.", "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="card">
      <h3>Registrar envío</h3>

      <div className="form-grid">
        <ClienteSelector
          clientes={clientes} clienteId={clienteId} nombre={cliente} telefono={contacto}
          onEscribirNombre={setCliente} onEscribirTelefono={setContacto}
          onSeleccionar={(c) => { setClienteId(c.id); setCliente(c.nombre); setContacto(c.telefono); setClienteTipoSeleccionado(c.tipo); }}
        />
        <Select label="Destino" value={destino} onChange={(e) => cambiarDestino(e.target.value)} options={["Ometepe", "Managua"]} />
        <TarifaSelect tarifas={tarifas} destino={destino} value={tarifaPerfil} onChange={setTarifaPerfil} />
        {tarifaPerfil === "personalizada" && (
          <label>
            <span className="field-label">Tarifa personalizada ($/lb)</span>
            <input className="input" type="number" value={tarifaPersonalizada} onChange={(e) => setTarifaPersonalizada(e.target.value)} />
          </label>
        )}
        <Select label="Estado" value={estado} onChange={(e) => setEstado(e.target.value)} options={estadosPorDestino(destino)} />
      </div>

      <div className="info-box">
        Tipo de envío detectado automáticamente según los trackings: <b>{tipoEnvioDerivado}</b>
        {tipoEnvioDerivado === "Mixto" && " — cada tracking se cobra y calcula con la tarifa/costo de su propio tipo."}
      </div>

      <h3 className="mt-16">Trackings</h3>
      <label className="stack-gap-sm mt-8" style={{ display: "flex", alignItems: "center", gap: 8, flexDirection: "row" }}>
        <input type="checkbox" checked={mostrarCostoInterno} onChange={(e) => setMostrarCostoInterno(e.target.checked)} />
        <span>Ajustar costo interno por tracking (opcional — si lo dejas vacío se usa el costo por defecto según el tipo)</span>
      </label>

      {trackings.map((t, i) => (
        <div className="tracking-row" key={i}>
          <input className="input" placeholder="Código de tracking" value={t.codigo} onChange={(e) => cambiarTracking(i, "codigo", e.target.value)} />
          <input className="input" placeholder="ID almacén" value={t.almacenId} onChange={(e) => cambiarTracking(i, "almacenId", e.target.value)} />
          <input className="input" type="number" placeholder="Peso lb" value={t.peso} onChange={(e) => cambiarTracking(i, "peso", e.target.value)} />
          <select className="input" value={t.tipoEnvio} onChange={(e) => cambiarTracking(i, "tipoEnvio", e.target.value)}>
            <option value="Marítimo">Marítimo</option>
            <option value="Aéreo">Aéreo</option>
          </select>
          <span className="badge badge-neutral">${tarifaDesdePerfil(tarifas, tarifaPerfil, t.tipoEnvio, tarifaPersonalizada).toFixed(2)}/lb</span>
          {mostrarCostoInterno ? (
            <input
              className="input input-tiny"
              type="number"
              placeholder={`$${costoInternoDefaultPorTipo(t.tipoEnvio).toFixed(2)}`}
              value={t.costoInterno}
              onChange={(e) => cambiarTracking(i, "costoInterno", e.target.value)}
            />
          ) : (
            <span className="badge badge-neutral">costo int. ${costoInternoDefaultPorTipo(t.tipoEnvio).toFixed(2)}/lb</span>
          )}
          <span className="badge badge-info text-right">${(numero(t.peso) * tarifaDesdePerfil(tarifas, tarifaPerfil, t.tipoEnvio, tarifaPersonalizada)).toFixed(2)}</span>
          <button type="button" className="btn btn-danger" onClick={() => quitarTracking(i)}>Quitar</button>
        </div>
      ))}
      <button type="button" className="btn" onClick={agregarTracking}>+ Agregar tracking</button>

      <div className="form-grid mt-16">
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
        <div className="metric"><b>Total a cobrar</b><span className="metric-value">${total.toFixed(2)}</span></div>
        <div className="metric"><b>Costo interno</b><span className="metric-value">${costoInterno.toFixed(2)}</span></div>
        <div className="metric"><b>Ganancia real</b><span className="metric-value">${ganancia.toFixed(2)}</span></div>
      </div>

      <button className="btn btn-primary mt-16" type="button" disabled={guardando} onClick={guardar}>
        {guardando ? "Guardando..." : "Guardar envío"}
      </button>
    </div>
  );
}
