import { useMemo, useState } from 'preact/hooks'
import { useDatos } from '../lib/datos'
import { paraLlamar } from '../lib/padron'
import { POSTAS_POR_DEFECTO as POSTAS } from '../lib/postas'
import {
  dondeEstan, esperadosEn, marcaDe, confirmada, ultimaPosta, enMicro, esPedido, type Persona,
} from '../lib/regla'
import { hora } from '../lib/exportar'
import { Estado } from './comunes'
import { titulo } from './Peregrino'

/**
 * El mapa del día: el recorrido como una ruta, con cuánta gente hay en cada
 * parada ahora (según el último lugar donde apareció) y cuántos pasaron
 * confirmados. Tocando una parada se ve quiénes son, y tocando a alguien, su
 * ficha con los botones para llamar.
 */
export function Donde({ alVerAyudas }: { alVerAyudas: () => void }) {
  const e = useDatos()
  const [abierto, setAbierto] = useState<string | null>(null)
  const [persona, setPersona] = useState<number | null>(null)

  const micro = useMemo(() => enMicro(e.avisos), [e.avisos])
  const { grupos, soloVuelta: seSuman, vanEnMicro } = useMemo(
    () => dondeEstan(e.padron, e.marcas, POSTAS, micro), [e.padron, e.marcas, micro])
  const pedidos = e.avisos.filter((a) => esPedido(a) && !a.resuelto)
  const conPedido = new Set(pedidos.map((a) => a.peregrino))

  const grupo = (i: number) => grupos.find((g) => g.indice === i)
  const sinRegistro = grupo(-1)?.gente ?? []
  const enLujan = [3, 4].reduce((n, i) => n + (grupo(i)?.gente.length ?? 0), 0)
  const caminando = grupos.filter((g) => g.indice >= 0 && g.indice < 3).reduce((n, g) => n + g.gente.length, 0)

  const chip = (p: Persona) => (
    <button
      key={p.numero}
      class={`per ${persona === p.numero ? 'abierto' : ''} ${conPedido.has(p.numero) ? 'pide' : ''}`}
      onClick={() => setPersona(persona === p.numero ? null : p.numero)}
    >
      {conPedido.has(p.numero) && '🆘 '}{p.es_equipo ? 'EQ' : p.numero} {p.apellido}
    </button>
  )
  const ficha = (gente: Persona[]) => {
    const p = gente.find((x) => x.numero === persona)
    return p ? <Ficha p={p} enMicro={micro.has(p.numero)} /> : null
  }
  const desplegable = (clave: string, gente: Persona[]) =>
    abierto === clave && (
      <div class="ruta-gente">
        <div class="gente">{gente.map(chip)}</div>
        {ficha(gente)}
      </div>
    )

  return (
    <>
      <div class="cab">
        <div class="lema-equipo"><b>EQUIPO</b> Servicio y pasión, por amar, por vivir</div>
        <div class="h" style="margin: 2px 0 6px">Dónde está cada uno</div>
        <Estado />
      </div>

      <div class="cpo">
        {pedidos.length > 0 && (
          <button class="avi" onClick={alVerAyudas}>
            <span class="nom">
              🆘 {pedidos.length === 1 ? '1 pedido de ayuda' : `${pedidos.length} pedidos de ayuda`}
              <small>Tocá para ver dónde están y llamarlos</small>
            </span>
            <span class="pill">Ver</span>
          </button>
        )}

        {!e.padron.length && <div class="vac">Todavía no hay padrón cargado.</div>}

        <div class="resumen">
          <div class="res-t"><b>{caminando}</b><span>🚶 caminando</span></div>
          <div class="res-t"><b>{vanEnMicro.length}</b><span>🚌 en el micro</span></div>
          <div class="res-t"><b>{enLujan}</b><span>⛪ en Luján</span></div>
          <div class={`res-t ${sinRegistro.length ? 'ojo' : ''}`}><b>{sinRegistro.length}</b><span>❓ sin registro</span></div>
        </div>

        <div class="h">El recorrido</div>
        <div class="recorrido">
          {POSTAS.map((p, i) => {
            const g = grupo(i)
            const aca = g?.gente ?? []
            const esperados = esperadosEn(e.padron, e.marcas, p, micro)
            const conf = esperados.filter((x) => confirmada(e.marcas, p.id, x.numero)).length
            const pct = esperados.length ? Math.round((conf * 100) / esperados.length) : 0
            return (
              <div key={p.id} class={`estacion ${aca.length ? 'con' : ''} ${g?.atras ? 'atras' : ''}`}>
                <button class="est-fila" onClick={() => setAbierto(abierto === p.id ? null : p.id)} disabled={!aca.length}>
                  <span class="est-punto">{aca.length || ''}</span>
                  <span class="est-txt">
                    <b>{p.nombre}</b>
                    <span>
                      {aca.length ? `${aca.length} ${aca.length === 1 ? 'está' : 'están'} acá ahora` : 'nadie acá ahora'}
                      {g?.atras && ' · ⚠ quedaron atrás'}
                    </span>
                    <span class="est-barra"><i style={`width: ${pct}%`} /></span>
                    <span class="tenue">{conf} de {esperados.length} pasaron confirmados</span>
                  </span>
                  {aca.length > 0 && <span class="est-ver">{abierto === p.id ? '▴' : '▾'}</span>}
                </button>
                {desplegable(p.id, aca)}
              </div>
            )
          })}
        </div>

        {[
          ['micro', '🚌 Dejaron de caminar, van en el micro', vanEnMicro],
          ['sin', '❓ Todavía no aparecen en ninguna parada', sinRegistro],
          ['suman', '⏩ Se suman más adelante (La Reja, Rodríguez, Liniers, solo vuelta)', seSuman],
        ].map(([k, t, gente]) => (gente as Persona[]).length > 0 && (
          <div key={k as string} class="grp">
            <button class="grp-tit" onClick={() => setAbierto(abierto === k ? null : (k as string))}>
              <span>{t as string}</span>
              <em>{(gente as Persona[]).length}</em>
              <span class="est-ver">{abierto === k ? '▴' : '▾'}</span>
            </button>
            {desplegable(k as string, gente as Persona[])}
          </div>
        ))}
      </div>
    </>
  )
}

