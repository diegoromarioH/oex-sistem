// src/pages/paqueteria/RegistrarTracking.jsx
import { useMemo, useState } from "react";
import { registrarTracking } from "../../services/trackingsService";
import ClienteSelector from "../../components/ClienteSelector";

export default function RegistrarTracking({ clientes, proveedores = [], auth, mostrarToast, cargarDatos }) {
  const [cliente, setCliente] = useState("");
  const [contacto, setContacto] = useState("");
  const [clienteId, setClienteId] = useState(null);
  const [destino, setDestino] = useState("Ometepe");
  const [tipoEnvio, setTipoEnvio] = useState("Marítimo");
  const [codigo, setCodigo] = useState("");
  const [almacenId, setAlmacenId] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [estadoInicial, setEstadoInicial] = useState("Prealertado");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  const proveedoresAduana = useMemo(() => proveedores.filter((p) => p.tipo === "Aduana / Flete"), [proveedores]);
  const proveedorSeleccionado = proveedoresAduana.find((p) => String(p.id) === String(proveedorId));
  const costoProveedor = proveedorSeleccionado
    ? (tipoEnvio === "Aéreo" ? proveedorSeleccionado.tarifaAereo : proveedorSeleccionado.tarifaMaritimo)
    : "";

  const guardar = async () => {
    if (!cliente.trim() || !contacto.trim()) return mostrarToast("Escribe cliente y WhatsApp.", "warning");
    if (!codigo.trim()) return mostrarToast("Escribe el número de tracking.", "warning");
    if (!proveedorSeleccionado) return mostrarToast("Selecciona el proveedor de Aduana / Flete.", "warning");
    if (estadoInicial === "Miami" && !almacenId.trim()) return mostrarToast("Si ya fue recibido en Miami, escribe el ID de almacén.", "warning");

    setGuardando(true);
    try {
      await registrarTracking({
        form: { cliente, contacto, destino, tipoEnvio, codigo, almacenId, nota, estadoInicial },
        clientesEnMemoria: clientes,
        proveedorAduana: proveedorSeleccionado,
        auth
      });
      mostrarToast(estadoInicial === "Miami" ? "Tracking registrado como Recibido en Miami." : "Tracking registrado como Prealertado en Envíos activos.");
      setCliente(""); setContacto(""); setClienteId(null); setCodigo(""); setAlmacenId(""); setNota(""); setEstadoInicial("Prealertado");
      await cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo guardar el tracking.", "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="card">
      <h3>Registrar tracking</h3>
      <p>Elige el proveedor desde el inicio. Puedes dejarlo como Prealertado o registrarlo directamente como Recibido en Miami.</p>

      <div className="form-grid mt-16">
        <ClienteSelector
          clientes={clientes} clienteId={clienteId} nombre={cliente} telefono={contacto}
          onEscribirNombre={setCliente} onEscribirTelefono={setContacto}
          onSeleccionar={(c) => { setClienteId(c.id); setCliente(c.nombre); setContacto(c.telefono); }}
        />

        <label><span className="field-label">Destino</span><select className="input" value={destino} onChange={(e) => setDestino(e.target.value)}><option>Ometepe</option><option>Managua</option></select></label>
        <label><span className="field-label">Tipo</span><select className="input" value={tipoEnvio} onChange={(e) => setTipoEnvio(e.target.value)}><option>Marítimo</option><option>Aéreo</option></select></label>
        <label><span className="field-label">Tracking</span><input className="input" value={codigo} onChange={(e) => setCodigo(e.target.value)} /></label>

        <label>
          <span className="field-label">Proveedor Aduana / Flete</span>
          <select className="input" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
            <option value="">Selecciona proveedor…</option>
            {proveedoresAduana.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          {proveedorSeleccionado && <small>Tarifa interna: ${Number(costoProveedor || 0).toFixed(2)}/lb · {tipoEnvio}</small>}
        </label>

        <label>
          <span className="field-label">Estado inicial</span>
          <select className="input" value={estadoInicial} onChange={(e) => { setEstadoInicial(e.target.value); if (e.target.value !== "Miami") setAlmacenId(""); }}>
            <option value="Prealertado">Prealertado</option>
            <option value="Miami">Recibido en Miami</option>
          </select>
        </label>

        {estadoInicial === "Miami" && (
          <label><span className="field-label">ID almacén</span><input className="input" value={almacenId} onChange={(e) => setAlmacenId(e.target.value)} placeholder="Obligatorio" /></label>
        )}
      </div>

      <textarea className="input" placeholder="Nota" value={nota} onChange={(e) => setNota(e.target.value)} />
      <button className="btn btn-primary mt-16" disabled={guardando} onClick={guardar}>{guardando ? "Guardando..." : "Registrar tracking"}</button>
    </div>
  );
}
