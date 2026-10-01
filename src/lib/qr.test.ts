import { describe, it, expect } from 'vitest'
import { codigoDe, leerCodigo } from './qr'

describe('QR de las pecheras', () => {
  it('ida y vuelta', () => {
    expect(leerCodigo(codigoDe(1))).toBe(1)
    expect(leerCodigo(codigoDe(180))).toBe(180)
    expect(leerCodigo(codigoDe(905))).toBe(905)
  })

  it('acepta un número pelado, pero no cualquier QR', () => {
    expect(leerCodigo('42')).toBe(42)
    expect(leerCodigo('https://menu.example/plato')).toBeNull()
    expect(leerCodigo('PL52-')).toBeNull()
    expect(leerCodigo('123456')).toBeNull()
  })
})
