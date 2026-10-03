/**
 * Apps Script para la planilla de Google Sheets de la peregrinación.
 *
 * Qué hace: cuando la app del coordinador lo pide (cada 5 minutos, si hay
 * señal), devuelve la pestaña APP como texto. Solo si le pasan la clave
 * correcta: la planilla tiene DNI y teléfonos.
 *
 * Cómo se instala (una sola vez, 5 minutos):
 *   1. La planilla tiene que ser de Google Sheets (no un Excel subido):
 *      Archivo → Guardar como Hojas de cálculo de Google.
 *   2. Que tenga una pestaña llamada APP (la que armamos).
 *   3. Extensiones → Apps Script. Borrar lo que haya, pegar todo este archivo.
 *   4. Cambiar CLAVE (abajo) por una palabra secreta. Guardar (ícono de disquete).
 *   5. Implementar → Nueva implementación → tipo "Aplicación web".
 *        Ejecutar como: Yo.   Quién tiene acceso: Cualquier usuario.
 *      Autorizar con tu cuenta de Google.
 *   6. Copiar la URL que termina en /exec y pegarla en la app:
 *      Planilla → Conectar con Google Sheets, junto con la misma CLAVE.
 */

const CLAVE = 'cambiar-esta-clave'
const PESTAÑA = 'APP'

function doGet(e) {
  const salida = (obj) =>
    ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)

  if (!e || !e.parameter || e.parameter.clave !== CLAVE) {
    return salida({ ok: false, error: 'Clave incorrecta' })
  }
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PESTAÑA)
  if (!hoja) return salida({ ok: false, error: 'No encuentro la pestaña ' + PESTAÑA })

  // getDisplayValues: los números de teléfono y DNI salen tal cual se ven
  const filas = hoja.getDataRange().getDisplayValues()
  const texto = filas
    .map((f) => f.map((c) => String(c).replace(/[\t\r\n]+/g, ' ')).join('\t'))
    .join('\n')
  return salida({ ok: true, texto: texto, filas: filas.length })
}