function Llamar({ tel, texto = 'Llamar' }: { tel?: string | null; texto?: string }) {
  const n = paraLlamar(tel ?? null)
  if (!n) return null
  return <a class="pill" href={`tel:${n}`}>{texto}</a>
}

function Ficha({ p, enMicro }: { p: Persona; enMicro: boolean }) {
  const e = useDatos()
  const u = ultimaPosta(e.marcas, POSTAS, p.numero)
  const m = u >= 0 ? marcaDe(e.marcas, POSTAS[u]!.id, p.numero) : undefined
  return (
    <div class="ficha">
      <b>{p.apellido}, {titulo(p.nombre)} · {p.es_equipo ? 'Equipo' : `Pechera ${p.numero}`}</b>
      <span class="tenue">
        {m ? `Última: ${POSTAS[u]!.nombre} a las ${hora(m.marcado_en)}${m.via === 'peregrino' ? ' (lo dijo él, falta confirmar)' : ''}` : 'No aparece en ninguna parada'}
      </span>
      {enMicro && <span>🚌 Va en el micro</span>}
      {p.nota && <span class="tenue">{p.nota}</span>}
      <span style="display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap">
        <Llamar tel={p.tel} />
        <Llamar tel={p.tel_emerg} texto="Emergencia" />
        {!paraLlamar(p.tel ?? null) && !paraLlamar(p.tel_emerg ?? null) && (
          <span class="tenue">Sin teléfono para llamar</span>
        )}
      </span>
    </div>
  )
}
