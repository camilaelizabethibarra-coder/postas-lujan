import { useEffect, useState } from 'preact/hooks'
import { useDatos } from '../lib/datos'
import { svgDe } from '../lib/qr'
import { SALIDAS } from '../lib/postas'
import { titulo } from './Peregrino'

/**
 * Hoja para imprimir: una tarjeta por persona con su QR, el número grande y el
 * nombre, para pegar en la pechera o colgar como credencial. El QR tiene que
 * estar impreso: si vive solo en el celular del peregrino, se muere con la batería.
 */
export function QRs({ alVolver }: { alVolver: () => void }) {
  const e = useDatos()
  const [svgs, setSvgs] = useState<Map<number, string>>(new Map())
  const [soloEquipo, setSoloEquipo] = useState<null | boolean>(null)

  const gente = e.padron
    .filter((p) => p.activo)
    .filter((p) => soloEquipo == null || p.es_equipo === soloEquipo)
    .sort((a, b) => Number(a.es_equipo) - Number(b.es_equipo) || a.numero - b.numero)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const m = new Map<number, string>()
      for (const p of e.padron) m.set(p.numero, await svgDe(p.numero))
      if (vivo) setSvgs(m)
    })()
    return () => { vivo = false }
  }, [e.padron])

  return (
    <div class="cpo qrs">
      <div class="no-imprimir">
        <button class="link" style="padding-left: 0" onClick={alVolver}>← Volver</button>
        <div class="h" style="margin-top: 6px">QR de las pecheras</div>
        <p class="aviso">
          Una tarjeta por persona. Imprimila y pegala en la pechera o colgala como credencial:
          el equipo la escanea en cada parada y en la entrega de viandas. Si alguna se pierde,
          el número de pechera sigue sirviendo.
        </p>
        <div class="chips">
          <button class={`chip ${soloEquipo == null ? 'act' : ''}`} onClick={() => setSoloEquipo(null)}>Todos</button>
          <button class={`chip ${soloEquipo === false ? 'act' : ''}`} onClick={() => setSoloEquipo(false)}>Peregrinos</button>
          <button class={`chip ${soloEquipo === true ? 'act' : ''}`} onClick={() => setSoloEquipo(true)}>Equipo</button>
        </div>
        <button class="btn" onClick={() => print()} disabled={svgs.size === 0}>
          {svgs.size ? `Imprimir ${gente.length} tarjetas` : 'Armando los QR…'}
        </button>
      </div>

      <div class="tarjetas">
        {gente.map((p) => (
          <div key={p.numero} class={`tarjeta ${p.es_equipo ? 'eq' : ''}`}>
            <div class="t-qr" dangerouslySetInnerHTML={{ __html: svgs.get(p.numero) ?? '' }} />
            <div class="t-num">{p.es_equipo ? 'EQUIPO' : p.numero}</div>
            <div class="t-nom">{titulo(p.nombre)} {titulo(p.apellido)}</div>
            <div class="t-pie">
              {p.es_equipo
                ? 'Servicio y pasión · '
                : p.tramo === 'solo_vuelta'
                  ? 'Solo vuelta · '
                  : p.salida_ok
                    ? `Sale de ${SALIDAS.find((s) => s.tramo === p.tramo)?.nombre ?? 'Morón'} · `
                    : ''}
              Peregrinación N° 52
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
