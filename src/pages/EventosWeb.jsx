import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { Activity, CalendarDays, MessageCircle, Search, Send, Smartphone } from "lucide-react";
import "../styles/eventosWeb.css";

const ETIQUETAS = {
  pagina_vista: "Página visitada",
  guia_vista: "Guía visitada",
  whatsapp_click: "Clic en WhatsApp",
  tracking_busqueda: "Búsqueda de tracking",
  prealerta_inicio: "Prealerta iniciada",
  prealerta_enviada: "Prealerta enviada",
  app_instalar_click: "Clic en instalar app",
  app_instalada: "App instalada"
};

export default function EventosWeb() {
  const [eventos, setEventos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const cargar = async () => {
      setCargando(true);
      const desde = new Date();
      desde.setDate(desde.getDate() - 30);
      const { data, error: err } = await supabase
        .from("eventos_web")
        .select("id, evento, pagina, dispositivo, referencia, datos, creado_en")
        .gte("creado_en", desde.toISOString())
        .order("creado_en", { ascending: false })
        .limit(1000);

      if (err) setError("No se pudieron cargar los eventos web.");
      else setEventos(data || []);
      setCargando(false);
    };
    cargar();
  }, []);

  const resumen = useMemo(() => {
    const contar = (tipo) => eventos.filter((e) => e.evento === tipo).length;
    return {
      visitas: contar("pagina_vista") + contar("guia_vista"),
      whatsapp: contar("whatsapp_click"),
      busquedas: contar("tracking_busqueda"),
      prealertas: contar("prealerta_enviada"),
      instalaciones: contar("app_instalada")
    };
  }, [eventos]);

  const paginas = useMemo(() => {
    const conteo = {};
    eventos
      .filter((e) => e.evento === "pagina_vista" || e.evento === "guia_vista")
      .forEach((e) => { conteo[e.pagina] = (conteo[e.pagina] || 0) + 1; });
    return Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [eventos]);

  if (cargando) return <div className="page eventos-page"><p>Cargando eventos web…</p></div>;

  return (
    <div className="page eventos-page">
      <header className="eventos-header">
        <div>
          <span className="eventos-kicker"><Activity size={15} /> Analítica web</span>
          <h1>Eventos web</h1>
          <p>Actividad de oexni.com durante los últimos 30 días.</p>
        </div>
        <span className="eventos-periodo"><CalendarDays size={16} /> Últimos 30 días</span>
      </header>

      {error && <div className="eventos-error">{error}</div>}

      <section className="eventos-metricas">
        <Metrica icon={Activity} label="Visitas" valor={resumen.visitas} />
        <Metrica icon={MessageCircle} label="WhatsApp" valor={resumen.whatsapp} />
        <Metrica icon={Search} label="Búsquedas" valor={resumen.busquedas} />
        <Metrica icon={Send} label="Prealertas" valor={resumen.prealertas} />
        <Metrica icon={Smartphone} label="Apps instaladas" valor={resumen.instalaciones} />
      </section>

      <div className="eventos-grid">
        <section className="eventos-card">
          <h2>Páginas más visitadas</h2>
          {paginas.length === 0 ? <p className="eventos-vacio">Todavía no hay visitas registradas.</p> : (
            <div className="paginas-lista">
              {paginas.map(([pagina, total]) => (
                <div key={pagina}><span>{pagina}</span><b>{total}</b></div>
              ))}
            </div>
          )}
        </section>

        <section className="eventos-card eventos-recientes">
          <h2>Actividad reciente</h2>
          {eventos.length === 0 ? <p className="eventos-vacio">Los nuevos eventos aparecerán aquí.</p> : (
            <div className="eventos-tabla-wrap">
              <table className="eventos-tabla">
                <thead><tr><th>Evento</th><th>Página</th><th>Dispositivo</th><th>Fecha</th></tr></thead>
                <tbody>
                  {eventos.slice(0, 50).map((evento) => (
                    <tr key={evento.id}>
                      <td>{ETIQUETAS[evento.evento] || evento.evento}</td>
                      <td>{evento.pagina}</td>
                      <td>{evento.dispositivo || "—"}</td>
                      <td>{new Intl.DateTimeFormat("es-NI", { dateStyle: "short", timeStyle: "short" }).format(new Date(evento.creado_en))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Metrica({ icon: Icono, label, valor }) {
  return <article className="evento-metrica"><Icono size={19} /><div><b>{valor}</b><span>{label}</span></div></article>;
}
