import { useMemo, useState } from 'preact/hooks'
import { useDatos, marcar } from '../lib/datos'
import { normalizar } from '../lib/padron'
import { POSTA_VIANDA, comidaDe } from '../lib/postas'
import { confirmada, participan, seBajaron, type Persona } from '../lib/regla'
import { hora } from '../lib/exportar'
import { Estado } from './comunes'
import { titulo } from './Peregrino'
import { Escaner, type Lectura } from './Escaner'

const SIN = 'Sin restricción'

/**
 * Entrega de viandas en La Reja. Peregrinos y equipo, con la restricción
 * alimentaria bien a la vista: lo importante es darle a cada uno lo que puede
 * comer. Arriba, cuántas de cada tipo se entregaron y cuántas faltan.
 */
export function Viandas() {
  const e = useDatos()
  const [busq, setBusq] = useState('')
  const [soloFaltan, setSoloFaltan] = useState(true)
  const [tipo, setTipo] = useState<string | null>(null)
  const [num, setNum] = useState('')
  const [eco, setEco] = useState<Lectura | null>(null)
  const [escaneando, setEscaneando] = useState(false)

  // quien solo hace la vuelta no pasa por La Reja
  // los que vinieron (tienen pechera o ya aparecieron) y el equipo
  const todos = useMemo(() => {
    const vinieron = participan(e.padron, e.marcas)
    return e.padron.filter((p) => p.activo && p.tramo !== 'solo_vuelta' && (p.es_equipo || vinieron.has(p.numero)))
  }, [e.padron, e.marcas])
  const entregada = (p: Persona) => confirmada(e.marcas, POSTA_VIANDA.id, p.numero)
  const tipoDe = (p: Persona) => comidaDe(p.comida) ?? SIN

  const tipos = useMemo(() => {
    const t = new Map<string, { total: number; dadas: number }>()
    for (const p of todos) {
      const x = t.get(tipoDe(p)) ?? { total: 0, dadas: 0 }
      x.total++
      if (entregada(p)) x.dadas++
      t.set(tipoDe(p), x)
    }
    // sin restricción primero, después las restricciones de más a menos
    return [...t.entries()].sort((a, b) =>
      a[0] === SIN ? -1 : b[0] === SIN ? 1 : b[1].total - a[1].total)
  }, [todos, e.marcas])

  const dadas = todos.filter(entregada).length
  // lo importante: los que no pueden comer la vianda común (peregrinos y equipo)
  // todos los anotados con dieta especial (vinieron o no todavía), menos los que se bajaron:
  // es lo que hay que preparar
  const bajas = seBajaron(e.avisos)
  const especiales = e.padron.filter(
    (p) => p.activo && p.tramo !== 'solo_vuelta' && comidaDe(p.comida) && !bajas.has(p.numero))
  const porDieta = new Map<string, number>()
  for (const p of especiales) porDieta.set(comidaDe(p.comida)!, (porDieta.get(comidaDe(p.comida)!) ?? 0) + 1)

  const lista = useMemo(() => {
    const b = normalizar(busq)
    const esNum = /^\d+$/.test(b)
    return todos
      .filter((p) => !soloFaltan || !entregada(p))
      .filter((p) => !tipo || tipoDe(p) === tipo)
      .filter((p) => !b || (esNum ? String(p.numero).startsWith(b) : normalizar(`${p.apellido} ${p.nombre}`).includes(b)))
      // las restricciones arriba: son las que hay que ir a buscar a mano
      .sort((a, b) =>
        Number(!comidaDe(a.comida)) - Number(!comidaDe(b.comida)) ||
        Number(a.es_equipo) - Number(b.es_equipo) ||
        a.numero - b.numero)
  }, [todos, e.marcas, busq, soloFaltan, tipo])

  /** Por QR o por número. Nunca desmarca: un QR leído dos veces no borra nada. */
  function entregar(n: number): Lectura {
    const p = e.padron.find((x) => x.numero === n && x.activo)
    if (!p) return { tono: 'mal', texto: `No hay nadie con el número ${n}` }
    const nombre = `${p.es_equipo ? 'Equipo' : n} · ${p.apellido}, ${titulo(p.nombre)}`
    const c = comidaDe(p.comida)
    const m = entregada(p)
    if (m) return { tono: 'ya', texto: `Ya tiene su vianda (${hora(m.marcado_en)})`, detalle: nombre }
    marcar(n, POSTA_VIANDA.id, 'resp', true)
    return c
      ? { tono: 'ojo', texto: `⚠ ${c.toUpperCase()}`, detalle: `${nombre} · vianda especial` }
      : { tono: 'ok', texto: 'Vianda común', detalle: nombre }
  }

  function tocar(p: Persona) {
    if (entregada(p)) {
      if (confirm(`¿Desmarcar la vianda de ${p.apellido}?`)) marcar(p.numero, POSTA_VIANDA.id, 'resp', false)
      return
    }
    setEco(entregar(p.numero))
    navigator.vibrate?.(30)
  }

  return (
    <>
      <div class="cab">
        <div class="cont" style="margin-top: 2px">
          <span class="n">{dadas}</span>
          <span class="de">de {todos.length} viandas entregadas</span>
          {todos.length - dadas > 0 && <span class="fa">faltan {todos.length - dadas}</span>}
        </div>
        <div class="tipos">
          {tipos.map(([k, x]) => (
            <button
              key={k}
              class={`tipo ${k === SIN ? '' : 'rest'} ${tipo === k ? 'act' : ''}`}
              onClick={() => setTipo(tipo === k ? null : k)}
            >
              <b>{k}</b>
              <span>{x.dadas} de {x.total}</span>
            </button>
          ))}
        </div>
        <div style="margin-top: 8px"><Estado /></div>
      </div>

      <div class="cpo">
        {especiales.length > 0 && (
          <div class="especiales">
            <div class="esp-tit">
              ⚠ Restricciones alimentarias
              <span>{especiales.filter(entregada).length} de {especiales.length} entregadas</span>
            </div>
            <div class="dietas">
              <b>{especiales.length} dietas especiales</b>
              {[...porDieta.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                <span key={k}><em>{n}</em> {k}</span>
              ))}
            </div>
            <p class="paso-a-paso" style="margin: 0 0 8px">Separá estas viandas antes. No les des la común.</p>
            {especiales.map((p) => {
              const m = entregada(p)
              return (
                <button key={p.numero} class={`vesp ${m ? "dada" : ""}`} onClick={() => tocar(p)}>
                  <span class="esp-tipo">{comidaDe(p.comida)}</span>
                  <span class="esp-quien">
                    <b>{titulo(p.nombre)} {titulo(p.apellido)}</b>
                    <span>{p.es_equipo ? 'Equipo' : `Pechera ${p.numero}`}{m ? ` · ✓ entregada ${hora(m.marcado_en)}` : ' · tocá cuando se la des'}</span>
                  </span>
                  <span class="mar">{m ? '✓' : ''}</span>
                </button>
              )
            })}
          </div>
        )}

        <div class="h">Viandas comunes</div>
        <button class="btn escanear" onClick={() => setEscaneando(true)}>📷 Escanear QR para entregar</button>
        {escaneando && <Escaner titulo="Entrega de viandas" alLeer={entregar} alCerrar={() => setEscaneando(false)} />}

        <form
          class="pornum"
          onSubmit={(ev) => { ev.preventDefault(); setEco(entregar(parseInt(num, 10))); setNum('') }}
        >
          <input
            class="busc grande"
            placeholder="Nº de pechera"
            inputMode="numeric"
            pattern="[0-9]*"
            value={num}
            onInput={(ev) => { setNum((ev.currentTarget as HTMLInputElement).value.replace(/\D/g, '')); setEco(null) }}
            autoComplete="off"
          />
          <button class="btn" type="submit" disabled={!num}>Entregar</button>
        </form>
        {eco && (
          <div class={`eco ${eco.tono === 'mal' ? 'mal' : eco.tono === 'ojo' ? 'ojo' : 'ok'}`}>
            {eco.texto}
            {eco.detalle && <small>{eco.detalle}</small>}
          </div>
        )}

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
          <button class={`chip ${soloFaltan ? 'act' : ''}`} onClick={() => setSoloFaltan(true)}>Faltan</button>
          <button class={`chip ${!soloFaltan ? 'act' : ''}`} onClick={() => setSoloFaltan(false)}>Todos</button>
          {tipo && <button class="chip act" onClick={() => setTipo(null)}>{tipo} ×</button>}
        </div>

        {!todos.length ? (
          <div class="vac">Todavía no hay padrón cargado.</div>
        ) : !lista.length ? (
          <div class="vac">{soloFaltan ? 'No falta nadie de este grupo. 🙌' : 'Nadie con eso.'}</div>
        ) : (
          lista.map((p) => {
            const m = entregada(p)
            const c = comidaDe(p.comida)
            return (
              <button key={p.numero} class={`fila ${m ? 'on' : ''}`} onClick={() => tocar(p)}>
                <span class="num">{p.es_equipo ? 'EQ' : p.numero}</span>
                <span class="nom">
                  {p.apellido}, {titulo(p.nombre)}
                  {c && <em class="rest">⚠ {c}</em>}
                  {m && <small>entregada · {hora(m.marcado_en)}</small>}
                </span>
                <span class="mar">{m ? '✓' : ''}</span>
              </button>
            )
          })
        )}
      </div>
    </>
  )
}
