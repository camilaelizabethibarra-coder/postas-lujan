/**
 * Genera los iconos de la PWA sin dependencias.
 *
 * El dibujo son cinco puntos sobre un camino que sube: las cinco postas de
 * Morón a Luján. Se genera con un script en vez de commitear PNG sueltos
 * para que se pueda cambiar el color de un lado solo.
 *
 *   node scripts/icono.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const FONDO = [0x1f, 0x6b, 0xa6] // --celeste
const TINTA = [0xff, 0xff, 0xff]

// Los cinco puntos, en proporción del lienzo. Suben de izquierda a derecha.
const PUNTOS = [
  [0.18, 0.74],
  [0.34, 0.63],
  [0.5, 0.52],
  [0.66, 0.41],
  [0.82, 0.3],
]

function crc32(buf) {
  let c, tabla = crc32.tabla
  if (!tabla) {
    tabla = crc32.tabla = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      tabla[n] = c
    }
  }
  c = -1
  for (let i = 0; i < buf.length; i++) c = tabla[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(tipo, datos) {
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(datos.length)
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(cuerpo))
  return Buffer.concat([largo, cuerpo, crc])
}

function png(lado, pixeles) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(lado, 0)
  ihdr.writeUInt32BE(lado, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 2 // color: RGB
  const filas = []
  for (let y = 0; y < lado; y++) {
    filas.push(Buffer.from([0])) // sin filtro
    filas.push(pixeles.subarray(y * lado * 3, (y + 1) * lado * 3))
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(filas), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Cobertura del pixel, con un borde suave de un pixel para que no quede dentado. */
function suave(d, r) {
  return Math.max(0, Math.min(1, r - d + 0.5))
}

function dibujar(lado) {
  const px = Buffer.alloc(lado * lado * 3)
  const rPunto = lado * 0.062
  const grosor = lado * 0.022

  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      let tinta = 0

      // el camino: segmentos entre punto y punto
      for (let i = 0; i < PUNTOS.length - 1; i++) {
        const [x1, y1] = [PUNTOS[i][0] * lado, PUNTOS[i][1] * lado]
        const [x2, y2] = [PUNTOS[i + 1][0] * lado, PUNTOS[i + 1][1] * lado]
        const dx = x2 - x1, dy = y2 - y1
        const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
        const d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
        tinta = Math.max(tinta, suave(d, grosor))
      }

      // los cinco puntos. El último, el de subir al micro, va más grande:
      // es el que evita dejar a alguien en Luján.
      PUNTOS.forEach(([fx, fy], i) => {
        const d = Math.hypot(x - fx * lado, y - fy * lado)
        tinta = Math.max(tinta, suave(d, i === 4 ? rPunto * 1.45 : rPunto))
      })

      const o = (y * lado + x) * 3
      for (let c = 0; c < 3; c++) {
        px[o + c] = Math.round(FONDO[c] * (1 - tinta) + TINTA[c] * tinta)
      }
    }
  }
  return px
}

mkdirSync('public', { recursive: true })
for (const lado of [192, 512]) {
  writeFileSync(`public/icono-${lado}.png`, png(lado, dibujar(lado)))
  console.log(`public/icono-${lado}.png`)
}
