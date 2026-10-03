-- =====================================================================
-- Sumar personas el mismo día, y dejar la base limpia para el lanzamiento.
-- Pegar en el SQL Editor y correr. Se puede correr dos veces.
--
--   origen     'planilla' si vino del Excel/Sheets, 'app' si el coordinador
--              la sumó desde la app. Al recargar la planilla, quien no está
--              en ella queda inactivo... salvo los que se sumaron por la app.
--   agregar_persona   el coordinador suma a alguien (peregrino o equipo).
--   reiniciar_dia     borra marcas y avisos de prueba (solo coordinador).
-- =====================================================================

alter table peregrinos add column if not exists origen text not null default 'planilla';

create or replace function importar_padron(p_token text, p_filas jsonb)
returns int
language plpgsql security definer set search_path = public as $fn$
declare v_n int;
begin
  if rol_de_token(p_token) is distinct from 'coordinador' then
    raise exception 'Solo el equipo coordinador puede cargar la planilla (sesión)' using errcode = '42501';
  end if;

  insert into peregrinos (numero, apellido, nombre, micro, tel, tel_emerg,
                          tramo, es_equipo, nota, activo, comida, salida_ok, dni, pechera_ok, origen)
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
         coalesce((f->>'pechera_ok')::boolean,false),
         'planilla'
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
         origen     = 'planilla',
         pechera_ok = excluded.pechera_ok or peregrinos.pechera_ok,
         tramo      = case when excluded.salida_ok or excluded.tramo = 'solo_vuelta'
                           then excluded.tramo else peregrinos.tramo end,
         salida_ok  = excluded.salida_ok or peregrinos.salida_ok;

  get diagnostics v_n = row_count;

  -- solo con una planilla real (las pruebas van del 99000 para arriba), y sin
  -- tocar a quienes se sumaron desde la app ese día
  if exists (select 1 from jsonb_array_elements(p_filas) f where (f->>'numero')::int < 99000) then
    update peregrinos set activo = false
     where numero < 99000
       and origen = 'planilla'
       and numero not in (select (f->>'numero')::int from jsonb_array_elements(p_filas) f);
  end if;

  return v_n;
end;
$fn$;

create or replace function agregar_persona(p_token text, p_fila jsonb)
returns int
language plpgsql security definer set search_path = public as $fn$
declare v_num int := (p_fila->>'numero')::int;
begin
  if rol_de_token(p_token) is distinct from 'coordinador' then
    raise exception 'Solo el equipo coordinador puede sumar personas (sesión)' using errcode = '42501';
  end if;
  if v_num is null or coalesce(p_fila->>'apellido','') = '' then
    raise exception 'Falta el número o el apellido';
  end if;
  insert into peregrinos (numero, apellido, nombre, tel, tel_emerg, tramo, es_equipo,
                          nota, activo, comida, salida_ok, dni, pechera_ok, origen)
  values (v_num, p_fila->>'apellido', coalesce(p_fila->>'nombre',''),
          nullif(p_fila->>'tel',''), nullif(p_fila->>'tel_emerg',''),
          coalesce(nullif(p_fila->>'tramo',''),'completo'),
          coalesce((p_fila->>'es_equipo')::boolean,false),
          nullif(p_fila->>'nota',''), true, nullif(p_fila->>'comida',''),
          coalesce((p_fila->>'salida_ok')::boolean,false), nullif(p_fila->>'dni',''),
          false, 'app')
  on conflict (numero) do update
     set apellido = excluded.apellido, nombre = excluded.nombre, tel = excluded.tel,
         tel_emerg = excluded.tel_emerg, tramo = excluded.tramo, es_equipo = excluded.es_equipo,
         nota = excluded.nota, activo = true, comida = excluded.comida,
         salida_ok = excluded.salida_ok, dni = excluded.dni;
  return v_num;
end;
$fn$;

create or replace function reiniciar_dia(p_token text)
returns text
language plpgsql security definer set search_path = public as $fn$
declare v_m int; v_a int;
begin
  if rol_de_token(p_token) is distinct from 'coordinador' then
    raise exception 'Solo el equipo coordinador (sesión)' using errcode = '42501';
  end if;
  delete from marcas; get diagnostics v_m = row_count;
  delete from avisos; get diagnostics v_a = row_count;   -- y sus ubicaciones, en cascada
  delete from peregrinos where numero >= 99000;
  return v_m || ' marcas y ' || v_a || ' avisos borrados';
end;
$fn$;

grant execute on function importar_padron(text,jsonb) to anon, authenticated;
grant execute on function agregar_persona(text,jsonb) to anon, authenticated;
grant execute on function reiniciar_dia(text)         to anon, authenticated;
