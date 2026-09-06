// src/pages/Dashboard.jsx
import { useMemo } from "react";
import { Package, TrendingUp, Wallet, Clock, Users, AlertCircle, Warehouse, DollarSign, Weight, ReceiptText } from "lucide-react";
import { numero } from "../utils/numero";
import Metric from "../components/Metric";
import PageTitle from "../components/PageTitle";
import SeguimientoClientes from "../components/SeguimientoClientes";
import { esPendienteDeConfirmar, esListoParaRetiroProveedor } from "../utils/estadosEnvio";
import { costoInternoDefaultPorTipo } from "../utils/calculosPaqueteria";

const FRASES = ["Cada entrega cuenta.","Lo que se mide, se puede mejorar.","Cada paquete entregado es un cliente que confió en OEX.","Hoy es un buen día para mover OEX hacia adelante.","Un cliente bien atendido siempre recuerda el servicio.","Orden, seguimiento y servicio hacen crecer cada envío.","Cada libra mueve una historia y una oportunidad.","Hagamos que cada entrega llegue mejor que la anterior."];
const fechaDe = (x) => { const v=x?.fechaISO||x?.fecha||x?.createdAt||x?.created_at; if(!v)return null; const d=new Date(v); return Number.isNaN(d.getTime())?null:d; };

