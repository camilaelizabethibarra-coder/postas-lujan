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
