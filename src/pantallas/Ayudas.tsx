import { useEffect, useState } from 'preact/hooks'
import { useDatos, resolverAviso } from '../lib/datos'
import { paraLlamar } from '../lib/padron'
import { POSTAS_POR_DEFECTO as POSTAS } from '../lib/postas'
import { esPedido, type Aviso, type Persona } from '../lib/regla'
import { hora } from '../lib/exportar'
import { Estado } from './comunes'
import { titulo } from './Peregrino'

/**
 * Los pedidos de ayuda, solos en su pantalla: es lo urgente. Cada uno con lo
 * necesario para ir a buscar a la persona sin buscar nada más: dónde está
 * (Maps), a quién llamar, por dónde pasó la última vez y hace cuánto.
 */
export function Ayudas() {
  const e = useDatos()
  const [verResueltos, setVerResueltos] = useState(false)
  // para que el "hace X min" se actualice solo
  const [, latir] = useState(0)
  useEffect(() => {
    const t = setInterval(() => latir((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  const porNumero = new Map(e.padron.map((p) => [p.numero, p]))
  const pedidos = e.avisos.filter(esPedido)
  const abiertos = pedidos.filter((a) => !a.resuelto)
  const cerrados = pedidos.filter((a) => a.resuelto)

  return (
    <>
      <div class="cab">
        <div class="lema-equipo"><b>EQUIPO</b> Servicio y pasión, por amar, por vivir</div>
        <div class="cont" style="margin-top: 4px">
          <span class="n">{abiertos.length}</span>
          <span class="de">{abiertos.length === 1 ? 'pedido de ayuda abierto' : 'pedidos de ayuda abiertos'}</span>
        </div>
        <Estado />
      </div>

      <div class="cpo">
        {!abiertos.length && (
          <div class="vac">
            Nadie pidió ayuda por ahora. 🙌
            <br />
            Cuando alguien toque "Necesito ayuda" o "No puedo seguir", aparece acá con su ubicación y su teléfono.
          </div>
        )}

        {abiertos.map((a) => <Pedido key={a.id} a={a} p={porNumero.get(a.peregrino)} />)}

        {cerrados.length > 0 && (
          <button class="link" onClick={() => setVerResueltos(!verResueltos)}>
            {verResueltos ? 'Ocultar' : 'Ver'} {cerrados.length} {cerrados.length === 1 ? 'resuelto' : 'resueltos'}
          </button>
        )}
        {verResueltos && cerrados.map((a) => <Pedido key={a.id} a={a} p={porNumero.get(a.peregrino)} />)}
      </div>
    </>
  )
}

function haceCuanto(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  return `hace ${Math.floor(min / 60)} h ${min % 60} min`
}

function Pedido({ a, p }: { a: Aviso; p?: Persona }) {
  const desde = POSTAS.find((x) => x.id === a.desde_posta)
  const tel = paraLlamar(p?.tel ?? null)
  const emerg = paraLlamar(p?.tel_emerg ?? null)
  const nombre = p ? `${titulo(p.nombre)} ${titulo(p.apellido)}` : `Nº ${a.peregrino}`

  return (
    <div class={`pedido ${a.resuelto ? 'resuelto' : a.tipo}`}>
      <div class="pedido-tipo">
        {a.tipo === 'ayuda' ? '🆘 Necesita ayuda' : '🛑 No puede seguir caminando'}
        <span>{hora(a.creado_en)} · {haceCuanto(a.creado_en)}</span>
      </div>
      <div class="pedido-quien">
        <b>{nombre}</b>
        <span>
          {p?.es_equipo ? 'Equipo' : `Pechera ${a.peregrino}`}
          {' · '}{desde ? `última parada: ${desde.nombre}` : 'no pasó por ninguna parada'}
        </span>
        {p?.nota && <span class="tenue">{p.nota}</span>}
      </div>

      <div class="pedido-acciones">
        {a.lat != null && a.lng != null ? (
          <a
            class="btn mapa-grande"
            href={`https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}`}
            target="_blank"
            rel="noopener"
          >
            📍 Ir a buscarlo con Maps
            <small>ubicación de las {a.ubic_en ? hora(a.ubic_en) : hora(a.creado_en)}, ±{a.precision_m ?? '?'} m</small>
          </a>
        ) : (
          <div class="sin-ubic">Sin ubicación: el GPS de su celular no respondió. Llamalo para saber dónde está.</div>
        )}
        <div class="pedido-tels">
          {tel ? <a class="btn llamar-tel" href={`tel:${tel}`}>📞 Llamar a {p ? titulo(p.nombre) : 'la persona'}</a>
            : <span class="tenue">No tiene un celular que se pueda llamar.</span>}
          {emerg && <a class="btn sec" href={`tel:${emerg}`}>📞 Contacto de emergencia</a>}
        </div>
        {!a.resuelto && (
          <button class="btn sec" onClick={() => confirm('¿Ya lo encontraron y está bien?') && resolverAviso(a.id)}>
            ✓ Ya está resuelto
          </button>
        )}
      </div>
    </div>
  )
}
