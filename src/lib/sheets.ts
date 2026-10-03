/**
 * Conexión con la planilla de Google Sheets.
 *
 * La planilla tiene un Apps Script chiquito (scripts/apps-script.gs) publicado
 * como aplicación web: devuelve la pestaña APP como texto, solo si se le pasa
 * la clave correcta. El celular del coordinador la trae cada 5 minutos cuando
 * hay señal y la pasa por el mismo importador que el Excel. Así la planilla
 * se puede seguir editando y la app la toma sola.
 *
 * La URL y la clave viven solo en el celular del coordinador: la planilla
 * tiene DNI y teléfonos, y no se publica en ningún lado.
 */
import { importar } from './padron'
import { estado, avisar } from './datos'
import { importarPadron, tokenGuardado, rolGuardado } from './supabase'
import { refrescarPadron } from './sync'

const CLAVE_CONF = 'postas:sheets'
const CADA = 5 * 60_000

export type ConfSheets = { url: string; clave: string }
export type ResultadoSheets = { cuando: string; ok: boolean; texto: string }

let ultimo: ResultadoSheets | null = null
export const ultimoSheets = () => ultimo

export function confSheets(): ConfSheets | null {
  try { return JSON.parse(localStorage.getItem(CLAVE_CONF) || 'null') } catch { return null }
}
export function guardarConfSheets(c: ConfSheets | null): void {
  try {
    if (c) localStorage.setItem(CLAVE_CONF, JSON.stringify(c))
    else localStorage.removeItem(CLAVE_CONF)
  } catch { /* nada */ }
}

/** Trae la planilla y la carga. Devuelve un texto para mostrarle al coordinador. */
export async function traerDeSheets(forzar = false): Promise<ResultadoSheets> {
  const c = confSheets()
  const fin = (ok: boolean, texto: string) => {
    ultimo = { cuando: new Date().toISOString(), ok, texto }
    avisar()
    return ultimo
  }
  if (!c) return fin(false, 'Falta conectar la planilla.')
  if (rolGuardado() !== 'coordinador') return fin(false, 'Solo el equipo coordinador carga la planilla.')
  let texto: string
  try {
    const r = await fetch(`${c.url}?clave=${encodeURIComponent(c.clave)}`, { cache: 'no-store' })
    const j = await r.json()
    if (!j.ok) return fin(false, j.error || 'La planilla no respondió bien.')
    texto = j.texto
  } catch {
    return fin(false, 'Sin señal o el link de la planilla no responde.')
  }
  const { filas } = importar(texto)
  // red de seguridad: si la planilla viene mucho más corta que lo que hay,
  // algo pasó (alguien borró filas, una pestaña equivocada): no se carga
  const hoy = estado.padron.filter((p) => p.activo).length
  if (!forzar && hoy > 20 && filas.length < hoy * 0.8) {
    return fin(false, `La planilla trae ${filas.length} personas y hoy hay ${hoy}. No la cargué por las dudas: revisala.`)
  }
  try {
    const n = await importarPadron(tokenGuardado()!, filas.map(({ en_micro: _, ...f }) => f))
    await refrescarPadron()
    return fin(true, `${n} personas al día desde la planilla.`)
  } catch {
    return fin(false, 'No pude guardar lo de la planilla (¿sesión o señal?).')
  }
}

let intervalo: ReturnType<typeof setInterval> | undefined
/** El celular del coordinador trae la planilla sola cada 5 minutos. */
export function sincronizarSheetsSolo(): void {
  if (intervalo || !confSheets()) return
  traerDeSheets()
  intervalo = setInterval(() => { if (navigator.onLine) traerDeSheets() }, CADA)
}
