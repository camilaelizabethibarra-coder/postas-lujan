/**
 * Las reglas del negocio, sin IndexedDB ni red: todo lo que decide qué
 * marca vale y por dónde va cada uno. Es lo que más importa que esté bien,
 * y por eso vive aparte y con pruebas.
 */
import type { Tramo } from './padron'
import { seEsperaEn, primeraPosta } from './postas'
import type { PostaFila } from './supabase'

export type Via = 'resp' | 'peregrino'

export type Marca = {
  peregrino: number
  posta: string
  presente: boolean
  via: Via
  marcado_en: string
}

export type Aviso = {
  id: string
  peregrino: number
  /**
   * bajo / ayuda: pedidos de auxilio, el equipo tiene que hacer algo.
   * micro / camina: el peregrino dejó de caminar y se subió al micro, o volvió
   * a caminar. No son alarma: cambian a qué paradas se lo espera.
   */
  tipo: 'bajo' | 'ayuda' | 'micro' | 'camina'
  desde_posta: string | null
  creado_en: string
  resuelto: boolean
  /** Dónde estaba al pedir ayuda, si el GPS respondió. Solo la ve el equipo. */
  lat?: number | null
  lng?: number | null
  precision_m?: number | null
  ubic_en?: string | null
}

export type Ubicacion = { lat: number; lng: number; precision_m: number | null; ubic_en: string }

export type Persona = {
  numero: number
  apellido: string
  nombre: string
  micro: string | null
  tel?: string | null
  tel_emerg?: string | null
  tramo: Tramo
  es_equipo: boolean
  nota: string | null
  activo: boolean
  /** Restricción alimentaria. Solo llega con sesión de equipo. */
  comida?: string | null
  /** Ya tiene salida definida (planilla o elegida): no se le pregunta. */
  salida_ok?: boolean
}

export const clave = (posta: string, peregrino: number) => `${posta}|${peregrino}`

/** Los que piden que el equipo haga algo. "Dejé de caminar" no es uno de esos. */
export const esPedido = (a: Aviso) => a.tipo === 'bajo' || a.tipo === 'ayuda'

/** Mientras va en el micro, la próxima parada donde se lo espera es Luján (orden 4). */
export const ORDEN_LUJAN = 4

/** Quiénes van en el micro ahora: su último "dejé de caminar" es más nuevo que su último "volví a caminar". */
export function enMicro(avisos: Aviso[]): Set<number> {
  const ultimo = new Map<number, Aviso>()
  for (const a of avisos) {
    if (a.tipo !== 'micro' && a.tipo !== 'camina') continue
    const u = ultimo.get(a.peregrino)
    if (!u || a.creado_en > u.creado_en) ultimo.set(a.peregrino, a)
  }
  return new Set([...ultimo.values()].filter((a) => a.tipo === 'micro').map((a) => a.peregrino))
}

/**
 * ¿La marca nueva reemplaza a la que ya hay para ese (peregrino, posta)?
 * Es la misma regla que aplica marcar_lote en la base: gana la más reciente,
 * salvo que sea el peregrino queriendo tapar una confirmación del responsable.
 */
export function reemplaza(nueva: Marca, vieja: Marca | undefined): boolean {
  if (!vieja) return true
  if (Date.parse(nueva.marcado_en) <= Date.parse(vieja.marcado_en)) return false
  if (vieja.via === 'resp' && vieja.presente && nueva.via === 'peregrino') return false
  return true
}

export type Marcas = Map<string, Marca>

export function marcaDe(marcas: Marcas, posta: string, peregrino: number): Marca | undefined {
  const m = marcas.get(clave(posta, peregrino))
  return m && m.presente ? m : undefined
}

/** El presente que vale: el que marcó el equipo. Un "Llegué" del peregrino solo lo declara. */
export function confirmada(marcas: Marcas, posta: string, peregrino: number): Marca | undefined {
  const m = marcaDe(marcas, posta, peregrino)
  return m && m.via === 'resp' ? m : undefined
}

/** Índice de la última posta donde figura presente, o -1. */
export function ultimaPosta(marcas: Marcas, postas: PostaFila[], peregrino: number): number {
  for (let i = postas.length - 1; i >= 0; i--) {
    if (marcaDe(marcas, postas[i]!.id, peregrino)) return i
  }
  return -1
}

/**
 * La posta que le toca marcar al peregrino: la siguiente a la última donde
 * figura, no la primera que le falta. Si se olvidó de marcar La Reja y ya
 * marcó General Rodríguez, no tiene sentido volver a ofrecerle La Reja.
 * Devuelve -1 cuando ya pasó por todas.
 */
export function proximaPosta(marcas: Marcas, postas: PostaFila[], persona: Persona, micro = false): number {
  const desde = ultimaPosta(marcas, postas, persona.numero) + 1
  for (let i = desde; i < postas.length; i++) {
    const o = postas[i]!.orden
    if (seEsperaEn(persona.tramo, o) && (!micro || o >= ORDEN_LUJAN)) return i
  }
  return -1
}

/** A quién se espera en una posta: activos, con el tramo que la incluye, o que igual marcaron. */
export function esperadosEn(
  padron: Persona[], marcas: Marcas, posta: PostaFila, micro: Set<number> = new Set(),
): Persona[] {
  // el equipo no es peregrino: no se le toma lista
  return padron.filter(
    (p) =>
      p.activo && !p.es_equipo &&
      ((seEsperaEn(p.tramo, posta.orden) && !(micro.has(p.numero) && posta.orden < ORDEN_LUJAN)) ||
        marcaDe(marcas, posta.id, p.numero)),
  )
}

export type Grupo = { indice: number; gente: Persona[]; atras: boolean }

/**
 * "Dónde están": cada uno en la última posta donde apareció, de adelante hacia
 * atrás. Quedó atrás quien está dos postas o más detrás del que va primero.
 * Quien solo vuelve de Luján y todavía no apareció no es una alarma: va aparte.
 */
export function dondeEstan(padron: Persona[], marcas: Marcas, postas: PostaFila[], micro: Set<number> = new Set()) {
  const indiceLujan = postas.findIndex((p) => p.orden >= ORDEN_LUJAN)
  // los que van en el micro y todavía no llegaron a Luján van aparte: no son alarma
  const vanEnMicro = padron.filter(
    (p) => p.activo && !p.es_equipo && micro.has(p.numero) && ultimaPosta(marcas, postas, p.numero) < indiceLujan,
  )
  const activos = padron.filter((p) => p.activo && !p.es_equipo && !vanEnMicro.includes(p))
  const ultima = new Map<number, number>()
  let frente = -1
  for (const p of activos) {
    const u = ultimaPosta(marcas, postas, p.numero)
    ultima.set(p.numero, u)
    if (u > frente) frente = u
  }

  // Sin registro y con la primera posta que le toca todavía por delante del
  // grupo: se suma más adelante (La Reja, Rodríguez, Liniers, solo vuelta).
  const seSuma = (p: Persona) =>
    ultima.get(p.numero) === -1 && primeraPosta(p.tramo) - 1 > frente

  const grupos: Grupo[] = []
  for (let i = postas.length - 1; i >= -1; i--) {
    const gente = activos.filter((p) => ultima.get(p.numero) === i && !(i === -1 && seSuma(p)))
    if (gente.length) grupos.push({ indice: i, gente, atras: frente - i >= 2 })
  }
  const soloVuelta = activos.filter(seSuma)
  return { grupos, soloVuelta, frente, vanEnMicro }
}
