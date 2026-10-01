/**
 * Exportar para volver a la planilla: una fila por persona, una columna por
 * posta con la hora de paso. Si lo declaró el peregrino y nadie lo confirmó,
 * la hora lleva "(declaró)", para que en la planilla también se distinga.
 */
import type { PostaFila } from './supabase'
import { marcaDe, type Marcas, type Persona } from './regla'

export function hora(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function campo(v: string, sep: string): string {
  return v.includes(sep) || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v
}

/** sep ',' para descargar como .csv; '\t' para copiar y pegar directo en Sheets o Excel. */
export function tabla(padron: Persona[], marcas: Marcas, postas: PostaFila[], sep = ','): string {
  const enc = ['numero', 'apellido', 'nombre', 'micro', ...postas.map((p) => p.nombre)]
  const filas = padron.map((p) => [
    p.es_equipo ? `EQUIPO (${p.numero})` : String(p.numero),
    p.apellido,
    p.nombre,
    p.micro ?? '',
    ...postas.map((po) => {
      const m = marcaDe(marcas, po.id, p.numero)
      if (!m) return ''
      return m.via === 'resp' ? hora(m.marcado_en) : `${hora(m.marcado_en)} (declaró)`
    }),
  ])
  return [enc, ...filas].map((f) => f.map((c) => campo(c, sep)).join(sep)).join('\n')
}
