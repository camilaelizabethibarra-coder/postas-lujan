import { useEffect, useState } from 'preact/hooks'
import { abrirPosta, traerPostas, type PostaFila } from '../lib/supabase'
import { POSTAS_POR_DEFECTO } from '../lib/postas'
import { Portada } from './comunes'

/**
 * Entrada del responsable. No es autenticación de verdad y no pretende serlo:
 * alcanza con que nadie marque de casualidad y con que una marca "confirmada"
 * venga efectivamente de alguien que está parado en una posta.
 *
 * Requiere señal una vez, para cambiar el PIN por un token de 30 días. Después
 * el token vive en el celular y la app no vuelve a necesitar internet.
 */
export function Pin({ alEntrar }: { alEntrar: (posta: string) => void }) {
  const [postas, setPostas] = useState<PostaFila[]>(POSTAS_POR_DEFECTO)
  const [posta, setPosta] = useState<string>('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [yendo, setYendo] = useState(false)

  useEffect(() => {
    traerPostas()
      // 'Viandas' también está en la tabla de postas, pero no es un lugar para elegir
      .then((p) => p.length && setPostas(p.filter((x) => x.orden < 90)))
      .catch(() => { /* sin señal: quedan las cinco por defecto */ })
  }, [])

  async function entrar(e: Event) {
    e.preventDefault()
    if (!posta || pin.length < 4) return
    setYendo(true)
    setError('')
    try {
      await abrirPosta(posta, pin)
      alEntrar(posta)
    } catch (err) {
      const m = (err as Error).message
      setError(
        /PIN/.test(m)
          ? 'Ese PIN no es el de esta posta.'
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
      <div class="g">Responsable de posta</div>
      <div class="s" style="margin-bottom: 22px">¿Cuál es tu posta?</div>

      {postas.map((p) => (
        <button
          key={p.id}
          type="button"
          class={`btn ${posta === p.id ? '' : 'sec'}`}
          onClick={() => { setPosta(p.id); setError('') }}
        >
          {p.nombre}
        </button>
      ))}

      {posta && (
        <div style="margin-top: 24px">
          <label class="s" for="pin" style="display: block; margin-bottom: 8px">
            PIN de la posta
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

      <p class="aviso" style="margin-top: 28px">
        Se pide una sola vez por celular. Después queda abierto aunque te quedes sin señal.
      </p>
    </form>
    </>
  )
}
