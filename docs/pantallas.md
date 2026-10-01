# Pantallas

El prototipo `prototipo/postas-demo.html` implementa todas estas. Abrilo para ver
el comportamiento exacto antes de reescribirlas.

## Inicio
Dos botones: "Soy peregrino" y "Soy responsable de posta". La elección queda
guardada en el dispositivo.

## Peregrino — identificación
Un campo. Escribe su apellido, la app filtra el padrón y toca su nombre. Se
guarda en el dispositivo y no se vuelve a preguntar.

## Peregrino — principal
- Encabezado chico con su número y nombre.
- Rótulo "PRÓXIMA POSTA" y el nombre de la posta en grande.
- Un botón que ocupa el ancho completo: "Llegué a La Reja".
- Al marcar: confirmación verde y "Me equivoqué, borralo" por dos minutos.
- Debajo, su recorrido: las cinco postas con la hora de cada paso.
- Al pie: "No puedo seguir" y "Necesito ayuda", ambos con confirmación.
- Cuando pasó por todas: "Pasaste por todas las postas".

## Responsable — marcar
- Selector horizontal de postas.
- Contador grande: pasaron / total, y cuántos faltan.
- Una barra de 139 rayitas, una por peregrino, que se van llenando. Celeste si
  la marcó el responsable, verde si la declaró el peregrino.
- Buscador por apellido o número.
- Filtros: Faltan (por defecto), Todos, Pasaron.
- Lista de filas grandes. Tocar marca y vuelve a tocar desmarca. Cada fila
  marcada muestra quién la marcó y a qué hora.

## Responsable — dónde están
- Arriba, los pedidos de auxilio sin resolver, con botón para llamar y para
  marcar como resuelto.
- Las 139 personas agrupadas por la última posta donde aparecieron, de adelante
  hacia atrás. Los grupos que quedaron dos postas o más atrás salen resaltados.
- Al pie, cuántos pasaron por cada posta.

## Responsable — datos
- Importar padrón pegando columnas de la planilla: número, apellido, nombre y
  opcionalmente micro y celular.
- Exportar a CSV con una columna por posta, para pegar de vuelta en la planilla.

## Estado de conexión
Visible siempre, discreto, sin alarmar: al día, guardando, o sin conexión con la
cantidad de marcas pendientes de subir. Nunca un botón de "sincronizar".
