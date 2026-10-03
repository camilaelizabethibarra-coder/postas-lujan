/**
 * Sincronización. Nadie aprieta nunca un botón de "sincronizar": esto corre
 * solo al abrir la app, al volver la señal, al volver a primer plano, cada
 * vez que se encola algo, y cada tanto mientras haya pendientes.
 *
 * Primero sube, después baja. Subir primero hace que lo que marcó esta
 * persona ya esté en el servidor cuando le pedimos lo que marcaron los demás.
 */
import {
  estado, avisar, leerCola, sacarDeCola, aplicarRemotas, aplicarAvisos, aplicarUbicaciones, podarAntesDe,
  reemplazarPadron, cuandoSeEncole, meta, guardarMeta,
} from './datos'
import { remoto, ErrorSesion, ErrorHuerfano } from './remoto'
import { tokenGuardado, sincronizarReloj } from './supabase'
import { esDemo } from './demo'
import type { Marca } from './regla'

export type Modo = { rol: 'resp' } | { rol: 'peregrino'; numero: number | null }

let modo: Modo = { rol: 'peregrino', numero: null }
let corriendo = false
let otraVez = false
let padronBajado = 0

/** Cada cuánto se reintenta con pendientes, y cada cuánto baja novedades el responsable. */
const CADA = 15_000
/** Cada cuánto se vuelve a pedir el padrón (casi nunca cambia el día de la peregrinación). */
const PADRON_CADA = 10 * 60_000
/** Solapamiento al pedir "lo nuevo desde": una transacción lenta puede quedar con subido_en viejo. */
const SOLAPE = 60_000

/** Si la base dice que la persona o la posta no existe, se descarta: reintentar no lo arregla. */
async function oDescartar(p: Promise<void>): Promise<void> {
  try { await p } catch (e) {
    if (e instanceof ErrorHuerfano) console.warn('descartado, apunta a algo que ya no existe:', e.message)
    else throw e
  }
}

/**
 * Sube en tanda; si la base rechaza la tanda por un huérfano, reintenta de a
 * uno y descarta solo el que falla. Una marca vieja no se lleva puestas a las buenas.
 */
async function enTanda<T>(items: T[], subirlos: (xs: T[]) => Promise<void>): Promise<void> {
  try { await subirlos(items) } catch (e) {
    if (!(e instanceof ErrorHuerfano) || items.length === 1) return oDescartar(Promise.reject(e))
    for (const x of items) await oDescartar(subirlos([x]))
  }
}

async function subir(): Promise<void> {
  const cola = await leerCola()
  if (!cola.length) return
  estado.conexion = 'guardando'
  avisar()

  const token = tokenGuardado()
  const resp = cola.filter((p) => p.tipo === 'marca' && p.marca.via === 'resp')
  const pere = cola.filter((p) => p.tipo === 'marca' && p.marca.via === 'peregrino')
  // "dejé de caminar / volví a caminar" suben aparte y al final: nunca frenan un pedido de ayuda
  const esModo = (p: (typeof cola)[number]) =>
    p.tipo === 'aviso' && (p.aviso.tipo === 'micro' || p.aviso.tipo === 'camina')
  const avisos = cola.filter((p) => p.tipo === 'aviso' && !esModo(p))
  const modos = cola.filter(esModo)
  const resolver = cola.filter((p) => p.tipo === 'resolver')
  const salidas = cola.filter((p) => p.tipo === 'salida')

  // Las del peregrino van aparte: si la sesión del responsable venció, que
  // eso no frene lo que declaró el peregrino.
  if (pere.length) {
    await enTanda(pere.map((p) => (p as { marca: Marca }).marca), (xs) => remoto.subirMarcas(null, xs))
    await sacarDeCola(pere.map((p) => p.id!))
  }
  if (avisos.length) {
    await enTanda(avisos.map((p) => (p as Extract<typeof p, { tipo: 'aviso' }>).aviso), (xs) => remoto.subirAvisos(xs))
    await sacarDeCola(avisos.map((p) => p.id!))
  }
  // cada marca sube con la sesión con la que se hizo
  const porToken = new Map<string | null, typeof resp>()
  for (const p of resp) {
    const t = (p as { token: string | null }).token ?? token
    porToken.set(t, [...(porToken.get(t) ?? []), p])
  }
  for (const [t, grupo] of porToken) {
    await enTanda(grupo.map((p) => (p as { marca: Marca }).marca), (xs) => remoto.subirMarcas(t, xs))
    await sacarDeCola(grupo.map((p) => p.id!))
  }
  for (const r of resolver) {
    const x = r as Extract<typeof r, { tipo: 'resolver' }>
    await oDescartar(remoto.resolver(x.token ?? token, x.avisoId))
    await sacarDeCola([r.id!])
  }
  if (modos.length) {
    await enTanda(modos.map((p) => (p as Extract<typeof p, { tipo: 'aviso' }>).aviso), (xs) => remoto.subirAvisos(xs))
    await sacarDeCola(modos.map((p) => p.id!))
  }
  // Al final: que la salida elegida nunca frene marcas ni avisos.
  for (const s of salidas) {
    const x = s as Extract<typeof s, { tipo: 'salida' }>
    await oDescartar(remoto.elegirSalida(x.numero, x.tramo))
    await sacarDeCola([s.id!])
  }
}

