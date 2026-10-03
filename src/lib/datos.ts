/**
 * El estado de la app vive acá, y vive primero en el celular.
 *
 * Toda pantalla lee de este módulo, que se llena desde IndexedDB al abrir.
 * Toda marca se escribe en IndexedDB y se encola ANTES de intentar subirla:
 * si no hay señal, la marca ya está hecha y la pantalla ya la muestra. La
 * cola se vacía sola desde sync.ts cuando vuelve la señal.
 */
import { openDB, type IDBPDatabase } from 'idb'
import { useEffect, useState } from 'preact/hooks'
import { ahora, tokenGuardado } from './supabase'
import { esDemo, datosDemo } from './demo'
import { POSTAS_POR_DEFECTO } from './postas'
import {
  clave, reemplaza, ultimaPosta,
  type Aviso, type Marca, type Marcas, type Persona, type Via, type Ubicacion,
} from './regla'

export type Pendiente =
  // el token viaja con la marca: si el responsable cierra la sesión con
  // marcas sin subir, igual suben con la sesión con la que se hicieron
  | { id?: number; tipo: 'marca'; marca: Marca; token: string | null }
  | { id?: number; tipo: 'aviso'; aviso: Aviso }
  | { id?: number; tipo: 'resolver'; avisoId: string; token: string | null }
  | { id?: number; tipo: 'salida'; numero: number; tramo: string }

export type Conexion = 'conectando' | 'aldia' | 'guardando' | 'sinconexion' | 'demo'

export type Estado = {
  listo: boolean
  padron: Persona[]
  marcas: Marcas
  avisos: Aviso[]
  pendientes: number
  conexion: Conexion
  /** El token del responsable dejó de valer: hay marcas que no van a subir hasta volver a entrar. */
  sesionVencida: boolean
}

export const estado: Estado = {
  listo: false,
  padron: [],
  marcas: new Map(),
  avisos: [],
  pendientes: 0,
  conexion: 'conectando',
  sesionVencida: false,
}

// ---------------------------------------------------------------------------
// suscripción: las pantallas se redibujan cuando algo cambia
// ---------------------------------------------------------------------------

const oyentes = new Set<() => void>()

export function avisar(): void {
  oyentes.forEach((f) => f())
}

export function useDatos(): Estado {
  const [, forzar] = useState(0)
  useEffect(() => {
    const f = () => forzar((v) => v + 1)
    oyentes.add(f)
    return () => { oyentes.delete(f) }
  }, [])
  return estado
}

// ---------------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------------

let db: IDBPDatabase

export async function base(): Promise<IDBPDatabase> {
  if (db) return db
  // La demo usa otra base: probarla nunca ensucia los datos de verdad.
  db = await openDB(esDemo() ? 'postas-demo' : 'postas', 1, {
    upgrade(d) {
      d.createObjectStore('padron', { keyPath: 'numero' })
      d.createObjectStore('marcas', { keyPath: ['posta', 'peregrino'] })
      d.createObjectStore('avisos', { keyPath: 'id' })
      d.createObjectStore('cola', { keyPath: 'id', autoIncrement: true })
      d.createObjectStore('meta')
    },
  })
  return db
}

export async function iniciar(): Promise<void> {
  const d = await base()
  const [padron, marcas, avisos, n] = await Promise.all([
    d.getAll('padron') as Promise<Persona[]>,
    d.getAll('marcas') as Promise<Marca[]>,
    d.getAll('avisos') as Promise<Aviso[]>,
    d.count('cola'),
  ])
  estado.padron = ordenar(padron)
  estado.marcas = new Map(marcas.map((m) => [clave(m.posta, m.peregrino), m]))
  estado.avisos = ordenarAvisos(avisos)
  estado.pendientes = n
  estado.listo = true
  avisar()
}

const ordenar = (p: Persona[]) => [...p].sort((a, b) => a.numero - b.numero)
const ordenarAvisos = (a: Aviso[]) => [...a].sort((x, y) => y.creado_en.localeCompare(x.creado_en))

