/**
 * Cliente de Supabase, cargado tarde y a propósito.
 *
 * supabase-js pesa más que todo el resto de la app junta. Como todo lo que
 * se ve en pantalla sale de IndexedDB, no hay una sola pantalla que necesite
 * esperarlo para dibujarse. Entra por import() dinámico y queda en su propio
 * archivo, así el primer load por la red de la parroquia no lo arrastra.
 *
 * Nadie llama a este módulo en el camino crítico de marcar: marcar escribe
 * local y encola. Esto es solo para sincronizar.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { esDemo } from './demo'

const URL = import.meta.env.VITE_SUPABASE_URL as string
const CLAVE = import.meta.env.VITE_SUPABASE_ANON_KEY as string

let promesa: Promise<SupabaseClient> | null = null

export function hayConfig(): boolean {
  return Boolean(URL && CLAVE)
}

export function supa(): Promise<SupabaseClient> {
  if (!promesa) {
    promesa = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(URL, CLAVE, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 5 } },
      }),
    )
  }
  return promesa
}

// ---------------------------------------------------------------------------
// Reloj
//
// marcado_en sale del reloj del celular, y algún celular va a tener la hora
// corrida. Guardamos el desfasaje contra el servidor la primera vez que hay
// señal y lo aplicamos a cada marca, para que un reloj mal puesto no reordene
// las marcas de los demás cuando suban.
// ---------------------------------------------------------------------------

const CLAVE_DESFASE = 'postas:desfase-reloj'
let desfase = Number(localStorage.getItem(CLAVE_DESFASE) || 0)

export function ahora(): string {
  return new Date(Date.now() + desfase).toISOString()
}

export function desfaseActual(): number {
  return desfase
}

/** Se llama al conectar. El error no importa: si falla, seguimos con el reloj local. */
export async function sincronizarReloj(): Promise<void> {
  try {
    const t0 = Date.now()
    const r = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: CLAVE }, cache: 'no-store' })
    const t1 = Date.now()
    const fecha = r.headers.get('date')
    if (!fecha) return
    // se descuenta la mitad del viaje de ida y vuelta
    const servidor = new Date(fecha).getTime() + (t1 - t0) / 2
    const nuevo = Math.round(servidor - t1)
    // menos de 2 segundos no vale la pena corregir
    if (Math.abs(nuevo) < 2000) return
    desfase = nuevo
    localStorage.setItem(CLAVE_DESFASE, String(desfase))
  } catch {
    /* sin señal: seguimos con el reloj del celular */
  }
}

// ---------------------------------------------------------------------------
// Sesión de responsable
// ---------------------------------------------------------------------------

// la demo guarda su sesión aparte: probarla no cierra la sesión de verdad
const PREFIJO = esDemo() ? 'postas-demo:' : 'postas:'
const CLAVE_TOKEN = PREFIJO + 'token'
const CLAVE_POSTA = PREFIJO + 'posta'

/** Solo para la demo, que no pide PIN. */
export function entrarSinPin(posta: string): void {
  localStorage.setItem(CLAVE_TOKEN, 'demo')
  localStorage.setItem(CLAVE_POSTA, posta)
}

export function tokenGuardado(): string | null {
  return localStorage.getItem(CLAVE_TOKEN)
}

export function postaGuardada(): string | null {
  return localStorage.getItem(CLAVE_POSTA)
}

export function cerrarSesion(): void {
  localStorage.removeItem(CLAVE_TOKEN)
  localStorage.removeItem(CLAVE_POSTA)
}

export async function abrirPosta(posta: string, pin: string): Promise<string> {
  const db = await supa()
  const { data, error } = await db.rpc('abrir_posta', { p_posta: posta, p_pin: pin })
  if (error) throw new Error(error.message.includes('PIN') ? 'PIN incorrecto' : error.message)
  localStorage.setItem(CLAVE_TOKEN, data as string)
  localStorage.setItem(CLAVE_POSTA, posta)
  return data as string
}

// ---------------------------------------------------------------------------
// Lecturas y escrituras
// ---------------------------------------------------------------------------

export type PostaFila = { id: string; orden: number; nombre: string }

export async function traerPostas(): Promise<PostaFila[]> {
  const db = await supa()
  const { data, error } = await db.from('postas_publicas').select('id,orden,nombre').order('orden')
  if (error) throw new Error(error.message)
  return (data ?? []) as PostaFila[]
}

/** El padrón público: sin teléfonos. Es el que usa el peregrino para identificarse. */
export async function traerPadron() {
  const db = await supa()
  const { data, error } = await db.from('padron').select('*').order('numero')
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Con teléfonos. Exige sesión de responsable. */
export async function traerPadronCompleto(token: string) {
  const db = await supa()
  const { data, error } = await db.rpc('padron_completo', { p_token: token })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function importarPadron(token: string, filas: unknown[]): Promise<number> {
  const db = await supa()
  const { data, error } = await db.rpc('importar_padron', { p_token: token, p_filas: filas })
  if (error) throw new Error(error.message)
  return (data as number) ?? 0
}
