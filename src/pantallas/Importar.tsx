import { useMemo, useState } from 'preact/hooks'
import { importar, type Fila } from '../lib/padron'

/**
 * Importar el padrón pegando columnas de la planilla.
 *
 * Muestra qué entendió ANTES de escribir nada. La planilla de la parroquia
 * tiene columnas que no van a entrar nunca (DNI, comida, pagos) y filas raras
 * (el equipo sin número, el que solo vuelve de Luján, la fila de totales), y
 * quien importa tiene que ver que eso se resolvió como corresponde.
 */
export function Importar({
  guardar, alTerminar,
}: { guardar: (filas: Fila[]) => Promise<number>; alTerminar: (n: number) => void }) {
  const [pegado, setPegado] = useState('')
  const [yendo, setYendo] = useState(false)
  const [error, setError] = useState('')

  const resultado = useMemo(() => (pegado.trim() ? importar(pegado) : null), [pegado])

  async function subir() {
    if (!resultado?.filas.length) return
    setYendo(true)
    setError('')
    try {
      const n = await guardar(resultado.filas)
      setPegado('')
      alTerminar(n)
    } catch (e) {
      setError(
        /sesi[oó]n/i.test((e as Error).message)
          ? 'Se venció la sesión. Volvé a entrar con el PIN.'
          : 'No pude guardarlo. Revisá la señal e intentá de nuevo.',
      )
    } finally {
      setYendo(false)
    }
  }

  return (
    <div>
      <div class="h">Importar padrón</div>
      <div class="caja">
        <p class="aviso">
          Copiá de la planilla las columnas que quieras y pegalas acá. Reconozco los encabezados
          solo, y si no hay, leo en orden número, apellido, nombre, micro, celular.
        </p>
        <p class="aviso">
          <b>El DNI y los pagos no entran</b>, aunque los pegues. Eso se queda en la planilla de
          la parroquia. La comida sí entra, para las viandas, y solo la ve el equipo.
        </p>
        <textarea
          class="area"
          value={pegado}
          onInput={(e) => setPegado((e.currentTarget as HTMLTextAreaElement).value)}
          placeholder={'Peregrino NUMERO\tAPELLIDO\tNOMBRE\tDNI\tCEL\t…'}
          spellcheck={false}
        />

        {resultado && (
          <div style="margin-top: 12px">
            {resultado.avisos.map((a, i) => (
              <div key={i} class={`nota ${a.tono === 'ojo' ? 'ojo' : ''}`}>
                <b>{a.tono === 'ojo' ? '!' : '·'}</b>
                <span>{a.texto}</span>
              </div>
            ))}
          </div>
        )}

        {resultado && resultado.filas.length > 0 && (
          <>
            <Muestra filas={resultado.filas} />
            <button class="btn" style="margin-top: 12px" onClick={subir} disabled={yendo}>
              {yendo ? 'Guardando…' : `Guardar ${resultado.filas.length} personas`}
            </button>
          </>
        )}

        {error && <div class="err">{error}</div>}
      </div>
    </div>
  )
}

/** Las primeras y las últimas, para confirmar de un vistazo que no se corrió una columna. */
function Muestra({ filas }: { filas: Fila[] }) {
  const cabeza = filas.slice(0, 3)
  const cola = filas.length > 6 ? filas.slice(-3) : []
  const linea = (f: Fila) =>
    `${f.es_equipo ? 'EQUIPO' : f.numero}  ${f.apellido}, ${f.nombre}` +
    (f.tel ? `  ${f.tel}` : '') +
    (f.tramo !== 'completo' ? `  [${f.tramo.replace('_', ' ')}]` : '')

  return (
    <div style="margin-top: 12px">
      <div class="h" style="margin-top: 0">Así lo entendí</div>
      <pre class="area" style="min-height: 0; overflow-x: auto; margin: 0">
        {cabeza.map(linea).join('\n')}
        {cola.length ? `\n…\n${cola.map(linea).join('\n')}` : ''}
      </pre>
    </div>
  )
}
