import { describe, it, expect } from 'vitest'
import { importar, normalizar, limpiarTel, paraLlamar } from './padron'

/**
 * Los datos de estas pruebas son inventados, pero la FORMA es la de la
 * planilla real de la parroquia: encabezados con espacios de más, montos
 * entre comillas con coma adentro, el equipo sin número, y una columna de
 * notas sin encabezado donde conviven anotaciones de pago con información
 * operativa.
 */

const ENCABEZADO =
  'Peregrino NUMERO,APELLIDO ,NOMBRE,DNI,CEL,CEL DE EMERGENCIA,COMIDA,$$$$$$,,TIEMPO DE ABONADO'

describe('importar', () => {
  it('lee la planilla y deja afuera DNI y pagos', () => {
    const { filas } = importar(
      [
        ENCABEZADO,
        '1,PEREZ,ANA,30000003,1100000001,1100000002,SIN RESTRICCION,"$35,000",,',
      ].join('\n'),
    )
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      numero: 1,
      apellido: 'PEREZ',
      nombre: 'ANA',
      tel: '1100000001',
      tel_emerg: '1100000002',
      tramo: 'completo',
      es_equipo: false,
    })
    // lo que no tiene que estar
    expect(JSON.stringify(filas[0])).not.toContain('30000003')
    expect(JSON.stringify(filas[0])).not.toContain('SIN RESTRICCION')
    expect(JSON.stringify(filas[0])).not.toContain('35,000')
  })

  it('avisa qué columnas descartó, para que quien importa lo vea', () => {
    const { avisos } = importar([ENCABEZADO, '1,PEREZ,ANA,30000003,,,,,,'].join('\n'))
    const texto = avisos.map((a) => a.texto).join(' ')
    expect(texto).toContain('DNI')
    expect(texto).not.toContain('COMIDA')
  })

  it('trae la restricción alimentaria, la salida y al equipo por nombre', () => {
    const { filas } = importar(
      [
        'NUMERO\tAPELLIDO\tNOMBRE\tCEL\tCEL EMERGENCIA\tSALE DESDE\tCOMIDA\tNOTA',
        '1\tROMERO\tJUAN\t1100000001\t\tLa Reja\tCeliaca\t',
        '2\tSOSA\tPABLO\t\t\t\tSin restricción\t',
        '3\tRIVAS\tTEO\t\t\tSolo vuelta\t\t',
        '4\tLUNA\tPEDRO\t\t\t\t\tEsguinzado: va en el micro con el apoyo',
        'EQUIPO\tPAZ\tANA\t\t\t\tVegana\t',
      ].join('\n'),
    )
    expect(filas.map((f) => [f.tramo, f.salida_ok, f.comida])).toEqual([
      ['desde_reja', true, 'Celiaca'],
      ['completo', false, null],
      ['solo_vuelta', true, null],
      ['completo', false, null],
      ['completo', false, 'Vegana'],
    ])
    expect(filas[3]!.en_micro).toBe(true)
    expect(filas[4]).toMatchObject({ numero: 901, es_equipo: true, apellido: 'PAZ' })
  })

  it('no se marea con la coma de adentro de las comillas', () => {
    const { filas } = importar(
      [ENCABEZADO, '7,GOMEZ,LUIS,30000000,1100000001,1100000002,SIN RESTRICCION,"$1,234,567",,'].join('\n'),
    )
    expect(filas[0]!.apellido).toBe('GOMEZ')
    expect(filas[0]!.tel).toBe('1100000001')
  })

  it('le saca los espacios de más a los apellidos', () => {
    const { filas } = importar([ENCABEZADO, '13,VILLAR ,SOL,30000014,,,,,,'].join('\n'))
    expect(filas[0]!.apellido).toBe('VILLAR')
  })

  it('le da número al equipo, que en la planilla no tiene', () => {
    const { filas } = importar(
      [
        'Equipo NUMERO,APELLIDO ,NOMBRE,DNI,CEL,CEL DE EMERGENCIA,COMIDA,$$$$$$',
        'EQUIPO,LUNA,PEDRO,30000015,1100000016,1100000017,SIN RESTRICCION,',
        'EQUIPO,RIVAS,TEO,30000018,1100000019,1100000020,SIN RESTRICCION,',
      ].join('\n'),
    )
    expect(filas.map((f) => f.numero)).toEqual([901, 902])
    expect(filas.every((f) => f.es_equipo)).toBe(true)
  })

  it('detecta a quien solo vuelve de Luján y lo saca de las primeras postas', () => {
    const { filas, avisos } = importar(
      [
        ENCABEZADO,
        '81,SOSA,PABLO,30000021,1100000022,1100000023,SIN RESTRICCION,"$25,000",SOLO VUELVE DE LUJAN A LA PARROQUIA CON NOSOTROS,',
      ].join('\n'),
    )
    expect(filas[0]!.tramo).toBe('solo_vuelta')
    expect(avisos.map((a) => a.texto).join(' ')).toContain('solo vuelve')
  })

  it('tira las notas que son de plata y conserva las que son operativas', () => {
    const { filas } = importar(
      [
        ENCABEZADO,
        '4,QUIROGA,LEO,30000024,1100000025,1100000026,SIN RESTRICCION,,SALE DESDE LINIERS SE SUMA EN MORON,',
        '6,MOLINA,CAMILA,30000027,1100000028,1100000029,SIN RESTRICCION,,EFECTIVO,',
        '67,HERRERA,ROSA,30000030,1100000031,1100000032,SIN RESTRICCION,"$10,000",FALTA ABONAR $25000,',
      ].join('\n'),
    )
    expect(filas[0]!.nota).toContain('LINIERS')
    expect(filas[1]!.nota).toBeNull()
    expect(filas[2]!.nota).toBeNull()
  })

  it('saltea la fila de totales y las vacías', () => {
    const { filas } = importar(
      [ENCABEZADO, '1,PEREZ,ANA,,,,,,,', '144,,,,,,,,,', '145,,,,,,,"$3,577,500",,'].join('\n'),
    )
    expect(filas).toHaveLength(1)
  })

  it('marca los teléfonos que no se van a poder llamar', () => {
    const { filas, avisos } = importar(
      [ENCABEZADO, '42,PAZOS,MARIA,30000033,30000004,1100000034,SIN RESTRICCION,,,'].join('\n'),
    )
    expect(filas[0]!.tel).toBe('30000004')
    expect(paraLlamar(filas[0]!.tel)).toBeNull()
    expect(avisos.some((a) => a.tono === 'ojo' && /d[ií]gitos/.test(a.texto))).toBe(true)
  })

  it('avisa si hay números repetidos', () => {
    const { avisos } = importar(
      [ENCABEZADO, '5,UNO,A,,,,,,,', '5,DOS,B,,,,,,,'].join('\n'),
    )
    expect(avisos.some((a) => a.tono === 'ojo' && a.texto.includes('repetidos'))).toBe(true)
  })

  it('acepta lo pegado desde Excel, que viene con tabulaciones', () => {
    const { filas } = importar(
      ['Peregrino NUMERO\tAPELLIDO \tNOMBRE\tCEL', '1\tPEREZ\tANA\t1100000001'].join('\n'),
    )
    expect(filas[0]).toMatchObject({ numero: 1, apellido: 'PEREZ', tel: '1100000001' })
  })

  it('si no hay encabezado, lee las columnas en el orden documentado', () => {
    const { filas, avisos } = importar('1,ROMERO,JUAN,2,1100000001')
    expect(filas[0]).toMatchObject({
      numero: 1, apellido: 'ROMERO', nombre: 'JUAN', micro: '2', tel: '1100000001',
    })
    expect(avisos.some((a) => a.texto.includes('en orden'))).toBe(true)
  })

  it('no rompe con el pegado vacío', () => {
    expect(importar('   ').filas).toHaveLength(0)
    expect(importar('').avisos[0]!.tono).toBe('ojo')
  })
})

