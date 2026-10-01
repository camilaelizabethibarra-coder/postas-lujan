import { useMemo, useState } from 'preact/hooks'
import { useDatos, resolverAviso } from '../lib/datos'
import { paraLlamar } from '../lib/padron'
import { POSTAS_POR_DEFECTO as POSTAS } from '../lib/postas'
import { dondeEstan, esperadosEn, marcaDe, confirmada, ultimaPosta, enMicro, esPedido, type Persona } from '../lib/regla'
import { hora } from '../lib/exportar'
import { titulo } from './Peregrino'

/**
 * La vista operativa: no quién falta en una posta suelta, sino en qué tramo
 * está cada uno. Arriba, lo urgente: los pedidos de auxilio.
 */
export function Donde() {
  const e = useDatos()
  const [abierto, setAbierto] = useState<number | null>(null)

  const porNumero = useMemo(() => new Map(e.padron.map((p) => [p.numero, p])), [e.padron])
  const micro = useMemo(() => enMicro(e.avisos), [e.avisos])
  const { grupos, soloVuelta, vanEnMicro } = useMemo(
    () => dondeEstan(e.padron, e.marcas, POSTAS, micro), [e.padron, e.marcas, micro])
  const pedidos = e.avisos.filter(esPedido)
  const pendientes = pedidos.filter((a) => !a.resuelto)
  const resueltos = pedidos.length - pendientes.length

  const chip = (p: Persona) => (
    <button
      key={p.numero}
      class={`per ${abierto === p.numero ? 'abierto' : ''}`}
      onClick={() => setAbierto(abierto === p.numero ? null : p.numero)}
      aria-expanded={abierto === p.numero}
    >
      {p.es_equipo ? 'EQ' : p.numero} {p.apellido}
    </button>
  )
  /** La ficha del tocado va debajo de su grupo, con los botones para llamar. */
  const ficha = (gente: Persona[], atras: boolean) => {
    const p = gente.find((x) => x.numero === abierto)
    return p ? <Ficha p={p} atras={atras} /> : null
  }

  return (
    <div class="cpo">
      {pendientes.length > 0 && (
        <>
          <div class="h" style="color: var(--alerta)">Pidieron ayuda</div>
          {pendientes.map((a) => {
            const p = porNumero.get(a.peregrino)
            const desde = POSTAS.find((x) => x.id === a.desde_posta)
            return (
              <div key={a.id} class="avi">
                <span class="nom">
                  {a.peregrino} {p ? `${p.apellido}, ${titulo(p.nombre)}` : ''}
                  <small>
                    <b>{a.tipo === 'ayuda' ? 'necesita ayuda' : 'no puede seguir'}</b>
                    {' · '}{desde ? `pasó por ${desde.nombre}` : 'sin ningún registro'}
                    {' · '}{hora(a.creado_en)}
                    {p?.micro ? ` · micro ${p.micro}` : ''}
                    {a.lat != null
                      ? ` · ubicación ±${a.precision_m ?? '?'} m${a.ubic_en ? ` (${hora(a.ubic_en)})` : ''}`
                      : ' · sin ubicación'}
                  </small>
                </span>
                {a.lat != null && a.lng != null && (
                  <a
                    class="pill mapa"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}`}
                    target="_blank"
                    rel="noopener"
                  >
                    Ir con Maps
                  </a>
                )}
                <Llamar tel={p?.tel} />
                <button
                  class="pill"
                  onClick={() => confirm('¿Ya está resuelto?') && resolverAviso(a.id)}
                >
                  Listo
                </button>
              </div>
            )
          })}
        </>
      )}

      <div class="h">Última posta por la que pasó cada uno</div>
      {!e.padron.length && <div class="vac">Cargá el padrón para ver esto.</div>}
      {grupos.map((g) => (
        <div key={g.indice} class={`grp ${g.atras ? 'atras' : ''}`}>
          <h4>
            {g.indice >= 0 ? POSTAS[g.indice]!.nombre : 'Sin ningún registro'}
            <em>{g.gente.length}</em>
            {g.atras && <em class="ojo">quedaron atrás</em>}
          </h4>
          <div class="gente">{g.gente.map(chip)}</div>
          {ficha(g.gente, g.atras)}
        </div>
      ))}
      {vanEnMicro.length > 0 && (
        <div class="grp">
          <h4>🚌 Dejaron de caminar, van en el micro <em>{vanEnMicro.length}</em></h4>
          <div class="gente">{vanEnMicro.map(chip)}</div>
          {ficha(vanEnMicro, false)}
        </div>
      )}
      {soloVuelta.length > 0 && (
        <div class="grp">
          <h4>Se suman más adelante <em>{soloVuelta.length}</em></h4>
          <div class="gente">{soloVuelta.map(chip)}</div>
          {ficha(soloVuelta, false)}
        </div>
      )}

      <div class="h">Presentes confirmados por posta</div>
      <div class="caja">
        {POSTAS.map((p) => {
          const esperados = esperadosEn(e.padron, e.marcas, p, micro)
          const c = esperados.filter((x) => confirmada(e.marcas, p.id, x.numero)).length
          const pct = esperados.length ? Math.round((c * 100) / esperados.length) : 0
          return (
            <div key={p.id} class="res">
              <span class="nm">{p.nombre}</span>
              <span class="bar"><i style={`width: ${pct}%`} /></span>
              <span class="ct">{c}<span class="tenue">/{esperados.length}</span></span>
            </div>
          )
        })}
      </div>

      {resueltos > 0 && (
        <p class="aviso" style="margin-top: 14px">
          {resueltos} {resueltos === 1 ? 'pedido de ayuda resuelto' : 'pedidos de ayuda resueltos'}.
        </p>
      )}
    </div>
  )
}

function Llamar({ tel, texto = 'Llamar' }: { tel?: string | null; texto?: string }) {
  const n = paraLlamar(tel ?? null)
  if (!n) return null
  return (
    <a class="pill" href={`tel:${n}`}>
      {texto}
    </a>
  )
}

function Ficha({ p, atras }: { p: Persona; atras: boolean }) {
  const e = useDatos()
  const u = ultimaPosta(e.marcas, POSTAS, p.numero)
  const m = u >= 0 ? marcaDe(e.marcas, POSTAS[u]!.id, p.numero) : undefined
  return (
    <div class={`ficha ${atras ? 'atras' : ''}`}>
      <b>{p.apellido}, {titulo(p.nombre)}</b>
      <span class="tenue">
        {m ? `Última: ${POSTAS[u]!.nombre} a las ${hora(m.marcado_en)}${m.via === 'peregrino' ? ' (declarado)' : ''}` : 'No aparece en ninguna posta'}
        {p.micro ? ` · micro ${p.micro}` : ''}
      </span>
      {p.nota && <span class="tenue">{p.nota}</span>}
      <span style="display: flex; gap: 6px; margin-top: 6px">
        <Llamar tel={p.tel} />
        <Llamar tel={p.tel_emerg} texto="Emergencia" />
        {!paraLlamar(p.tel ?? null) && !paraLlamar(p.tel_emerg ?? null) && (
          <span class="tenue">Sin teléfono para llamar</span>
        )}
      </span>
    </div>
  )
}
