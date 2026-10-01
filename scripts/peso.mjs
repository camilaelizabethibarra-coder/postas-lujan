/**
 * Presupuesto de peso del primer load.
 *
 *   npm run build && npm run peso
 *
 * Mide solo lo que el celular necesita descargar ANTES de ver algo útil:
 * el HTML, el CSS y el JS de entrada. supabase-js no cuenta porque entra por
 * import() diferido y ninguna pantalla lo espera para dibujarse.
 *
 * El número importa porque el primer load va a pasar por la red de la
 * parroquia con 150 personas encima, y porque quien no instale la app con
 * wifi antes de salir no la va a poder instalar en la ruta.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'

const TECHO = 60 * 1024 // bytes comprimidos

function archivos(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? archivos(join(dir, e.name)) : [join(dir, e.name)],
  )
}

const todos = archivos('dist')
const critico = todos.filter(
  (f) =>
    f.endsWith('index.html') ||
    (/assets[\\/]index-.*\.css$/.test(f)) ||
    (/assets[\\/]index-.*\.js$/.test(f)),
)

let total = 0
console.log('\nPrimer load:')
for (const f of critico.sort()) {
  const gz = gzipSync(readFileSync(f), { level: 9 }).length
  total += gz
  console.log(`  ${String(Math.round(gz / 102.4) / 10).padStart(6)} kB  ${f}`)
}

const diferido = todos.filter((f) => /supabase-.*\.js$/.test(f))
if (diferido.length) {
  const gz = diferido.reduce((s, f) => s + gzipSync(readFileSync(f), { level: 9 }).length, 0)
  console.log(`\nDiferido (no bloquea nada):\n  ${String(Math.round(gz / 102.4) / 10).padStart(6)} kB  supabase-js`)
}

const bruto = todos.reduce((s, f) => s + statSync(f).size, 0)
console.log(`\nTodo el sitio sin comprimir: ${Math.round(bruto / 1024)} kB`)

const kb = Math.round(total / 102.4) / 10
const techoKb = Math.round(TECHO / 102.4) / 10
if (total > TECHO) {
  console.log(`\nFALLA: ${kb} kB pasa el techo de ${techoKb} kB.\n`)
  process.exitCode = 1
} else {
  console.log(`\nok: ${kb} kB, techo ${techoKb} kB.\n`)
}
