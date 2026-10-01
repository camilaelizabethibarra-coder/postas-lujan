# Prompt para Claude Code

Copiá todo este archivo como primer mensaje en Claude Code, con la carpeta abierta.

---

Quiero que construyas una app web para controlar el paso de peregrinos por las
postas de una parroquia durante la peregrinación a Luján del **3 de octubre de 2026**.
Leé antes `docs/contexto.md`, `docs/decisiones.md`, `docs/modelo-datos.md` y
`docs/pantallas.md`: ahí está el detalle de por qué la app es como es.
En `prototipo/postas-demo.html` hay un prototipo funcional de una sola página que
ya tiene las pantallas y el flujo resueltos; usalo como referencia de comportamiento
y de diseño, no como base de código.

## Qué tiene que hacer

Dos roles sobre el mismo padrón de ~139 personas y 5 postas fijas:

- **Peregrino**: entra por un link, se identifica una sola vez buscando su
  apellido, y después ve un único botón gigante que dice "Llegué a `<próxima posta>`".
  Tiene además dos botones de auxilio: "No puedo seguir" y "Necesito ayuda".
- **Responsable de posta**: elige su posta, ve la lista del padrón filtrada por
  "faltan", y marca tocando el nombre. Ve el contador, quiénes quedaron atrás y
  los pedidos de auxilio.

## Requisitos que no son negociables

1. **Tiene que funcionar sin señal.** El 3/10 la red móvil se satura sobre toda
   la ruta. La app es una PWA instalable: el shell se precachea con un service
   worker, el padrón queda en IndexedDB, y toda marca se escribe primero local y
   se encola para subir. Al recuperar señal sincroniza sola, sin que nadie toque
   un botón de "sincronizar". Si alguien abre el link por primera vez sin señal,
   no funciona nada: por eso la app tiene que avisar antes de salir que hay que
   abrirla e instalarla con wifi.
2. **Cero fricción para el peregrino.** Sin registro, sin contraseña, sin
   escanear nada, sin escribir códigos. Un link, tu apellido una vez, y después
   un botón por posta. Pensado para gente cansada, de noche, con una mano.
3. **Resolución de conflictos por marca, no por documento.** Dos responsables
   pueden estar marcando la misma posta al mismo tiempo. Nunca pisar el estado
   completo de una posta: cada marca es una fila propia y gana la más reciente
   por (peregrino, posta).
4. **Dos niveles de confianza.** Una marca hecha por el responsable vale como
   confirmada; una hecha por el peregrino vale como declarada. Se distinguen en
   la interfaz y se guardan con el campo `via`.
5. **Sin datos sensibles en la app.** El padrón se importa con número, apellido,
   nombre, micro y celular. El DNI y el estado de pago se quedan en la planilla
   de la parroquia y no entran acá. No commitear nunca el padrón real al repo.

## Stack sugerido

- Vite + React + TypeScript, `vite-plugin-pwa` para el service worker.
- Supabase (plan gratis) para Postgres, realtime y la API. El esquema está en
  `docs/modelo-datos.md`.
- Sin login para el peregrino. El responsable entra con un PIN por posta guardado
  en la tabla `postas`, suficiente para que nadie marque de casualidad.
- Hospedaje en Vercel o Netlify, dominio corto y fácil de dictar en voz alta.

Si preferís otro stack, proponelo y justificá antes de escribir código.

## Cómo quiero que trabajes

Primero leé los docs y devolveme un plan corto: esquema de base, rutas, y en qué
orden vas a construir. Esperá mi visto bueno antes de programar.
Después construí en este orden, y que cada etapa quede andando antes de pasar a
la siguiente:

1. Esquema en Supabase + importador de padrón desde CSV pegado.
2. Pantalla de responsable: marcar, contador, filtro faltan/todos/pasaron.
3. Pantalla de peregrino: identificación y botón de llegada.
4. Offline: service worker, cola local, sincronización y estado de conexión visible.
5. Vista "Dónde están" y pedidos de auxilio.
6. Exportación a CSV para volver a la planilla.

## Criterios de aceptación

- En modo avión, marcar 20 personas y cerrar la app; al reabrir con señal, las 20
  suben solas y aparecen en el otro dispositivo en menos de un minuto.
- Dos celulares marcando la misma posta al mismo tiempo no se pisan entre sí.
- Un peregrino que nunca vio la app llega a marcar su primera posta en menos de
  tres toques desde que abre el link.
- La lista de 139 personas se filtra y scrollea sin lag en un celular de gama baja.
- Toda la interfaz se lee de día con sol y de noche sin encandilar.
- La app pesa poco: el primer load tiene que entrar por una red mala de la parroquia.
