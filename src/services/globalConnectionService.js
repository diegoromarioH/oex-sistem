import { supabase } from "../supabase";
import { registrarAuditoria } from "./coreService";
import { puedeAvanzarEstado } from "../utils/estadosEnvio";

const estadoGlobalAOex = (status) => {
  const s = String(status || "").trim().toLowerCase();
  if (!s) return null;
  if (s === "on hand") return "Miami";
  if (s === "in transit") return "Tránsito NI";
  if (s === "in country") return "Nicaragua";
  return null;
};

export async function sincronizarGlobalConnection({ onProgress } = {}){
  let offset = 0, syncToken = null, lote = 0;
  const total = { ok:true, totalDetectados:0, prealertasConfirmadas:0, yaRegistrados:0, sinAsignarNuevos:0, actualizadosSinRegresion:0, errores:0, detalle:[] };
  do {
    const { data, error } = await supabase.functions.invoke("global-connection-sync", { body: { offset, syncToken } });
    if(error) throw error;
    if(!data?.ok) throw new Error(data?.error || "No se pudo sincronizar Global Connection.");
    syncToken = data.syncToken; lote = data.lote;
    total.totalDetectados += Number(data.procesados || 0);
    total.prealertasConfirmadas += Number(data.prealertasConfirmadas || 0);
    total.yaRegistrados += Number(data.yaRegistrados || 0);
    total.sinAsignarNuevos += Number(data.sinAsignarNuevos || 0);
    total.actualizadosSinRegresion += Number(data.actualizadosSinRegresion || 0);
    total.errores += Number(data.errores || 0);
    total.detalle.push(...(data.detalle || []));
    onProgress?.({ procesados: total.totalDetectados, total: Number(data.totalGlobal || total.totalDetectados), lote });
    if(!data.tieneMas) break;
    if(Number(data.nextOffset) <= offset) throw new Error("La sincronización no pudo avanzar al siguiente lote.");
    offset = Number(data.nextOffset);
  } while(lote < 100);
  return total;
}
export async function listarRecepcionesGlobal(){
  const {data,error}=await supabase.from("global_connection_recepciones").select("*").order("ultima_deteccion",{ascending:false});
  if(error)throw error; return data||[];
}
export async function listarRunsGlobal(){
  const {data,error}=await supabase.from("global_connection_sync_runs").select("*").order("creado_en",{ascending:false}).limit(10);
  if(error)throw error; return data||[];
}
export async function asignarRecepcionGlobal({recepcion,cliente,destino,tipoEnvio,auth}){
  if(!recepcion?.id||!recepcion?.tracking)throw new Error("Recepción inválida.");
  if(!cliente?.id)throw new Error("Selecciona un cliente.");
  if(!["Managua","Ometepe"].includes(destino))throw new Error("Selecciona Managua u Ometepe.");
  if(!["Aéreo","Marítimo"].includes(tipoEnvio))throw new Error("Selecciona el tipo de envío.");
  const {data:existente,error:e0}=await supabase.from("tracking_registros").select("id").ilike("tracking",recepcion.tracking.trim()).maybeSingle();
  if(e0)throw e0;
  if(existente)throw new Error("Este tracking ya existe en OEX. Actualiza la sincronización.");
  const ahora=new Date().toISOString();
  const estadoInicial=estadoGlobalAOex(recepcion?.detalle?.status_global)||"Miami";
  const payload={
    cliente:cliente.nombre,contacto:cliente.telefono||"",tracking:recepcion.tracking.trim(),estado:estadoInicial,
    almacen_id:recepcion.almacen_id,fecha_miami:recepcion.fecha_miami||ahora,destino,tipo_envio:tipoEnvio,
    proveedor_aduana_id:1,origen_registro:"global_connection",peso:0,
    cliente_id:cliente.id,cliente_codigo:cliente.codigo||null,cliente_tipo:cliente.tipo||"General",fecha:ahora,
    created_by:auth.session?.user?.id||null,created_by_name:auth.usuarioActual?.nombre||auth.usuarioActual?.email||auth.session?.user?.email||"Usuario"
  };
  const {data:tracking,error}=await supabase.from("tracking_registros").insert(payload).select("id").single();
  if(error)throw error;
  const {error:upError}=await supabase.from("global_connection_recepciones").update({
    estado:"asignado",tracking_registro_id:tracking.id,cliente_id:cliente.id,cliente_nombre:cliente.nombre,
    destino,asignado_en:ahora,asignado_por:auth.session?.user?.id||null,
    asignado_por_nombre:auth.usuarioActual?.nombre||auth.usuarioActual?.email||auth.session?.user?.email||"Usuario"
  }).eq("id",recepcion.id);
  if(upError){await supabase.from("tracking_registros").delete().eq("id",tracking.id);throw upError}
  await registrarAuditoria({...auth,accion:"Asignó paquete Global Connection",modulo:"Paquetería",registroCodigo:recepcion.tracking,detalle:`${cliente.nombre} · ${destino} · ${tipoEnvio} · Almacén ${recepcion.almacen_id}`});
  return tracking;
}


