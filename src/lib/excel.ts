/**
 * Leer el Excel de la planilla directo desde el celular del coordinador.
 * Busca la pestaña "APP"; si no está, la primera que tenga columna APELLIDO.
 * Devuelve el texto como si se hubiera copiado y pegado (columnas separadas
 * por tabulación), así pasa por el mismo importador y las mismas reglas.
 *
 * La biblioteca entra por import() diferido: solo la descarga quien carga
 * la planilla, no los peregrinos.
 */
export async function leerExcel(archivo: File): Promise<{ texto: string; hoja: string }> {
  const { default: leer } = await import('read-excel-file/browser')
  const hojas = await leer(archivo)
  const tieneApellido = (data: unknown[][]) =>
    data.slice(0, 3).some((fila) => fila.some((c) => /APELLIDO/i.test(String(c ?? ''))))
  const hoja =
    hojas.find((h) => h.sheet.trim().toUpperCase() === 'APP') ??
    hojas.find((h) => tieneApellido(h.data as unknown[][])) ??
    hojas[0]
  if (!hoja) throw new Error('El archivo no tiene hojas')

  const celda = (c: unknown) =>
    c == null ? '' : c instanceof Date ? c.toLocaleDateString('es-AR') : String(c).replace(/[\t\r\n]+/g, ' ')
  const texto = (hoja.data as unknown[][])
    .map((fila) => fila.map(celda).join('\t'))
    .join('\n')
  return { texto, hoja: hoja.sheet }
}
