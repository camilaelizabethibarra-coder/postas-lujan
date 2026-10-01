/**
 * Importador del padrón.
 *
 * Entra texto pegado desde la planilla de la parroquia (Excel, Sheets o un
 * CSV) y salen filas listas para la base, más una lista de avisos para
 * mostrarle a quien importa.
 *
 * Dos cosas que hace este archivo y conviene no perder de vista:
 *
 * 1. Tira a la basura las columnas sensibles aunque se las peguen. DNI y
 *    pagos no entran a la app ni por accidente. La regla se aplica acá, en el
 *    borde, en vez de confiar en que quien pega recorte bien. La comida
 *    (restricción alimentaria) sí entra, para entregar las viandas, pero la
 *    base la guarda donde solo la ve el equipo con PIN.
 *
 * 2. Lee la columna de notas y saca de ahí dos cosas operativas: quién hace
 *    solo la vuelta desde Luján, y quién se suma en el camino. Esas notas
 *    en la planilla están mezcladas con anotaciones de pago, que se
 *    descartan.
 */

export type Tramo = 'completo' | 'desde_reja' | 'desde_rodriguez' | 'liniers' | 'solo_vuelta'

export type Fila = {
  numero: number
  apellido: string
  nombre: string
  micro: string | null
  tel: string | null
  tel_emerg: string | null
  tramo: Tramo
  es_equipo: boolean
  nota: string | null
  activo: boolean
  /** Restricción alimentaria. null = sin restricción. */
  comida: string | null
  /** La planilla trae la salida: la app no se la pregunta al peregrino. */
  salida_ok: boolean
  /** Arranca en el micro (por ejemplo, lesionado). Solo para la app, no va a la base. */
  en_micro?: boolean
}

export type Aviso = { tono: 'info' | 'ojo'; texto: string }

export type Resultado = {
  filas: Fila[]
  avisos: Aviso[]
}

/** Primer número que se le asigna al equipo, que en la planilla no tiene. */
const BASE_EQUIPO = 901

// --------------------------------------------------------------------------
// texto
// --------------------------------------------------------------------------

/** Mayúsculas y sin acentos, para comparar y para buscar. */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
}

/** Separa una línea de CSV respetando las comillas: "$35,000" es un campo. */
function partir(linea: string, sep: string): string[] {
  const campos: string[] = []
  let actual = ''
  let entreComillas = false

  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"'
        i++
      } else {
        entreComillas = !entreComillas
      }
    } else if (c === sep && !entreComillas) {
      campos.push(actual)
      actual = ''
    } else {
      actual += c
    }
  }
  campos.push(actual)
  return campos.map((c) => c.trim())
}

/** Tabulación si viene de Excel, punto y coma si viene de un Sheets en es-AR. */
function detectarSeparador(linea: string): string {
  const fuera = linea.replace(/"[^"]*"/g, '')
  const tabs = (fuera.match(/\t/g) || []).length
  const puntoComa = (fuera.match(/;/g) || []).length
  const comas = (fuera.match(/,/g) || []).length
  if (tabs >= puntoComa && tabs >= comas) return '\t'
  if (puntoComa >= comas) return ';'
  return ','
}

// --------------------------------------------------------------------------
// columnas
// --------------------------------------------------------------------------

type Campo =
  | 'numero' | 'apellido' | 'nombre' | 'micro' | 'tel' | 'tel_emerg' | 'nota' | 'salida' | 'comida'
  | 'DESCARTAR'

/**
 * Qué significa cada encabezado. El orden importa: "CEL DE EMERGENCIA" tiene
 * que reconocerse antes que "CEL" a secas.
 */
