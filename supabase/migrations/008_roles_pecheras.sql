-- =====================================================================
-- Dos usuarios en vez de un PIN por posta, y control de pecheras.
-- Pegar en el SQL Editor y correr. Se puede correr dos veces.
-- Al final muestra los dos PIN nuevos: anotalos.
--
--   coordinador  todo lo del servicio + entrega y devolución de pecheras
--                (busca por DNI) + cargar la planilla.
--   servicio     presente, viandas, ayudas, dónde están.
--
-- DNI: entra a la app solo para que el coordinador encuentre a cada uno en la
-- parroquia. Lo ve únicamente el coordinador (padron_completo lo devuelve
-- vacío para el servicio y la vista pública "padron" no lo tiene).
--
-- Pecheras: dos "postas" más que no son lugares, igual que las viandas:
--   'pechera'  se la entregamos (y con eso, llegó a salir)
--   'devuelta' la devolvió al subir al micro de vuelta
-- pechera_ok: la planilla dice que ya la había retirado antes del día.
-- =====================================================================

create table if not exists roles (
  id  text primary key check (id in ('coordinador','servicio')),
  pin text not null
);
alter table roles enable row level security;
revoke all on roles from anon, authenticated;

insert into roles (id, pin) values
  ('coordinador', lpad((floor(random()*1000000))::int::text, 6, '0')),
  ('servicio',    lpad((floor(random()*10000))::int::text, 4, '0'))
on conflict (id) do nothing;

alter table sesiones alter column posta drop not null;
alter table sesiones add column if not exists rol text;

alter table peregrinos add column if not exists dni        text;
alter table peregrinos add column if not exists pechera_ok boolean not null default false;

insert into postas (id, orden, nombre, pin) values
  ('pechera',  91, 'Pechera entregada', lpad((floor(random()*10000))::int::text, 4, '0')),
  ('devuelta', 92, 'Pechera devuelta',  lpad((floor(random()*10000))::int::text, 4, '0'))
on conflict (id) do nothing;

-- Sigue valiendo para todos los controles "¿tiene sesión?". Devuelve el rol
-- (o la posta, para las sesiones viejas por posta).
create or replace function posta_de_token(p_token text)
returns text
language sql security definer stable set search_path = public as $fn$
  select coalesce(rol, posta) from sesiones where token = p_token and expira_en > now();
$fn$;

create or replace function rol_de_token(p_token text)
returns text
language sql security definer stable set search_path = public as $fn$
  select coalesce(rol, 'servicio') from sesiones where token = p_token and expira_en > now();
$fn$;

create or replace function abrir_rol(p_rol text, p_pin text)
returns text
language plpgsql security definer set search_path = public, extensions as $fn$
declare v_token text;
begin
  if not exists (select 1 from roles where id = p_rol and pin = p_pin) then
    perform pg_sleep(0.5);
    raise exception 'PIN incorrecto' using errcode = '42501';
  end if;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into sesiones (token, posta, rol) values (v_token, null, p_rol);
  return v_token;
end;
$fn$;

-- El padrón con teléfonos para el equipo. El DNI, solo para el coordinador.
drop function if exists padron_completo(text);
create function padron_completo(p_token text)
returns table (
  numero int, apellido text, nombre text, micro text, tel text, tel_emerg text,
  tramo text, es_equipo boolean, nota text, activo boolean, comida text,
  salida_ok boolean, dni text, pechera_ok boolean
)
language plpgsql security definer set search_path = public as $fn$
declare v_rol text := rol_de_token(p_token);
begin
  if v_rol is null then
    raise exception 'Se necesita sesión de responsable' using errcode = '42501';
  end if;
  return query
    select p.numero, p.apellido, p.nombre, p.micro, p.tel, p.tel_emerg, p.tramo,
           p.es_equipo, p.nota, p.activo, p.comida, p.salida_ok,
           case when v_rol = 'coordinador' then p.dni end,
           p.pechera_ok
      from peregrinos p order by p.numero;
end;
$fn$;

-- Cargar la planilla: solo el coordinador. Reemplaza por número; quien ya no
-- está en la planilla queda inactivo (no se borra: sus marcas siguen valiendo).
create or replace function importar_padron(p_token text, p_filas jsonb)
returns int
language plpgsql security definer set search_path = public as $fn$
declare v_n int;
begin
  if rol_de_token(p_token) is distinct from 'coordinador' then
    raise exception 'Solo el equipo coordinador puede cargar la planilla (sesión)' using errcode = '42501';
  end if;

  insert into peregrinos (numero, apellido, nombre, micro, tel, tel_emerg,
                          tramo, es_equipo, nota, activo, comida, salida_ok, dni, pechera_ok)
  select distinct on ((f->>'numero')::int)
         (f->>'numero')::int,
         f->>'apellido',
         coalesce(f->>'nombre',''),
         nullif(f->>'micro',''),
         nullif(f->>'tel',''),
         nullif(f->>'tel_emerg',''),
         coalesce(nullif(f->>'tramo',''),'completo'),
         coalesce((f->>'es_equipo')::boolean,false),
         nullif(f->>'nota',''),
         coalesce((f->>'activo')::boolean,true),
         nullif(f->>'comida',''),
         coalesce((f->>'salida_ok')::boolean,false),
         nullif(f->>'dni',''),
         coalesce((f->>'pechera_ok')::boolean,false)
  from jsonb_array_elements(p_filas) f
  order by (f->>'numero')::int
  on conflict (numero) do update
     set apellido   = excluded.apellido,
         nombre     = excluded.nombre,
         micro      = excluded.micro,
         tel        = excluded.tel,
         tel_emerg  = excluded.tel_emerg,
         es_equipo  = excluded.es_equipo,
         nota       = excluded.nota,
         activo     = excluded.activo,
         comida     = excluded.comida,
         dni        = excluded.dni,
         pechera_ok = excluded.pechera_ok or peregrinos.pechera_ok,
         tramo      = case when excluded.salida_ok or excluded.tramo = 'solo_vuelta'
                           then excluded.tramo else peregrinos.tramo end,
         salida_ok  = excluded.salida_ok or peregrinos.salida_ok;

  get diagnostics v_n = row_count;

  -- solo cuando se carga una planilla real (no las pruebas, que van del 99000 para arriba)
  if exists (select 1 from jsonb_array_elements(p_filas) f where (f->>'numero')::int < 99000) then
    update peregrinos set activo = false
     where numero < 99000
       and numero not in (select (f->>'numero')::int from jsonb_array_elements(p_filas) f);
  end if;

  return v_n;
end;
$fn$;

grant execute on function abrir_rol(text,text)        to anon, authenticated;
grant execute on function padron_completo(text)       to anon, authenticated;
grant execute on function importar_padron(text,jsonb) to anon, authenticated;
revoke execute on function rol_de_token(text) from anon, authenticated;

select id as "usuario", pin as "PIN — anotalo" from roles order by id;
