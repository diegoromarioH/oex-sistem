-- Internal OEX staff only. All financial mutations use atomic invoker RPCs.
alter table public.envios add column entregado_en timestamptz;
create function public.oex_fecha_entrega_socio() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.estado='Entregado' and (tg_op='INSERT' or old.estado is distinct from 'Entregado') then new.entregado_en=now();
  elsif new.estado is distinct from 'Entregado' then new.entregado_en=null;
  else new.entregado_en=old.entregado_en; end if;
  return new;
end $$;
revoke all on function public.oex_fecha_entrega_socio() from public,anon;
create trigger oex_fecha_entrega_socio before insert or update on public.envios for each row execute function public.oex_fecha_entrega_socio();

insert into public.cuentas_contables(codigo,nombre,tipo,naturaleza,cuenta_padre_id)
values ('6080','Comisiones de recomendaciones','gasto','deudora',(select id from public.cuentas_contables where codigo='6000')),
       ('2020','Comisiones por pagar a socios','pasivo','acreedora',(select id from public.cuentas_contables where codigo='2000'));

create table public.socios_retiros(
 id bigint generated always as identity primary key,
 socio_id bigint not null references public.socios_recomendacion(id),
 numero text unique,
 socio_nombre text not null,
 banco text, moneda_destino text, numero_cuenta text,
 monto_usd numeric(14,2) not null check(monto_usd>0),
 estado text not null default 'pendiente' check(estado in ('pendiente','pagado','anulado')),
 creado_en timestamptz not null default now(), creado_por uuid not null references auth.users(id),
 pagado_en timestamptz, fecha_pago date, cuenta_dinero_id bigint references public.cuentas_dinero(id),
 moneda_pago text check(moneda_pago in ('USD','NIO')), monto_cuenta numeric(14,2), tasa_cambio numeric,
 referencia text, comprobante_url text, motivo_anulacion text,
 gestionado_por uuid references auth.users(id),
 asiento_obligacion_id bigint references public.asientos_contables(id),
 asiento_pago_id bigint references public.asientos_contables(id),
 asiento_anulacion_id bigint references public.asientos_contables(id)
);
create table public.socios_retiros_detalle(
 id bigint generated always as identity primary key,
 retiro_id bigint not null references public.socios_retiros(id),
 envio_id bigint not null references public.envios(id),
 numero_envio text not null, cliente text, periodo text not null,
 utilidad numeric not null, porcentaje numeric not null,
 comision numeric(14,2) not null check(comision>0),
 entrega timestamptz not null, activo boolean not null default true,
 unique(retiro_id,envio_id)
);
create unique index socios_comision_un_retiro on public.socios_retiros_detalle(envio_id) where activo;
create index socios_retiros_socio on public.socios_retiros(socio_id);
create index socios_retiros_detalle_retiro on public.socios_retiros_detalle(retiro_id);
alter table public.socios_retiros enable row level security;
alter table public.socios_retiros_detalle enable row level security;
create policy personal_oex_retiros on public.socios_retiros for all to authenticated
 using(exists(select 1 from public.usuarios where id=(select auth.uid()) and rol in ('admin','operador')))
 with check(exists(select 1 from public.usuarios where id=(select auth.uid()) and rol in ('admin','operador')));
create policy personal_oex_retiros_detalle on public.socios_retiros_detalle for all to authenticated
 using(exists(select 1 from public.usuarios where id=(select auth.uid()) and rol in ('admin','operador')))
 with check(exists(select 1 from public.usuarios where id=(select auth.uid()) and rol in ('admin','operador')));
revoke all on public.socios_retiros,public.socios_retiros_detalle from anon;
grant select,insert,update on public.socios_retiros,public.socios_retiros_detalle to authenticated;
grant usage,select on sequence public.socios_retiros_id_seq,public.socios_retiros_detalle_id_seq to authenticated;

create view public.socios_comisiones with(security_invoker=true) as
with base as (
 select s.id socio_id,e.id envio_id,e.numero_envios,e.cliente,e.fecha,e.estado,e.total,e.saldo,e.costo_interno_total,
 e.ganancia_real utilidad,s.porcentaje_utilidad porcentaje,
 round(greatest(coalesce(e.ganancia_real,0),0)*s.porcentaje_utilidad/100,2) comision,
 coalesce(e.entregado_en,a.entrega) entrega
 from public.socios_recomendacion s join public.clientes c on c.socio_recomendacion_id=s.id
 join public.envios e on e.cliente_id=c.id and e.fecha>=c.recomendacion_fecha
 left join lateral(select max(created_at) entrega from public.audit_log
 where modulo='Paquetería' and registro_codigo=e.numero_envios and
 (accion='Saldó y entregó envío' or (accion='Cambió estado' and detalle ~ '→ Entregado( ·|$)'))) a on true
), maduras as (
 select *,entrega+interval '72 hours' madura,
 to_char(date_trunc('month',(entrega+interval '72 hours') at time zone 'America/Managua')+interval '1 month','YYYY-MM') periodo
 from base
)
select m.*,d.retiro_id,r.numero retiro_numero,
case when r.estado='pagado' then 'pagado' when r.estado='pendiente' then 'pendiente'
 when m.estado is distinct from 'Entregado' or coalesce(m.saldo,0)>0.005 then 'curso'
 when m.entrega is null or m.utilidad is null or m.costo_interno_total is null or now()<m.madura then 'revision'
 else 'disponible' end estado_comision
