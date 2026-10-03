import { useEffect, useMemo, useState } from 'preact/hooks'
import { useDatos, marcar, pedirAuxilio, elegirSalida } from '../lib/datos'
import { arrancar } from '../lib/sync'
import { esDemo } from '../lib/demo'
import { normalizar } from '../lib/padron'
import { POSTAS_POR_DEFECTO as POSTAS, SALIDAS, COORDINADORES, textoLlegue, textoListo, seEsperaEn } from '../lib/postas'
import { proximaPosta, enMicro, esPedido, type Persona, type Ubicacion } from '../lib/regla'
import { hora } from '../lib/exportar'
import { Estado, Instalar, Portada, Festejo } from './comunes'
import { svgDe } from '../lib/qr'
import { Carta } from './Carta'

/**
 * El peregrino. Tres toques como techo desde que abre el link: tocar su
 * nombre, tocar "Llegué". Escribir el apellido no es un toque, pero igual
 * alcanza con tres o cuatro letras.
 */

const PREFIJO = esDemo() ? 'postas-demo:' : 'postas:'
const CLAVE_YO = PREFIJO + 'yo'
const CLAVE_ULTIMA = PREFIJO + 'ultima'
const CLAVE_SALIDA = PREFIJO + 'salida'
/** Cuánto dura el "Me equivoqué, borralo". */
const VENTANA = 2 * 60_000
/** Cuánto queda bloqueado el botón de la parada siguiente después de marcar. */
const FRENO = 3000

function leerYo(): number | null {
  try {
    const v = localStorage.getItem(CLAVE_YO)
    return v ? Number(v) : null
  } catch { return null }
}

export function Peregrino() {
  const e = useDatos()
  const [yo, setYo] = useState<number | null>(leerYo)
  // La salida se guarda por persona: "No soy yo" y volver a entrar no la vuelve a preguntar.
  const leerSalida = (n: number | null) => {
    if (n == null) return null
    try { return localStorage.getItem(`${CLAVE_SALIDA}:${n}`) ?? localStorage.getItem(CLAVE_SALIDA) } catch { return null }
  }
  const [salida, setSalida] = useState<string | null>(() => leerSalida(leerYo()))
  const [eligiendo, setEligiendo] = useState(false)

  useEffect(() => { arrancar({ rol: 'peregrino', numero: yo }) }, [yo])

  if (!e.listo) return null

  if (yo == null) {
    return (
      <Identificarse
        padron={e.padron}
        alElegir={(n) => {
          try { localStorage.setItem(CLAVE_YO, String(n)) } catch { /* nada */ }
          setSalida(leerSalida(n))
          setYo(n)
        }}
      />
    )
  }

  const persona = e.padron.find((p) => p.numero === yo) ?? {
    numero: yo, apellido: '', nombre: '', micro: null, tramo: 'completo' as const,
    es_equipo: false, nota: null, activo: true,
  }

  // Desde dónde arranca a caminar: define en qué postas se lo espera y a qué
  // hora tiene que estar en la parroquia. Se pregunta una sola vez, y solo si
  // la planilla no la traía y no la eligió antes (en este u otro celular).
  // "Cambiar" la vuelve a preguntar cuando quiera.
  const sinSalida = !salida && !persona.salida_ok && persona.tramo === 'completo'
  if ((eligiendo || sinSalida) && persona.tramo !== 'solo_vuelta') {
    return (
      <ElegirSalida
        alElegir={(t) => {
          try { localStorage.setItem(`${CLAVE_SALIDA}:${yo}`, t) } catch { /* nada */ }
          setSalida(t)
          setEligiendo(false)
          elegirSalida(yo, t as Persona['tramo'])
        }}
      />
    )
  }

  return (
    <Principal
      yo={salida && persona.tramo !== 'solo_vuelta' ? { ...persona, tramo: salida as Persona['tramo'] } : persona}
      alCambiarSalida={() => {
        setEligiendo(true)
      }}
      alSalir={() => {
        try {
          localStorage.removeItem(CLAVE_YO)
          localStorage.removeItem(CLAVE_ULTIMA)
        } catch { /* nada */ }
        setSalida(null)
        setYo(null)
      }}
    />
  )
}

// ---------------------------------------------------------------------------

