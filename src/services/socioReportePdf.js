import jsPDF from "jspdf";
import logoOEX from "../assets/LOGOOEX.png";

const etiquetas = { curso: "En curso", revision: "En revisión", disponible: "Disponible", pendiente: "Pendiente de pago", pagado: "Pagado", anulado: "Anulado" };
const estados = ["curso", "revision", "disponible", "pendiente", "pagado"];
const dinero = v => v == null ? "Por confirmar" : "US$ " + Number(v).toFixed(2);
const fecha = v => v ? new Date(String(v).length === 10 ? v + "T12:00:00-06:00" : v).toLocaleDateString("es-NI", { timeZone: "America/Managua" }) : "Por confirmar";
const periodo = v => /^\d{4}-\d{2}$/.test(v || "") ? new Date(v + "-15T12:00:00-06:00").toLocaleDateString("es-NI", { month: "long", year: "numeric", timeZone: "America/Managua" }) : "Por confirmar";
const navy = [15,36,69], orange = [244,86,45], gray = [99,112,130];

export function crearReporteSocio({ socio, cortes = [], retiros = [], clientes = [], generadoEn = new Date().toISOString() }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 44;
  const header = () => {
    doc.setFillColor(...navy); doc.rect(0,0,210,33,"F");
    doc.setFillColor(...orange); doc.rect(0,0,210,2,"F");
    doc.addImage(logoOEX,"PNG",14,6,24,21);
    doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(14);
    doc.text("INFORME DEL SOCIO",196,14,{align:"right"});
    doc.setFont("helvetica","normal"); doc.setFontSize(9);
    doc.text("Programa de Recomendaciones OEX",196,21,{align:"right"});
    doc.text("Emitido: " + fecha(generadoEn) + " | Importes en USD",196,27,{align:"right"});
    doc.setTextColor(...navy);
  };
  const nueva = () => { doc.addPage(); header(); y=44; };
  const espacio = alto => { if(y+alto>269) nueva(); };
  const texto = (valor, size=9, bold=false, color=navy) => {
    doc.setFont("helvetica",bold?"bold":"normal"); doc.setFontSize(size); doc.setTextColor(...color);
    const lineas = doc.splitTextToSize(String(valor || "-"),182);
    lineas.forEach(l=>{espacio(5);doc.text(l,14,y);y+=5;}); y+=2;
  };
  const titulo = valor => { espacio(18); y+=3; texto(valor,12,true); };
  const tabla = (cabeceras, anchuras, filas, derecha=[]) => {
    const cabecera = () => {
      espacio(11); doc.setFillColor(...navy); doc.rect(14,y-4,182,10,"F");
      doc.setFont("helvetica","bold"); doc.setFontSize(7.5); doc.setTextColor(255,255,255);
      let x=14;cabeceras.forEach((c,i)=>{doc.text(c,x+2,y+1);x+=anchuras[i];});y+=10;
    };
    espacio(10 + (filas.length ? 16 : 8));
    cabecera();
    if(!filas.length) { texto("Sin movimientos registrados.",9,false,gray); return; }
    filas.forEach((fila,index)=>{
      doc.setFont("helvetica","normal");doc.setFontSize(8);
      const celdas=fila.map((v,i)=>doc.splitTextToSize(String(v ?? "-"),anchuras[i]-4));
      const cantidad=Math.max(...celdas.map(c=>c.length));
      if(cantidad*4+4 <= 215 && y+cantidad*4+4>269) { nueva(); cabecera(); }
      let inicio=0;
      while(inicio<cantidad) {
        if(y+9>269){nueva();cabecera();}
        const disponibles=Math.max(1,Math.floor((269-y-4)/4));
        const n=Math.min(cantidad-inicio,disponibles), alto=n*4+4;
        doc.setFillColor(...(index%2===0?[241,245,249]:[255,255,255]));doc.rect(14,y-4,182,alto,"F");
        doc.setTextColor(...navy);doc.setFontSize(8);doc.setFont("helvetica","normal");
        let x=14;celdas.forEach((celda,i)=>{const trozo=celda.slice(inicio,inicio+n);if(trozo.length)doc.text(trozo,derecha.includes(i)?x+anchuras[i]-2:x+2,y,{align:derecha.includes(i)?"right":"left",lineHeightFactor:1.42});x+=anchuras[i];});
        y+=alto;inicio+=n;
        if(inicio<cantidad){nueva();cabecera();}
      }
    });y+=4;
  };
  header();
  texto(socio.nombre,17,true);
  texto("Código de socio: " + String(socio.identificador || "-").toUpperCase() + " | Ingreso: " + fecha(socio.fecha_ingreso));
  texto("Comisión actual: " + Number(socio.porcentaje_utilidad || 0) + "% de la utilidad elegible. Los movimientos reservados conservan su porcentaje original.",8,false,gray);
  const totales=Object.fromEntries(estados.map(k=>[k,cortes.reduce((s,c)=>s+Number(c[k]||0),0)]));
  titulo("Resumen de comisiones");
  estados.forEach((k,i)=>{
    espacio(13);doc.setFillColor(...(k==="disponible"?[255,239,230]:[241,245,249]));doc.roundedRect(14,y-4,182,11,2,2,"F");
    doc.setFont("helvetica",k==="disponible"?"bold":"normal");doc.setFontSize(10);doc.setTextColor(...navy);doc.text(etiquetas[k],18,y+2);
    doc.setTextColor(...(k==="disponible"?orange:navy));doc.text(dinero(totales[k]),192,y+2,{align:"right"});y+=13;
  });
  texto("El saldo disponible y el pendiente de pago son categorías distintas. Lo pagado es histórico y no forma parte del saldo por cobrar.",8,false,gray);
  titulo("Cómo leer este informe");
  texto("En curso: falta entrega o cobro. En revisión: faltan costos, fecha de entrega o completar 72 horas. Disponible: cumple las condiciones para solicitar retiro. Pendiente: solicitud registrada y aún sin pagar.",8,false,gray);
  texto("Pagos del 1 al 5 de cada mes, sin retiro mínimo. El corte indica el primer período de pago después de completar 3 días desde la entrega y cumplir el cobro; los saldos disponibles se conservan.",8,false,gray);

  titulo("Cortes mensuales");
  tabla(["Período","Envíos","En curso","Revisión","Disponible","Pendiente","Pagado"],[39,13,26,26,26,26,26],
    cortes.map(c=>[periodo(c.periodo),c.cantidad,...estados.map(k=>dinero(c[k]))]),[1,2,3,4,5,6]);
  titulo("Clientes vinculados");
  texto(clientes.length + " cliente(s) vinculados al socio al emitir el informe.",9);
  tabla(["Cliente","Código","Vinculación","Origen"],[72,30,35,45],clientes.map(c=>[c.nombre,c.codigo_cliente || "-",fecha(c.recomendacion_fecha),c.recomendacion_origen==="enlace"?"Enlace personal":"Asignación manual"]));

  const movimientos = cortes.flatMap(c=>c.filas.map(f=>({...f,periodo:c.periodo,numero:f.numero_envios})));
  retiros.filter(r=>r.estado!=="anulado").forEach(r=>(r.socios_retiros_detalle || []).forEach(d=>movimientos.push({...d,numero:d.numero_envio,estado_comision:r.estado,solicitud:r.numero})));
  titulo("Detalle de comisiones por envío");
  texto("Incluye movimientos vigentes y comisiones reservadas o pagadas. Las solicitudes anuladas se muestran sólo en el historial para evitar duplicar saldos.",8,false,gray);
  movimientos.sort((a,b)=>String(a.periodo || "").localeCompare(String(b.periodo || "")));
  tabla(["Envío / cliente","Entrega / corte","Utilidad","%","Comisión","Estado / recibo"],[52,39,25,12,25,29],
    movimientos.map(f=>[f.numero+"\n"+(f.cliente || "-"),fecha(f.entrega)+"\n"+periodo(f.periodo),dinero(f.utilidad),f.porcentaje == null ? "-" : Number(f.porcentaje)+"%",dinero(f.comision),etiquetas[f.estado_comision]+"\n"+(f.solicitud || "")]),[2,3,4]);
  titulo("Solicitudes y pagos");
  if(!retiros.length) texto("Aún no se han registrado solicitudes ni pagos.",9,false,gray);
  retiros.forEach(r=>{
    espacio(30);texto(r.numero+" | "+(etiquetas[r.estado] || r.estado)+" | "+dinero(r.monto_usd),11,true);
    texto("Solicitado: "+fecha(r.creado_en)+" | Envíos incluidos: "+(r.socios_retiros_detalle || []).length,9);
    texto("Cuenta de destino registrada: "+([r.banco,r.moneda_destino,r.numero_cuenta].filter(Boolean).join(" / ") || "Sin definir"),8,false,gray);
    if(r.estado==="pagado"){
      texto("Fecha de pago: "+fecha(r.fecha_pago)+" | Referencia: "+(r.referencia || "-"),9);
      texto("Monto pagado: "+(r.moneda_pago || "USD")+" "+Number(r.monto_cuenta || 0).toFixed(2),9);
    }
    if(r.estado==="anulado") texto("Motivo de anulación: "+(r.motivo_anulacion || "-"),9,false,gray);
    tabla(["Envío / cliente","Corte","Utilidad","%","Comisión"],[72,40,26,16,28],
      (r.socios_retiros_detalle || []).map(d=>[d.numero_envio+"\n"+d.cliente,periodo(d.periodo),dinero(d.utilidad),Number(d.porcentaje)+"%",dinero(d.comision)]),[2,3,4]);
  });
  const paginas=doc.getNumberOfPages();
  for(let p=1;p<=paginas;p++){
    doc.setPage(p);header();doc.setDrawColor(210,218,227);doc.line(14,276,196,276);
    doc.setFont("helvetica","normal");doc.setFontSize(7);doc.setTextColor(...gray);
    doc.text("OEX | Informe informativo al "+fecha(generadoEn)+". No sustituye el comprobante de pago.",14,282);
    doc.text(p+" / "+paginas,196,282,{align:"right"});
    doc.text("Socio "+String(socio.identificador || "-").toUpperCase()+" | oexni.com",14,287);
  }
  return doc;
}
export function descargarReporteSocio(datos) {
  crearReporteSocio(datos).save("OEX-informe-socio-"+datos.socio.identificador+".pdf");
}