from maduras m left join public.socios_retiros_detalle d on d.envio_id=m.envio_id and d.activo
left join public.socios_retiros r on r.id=d.retiro_id;
revoke all on public.socios_comisiones from anon;
grant select on public.socios_comisiones to authenticated;

create function public.solicitar_retiro_socio(p_socio_id bigint,p_envios bigint[],p_total_esperado numeric)
returns bigint language plpgsql security invoker set search_path='' as $$
declare s public.socios_recomendacion; v_id bigint; v_total numeric; v_count int; v_asiento bigint; v_gasto bigint; v_pasivo bigint; v_nombre text;
begin
 select nombre into v_nombre from public.usuarios where id=auth.uid() and rol in ('admin','operador');
 if not found then raise exception 'No tienes permiso para solicitar retiros.'; end if;
 select * into s from public.socios_recomendacion where id=p_socio_id for update;
 if not found then raise exception 'Socio no encontrado.'; end if;
 if p_envios is null or cardinality(p_envios)=0 then raise exception 'Selecciona comisiones disponibles.'; end if;
 perform 1 from public.envios where id=any(p_envios) order by id for update;
 select sum(comision),count(*) into v_total,v_count from public.socios_comisiones
 where socio_id=p_socio_id and envio_id=any(p_envios) and estado_comision='disponible' and comision>0;
 if v_count<>cardinality(p_envios) or v_total is null or v_total<>p_total_esperado then
 raise exception 'Las comisiones cambiaron o ya tienen una solicitud. Actualiza y vuelve a intentar.'; end if;
 select id into v_gasto from public.cuentas_contables where codigo='6080' and activa;
 select id into v_pasivo from public.cuentas_contables where codigo='2020' and activa;
 if v_gasto is null or v_pasivo is null then raise exception 'Faltan cuentas contables para comisiones.'; end if;
 insert into public.socios_retiros(socio_id,socio_nombre,banco,moneda_destino,numero_cuenta,monto_usd,creado_por)
 values(s.id,s.nombre,s.banco,s.moneda_cuenta,s.numero_cuenta,v_total,auth.uid()) returning id into v_id;
 update public.socios_retiros set numero='SOC-'||lpad(v_id::text,6,'0') where id=v_id;
 insert into public.socios_retiros_detalle(retiro_id,envio_id,numero_envio,cliente,periodo,utilidad,porcentaje,comision,entrega)
 select v_id,envio_id,numero_envios,cliente,periodo,utilidad,porcentaje,comision,entrega from public.socios_comisiones
 where socio_id=p_socio_id and envio_id=any(p_envios);
 insert into public.asientos_contables(descripcion,origen_modulo,origen_id,created_by,created_by_name)
 values('Comisión por pagar SOC-'||lpad(v_id::text,6,'0')||' · '||s.nombre,'socios_obligacion',v_id::text,auth.uid(),v_nombre) returning id into v_asiento;
 insert into public.movimientos_contables(asiento_id,cuenta_contable_id,debe,haber)
 values(v_asiento,v_gasto,v_total,0),(v_asiento,v_pasivo,0,v_total);
 update public.socios_retiros set asiento_obligacion_id=v_asiento where id=v_id;
 insert into public.audit_log(user_id,user_name,accion,modulo,registro_id,registro_codigo,detalle)
 values(auth.uid(),v_nombre,'Solicitó retiro de socio','Finanzas',v_id::text,'SOC-'||lpad(v_id::text,6,'0'),'Obligación USD '||v_total);
 return v_id;
end $$;

