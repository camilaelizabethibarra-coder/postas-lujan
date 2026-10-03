import { useMemo, useState } from 'preact/hooks'
import { useDatos, marcar, darDeBaja, elegirSalida } from '../lib/datos'
import { normalizar } from '../lib/padron'
import {
  POSTA_PECHERA, POSTA_DEVUELTA, SALIDAS, comidaDe, postaDeSalida, retiroDe,
} from '../lib/postas'
import { confirmada, seBajaron, type Persona } from '../lib/regla'
import { hora } from '../lib/exportar'
import { Estado } from './comunes'
import { titulo } from './Peregrino'
import { Escaner, type Lectura } from './Escaner'

type Modo = 'entrega' | 'devolucion'

/**
 * Entrega y devolución de pecheras, para el equipo coordinador.
 *
 * Entrega (7:00 Morón, 9:00 La Reja y Rodríguez en la parroquia; Liniers en
 * La Reja): te dicen el DNI, lo escribís, aparece el nombre con el número de
 * pechera bien grande y de dónde sale. Un toque entrega la pechera y le da el
 * presente en su salida: llegó para arrancar.
 *
 * Devolución (al subir al micro de vuelta): se escanea el QR o se escribe el
 * número, y queda anotado que la devolvió.
 */
export function Pecheras() {
  const e = useDatos()
  const [modo, setModo] = useState<Modo>('entrega')
  const [q, setQ] = useState('')
  const [salida, setSalida] = useState<string | null>(null)
  const [verFaltan, setVerFaltan] = useState(false)
  const [eco, setEco] = useState<Lectura | null>(null)
  const [escaneando, setEscaneando] = useState(false)

  // los que llevan pechera: peregrinos activos que caminan
  const conPechera = useMemo(
    () => e.padron.filter((p) => p.activo && !p.es_equipo && p.tramo !== 'solo_vuelta'),
    [e.padron],
  )
  const entregada = (p: Persona) => p.pechera_ok || Boolean(confirmada(e.marcas, POSTA_PECHERA.id, p.numero))
  const devuelta = (p: Persona) => confirmada(e.marcas, POSTA_DEVUELTA.id, p.numero)

  const resultados = useMemo(() => {
    const b = normalizar(q)
    if (!b) return []
    const d = b.replace(/\D/g, '')
    const soloNum = /^\d+$/.test(b)
    return e.padron
      .filter((p) => p.activo && !p.es_equipo)
      .map((p): [number, Persona] | null => {
        // número de pechera exacto primero, después DNI, después nombre
        if (soloNum && String(p.numero) === b) return [0, p]
        if (soloNum && d.length >= 4 && p.dni?.includes(d)) return [1, p]
        if (!soloNum && b.length >= 2 && normalizar(`${p.apellido} ${p.nombre}`).includes(b)) return [2, p]
        return null
      })
      .filter((x): x is [number, Persona] => x != null)
      .sort((a, b) => a[0] - b[0] || a[1].numero - b[1].numero)
      .slice(0, 6)
      .map((x) => x[1])
  }, [q, e.padron])

  function entregar(p: Persona) {
    if (!entregada(p)) marcar(p.numero, POSTA_PECHERA.id, 'resp', true)
    // Presente solo si la pechera se entrega EN su salida: Morón (la
    // parroquia) o Liniers (la retiran en La Reja). Los de La Reja y
    // Rodríguez la retiran en la parroquia a las 9: el presente se lo dan
    // cuando llegan a su parada.
    const s = postaDeSalida(p.tramo)
    const enSuSalida = p.tramo === 'completo' || p.tramo === 'liniers'
    if (enSuSalida && !confirmada(e.marcas, s.id, p.numero)) marcar(p.numero, s.id, 'resp', true)
    navigator.vibrate?.(50)
    setEco({
      tono: 'ok',
      texto: `Pechera ${p.numero} · ${titulo(p.nombre)} ${titulo(p.apellido)}`,
      detalle: enSuSalida ? `Entregada y presente en ${s.nombre}` : `Entregada. El presente se lo dan al llegar a ${s.nombre}.`,
    })
    setQ('')
  }

  function devolver(n: number): Lectura {
    const p = e.padron.find((x) => x.numero === n && x.activo)
    if (!p) return { tono: 'mal', texto: `No hay nadie con el número ${n}` }
    const nombre = `${n} · ${titulo(p.nombre)} ${titulo(p.apellido)}`
    const m = devuelta(p)
    if (m) return { tono: 'ya', texto: nombre, detalle: `Ya la había devuelto (${hora(m.marcado_en)})` }
    marcar(n, POSTA_DEVUELTA.id, 'resp', true)
    return { tono: 'ok', texto: nombre, detalle: 'Devolvió la pechera' }
  }

  const bajas = seBajaron(e.avisos)
  const entregadas = conPechera.filter(entregada)
  const devueltas = conPechera.filter((p) => devuelta(p))
  const faltan = (modo === 'entrega'
    ? conPechera.filter((p) => !entregada(p))
    : entregadas.filter((p) => !devuelta(p))
  ).filter((p) => (!salida || p.tramo === salida) && !bajas.has(p.numero))

  return (
    <>
      <div class="cab">
        <div class="lema-equipo"><b>COORDINACIÓN</b> Servicio y pasión, por amar, por vivir</div>
        <div class="modo">
          <button class={modo === 'entrega' ? 'act' : ''} onClick={() => { setModo('entrega'); setEco(null) }}>
            🎽 Entregar (salida)
          </button>
          <button class={modo === 'devolucion' ? 'act' : ''} onClick={() => { setModo('devolucion'); setEco(null) }}>
            ↩ Devolver (vuelta)
          </button>
        </div>
        {modo === 'entrega' ? (
          <>
            <div class="cont" style="margin: 4px 0 2px">
              <span class="n">{entregadas.length}</span>
              <span class="de">de {conPechera.length} tienen pechera</span>
            </div>
            <div class="por-salida">
              {SALIDAS.map((s) => {
                const de = conPechera.filter((p) => p.tramo === s.tramo)
                return (
                  <div key={s.tramo}>
                    <b>{de.filter(entregada).length}/{de.length}</b>
                    {s.nombre} · {retiroDe(s.tramo)}
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div class="cont" style="margin: 4px 0 2px">
            <span class="n">{devueltas.length}</span>
            <span class="de">de {entregadas.length} devolvieron la pechera</span>
          </div>
        )}
        <div style="margin-top: 8px"><Estado /></div>
      </div>

      <div class="cpo">
        {modo === 'entrega' ? (
          <p class="paso-a-paso">
            <b>1.</b> Pedile el DNI, el apellido o el número. <b>2.</b> Decile su número de pechera.
            <b> 3.</b> Tocá <b>Entregar</b>. Los de Morón (y Liniers en La Reja) quedan además presentes;
            los de La Reja y Rodríguez reciben el presente al llegar a su parada.
          </p>
        ) : (
          <>
            <p class="paso-a-paso">
              Al subir al micro: escaneá el QR de su celular o escribí el número de la pechera. Queda anotado que la devolvió.
            </p>
            <button class="btn escanear" onClick={() => setEscaneando(true)}>📷 Escanear pecheras que devuelven</button>
            {escaneando && <Escaner titulo="Devolución de pecheras" alLeer={devolver} alCerrar={() => setEscaneando(false)} />}
          </>
        )}

        <div class="buscador">
          <input
            class="busc grande"
            placeholder={modo === 'entrega' ? 'DNI, apellido o nº de pechera' : 'Nº de pechera o apellido'}
            inputMode={modo === 'devolucion' ? 'numeric' : 'text'}
            value={q}
            onInput={(ev) => { setQ((ev.currentTarget as HTMLInputElement).value); setEco(null) }}
            autoComplete="off"
            spellcheck={false}
          />
          {q && <button class="borrar" aria-label="Borrar búsqueda" onClick={() => setQ('')}>×</button>}
        </div>

        {eco && (
          <div class={`eco ${eco.tono === 'mal' ? 'mal' : 'ok'}`} style="margin-top: 10px">
            ✓ {eco.texto}
            {eco.detalle && <small>{eco.detalle}</small>}
          </div>
        )}

        <div style="margin-top: 10px">
          {resultados.map((p) => (
            <Tarjeta
              key={p.numero}
              p={p}
              modo={modo}
              entregadaEn={p.pechera_ok ? 'antes' : confirmada(e.marcas, POSTA_PECHERA.id, p.numero)?.marcado_en}
              devueltaEn={devuelta(p)?.marcado_en}
              alEntregar={() => entregar(p)}
              alDevolver={() => { setEco(devolver(p.numero)); setQ('') }}
              baja={bajas.has(p.numero)}
              alBaja={() => {
                if (!confirm(`¿${titulo(p.nombre)} ${titulo(p.apellido)} se bajó de la caminata? Deja de contar como faltante.`)) return
                darDeBaja(p.numero)
                setEco({ tono: 'ok', texto: `${p.numero} · ${titulo(p.nombre)} ${titulo(p.apellido)}`, detalle: 'Quedó como que se bajó: ya no cuenta como faltante' })
                setQ('')
              }}
            />
          ))}
          {q.trim().length >= 2 && !resultados.length && (
            <div class="vac">No encontré a nadie con eso. Probá con el apellido o con el DNI sin puntos.</div>
          )}
        </div>

        <div class="h">
          {modo === 'entrega' ? `Les falta retirar la pechera (${faltan.length})` : `Les falta devolverla (${faltan.length})`}
        </div>
        <div class="chips">
          <button class={`chip ${!salida ? 'act' : ''}`} onClick={() => setSalida(null)}>Todas</button>
          {SALIDAS.map((s) => (
            <button key={s.tramo} class={`chip ${salida === s.tramo ? 'act' : ''}`} onClick={() => setSalida(s.tramo)}>
              {s.nombre}
            </button>
          ))}
        </div>
        {!verFaltan ? (
          <button class="btn sec" onClick={() => setVerFaltan(true)}>Ver la lista</button>
        ) : (
          faltan.map((p) => (
            <button key={p.numero} class="fila" onClick={() => { setQ(String(p.numero)); scrollTo(0, 0) }}>
              <span class="num">{p.numero}</span>
              <span class="nom">
                {p.apellido}, {titulo(p.nombre)}
                <small>{SALIDAS.find((s) => s.tramo === p.tramo)?.nombre ?? 'Sin salida elegida'} · {retiroDe(p.tramo)}</small>
              </span>
            </button>
          ))
        )}
      </div>
    </>
  )
}

function Tarjeta({
  p, modo, entregadaEn, devueltaEn, alEntregar, alDevolver, baja, alBaja,
}: {
  baja: boolean
  alBaja: () => void
  p: Persona
  modo: Modo
  entregadaEn?: string
  devueltaEn?: string
  alEntregar: () => void
  alDevolver: () => void
}) {
  const salida = p.tramo === 'solo_vuelta'
    ? 'Solo hace la vuelta'
    : !p.salida_ok && p.tramo === 'completo'
      ? 'Todavía no eligió desde dónde sale'
      : `Sale de ${SALIDAS.find((s) => s.tramo === p.tramo)?.nombre ?? 'Morón'}`
  const c = comidaDe(p.comida)
  const lista = modo === 'entrega' ? Boolean(entregadaEn) : Boolean(devueltaEn)

  return (
    <div class={`tarjeta-p ${lista ? 'lista' : ''}`}>
      <div class="tp-fila">
        <div class="tp-num">{p.numero}</div>
        <div class="tp-datos">
          <b>{titulo(p.nombre)} {titulo(p.apellido)}</b>
          <span>{salida}{p.tramo !== 'solo_vuelta' && ` · ${retiroDe(p.tramo)}`}</span>
          {p.dni && <span>DNI {p.dni}</span>}
          {c && <em class="rest" style="font-style: normal">⚠ {c}</em>}
          {p.nota && <span>{p.nota}</span>}
        </div>
      </div>

      {p.tramo !== 'solo_vuelta' && (
        <label class="cambiar-salida">
          Sale desde
          <select
            value={p.salida_ok || p.tramo !== 'completo' ? p.tramo : ''}
            onChange={(ev) => {
              const t = (ev.currentTarget as HTMLSelectElement).value
              if (t) elegirSalida(p.numero, t as Persona['tramo'])
            }}
          >
            {!(p.salida_ok || p.tramo !== 'completo') && <option value="">— elegir —</option>}
            {SALIDAS.map((x) => <option key={x.tramo} value={x.tramo}>{x.nombre}</option>)}
          </select>
        </label>
      )}

      {modo === 'entrega' ? (
        p.tramo === 'solo_vuelta' ? (
          <div class="tp-estado">No lleva pechera: solo vuelve en el micro.</div>
        ) : entregadaEn ? (
          <>
            <div class="tp-estado">
              ✓ Ya tiene pechera {entregadaEn === 'antes' ? '(la retiró antes, según la planilla)' : `(entregada a las ${hora(entregadaEn)})`}
            </div>
            {(p.tramo === 'completo' || p.tramo === 'liniers') && (
              <button class="btn sec" onClick={alEntregar}>Dar presente en su salida</button>
            )}
          </>
        ) : (
          <button class="btn" onClick={alEntregar}>
            🎽 Entregar pechera {p.numero}{p.tramo === 'completo' || p.tramo === 'liniers' ? ' y dar presente' : ''}
          </button>
        )
      ) : devueltaEn ? (
        <div class="tp-estado">✓ Devolvió la pechera a las {hora(devueltaEn)}</div>
      ) : (
        <button class="btn" onClick={alDevolver}>↩ Devolvió la pechera</button>
      )}
      {baja ? (
        <div class="tp-estado" style="color: var(--alerta)">🛑 Se bajó de la caminata: no cuenta como faltante</div>
      ) : p.tramo !== 'solo_vuelta' && (
        <button class="btn sec" onClick={alBaja}>🛑 Se dio de baja / se bajó</button>
      )}
    </div>
  )
}
