// src/pages/paqueteria/RegistrarTracking.jsx
import { useMemo, useState } from "react";
import { registrarTracking } from "../../services/trackingsService";
import { fechaCalendarioNicaragua } from "../../utils/fechas";
import { textoPromesa } from "../../utils/deadlinesEntrega";
import ClienteSelector from "../../components/ClienteSelector";
import { costoProveedorPorTipo } from "../../utils/calculosPaqueteria";

export default function RegistrarTracking({ configOperativa, clientes, proveedores = [], auth, mostrarToast, cargarDatos }) {
  const [cliente, setCliente] = useState("");
  const [contacto, setContacto] = useState("+505 ");
  const [clienteId, setClienteId] = useState(null);
  const [destino, setDestino] = useState("Ometepe");
  const [tipoEnvio, setTipoEnvio] = useState("Marítimo");
  const [codigo, setCodigo] = useState("");
  const [almacenId, setAlmacenId] = useState("");
  const [fechaRecepcion, setFechaRecepcion] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [estadoInicial, setEstadoInicial] = useState("Prealertado");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  const proveedoresAduana = useMemo(() => proveedores.filter((p) => p.tipo === "Aduana / Flete"), [proveedores]);
  const proveedorSeleccionado = proveedoresAduana.find((p) => String(p.id) === String(proveedorId));
  const costoProveedor = proveedorSeleccionado ? costoProveedorPorTipo(proveedorSeleccionado, tipoEnvio, configOperativa) : "";
  const promesa = textoPromesa(destino, tipoEnvio, configOperativa?.tiemposEntrega);

  const guardar = async () => {
    if (!cliente.trim() || !contacto.trim()) return mostrarToast("Escribe cliente y WhatsApp.", "warning");
    if (!codigo.trim()) return mostrarToast("Escribe el número de tracking.", "warning");
    if (!proveedorSeleccionado) return mostrarToast("Selecciona el proveedor de Aduana / Flete.", "warning");
    if (estadoInicial === "Miami" && !almacenId.trim()) return mostrarToast("Si ya fue recibido en Miami, escribe el ID de almacén.", "warning");
    if (estadoInicial === "Miami" && !fechaRecepcion) return mostrarToast("Selecciona la fecha de recepción en Miami.", "warning");
    setGuardando(true);
    try {
      await registrarTracking({ form: { cliente, contacto, destino, tipoEnvio, codigo, almacenId, nota, estadoInicial, fechaRecepcion }, clientesEnMemoria: clientes, proveedorAduana: proveedorSeleccionado, configOperativa, auth });
      mostrarToast(estadoInicial === "Miami" ? "Tracking registrado como Recibido en Miami." : "Tracking registrado como Prealertado en Envíos activos.");
      setCliente(""); setContacto("+505 "); setClienteId(null); setCodigo(""); setAlmacenId(""); setFechaRecepcion(""); setNota(""); setEstadoInicial("Prealertado");
      await cargarDatos();
    } catch (err) { mostrarToast(err.message || "No se pudo guardar el tracking.", "error"); }
    finally { setGuardando(false); }
  };

  return <div className="card">
    <h3>Registrar tracking</h3>
    <p>Elige el proveedor desde el inicio. Puedes dejarlo como Prealertado o registrarlo directamente como Recibido en Miami.</p>
    <div className="info-box mt-8"><b>Promesa de entrega:</b> {promesa}. El conteo inicia en la fecha de recepción en Miami; solo cuenta lunes a viernes y excluye feriados de Nicaragua.</div>

    <div className="form-grid mt-16">
      <ClienteSelector clientes={clientes} clienteId={clienteId} nombre={cliente} telefono={contacto} onEscribirNombre={setCliente} onEscribirTelefono={setContacto} onSeleccionar={(c) => { setClienteId(c.id); setCliente(c.nombre); setContacto(c.telefono); }} />
      <label><span className="field-label">Destino</span><select className="input" value={destino} onChange={(e) => setDestino(e.target.value)}><option>Ometepe</option><option>Managua</option></select></label>
      <label><span className="field-label">Tipo</span><select className="input" value={tipoEnvio} onChange={(e) => setTipoEnvio(e.target.value)}><option>Marítimo</option><option>Aéreo</option></select></label>
      <label><span className="field-label">Tracking</span><input className="input" value={codigo} onChange={(e) => setCodigo(e.target.value)} /></label>
      <label><span className="field-label">Proveedor Aduana / Flete</span><select className="input" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}><option value="">Selecciona proveedor…</option>{proveedoresAduana.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>{proveedorSeleccionado && <small>Tarifa interna: ${Number(costoProveedor || 0).toFixed(2)}/lb · {tipoEnvio}</small>}</label>
      <label><span className="field-label">Estado inicial</span><select className="input" value={estadoInicial} onChange={(e) => { setEstadoInicial(e.target.value); if (e.target.value !== "Miami") setAlmacenId(""); }}><option value="Prealertado">Prealertado</option><option value="Miami">Recibido en Miami</option></select></label>
      {estadoInicial === "Miami" && (
        <>
          <label><span className="field-label">ID almacén</span><input className="input" value={almacenId} onChange={(e) => setAlmacenId(e.target.value)} placeholder="Obligatorio" /></label>
          <label>
            <span className="field-label">Fecha de recepción en Miami</span>
            <input className="input" type="date" required max={fechaCalendarioNicaragua()}
              value={fechaRecepcion} onChange={(e) => setFechaRecepcion(e.target.value)} />
          </label>
        </>
      )}
    </div>
    <textarea className="input" maxLength={160} placeholder="Nota de este tracking (máximo 160 caracteres)" value={nota} onChange={(e) => setNota(e.target.value)} />
    <button className="btn btn-primary mt-16" disabled={guardando} onClick={guardar}>{guardando ? "Guardando..." : "Registrar tracking"}</button>
  </div>;
}
