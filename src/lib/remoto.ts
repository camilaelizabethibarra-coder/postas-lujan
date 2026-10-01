/**
 * Todo lo que habla con el servidor, detrás de una sola interfaz. Hay dos:
 * la de verdad, contra Supabase, y la de la demo, que simula la red para
 * poder mostrar la cola y el estado de conexión sin tocar ninguna base.
 */
import type { Aviso, Marca, Persona, Ubicacion } from './regla'
import { supa } from './supabase'
import { esDemo, demoSinSenal } from './demo'

export type MarcaServidor = Marca & { subido_en: string }

export class ErrorSesion extends Error {}
/**
 * La base rechazó algo que apunta a una persona o posta que ya no existe (por
 * ejemplo, marcas de prueba en un celular después de cambiar de base). No se
 * va a arreglar reintentando: quien sube lo descarta en vez de trabar la cola.
 */
export class ErrorHuerfano extends Error {}

export interface Remoto {
  subirMarcas(token: string | null, marcas: Marca[]): Promise<void>
  subirAvisos(avisos: Aviso[]): Promise<void>
  resolver(token: string | null, id: string): Promise<void>
  elegirSalida(numero: number, tramo: string): Promise<void>
  bajarUbicaciones(token: string | null): Promise<(Ubicacion & { aviso: string; tomada_en: string })[]>
  bajarMarcas(desde: string | null, peregrino?: number): Promise<MarcaServidor[]>
  bajarAvisos(peregrino?: number): Promise<Aviso[]>
  bajarPadron(token: string | null): Promise<Persona[] | null>
  escuchar(alMarca: (m: Marca) => void, alAviso: (a: Aviso) => void): () => void
}

// ---------------------------------------------------------------------------

/** En la ruta, un pedido puede quedar colgado minutos. Mejor cortarlo y reintentar. */
const ESPERA = 12_000

function conTope<T>(p: PromiseLike<T>): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, no) => setTimeout(() => no(new Error('tiempo agotado')), ESPERA)),
  ])
}

function revisar(error: { message: string; code?: string } | null): void {
  if (!error) return
  if (error.code === '42501' || /sesi[oó]n/i.test(error.message)) throw new ErrorSesion(error.message)
  if (error.code === '23503') throw new ErrorHuerfano(error.message)
  throw new Error(error.message)
}

const supabaseRemoto: Remoto = {
  async subirMarcas(token, marcas) {
    const db = await supa()
    const { error } = await conTope(db.rpc('marcar_lote', { p_token: token ?? '', p_marcas: marcas }))
    revisar(error)
  },

  async subirAvisos(avisos) {
    const db = await supa()
    const { error } = await conTope(db.rpc('crear_avisos', { p_avisos: avisos }))
    revisar(error)
  },

  async resolver(token, id) {
    const db = await supa()
    const { error } = await conTope(db.rpc('resolver_aviso', { p_token: token ?? '', p_id: id }))
    revisar(error)
  },

  async elegirSalida(numero, tramo) {
    const db = await supa()
    const { error } = await conTope(db.rpc('elegir_salida', { p_numero: numero, p_tramo: tramo }))
    revisar(error)
  },

  async bajarUbicaciones(token) {
    const db = await supa()
    const { data, error } = await conTope(db.rpc('ubicaciones_avisos', { p_token: token ?? '' }))
    revisar(error)
    return (data ?? []) as (Ubicacion & { aviso: string; tomada_en: string })[]
  },

  async bajarMarcas(desde, peregrino) {
    const db = await supa()
    let q = db.from('marcas').select('*').order('subido_en').limit(2000)
    if (desde) q = q.gte('subido_en', desde)
    if (peregrino != null) q = q.eq('peregrino', peregrino)
    const { data, error } = await conTope(q)
    revisar(error)
    return (data ?? []) as MarcaServidor[]
  },

  async bajarAvisos(peregrino) {
    const db = await supa()
    let q = db.from('avisos').select('*').order('creado_en', { ascending: false }).limit(500)
    if (peregrino != null) q = q.eq('peregrino', peregrino)
    const { data, error } = await conTope(q)
    revisar(error)
    return (data ?? []) as Aviso[]
  },

  async bajarPadron(token) {
    const db = await supa()
    if (token) {
      const { data, error } = await conTope(db.rpc('padron_completo', { p_token: token }))
      revisar(error)
      return (data ?? []) as Persona[]
    }
    const { data, error } = await conTope(db.from('padron').select('*').order('numero'))
    revisar(error)
    return (data ?? []) as Persona[]
  },

  escuchar(alMarca, alAviso) {
    let cerrar = () => {}
    let cancelado = false
    supa().then((db) => {
      if (cancelado) return
      const canal = db
        .channel('postas')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'marcas' },
          (p) => p.new && alMarca(p.new as Marca))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'avisos' },
          (p) => p.new && alAviso(p.new as Aviso))
        .subscribe()
      cerrar = () => { db.removeChannel(canal) }
    })
    return () => { cancelado = true; cerrar() }
  },
}

// ---------------------------------------------------------------------------

/** La demo: "sube" después de un rato, salvo que se esté simulando que no hay señal. */
async function red(): Promise<void> {
  await new Promise((r) => setTimeout(r, 700))
  if (demoSinSenal()) throw new Error('sin señal (simulado)')
}

const demoRemoto: Remoto = {
  subirMarcas: red,
  subirAvisos: red,
  resolver: red,
  elegirSalida: red,
  async bajarUbicaciones() { await red(); return [] },
  async bajarMarcas() { await red(); return [] },
  async bajarAvisos() { await red(); return [] },
  async bajarPadron() { await red(); return null },
  escuchar() { return () => {} },
}

export const remoto: Remoto = esDemo() ? demoRemoto : supabaseRemoto
