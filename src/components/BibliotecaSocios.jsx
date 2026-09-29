import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import PageTitle from "./PageTitle";

const vacio = { titulo: "", descripcion: "", tipo: "banner", formato: "post", activo: true };
export default function BibliotecaSocios({ volver }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(vacio);
  const [archivo, setArchivo] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const cargar = async () => {
    const { data, error } = await supabase.from("socios_recursos").select("*").order("creado_en", { ascending: false });
    if (error) throw error;
    setItems(data || []);
  };
  useEffect(() => { cargar().catch(e => setError(e.message)); }, []);
  const guardar = async e => {
    e.preventDefault(); setOcupado(true); setError("");
    let nuevoPath;
    try {
      if (form.tipo === "banner" && !form.formato) throw new Error("Selecciona el formato del banner.");
      if (!form.id && !archivo) throw new Error("Selecciona un archivo.");
      if (archivo) {
        if (!["application/pdf","image/png","image/jpeg","image/webp"].includes(archivo.type) || archivo.size > 10485760) throw new Error("Usa PDF, PNG, JPG o WEBP de hasta 10 MB.");
        nuevoPath = crypto.randomUUID() + "." + ({ "application/pdf":"pdf", "image/png":"png", "image/jpeg":"jpg", "image/webp":"webp" })[archivo.type];
        const { error } = await supabase.storage.from("socios-recursos").upload(nuevoPath, archivo);
        if (error) throw error;
      }
      const datos = { titulo: form.titulo.trim(), descripcion: form.descripcion, tipo: form.tipo, formato: form.tipo === "banner" ? form.formato : null, activo: form.activo,
        archivo_path: nuevoPath || form.archivo_path, nombre_archivo: archivo?.name || form.nombre_archivo };
      const { error } = await (form.id ? supabase.from("socios_recursos").update(datos).eq("id",form.id) : supabase.from("socios_recursos").insert(datos));
      if (error) {
        if (nuevoPath) await supabase.storage.from("socios-recursos").remove([nuevoPath]);
        throw error;
      }
      if (nuevoPath && form.archivo_path) await supabase.storage.from("socios-recursos").remove([form.archivo_path]);
      setForm(vacio); setArchivo(null); await cargar();
    } catch (e) { setError(e.message); } finally { setOcupado(false); }
  };
  const eliminar = async item => {
    if (!window.confirm("¿Eliminar este material de la biblioteca?")) return;
    setOcupado(true); setError("");
    try {
      const { error } = await supabase.from("socios_recursos").delete().eq("id",item.id);
      if (error) throw error;
      const { error: fallo } = await supabase.storage.from("socios-recursos").remove([item.archivo_path]);
      if (form.id === item.id) { setForm(vacio); setArchivo(null); }
      await cargar();
      if (fallo) throw new Error("Material eliminado. No se pudo limpiar el archivo almacenado.");
    } catch(e) { setError(e.message); } finally { setOcupado(false); }
  };
  return <div className="page recomendaciones-page">
    <button className="btn" onClick={volver}>← Volver a Recomendaciones</button>
    <PageTitle title="Biblioteca de socios" subtitle="Publica banners y documentos que aparecerán en oexni.com/socios." />
    {error && <p role="alert" className="info-box">{error}</p>}
    <form className="card" onSubmit={guardar}>
      <h3>{form.id ? "Editar material" : "Añadir material"}</h3>
      <div className="form-grid">
        <label>Título<input className="input" required maxLength={150} value={form.titulo} onChange={e=>setForm({...form,titulo:e.target.value})}/></label>
        <label>Tipo<select className="input" value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value,formato:e.target.value === "banner" ? (form.formato || "post") : null})}><option value="banner">Banner</option><option value="guia">Guía</option><option value="reglamento">Reglamento</option><option value="otro">Otro</option></select></label>
        {form.tipo === "banner" && <label>Formato<select className="input" required value={form.formato || ""} onChange={e=>setForm({...form,formato:e.target.value})}><option value="">Selecciona un formato</option><option value="post">Post / publicación</option><option value="historia">Historia / estado</option><option value="horizontal">Banner horizontal</option></select></label>}
        <label>Descripción<textarea className="input" value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})}/></label>
        <label>Archivo {form.id && "(opcional para reemplazar)"}<input key={form.id || "nuevo"} className="input" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={e=>setArchivo(e.target.files?.[0] || null)}/><small>PDF, PNG, JPG o WEBP · máximo 10 MB. Materiales generales para compartir.</small>{archivo && <small>{archivo.name}</small>}</label>
      </div>
      <label className="switch-row"><input type="checkbox" checked={form.activo} onChange={e=>setForm({...form,activo:e.target.checked})}/>Publicado para los socios</label>
      <div className="modal-actions"><button type="button" className="btn" disabled={ocupado} onClick={()=>{setForm(vacio);setArchivo(null);}}>Cancelar edición</button><button className="btn btn-primary" disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar material"}</button></div>
    </form>
    <div className="card"><h3>Materiales de la biblioteca</h3>{items.length === 0 && <p>Aún no hay materiales añadidos. Las guías y banners base siguen disponibles.</p>}
    {items.map(item=><div className="row-card" key={item.id}><div><b>{item.titulo}</b><p>{item.tipo}{item.tipo === "banner" ? " · " + ({post:"Post / publicación",historia:"Historia / estado",horizontal:"Banner horizontal"}[item.formato] || "Formato sin definir") : ""} · {item.activo ? "Publicado" : "Oculto"} · {item.nombre_archivo}</p></div><div><button className="btn" disabled={ocupado} onClick={()=>{setForm(item);setArchivo(null);}}>Editar</button><button className="btn" disabled={ocupado} onClick={()=>eliminar(item)}>Eliminar</button></div></div>)}</div>
  </div>;
}
