-- =====================================================================
-- "Dejé de caminar" / "Volví a caminar".
-- Van en la tabla de avisos como dos tipos nuevos: 'micro' y 'camina'.
-- El último de cada persona dice si va en el micro o caminando.
-- Pegar en el SQL Editor y correr. Se puede correr dos veces.
-- =====================================================================

alter table avisos drop constraint if exists avisos_tipo_check;
alter table avisos add constraint avisos_tipo_check
  check (tipo in ('bajo','ayuda','micro','camina'));
