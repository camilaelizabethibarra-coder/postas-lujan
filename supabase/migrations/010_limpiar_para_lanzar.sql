-- =====================================================================
-- Limpiar las pruebas y dejar la base lista para el día.
-- Pegar en el SQL Editor y correr. Se puede correr las veces que haga falta:
-- cada vez borra todas las marcas y avisos.
--
-- Además anota la hora del "reinicio": cada celular, la próxima vez que
-- tenga señal, se entera y borra de su memoria las pruebas viejas (lo que
-- se marque después del reinicio no se toca).
-- =====================================================================

create table if not exists ajustes (
  id       int primary key default 1 check (id = 1),
  reinicio timestamptz
);
alter table ajustes enable row level security;
drop policy if exists ajustes_lectura on ajustes;
create policy ajustes_lectura on ajustes for select to anon, authenticated using (true);
grant select on ajustes to anon, authenticated;

-- 'where true': Supabase no deja borrar sin condición (protección contra accidentes)
delete from marcas where true;
delete from avisos where true;                    -- y sus ubicaciones, en cascada
delete from peregrinos where numero >= 99000;     -- pruebas
delete from sesiones where expira_en < now();

insert into ajustes (id, reinicio) values (1, now())
on conflict (id) do update set reinicio = now();

create or replace function reiniciar_dia(p_token text)
returns text
language plpgsql security definer set search_path = public as $fn$
declare v_m int; v_a int;
begin
  if rol_de_token(p_token) is distinct from 'coordinador' then
    raise exception 'Solo el equipo coordinador (sesión)' using errcode = '42501';
  end if;
  delete from marcas where true; get diagnostics v_m = row_count;
  delete from avisos where true; get diagnostics v_a = row_count;
  delete from peregrinos where numero >= 99000;
  insert into ajustes (id, reinicio) values (1, now())
  on conflict (id) do update set reinicio = now();
  return v_m || ' marcas y ' || v_a || ' avisos borrados';
end;
$fn$;
grant execute on function reiniciar_dia(text) to anon, authenticated;

select 'Listo: base limpia' as resultado,
       (select count(*) from marcas) as marcas,
       (select count(*) from avisos) as avisos,
       (select count(*) from peregrinos where activo) as personas;
