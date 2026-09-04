// src/components/ClienteSelector.jsx
// Selector con búsqueda para vincular un pedido/envío a un cliente EXISTENTE.
// Si el operador no selecciona ninguno, el servicio (resolverCliente) buscará
// o creará el cliente por teléfono al guardar — así nunca queda huérfano.
import { useMemo, useState } from "react";

export default function ClienteSelector({ clientes, clienteId, onSeleccionar, onEscribirNombre, onEscribirTelefono, nombre, telefono }) {
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);

  const resultados = useMemo(() => {
    if (!busqueda.trim()) return clientes.slice(0, 6);
    const q = busqueda.toLowerCase();
    return clientes.filter((c) => c.nombre.toLowerCase().includes(q) || c.telefono.includes(q) || c.codigo.toLowerCase().includes(q)).slice(0, 6);
  }, [clientes, busqueda]);

  const clienteSeleccionado = clientes.find((c) => c.id === clienteId);

  return (
    <div className="stack-gap-sm">
      <label>
        <span className="field-label">Cliente</span>
        <input
          className="input"
          placeholder="Nombre del cliente"
          value={nombre}
          onChange={(e) => { onEscribirNombre(e.target.value); setBusqueda(e.target.value); setAbierto(true); }}
          onFocus={() => setAbierto(true)}
        />
      </label>

      {abierto && busqueda && resultados.length > 0 && (
        <div className="card" style={{ padding: 8 }}>
          {resultados.map((c) => (
            <button
              key={c.id}
              type="button"
              className="btn-ghost"
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 6px" }}
              onClick={() => {
                onSeleccionar(c);
                setBusqueda("");
                setAbierto(false);
              }}
            >
              <b>{c.nombre}</b> <small>· {c.codigo} · {c.telefono}</small>
            </button>
          ))}
        </div>
      )}

      {clienteSeleccionado && (
        <span className="badge badge-info">Vinculado a {clienteSeleccionado.codigo}</span>
      )}

      <label>
        <span className="field-label">WhatsApp / Teléfono</span>
        <input className="input" placeholder="8888-8888" value={telefono} onChange={(e) => onEscribirTelefono(e.target.value)} />
      </label>
    </div>
  );
}