create function public.gestionar_retiro_socio(p_retiro_id bigint,p_accion text,p_cuenta_id bigint default null,p_fecha date default null,p_tasa numeric default null,p_referencia text default null,p_comprobante text default null,p_motivo text default null)
returns void language plpgsql security invoker set search_path='' as $$
declare r public.socios_retiros; c public.cuentas_dinero; v_nombre text; v_asiento bigint; v_pasivo bigint; v_gasto bigint; v_banco bigint; v_monto numeric; v_linea record;
begin
 select nombre into v_nombre from public.usuarios where id=auth.uid() and rol in ('admin','operador');
 if not found then raise exception 'No tienes permiso para gestionar retiros.'; end if;
 select * into r from public.socios_retiros where id=p_retiro_id for update;
 if not found or r.estado<>'pendiente' then raise exception 'La solicitud ya fue gestionada o no existe.'; end if;
 if p_accion='anular' then
  if length(trim(coalesce(p_motivo,'')))<3 then raise exception 'Indica el motivo de anulación.'; end if;
  insert into public.asientos_contables(descripcion,origen_modulo,origen_id,created_by,created_by_name)
  values('Anulación '||r.numero||' · '||p_motivo,'socios_anulacion',r.id::text,auth.uid(),v_nombre) returning id into v_asiento;
  insert into public.movimientos_contables(asiento_id,cuenta_contable_id,debe,haber)
  select v_asiento,cuenta_contable_id,haber,debe from public.movimientos_contables where asiento_id=r.asiento_obligacion_id;
  update public.socios_retiros set estado='anulado',motivo_anulacion=p_motivo,gestionado_por=auth.uid(),asiento_anulacion_id=v_asiento where id=r.id;
  update public.socios_retiros_detalle set activo=false where retiro_id=r.id;
 elsif p_accion='pagar' then
  if p_fecha is null or p_fecha>(now() at time zone 'America/Managua')::date or p_fecha<(r.creado_en at time zone 'America/Managua')::date then raise exception 'Fecha de pago inválida.'; end if;
  if extract(day from p_fecha)>5 then raise exception 'Los pagos a socios se registran del 1 al 5 de cada mes.'; end if;
  if exists(select 1 from public.socios_retiros_detalle where retiro_id=r.id and periodo>to_char(p_fecha,'YYYY-MM')) then raise exception 'El corte aún no llegó a su período de pago.'; end if;
  if length(trim(coalesce(p_referencia,'')))<3 then raise exception 'Indica la referencia del pago.'; end if;
  -- Lock the source receipts so refunds cannot race a payment.
  perform 1 from public.envios where id in (select envio_id from public.socios_retiros_detalle where retiro_id=r.id) order by id for update;
  -- Revalidate the receipt after refunds, cost edits, or changed delivery state.
  if exists(select 1 from public.socios_retiros_detalle d left join public.envios e on e.id=d.envio_id where d.retiro_id=r.id and
   (e.estado is distinct from 'Entregado' or coalesce(e.saldo,0)>0.005 or e.ganancia_real is distinct from d.utilidad or (e.entregado_en is not null and e.entregado_en is distinct from d.entrega))) then raise exception 'Un recibo cambió. Anula la solicitud y revisa las comisiones.'; end if;
  select * into c from public.cuentas_dinero where id=p_cuenta_id and activa for update;
  if not found then raise exception 'Selecciona una cuenta activa.'; end if;
  if c.moneda not in ('USD','NIO') then raise exception 'Moneda de cuenta no compatible.'; end if;
  if c.moneda='NIO' and (p_tasa is null or p_tasa<=0) then raise exception 'Indica un tipo de cambio mayor a cero.'; end if;
  v_monto=round(r.monto_usd*case when c.moneda='NIO' then p_tasa else 1 end,2);
  if coalesce(c.saldo_actual,0)<v_monto then raise exception 'Saldo insuficiente en la cuenta de origen.'; end if;
  select id into v_pasivo from public.cuentas_contables where codigo='2020' and activa;
  v_banco=c.cuenta_contable_id;
  if v_banco is null then select id into v_banco from public.cuentas_contables where codigo=case when c.tipo='banco' then '1020' else '1010' end and activa; end if;
  if v_banco is null or v_pasivo is null then raise exception 'Faltan cuentas contables.'; end if;
  insert into public.asientos_contables(fecha,descripcion,origen_modulo,origen_id,created_by,created_by_name)
  values((p_fecha::timestamp+interval '12 hours') at time zone 'America/Managua','Pago '||r.numero||' · '||r.socio_nombre,'socios_pago',r.id::text,auth.uid(),v_nombre) returning id into v_asiento;
  insert into public.movimientos_contables(asiento_id,cuenta_contable_id,cuenta_dinero_id,debe,haber)
  values(v_asiento,v_pasivo,null,r.monto_usd,0),(v_asiento,v_banco,c.id,0,r.monto_usd);
  update public.cuentas_dinero set saldo_actual=saldo_actual-v_monto where id=c.id;
  update public.socios_retiros set estado='pagado',pagado_en=now(),fecha_pago=p_fecha,cuenta_dinero_id=c.id,
   moneda_pago=c.moneda,monto_cuenta=v_monto,tasa_cambio=case when c.moneda='NIO' then p_tasa else 1 end,
   referencia=trim(p_referencia),comprobante_url=nullif(trim(p_comprobante),''),gestionado_por=auth.uid(),asiento_pago_id=v_asiento where id=r.id;
 else raise exception 'Acción inválida.'; end if;
 insert into public.audit_log(user_id,user_name,accion,modulo,registro_id,registro_codigo,detalle)
 values(auth.uid(),v_nombre,case when p_accion='pagar' then 'Pagó retiro de socio' else 'Anuló retiro de socio' end,'Finanzas',r.id::text,r.numero,'USD '||r.monto_usd||' · '||coalesce(p_referencia,p_motivo,''));
end $$;
revoke all on function public.solicitar_retiro_socio(bigint,bigint[],numeric) from public,anon;
revoke all on function public.gestionar_retiro_socio(bigint,text,bigint,date,numeric,text,text,text) from public,anon;
grant execute on function public.solicitar_retiro_socio(bigint,bigint[],numeric) to authenticated;
grant execute on function public.gestionar_retiro_socio(bigint,text,bigint,date,numeric,text,text,text) to authenticated;
