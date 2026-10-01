-- =====================================================================
-- Ubicación en los pedidos de ayuda.
--
-- Va en una tabla aparte y NO en avisos, porque avisos se lee con la clave
-- pública (la que va adentro de la app). La ubicación de una persona solo
-- la ve el equipo, con sesión de PIN.
-- Pegar en el SQL Editor y correr. Se puede correr dos veces.
-- =====================================================================

create table if not exists aviso_ubicaciones (
  aviso       uuid primary key references avisos(id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  precision_m int,
  tomada_en   timestamptz not null
);

alter table aviso_ubicaciones enable row level security;
revoke all on aviso_ubicaciones from anon, authenticated;

-- crear_avisos ahora también guarda la ubicación si vino
create or replace function crear_avisos(p_avisos jsonb)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  insert into avisos (id, peregrino, tipo, desde_posta, creado_en)
  select distinct on ((a->>'id')::uuid)
         (a->>'id')::uuid,
         (a->>'peregrino')::int,
         a->>'tipo',
         nullif(a->>'desde_posta',''),
         (a->>'creado_en')::timestamptz
  from jsonb_array_elements(p_avisos) a
  order by (a->>'id')::uuid
  on conflict (id) do nothing;

  insert into aviso_ubicaciones (aviso, lat, lng, precision_m, tomada_en)
  select distinct on ((a->>'id')::uuid)
         (a->>'id')::uuid,
         (a->>'lat')::double precision,
         (a->>'lng')::double precision,
         (a->>'precision_m')::int,
         coalesce((a->>'ubic_en')::timestamptz, (a->>'creado_en')::timestamptz)
  from jsonb_array_elements(p_avisos) a
  where a->>'lat' is not null and a->>'lng' is not null
  order by (a->>'id')::uuid
  on conflict (aviso) do nothing;
end;
$fn$;

-- solo el equipo
create or replace function ubicaciones_avisos(p_token text)
returns setof aviso_ubicaciones
language plpgsql security definer set search_path = public as $fn$
begin
  if posta_de_token(p_token) is null then
    raise exception 'Se necesita sesión de responsable' using errcode = '42501';
  end if;
  return query select * from aviso_ubicaciones;
end;
$fn$;

grant execute on function crear_avisos(jsonb)         to anon, authenticated;
grant execute on function ubicaciones_avisos(text)    to anon, authenticated;
