import { useState } from 'preact/hooks'
import { abrirRol, type Rol } from '../lib/supabase'
import { Portada } from './comunes'

/**
 * Entrada del equipo. Dos usuarios, un PIN cada uno: coordinador y servicio.
 * No es autenticación de verdad y no pretende serlo: alcanza con que nadie
 * marque de casualidad y con que una marca "confirmada" venga del equipo.
 *
 * Requiere señal una vez, para cambiar el PIN por un token de 30 días. Después
 * el token vive en el celular y la app no vuelve a necesitar internet.
 */
const USUARIOS: { rol: Rol; titulo: string; detalle: string }[] = [
  {
    rol: 'servicio',
    titulo: 'Equipo de servicio',
    detalle: 'Presente en las paradas, viandas, ayudas y dónde está cada uno.',
  },
  {
    rol: 'coordinador',
    titulo: 'Equipo coordinador',
    detalle: 'Todo lo del servicio, más la entrega y devolución de pecheras y la planilla.',
  },
]

export function Pin({ alEntrar }: { alEntrar: (rol: Rol) => void }) {
  const [rol, setRol] = useState<Rol | ''>('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [yendo, setYendo] = useState(false)

  async function entrar(e: Event) {
    e.preventDefault()
    if (!rol || pin.length < 4) return
    setYendo(true)
    setError('')
    try {
      await abrirRol(rol, pin)
      alEntrar(rol)
    } catch (err) {
      const m = (err as Error).message
      setError(
        /PIN/.test(m)
          ? 'Ese no es el PIN de este usuario.'
          : 'No pude conectarme. Para entrar por primera vez hace falta señal o wifi.',
      )
      setPin('')
    } finally {
      setYendo(false)
    }
  }

  return (
    <>
      <Portada compacta etiqueta="Equipo · N° 52" frase="Servicio y pasión, por amar, por vivir" />
      <form class="centro" onSubmit={entrar} style="padding-top: 8px">
        <div class="g">¿Con qué usuario entrás?</div>
        <div class="s" style="margin-bottom: 18px">Elegí uno y poné su PIN</div>

        {USUARIOS.map((u) => (
          <button
            key={u.rol}
            type="button"
            class={`usuario ${rol === u.rol ? 'act' : ''}`}
            onClick={() => { setRol(u.rol); setError('') }}
          >
            <b>{u.titulo}</b>
            <span>{u.detalle}</span>
          </button>
        ))}

        {rol && (
          <div style="margin-top: 20px">
            <label class="s" for="pin" style="display: block; margin-bottom: 8px">
              PIN del {rol === 'coordinador' ? 'equipo coordinador' : 'equipo de servicio'}
            </label>
            <input
              id="pin"
              class="pin"
              value={pin}
              onInput={(e) => setPin((e.currentTarget as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="····"
            />
            <button class="btn" type="submit" style="margin-top: 14px" disabled={yendo || pin.length < 4}>
              {yendo ? 'Entrando…' : 'Entrar'}
            </button>
          </div>
        )}

        {error && <div class="err">{error}</div>}

        <p class="aviso" style="margin-top: 24px">
          Se pide una sola vez por celular. Después queda abierto aunque te quedes sin señal.
        </p>
      </form>
    </>
  )
}
