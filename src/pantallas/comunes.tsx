import { useEffect, useState } from 'preact/hooks'
import { useDatos } from '../lib/datos'

/**
 * Estado de conexión. Siempre visible, discreto, sin alarmar. Nunca un botón
 * de "sincronizar": lo único que tiene que saber la persona es si lo suyo ya
 * subió o todavía no, y que no tiene que hacer nada al respecto.
 */
export function Estado({ centrado = false }: { centrado?: boolean }) {
  const e = useDatos()
  const n = e.pendientes
  const marcas = `${n} ${n === 1 ? 'marca' : 'marcas'}`

  let punto = ''
  let texto: string
  if (e.sesionVencida) {
    punto = 'mal'
    texto = `Se venció la sesión: ${marcas} sin subir. Volvé a entrar con el PIN.`
  } else if (n > 0 && e.conexion === 'guardando') {
    punto = 'esp'
    texto = `Guardando ${marcas}…`
  } else if (n > 0) {
    punto = 'loc'
    texto = `Sin señal · ${marcas} sin subir, suben solas`
  } else if (e.conexion === 'conectando') {
    punto = 'esp'
    texto = 'Conectando…'
  } else if (e.conexion === 'sinconexion') {
    punto = 'loc'
    texto = 'Sin señal · todo lo tuyo está guardado'
  } else {
    texto = e.conexion === 'demo' ? 'Al día (demo: nada sale del celular)' : 'Al día'
  }

  return (
    <div class="estado" style={centrado ? 'justify-content: center' : ''} role="status">
      <span class={`pt ${punto}`} />
      <span>{texto}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Instalación
// ---------------------------------------------------------------------------

type Evento = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let diferido: Evento | null = null

/** Se engancha en main.tsx, antes de que se dibuje nada: el evento llega una sola vez. */
export function escucharInstalacion() {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    diferido = e as Evento
    dispatchEvent(new Event('postas:instalable'))
  })
}

export function instalada(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function useListoSinSenal(): boolean {
  const [sw, setSw] = useState(Boolean(navigator.serviceWorker?.controller))
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.ready.then(() => setSw(true))
    const f = () => setSw(true)
    navigator.serviceWorker.addEventListener('controllerchange', f)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', f)
  }, [])
  return sw
}

/**
 * El aviso de "instalala con wifi antes de salir". Si alguien abre el link
 * por primera vez en la ruta, sin señal, no le va a andar nada, y eso no se
 * arregla con código: se arregla avisando a tiempo.
 */
export function Instalar() {
  const e = useDatos()
  const [, forzar] = useState(0)
  const sw = useListoSinSenal()

  useEffect(() => {
    const f = () => forzar((v) => v + 1)
    addEventListener('postas:instalable', f)
    addEventListener('appinstalled', f)
    return () => {
      removeEventListener('postas:instalable', f)
      removeEventListener('appinstalled', f)
    }
  }, [])

  const listo = sw && e.padron.length > 0
  if (instalada()) {
    return listo ? null : (
      <div class="caja instalar">
        <b>Falta terminar de descargar.</b>
        <p>Dejá la app abierta un momento con wifi o datos, hasta que desaparezca este aviso.</p>
      </div>
    )
  }

  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)

  return (
    <div class="caja instalar">
      <b>Antes de salir, con wifi: instalá la app.</b>
      <p>
        En la ruta no hay señal. Instalada, abre igual y guarda lo que marques hasta que vuelva la
        señal.
      </p>
      {diferido ? (
        <button
          class="btn"
          onClick={async () => {
            await diferido!.prompt()
            diferido = null
            forzar((v) => v + 1)
          }}
        >
          Instalar en este celular
        </button>
      ) : ios ? (
        <p>
          En iPhone: tocá <b>Compartir</b> (el cuadrado con la flecha) y después{' '}
          <b>Agregar a inicio</b>.
        </p>
      ) : (
        <p>
          Abrí el menú del navegador (<b>⋮</b>) y tocá <b>Instalar app</b> o{' '}
          <b>Agregar a pantalla principal</b>.
        </p>
      )}
      <p class={listo ? 'listo' : ''}>
        {listo ? '✓ Este celular ya puede abrirla sin señal.' : 'Descargando para usar sin señal…'}
      </p>
    </div>
  )
}

/**
 * La portada: la foto del camino, la Virgen de Luján con el sol girando atrás,
 * el lema y el número de peregrinación. Las imágenes van en /public y el
 * service worker las precachea, así que se ven igual sin señal.
 * En "compacta" ocupa poco alto, para no empujar el botón de "Llegué".
 */
export function Portada({
  compacta = false, etiqueta = 'Peregrinación N° 52',
  frase = '“Madre, en tu abrazo nos reconocemos hermanos”',
}: { compacta?: boolean; etiqueta?: string; frase?: string }) {
  return (
    <header class={`portada ${compacta ? 'compacta' : ''}`}>
      <div class="portada-marco">
        <span class="portada-sol" aria-hidden="true" />
        <img
          class="portada-virgen"
          src="/virgen.webp"
          alt="Nuestra Señora de Luján"
          width={262}
          height={440}
          decoding="async"
        />
      </div>
      <div class="portada-txt">
        <span class="portada-n">{etiqueta}</span>
        <p class="portada-frase">{frase}</p>
        {!compacta && <span class="portada-ruta">Morón → Luján · 3 de octubre</span>}
      </div>
      <svg class="portada-ola" viewBox="0 0 400 28" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 16 C 60 2, 120 30, 200 14 S 330 0, 400 12 L400 28 L0 28 Z" />
      </svg>
    </header>
  )
}

/** Papelitos celestes, blancos y amarillos al marcar una llegada. Se van solos. */
export function Festejo() {
  const colores = ['#8cc3e0', '#f1e25c', '#ffffff', '#1f6ba6']
  return (
    <div class="festejo" aria-hidden="true">
      {Array.from({ length: 22 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: colores[i % colores.length],
            animationDelay: `${(i % 7) * 40}ms`,
            ['--giro' as string]: `${(i % 2 ? 1 : -1) * (180 + i * 23)}deg`,
            ['--x' as string]: `${((i * 53) % 60) - 30}px`,
          }}
        />
      ))}
    </div>
  )
}