export async function importarLecturaGlobalConnection(items=[],auth={}){
  if(!Array.isArray(items)||!items.length) throw new Error("No hay paquetes para importar.");
  const ahora=new Date().toISOString(); let coincidencias=0,nuevos=0,errores=0,actualizados=0,sinCambios=0,finalizados=0;
  const detalle=[];
  for(const item of items.slice(0,100)){
    try{
      const tracking=String(item?.tracking||"").trim(), almacenId=String(item?.almacen_id||item?.almacenId||"").trim();
      if(!tracking||!almacenId){errores++;continue}
      const statusGlobal=String(item?.status_global||item?.status||"").trim();
      const estadoMapeado=estadoGlobalAOex(statusGlobal);
      const normalizarTracking=v=>String(v||"").trim().toUpperCase();
      const mismoTracking=(a,b)=>{const x=normalizarTracking(a),y=normalizarTracking(b);if(!x||!y)return false;if(x===y)return true;const corto=x.length<=y.length?x:y,largo=x.length>y.length?x:y;return corto.length>=18&&largo.endsWith(corto)};
      let {data:reg,error:e0}=await supabase.from("tracking_registros").select("id,tracking,estado,fecha_miami,envio_id,destino,cliente,cliente_id").ilike("tracking",tracking).maybeSingle();
      if(e0)throw e0;
      if(!reg){const {data:candidatosReg,error:er}=await supabase.from("tracking_registros").select("id,tracking,estado,fecha_miami,envio_id,destino,cliente,cliente_id");if(er)throw er;const compatibles=(candidatosReg||[]).filter(x=>mismoTracking(x.tracking,tracking));if(compatibles.length===1)reg=compatibles[0];}
      const fechaRaw=item?.fecha_miami||item?.fechaMiami||null;
      const fechaMiami=fechaRaw?(()=>{const m=String(fechaRaw).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(!m)return fechaRaw;const [,mes,dia,anio]=m;return `${anio}-${mes.padStart(2,"0")}-${dia.padStart(2,"0")}T12:00:00Z`})():null;
      const referenciaGlobal=item?.referencia_global||item?.nombre_global||null;
      const instruccionesGlobal=item?.instrucciones_global||null;
      if(reg){
        const anterior=reg.estado||"Prealertado",patch={almacen_id:almacenId,actualizado_en:ahora};
        if(fechaMiami&&!reg.fecha_miami)patch.fecha_miami=fechaMiami;
        let accion="sin_cambios";
        if(anterior==="Entregado"){accion="ya_finalizado";finalizados++}
        else if(estadoMapeado&&puedeAvanzarEstado(anterior,estadoMapeado,reg.destino)&&!reg.envio_id){patch.estado=estadoMapeado;accion=`${anterior}_a_${estadoMapeado}`;actualizados++}
        else sinCambios++;
        const {error:e1}=await supabase.from("tracking_registros").update(patch).eq("id",reg.id); if(e1)throw e1;
        const info={origen:"navegador",referencia_global:item?.referencia_global||item?.nombre_global||null,instrucciones_global:item?.instrucciones_global||null,status_global:statusGlobal||null,estado_oex_detectado:estadoMapeado,estado_oex_anterior:anterior,estado_oex_final:patch.estado||anterior};
        const {data:existRec}=await supabase.from("global_connection_recepciones").select("detalle").eq("almacen_id",almacenId).maybeSingle();
        const infoFinal={...(existRec?.detalle||{}),...info,referencia_global:referenciaGlobal,instrucciones_global:instruccionesGlobal};
        const {error:e2}=await supabase.from("global_connection_recepciones").upsert({almacen_id:almacenId,tracking,fecha_miami:fechaMiami,nombre_global:item?.nombre_global||referenciaGlobal||null,estado:"coincidencia",tracking_registro_id:reg.id,ultima_deteccion:ahora,detalle:infoFinal},{onConflict:"almacen_id"}); if(e2)throw e2;
        coincidencias++; detalle.push({tracking,almacenId,statusGlobal,cliente:reg.cliente||null,anterior,final:patch.estado||anterior,accion});
      }else{
        let historico=null;
        const {data:hist,error:eh}=await supabase.from("envios").select("id,numero_envios,cliente,cliente_id,estado,trackings").not("trackings","is",null); if(eh)throw eh;
        historico=(hist||[]).find(e=>(e.trackings||[]).some(t=>mismoTracking(t?.codigo,tracking)))||null;
                const {data:exist,error:e3}=await supabase.from("global_connection_recepciones").select("id,estado,detalle,nombre_global,fecha_miami").eq("almacen_id",almacenId).maybeSingle(); if(e3)throw e3;
        if(historico){
          const {error:e4}=await supabase.from("global_connection_recepciones").upsert({almacen_id:almacenId,tracking,fecha_miami:fechaMiami,nombre_global:item?.nombre_global||null,estado:"coincidencia",cliente_id:historico.cliente_id||null,cliente_nombre:historico.cliente||null,ultima_deteccion:ahora,detalle:{origen:"navegador",referencia_global:item?.referencia_global||item?.nombre_global||null,instrucciones_global:item?.instrucciones_global||null,status_global:statusGlobal||null,estado_oex_detectado:estadoMapeado,historico_envio_id:historico.id,recibo:historico.numero_envios,estado_historico:historico.estado}},{onConflict:"almacen_id"}); if(e4)throw e4;
          coincidencias++; if(historico.estado==="Entregado")finalizados++; else sinCambios++;
          detalle.push({tracking,almacenId,statusGlobal,cliente:historico.cliente||null,anterior:historico.estado,final:historico.estado,accion:historico.estado==="Entregado"?"ya_finalizado":"historico_existente"});
        }else{
          const estadoRecepcion=exist?.estado==="asignado"?"asignado":"sin_asignar";
          const detalleRecepcion={...(exist?.detalle||{}),origen:"navegador",referencia_global:referenciaGlobal||exist?.detalle?.referencia_global||exist?.nombre_global||null,instrucciones_global:instruccionesGlobal||exist?.detalle?.instrucciones_global||null,status_global:statusGlobal||exist?.detalle?.status_global||null,estado_oex_detectado:estadoMapeado||exist?.detalle?.estado_oex_detectado||null}; const {error:e4}=await supabase.from("global_connection_recepciones").upsert({almacen_id:almacenId,tracking,fecha_miami:fechaMiami||exist?.fecha_miami||null,nombre_global:referenciaGlobal||exist?.nombre_global||null,estado:estadoRecepcion,ultima_deteccion:ahora,detalle:detalleRecepcion},{onConflict:"almacen_id"}); if(e4)throw e4;
          if(!exist)nuevos++; detalle.push({tracking,almacenId,statusGlobal,anterior:null,final:"Sin asignar",accion:"sin_asignar"});
        }
      }
    }catch(e){errores++;detalle.push({tracking:String(item?.tracking||""),almacenId:String(item?.almacen_id||item?.almacenId||""),statusGlobal:String(item?.status_global||item?.status||""),accion:"error",error:e?.message||"Error"})}
  }
  await registrarAuditoria({...auth,accion:"Importó lectura de Global Connection",modulo:"Paquetería",detalle:`${items.length} leídos · ${coincidencias} coincidencias · ${actualizados} estados avanzados · ${nuevos} nuevos · ${errores} errores`});
  return {total:items.length,coincidencias,nuevos,actualizados,sinCambios,finalizados,errores,detalle};
}
