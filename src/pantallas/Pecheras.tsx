import { useMemo, useState } from 'preact/hooks'
import { useDatos, marcar } from '../lib/datos'
import { normalizar } from '../lib/padron'
import {
  POSTA_PECHERA, POSTA_DEVUELTA, SALIDAS, comidaDe, postaDeSalida, retiroDe,
} from '../lib/postas'
import { confirmada, type Persona } from '../lib/regla'
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
    const s = postaDeSalida(p.tramo)
    if (!confirmada(e.marcas, s.id, p.numero)) marcar(p.numero, s.id, 'resp', true)
    navigator.vibrate?.(50)
    setEco({ tono: 'ok', texto: `Pechera ${p.numero} · ${titulo(p.nombre)} ${titulo(p.apellido)}`, detalle: `Entregada y presente en ${s.nombre}` })
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

  const entregadas = conPechera.filter(entregada)
  const devueltas = conPechera.filter((p) => devuelta(p))
  const faltan = (modo === 'entrega'
    ? conPechera.filter((p) => !entregada(p))
    : entregadas.filter((p) => !devuelta(p))
  ).filter((p) => !salida || p.tramo === salida)

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
            <b>1.</b> Pedile el DNI y escribilo. <b>2.</b> Decile su número de pechera.
            <b> 3.</b> Tocá <b>Entregar</b>: queda con pechera y presente en su salida.
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
  p, modo, entregadaEn, devueltaEn, alEntregar, alDevolver,
}: {
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

      {modo === 'entrega' ? (
        p.tramo === 'solo_vuelta' ? (
          <div class="tp-estado">No lleva pechera: solo vuelve en el micro.</div>
        ) : entregadaEn ? (
          <>
            <div class="tp-estado">
              ✓ Ya tiene pechera {entregadaEn === 'antes' ? '(la retiró antes, según la planilla)' : `(entregada a las ${hora(entregadaEn)})`}
            </div>
            <button class="btn sec" onClick={alEntregar}>Dar presente en su salida</button>
          </>
        ) : (
          <button class="btn" onClick={alEntregar}>🎽 Entregar pechera {p.numero} y dar presente</button>
        )
      ) : devueltaEn ? (
        <div class="tp-estado">✓ Devolvió la pechera a las {hora(devueltaEn)}</div>
      ) : (
        <button class="btn" onClick={alDevolver}>↩ Devolvió la pechera</button>
      )}
    </div>
  )
}
