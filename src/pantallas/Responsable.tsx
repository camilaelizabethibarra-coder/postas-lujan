import { useEffect, useState } from 'preact/hooks'
import { useDatos } from '../lib/datos'
import { arrancar } from '../lib/sync'
import { cerrarSesion, entrarSinPin, postaGuardada, tokenGuardado } from '../lib/supabase'
import { esDemo } from '../lib/demo'
import { POSTAS_POR_DEFECTO as POSTAS } from '../lib/postas'
import { Pin } from './Pin'
import { Marcar } from './Marcar'
import { Donde } from './Donde'
import { esPedido } from '../lib/regla'
import { Datos } from './Datos'
import { Viandas } from './Viandas'
import { QRs } from './QRs'

type Vista = 'marcar' | 'viandas' | 'donde' | 'datos' | 'qr'

export function Responsable() {
  // la demo no pide PIN: arranca parada en General Rodríguez, donde está llegando el pelotón
  if (esDemo() && !tokenGuardado()) entrarSinPin('po3')

  const [token, setToken] = useState(tokenGuardado())
  const [posta, setPosta] = useState(postaGuardada())

  if (!token || !posta) {
    return (
      <Pin
        alEntrar={(p) => {
          setPosta(p)
          setToken(tokenGuardado())
        }}
      />
    )
  }

  return (
    <Tablero
      posta={posta}
      alSalir={() => {
        cerrarSesion()
        setToken(null)
        setPosta(null)
      }}
    />
  )
}

function Tablero({ posta, alSalir }: { posta: string; alSalir: () => void }) {
  const e = useDatos()
  const [vista, setVista] = useState<Vista>('marcar')
  const [postaSel, setPostaSel] = useState(Math.max(0, POSTAS.findIndex((p) => p.id === posta)))

  useEffect(() => { arrancar({ rol: 'resp' }) }, [])
  useEffect(() => { scrollTo(0, 0) }, [vista])

  if (!e.listo) return null
  const hayAvisos = e.avisos.some((a) => esPedido(a) && !a.resuelto)

  return (
    <div class="pantalla">
      {vista === 'marcar' && (
        <Marcar postaSel={postaSel} setPostaSel={setPostaSel} alVerAvisos={() => setVista('donde')} />
      )}
      {vista === 'viandas' && <Viandas />}
      {vista === 'donde' && <Donde />}
      {vista === 'datos' && (
        <Datos
          postaNombre={POSTAS.find((p) => p.id === posta)?.nombre ?? posta}
          alSalir={alSalir}
          alVerQR={() => setVista('qr')}
        />
      )}
      {vista === 'qr' && <QRs alVolver={() => setVista('datos')} />}

      <nav class="tabs">
        {([['marcar', '◉', 'Presente'], ['viandas', '🥪', 'Viandas'], ['donde', '⌖', 'Dónde están'], ['datos', '⚙', 'Datos']] as const).map(
          ([k, icono, texto]) => (
            <button key={k} class={`tab ${vista === k ? 'act' : ''}`} onClick={() => setVista(k)}>
              {k === 'donde' && hayAvisos && <span class="dot" />}
              <i>{icono}</i>
              {texto}
            </button>
          ),
        )}
      </nav>
    </div>
  )
}
