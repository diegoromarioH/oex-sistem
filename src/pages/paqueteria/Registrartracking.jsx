// src/pages/paqueteria/RegistrarTracking.jsx
//
// Antes vivía metido dentro de Prealertas.jsx. Ahora es su propia pestaña:
// registrar un tracking nuevo a mano, ligado a un cliente existente o
// nuevo. Nace confirmado (no pasa por "pendiente de confirmar", eso es
// solo para lo que llega de la landing pública) y va directo a Envíos
// activos.
import { useState } from "react";
import { registrarTracking } from "../../services/trackingsService";
import ClienteSelector from "../../components/ClienteSelector";

export default function RegistrarTracking({ clientes, auth, mostrarToast, cargarDatos }) {
  const [cliente, setCliente] = useState("");
  const [contacto, setContacto] = useState("");
  const [clienteId, setClienteId] = useState(null);
  const [destino, setDestino] = useState("Ometepe");
  const [tipoEnvio, setTipoEnvio] = useState("Marítimo");
  const [codigo, setCodigo] = useState("");
  const [almacenId, setAlmacenId] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!cliente.trim() || !contacto.trim()) {
      mostrarToast("Escribe cliente y WhatsApp.", "warning");
      return;
    }
    setGuardando(true);
    try {
      await registrarTracking({
        form: { cliente, contacto, destino, tipoEnvio, codigo, almacenId, nota },
        clientesEnMemoria: clientes,
        auth
      });
      mostrarToast("Tracking registrado — ya está en Envíos activos.");
      setCliente(""); setContacto(""); setClienteId(null); setCodigo(""); setAlmacenId(""); setNota("");
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo guardar el tracking.", "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="card">
      <h3>Registrar tracking</h3>
      <p>Todo tracking nace aquí ligado a un cliente y pasa directo a Envíos activos, listo para editar su estado.</p>
      <div className="form-grid mt-16">
        <ClienteSelector
          clientes={clientes} clienteId={clienteId} nombre={cliente} telefono={contacto}
          onEscribirNombre={setCliente} onEscribirTelefono={setContacto}
          onSeleccionar={(c) => { setClienteId(c.id); setCliente(c.nombre); setContacto(c.telefono); }}
        />
        <label>
          <span className="field-label">Destino</span>
          <select className="input" value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option>Ometepe</option><option>Managua</option>
          </select>
        </label>
        <label>
          <span className="field-label">Tipo</span>
          <select className="input" value={tipoEnvio} onChange={(e) => setTipoEnvio(e.target.value)}>
            <option>Marítimo</option><option>Aéreo</option>
          </select>
        </label>
        <label><span className="field-label">Tracking</span><input className="input" value={codigo} onChange={(e) => setCodigo(e.target.value)} /></label>
        <label><span className="field-label">ID almacén (interno)</span><input className="input" value={almacenId} onChange={(e) => setAlmacenId(e.target.value)} /></label>
      </div>
      <textarea className="input" placeholder="Nota" value={nota} onChange={(e) => setNota(e.target.value)} />
      <button className="btn btn-primary mt-16" disabled={guardando} onClick={guardar}>{guardando ? "Guardando..." : "Registrar tracking"}</button>
    </div>
  );
}