import { describe, it, expect } from 'vitest'
import { reemplaza, proximaPosta, dondeEstan, esperadosEn, enMicro, clave, type Aviso, type Marca, type Persona } from './regla'
import { tabla } from './exportar'
import { POSTAS_POR_DEFECTO as POSTAS } from './postas'

const t = (min: number) => new Date(Date.UTC(2026, 9, 3, 10, min)).toISOString()
const m = (peregrino: number, posta: string, min: number, via: Marca['via'] = 'resp', presente = true): Marca =>
  ({ peregrino, posta, presente, via, marcado_en: t(min) })
const mapa = (...ms: Marca[]) => new Map(ms.map((x) => [clave(x.posta, x.peregrino), x]))
const persona = (numero: number, extra: Partial<Persona> = {}): Persona => ({
  numero, apellido: 'P' + numero, nombre: 'N', micro: null, tramo: 'completo',
  es_equipo: false, nota: null, activo: true, ...extra,
})

describe('reemplaza', () => {
  it('gana la más reciente', () => {
    expect(reemplaza(m(1, 'po1', 5), m(1, 'po1', 3))).toBe(true)
    expect(reemplaza(m(1, 'po1', 3), m(1, 'po1', 5))).toBe(false)
  })

  it('una vieja que sube tarde no pisa una nueva, aunque el formato de hora sea otro', () => {
    const delServidor = { ...m(1, 'po1', 5), marcado_en: '2026-10-03T10:05:00+00:00' }
    expect(reemplaza(m(1, 'po1', 4), delServidor)).toBe(false)
  })

  it('el peregrino no tapa lo que confirmó el responsable', () => {
    expect(reemplaza(m(1, 'po1', 9, 'peregrino'), m(1, 'po1', 3, 'resp'))).toBe(false)
    expect(reemplaza(m(1, 'po1', 9, 'peregrino', false), m(1, 'po1', 3, 'resp'))).toBe(false)
  })

  it('pero sí puede declarar si el responsable lo había desmarcado', () => {
    expect(reemplaza(m(1, 'po1', 9, 'peregrino'), m(1, 'po1', 3, 'resp', false))).toBe(true)
  })

  it('el responsable confirma lo que declaró el peregrino', () => {
    expect(reemplaza(m(1, 'po1', 9, 'resp'), m(1, 'po1', 3, 'peregrino'))).toBe(true)
  })
})

describe('proximaPosta', () => {
  it('es la siguiente a la última marcada, no la primera que falta', () => {
    const marcas = mapa(m(1, 'po1', 1), m(1, 'po3', 2))
    expect(proximaPosta(marcas, POSTAS, persona(1))).toBe(3)
  })

  it('una desmarcada no cuenta', () => {
    const marcas = mapa(m(1, 'po1', 1), m(1, 'po2', 2, 'resp', false))
    expect(proximaPosta(marcas, POSTAS, persona(1))).toBe(1)
  })

  it('al que solo vuelve le toca directamente el micro', () => {
    expect(proximaPosta(new Map(), POSTAS, persona(1, { tramo: 'solo_vuelta' }))).toBe(4)
  })

  it('-1 cuando pasó por todas', () => {
    expect(proximaPosta(mapa(m(1, 'po5', 1)), POSTAS, persona(1))).toBe(-1)
  })
})

describe('dondeEstan', () => {
  it('agrupa por última posta y marca a los que quedaron dos o más atrás', () => {
    const padron = [persona(1), persona(2), persona(3), persona(4, { tramo: 'solo_vuelta' })]
    const marcas = mapa(m(1, 'po1', 1), m(1, 'po2', 2), m(1, 'po3', 3), m(2, 'po1', 1), m(2, 'po2', 2))
    const { grupos, soloVuelta } = dondeEstan(padron, marcas, POSTAS)
    expect(grupos.map((g) => [g.indice, g.gente.map((p) => p.numero), g.atras])).toEqual([
      [2, [1], false],
      [1, [2], false],
      [-1, [3], true],
    ])
    expect(soloVuelta.map((p) => p.numero)).toEqual([4])
  })
})

