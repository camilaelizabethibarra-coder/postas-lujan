import { useState } from 'preact/hooks'
import { avisar, borrarTodo, ir, sembrarDemo } from '../lib/datos'
import { sincronizar } from '../lib/sync'
import { demoSinSenal, salirDeDemo, simularSinSenal } from '../lib/demo'

/**
 * La barra de la demo: cambiar de rol en el mismo celular, simular que se
 * cae la señal para ver la cola, y volver a empezar.
 */
export function BarraDemo({ ruta }: { ruta: string }) {
  const [sinSenal, setSinSenal] = useState(demoSinSenal())
  const resp = ruta.startsWith('/posta')

  return (
    <div class="demo">
      <b>DEMO</b>
      <button class={!resp ? 'act' : ''} onClick={() => ir('/')}>Peregrino</button>
      <button class={resp ? 'act' : ''} onClick={() => ir('/posta')}>Responsable</button>
      <button
        class={sinSenal ? 'act mal' : ''}
        onClick={() => {
          simularSinSenal(!sinSenal)
          setSinSenal(!sinSenal)
          sincronizar()
          avisar()
        }}
        title="Simular que no hay señal"
      >
        {sinSenal ? 'Sin señal' : 'Con señal'}
      </button>
      <button
        onClick={async () => {
          if (!confirm('¿Volver a empezar la demo desde cero?')) return
          try {
            for (const k of Object.keys(localStorage)) if (k.startsWith('postas-demo:')) localStorage.removeItem(k)
          } catch { /* nada */ }
          await borrarTodo()
          await sembrarDemo()
          location.reload()
        }}
      >
        Reiniciar
      </button>
      <button
        onClick={() => {
          salirDeDemo()
          location.href = location.pathname
        }}
      >
        Salir
      </button>
    </div>
  )
}