export default function Dashboard({ pedidos, envios, gastos, prealertas = [], empresa, cuentasDinero = [], auth, mostrarToast, cargarDatos, setVista, irAPrealertas }) {
  const ahora=new Date(), mes=ahora.getMonth(), anio=ahora.getFullYear();
  const esMesActual=(x)=>{const d=fechaDe(x);return d&&d.getMonth()===mes&&d.getFullYear()===anio;};
  const nombreUsuario=(auth?.usuarioActual?.nombre||auth?.session?.user?.user_metadata?.nombre||auth?.session?.user?.email||"equipo OEX").split(" ")[0];
  const hora=ahora.getHours(); const saludo=hora>=5&&hora<12?"Buenos días":hora>=12&&hora<18?"Buenas tardes":"Buenas noches";
  const frase=FRASES[Math.floor((ahora-new Date(anio,0,1))/86400000)%FRASES.length];
  const enviosMes=envios.filter(esMesActual), gastosMes=gastos.filter(esMesActual);
  const facturacionMes=enviosMes.reduce((a,e)=>a+numero(e.total),0), facturacionHistorica=envios.reduce((a,e)=>a+numero(e.total),0);
  const gananciaMes=enviosMes.reduce((a,e)=>a+numero(e.gananciaReal),0), gananciaHistorica=envios.reduce((a,e)=>a+numero(e.gananciaReal),0);
  const gastosDelMes=gastosMes.reduce((a,g)=>a+numero(g.monto),0), gastosHistoricos=gastos.reduce((a,g)=>a+numero(g.monto),0);
  const porCobrar=envios.reduce((a,e)=>a+numero(e.saldo),0);
  const recibosActivos=envios.filter(e=>e.estado!=="Entregado"), prealertasPendientes=prealertas.filter(esPendienteDeConfirmar), trackingsActivos=prealertas.filter(t=>!esPendienteDeConfirmar(t));
  const costoEstimadoTracking=(t)=>numero(t.peso)*(t.costoInterno!==undefined&&t.costoInterno!==""?numero(t.costoInterno):costoInternoDefaultPorTipo(t.tipoEnvio));
  const enBodegaOEX=useMemo(()=>prealertas.filter(t=>esListoParaRetiroProveedor(t.estado)).map(t=>({...t,montoEstimado:costoEstimadoTracking(t)})),[prealertas]);
  const bodegaOmetepe=enBodegaOEX.filter(t=>t.destino==="Ometepe"), bodegaManagua=enBodegaOEX.filter(t=>t.destino==="Managua");
  const librasBodega=enBodegaOEX.reduce((a,t)=>a+numero(t.peso),0), montoBodega=enBodegaOEX.reduce((a,t)=>a+t.montoEstimado,0);
  const librasMes=enviosMes.reduce((a,e)=>a+numero(e.totalLibras),0), librasHistoricas=envios.reduce((a,e)=>a+numero(e.totalLibras),0);
  const clientesMes=new Set(enviosMes.map(e=>e.clienteId||e.clienteCodigo||e.cliente).filter(Boolean)).size;
  const rankingClientes=useMemo(()=>{const m=new Map();envios.forEach(e=>{const k=e.clienteId||e.clienteCodigo||e.cliente;if(!k)return;const x=m.get(k)||{nombre:e.cliente||e.clienteCodigo||"Cliente",libras:0,monto:0};x.libras+=numero(e.totalLibras);x.monto+=numero(e.total);m.set(k,x);});const v=[...m.values()];return{libras:[...v].sort((a,b)=>b.libras-a.libras)[0]||null,monto:[...v].sort((a,b)=>b.monto-a.monto)[0]||null};},[envios]);
  const saldosPendientes=envios.filter(e=>numero(e.saldo)>0);
  const ultimos=[...pedidos.slice(0,4).map(p=>({...p,tipo:"SHEIN"})),...envios.slice(0,4).map(e=>({...e,tipo:"Paquetería"}))].sort((a,b)=>(fechaDe(b)?.getTime()||0)-(fechaDe(a)?.getTime()||0)).slice(0,6);

  return <div className="page">
    <div className="card" style={{borderLeft:"4px solid #F4562D",background:"linear-gradient(135deg, rgba(244,86,45,.08), transparent 65%)"}}><h2 style={{margin:0}}>{saludo}, {nombreUsuario} 👋</h2><p style={{margin:"6px 0 0",fontWeight:700,color:"#F4562D"}}>{frase}</p></div>
    <PageTitle title="Dashboard" subtitle="Lo importante para decidir y operar hoy" />

    <h3>Salud del negocio</h3><div className="grid-4">
      <Metric label={<><DollarSign size={16}/> Facturación del mes</>} value={`$${facturacionMes.toFixed(2)}`} onClick={()=>setVista("paqueteria")}/>
      <Metric label={<><TrendingUp size={16}/> Ganancia real del mes</>} value={`$${gananciaMes.toFixed(2)}`}/>
      <Metric label={<><Wallet size={16}/> Gastos del mes</>} value={`$${gastosDelMes.toFixed(2)}`} onClick={()=>setVista("finanzas")}/>
      <Metric label={<><ReceiptText size={16}/> Por cobrar</>} value={`$${porCobrar.toFixed(2)}`} onClick={()=>setVista("paqueteria")}/>
    </div><p style={{opacity:.65,marginTop:-6}}>Histórico: facturado <b>${facturacionHistorica.toFixed(2)}</b> · ganancia <b>${gananciaHistorica.toFixed(2)}</b> · gastos <b>${gastosHistoricos.toFixed(2)}</b></p>

    <h3 className="mt-16">Operación actual</h3><div className="grid-4">
      <Metric label={<><Package size={16}/> Envíos activos</>} value={trackingsActivos.length} onClick={()=>setVista("paqueteria")}/>
      <Metric label={<><AlertCircle size={16}/> Prealertas</>} value={prealertasPendientes.length} onClick={()=>irAPrealertas()}/>
      <Metric label={<><Clock size={16}/> Recibos activos</>} value={recibosActivos.length} onClick={()=>setVista("paqueteria")}/>
      <Metric label={<><Warehouse size={16}/> Bodega OEX</>} value={enBodegaOEX.length}/>
    </div>

    <div className="grid-2 mt-16"><div className="card" style={{borderLeft:"4px solid #F4562D"}}><h3><AlertCircle size={18}/> Atención requerida</h3><div className="list mt-16">
      <div className="row-card" role="button" onClick={()=>irAPrealertas()} style={{cursor:"pointer"}}><div><b>Prealertas sin revisar</b><p>Confirmar datos antes de ingresarlas a operación.</p></div><b>{prealertasPendientes.length}</b></div>
      <div className="row-card"><div><b>Paquetes listos para retirar</b><p>En Bodega OEX esperando gestión.</p></div><b>{enBodegaOEX.length}</b></div>
      <div className="row-card" role="button" onClick={()=>setVista("paqueteria")} style={{cursor:"pointer"}}><div><b>Recibos con saldo pendiente</b><p>Total pendiente: ${porCobrar.toFixed(2)}</p></div><b>{saldosPendientes.length}</b></div>
    </div></div>
    <div className="card"><h3><Warehouse size={18}/> Bodega OEX</h3><div style={{display:"flex",gap:24,flexWrap:"wrap",marginTop:14}}><div><small>Paquetes</small><div style={{fontSize:"1.7rem",fontWeight:800}}>{enBodegaOEX.length}</div></div><div><small>Libras</small><div style={{fontSize:"1.7rem",fontWeight:800}}>{librasBodega.toFixed(1)} lb</div></div><div><small>Costo estimado</small><div style={{fontSize:"1.7rem",fontWeight:800}}>${montoBodega.toFixed(2)}</div></div></div><div className="grid-2 mt-16"><div className="metric"><b>Ometepe</b><span className="metric-value">{bodegaOmetepe.length}</span><small>{bodegaOmetepe.reduce((a,t)=>a+numero(t.peso),0).toFixed(1)} lb</small></div><div className="metric"><b>Managua</b><span className="metric-value">{bodegaManagua.length}</span><small>{bodegaManagua.reduce((a,t)=>a+numero(t.peso),0).toFixed(1)} lb</small></div></div></div></div>

    <h3 className="mt-16">Clientes y volumen</h3><div className="grid-4"><div className="metric"><b><Weight size={15}/> Libras del mes</b><span className="metric-value">{librasMes.toFixed(1)} lb</span><small>{librasHistoricas.toFixed(1)} lb históricas</small></div><div className="metric"><b><Users size={15}/> Clientes del mes</b><span className="metric-value">{clientesMes}</span></div><div className="metric"><b>Top por libras</b><span className="metric-value" style={{fontSize:"1.05rem"}}>{rankingClientes.libras?.nombre||"—"}</span><small>{rankingClientes.libras?`${rankingClientes.libras.libras.toFixed(1)} lb`:"Sin datos"}</small></div><div className="metric"><b>Top por facturación</b><span className="metric-value" style={{fontSize:"1.05rem"}}>{rankingClientes.monto?.nombre||"—"}</span><small>{rankingClientes.monto?`$${rankingClientes.monto.monto.toFixed(2)}`:"Sin datos"}</small></div></div>

    <div className="card mt-16"><h3>Actividad reciente</h3><div className="list mt-16">{ultimos.map((u,i)=><div className="row-card" key={`${u.id||u.numero||i}-${i}`}><div><b>{u.numero||u.tracking||"Registro"}</b><p>{u.cliente||"—"} · {u.tipo}</p></div><span className="badge badge-neutral">{u.estado||"Registrado"}</span></div>)}{ultimos.length===0&&<p>Sin actividad reciente.</p>}</div></div>
    <SeguimientoClientes envios={envios} empresa={empresa} cuentasDinero={cuentasDinero} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos}/>
  </div>;
}