describe('normalizar', () => {
  it('saca los acentos para que buscar "marino" encuentre a MARIÑO', () => {
    expect(normalizar('MARIÑO')).toBe('MARINO')
    expect(normalizar('Núñez')).toBe('NUNEZ')
    expect(normalizar(' Pérez ')).toBe('PEREZ')
  })
})

describe('limpiarTel', () => {
  it('deja diez dígitos listos para llamar', () => {
    expect(limpiarTel('11 0000-0001')).toEqual({ tel: '1100000001', sirve: true })
    expect(limpiarTel('+54 9 11 0000 0001').tel).toBe('1100000001')
    expect(limpiarTel('011 0000-0001').tel).toBe('1100000001')
    expect(paraLlamar('1100000001')).toBe('+5491100000001')
  })

  it('acepta el vacío y rechaza el que no sirve', () => {
    expect(limpiarTel('')).toEqual({ tel: null, sirve: true })
    expect(limpiarTel('30000004').sirve).toBe(false)
  })
})

describe('salida', () => {
  it('lee la columna de salida y las notas', () => {
    const { filas } = importar(
      'NUMERO\tAPELLIDO\tNOMBRE\tSALE DESDE\n1\tA\tB\tLa Reja\n2\tC\tD\tRodriguez\n3\tE\tF\tLiniers\n4\tG\tH\tMorón',
    )
    expect(filas.map((f) => f.tramo)).toEqual(['desde_reja', 'desde_rodriguez', 'liniers', 'completo'])
  })
})