async function bajar(): Promise<void> {
  const token = modo.rol === 'resp' ? tokenGuardado() : null

  if (Date.now() - padronBajado > PADRON_CADA || !estado.padron.length) {
    const padron = await remoto.bajarPadron(token)
    if (padron && padron.length) await reemplazarPadron(padron)
    padronBajado = Date.now()
  }

  if (modo.rol === 'resp') {
    const desde = await meta<string>('cursor')
    const marcas = await remoto.bajarMarcas(desde ? new Date(Date.parse(desde) - SOLAPE).toISOString() : null)
    await aplicarRemotas(marcas)
    const ultimo = marcas.reduce<string | null>(
      (max, m) => (!max || Date.parse(m.subido_en) > Date.parse(max) ? m.subido_en : max),
      desde ?? null,
    )
    if (ultimo) await guardarMeta('cursor', ultimo)
    await aplicarAvisos(await remoto.bajarAvisos())
    // que un problema con las ubicaciones nunca deje al equipo sin marcas ni avisos
    try { await aplicarUbicaciones(await remoto.bajarUbicaciones(token)) }
    catch (e) { console.warn('ubicaciones:', e) }
  } else if (modo.numero != null) {
    // el peregrino solo necesita lo suyo
    await aplicarRemotas(await remoto.bajarMarcas(null, modo.numero))
    await aplicarAvisos(await remoto.bajarAvisos(modo.numero))
  }
}

/**
 * Antes de subir nada: si la base se limpió desde la última vez, se borran
 * de este celular las pruebas de antes de esa hora. Si no, una marca de
 * prueba guardada acá volvería a subir y ensuciaría la base limpia.
 */
async function revisarReinicio(): Promise<void> {
  const r = await remoto.bajarReinicio()
  if (!r || (await meta<string>('reinicio')) === r) return
  await podarAntesDe(r)
  await guardarMeta('reinicio', r)
  // y el cursor de marcas vuelve a empezar, para bajar todo lo nuevo
  await guardarMeta('cursor', null)
}

export async function sincronizar(): Promise<void> {
  if (corriendo) { otraVez = true; return }
  corriendo = true
  try {
    do {
      otraVez = false
      await revisarReinicio()
      await subir()
      await bajar()
    } while (otraVez)
    estado.sesionVencida = false
    estado.conexion = esDemo() ? 'demo' : 'aldia'
  } catch (e) {
    console.warn('sincronizar:', e)
    if (e instanceof ErrorSesion) estado.sesionVencida = true
    estado.conexion = 'sinconexion'
  } finally {
    corriendo = false
    avisar()
  }
}

/** Después de importar: que el padrón nuevo baje ya, sin esperar los diez minutos. */
export function refrescarPadron(): Promise<void> {
  padronBajado = 0
  return sincronizar()
}

let demora: ReturnType<typeof setTimeout> | undefined
function pronto() {
  clearTimeout(demora)
  demora = setTimeout(sincronizar, 300)
}

let dejarDeEscuchar = () => {}
let intervalo: ReturnType<typeof setInterval> | undefined

/** Se llama al entrar a una pantalla. Cambiar de modo no reinicia la cola. */
export function arrancar(nuevo: Modo): void {
  const cambioRol = nuevo.rol !== modo.rol
  modo = nuevo
  cuandoSeEncole(pronto)

  if (cambioRol || !intervalo) {
    dejarDeEscuchar()
    dejarDeEscuchar = () => {}
    if (modo.rol === 'resp') {
      dejarDeEscuchar = remoto.escuchar(
        (m) => { aplicarRemotas([m]) },
        (a) => { aplicarAvisos([a]) },
      )
    }
  }

  if (!intervalo) {
    intervalo = setInterval(() => {
      // sin padrón todavía (se instaló antes de que lo carguen): seguir preguntando
      if (estado.pendientes > 0 || modo.rol === 'resp' || estado.conexion === 'sinconexion' || !estado.padron.length) sincronizar()
    }, CADA)
    addEventListener('online', () => { sincronizarReloj(); sincronizar() })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') sincronizar()
    })
  }
  sincronizar()
}
