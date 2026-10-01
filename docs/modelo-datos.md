# Modelo de datos

Esquema pensado para Postgres / Supabase. Lo importante no es el motor sino las
dos reglas: **una fila por marca** y **última gana por (peregrino, posta)**.

```sql
create table postas (
  id          text primary key,          -- po1..po5
  orden       int  not null,
  nombre      text not null,
  pin         text                       -- PIN del responsable, corto
);

create table peregrinos (
  numero      int  primary key,          -- número de lista de la planilla
  apellido    text not null,
  nombre      text not null,
  micro       text,
  tel         text
);

create table marcas (
  peregrino   int  references peregrinos(numero) on delete cascade,
  posta       text references postas(id)         on delete cascade,
  presente    boolean not null default true,
  via         text    not null check (via in ('resp','peregrino')),
  marcado_en  timestamptz not null,       -- hora del dispositivo que marcó
  subido_en   timestamptz not null default now(),
  primary key (peregrino, posta)
);

create table avisos (
  id          uuid primary key default gen_random_uuid(),
  peregrino   int  references peregrinos(numero),
  tipo        text not null check (tipo in ('bajo','ayuda')),
  desde_posta text references postas(id),
  creado_en   timestamptz not null,
  resuelto    boolean not null default false,
  resuelto_en timestamptz
);
```

## Reglas de escritura

- Una marca se escribe con `insert ... on conflict (peregrino, posta) do update`,
  y el `do update` **solo pisa si `excluded.marcado_en > marcas.marcado_en`**.
  Así dos responsables marcando a la vez no se borran entre sí, y una marca
  vieja que sube tarde desde la cola offline no pisa una más nueva.
- `marcado_en` es la hora del dispositivo que marcó, no la del servidor. Es lo
  único que permite ordenar marcas que estuvieron horas encoladas. Asumir que
  algún reloj va a estar corrido unos minutos y no romper por eso.
- Desmarcar no borra la fila: escribe `presente = false` con `marcado_en` nuevo.
  Borrar la fila haría que una marca vieja de la cola la resucite.

## Cola local

En IndexedDB, una tabla de operaciones pendientes con la misma forma que la fila
de `marcas`. Al recuperar conexión se suben en orden y se vacían las confirmadas.
La interfaz muestra cuántas quedan sin subir, pero nunca obliga a apretar nada
para sincronizar.

## Lectura en tiempo real

Los responsables se suscriben a `marcas` y `avisos`. El peregrino no necesita
realtime: le alcanza con su propio estado local y una lectura al abrir.

## Volumen

139 peregrinos por 5 postas son 695 marcas como techo. Nada de esto necesita
optimización; sí necesita ser correcto bajo conexión intermitente.
