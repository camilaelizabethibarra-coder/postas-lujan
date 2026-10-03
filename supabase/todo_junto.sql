-- =====================================================================
-- TODAS LAS MIGRACIONES JUNTAS (001 a 008), para una base nueva.
-- Pegar entero en el SQL Editor de Supabase y correr una sola vez.
-- Al final muestra los dos PIN: coordinador y servicio. Anotalos.
-- =====================================================================


-- >>>>>>>>>>>>>>>>>>>> 001_esquema.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Postas — Peregrinación a Luján, 3 de octubre de 2026
-- Esquema inicial. Pegar entero en el SQL Editor de Supabase y correr.
--
-- Dos reglas gobiernan todo esto:
--   1. Una fila por marca, y gana la más reciente por (peregrino, posta).
--      Nunca se pisa el estado completo de una posta.
--   2. Nada sensible. Sin DNI, sin pagos, sin restricciones alimentarias.
--
-- El cliente no escribe en las tablas: escribe llamando a las funciones
-- del final, que son las que validan. La clave anon es pública, así que
-- todo lo que se pueda hacer con ella tiene que ser inofensivo.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- postas
-- ---------------------------------------------------------------------
create table if not exists postas (
  id     text primary key,               -- po1..po5
  orden  int  not null unique,
  nombre text not null,
  pin    text not null                   -- nunca sale al cliente (ver vista postas_publicas)
);

-- ---------------------------------------------------------------------
-- peregrinos
--
-- tramo: 'completo'     hace toda la peregrinación
--        'solo_vuelta'  solo sube al micro en Luján (posta 5).
--                       Sin esto figuraría como faltante todo el día en
--                       las cuatro primeras postas y ensuciaría la vista
--                       "Dónde están" con una alarma falsa permanente.
-- activo: para quien al final no viaja, sin borrarlo del padrón.
-- ---------------------------------------------------------------------
create table if not exists peregrinos (
  numero    int  primary key,
  apellido  text not null,
  nombre    text not null,
  micro     text,
  tel       text,
  tel_emerg text,
  tramo     text not null default 'completo'
            check (tramo in ('completo','solo_vuelta')),
  es_equipo boolean not null default false,
  nota      text,                        -- "sale desde Liniers", etc.
  activo    boolean not null default true
);

-- ---------------------------------------------------------------------
-- marcas — el corazón del asunto
--
-- marcado_en es la hora del DISPOSITIVO que marcó, no la del servidor.
-- Es lo único que permite ordenar marcas que estuvieron horas en la cola
-- de un celular sin señal. El cliente corrige su reloj contra el servidor
-- la primera vez que puede, así un celular con la hora corrida no
-- reordena las marcas de los demás.
--
-- Desmarcar NO borra la fila: escribe presente=false con marcado_en nuevo.
-- Si se borrara, una marca vieja subiendo desde otra cola la resucitaría.
-- ---------------------------------------------------------------------
create table if not exists marcas (
  peregrino  int  not null references peregrinos(numero) on delete cascade,
  posta      text not null references postas(id)         on delete cascade,
  presente   boolean not null default true,
  via        text not null check (via in ('resp','peregrino')),
  marcado_en timestamptz not null,
  subido_en  timestamptz not null default now(),
  primary key (peregrino, posta)
);

-- para que un celular que estuvo sin señal pida solo lo que cambió
create index if not exists marcas_subido_en_idx on marcas (subido_en);

-- ---------------------------------------------------------------------
-- avisos — "no puedo seguir" y "necesito ayuda"
--
-- El id lo genera el celular, no la base. Así un aviso que se encoló sin
-- señal y se reintenta tres veces entra una sola vez.
-- ---------------------------------------------------------------------
create table if not exists avisos (
  id          uuid primary key,
  peregrino   int  not null references peregrinos(numero) on delete cascade,
  tipo        text not null check (tipo in ('bajo','ayuda')),
  desde_posta text references postas(id),
  creado_en   timestamptz not null,
  subido_en   timestamptz not null default now(),
  resuelto    boolean not null default false,
  resuelto_en timestamptz
);

create index if not exists avisos_subido_en_idx on avisos (subido_en);

-- ---------------------------------------------------------------------
-- sesiones de responsable
-- El PIN se cambia por un token de 30 días para no tenerlo dando vueltas
-- guardado en el celular.
-- ---------------------------------------------------------------------
create table if not exists sesiones (
  token     text primary key,
  posta     text not null references postas(id) on delete cascade,
  creada_en timestamptz not null default now(),
  expira_en timestamptz not null default now() + interval '30 days'
);

