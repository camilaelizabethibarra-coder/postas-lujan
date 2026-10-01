import type { PostaFila } from './supabase'

/**
 * Las cinco postas, en orden. Están fijas en el código además de en la base
 * porque un celular que abre la app sin señal tiene que poder dibujar la
 * pantalla igual. La base manda si contesta; esto es la red de contención.
 *
 * La quinta no es un detalle administrativo: llegar a la Basílica y subirse
 * al micro de vuelta son dos momentos distintos, y el segundo es el que evita
 * dejar a alguien en Luján.
 */
export const POSTAS_POR_DEFECTO: PostaFila[] = [
  { id: 'po1', orden: 1, nombre: 'Morón — salida' },
  { id: 'po2', orden: 2, nombre: 'La Reja' },
  { id: 'po3', orden: 3, nombre: 'General Rodríguez' },
  { id: 'po4', orden: 4, nombre: 'Luján — llegada' },
  { id: 'po5', orden: 5, nombre: 'Luján — subida al micro' },
]

/** Lo que dice el botón. La última no es "Llegué a Luján" otra vez: es subirse al micro. */
export function textoLlegue(p: PostaFila): string {
  return /micro/i.test(p.nombre) ? 'Ya subí al micro' : `Llegué a ${nombreCorto(p.nombre)}`
}
export function textoListo(p: PostaFila): string {
  return /micro/i.test(p.nombre) ? '¡Subiste al micro! Gracias por peregrinar' : `Llegaste a ${nombreCorto(p.nombre)}`
}

/** Nombre corto para el botón del peregrino: "Llegué a La Reja". */
export function nombreCorto(nombre: string): string {
  return nombre.split(' — ')[0] ?? nombre
}

/**
 * Quién se espera en cada posta. El que solo vuelve de Luján no camina, así
 * que no cuenta como faltante en las cuatro primeras: si contara, figuraría
 * en rojo en "Dónde están" durante toda la peregrinación y el equipo dejaría
 * de mirar esa pantalla.
 */
export function seEsperaEn(tramo: string, orden: number): boolean {
  return orden >= primeraPosta(tramo)
}

/**
 * Desde qué posta (orden) se espera a cada uno. Los de Liniers van por su
 * cuenta y se suman al grupo en las paradas siguientes: no se los espera en
 * la salida de Morón.
 */
export function primeraPosta(tramo: string): number {
  switch (tramo) {
    case 'desde_reja':
    case 'liniers':
      return 2
    case 'desde_rodriguez':
      return 3
    case 'solo_vuelta':
      return 5
    default:
      return 1
  }
}

/** Lo que ve el peregrino al elegir desde dónde sale, y la hora de encuentro en la parroquia. */
export const SALIDAS: { tramo: string; nombre: string; cita: string }[] = [
  { tramo: 'completo', nombre: 'Morón', cita: 'A las 7:00 en la parroquia' },
  { tramo: 'desde_reja', nombre: 'La Reja', cita: 'A las 9:00 en la parroquia' },
  { tramo: 'desde_rodriguez', nombre: 'Rodríguez', cita: 'A las 9:00 en la parroquia' },
  { tramo: 'liniers', nombre: 'Liniers', cita: 'Vas por tu cuenta y te sumás al grupo en las próximas paradas' },
]

/**
 * Las viandas se marcan como una "posta" más que no es un lugar: marcar ahí es
 * "le entregamos la vianda". Así reusa la cola sin señal y la regla de
 * conflictos tal cual. No va en POSTAS_POR_DEFECTO: no es parte del recorrido.
 */
export const POSTA_VIANDA: PostaFila = { id: 'vianda', orden: 90, nombre: 'Viandas' }

/** "CELIACA" → "Celíaca"; lo que no se reconoce queda como vino. null = sin restricción. */
export function comidaDe(crudo: string | null | undefined): string | null {
  const t = (crudo ?? '').trim()
  if (!t) return null
  const n = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  if (/^SIN RESTRIC/.test(n)) return null
  if (/CELIAC/.test(n)) return 'Celíaca'
  if (/VEGAN/.test(n)) return 'Vegana'
  if (/VEGETARIAN/.test(n)) return 'Vegetariana'
  if (/GLUTEN/.test(n) && /LACTOSA/.test(n)) return 'Sin gluten y sin lactosa'
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
}
