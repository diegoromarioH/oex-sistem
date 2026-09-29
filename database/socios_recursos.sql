create table public.socios_recursos (
id uuid primary key default gen_random_uuid(), titulo text not null check(length(trim(titulo)) between 1 and 150),
descripcion text not null default '', tipo text not null check(tipo in ('banner','guia','reglamento','otro')),
archivo_path text not null unique, nombre_archivo text not null, activo boolean not null default true,
creado_en timestamptz not null default now());
alter table public.socios_recursos enable row level security;
grant select on public.socios_recursos to anon, authenticated;
grant insert, update, delete on public.socios_recursos to authenticated;
create policy recursos_publicados on public.socios_recursos for select to anon,authenticated using(activo);
create policy recursos_personal on public.socios_recursos for all to authenticated
using(exists(select 1 from public.usuarios where id=auth.uid() and rol in ('admin','operador')))
with check(exists(select 1 from public.usuarios where id=auth.uid() and rol in ('admin','operador')));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('socios-recursos','socios-recursos',false,10485760,array['application/pdf','image/png','image/jpeg','image/webp']);
create policy recursos_archivos_publicados on storage.objects for select to anon,authenticated
using(bucket_id='socios-recursos' and exists(select 1 from public.socios_recursos where archivo_path=name and activo));
create policy recursos_archivos_personal on storage.objects for all to authenticated
using(bucket_id='socios-recursos' and exists(select 1 from public.usuarios where id=auth.uid() and rol in ('admin','operador')))
with check(bucket_id='socios-recursos' and exists(select 1 from public.usuarios where id=auth.uid() and rol in ('admin','operador')));