-- =====================================================================
-- Permisos
--
-- anon no toca ninguna tabla directamente. Lee dos vistas que no tienen
-- teléfonos ni PIN, y escribe solo llamando a las funciones de abajo.
-- =====================================================================

alter table postas     enable row level security;
alter table peregrinos enable row level security;
alter table marcas     enable row level security;
alter table avisos     enable row level security;
alter table sesiones   enable row level security;

revoke all on postas, peregrinos, marcas, avisos, sesiones from anon, authenticated;

-- Las marcas son números y horarios: sin nombres, sin teléfonos.
-- Cualquiera con el link las puede leer, que es lo que hace que la app
-- funcione sin que el peregrino tenga que registrarse.
drop policy if exists marcas_lectura on marcas;
drop policy if exists avisos_lectura on avisos;
create policy marcas_lectura on marcas for select to anon, authenticated using (true);
create policy avisos_lectura on avisos for select to anon, authenticated using (true);
grant select on marcas, avisos to anon, authenticated;

-- Vistas: lo único del padrón y de las postas que ve el público.
-- Corren con los permisos del dueño y por eso pueden leer las tablas
-- protegidas. Es lo que deja publicar apellido y nombre sin publicar
-- teléfonos ni PIN. No cambiar a security_invoker.
create or replace view postas_publicas as
  select id, orden, nombre from postas;

create or replace view padron as
  select numero, apellido, nombre, micro, tramo, es_equipo, nota, activo
  from peregrinos;

grant select on postas_publicas, padron to anon, authenticated;

-- =====================================================================
-- Funciones
-- =====================================================================

-- --------- sesión de responsable ---------

create or replace function posta_de_token(p_token text)
returns text
language sql security definer stable set search_path = public as $fn$
  select posta from sesiones where token = p_token and expira_en > now();
$fn$;

create or replace function abrir_posta(p_posta text, p_pin text)
returns text
language plpgsql security definer set search_path = public, extensions as $fn$
declare v_token text;
begin
  if not exists (select 1 from postas where id = p_posta and pin = p_pin) then
    perform pg_sleep(0.5);          -- freno mínimo a probar PIN a mano
    raise exception 'PIN incorrecto' using errcode = '42501';
  end if;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into sesiones (token, posta) values (v_token, p_posta);
  return v_token;
end;
$fn$;

-- --------- marcar ---------
--
-- Acá vive la regla de conflictos. Tres cosas que parecen detalle y no lo son:
--
--   1. "where excluded.marcado_en > mm.marcado_en": una marca vieja que sube
--      tarde desde una cola offline no pisa una más nueva. Un upsert común
--      de PostgREST no permite condicionar el do update, y por eso esto es
--      una función y no un .upsert() desde el cliente.
--
--   2. "distinct on": la cola de un celular puede traer la misma persona dos
--      veces (marcó, desmarcó, volvió a marcar). Postgres rechaza un
--      on conflict que toque la misma fila dos veces en el mismo insert.
--      Nos quedamos con la más reciente de cada par (peregrino, posta).
--
--   3. via='resp' exige sesión. Si no, cualquiera con el link podría mandar
--      marcas que se ven como confirmadas por un responsable y los dos
--      niveles de confianza dejarían de significar nada.
--
-- Devuelve las que efectivamente aplicó. Las que no vuelven es porque había
-- una más nueva (o una confirmación que el peregrino no puede tapar): para el
-- celular eso también es "listo, sacala de la cola".

