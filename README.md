# Postas — Peregrinación a Luján

App de control de paso por postas para la peregrinación del 3 de octubre de 2026.
Una parroquia que sale desde Morón con unas 139 personas necesita saber, en cada
momento, por dónde va cada una.

## Qué hay acá

```
PROMPT.md                  el mensaje para arrancar en Claude Code
docs/contexto.md           quiénes van, cuáles son las postas, qué condiciona todo
docs/decisiones.md         las decisiones de diseño y por qué se tomaron
docs/modelo-datos.md       esquema, reglas de escritura y cola offline
docs/pantallas.md          las pantallas, una por una
prototipo/postas-demo.html prototipo funcional, una sola página, sin dependencias
prototipo/postas-lujan.jsx versión anterior en React, con QR y códigos (histórico)
```

## Cómo empezar

1. Abrí `prototipo/postas-demo.html` en un navegador y usalo unos minutos. Cargá
   el padrón de ejemplo, marcá gente, probá las dos vistas.
2. Abrí esta carpeta en Claude Code y pegale `PROMPT.md` como primer mensaje.

## Correr la app

```
npm install
npm run dev                          # desarrollo, sin service worker
npm run build && npx vite preview    # como en producción, con service worker
npm test                             # reglas de conflicto, importador, exportación
npm run peso                         # presupuesto del primer load (techo 60 kB)
node scripts/verificar.mjs <PIN>     # permisos y conflictos contra Supabase
```

- `/` es el peregrino, `/posta` es el responsable.
- **Demo:** agregá `?demo` al link. Carga 139 personas inventadas con la
  peregrinación a mitad de camino, no pide PIN y no toca Supabase (usa otra
  base local). La barra de arriba cambia de rol, simula que se cae la señal
  y reinicia la demo.

## Lo único que no se puede negociar

Funciona sin señal. Todo lo demás es discutible.

## Datos

El padrón real de la parroquia no está en este repo y no tiene que estarlo.
Se importa pegando columnas de la planilla. DNI y pagos no entran a la app.
