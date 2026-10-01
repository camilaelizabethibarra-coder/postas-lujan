import { useState } from 'preact/hooks'
import { useDatos, reemplazarPadron } from '../lib/datos'
import { refrescarPadron } from '../lib/sync'
import { importarPadron, tokenGuardado } from '../lib/supabase'
import { esDemo } from '../lib/demo'
import { POSTAS_POR_DEFECTO, POSTA_VIANDA } from '../lib/postas'
import { pedirAuxilio } from '../lib/datos'
import { tabla } from '../lib/exportar'
import type { Fila } from '../lib/padron'
import { Importar } from './Importar'
import { Instalar } from './comunes'

/** La planilla de vuelta lleva también la hora de entrega de la vianda. */
const POSTAS_EXPORTAR = [...POSTAS_POR_DEFECTO, POSTA_VIANDA]

export function Datos({
  postaNombre, alSalir, alVerQR,
}: { postaNombre: string; alSalir: () => void; alVerQR: () => void }) {
  const e = useDatos()
  const [mensaje, setMensaje] = useState('')

  async function guardar(filas: Fila[]): Promise<number> {
    if (esDemo()) {
      await reemplazarPadron(filas)
      return filas.length
    }
    const n = await importarPadron(tokenGuardado()!, filas)
    await refrescarPadron()
    // quien arranca en el micro (lesionado, por ejemplo): se le pone "dejó de
    // caminar" una sola vez; si después vuelve a caminar, reimportar no lo pisa
    for (const f of filas) {
      const ya = e.avisos.some((a) => a.peregrino === f.numero && (a.tipo === 'micro' || a.tipo === 'camina'))
      if (f.en_micro && !ya) await pedirAuxilio(f.numero, 'micro')
    }
    return n
  }

  function descargar() {
    // el BOM es para que Excel no rompa los acentos al abrirlo
    const blob = new Blob(['﻿' + tabla(e.padron, e.marcas, POSTAS_EXPORTAR)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const d = new Date()
    a.download = `postas-${d.getDate()}-${d.getMonth() + 1}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(tabla(e.padron, e.marcas, POSTAS_EXPORTAR, '\t'))
      setMensaje('Copiado. Pegalo en la planilla en una hoja nueva.')
    } catch {
      setMensaje('No pude copiar. Usá "Descargar CSV".')
    }
  }

  return (
    <div class="cpo">
      <div class="h">Para volver a la planilla</div>
      <div class="caja">
        <p class="aviso">
          Una fila por persona y una columna por posta con la hora de paso. Si solo lo declaró el
          peregrino, la hora dice "(declaró)".
        </p>
        <button class="btn" onClick={descargar} disabled={!e.padron.length}>Descargar CSV</button>
        <button class="btn sec" onClick={copiar} disabled={!e.padron.length}>
          Copiar para pegar en la planilla
        </button>
        {mensaje && <p class="aviso" style="margin: 10px 0 0">{mensaje}</p>}
        {e.pendientes > 0 && (
          <p class="aviso" style="margin: 10px 0 0">
            Ojo: este celular tiene {e.pendientes} marcas sin subir. Lo que exportes acá las
            incluye, pero puede faltar lo que marcaron otros mientras estabas sin señal.
          </p>
        )}
      </div>

      <div class="h">QR de las pecheras</div>
      <div class="caja">
        <p class="aviso">
          Una tarjeta por persona con su QR, para imprimir y pegar en la pechera. Con eso el equipo
          da el presente y entrega las viandas escaneando, sin depender del celular de nadie.
        </p>
        <button class="btn" onClick={alVerQR} disabled={!e.padron.length}>Ver e imprimir los QR</button>
      </div>

      <div style="margin-top: 22px">
        <Importar
          guardar={guardar}
          alTerminar={(n) => setMensaje(`Listo: ${n} personas en el padrón.`)}
        />
      </div>
      <p class="aviso" style="margin-top: 10px">
        Padrón actual: {e.padron.filter((p) => p.activo).length} personas.
        {!esDemo() && ' Importar necesita señal. Reimportar corrige por número, no duplica.'}
      </p>

      <div class="h">Este celular</div>
      <Instalar />
      <div class="caja" style="margin-top: 10px">
        <p class="aviso">Estás como responsable de <b>{postaNombre}</b>.</p>
        <button
          class="btn sec"
          onClick={() =>
            confirm(
              e.pendientes
                ? `Hay ${e.pendientes} marcas sin subir. Se van a subir igual cuando haya señal. ¿Salir?`
                : '¿Salir de esta posta? Para volver a entrar vas a necesitar el PIN y señal.',
            ) && alSalir()
          }
        >
          Salir de esta posta
        </button>
      </div>
    </div>
  )
}
