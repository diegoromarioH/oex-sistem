import { useEffect, useMemo, useRef, useState } from "react";
import { Search, UserRound, Package, ReceiptText, X } from "lucide-react";

const texto = (valor) => String(valor || "").toLowerCase().trim();

export default function GlobalSearch({ clientes = [], prealertas = [], envios = [], onNavigate }) {
  const [consulta, setConsulta] = useState("");
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef(null);
  const q = texto(consulta);

  useEffect(() => {
    const cerrar = (e) => {
      if (contenedor.current && !contenedor.current.contains(e.target)) setAbierto(false);
    };
    const escape = (e) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", cerrar);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  const resultados = useMemo(() => {
    if (q.length < 2) return [];
    const encontrados = [];

    clientes.forEach((c) => {
      const campos = [c.nombre, c.codigo, c.telefono, c.whatsapp, c.email];
      if (campos.some((v) => texto(v).includes(q))) {
        encontrados.push({
          id: `cliente-${c.id}`,
          tipo: "Cliente",
          titulo: c.nombre || "Cliente sin nombre",
          detalle: [c.codigo, c.telefono || c.whatsapp].filter(Boolean).join(" · "),
          icono: UserRound,
          destino: ["clientes"]
        });
      }
    });

    prealertas.forEach((t) => {
      const cliente = t.vinculacion?.cliente?.nombre || t.cliente;
      const codigo = t.tracking || t.codigo || t.almacenId;
      const campos = [t.tracking, t.codigo, t.almacenId, cliente, t.clienteCodigo, t.telefono];
      if (campos.some((v) => texto(v).includes(q))) {
        encontrados.push({
          id: `tracking-${t.id}`,
          tipo: "Tracking",
          titulo: codigo || "Tracking sin código",
          detalle: [cliente, t.destino, t.estado].filter(Boolean).join(" · "),
          icono: Package,
          destino: ["paqueteria", "activos"]
        });
      }
    });

    envios.forEach((e) => {
      const coincideTracking = (e.trackings || []).some((t) =>
        [t.tracking, t.codigo, t.almacenId].some((v) => texto(v).includes(q))
      );
      const campos = [e.numero, e.cliente, e.clienteCodigo, e.contacto];
      if (coincideTracking || campos.some((v) => texto(v).includes(q))) {
        encontrados.push({
          id: `recibo-${e.id}`,
          tipo: "Recibo",
          titulo: e.numero || "Recibo sin número",
          detalle: [e.cliente, e.destino, e.estado].filter(Boolean).join(" · "),
          icono: ReceiptText,
          destino: ["paqueteria", "lista"]
        });
      }
    });

    return encontrados.slice(0, 10);
  }, [q, clientes, prealertas, envios]);

  const elegir = (resultado) => {
    onNavigate(...resultado.destino);
    setAbierto(false);
    setConsulta("");
  };

  return (
    <div className="global-search" ref={contenedor}>
      <Search size={16} className="global-search-icon" aria-hidden="true" />
      <input
        value={consulta}
        onChange={(e) => { setConsulta(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        placeholder="Buscar cliente, tracking o recibo"
        aria-label="Buscar en todo OEX"
        aria-expanded={abierto}
      />
      {consulta && <button type="button" className="global-search-clear" onClick={() => setConsulta("")} aria-label="Limpiar búsqueda"><X size={14} /></button>}

      {abierto && q.length >= 2 && (
        <div className="global-search-results">
          {resultados.map((r) => (
            <button type="button" key={r.id} onClick={() => elegir(r)}>
              <span className="global-search-result-icon"><r.icono size={16} /></span>
              <span><small>{r.tipo}</small><b>{r.titulo}</b><em>{r.detalle}</em></span>
            </button>
          ))}
          {resultados.length === 0 && <p>No encontramos coincidencias.</p>}
          {resultados.length === 10 && <p className="global-search-hint">Mostrando los primeros 10 resultados. Escribe más detalles para precisar.</p>}
        </div>
      )}
    </div>
  );
}
