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