export async function meta<T>(k: string): Promise<T | undefined> {
  return (await base()).get('meta', k)
}
export async function guardarMeta(k: string, v: unknown): Promise<void> {
  await (await base()).put('meta', v, k)
}

// ---------------------------------------------------------------------------
// escrituras locales (las que hace esta persona en este celular)
// ---------------------------------------------------------------------------

let alEncolar: () => void = () => {}
/** sync.ts se engancha acá para enterarse de que hay algo para subir. */
export function cuandoSeEncole(f: () => void) { alEncolar = f }

async function encolar(p: Pendiente) {
  const d = await base()
  await d.add('cola', p)
  estado.pendientes++
}

/**
 * Marca o desmarca. Devuelve false si la regla no la deja pasar (por ejemplo,
 * un peregrino queriendo borrar algo que el responsable ya confirmó).
 */
export function marcar(peregrino: number, posta: string, via: Via, presente: boolean): boolean {
  const m: Marca = { peregrino, posta, presente, via, marcado_en: ahora() }
  const k = clave(posta, peregrino)
  if (!reemplaza(m, estado.marcas.get(k))) return false

  // Primero la pantalla, y sin esperar a nada: el toque tiene que sentirse
  // instantáneo, y quien llama tiene que poder decidir qué mostrar en el
  // mismo cuadro (si no, se ve un instante el botón de la posta siguiente).
  estado.marcas = new Map(estado.marcas).set(k, m)
  avisar()
  guardando = guardando
    .then(async () => {
      const d = await base()
      await d.put('marcas', m)
      await encolar({ tipo: 'marca', marca: m, token: via === 'resp' ? tokenGuardado() : null })
      avisar()
      alEncolar()
    })
    .catch((e) => console.error('No pude guardar la marca', e))
  return true
}

/** Las escrituras de marcas van en fila, en el orden en que se tocaron. */
let guardando: Promise<void> = Promise.resolve()

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // http sin s (por ejemplo, probando por la red local) no tiene randomUUID
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export async function pedirAuxilio(peregrino: number, tipo: Aviso['tipo'], ubic?: Ubicacion | null): Promise<void> {
  const u = ultimaPosta(estado.marcas, POSTAS_POR_DEFECTO, peregrino)
  const a: Aviso = {
    id: uuid(),
    peregrino,
    tipo,
    desde_posta: u >= 0 ? POSTAS_POR_DEFECTO[u]!.id : null,
    creado_en: ahora(),
    resuelto: false,
    ...(ubic ?? {}),
  }
  estado.avisos = [a, ...estado.avisos]
  avisar()
  const d = await base()
  await d.put('avisos', a)
  await encolar({ tipo: 'aviso', aviso: a })
  avisar()
  alEncolar()
}

/** El peregrino dice desde dónde arranca. Se ve al instante y sube cuando haya señal. */
export async function elegirSalida(numero: number, tramo: Persona['tramo']): Promise<void> {
  const p = estado.padron.find((x) => x.numero === numero)
  if (p && p.tramo !== 'solo_vuelta') {
    const nuevo = { ...p, tramo, salida_ok: true }
    estado.padron = estado.padron.map((x) => (x.numero === numero ? nuevo : x))
    avisar()
    await (await base()).put('padron', nuevo)
  }
  await encolar({ tipo: 'salida', numero, tramo })
  avisar()
  alEncolar()
}

/** El coordinador da de baja a alguien (se fue, no sigue): queda como "no sigue", sin pedido abierto. */
export async function darDeBaja(numero: number): Promise<void> {
  await pedirAuxilio(numero, 'bajo')
  const a = estado.avisos.find((x) => x.peregrino === numero && x.tipo === 'bajo' && !x.resuelto)
  if (a) await resolverAviso(a.id)
}

export async function resolverAviso(id: string): Promise<void> {
  const a = estado.avisos.find((x) => x.id === id)
  if (!a || a.resuelto) return
  const nuevo = { ...a, resuelto: true }
  estado.avisos = estado.avisos.map((x) => (x.id === id ? nuevo : x))
  avisar()
  const d = await base()
  await d.put('avisos', nuevo)
  await encolar({ tipo: 'resolver', avisoId: id, token: tokenGuardado() })
  avisar()
  alEncolar()
}