create or replace function marcar_lote(p_token text, p_marcas jsonb)
returns table (peregrino int, posta text)
language plpgsql security definer set search_path = public as $fn$
#variable_conflict use_column
begin
  if exists (select 1 from jsonb_array_elements(p_marcas) m where m->>'via' = 'resp')
     and posta_de_token(p_token) is null then
    raise exception 'Se necesita sesión de responsable para marcar como confirmado'
      using errcode = '42501';
  end if;

  return query
  insert into marcas as mm (peregrino, posta, presente, via, marcado_en)
  select distinct on ((m->>'peregrino')::int, m->>'posta')
         (m->>'peregrino')::int,
         m->>'posta',
         coalesce((m->>'presente')::boolean, true),
         m->>'via',
         (m->>'marcado_en')::timestamptz
  from jsonb_array_elements(p_marcas) m
  order by (m->>'peregrino')::int, m->>'posta', (m->>'marcado_en')::timestamptz desc
  on conflict (peregrino, posta) do update
     set presente   = excluded.presente,
         via        = excluded.via,
         marcado_en = excluded.marcado_en,
         subido_en  = now()
   where excluded.marcado_en > mm.marcado_en
     -- 4. Lo que declara el peregrino no tapa lo que confirmó el responsable.
     --    Sin esto, un "Llegué" apretado tarde bajaría una marca confirmada
     --    a declarada, y un "Me equivoqué" la borraría. Si el responsable
     --    desmarcó (presente=false), el peregrino sí puede volver a declarar.
     --    La misma regla vive en src/lib/regla.ts para la vista local.
     and not (mm.via = 'resp' and mm.presente and excluded.via = 'peregrino')
  returning mm.peregrino, mm.posta;
end;
$fn$;

-- --------- avisos ---------

create or replace function crear_avisos(p_avisos jsonb)
returns void
language sql security definer set search_path = public as $fn$
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
$fn$;

