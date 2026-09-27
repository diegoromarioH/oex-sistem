import { supabase } from "../supabase";
import { registrarAuditoria } from "./coreService";

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
  const payload={
    cliente:cliente.nombre,contacto:cliente.telefono||"",tracking:recepcion.tracking.trim(),estado:"Miami",
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

const ORDEN_OEX=["Prealertado","Miami","Tránsito NI","Nicaragua","Bodega OEX","Tránsito Managua","Tránsito Ometepe","Punto UNI","Jardines de Veracruz","Ometepe","Entregado"];
const normalizarGlobalStatus=(v)=>String(v||"").trim().toLowerCase();
const estadoGlobalAOex=(v)=>{
  const s=normalizarGlobalStatus(v);
  if(s==="on hand")return "Miami";
  if(s==="in transit")return "Tránsito NI";
  if(s==="in country")return "Nicaragua";
  return null;
};
const puedeAvanzar=(actual,nuevo)=>{
  const a=ORDEN_OEX.indexOf(actual),n=ORDEN_OEX.indexOf(nuevo);
  if(n<0)return false;
  if(a<0)return actual==="Prealertado"||!actual;
  return n>a;
};

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
      const {data:reg,error:e0}=await supabase.from("tracking_registros").select("id,tracking,estado,fecha_miami,envio_id").ilike("tracking",tracking).maybeSingle();
      if(e0)throw e0;
      const fechaMiami=item?.fecha_miami||item?.fechaMiami||null;
      if(reg){
        const anterior=reg.estado||"Prealertado",patch={almacen_id:almacenId,actualizado_en:ahora};
        if(fechaMiami&&!reg.fecha_miami)patch.fecha_miami=fechaMiami;
        let accion="sin_cambios";
        if(anterior==="Entregado"){accion="ya_finalizado";finalizados++}
        else if(estadoMapeado&&puedeAvanzar(anterior,estadoMapeado)&&!reg.envio_id){patch.estado=estadoMapeado;accion=`${anterior}_a_${estadoMapeado}`;actualizados++}
        else sinCambios++;
        const {error:e1}=await supabase.from("tracking_registros").update(patch).eq("id",reg.id); if(e1)throw e1;
        const info={origen:"navegador",status_global:statusGlobal||null,estado_oex_detectado:estadoMapeado,estado_oex_anterior:anterior,estado_oex_final:patch.estado||anterior};
        const {error:e2}=await supabase.from("global_connection_recepciones").upsert({almacen_id:almacenId,tracking,fecha_miami:fechaMiami,nombre_global:item?.nombre_global||null,estado:"coincidencia",tracking_registro_id:reg.id,ultima_deteccion:ahora,detalle:info},{onConflict:"almacen_id"}); if(e2)throw e2;
        coincidencias++; detalle.push({tracking,almacenId,statusGlobal,anterior,final:patch.estado||anterior,accion});
      }else{
        const {data:hist,error:eh}=await supabase.from("envios").select("id,numero_envios,cliente,cliente_id,estado,trackings").contains("trackings",[{codigo:tracking}]).limit(1); if(eh)throw eh;
        let historico=(hist||[])[0]||null;
        if(!historico){
          const {data:candidatos,error:ec}=await supabase.from("envios").select("id,numero_envios,cliente,cliente_id,estado,trackings").not("trackings","is",null); if(ec)throw ec;
          historico=(candidatos||[]).find(e=>(e.trackings||[]).some(t=>String(t?.codigo||"").trim().toUpperCase()===tracking.toUpperCase()))||null;
        }
        const {data:exist,error:e3}=await supabase.from("global_connection_recepciones").select("id,estado").eq("almacen_id",almacenId).maybeSingle(); if(e3)throw e3;
        if(historico){
          const {error:e4}=await supabase.from("global_connection_recepciones").upsert({almacen_id:almacenId,tracking,fecha_miami:fechaMiami,nombre_global:item?.nombre_global||null,estado:"coincidencia",cliente_id:historico.cliente_id||null,cliente_nombre:historico.cliente||null,ultima_deteccion:ahora,detalle:{origen:"navegador",referencia_global:item?.referencia_global||item?.nombre_global||null,instrucciones_global:item?.instrucciones_global||null,status_global:statusGlobal||null,estado_oex_detectado:estadoMapeado,historico_envio_id:historico.id,recibo:historico.numero_envios,estado_historico:historico.estado}},{onConflict:"almacen_id"}); if(e4)throw e4;
          coincidencias++; if(historico.estado==="Entregado")finalizados++; else sinCambios++;
          detalle.push({tracking,almacenId,statusGlobal,anterior:historico.estado,final:historico.estado,accion:historico.estado==="Entregado"?"ya_finalizado":"historico_existente"});
        }else{
          const estadoRecepcion=exist?.estado==="asignado"?"asignado":"sin_asignar";
          const {error:e4}=await supabase.from("global_connection_recepciones").upsert({almacen_id:almacenId,tracking,fecha_miami:fechaMiami,nombre_global:item?.nombre_global||null,estado:estadoRecepcion,ultima_deteccion:ahora,detalle:{origen:"navegador",referencia_global:item?.referencia_global||item?.nombre_global||null,instrucciones_global:item?.instrucciones_global||null,status_global:statusGlobal||null,estado_oex_detectado:estadoMapeado}},{onConflict:"almacen_id"}); if(e4)throw e4;
          if(!exist)nuevos++; detalle.push({tracking,almacenId,statusGlobal,anterior:null,final:"Sin asignar",accion:"sin_asignar"});
        }
      }
    }catch(e){errores++;detalle.push({tracking:String(item?.tracking||""),accion:"error",error:e?.message||"Error"})}
  }
  await registrarAuditoria({...auth,accion:"Importó lectura de Global Connection",modulo:"Paquetería",detalle:`${items.length} leídos · ${coincidencias} coincidencias · ${actualizados} estados avanzados · ${nuevos} nuevos · ${errores} errores`});
  return {total:items.length,coincidencias,nuevos,actualizados,sinCambios,finalizados,errores,detalle};
}