// ---------------------------------------------------------------------------
// lo que llega de afuera
// ---------------------------------------------------------------------------

/** Mezcla marcas que vienen del servidor. Aplica la misma regla: nunca pisa una más nueva. */
export async function aplicarRemotas(llegan: Marca[]): Promise<void> {
  const cambian: Marca[] = []
  let marcas = estado.marcas
  for (const r of llegan) {
    const m: Marca = {
      peregrino: r.peregrino, posta: r.posta, presente: r.presente,
      via: r.via, marcado_en: r.marcado_en,
    }
    const k = clave(m.posta, m.peregrino)
    const actual = marcas.get(k)
    // Misma regla que en la base. Y una más: si acá hay una declaración del
    // peregrino y del servidor llega una confirmación del responsable, gana
    // la confirmación aunque sea más vieja, porque la base rechazó la nuestra.
    const confirma = actual?.via === 'peregrino' && m.via === 'resp' && m.presente
    if (actual && !confirma && !reemplaza(m, actual)) continue
    if (actual && actual.marcado_en === m.marcado_en && actual.presente === m.presente) continue
    if (cambian.length === 0) marcas = new Map(marcas)
    marcas.set(k, m)
    cambian.push(m)
  }
  if (!cambian.length) return
  estado.marcas = marcas
  avisar()
  const tx = (await base()).transaction('marcas', 'readwrite')
  await Promise.all([...cambian.map((m) => tx.store.put(m)), tx.done])
}

export async function aplicarAvisos(llegan: Aviso[]): Promise<void> {
  const porId = new Map(estado.avisos.map((a) => [a.id, a]))
  let cambio = false
  for (const r of llegan) {
    const local = porId.get(r.id)
    // la ubicación no viene con el aviso (va aparte, solo para el equipo): se conserva la que haya
    const a: Aviso = {
      ...(local ?? {}),
      id: r.id, peregrino: r.peregrino, tipo: r.tipo,
      desde_posta: r.desde_posta, creado_en: r.creado_en, resuelto: r.resuelto,
      ...(r.lat != null ? { lat: r.lat, lng: r.lng, precision_m: r.precision_m, ubic_en: r.ubic_en } : {}),
    }
    // resuelto acá y todavía sin subir: no lo resucitamos
    if (local && local.resuelto && !a.resuelto) continue
    if (local && local.resuelto === a.resuelto) continue
    porId.set(a.id, a)
    cambio = true
  }
  if (!cambio) return
  estado.avisos = ordenarAvisos([...porId.values()])
  avisar()
  const tx = (await base()).transaction('avisos', 'readwrite')
  await Promise.all([...estado.avisos.map((a) => tx.store.put(a)), tx.done])
}

/** Ubicaciones de los pedidos de ayuda, que el equipo baja aparte. */
export async function aplicarUbicaciones(llegan: (Ubicacion & { aviso: string; tomada_en?: string })[]): Promise<void> {
  const porAviso = new Map(llegan.map((u) => [u.aviso, u]))
  const cambian: Aviso[] = []
  estado.avisos = estado.avisos.map((a) => {
    const u = porAviso.get(a.id)
    if (!u || a.lat === u.lat) return a
    const nuevo = { ...a, lat: u.lat, lng: u.lng, precision_m: u.precision_m, ubic_en: u.tomada_en ?? u.ubic_en }
    cambian.push(nuevo)
    return nuevo
  })
  if (!cambian.length) return
  avisar()
  const tx = (await base()).transaction('avisos', 'readwrite')
  await Promise.all([...cambian.map((a) => tx.store.put(a)), tx.done])
}

/** El padrón entero se reemplaza: es chico y así una baja en la planilla se refleja. */
export async function reemplazarPadron(personas: Persona[]): Promise<void> {
  estado.padron = ordenar(personas)
  avisar()
  const tx = (await base()).transaction('padron', 'readwrite')
  await tx.store.clear()
  await Promise.all([...personas.map((p) => tx.store.put(p)), tx.done])
}

