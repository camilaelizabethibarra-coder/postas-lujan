import { useMemo, useState } from 'preact/hooks'
import { useDatos } from '../lib/datos'
import { refrescarPadron } from '../lib/sync'
import { agregarPersona, tokenGuardado } from '../lib/supabase'
import { esDemo } from '../lib/demo'
import { reemplazarPadron } from '../lib/datos'
import { SALIDAS } from '../lib/postas'
import type { Persona } from '../lib/regla'
import { limpiarTel } from '../lib/padron'
import { confSheets, guardarConfSheets, traerDeSheets, ultimoSheets } from '../lib/sheets'
import { hora } from '../lib/exportar'

/** El cupo de peregrinos: los números libres hasta 180 son los lugares para sumar gente. */
const CUPO = 180
const COMIDAS = ['Sin restricción', 'Celíaca', 'Vegetariana', 'Vegana', 'Sin gluten y sin lactosa']

/**
 * Sumar a alguien el mismo día, desde el celular del coordinador. Necesita
 * señal una vez. Le propone el primer número libre (del final para atrás:
 * 176 a 180, después los huecos), o uno de equipo.
 */
export function Sumar() {
  const e = useDatos()
  const [equipo, setEquipo] = useState(false)
  const [f, setF] = useState({ numero: '', apellido: '', nombre: '', dni: '', tel: '', tel_emerg: '', tramo: 'completo', comida: 'Sin restricción', nota: '' })
  const [yendo, setYendo] = useState(false)
  const [msj, setMsj] = useState<{ ok: boolean; t: string } | null>(null)

  const ocupados = useMemo(() => new Set(e.padron.filter((p) => p.activo).map((p) => p.numero)), [e.padron])
  const libres = useMemo(() => {
    const l: number[] = []
    for (let n = 1; n <= CUPO; n++) if (!ocupados.has(n)) l.push(n)
    return l
  }, [ocupados])
  const proximoEquipo = useMemo(() => {
    let n = 901
    while (ocupados.has(n)) n++
    return n
  }, [ocupados])
  const numero = equipo ? proximoEquipo : Number(f.numero) || libres[libres.length - 1] || 0

  const set = (k: keyof typeof f) => (ev: Event) => {
    const v = (ev.currentTarget as HTMLInputElement).value
    setF((ant) => ({ ...ant, [k]: v }))
  }

  async function guardar(ev: Event) {
    ev.preventDefault()
    if (!f.apellido.trim() || !numero) return
    if (!equipo && ocupados.has(numero)) { setMsj({ ok: false, t: `El ${numero} ya está ocupado.` }); return }
    const fila = {
      numero,
      apellido: f.apellido.trim().toUpperCase(),
      nombre: f.nombre.trim().toUpperCase(),
      dni: f.dni.replace(/\D/g, '') || null,
      tel: limpiarTel(f.tel).tel,
      tel_emerg: limpiarTel(f.tel_emerg).tel,
      tramo: equipo ? 'completo' : f.tramo,
      salida_ok: !equipo,
      es_equipo: equipo,
      comida: f.comida === 'Sin restricción' ? null : f.comida,
      nota: f.nota.trim() || null,
    }
    setYendo(true)
    setMsj(null)
    try {
      if (esDemo()) await reemplazarPadron([...e.padron, { ...fila, tramo: fila.tramo as Persona['tramo'], micro: null, activo: true }])
      else {
        await agregarPersona(tokenGuardado()!, fila)
        await refrescarPadron()
      }
      setMsj({ ok: true, t: `Listo: ${equipo ? 'equipo' : `pechera ${numero}`} · ${fila.nombre} ${fila.apellido}. Ya puede entrar a la app.` })
      setF({ numero: '', apellido: '', nombre: '', dni: '', tel: '', tel_emerg: '', tramo: 'completo', comida: 'Sin restricción', nota: '' })
    } catch {
      setMsj({ ok: false, t: 'No pude guardarlo. Hace falta señal: probá de nuevo en un rato.' })
    } finally {
      setYendo(false)
    }
  }

  return (
    <form class="caja sumar" onSubmit={guardar}>
      <p class="aviso">
        Para alguien que se suma hoy. Quedan <b>{libres.length} lugares</b> de peregrino
        {libres.length > 0 && <> (números {libres.slice(0, 8).join(', ')}{libres.length > 8 ? '…' : ''})</>}.
        Necesita señal.
      </p>
      <div class="modo">
        <button type="button" class={!equipo ? 'act' : ''} onClick={() => setEquipo(false)}>Peregrino</button>
        <button type="button" class={equipo ? 'act' : ''} onClick={() => setEquipo(true)}>Equipo</button>
      </div>
      {!equipo && (
        <label>Número de pechera
          <select value={String(numero)} onChange={set('numero')}>
            {[...libres].reverse().map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
      <label>Apellido<input value={f.apellido} onInput={set('apellido')} required autoComplete="off" /></label>
      <label>Nombre<input value={f.nombre} onInput={set('nombre')} autoComplete="off" /></label>
      <label>DNI<input value={f.dni} onInput={set('dni')} inputMode="numeric" autoComplete="off" /></label>
      <label>Celular<input value={f.tel} onInput={set('tel')} inputMode="tel" autoComplete="off" /></label>
      <label>Celular de emergencia<input value={f.tel_emerg} onInput={set('tel_emerg')} inputMode="tel" autoComplete="off" /></label>
      {!equipo && (
        <label>Sale desde
          <select value={f.tramo} onChange={set('tramo')}>
            {SALIDAS.map((s) => <option key={s.tramo} value={s.tramo}>{s.nombre}</option>)}
          </select>
        </label>
      )}
      <label>Comida
        <select value={f.comida} onChange={set('comida')}>
          {COMIDAS.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label>Nota<input value={f.nota} onInput={set('nota')} autoComplete="off" /></label>
      <button class="btn" type="submit" disabled={yendo || !f.apellido.trim()}>
        {yendo ? 'Guardando…' : `Sumar ${equipo ? 'al equipo' : `con la pechera ${numero}`}`}
      </button>
      {msj && <div class={`eco ${msj.ok ? 'ok' : 'mal'}`} style="margin-top: 10px">{msj.t}</div>}
    </form>
  )
}

/** Conectar la app con la planilla de Google Sheets (ver scripts/apps-script.gs). */
export function ConectarSheets() {
  useDatos()
  const c = confSheets()
  const [url, setUrl] = useState(c?.url ?? '')
  const [clave, setClave] = useState(c?.clave ?? '')
  const [yendo, setYendo] = useState(false)
  const u = ultimoSheets()

  async function probar(ev: Event) {
    ev.preventDefault()
    guardarConfSheets({ url: url.trim(), clave: clave.trim() })
    setYendo(true)
    await traerDeSheets()
    setYendo(false)
  }

  return (
    <form class="caja sumar" onSubmit={probar}>
      <p class="aviso">
        Con esto la app toma los datos solos de la planilla de Google Sheets, cada 5 minutos,
        desde este celular. La planilla se sigue editando como siempre. Se configura una vez:
        te paso los pasos para la planilla.
      </p>
      <label>Link de la planilla (termina en /exec)<input value={url} onInput={(ev) => setUrl((ev.currentTarget as HTMLInputElement).value)} placeholder="https://script.google.com/macros/s/…/exec" autoComplete="off" /></label>
      <label>Clave<input value={clave} onInput={(ev) => setClave((ev.currentTarget as HTMLInputElement).value)} autoComplete="off" /></label>
      <button class="btn" type="submit" disabled={yendo || !url.trim() || !clave.trim()}>
        {yendo ? 'Trayendo…' : c ? 'Guardar y traer ahora' : 'Conectar y traer ahora'}
      </button>
      {c && (
        <button type="button" class="link" onClick={() => { guardarConfSheets(null); setUrl(''); setClave('') }}>
          Desconectar
        </button>
      )}
      {u && (
        <div class={`eco ${u.ok ? 'ok' : 'mal'}`} style="margin-top: 10px">
          {hora(u.cuando)} · {u.texto}
        </div>
      )}
    </form>
  )
}
