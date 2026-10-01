# Decisiones de diseño y por qué

Estas decisiones se tomaron con el responsable de logística de los micros.
Si alguna se revisa, que sea a propósito y no por descuido.

## Sin QR ni códigos

Se evaluó poner un cartel con QR y un número de cuatro dígitos en cada posta.
El código garantizaba presencia física: para marcarte tenías que estar parado ahí
leyendo el cartel. Se descartó por fricción: el QR necesita que el celular abra
una página nueva, justo lo que no va a poder hacer sin señal, y el código obliga
a leer, teclear y equivocarse, de noche y cansado.

Lo que se perdió, la garantía de presencia, se recupera por otro lado: la marca
del responsable es la que vale. La del peregrino es una declaración.

## Dos niveles de confianza

Cada marca guarda quién la hizo:

- `via: "resp"` — la hizo el responsable de la posta. Confirmada.
- `via: "peregrino"` — la declaró la persona. Vale, pero es lo que dijo.

En la interfaz se distinguen por color. Con eso el equipo sabe de un vistazo
cuánto de lo que está viendo es verificado.

## Un solo botón, siempre el siguiente

El peregrino nunca elige entre cinco postas: la app le muestra únicamente la
próxima que no marcó. Como el recorrido es estrictamente secuencial, no hay forma
de equivocarse de posta. Si igual se equivoca, tiene "Me equivoqué, borralo"
durante los dos minutos siguientes.

## Identificarse por apellido, no por número

Pedirle el número de lista a alguien que no se lo acuerda es garantía de error.
La app filtra el padrón mientras escribe el apellido y la persona toca su nombre.
Queda guardado en el dispositivo y no se vuelve a preguntar.

## El responsable ve "faltan" por defecto

La lista arranca filtrada por quienes todavía no pasaron, que es lo que el
responsable necesita mirar. "Todos" y "Pasaron" están a un toque.

## "Dónde están" antes que "quién falta"

La vista operativa no es quién falta en una posta suelta, sino en qué tramo está
cada uno. Agrupa a las 139 personas por la última posta donde aparecieron y
resalta a quienes quedaron dos postas o más atrás del pelotón. Eso es lo que
dispara ir a buscar a alguien o avisar al micro de apoyo.

## Botones de auxilio

"No puedo seguir" y "Necesito ayuda" mandan un aviso con número, nombre, hora y
última posta conocida, sin esperar al próximo control. El responsable lo ve
arriba de todo, puede llamar desde ahí y marcarlo como resuelto.

## Qué queda afuera de la app

Pagos, DNI, comida y asignación de butacas siguen en la planilla de la parroquia.
Mezclarlos acá agregaría datos sensibles a una app que van a tener abierta 139
personas, sin beneficio para el control de paso.
