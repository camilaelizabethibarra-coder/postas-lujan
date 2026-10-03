import { useEffect, useMemo, useState } from 'preact/hooks'
import { useDatos, marcar } from '../lib/datos'
import { normalizar } from '../lib/padron'
import { POSTAS_POR_DEFECTO as POSTAS } from '../lib/postas'
import { esperadosEn, marcaDe, confirmada, enMicro, esPedido, participan, seBajaron } from '../lib/regla'
import { hora } from '../lib/exportar'
import { Estado } from './comunes'
import { titulo } from './Peregrino'
import { Escaner, type Lectura } from './Escaner'

type Filtro = 'faltan' | 'todos' | 'pasaron'

export function Marcar({
  postaSel, setPostaSel, alVerAvisos,
}: { postaSel: number; setPostaSel: (i: number) => void; alVerAvisos: () => void }) {
  const e = useDatos()
  const posta = POSTAS[postaSel]!
  const [busq, setBusq] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('faltan')
  // Los que se marcaron con el filtro "Faltan" no desaparecen en el acto: si
  // el toque fue un error, la fila tiene que seguir ahí para destocarla.
  const [recien, setRecien] = useState<Set<number>>(new Set())
  const [num, setNum] = useState('')
  const [eco, setEco] = useState<{ ok: boolean; texto: string } | null>(null)
  const [escaneando, setEscaneando] = useState(false)
  const [cambiando, setCambiando] = useState(false)

  useEffect(() => setRecien(new Set()), [filtro, postaSel])

  const micro = useMemo(() => enMicro(e.avisos), [e.avisos])
  // se espera solo a quien participa (tiene pechera o ya apareció) y no se bajó
  const quienes = useMemo(() => ({ participan: participan(e.padron, e.marcas), bajas: seBajaron(e.avisos) }), [e.padron, e.marcas, e.avisos])
  const esperados = useMemo(() => esperadosEn(e.padron, e.marcas, posta, micro, quienes), [e.padron, e.marcas, posta, micro, quienes])
  // Presentismo: cuenta solo lo que confirmó el equipo. Lo que declaró el
  // peregrino con "Llegué" se ve, pero sigue en "faltan" hasta que alguien lo confirme.
  const pasaron = esperados.filter((p) => confirmada(e.marcas, posta.id, p.numero)).length
  const declararon = esperados.filter(
    (p) => marcaDe(e.marcas, posta.id, p.numero) && !confirmada(e.marcas, posta.id, p.numero),
  ).length

  const lista = useMemo(() => {
    const b = normalizar(busq)
    const esNum = /^\d+$/.test(b)
    return esperados.filter((p) => {
      const on = Boolean(confirmada(e.marcas, posta.id, p.numero))
      if (filtro === 'faltan' && on && !recien.has(p.numero)) return false
      if (filtro === 'pasaron' && !on) return false
      if (!b) return true
      return esNum ? String(p.numero).startsWith(b) : normalizar(`${p.apellido} ${p.nombre}`).includes(b)
    })
  }, [esperados, e.marcas, posta, filtro, busq, recien])

  const avisosAbiertos = e.avisos.filter((a) => esPedido(a) && !a.resuelto).length
  // la situación de cada uno, para verla en la lista y al escanear
  const pedidoDe = useMemo(() => {
    const m = new Map<number, 'ayuda' | 'bajo'>()
    for (const a of e.avisos) if (esPedido(a) && !a.resuelto) m.set(a.peregrino, a.tipo as 'ayuda' | 'bajo')
    return m
  }, [e.avisos])
  function situacion(n: number) {
    const t: [string, string][] = []
    if (pedidoDe.get(n) === 'bajo') t.push(['baja', '🛑 No sigue: pidió que lo busquen'])
    else if (quienes.bajas.has(n)) t.push(['baja', '🛑 Se bajó de la caminata'])
    if (pedidoDe.get(n) === 'ayuda') t.push(['ayuda', '🆘 Pidió ayuda'])
    if (micro.has(n)) t.push(['micro', '🚌 Va en el micro'])
    return t
  }

  function tocar(numero: number) {
    const m = marcaDe(e.marcas, posta.id, numero)
    // declarado por el peregrino → el toque lo confirma, no lo borra
    if (!m) marcar(numero, posta.id, 'resp', true)
    else if (m.via === 'peregrino') marcar(numero, posta.id, 'resp', true)
    else marcar(numero, posta.id, 'resp', false)
    if (filtro === 'faltan') setRecien((s) => new Set(s).add(numero))
    navigator.vibrate?.(25)
  }

  /**
   * Presente por QR o por número de pechera. Nunca desmarca: un QR leído dos
   * veces o un número repetido no borra a nadie.
   */
  function darPresente(n: number): Lectura {
    const p = e.padron.find((x) => x.numero === n && x.activo)
    if (!p) return { tono: 'mal', texto: `No hay nadie con el número ${n}` }
    const nombre = `${p.es_equipo ? 'EQ' : n} · ${p.apellido}, ${titulo(p.nombre)}`
    if (p.es_equipo) return { tono: 'ya', texto: nombre, detalle: 'Es del equipo: no se toma lista' }
    const m = marcaDe(e.marcas, posta.id, n)
    if (m?.via === 'resp') return { tono: 'ya', texto: nombre, detalle: `Ya estaba presente (${hora(m.marcado_en)})` }
    marcar(n, posta.id, 'resp', true)
    const detalle = [
      ...situacion(n).map((x) => x[1]),
      posta.id === 'po5' && '↩ Pedile la pechera',
      p.nota,
    ].filter(Boolean).join(' · ')
    return { tono: 'ok', texto: nombre, detalle: detalle || `Presente en ${posta.nombre}` }
  }

  function presentePorNumero(ev: Event) {
    ev.preventDefault()
    const r = darPresente(parseInt(num, 10))
    setEco({ ok: r.tono !== 'mal', texto: r.texto + (r.detalle && r.tono !== 'ok' ? ` — ${r.detalle}` : '') })
    navigator.vibrate?.(r.tono === 'mal' ? [80, 60, 80] : 40)
    setNum('')
  }

  return (
    <>
      <div class="cab">
        <div class="lema-equipo"><b>EQUIPO</b> Servicio y pasión, por amar, por vivir</div>
        <div class="parada-actual">
          <span>ESTOY EN</span>
          <b>{posta.nombre}</b>
          <button onClick={() => setCambiando(!cambiando)}>{cambiando ? 'Cerrar' : 'Cambiar'}</button>
        </div>
        {cambiando && (
          <div class="elegir-parada">
            {POSTAS.map((p, i) => (
              <button
                key={p.id}
                class={`btn ${i === postaSel ? '' : 'sec'}`}
                onClick={() => { setPostaSel(i); setCambiando(false) }}
              >
                {p.nombre}
              </button>
            ))}
          </div>
        )}
        <div class="cont">
          <span class="n">{pasaron}</span>
          <span class="de">de {esperados.length} presentes</span>
          {esperados.length - pasaron > 0 && <span class="fa">faltan {esperados.length - pasaron}</span>}
        </div>
        <div class="dijeron">
          {declararon > 0 && `${declararon} dicen que llegaron y falta confirmarlos`}
        </div>
        <div class="ticks" aria-hidden="true">
          {esperados.map((p) => {
            const m = marcaDe(e.marcas, posta.id, p.numero)
            return <span key={p.numero} class={`tk ${m ? (m.via === 'resp' ? 'on' : 'dijo') : ''}`} />
          })}
        </div>
        <div style="margin-top: 10px"><Estado /></div>
      </div>

      <div class="cpo">
        {avisosAbiertos > 0 && (
          <button class="avi" onClick={alVerAvisos}>
            <span class="nom">
              {avisosAbiertos === 1 ? '1 pedido de ayuda' : `${avisosAbiertos} pedidos de ayuda`}
              <small>Tocá para ver quién y llamar</small>
            </span>
            <span class="pill">Ver</span>
          </button>
        )}

        <p class="paso-a-paso">
          Para dar el presente: <b>escaneá el QR</b> en el celular del peregrino, o escribí su número de pechera.
          Lo que el peregrino marca solo con "Llegué" queda en verde hasta que lo confirmes.
          {posta.id === 'po5' && <b> En la subida al micro, pedile también la pechera.</b>}
        </p>
        <button class="btn escanear" onClick={() => setEscaneando(true)}>📷 Escanear QR del celular</button>
        {escaneando && (
          <Escaner titulo={`Presente en ${posta.nombre}`} alLeer={darPresente} alCerrar={() => setEscaneando(false)} />
        )}

        <form class="pornum" onSubmit={presentePorNumero}>
          <input
            class="busc grande"
            placeholder="Nº de pechera"
            inputMode="numeric"
            pattern="[0-9]*"
            value={num}
            onInput={(ev) => { setNum((ev.currentTarget as HTMLInputElement).value.replace(/\D/g, '')); setEco(null) }}
            autoComplete="off"
          />
          <button class="btn" type="submit" disabled={!num}>Presente</button>
        </form>
        {eco && <div class={`eco ${eco.ok ? 'ok' : 'mal'}`}>{eco.ok ? '✓ ' : ''}{eco.texto}</div>}

        <div class="buscador">
          <input
            class="busc"
            placeholder="Buscar por apellido o número"
            value={busq}
            onInput={(ev) => setBusq((ev.currentTarget as HTMLInputElement).value)}
            autoComplete="off"
            spellcheck={false}
          />
          {busq && <button class="borrar" aria-label="Borrar búsqueda" onClick={() => setBusq('')}>×</button>}
        </div>

        <div class="chips">
          {(['faltan', 'todos', 'pasaron'] as Filtro[]).map((k) => (
            <button key={k} class={`chip ${filtro === k ? 'act' : ''}`} onClick={() => setFiltro(k)}>
              {k === 'faltan' ? 'Faltan' : k === 'todos' ? 'Todos' : 'Presentes'}
            </button>
          ))}
          <span class="leyenda">
            <i class="tk on" /> confirmado <i class="tk dijo" /> declarado
          </span>
        </div>

        {!e.padron.length ? (
          <div class="vac">Todavía no hay padrón cargado.<br />Andá a Datos y pegá la lista.</div>
        ) : !lista.length ? (
          <div class="vac">
            {busq ? 'Nadie con ese nombre en esta lista.' : filtro === 'faltan' ? 'Están todos presentes.' : 'Nada para mostrar.'}
          </div>
        ) : (
          lista.map((p) => {
            const m = marcaDe(e.marcas, posta.id, p.numero)
            const cls = m ? (m.via === 'resp' ? 'on' : 'on dijo') : ''
            return (
              <button key={p.numero} class={`fila ${cls}`} onClick={() => tocar(p.numero)}>
                <span class="num">{p.es_equipo ? 'EQ' : p.numero}</span>
                <span class="nom">
                  {p.apellido}, {titulo(p.nombre)}
                  {m ? (
                    <small>
                      {m.via === 'resp' ? 'presente' : 'dice que llegó · tocá para confirmar'} · {hora(m.marcado_en)}
                    </small>
                  ) : (p.micro || p.nota) && (
                    <small>{[p.micro && `micro ${p.micro}`, p.nota].filter(Boolean).join(' · ')}</small>
                  )}
                  {situacion(p.numero).length > 0 && (
                    <small>
                      {situacion(p.numero).map(([k, t]) => <span key={k} class={`estado-p ${k}`}>{t}</span>)}
                    </small>
                  )}
                </span>
                <span class="mar">{m ? (m.via === 'resp' ? '✓' : '?') : ''}</span>
              </button>
            )
          })
        )}
      </div>
    </>
  )
}
