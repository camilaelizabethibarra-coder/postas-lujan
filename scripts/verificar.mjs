/**
 * Verifica contra la base real que el esquema quedó bien.
 *
 *   node scripts/verificar.mjs <PIN-del-coordinador>
 *
 * Prueba las dos cosas que no se pueden dar por sentadas:
 *
 *   - Que la clave pública no alcance para leer teléfonos ni PIN. Esa clave
 *     va adentro del bundle que descarga cualquiera con el link.
 *   - Que dos celulares marcando la misma posta al mismo tiempo no se pisen,
 *     y que una marca vieja subiendo tarde desde una cola offline no tape
 *     una más nueva. Es el criterio de aceptación que no se puede probar a
 *     ojo el día de la peregrinación.
 *
 * Usa peregrinos de prueba con números 99000+ y los borra al terminar.
 */
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const URL_BASE = env.VITE_SUPABASE_URL
const CLAVE = env.VITE_SUPABASE_ANON_KEY
const PIN = process.argv[2]

if (!URL_BASE || !CLAVE) {
  console.error('Falta .env con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

let ok = 0
let mal = 0

function prueba(nombre, pasa, detalle = '') {
  if (pasa) { ok++; console.log(`  ok    ${nombre}`) }
  else { mal++; console.log(`  FALLA ${nombre}${detalle ? `\n        ${detalle}` : ''}`) }
}

async function pedir(ruta, opciones = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${ruta}`, {
    ...opciones,
    headers: {
      apikey: CLAVE,
      Authorization: `Bearer ${CLAVE}`,
      'Content-Type': 'application/json',
      ...(opciones.headers || {}),
    },
  })
  const texto = await r.text()
  let cuerpo
  try { cuerpo = texto ? JSON.parse(texto) : null } catch { cuerpo = texto }
  return { estado: r.status, cuerpo }
}

const rpc = (nombre, args) =>
  pedir(`rpc/${nombre}`, { method: 'POST', body: JSON.stringify(args) })

const enMinutos = (m) => new Date(Date.now() + m * 60000).toISOString()

// ---------------------------------------------------------------------------

// Todo el cuerpo va adentro de main() y se sale poniendo process.exitCode en
// vez de llamando a process.exit(): en Windows, cortar el proceso con sockets
// de fetch todavía abiertos hace que Node aborte con una assertion de libuv.
async function main() {
console.log('\nEsquema y permisos')

const postas = await pedir('postas_publicas?select=*&order=orden')

// Sin esto, las comprobaciones de abajo darían "ok" porque la tabla no existe
// en vez de porque está protegida, que es justo lo contrario de lo que se
// quiere saber.
if (postas.estado === 404 || postas.cuerpo?.code === 'PGRST205') {
  console.log('\n  El esquema todavía no está aplicado.')
  console.log('  Pegá supabase/migrations/001_esquema.sql en el SQL Editor y corré esto de nuevo.\n')
  process.exitCode = 1
  return
}

// las del recorrido; viandas y pecheras (orden 90+) no son lugares
prueba('las cinco postas están', postas.estado === 200 && postas.cuerpo?.filter((p) => p.orden < 90).length === 5,
  JSON.stringify(postas.cuerpo))

prueba('la vista de postas no expone el PIN',
  !JSON.stringify(postas.cuerpo ?? '').includes('pin'))

/** Existe pero no se puede leer: ni 200 con datos, ni 404 de "no existe". */
function protegido(r) {
  if (r.cuerpo?.code === 'PGRST205' || r.estado === 404) return false
  return r.estado !== 200 || (Array.isArray(r.cuerpo) && r.cuerpo.length === 0)
}

const tabla = await pedir('postas?select=pin&limit=1')
prueba('la tabla postas no se puede leer con la clave pública', protegido(tabla),
  `estado ${tabla.estado} ${JSON.stringify(tabla.cuerpo)}`)

const padron = await pedir('padron?select=*&limit=1')
prueba('el padrón público se lee', padron.estado === 200, JSON.stringify(padron.cuerpo))

const conTel = await pedir('padron?select=tel&limit=1')
prueba('el padrón público no tiene columna de teléfono', conTel.estado !== 200,
  `estado ${conTel.estado} ${JSON.stringify(conTel.cuerpo)}`)

const tablaPeregrinos = await pedir('peregrinos?select=tel&limit=1')
prueba('la tabla peregrinos no se puede leer con la clave pública', protegido(tablaPeregrinos),
  `estado ${tablaPeregrinos.estado} ${JSON.stringify(tablaPeregrinos.cuerpo)}`)

const escritura = await pedir('marcas', {
  method: 'POST',
  body: JSON.stringify({ peregrino: 1, posta: 'po1', via: 'resp', marcado_en: enMinutos(0) }),
})
prueba('no se puede escribir en marcas salteando la función', escritura.estado >= 400)

const respSinToken = await rpc('marcar_lote', {
  p_token: 'inventado',
  p_marcas: [{ peregrino: 1, posta: 'po1', via: 'resp', marcado_en: enMinutos(0) }],
})
prueba('una marca "confirmada" sin sesión se rechaza', respSinToken.estado >= 400)

// ---------------------------------------------------------------------------

if (!PIN) {
  console.log('\nSin PIN no puedo probar la regla de conflictos.')
  console.log('Corré:  node scripts/verificar.mjs <PIN-del-coordinador>\n')
  process.exitCode = mal ? 1 : 0
  return
}

console.log('\nSesión de responsable')

const sesion = await rpc('abrir_rol', { p_rol: 'coordinador', p_pin: PIN })
prueba('el PIN abre sesión', sesion.estado === 200 && typeof sesion.cuerpo === 'string',
  JSON.stringify(sesion.cuerpo))

const malPin = await rpc('abrir_rol', { p_rol: 'coordinador', p_pin: '000000' })
prueba('un PIN incorrecto no abre sesión', malPin.estado >= 400)

if (sesion.estado !== 200) {
  console.log('\nNo pude seguir sin sesión.\n')
  process.exitCode = 1
  return
}
const token = sesion.cuerpo

const conToken = await rpc('padron_completo', { p_token: token })
prueba('con sesión sí se ven los teléfonos', conToken.estado === 200)

// ---------------------------------------------------------------------------

console.log('\nRegla de conflictos')

await rpc('importar_padron', {
  p_token: token,
  p_filas: [
    { numero: 99001, apellido: 'PRUEBA', nombre: 'UNO' },
    { numero: 99002, apellido: 'PRUEBA', nombre: 'DOS' },
  ],
})

// 1. Una marca vieja que sube tarde no pisa una más nueva.
await rpc('marcar_lote', {
  p_token: token,
  p_marcas: [{ peregrino: 99001, posta: 'po1', presente: true, via: 'resp', marcado_en: enMinutos(0) }],
})
await rpc('marcar_lote', {
  p_token: token,
  p_marcas: [{ peregrino: 99001, posta: 'po1', presente: false, via: 'peregrino', marcado_en: enMinutos(-30) }],
})
const tras = await pedir('marcas?select=*&peregrino=eq.99001&posta=eq.po1')
prueba('una marca de hace media hora no pisa la de recién',
  tras.cuerpo?.[0]?.presente === true && tras.cuerpo?.[0]?.via === 'resp',
  JSON.stringify(tras.cuerpo?.[0]))

// 2. Una más nueva sí entra.
await rpc('marcar_lote', {
  p_token: token,
  p_marcas: [{ peregrino: 99001, posta: 'po1', presente: false, via: 'resp', marcado_en: enMinutos(5) }],
})
const desmarcada = await pedir('marcas?select=presente&peregrino=eq.99001&posta=eq.po1')
prueba('una marca más nueva sí entra', desmarcada.cuerpo?.[0]?.presente === false)

// 3. La cola de un celular puede traer la misma persona dos veces.
const lote = await rpc('marcar_lote', {
  p_token: token,
  p_marcas: [
    { peregrino: 99002, posta: 'po2', presente: true, via: 'resp', marcado_en: enMinutos(1) },
    { peregrino: 99002, posta: 'po2', presente: false, via: 'resp', marcado_en: enMinutos(2) },
    { peregrino: 99002, posta: 'po2', presente: true, via: 'resp', marcado_en: enMinutos(3) },
  ],
})
const repetida = await pedir('marcas?select=presente&peregrino=eq.99002&posta=eq.po2')
prueba('un lote con la misma persona tres veces no explota y gana la última',
  lote.estado === 200 && repetida.cuerpo?.[0]?.presente === true,
  JSON.stringify(lote.cuerpo))

// 4. Dos celulares marcando la misma posta a la vez, cada uno a otra persona.
await rpc('limpiar_prueba', { p_token: token })
await rpc('importar_padron', {
  p_token: token,
  p_filas: Array.from({ length: 20 }, (_, i) => ({
    numero: 99100 + i, apellido: 'SIMULTANEO', nombre: String(i),
  })),
})
const celularA = rpc('marcar_lote', {
  p_token: token,
  p_marcas: Array.from({ length: 10 }, (_, i) => ({
    peregrino: 99100 + i, posta: 'po3', presente: true, via: 'resp', marcado_en: enMinutos(0),
  })),
})
const celularB = rpc('marcar_lote', {
  p_token: token,
  p_marcas: Array.from({ length: 10 }, (_, i) => ({
    peregrino: 99110 + i, posta: 'po3', presente: true, via: 'resp', marcado_en: enMinutos(0),
  })),
})
await Promise.all([celularA, celularB])
const ambos = await pedir('marcas?select=peregrino&posta=eq.po3&peregrino=gte.99100&presente=is.true')
prueba('dos celulares marcando la misma posta a la vez no se pisan',
  ambos.cuerpo?.length === 20, `quedaron ${ambos.cuerpo?.length ?? 0} de 20`)

// 5. Los dos niveles de confianza se guardan.
await rpc('marcar_lote', {
  p_token: '',
  p_marcas: [{ peregrino: 99100, posta: 'po4', presente: true, via: 'peregrino', marcado_en: enMinutos(0) }],
})
const declarada = await pedir('marcas?select=via&peregrino=eq.99100&posta=eq.po4')
prueba('el peregrino puede declararse sin sesión, y queda como declarada',
  declarada.cuerpo?.[0]?.via === 'peregrino')

// 6. Lo que declara el peregrino no tapa una confirmación del responsable.
await rpc('marcar_lote', {
  p_marcas: [{ peregrino: 99101, posta: 'po3', presente: false, via: 'peregrino', marcado_en: enMinutos(10) }],
})
const confirmada = await pedir('marcas?select=presente,via&peregrino=eq.99101&posta=eq.po3')
prueba('un "Me equivoqué" del peregrino no borra lo que confirmó el responsable',
  confirmada.cuerpo?.[0]?.presente === true && confirmada.cuerpo?.[0]?.via === 'resp',
  JSON.stringify(confirmada.cuerpo?.[0]))

// ---------------------------------------------------------------------------

const borradas = await rpc('limpiar_prueba', { p_token: token })
console.log(`\nLimpieza: ${borradas.cuerpo ?? 0} peregrinos de prueba borrados.`)

console.log(`\n${ok} bien, ${mal} mal.\n`)
  process.exitCode = mal ? 1 : 0
}

await main()