const ENCABEZADOS: [RegExp, Campo][] = [
  [/DNI|DOCUMENTO/, 'DESCARTAR'],
  [/\$|ABONA|PAGO|IMPORTE|SE(N|Ñ)A/, 'DESCARTAR'],
  [/EMERGENC/, 'tel_emerg'],
  [/NUMERO|^N(RO|°|º)?$|^#$/, 'numero'],
  [/APELLIDO/, 'apellido'],
  [/NOMBRE/, 'nombre'],
  [/MICRO|COMBI|COLECTIVO|^BUS$/, 'micro'],
  [/^CEL|CELULAR|^TEL|TELEFONO|WHATSAPP/, 'tel'],
  [/COMIDA|ALIMENT|RESTRIC|CELIAC|VEGET|VIANDA/, 'comida'],
  [/NOTA|OBSERV|COMENTARIO|ACLARAC/, 'nota'],
  [/SALE|SALIDA|DESDE|ARRANCA/, 'salida'],
]

function clasificar(encabezado: string): Campo | null {
  const h = normalizar(encabezado)
  if (!h) return null
  for (const [re, campo] of ENCABEZADOS) if (re.test(h)) return campo
  return null
}

/** ¿La primera línea es encabezado y no una persona? */
function esEncabezado(campos: string[]): boolean {
  const texto = normalizar(campos.join(' '))
  return /APELLIDO/.test(texto) && /NOMBRE|NUMERO/.test(texto)
}

/**
 * Si no hay encabezado, se asume el orden que pide la documentación:
 * número, apellido, nombre, micro, celular.
 */
const POSICIONAL: Campo[] = ['numero', 'apellido', 'nombre', 'micro', 'tel']

// --------------------------------------------------------------------------
// teléfonos
// --------------------------------------------------------------------------

/**
 * Deja solo los dígitos y valida que se pueda llamar. En Argentina un celular
 * marcado desde otro celular son 10 dígitos después del +549 (código de área
 * sin el 0, número sin el 15). Lo que no dé 10 se guarda igual pero se avisa,
 * porque el día de la peregrinación un teléfono que no funciona se descubre
 * tarde y mal.
 */
export function limpiarTel(crudo: string): { tel: string | null; sirve: boolean } {
  const d = (crudo || '').replace(/\D/g, '')
  if (!d) return { tel: null, sirve: true }
  let n = d
  if (n.startsWith('549')) n = n.slice(3)
  else if (n.startsWith('54')) n = n.slice(2)
  if (n.startsWith('0')) n = n.slice(1)
  // el 15 va pegado al número local, no al área; si quedó de más, se cae solo
  // al validar el largo
  return { tel: n, sirve: n.length === 10 }
}

/** Para el href del botón de llamar. */
export function paraLlamar(tel: string | null): string | null {
  if (!tel || tel.length !== 10) return null
  return `+549${tel}`
}

// --------------------------------------------------------------------------
// notas
// --------------------------------------------------------------------------

/** Anotaciones de plata que vienen mezcladas en la columna de notas. */
const NOTA_ES_PAGO = /ABONA|ABONAR|EFECTIVO|FALTA|TRANSFEREN|PAGO|SE(N|Ñ)A|\$/

/** Quien solo vuelve de Luján no camina: no se lo espera en las postas 1 a 4. */
const NOTA_SOLO_VUELTA = /SOLO VUELVE|SOLO LA VUELTA|SOLO REGRESO/

/** "La Reja", "Rodriguez", "Liniers": desde dónde arranca a caminar. Morón es lo común. */
export function leerSalida(crudo: string): Tramo | null {
  const n = normalizar(crudo)
  if (NOTA_SOLO_VUELTA.test(n) || /SOLO VUELTA/.test(n)) return 'solo_vuelta'
  if (/LINIERS/.test(n)) return 'liniers'
  if (/REJA/.test(n)) return 'desde_reja'
  if (/RODRIGUEZ/.test(n)) return 'desde_rodriguez'
  if (/MORON/.test(n)) return 'completo'
  return null
}

function leerNota(crudo: string): { nota: string | null; tramo: Tramo } {
  const n = normalizar(crudo)
  if (!n) return { nota: null, tramo: 'completo' }
  const tramo: Tramo = NOTA_SOLO_VUELTA.test(n) ? 'solo_vuelta' : leerSalida(n) ?? 'completo'
  // una nota de pago y nada más: no entra. Si trae las dos cosas, se conserva,
  // porque la parte operativa importa.
  if (NOTA_ES_PAGO.test(n) && tramo === 'completo' && !/LINIERS|SUMA|BAJA|SUBE/.test(n)) {
    return { nota: null, tramo }
  }
  return { nota: crudo.trim(), tramo }
}

// --------------------------------------------------------------------------
// importar
// --------------------------------------------------------------------------

export function importar(pegado: string): Resultado {
  const avisos: Aviso[] = []
  const lineas = pegado.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (!lineas.length) return { filas: [], avisos: [{ tono: 'ojo', texto: 'No pegaste nada.' }] }

  const sep = detectarSeparador(lineas[0]!)
  let mapa: (Campo | null)[]
  let desde = 0

  const primera = partir(lineas[0]!, sep)
  if (esEncabezado(primera)) {
    mapa = primera.map(clasificar)
    desde = 1
    const descartadas = primera.filter((h, i) => mapa[i] === 'DESCARTAR' && h.trim())
    if (descartadas.length) {
      avisos.push({
        tono: 'info',
        texto:
          `No importé ${descartadas.length} columna${descartadas.length > 1 ? 's' : ''} ` +
          `a propósito: ${descartadas.map((d) => d.trim()).join(', ')}. ` +
          `Esos datos se quedan en la planilla.`,
      })
    }
    // la planilla real trae la columna de notas sin encabezado
    const sinNombre = mapa.findIndex((c, i) => c === null && !primera[i]!.trim())
    if (sinNombre >= 0 && !mapa.includes('nota')) mapa[sinNombre] = 'nota'
  } else {
    mapa = [...POSICIONAL]
    avisos.push({
      tono: 'info',
      texto: 'No encontré encabezados, así que leí las columnas en orden: número, apellido, nombre, micro, celular.',
    })
  }

  const filas: Fila[] = []
  const vistos = new Map<number, string>()
  const repetidos: number[] = []
  const telMalos: string[] = []
  const soloVuelta: string[] = []
  let equipo = 0
  let vacias = 0

  for (let i = desde; i < lineas.length; i++) {
    const campos = partir(lineas[i]!, sep)
    const leer = (c: Campo): string => {
      const idx = mapa.indexOf(c)
      return idx >= 0 ? campos[idx] ?? '' : ''
    }

    const apellido = leer('apellido').trim()
    const nombre = leer('nombre').trim()
    const crudoNum = normalizar(leer('numero'))

    // fila de total, fila en blanco, fila de relleno
    if (!apellido && !nombre) {
      vacias++
      continue
    }

    const esEquipo = /EQUIPO|COORD|EQUIP|CURA|AUTO/.test(crudoNum)
    let numero: number
    if (esEquipo) {
      numero = BASE_EQUIPO + equipo
      equipo++
    } else {
      const n = parseInt(crudoNum.replace(/\D/g, ''), 10)
      if (!n) {
        vacias++
        continue
      }
      numero = n
    }

    if (vistos.has(numero)) repetidos.push(numero)
    vistos.set(numero, apellido)

    const t1 = limpiarTel(leer('tel'))
    const t2 = limpiarTel(leer('tel_emerg'))
    if (!t1.sirve) telMalos.push(`${numero} ${apellido}`)

    const leida = leerNota(leer('nota'))
    const nota = leida.nota
    const salida = leerSalida(leer('salida'))
    const tramo: Tramo = leida.tramo === 'solo_vuelta' ? 'solo_vuelta' : salida ?? leida.tramo
    const crudoComida = leer('comida').trim()
    const comida = !crudoComida || /^SIN RESTRIC|^NINGUNA|^NO$|^-+$/.test(normalizar(crudoComida)) ? null : crudoComida
    if (tramo === 'solo_vuelta') soloVuelta.push(`${numero} ${apellido}`)

    filas.push({
      numero,
      apellido,
      nombre,
      micro: leer('micro').trim() || null,
      tel: t1.tel,
      tel_emerg: t2.tel,
      tramo,
      es_equipo: esEquipo,
      nota,
      activo: true,
      comida,
      salida_ok: salida != null || tramo !== 'completo',
      en_micro: /MICRO/.test(normalizar(nota ?? '')) && /QUEDA|VA EN|VIAJA|ESGUINC|LESION/.test(normalizar(nota ?? '')),
    })
  }

  if (!filas.length) {
    avisos.push({ tono: 'ojo', texto: 'No encontré ninguna fila con apellido. ¿Pegaste las columnas correctas?' })
    return { filas, avisos }
  }

  avisos.push({
    tono: 'info',
    texto:
      `${filas.length} personas` +
      (equipo ? `, ${equipo} del equipo (les puse número ${BASE_EQUIPO} en adelante)` : '') +
      '.',
  })
  const conComida = filas.filter((f) => f.comida)
  if (conComida.length)
    avisos.push({
      tono: 'info',
      texto: `${conComida.length} con restricción alimentaria (solo la ve el equipo, para las viandas).`,
    })
  const sinSalida = filas.filter((f) => !f.es_equipo && !f.salida_ok).length
  if (sinSalida)
    avisos.push({ tono: 'info', texto: `${sinSalida} sin salida cargada: la van a elegir desde la app.` })
  if (vacias) avisos.push({ tono: 'info', texto: `Salteé ${vacias} línea${vacias > 1 ? 's' : ''} sin apellido.` })
  if (soloVuelta.length)
    avisos.push({
      tono: 'info',
      texto:
        `${soloVuelta.join(', ')} figura${soloVuelta.length > 1 ? 'n' : ''} como que solo vuelve${soloVuelta.length > 1 ? 'n' : ''} ` +
        `de Luján. No se ${soloVuelta.length > 1 ? 'los' : 'lo'} va a esperar en las primeras cuatro postas.`,
    })
  if (repetidos.length)
    avisos.push({
      tono: 'ojo',
      texto: `Números repetidos: ${[...new Set(repetidos)].join(', ')}. Me quedé con la última fila de cada uno.`,
    })
  if (telMalos.length)
    avisos.push({
      tono: 'ojo',
      texto:
        `${telMalos.length} teléfono${telMalos.length > 1 ? 's' : ''} no se van a poder llamar desde la app ` +
        `(no tienen 10 dígitos): ${telMalos.slice(0, 6).join(', ')}${telMalos.length > 6 ? '…' : ''}.`,
    })

  return { filas, avisos }
}
