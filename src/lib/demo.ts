/**
 * Modo demo: la app entera, con 139 personas inventadas y la peregrinación
 * a mitad de camino, sin tocar Supabase. Sirve para probar el flujo en un
 * celular antes del 3/10 y para mostrarle a los responsables cómo se usa.
 *
 * Se entra con ?demo en el link y se sale desde la barra de arriba. Usa su
 * propia base de IndexedDB, así que nunca se mezcla con los datos de verdad.
 */
import type { Aviso, Marca, Persona } from './regla'

const CLAVE = 'postas:demo'
const CLAVE_SENAL = 'postas:demo-sin-senal'

function leer(k: string): string | null {
  try { return localStorage.getItem(k) } catch { return null }
}
function escribir(k: string, v: string | null) {
  try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* nada */ }
}

// se decide una sola vez al cargar: cambiar de modo recarga la página
if (new URLSearchParams(location.search).has('demo')) escribir(CLAVE, '1')
const DEMO = leer(CLAVE) === '1'

export function esDemo(): boolean { return DEMO }
export function demoSinSenal(): boolean { return leer(CLAVE_SENAL) === '1' }
export function simularSinSenal(si: boolean) { escribir(CLAVE_SENAL, si ? '1' : null) }
export function salirDeDemo() {
  escribir(CLAVE, null)
  escribir(CLAVE_SENAL, null)
}

// ---------------------------------------------------------------------------
// datos inventados
// ---------------------------------------------------------------------------

const APELLIDOS = [
  'ACOSTA', 'AGUIRRE', 'ALVAREZ', 'BENITEZ', 'CABRERA', 'CASTRO', 'CORIA', 'DIAZ', 'DOMINGUEZ',
  'FERNANDEZ', 'FLORES', 'GIMENEZ', 'GOMEZ', 'GONZALEZ', 'HERRERA', 'IBAÑEZ', 'JUAREZ', 'LEDESMA',
  'LOPEZ', 'LUNA', 'MARTINEZ', 'MEDINA', 'MOLINA', 'MORALES', 'NUÑEZ', 'OJEDA', 'ORTIZ', 'PAEZ',
  'PERALTA', 'PEREYRA', 'PEREZ', 'QUIROGA', 'RAMIREZ', 'RIOS', 'ROJAS', 'ROMERO', 'RUIZ', 'SANCHEZ',
  'SOSA', 'SUAREZ', 'TORRES', 'VEGA', 'VERA', 'VILLALBA', 'ZARATE',
]
const NOMBRES = [
  'ANA', 'LUIS', 'MARTA', 'JUAN', 'SOFIA', 'MATEO', 'CAMILA', 'DIEGO', 'JULIETA', 'NICOLAS',
  'LUCIA', 'PABLO', 'VALENTINA', 'SANTIAGO', 'FLORENCIA', 'TOMAS', 'MILAGROS', 'FRANCO', 'ROCIO',
  'AGUSTIN', 'MICAELA', 'BRUNO', 'AGUSTINA', 'IGNACIO', 'DELFINA', 'LAUTARO', 'MORENA', 'JOAQUIN',
]

/** Pseudoazar con semilla: la demo sale igual cada vez que se reinicia. */
function azar(semilla: number) {
  let s = semilla
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

export function datosDemo(): { padron: Persona[]; marcas: Marca[]; avisos: Aviso[] } {
  const r = azar(3102026)
  const padron: Persona[] = []
  const usados = new Set<string>()

  const persona = (numero: number, es_equipo: boolean): Persona => {
    let apellido = '', nombre = ''
    do {
      apellido = APELLIDOS[Math.floor(r() * APELLIDOS.length)]!
      nombre = NOMBRES[Math.floor(r() * NOMBRES.length)]!
    } while (usados.has(apellido + nombre))
    usados.add(apellido + nombre)
    return {
      numero, apellido, nombre, es_equipo,
      micro: String(1 + Math.floor((numero % 140) / 47)),
      // números que no existen: 11 0000 0xxx. Nadie llama a un desconocido probando la demo.
      tel: `1100000${String(numero).padStart(3, '0').slice(-3)}`,
      tel_emerg: null,
      tramo: 'completo',
      nota: null,
      activo: true,
    }
  }

  for (let n = 1; n <= 133; n++) padron.push(persona(n, false))
  for (let n = 901; n <= 906; n++) padron.push(persona(n, true))
  padron[80] = { ...padron[80]!, tramo: 'solo_vuelta', nota: 'SOLO VUELVE DE LUJAN A LA PARROQUIA' }
  padron[3] = { ...padron[3]!, nota: 'SALE DESDE LINIERS, SE SUMA EN MORON' }
  // algunas restricciones alimentarias, para ver la pantalla de viandas
  const comidas = ['Celíaca', 'Vegetariana', 'Vegana', 'Sin gluten y sin lactosa', 'Alérgico a la mayonesa']
  ;[9, 22, 40, 57, 88, 111, 120, 134].forEach((i, k) => {
    padron[i] = { ...padron[i]!, comida: comidas[k % comidas.length] }
  })
  padron.forEach((_, i) => { if (i % 5) padron[i] = { ...padron[i]!, salida_ok: true } })

  // La foto: el pelotón está llegando a General Rodríguez.
  const ahora = Date.now()
  const hace = (min: number) => new Date(ahora - min * 60_000).toISOString()
  const marcas: Marca[] = []
  const via = () => (r() < 0.22 ? 'peregrino' : 'resp') as Marca['via']

  padron.forEach((p, i) => {
    if (p.tramo === 'solo_vuelta') return
    // 2 sin ningún registro, 4 que quedaron en Morón, ~45 ya en Gral. Rodríguez
    if (i === 17 || i === 101) return
    marcas.push({ peregrino: p.numero, posta: 'po1', presente: true, via: 'resp', marcado_en: hace(420 + r() * 25) })
    if ([9, 44, 70, 122].includes(i)) return
    marcas.push({ peregrino: p.numero, posta: 'po2', presente: true, via: via(), marcado_en: hace(200 + r() * 60) })
    if (r() < 0.34) {
      marcas.push({ peregrino: p.numero, posta: 'po3', presente: true, via: via(), marcado_en: hace(r() * 40) })
    }
  })

  const avisos: Aviso[] = [
    { id: '00000000-0000-4000-8000-000000000001', peregrino: padron[44]!.numero, tipo: 'ayuda',
      desde_posta: 'po1', creado_en: hace(18), resuelto: false,
      lat: -34.6536, lng: -58.8531, precision_m: 12, ubic_en: hace(18) },
    { id: '00000000-0000-4000-8000-000000000002', peregrino: padron[60]!.numero, tipo: 'bajo',
      desde_posta: 'po2', creado_en: hace(7), resuelto: false },
  ]

  return { padron, marcas, avisos }
}