// ---------------------------------------------------------------------------
// la cola, para sync.ts
// ---------------------------------------------------------------------------

export async function leerCola(): Promise<Pendiente[]> {
  return (await base()).getAll('cola')
}

export async function sacarDeCola(ids: number[]): Promise<void> {
  if (!ids.length) return
  const tx = (await base()).transaction('cola', 'readwrite')
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done])
  estado.pendientes = await (await base()).count('cola')
  avisar()
}

/**
 * La base se limpió (pruebas): se borra de este celular todo lo que sea de
 * antes de esa hora. Lo marcado después no se toca, aunque esté sin subir.
 */
export async function podarAntesDe(iso: string): Promise<number> {
  const corte = Date.parse(iso)
  const viejo = (t: string) => Date.parse(t) < corte
  const d = await base()
  let n = 0

  const marcas = [...estado.marcas.values()].filter((m) => viejo(m.marcado_en))
  if (marcas.length) {
    const tx = d.transaction('marcas', 'readwrite')
    await Promise.all([...marcas.map((m) => tx.store.delete([m.posta, m.peregrino])), tx.done])
    const nuevas = new Map(estado.marcas)
    for (const m of marcas) nuevas.delete(clave(m.posta, m.peregrino))
    estado.marcas = nuevas
    n += marcas.length
  }

  const avisos = estado.avisos.filter((a) => viejo(a.creado_en))
  if (avisos.length) {
    const tx = d.transaction('avisos', 'readwrite')
    await Promise.all([...avisos.map((a) => tx.store.delete(a.id)), tx.done])
    const ids = new Set(avisos.map((a) => a.id))
    estado.avisos = estado.avisos.filter((a) => !ids.has(a.id))
    n += avisos.length
  }

  const cola = await leerCola()
  const fuera = cola.filter((p) =>
    (p.tipo === 'marca' && viejo(p.marca.marcado_en)) ||
    (p.tipo === 'aviso' && viejo(p.aviso.creado_en)) ||
    (p.tipo === 'resolver' && !estado.avisos.some((a) => a.id === p.avisoId)))
  if (fuera.length) await sacarDeCola(fuera.map((p) => p.id!))

  avisar()
  return n
}

/**
 * Los avisos que este celular tiene guardados pero que la base ya no tiene
 * (pruebas borradas), y que tampoco están esperando para subir: se borran.
 * peregrino: si se bajaron solo los de una persona, solo se revisan los suyos.
 */
export async function quitarAvisosQueNoEstan(enServidor: Aviso[], peregrino?: number): Promise<void> {
  const hay = new Set(enServidor.map((a) => a.id))
  const enCola = new Set(
    (await leerCola()).flatMap((p) => (p.tipo === 'aviso' ? [p.aviso.id] : [])),
  )
  const fuera = estado.avisos.filter(
    (a) => (peregrino == null || a.peregrino === peregrino) && !hay.has(a.id) && !enCola.has(a.id),
  )
  if (!fuera.length) return
  const ids = new Set(fuera.map((a) => a.id))
  estado.avisos = estado.avisos.filter((a) => !ids.has(a.id))
  avisar()
  const tx = (await base()).transaction('avisos', 'readwrite')
  await Promise.all([...fuera.map((a) => tx.store.delete(a.id)), tx.done])
}

/** Para la demo: empezar de cero. */
export async function borrarTodo(): Promise<void> {
  const d = await base()
  for (const s of ['padron', 'marcas', 'avisos', 'cola', 'meta']) await d.clear(s)
  estado.padron = []
  estado.marcas = new Map()
  estado.avisos = []
  estado.pendientes = 0
  avisar()
}

export async function sembrarDemo(): Promise<void> {
  const { padron, marcas, avisos } = datosDemo()
  await reemplazarPadron(padron)
  await aplicarRemotas(marcas)
  await aplicarAvisos(avisos)
}

/** Navegar sin recargar, conservando el ?demo si está. */
export function ir(ruta: string): void {
  history.pushState(null, '', ruta + location.search)
  dispatchEvent(new PopStateEvent('popstate'))
}
