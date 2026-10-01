/**
 * Los QR de las pecheras. Adentro solo va el número, con un prefijo para que
 * el escáner ignore cualquier otro QR que se le cruce (un cartel, un menú).
 * No es secreto: el número ya está impreso grande en la pechera.
 *
 * Las dos bibliotecas entran por import() diferido: el peregrino que solo
 * toca "Llegué" no las descarga nunca en el primer load. El service worker
 * igual las precachea, así que el escáner anda sin señal.
 */

const PREFIJO = 'PL52-'

export function codigoDe(numero: number): string {
  return PREFIJO + numero
}

/** "PL52-123" → 123. Acepta también un número pelado, por si algún QR se hizo a mano. */
export function leerCodigo(texto: string): number | null {
  const t = texto.trim().toUpperCase()
  const m = t.startsWith(PREFIJO) ? t.slice(PREFIJO.length) : /^\d{1,4}$/.test(t) ? t : null
  const n = m ? parseInt(m, 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function svgDe(numero: number): Promise<string> {
  const { renderSVG } = await import('uqr')
  // corrección de errores media: aguanta una pechera arrugada o mojada
  return renderSVG(codigoDe(numero), { ecc: 'M', border: 2 })
}

type Detector = { detect(fuente: CanvasImageSource): Promise<{ rawValue: string }[]> }

/**
 * Un lector de cuadros de video. Usa el detector del navegador si hay
 * (Chrome en Android: rápido y no pesa nada) y si no, jsQR (iPhone).
 */
export async function crearLector(): Promise<(video: HTMLVideoElement) => Promise<string | null>> {
  const BD = (globalThis as unknown as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector
  if (BD) {
    try {
      const det = new BD({ formats: ['qr_code'] })
      return async (video) => {
        const r = await det.detect(video)
        return r[0]?.rawValue ?? null
      }
    } catch { /* sigue con jsQR */ }
  }
  const jsQR = (await import('jsqr')).default
  const lienzo = document.createElement('canvas')
  const ctx = lienzo.getContext('2d', { willReadFrequently: true })!
  return async (video) => {
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return null
    // achicado: en un celular de gama baja analizar 1080p por cuadro es lento
    const escala = Math.min(1, 640 / Math.max(w, h))
    lienzo.width = Math.round(w * escala)
    lienzo.height = Math.round(h * escala)
    ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height)
    const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height)
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null
  }
}
