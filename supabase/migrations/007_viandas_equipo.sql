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
