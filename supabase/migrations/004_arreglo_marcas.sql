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
