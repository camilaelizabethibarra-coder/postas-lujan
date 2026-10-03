import { useState } from 'preact/hooks'
import { useDatos, reemplazarPadron, pedirAuxilio } from '../lib/datos'
import { refrescarPadron } from '../lib/sync'
import { importarPadron, tokenGuardado, type Rol } from '../lib/supabase'
import { esDemo } from '../lib/demo'
import { POSTAS_POR_DEFECTO, POSTA_VIANDA, POSTA_PECHERA, POSTA_DEVUELTA } from '../lib/postas'
import { tabla } from '../lib/exportar'
import { leerExcel } from '../lib/excel'
import type { Fila } from '../lib/padron'
import { Importar } from './Importar'
import { Instalar } from './comunes'
import { Sumar, ConectarSheets } from './Sumar'

/** La planilla de vuelta lleva también la vianda y la pechera (entregada y devuelta). */
const POSTAS_EXPORTAR = [...POSTAS_POR_DEFECTO, POSTA_VIANDA, POSTA_PECHERA, POSTA_DEVUELTA]

/**
 * Planilla (coordinador) o Ajustes (servicio). El coordinador carga el Excel
 * una vez, imprime los QR y al final descarga lo que pasó. Durante el día la
 * app es la planilla: no hay que cargar nada más.
 */
