import { useEffect, useRef, useState } from 'preact/hooks'
import { crearLector, leerCodigo } from '../lib/qr'

export type Lectura = { tono: 'ok' | 'ya' | 'ojo' | 'mal'; texto: string; detalle?: string }

/**
 * Cámara abierta, leyendo de corrido: se escanea una pechera, suena, se ve el
 * nombre, y ya está lista para la siguiente. Así una posta pasa 180 personas
 * sin tocar la pantalla entre una y otra.
 *
 * El mismo número leído dos veces seguidas en pocos segundos se ignora: el QR
 * queda frente a la cámara más de un cuadro.
 */
export function Escaner({
  titulo, alLeer, alCerrar,
}: { titulo: string; alLeer: (numero: number) => Lectura; alCerrar: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [ultima, setUltima] = useState<Lectura | null>(null)
  const [cuenta, setCuenta] = useState(0)
  const [error, setError] = useState('')
  const [linterna, setLinterna] = useState<null | boolean>(null)
  const pista = useRef<MediaStreamTrack | null>(null)
  // la función cambia en cada render de quien la pasa; el bucle usa siempre la última
  const leer = useRef(alLeer)
  leer.current = alLeer

  useEffect(() => {
    let vivo = true
    let flujo: MediaStream | null = null
    const recientes = new Map<number, number>()

    ;(async () => {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
      } catch {
        setError('No pude abrir la cámara. Fijate de darle permiso a la app, o marcá por número.')
        return
      }
      if (!vivo) { flujo.getTracks().forEach((t) => t.stop()); return }
      const v = video.current!
      v.srcObject = flujo
      await v.play().catch(() => {})
      pista.current = flujo.getVideoTracks()[0] ?? null
      const capac = (pista.current?.getCapabilities?.() ?? {}) as { torch?: boolean }
      if (capac.torch) setLinterna(false)

      const lector = await crearLector()
      while (vivo) {
        const texto = await lector(v).catch(() => null)
        const n = texto ? leerCodigo(texto) : null
        const ahora = Date.now()
        if (texto && n == null) {
          setUltima({ tono: 'mal', texto: 'Ese QR no es de la app de la peregrinación' })
        } else if (n != null && ahora - (recientes.get(n) ?? 0) > 3000) {
          recientes.set(n, ahora)
          const r = leer.current(n)
          setUltima(r)
          if (r.tono === 'ok' || r.tono === 'ojo') setCuenta((c) => c + 1)
          sonar(r.tono)
          navigator.vibrate?.(r.tono === 'mal' ? [80, 60, 80] : r.tono === 'ojo' ? [40, 40, 40, 40, 120] : 50)
        }
        await new Promise((ok) => setTimeout(ok, 180))
      }
    })()

    return () => {
      vivo = false
      flujo?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  async function alternarLinterna() {
    const nueva = !linterna
    try {
      await pista.current?.applyConstraints({ advanced: [{ torch: nueva } as MediaTrackConstraintSet] })
      setLinterna(nueva)
    } catch { setLinterna(null) }
  }

  return (
    <div class="escaner" role="dialog" aria-label={titulo}>
      <div class="esc-cab">
        <b>{titulo}</b>
        <span>{cuenta ? `${cuenta} en esta tanda` : 'Apuntá al QR en el celular del peregrino'}</span>
        {linterna != null && (
          <button class="esc-bot" onClick={alternarLinterna} aria-pressed={linterna}>
            {linterna ? '🔦 Apagar' : '🔦 Luz'}
          </button>
        )}
        <button class="esc-bot" onClick={alCerrar}>Listo</button>
      </div>
      <div class="esc-video">
        <video ref={video} playsInline muted />
        <span class="esc-mira" aria-hidden="true" />
      </div>
      {error ? (
        <div class="esc-res mal">{error}</div>
      ) : ultima ? (
        <div class={`esc-res ${ultima.tono}`} key={cuenta + ultima.texto}>
          <b>{ultima.texto}</b>
          {ultima.detalle && <span>{ultima.detalle}</span>}
        </div>
      ) : (
        <div class="esc-res">Cuando lea un QR vas a ver acá el nombre.</div>
      )}
    </div>
  )
}

let audio: AudioContext | null = null
/** Un pitido corto: agudo si salió bien, grave si no. Se oye aunque no se mire la pantalla. */
function sonar(tono: Lectura['tono']) {
  try {
    audio ??= new AudioContext()
    const o = audio.createOscillator()
    const g = audio.createGain()
    o.frequency.value = tono === 'mal' ? 220 : tono === 'ojo' ? 660 : tono === 'ya' ? 520 : 880
    g.gain.setValueAtTime(0.15, audio.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + (tono === 'ojo' ? 0.45 : 0.15))
    o.connect(g).connect(audio.destination)
    o.start()
    o.stop(audio.currentTime + 0.5)
  } catch { /* sin sonido, igual vibra */ }
}