function Identificarse({ padron, alElegir }: { padron: Persona[]; alElegir: (n: number) => void }) {
  const e = useDatos()
  const [q, setQ] = useState('')
  // Por número de pechera, que es lo que todos tienen a mano. El apellido queda de repuesto.
  const [porApellido, setPorApellido] = useState(false)

  const resultados = useMemo(() => {
    const b = normalizar(q)
    if (b.length < 2 && !/^\d+$/.test(b)) return []
    return padron
      .filter((p) => p.activo && !p.es_equipo)
      .filter((p) =>
        /^\d+$/.test(b)
          ? String(p.numero) === b
          : normalizar(`${p.apellido} ${p.nombre}`).includes(b) ||
            normalizar(`${p.nombre} ${p.apellido}`).includes(b),
      )
      .slice(0, 8)
  }, [q, padron])

  return (
    <div class="pantalla">
      <Portada />
      <div class="centro" style="padding-top: 10px">
        <div class="g">¿Quién sos?</div>
        <div class="s" style="margin-bottom: 14px">
          {porApellido ? 'Escribí tu apellido y tocá tu nombre' : 'Escribí tu número de pechera y tocá tu nombre'}
        </div>

        <div class="cartel-pechera">
          <b>Tu número de pechera te acompaña toda la peregrinación</b>
          <span>
            Con ese número entrás a la app y el equipo te da el presente en cada parada.
            Retirá tu pechera con el equipo <b>antes de empezar a caminar</b>: en la parroquia o en
            la primera parada donde te encuentres con nosotros.
          </span>
        </div>

        {padron.length === 0 ? (
          <div class="vac">
            {e.conexion === 'sinconexion'
              ? 'Todavía no se descargó la lista. Abrí la app una vez con wifi o datos.'
              : e.conexion === 'conectando'
                ? 'Descargando la lista…'
                : 'Los coordinadores todavía no cargaron la lista de peregrinos. Dejá la app abierta o volvé a entrar más tarde: aparece sola.'}
          </div>
        ) : (
          <>
            <input
              key={porApellido ? 'ap' : 'num'}
              class="busc grande"
              placeholder={porApellido ? 'Tu apellido' : 'Nº de pechera'}
              inputMode={porApellido ? 'text' : 'numeric'}
              pattern={porApellido ? undefined : '[0-9]*'}
              value={q}
              onInput={(ev) => setQ((ev.currentTarget as HTMLInputElement).value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellcheck={false}
              autoFocus
            />
            <button
              class="link"
              onClick={() => { setPorApellido(!porApellido); setQ('') }}
            >
              {porApellido ? 'Buscar por número de pechera' : 'No sé mi número, buscar por apellido'}
            </button>
            <div style="margin-top: 12px; text-align: left">
              {resultados.map((p) => (
                <button key={p.numero} class="sug" onClick={() => alElegir(p.numero)}>
                  <b>{p.apellido}, {titulo(p.nombre)}</b>
                  <span class="tenue"> · nº {p.es_equipo ? 'equipo' : p.numero}</span>
                </button>
              ))}
              {(porApellido ? q.trim().length >= 2 : q.trim().length >= 1) && !resultados.length && (
                <div class="vac">
                  {porApellido
                    ? 'No encontré a nadie con eso. Probá solo con las primeras letras del apellido.'
                    : 'No hay nadie con ese número. Revisá tu pechera o buscá por apellido.'}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <div class="cpo" style="padding-top: 0">
        <Instalar />
      </div>
      <div class="pie"><Estado centrado /></div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function ElegirSalida({ alElegir }: { alElegir: (tramo: string) => void }) {
  return (
    <div class="pantalla">
      <Portada compacta />
      <div class="centro" style="padding-top: 10px">
        <div class="g">¿Desde dónde salís?</div>
        <div class="s" style="margin-bottom: 18px">Desde donde arrancás a caminar</div>
        {SALIDAS.map((x) => (
          <button key={x.tramo} class="sug" onClick={() => alElegir(x.tramo)}>
            <b>{x.nombre}</b>
            <span class="tenue"> · {x.cita}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Lo que mandaron los coordinadores al grupo, a mano para releer en el camino. */
function InfoDelDia({ tramo, alCambiar }: { tramo: string; alCambiar: () => void }) {
  const s = SALIDAS.find((x) => x.tramo === tramo)
  return (
    <>
      {s && (
        <div class="caja" style="margin-top: 18px; text-align: left">
          <b>Salís desde {s.nombre}</b>
          <div class="tenue">{s.cita}</div>
          {tramo !== 'liniers' && <div style="margin-top: 4px"><b>¡Sé puntual así salimos en horario!</b></div>}
          <button class="link" style="padding-left: 0" onClick={alCambiar}>Cambiar</button>
        </div>
      )}
      <details class="caja info" style="margin-top: 12px; text-align: left">
        <summary><b>Info importante del día</b></summary>
        <ul>
          <li><b>Morón:</b> 7:00 en la parroquia. <b>La Reja / Rodríguez:</b> 9:00 en la parroquia.
            <b> Liniers:</b> van por su cuenta y se suman en las próximas paradas.</li>
          <li>Hay que <b>dar el presente en todas las paradas</b>. Si querés seguir de largo sin
            parar, <b>mandá un WhatsApp avisando</b>.</li>
          <li>Tené el celular con batería. Si te estás quedando sin batería, <b>avisá antes</b>.</li>
          <li>En <b>La Reja</b> se entrega la comida. Paramos en una escuela: podés comer tranquilo
            o agarrar la comida y seguir caminando.</li>
          <li>Contamos con <b>auto de apoyo</b>.</li>
          <li>Traé la <b>ficha médica</b> completa el día de la caminata.</li>
          <li>El sábado se manda al grupo la ubicación de cada parada por si hay cambios.</li>
          <li>Si falta algún conocido que se anotó y no está en el grupo, que se agregue.</li>
          <li>Dudas: <b>Cami Ibarra, Uri Tripo o Cami Acosta</b>.</li>
        </ul>
        <Llamar />
      </details>
    </>
  )
}

/**
 * La ubicación del GPS, que anda sin señal de datos. Si no responde a tiempo
 * o no dan permiso, el aviso sale igual sin ubicación: nunca frena un pedido de ayuda.
 */
function ubicacion(): Promise<Ubicacion | null> {
  return new Promise((listo) => {
    if (!navigator.geolocation) return listo(null)
    const corte = setTimeout(() => listo(null), 12_000)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(corte)
        listo({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          precision_m: Math.round(p.coords.accuracy),
          ubic_en: new Date(p.timestamp).toISOString(),
        })
      },
      () => { clearTimeout(corte); listo(null) },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  })
}

/**
 * El QR del peregrino, a la vista apenas entra: el equipo lo escanea en cada
 * parada. Es el mismo que el de la tarjeta impresa, así que da igual cuál
 * muestre. Se genera en el celular, sin señal. Tocándolo se agranda sobre
 * fondo blanco, que de noche es lo que mejor lee una cámara.
 */
function MiQR({ yo }: { yo: Persona }) {
  const [svg, setSvg] = useState('')
  const [grande, setGrande] = useState(false)
  useEffect(() => { svgDe(yo.numero).then(setSvg) }, [yo.numero])

  const nombre = yo.apellido ? `${titulo(yo.nombre)} ${titulo(yo.apellido)}` : ''
  return (
    <>
      <button class="mi-qr" onClick={() => setGrande(true)} aria-label="Agrandar mi QR">
        <span class="mi-qr-img" dangerouslySetInnerHTML={{ __html: svg }} />
        <span class="mi-qr-txt">
          <b>{yo.es_equipo ? 'Equipo' : `Nº ${yo.numero}`}</b>
          {nombre && <span>{nombre}</span>}
          <small>Mostrale este QR al equipo en cada parada, o el de tu pechera. Tocá para agrandar.</small>
        </span>
      </button>
      {grande && (
        <div class="qr-grande" role="dialog" aria-label="Mi QR" onClick={() => setGrande(false)}>
          <div dangerouslySetInnerHTML={{ __html: svg }} />
          <b>{yo.es_equipo ? 'Equipo' : `Nº ${yo.numero}`}</b>
          <span>{nombre}</span>
          <small>Subí el brillo de la pantalla · tocá para cerrar</small>
        </div>
      )}
    </>
  )
}

/** Llamar o escribir a una coordinadora: que pueda elegir a quién en el momento. */
function Llamar() {
  return (
    <div class="llamar">
      <span class="llamar-tit">Si podés, llamá directamente a una coordinadora:</span>
      {COORDINADORES.map((c) => (
        <div key={c.tel} class="llamar-fila">
          <a class="btn llamar-tel" href={`tel:+549${c.tel}`}>📞 {c.nombre}</a>
          <a class="llamar-wa" href={`https://wa.me/549${c.tel}`} target="_blank" rel="noopener">WhatsApp</a>
        </div>
      ))}
    </div>
  )
}

function leerUltima(): { posta: string; t: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_ULTIMA) || 'null')
    return v && Date.now() - v.t < VENTANA ? v : null
  } catch { return null }
}

function Principal({ yo, alSalir, alCambiarSalida }: { yo: Persona; alSalir: () => void; alCambiarSalida: () => void }) {
  const e = useDatos()
  const [ultima, setUltima] = useState(leerUltima)
  const [pidiendo, setPidiendo] = useState<null | 'bajo' | 'ayuda' | 'micro'>(null)
  const [mensaje, setMensaje] = useState('')
  const [frenado, setFrenado] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [festejo, setFestejo] = useState(0)

  // se cierra sola la ventana de "Me equivoqué"
  useEffect(() => {
    if (!ultima) return
    const t = setTimeout(() => setUltima(null), VENTANA - (Date.now() - ultima.t))
    return () => clearTimeout(t)
  }, [ultima])

  const voyEnMicro = enMicro(e.avisos).has(yo.numero)
  // llegó a Luján o subió al micro (lo marcó él o lo confirmó el equipo): la carta del equipo
  const llego = ['po4', 'po5'].some((id) => e.marcas.get(`${id}|${yo.numero}`)?.presente)
  const prox = proximaPosta(e.marcas, POSTAS, yo, voyEnMicro)
  const recien = ultima ? POSTAS.find((p) => p.id === ultima.posta) : undefined
  const miAviso = e.avisos.find((a) => a.peregrino === yo.numero && esPedido(a) && !a.resuelto)

  function llegue(posta: string) {
    setMensaje('')
    if (marcar(yo.numero, posta, 'peregrino', true)) {
      const u = { posta, t: Date.now() }
      try { localStorage.setItem(CLAVE_ULTIMA, JSON.stringify(u)) } catch { /* nada */ }
      setUltima(u)
      setFestejo((n) => n + 1)
      setTimeout(() => setFestejo(0), 1800)
      navigator.vibrate?.(60)
      // unos segundos sin poder tocar el botón siguiente: un doble toque de
      // alguien cansado no marca dos postas de una
      setFrenado(true)
      setTimeout(() => setFrenado(false), FRENO)
    }
  }

  function deshacer() {
    if (!ultima) return
    const ok = marcar(yo.numero, ultima.posta, 'peregrino', false)
    try { localStorage.removeItem(CLAVE_ULTIMA) } catch { /* nada */ }
    setUltima(null)
    if (!ok) setMensaje('No se puede borrar: el responsable de la posta ya te confirmó.')
  }

  // Después de marcar aparece enseguida la parada siguiente. Arriba queda el
  // "Llegaste a…" con el "Me equivoqué" durante la ventana para deshacer.
  const listo = recien && (
    <div class="caja listo">
      <b>✓ {textoListo(recien)}</b>
      <span class="tenue" style="font-size: 13px">El presente lo confirma el equipo cuando escanea tu pechera</span>
      <button class="link" onClick={deshacer}>Me equivoqué, borralo</button>
    </div>
  )
  let principal
  if (prox < 0) {
    principal = <>{listo}<div class="gigante hecho" style="margin-top: 22px">Pasaste por todas las postas</div></>
  } else {
    const p = POSTAS[prox]!
    principal = (
      <>
        {listo}
        <div class="rotulo">{recien ? 'SIGUIENTE PARADA' : 'PRÓXIMA POSTA'}</div>
        <div class="proxima">{p.nombre}</div>
        <button class="gigante" disabled={frenado} onClick={() => llegue(p.id)}>
          {textoLlegue(p)}
        </button>
      </>
    )
  }

  return (
    <div class="pantalla">
      {festejo > 0 && <Festejo key={festejo} />}
      <Portada compacta />
      <div class="centro" style="padding-top: 8px">
        <MiQR yo={yo} />
        {llego && <Carta numero={yo.numero} />}

        {voyEnMicro && (
          <div class="caja micro">
            <b>🚌 Dejaste de caminar: vas en el micro hasta Luján</b>
            <span>No hace falta que marques las paradas del medio. Si te sentís mejor, podés volver al grupo.</span>
            <button
              class="btn"
              onClick={() => { pedirAuxilio(yo.numero, 'camina'); navigator.vibrate?.(60) }}
            >
              Volví a caminar
            </button>
          </div>
        )}

        {principal}
        {mensaje && <div class="err">{mensaje}</div>}

        {miAviso && (
          <div class="caja alerta" style="margin-top: 16px">
            Ya le avisaste al equipo a las {hora(miAviso.creado_en)}
            {miAviso.lat != null ? ', con tu ubicación' : ' (sin ubicación: no se pudo leer el GPS)'}.
            Quedate donde estás, con el celular a mano.
            <Llamar />
          </div>
        )}

        <div class="ruta">
          {POSTAS.filter((p) => seEsperaEn(yo.tramo, p.orden)).map((p) => {
            const m = e.marcas.get(`${p.id}|${yo.numero}`)
            const on = m?.presente
            return (
              <div key={p.id} class={`paso ${on ? '' : 'pend'}`}>
                <span class={`bol ${on ? (m!.via === 'resp' ? 'on' : 'dijo') : ''}`} />
                <span style="flex: 1">{p.nombre}</span>
                {on && (
                  <span class="hora">
                    {m!.via === 'resp' ? '✓ presente' : 'falta que te confirme el equipo'} · {hora(m!.marcado_en)}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {pidiendo === 'micro' ? (
          <div class="caja" style="margin-top: 20px; text-align: left">
            <p class="aviso">
              ¿Te subís al micro hasta Luján? El equipo va a saber que dejaste de caminar y no te
              va a esperar en las paradas del medio. Cuando quieras, podés volver a caminar.
            </p>
            <button
              class="btn"
              onClick={() => {
                pedirAuxilio(yo.numero, 'micro')
                setPidiendo(null)
                navigator.vibrate?.(60)
              }}
            >
              Sí, dejé de caminar
            </button>
            <button class="btn sec" onClick={() => setPidiendo(null)}>Sigo caminando</button>
          </div>
        ) : pidiendo ? (
          <div class="caja" style="margin-top: 20px; text-align: left">
            <p class="aviso">
              {pidiendo === 'ayuda'
                ? 'El equipo va a ver que necesitás ayuda, por dónde pasaste la última vez y tu ubicación en el mapa.'
                : 'El equipo va a ver que no seguís caminando y tu ubicación en el mapa, para pasar a buscarte.'}
              {' '}Si el celular te pide permiso para usar tu ubicación, tocá <b>Permitir</b>.
            </p>
            <button
              class="btn peligro"
              disabled={buscando}
              onClick={async () => {
                setBuscando(true)
                const u = await ubicacion()
                await pedirAuxilio(yo.numero, pidiendo, u)
                setBuscando(false)
                setPidiendo(null)
                navigator.vibrate?.([60, 60, 60])
              }}
            >
              {buscando ? 'Buscando tu ubicación…' : 'Sí, avisar al equipo'}
            </button>
            <Llamar />
            <button class="btn sec" onClick={() => setPidiendo(null)}>Mejor no</button>
          </div>
        ) : (
          <div style="margin-top: 26px">
            {!voyEnMicro && prox >= 0 && POSTAS[prox]!.orden < 4 && (
              <button class="btn sec" onClick={() => setPidiendo('micro')}>🚌 Dejé de caminar, voy en el micro</button>
            )}
            <button class="btn sec" onClick={() => setPidiendo('bajo')}>No puedo seguir</button>
            <button class="btn sec" onClick={() => setPidiendo('ayuda')}>Necesito ayuda</button>
          </div>
        )}
      </div>

      <div class="cpo" style="padding-top: 0">
        <InfoDelDia tramo={yo.tramo} alCambiar={alCambiarSalida} />
        <Instalar />
      </div>

      <div class="pie">
        <Estado centrado />
        <button
          class="link tenue"
          onClick={() => confirm('¿Cambiar de persona en este celular?') && alSalir()}
        >
          No soy yo
        </button>
      </div>
    </div>
  )
}

/** "PEREZ" → "Perez". El padrón viene en mayúsculas y en grande cansa leerlo. */
export function titulo(s: string): string {
  return s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
}
