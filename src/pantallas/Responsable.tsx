import { useEffect, useState } from 'preact/hooks'
import { useDatos } from '../lib/datos'
import { arrancar } from '../lib/sync'
import {
  cerrarSesion, entrarSinPin, guardarPosta, postaGuardada, rolGuardado, tokenGuardado, type Rol,
} from '../lib/supabase'
import { esDemo } from '../lib/demo'
import { POSTAS_POR_DEFECTO as POSTAS } from '../lib/postas'
import { esPedido } from '../lib/regla'
import { Pin } from './Pin'
import { Marcar } from './Marcar'
import { Donde } from './Donde'
import { Ayudas } from './Ayudas'
import { Datos } from './Datos'
import { Viandas } from './Viandas'
import { Pecheras } from './Pecheras'
import { QRs } from './QRs'

type Vista = 'pecheras' | 'marcar' | 'viandas' | 'ayudas' | 'donde' | 'datos' | 'qr'

/** Las viandas se entregan solo en La Reja: en el resto de las paradas la pestaña no aparece. */
const POSTA_VIANDAS = 'po2'

export function Responsable() {
  // la demo no pide PIN: entra como coordinador, parada en General Rodríguez
  if (esDemo() && (!tokenGuardado() || !rolGuardado())) entrarSinPin('po3')

  const [token, setToken] = useState(tokenGuardado())
  const [rol, setRol] = useState(rolGuardado())

  if (!token || !rol) {
    return (
      <Pin
        alEntrar={(r) => {
          setRol(r)
          setToken(tokenGuardado())
        }}
      />
    )
  }

  return (
    <Tablero
      rol={rol}
      alSalir={() => {
        cerrarSesion()
        setToken(null)
        setRol(null)
      }}
    />
  )
}

function Tablero({ rol, alSalir }: { rol: Rol; alSalir: () => void }) {
  const e = useDatos()
  const coord = rol === 'coordinador'
  const [vista, setVista] = useState<Vista>(coord ? 'pecheras' : 'marcar')
  const [postaSel, setPostaSelLocal] = useState(
    Math.max(0, POSTAS.findIndex((p) => p.id === postaGuardada())),
  )
  const setPostaSel = (i: number) => {
    setPostaSelLocal(i)
    guardarPosta(POSTAS[i]!.id)
  }

  useEffect(() => { arrancar({ rol: 'resp' }) }, [])
  useEffect(() => { scrollTo(0, 0) }, [vista])

  const enLaReja = POSTAS[postaSel]?.id === POSTA_VIANDAS
  // si se cambia de parada estando en Viandas, se vuelve a Presente
  useEffect(() => { if (vista === 'viandas' && !enLaReja) setVista('marcar') }, [enLaReja])

  if (!e.listo) return null
  const pedidos = e.avisos.filter((a) => esPedido(a) && !a.resuelto).length

  const pestañas: [Vista, string, string][] = [
    ...(coord ? [['pecheras', '🎽', 'Pecheras'] as [Vista, string, string]] : []),
    ['marcar', '✓', 'Presente'],
    ...(enLaReja ? [['viandas', '🥪', 'Viandas'] as [Vista, string, string]] : []),
    ['ayudas', '🆘', 'Ayudas'],
    ['donde', '🗺', 'Dónde están'],
    ['datos', '⚙', coord ? 'Planilla' : 'Ajustes'],
  ]

  return (
    <div class="pantalla">
      {vista === 'pecheras' && coord && <Pecheras />}
      {vista === 'marcar' && (
        <Marcar postaSel={postaSel} setPostaSel={setPostaSel} alVerAvisos={() => setVista('ayudas')} />
      )}
      {vista === 'viandas' && <Viandas />}
      {vista === 'ayudas' && <Ayudas />}
      {vista === 'donde' && <Donde alVerAyudas={() => setVista('ayudas')} />}
      {vista === 'datos' && (
        <Datos rol={rol} alSalir={alSalir} alVerQR={() => setVista('qr')} />
      )}
      {vista === 'qr' && <QRs alVolver={() => setVista('datos')} />}

      <nav class={`tabs n${pestañas.length}`}>
        {pestañas.map(([k, icono, texto]) => (
          <button key={k} class={`tab ${vista === k ? 'act' : ''}`} onClick={() => setVista(k)}>
            {k === 'ayudas' && pedidos > 0 && <span class="dot">{pedidos}</span>}
            <i>{icono}</i>
            {texto}
          </button>
        ))}
      </nav>
    </div>
  )
}
