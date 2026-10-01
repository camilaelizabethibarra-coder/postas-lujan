import { useEffect, useState } from 'preact/hooks'
import { Peregrino } from './pantallas/Peregrino'
import { Responsable } from './pantallas/Responsable'
import { BarraDemo } from './pantallas/BarraDemo'
import { iniciar, estado, sembrarDemo } from './lib/datos'
import { sincronizarReloj } from './lib/supabase'
import { esDemo } from './lib/demo'

/**
 * Ruteo a mano, sin biblioteca: son dos pantallas y un router pesa más que
 * todo esto junto.
 *
 *   /        el peregrino. Directo a identificarse, sin pantalla de elección:
 *            son 139 personas cansadas y cada toque de menos cuenta.
 *   /posta   el responsable. Un link aparte, que se dicta una sola vez a cinco
 *            personas, y que los peregrinos no ven nunca.
 *
 * Con ?demo en cualquiera de los dos, todo corre con datos inventados.
 */
export function App() {
  const [ruta, setRuta] = useState(location.pathname)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    const alVolver = () => setRuta(location.pathname)
    addEventListener('popstate', alVolver)
    return () => removeEventListener('popstate', alVolver)
  }, [])

  useEffect(() => {
    (async () => {
      await iniciar()
      if (esDemo() && !estado.padron.length) await sembrarDemo()
      setListo(true)
    })()
    if (!esDemo()) sincronizarReloj()
  }, [])

  if (!listo) return null

  return (
    <>
      {esDemo() && <BarraDemo ruta={ruta} />}
      {ruta.startsWith('/posta') ? <Responsable key="r" /> : <Peregrino key="p" />}
    </>
  )
}