export function Datos({
  rol, alSalir, alVerQR,
}: { rol: Rol; alSalir: () => void; alVerQR: () => void }) {
  const e = useDatos()
  const [mensaje, setMensaje] = useState('')
  const [excel, setExcel] = useState<string | null>(null)
  const [leyendo, setLeyendo] = useState('')
  const coord = rol === 'coordinador'

  async function guardar(filas: Fila[]): Promise<number> {
    if (esDemo()) {
      await reemplazarPadron(filas)
      return filas.length
    }
    const n = await importarPadron(tokenGuardado()!, filas)
    await refrescarPadron()
    // quien arranca en el micro (lesionado, por ejemplo): se le pone "dejó de
    // caminar" una sola vez; si después vuelve a caminar, recargar no lo pisa
    for (const f of filas) {
      const ya = e.avisos.some((a) => a.peregrino === f.numero && (a.tipo === 'micro' || a.tipo === 'camina'))
      if (f.en_micro && !ya) await pedirAuxilio(f.numero, 'micro')
    }
    return n
  }

  async function alElegirArchivo(ev: Event) {
    const f = (ev.currentTarget as HTMLInputElement).files?.[0]
    if (!f) return
    setLeyendo('Leyendo el Excel…')
    try {
      const { texto, hoja } = await leerExcel(f)
      setExcel(texto)
      setLeyendo(`Leí la hoja "${hoja}". Revisá abajo lo que entendí y tocá Guardar.`)
    } catch {
      setLeyendo('No pude leer ese archivo. Tiene que ser el Excel (.xlsx) de la planilla.')
    }
  }

  function descargar() {
    // el BOM es para que Excel no rompa los acentos al abrirlo
    const blob = new Blob(['﻿' + tabla(e.padron, e.marcas, POSTAS_EXPORTAR)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const d = new Date()
    a.download = `peregrinacion-${d.getDate()}-${d.getMonth() + 1}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(tabla(e.padron, e.marcas, POSTAS_EXPORTAR, '\t'))
      setMensaje('Copiado. Pegalo en la planilla en una hoja nueva.')
    } catch {
      setMensaje('No pude copiar. Usá "Descargar".')
    }
  }

  const salir = (
    <div class="caja" style="margin-top: 10px">
      <p class="aviso">
        Entraste como <b>{coord ? 'equipo coordinador' : 'equipo de servicio'}</b>.
      </p>
      <button
        class="btn sec"
        onClick={() =>
          confirm(
            e.pendientes
              ? `Hay ${e.pendientes} marcas sin subir. Se van a subir igual cuando haya señal. ¿Salir?`
              : '¿Salir? Para volver a entrar vas a necesitar el PIN y señal.',
          ) && alSalir()
        }
      >
        Salir de este usuario
      </button>
    </div>
  )

  if (!coord) {
    return (
      <div class="cpo">
        <div class="h" style="margin-top: 2px">Este celular</div>
        <Instalar />
        {salir}
      </div>
    )
  }

  return (
    <div class="cpo">
      <div class="h" style="margin-top: 2px">Cómo funciona la planilla</div>
      <div class="caja">
        <ol class="como">
          <li><b>Antes del día</b> (una sola vez, con señal): cargás el Excel acá abajo. La app toma
            número de pechera, nombre, DNI, celulares, salida, comida y notas. Los pagos no.</li>
          <li><b>Durante el día</b> no hay que cargar nada: la app <b>es</b> la planilla. Todo lo que
            marca el equipo (pecheras, presentes, viandas, ayudas) se guarda solo y se comparte entre
            los celulares cuando hay señal.</li>
          <li><b>Si cambia algo</b> (alguien nuevo, un teléfono), volvés a cargar el Excel: corrige por
            número de pechera, no duplica ni borra lo marcado.</li>
          <li><b>Al terminar</b>, "Descargar" te da todo lo que pasó para guardarlo en la planilla.</li>
        </ol>
      </div>

      <div class="h">1. Cargar la planilla</div>
      <div class="caja">
        <p class="aviso">
          Elegí el Excel (LUJAN.xlsx). Leo la pestaña <b>APP</b>. Antes de guardar te muestro lo que entendí.
        </p>
        <label class="btn" style="display: block; cursor: pointer">
          📄 Elegir el Excel
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={alElegirArchivo}
            style="display: none"
          />
        </label>
        {leyendo && <p class="aviso" style="margin: 10px 0 0">{leyendo}</p>}
      </div>
      <div style="margin-top: 10px">
        <Importar
          guardar={guardar}
          cargado={excel}
          alTerminar={(n) => { setMensaje(`Listo: ${n} personas en el padrón.`); setExcel(null); setLeyendo('') }}
        />
      </div>
      <p class="aviso" style="margin-top: 10px">
        Padrón actual: {e.padron.filter((p) => p.activo && !p.es_equipo).length} peregrinos y{' '}
        {e.padron.filter((p) => p.activo && p.es_equipo).length} del equipo.
        {!esDemo() && ' Cargar necesita señal.'}
      </p>
      {mensaje && <div class="eco ok">{mensaje}</div>}

      <div class="h">Sumar a alguien hoy</div>
      <Sumar />

      <div class="h">Conectar con Google Sheets</div>
      <ConectarSheets />

      <div class="h">2. QR para imprimir (opcional)</div>
      <div class="caja">
        <p class="aviso">
          Cada peregrino tiene su QR en la app. Si alguna vez hace falta tenerlo en papel (alguien
          sin celular), acá se imprime.
        </p>
        <button class="btn" onClick={alVerQR} disabled={!e.padron.length}>Ver e imprimir los QR</button>
      </div>

      <div class="h">3. Al terminar el día</div>
      <div class="caja">
        <p class="aviso">
          Una fila por persona y una columna por parada con la hora de paso, más la vianda y la
          pechera (entregada y devuelta). Si solo lo marcó el peregrino, dice "(declaró)".
        </p>
        <button class="btn" onClick={descargar} disabled={!e.padron.length}>Descargar (Excel / CSV)</button>
        <button class="btn sec" onClick={copiar} disabled={!e.padron.length}>
          Copiar para pegar en la planilla
        </button>
        {e.pendientes > 0 && (
          <p class="aviso" style="margin: 10px 0 0">
            Ojo: este celular tiene {e.pendientes} marcas sin subir. Lo que descargues las incluye,
            pero puede faltar lo que marcaron otros mientras estabas sin señal.
          </p>
        )}
      </div>

      <div class="h">Este celular</div>
      <Instalar />
      {salir}
    </div>
  )
}
