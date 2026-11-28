const ORIGEN_GLOBAL_CONNECTION = "https://gc.cargotrack.net";
const MENSAJE_LECTURA = "oex:global:lectura";
const MENSAJE_RECIBIDO = "oex:global:recibido";

export function conexionGlobalEntrante() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const id = params.get("oex-global");
  const origen = params.get("origen");
  if (!window.opener || !/^[0-9a-f]{36}$/i.test(id || "") || origen !== ORIGEN_GLOBAL_CONNECTION) return null;
  return { id, origen };
}

export function recibirLecturaGlobal(onLectura) {
  const conexion = conexionGlobalEntrante();
  const origenVentana = window.opener;
  if (!conexion) return () => {};

  const recibir = (evento) => {
    const { tipo, id, items } = evento.data || {};
    if (evento.source !== origenVentana || evento.origin !== conexion.origen
        || tipo !== MENSAJE_LECTURA || id !== conexion.id
        || !Array.isArray(items) || items.length === 0) return;

    const lectura = [...new Map(items.filter((item) =>
      typeof item?.tracking === "string" && item.tracking.trim()
      && typeof item.almacen_id === "string" && item.almacen_id.trim()
    ).map((item) => [item.almacen_id, {
      almacen_id: item.almacen_id,
      tracking: item.tracking,
      fecha_miami: typeof item.fecha_miami === "string" ? item.fecha_miami : null,
      nombre_global: typeof item.nombre_global === "string" ? item.nombre_global : null,
      referencia_global: typeof item.referencia_global === "string" ? item.referencia_global : null,
      instrucciones_global: typeof item.instrucciones_global === "string" ? item.instrucciones_global : null,
      status_global: typeof item.status_global === "string" ? item.status_global : null
    }])).values()];
    if (!lectura.length) return;

    window.removeEventListener("message", recibir);
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    origenVentana.postMessage({ tipo: MENSAJE_RECIBIDO, id }, conexion.origen);
    onLectura(lectura);
  };
  window.addEventListener("message", recibir);
  return () => window.removeEventListener("message", recibir);
}

export function lectorGlobal(destino = "") {
  const abrirOex = destino ? `
    if (location.origin !== ${JSON.stringify(ORIGEN_GLOBAL_CONNECTION)} || location.pathname.toLowerCase() !== "/appl2.0/agent/whs.asp") throw new Error("Abre Almacén en Global Connection antes de usar el marcador.");
    const destino = ${JSON.stringify(destino)};
    const id = [...crypto.getRandomValues(new Uint8Array(18))].map(n => n.toString(16).padStart(2, "0")).join("");
    const popup = window.open(destino + "/#" + new URLSearchParams({ "oex-global": id, origen: location.origin }), "_blank");
    if (!popup) throw new Error("Permite la ventana emergente de OEX y vuelve a pulsar el marcador.");
  ` : "";
  const enviarOex = `
    await new Promise((resolve, reject) => {
      const inicio = Date.now();
      const recibido = (evento) => {
        if (evento.source !== popup || evento.origin !== destino || evento.data?.tipo !== "${MENSAJE_RECIBIDO}" || evento.data.id !== id) return;
        terminar();
        resolve();
      };
      const terminar = () => {
        clearInterval(espera);
        window.removeEventListener("message", recibido);
      };
      const espera = setInterval(() => {
        if (popup.closed || Date.now() - inicio > 120000) {
          terminar();
          reject(new Error("OEX no recibió la lectura. Comprueba que tu sesión esté abierta y vuelve a intentarlo."));
          return;
        }
        popup.postMessage({ tipo: "${MENSAJE_LECTURA}", id, items: out }, destino);
      }, 300);
      window.addEventListener("message", recibido);
    });
  `;
  // Ambos marcadores ejecutan la misma lectura dentro de la sesión del portal.
  const leer = `const parse=async(url)=>{if(new URL(url,location.href).origin!==location.origin)throw new Error('Página de almacén inválida.');const r=await fetch(url,{credentials:'include'});if(!r.ok)throw new Error('No pude abrir '+url);return new DOMParser().parseFromString(await r.text(),'text/html')};const current=document;const pageLinks=[...current.querySelectorAll('a[href*="whs.asp"]')].map(a=>new URL(a.href,location.href).href);const pages=[...new Set([location.origin+'/appl2.0/agent/whs.asp',...pageLinks])].slice(0,5);const ids=[];for(const p of pages){const doc=p===location.href?current:await parse(p);for(const a of doc.querySelectorAll('a[href*="whs_detail.asp?id="]')){try{const id=new URL(a.href,location.href).searchParams.get('id');if(id&&!ids.includes(id))ids.push(id)}catch{}}}if(!ids.length)throw new Error('No encontré almacenes. Abre la pestaña Almacén.');const out=[];for(const id of ids){const doc=await parse('/appl2.0/agent/whs_detail.asp?id='+encodeURIComponent(id)),inputs=[...doc.querySelectorAll('input')];const valByLabel=(label)=>{for(const el of doc.querySelectorAll('td,th,label,span,div')){if((el.textContent||'').trim().toLowerCase()===label.toLowerCase()){const row=el.closest('tr')||el.parentElement;if(row){const cells=[...row.querySelectorAll('td')],cell=el.closest('td'),i=cells.indexOf(cell);if(i>=0)for(let j=i+1;j<cells.length;j++){const x=cells[j].querySelector('input,textarea,select');if(x&&String(x.value||'').trim())return String(x.value).trim();const t=(cells[j].textContent||'').trim();if(t)return t}}}}return''};let tracking=valByLabel('Tracking');if(!tracking){const inp=inputs.find(x=>/tracking/i.test((x.name||'')+' '+(x.id||'')));tracking=inp?.value?.trim()||''}const fecha=valByLabel('Fecha')||null,referencia=valByLabel('Reference')||valByLabel('Referencia')||null;const selectedByLabel=(label)=>{for(const el of doc.querySelectorAll('td,th,label')){if((el.textContent||'').trim().toLowerCase()===label.toLowerCase()){const row=el.closest('tr')||el.parentElement,s=row?.querySelector('select');if(s)return String(s.selectedOptions?.[0]?.text||s.value||'').trim();const checked=row?.querySelector('input:checked');if(checked)return String(checked.value||'').trim()}}return''};const instrucciones=selectedByLabel('Instructions')||selectedByLabel('Instrucciones')||null,status=selectedByLabel('Status')||valByLabel('Status')||null;if(tracking&&!/^factura$/i.test(tracking)&&tracking!=='N/A')out.push({almacen_id:id,tracking,fecha_miami:fecha,nombre_global:referencia,referencia_global:referencia,instrucciones_global:instrucciones,status_global:status})}if(!out.length)throw new Error('No encontré trackings en los almacenes.');`;
  const copiar = `const data=JSON.stringify(out);try{await navigator.clipboard.writeText(data)}catch{prompt('Copia esta lectura de OEX:',data);return}alert('OEX: '+out.length+' paquetes copiados de hasta 5 páginas. Regresa a OEX y pégalos.')`;
  return `javascript:void(async()=>{try{${abrirOex}${leer}${destino ? enviarOex : copiar}}catch(e){alert("OEX: "+e.message)}})()`;
}