create or replace function resolver_aviso(p_token text, p_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if posta_de_token(p_token) is null then
    raise exception 'Se necesita sesión de responsable' using errcode = '42501';
  end if;
  update avisos set resuelto = true, resuelto_en = now()
   where id = p_id and not resuelto;
end;
$fn$;

-- --------- padrón ---------
-- Los teléfonos salen únicamente por acá, con sesión de responsable.

create or replace function padron_completo(p_token text)
returns setof peregrinos
language plpgsql security definer set search_path = public as $fn$
begin
  if posta_de_token(p_token) is null then
    raise exception 'Se necesita sesión de responsable' using errcode = '42501';
  end if;
  return query select * from peregrinos order by numero;
end;
$fn$;

-- Importar reemplazando por número. Reimportar corrige, no duplica.
create or replace function importar_padron(p_token text, p_filas jsonb)
returns int
language plpgsql security definer set search_path = public as $fn$
declare v_n int;
begin
  if posta_de_token(p_token) is null then
    raise exception 'Se necesita sesión de responsable' using errcode = '42501';
  end if;

  insert into peregrinos (numero, apellido, nombre, micro, tel, tel_emerg,
                          tramo, es_equipo, nota, activo)
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
         coalesce((f->>'activo')::boolean,true)
  from jsonb_array_elements(p_filas) f
  order by (f->>'numero')::int
  on conflict (numero) do update
     set apellido  = excluded.apellido,
         nombre    = excluded.nombre,
         micro     = excluded.micro,
         tel       = excluded.tel,
         tel_emerg = excluded.tel_emerg,
         tramo     = excluded.tramo,
         es_equipo = excluded.es_equipo,
         nota      = excluded.nota,
         activo    = excluded.activo;

  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

-- Los peregrinos de prueba usan números del 99000 para arriba. Esto los borra
-- (y en cascada sus marcas y avisos) para que scripts/verificar.mjs pueda
-- correr contra la base sin dejar basura.
create or replace function limpiar_prueba(p_token text)
returns int
language plpgsql security definer set search_path = public as $fn$
declare v_n int;
begin
  if posta_de_token(p_token) is null then
    raise exception 'Se necesita sesión de responsable' using errcode = '42501';
  end if;
  delete from peregrinos where numero >= 99000;
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

grant execute on function abrir_posta(text,text)      to anon, authenticated;
grant execute on function limpiar_prueba(text)        to anon, authenticated;
grant execute on function marcar_lote(text,jsonb)     to anon, authenticated;
grant execute on function crear_avisos(jsonb)         to anon, authenticated;
grant execute on function resolver_aviso(text,uuid)   to anon, authenticated;
grant execute on function padron_completo(text)       to anon, authenticated;
grant execute on function importar_padron(text,jsonb) to anon, authenticated;
revoke execute on function posta_de_token(text) from anon, authenticated;

-- =====================================================================
-- Las cinco postas, con un PIN al azar cada una.
-- Al terminar, el SQL Editor te muestra los PIN. Anotalos. Los podés
-- volver a consultar cuando quieras con:
--     select id, nombre, pin from postas order by orden;
-- =====================================================================

insert into postas (id, orden, nombre, pin) values
  ('po1', 1, 'Morón — salida',          lpad((floor(random()*10000))::int::text, 4, '0')),
  ('po2', 2, 'La Reja',                 lpad((floor(random()*10000))::int::text, 4, '0')),
  ('po3', 3, 'General Rodríguez',       lpad((floor(random()*10000))::int::text, 4, '0')),
  ('po4', 4, 'Luján — llegada',         lpad((floor(random()*10000))::int::text, 4, '0')),
  ('po5', 5, 'Luján — subida al micro', lpad((floor(random()*10000))::int::text, 4, '0'))
on conflict (id) do nothing;

-- realtime, para que los responsables se enteren sin recargar
-- (si ya estaban agregadas, no hace nada: el archivo se puede correr dos veces)
do $$ begin
  begin alter publication supabase_realtime add table marcas; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table avisos; exception when duplicate_object then null; end;
end $$;

select orden, id, nombre, pin as "PIN — anotalo" from postas order by orden;


-- >>>>>>>>>>>>>>>>>>>> 002_salidas.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Salidas: no todos arrancan a caminar desde Morón.
--   completo         Morón (7:00 en la parroquia)
--   desde_reja       La Reja (9:00 en la parroquia)
--   desde_rodriguez  General Rodríguez (9:00 en la parroquia)
--   liniers          por su cuenta, se suma en las paradas siguientes
--   solo_vuelta      solo sube al micro en Luján
-- Pegar entero en el SQL Editor de Supabase y correr. Se puede correr dos veces.
-- =====================================================================

alter table peregrinos drop constraint if exists peregrinos_tramo_check;
alter table peregrinos add constraint peregrinos_tramo_check
  check (tramo in ('completo','desde_reja','desde_rodriguez','liniers','solo_vuelta'));

-- El peregrino elige desde dónde sale, una vez, desde su celular.
-- No toca a quien figura como solo_vuelta: eso lo decide la planilla.
create or replace function elegir_salida(p_numero int, p_tramo text)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if p_tramo not in ('completo','desde_reja','desde_rodriguez','liniers') then
    raise exception 'Salida desconocida';
  end if;
  update peregrinos set tramo = p_tramo
   where numero = p_numero and tramo <> 'solo_vuelta';
end;
$fn$;

grant execute on function elegir_salida(int,text) to anon, authenticated;


-- >>>>>>>>>>>>>>>>>>>> 003_arreglo_pin.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Arreglo: en Supabase, pgcrypto (gen_random_bytes) vive en el esquema
-- "extensions", y abrir_posta solo miraba en "public". Resultado: ningún
-- PIN funcionaba. Pegar en el SQL Editor y correr.
-- =====================================================================

create or replace function abrir_posta(p_posta text, p_pin text)
returns text
language plpgsql security definer set search_path = public, extensions as $fn$
declare v_token text;
begin
  if not exists (select 1 from postas where id = p_posta and pin = p_pin) then
    perform pg_sleep(0.5);          -- freno mínimo a probar PIN a mano
    raise exception 'PIN incorrecto' using errcode = '42501';
  end if;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into sesiones (token, posta) values (v_token, p_posta);
  return v_token;
end;
$fn$;


-- >>>>>>>>>>>>>>>>>>>> 004_arreglo_marcas.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Arreglo: en marcar_lote las columnas que devuelve (peregrino, posta) se
-- llaman igual que las de la tabla y Postgres no sabía cuál usar
-- ("column reference peregrino is ambiguous"). Ninguna marca subía.
-- Pegar en el SQL Editor y correr.
-- =====================================================================

create or replace function marcar_lote(p_token text, p_marcas jsonb)
returns table (peregrino int, posta text)
language plpgsql security definer set search_path = public as $fn$
#variable_conflict use_column
begin
  if exists (select 1 from jsonb_array_elements(p_marcas) m where m->>'via' = 'resp')
     and posta_de_token(p_token) is null then
    raise exception 'Se necesita sesión de responsable para marcar como confirmado'
      using errcode = '42501';
  end if;

  return query
  insert into marcas as mm (peregrino, posta, presente, via, marcado_en)
  select distinct on ((m->>'peregrino')::int, m->>'posta')
         (m->>'peregrino')::int,
         m->>'posta',
         coalesce((m->>'presente')::boolean, true),
         m->>'via',
         (m->>'marcado_en')::timestamptz
  from jsonb_array_elements(p_marcas) m
  order by (m->>'peregrino')::int, m->>'posta', (m->>'marcado_en')::timestamptz desc
  on conflict (peregrino, posta) do update
     set presente   = excluded.presente,
         via        = excluded.via,
         marcado_en = excluded.marcado_en,
         subido_en  = now()
   where excluded.marcado_en > mm.marcado_en
     -- 4. Lo que declara el peregrino no tapa lo que confirmó el responsable.
     --    Sin esto, un "Llegué" apretado tarde bajaría una marca confirmada
     --    a declarada, y un "Me equivoqué" la borraría. Si el responsable
     --    desmarcó (presente=false), el peregrino sí puede volver a declarar.
     --    La misma regla vive en src/lib/regla.ts para la vista local.
     and not (mm.via = 'resp' and mm.presente and excluded.via = 'peregrino')
  returning mm.peregrino, mm.posta;
end;
$fn$;


-- >>>>>>>>>>>>>>>>>>>> 005_ubicacion_ayuda.sql <<<<<<<<<<<<<<<<<<<<
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


-- >>>>>>>>>>>>>>>>>>>> 006_micro.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- "Dejé de caminar" / "Volví a caminar".
-- Van en la tabla de avisos como dos tipos nuevos: 'micro' y 'camina'.
-- El último de cada persona dice si va en el micro o caminando.
-- Pegar en el SQL Editor y correr. Se puede correr dos veces.
-- =====================================================================

alter table avisos drop constraint if exists avisos_tipo_check;
alter table avisos add constraint avisos_tipo_check
  check (tipo in ('bajo','ayuda','micro','camina'));


-- >>>>>>>>>>>>>>>>>>>> 007_viandas_equipo.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Viandas, restricciones alimentarias y salida ya definida.
-- Pegar en el SQL Editor y correr. Se puede correr dos veces.
--
--   comida     la restricción alimentaria ("Celíaca", "Vegetariano"...).
--              Es dato de salud: NO va a la vista pública "padron". Solo la
--              ve el equipo, con sesión de PIN (padron_completo).
--   salida_ok  la salida vino de la planilla o ya la eligió el peregrino:
--              la app no se la vuelve a preguntar (igual la puede cambiar).
--   'vianda'   una "posta" más, que no es un lugar: marcar ahí es "le
--              entregamos la vianda". Reusa las marcas, la cola sin señal y
--              la regla de conflictos tal cual.
-- =====================================================================

alter table peregrinos add column if not exists comida    text;
alter table peregrinos add column if not exists salida_ok boolean not null default false;

create or replace view padron as
  select numero, apellido, nombre, micro, tramo, es_equipo, nota, activo, salida_ok
  from peregrinos;
grant select on padron to anon, authenticated;

insert into postas (id, orden, nombre, pin)
values ('vianda', 90, 'Viandas', lpad((floor(random()*10000))::int::text, 4, '0'))
on conflict (id) do nothing;

create or replace function elegir_salida(p_numero int, p_tramo text)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if p_tramo not in ('completo','desde_reja','desde_rodriguez','liniers') then
    raise exception 'Salida desconocida';
  end if;
  update peregrinos set tramo = p_tramo, salida_ok = true
   where numero = p_numero and tramo <> 'solo_vuelta';
end;
$fn$;

create or replace function importar_padron(p_token text, p_filas jsonb)
returns int
language plpgsql security definer set search_path = public as $fn$
declare v_n int;
begin
  if posta_de_token(p_token) is null then
    raise exception 'Se necesita sesión de responsable' using errcode = '42501';
  end if;

  insert into peregrinos (numero, apellido, nombre, micro, tel, tel_emerg,
                          tramo, es_equipo, nota, activo, comida, salida_ok)
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
         coalesce((f->>'salida_ok')::boolean,false)
  from jsonb_array_elements(p_filas) f
  order by (f->>'numero')::int
  on conflict (numero) do update
     set apellido  = excluded.apellido,
         nombre    = excluded.nombre,
         micro     = excluded.micro,
         tel       = excluded.tel,
         tel_emerg = excluded.tel_emerg,
         es_equipo = excluded.es_equipo,
         nota      = excluded.nota,
         activo    = excluded.activo,
         comida    = excluded.comida,
         -- si la planilla no trae salida, no se pisa la que eligió el peregrino
         tramo     = case when excluded.salida_ok or excluded.tramo = 'solo_vuelta'
                          then excluded.tramo else peregrinos.tramo end,
         salida_ok = excluded.salida_ok or peregrinos.salida_ok;

  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;


-- >>>>>>>>>>>>>>>>>>>> 008_roles_pecheras.sql <<<<<<<<<<<<<<<<<<<<
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