describe('exportar', () => {
  it('una columna por posta, con hora y si fue declarado', () => {
    const marcas = mapa(m(7, 'po1', 5), m(7, 'po2', 30, 'peregrino'))
    const csv = tabla([persona(7, { apellido: 'PEREZ, ANA' })], marcas, POSTAS)
    const [enc, fila] = csv.split('\n')
    expect(enc).toContain('La Reja')
    expect(fila).toContain('"PEREZ, ANA"')
    expect(fila).toMatch(/\d\d:05,\d\d:30 \(declaró\),,,$/)
  })
})

describe('salidas', () => {
  it('quien sale desde La Reja o Liniers no se espera en Morón', () => {
    expect(proximaPosta(new Map(), POSTAS, persona(1, { tramo: 'desde_reja' }))).toBe(1)
    expect(proximaPosta(new Map(), POSTAS, persona(1, { tramo: 'liniers' }))).toBe(1)
    expect(proximaPosta(new Map(), POSTAS, persona(1, { tramo: 'desde_rodriguez' }))).toBe(2)
    const esperados = esperadosEn([persona(1), persona(2, { tramo: 'desde_reja' })], new Map(), POSTAS[0]!)
    expect(esperados.map((p) => p.numero)).toEqual([1])
  })

  it('los que se suman más adelante no aparecen como quedados atrás', () => {
    const marcas = mapa(m(1, 'po1', 1), m(1, 'po2', 2))
    const padron = [persona(1), persona(2, { tramo: 'desde_rodriguez' }), persona(3)]
    const { grupos, soloVuelta } = dondeEstan(padron, marcas, POSTAS)
    expect(soloVuelta.map((p) => p.numero)).toEqual([2])
    expect(grupos.find((g) => g.indice === -1)!.gente.map((p) => p.numero)).toEqual([3])
  })
})

describe('dejé de caminar', () => {
  const av = (peregrino: number, tipo: Aviso['tipo'], min: number): Aviso =>
    ({ id: `${peregrino}-${min}`, peregrino, tipo, desde_posta: null, creado_en: t(min), resuelto: false })

  it('gana el último: micro, después camina, después micro', () => {
    expect([...enMicro([av(1, 'micro', 1)])]).toEqual([1])
    expect([...enMicro([av(1, 'micro', 1), av(1, 'camina', 2)])]).toEqual([])
    expect([...enMicro([av(1, 'camina', 3), av(1, 'micro', 1), av(1, 'micro', 5)])]).toEqual([1])
    expect([...enMicro([av(1, 'ayuda', 1)])]).toEqual([])
  })

  it('en el micro la próxima parada es Luján y no se lo espera en el medio', () => {
    const marcas = mapa(m(1, 'po1', 1))
    expect(proximaPosta(marcas, POSTAS, persona(1), true)).toBe(3)
    expect(proximaPosta(marcas, POSTAS, persona(1), false)).toBe(1)
    const micro = new Set([1])
    expect(esperadosEn([persona(1), persona(2)], marcas, POSTAS[1]!, micro).map((p) => p.numero)).toEqual([2])
    expect(esperadosEn([persona(1), persona(2)], marcas, POSTAS[3]!, micro).map((p) => p.numero)).toEqual([1, 2])
  })

  it('"Dónde están" los pone aparte, no como quedados atrás', () => {
    const marcas = mapa(m(1, 'po1', 1), m(2, 'po1', 1), m(2, 'po2', 2), m(2, 'po3', 3))
    const r = dondeEstan([persona(1), persona(2)], marcas, POSTAS, new Set([1]))
    expect(r.vanEnMicro.map((p) => p.numero)).toEqual([1])
    expect(r.grupos.some((g) => g.gente.some((p) => p.numero === 1))).toBe(false)
  })
})
