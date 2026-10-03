import { useState } from 'preact/hooks'

/**
 * La carta del equipo de servicio para cuando el peregrino llega a Luján o
 * sube al micro de vuelta. Se abre sola una vez, a pantalla completa; después
 * queda en su pantalla para releerla cuando quiera.
 */
const PARRAFOS = [
  'Quizás todavía no puedas dimensionar todo lo que pasó entre ese primer paso y este momento. El cansancio, las risas, los silencios, los abrazos, las preguntas, aquello que pediste en el camino y eso que quizás encontraste sin estar buscando. Caminaste con todo lo que sos, y María te trajo hasta su casa.',
  'Ahora frená. Respiralo. Mirá a tu alrededor y guardá este momento. Porque algún día, cuando el camino vuelva a hacerse difícil, vas a recordar que tus pies también dolieron aquella vez, que también pensaste que no podías más… y, sin embargo, llegaste.',
  'Que Luján no sea solamente el lugar al que llegaste, sino todo aquello que te llevás. Que lo que María despertó en vos siga caminando cuando vuelvas a casa.',
]

function Texto() {
  return (
    <>
      <h2 class="carta-tit">Llegaste.</h2>
      {PARRAFOS.map((p, i) => <p key={i}>{p}</p>)}
      <p class="carta-final">Llegaste a su casa. Ahora dejá que Ella camine con vos.</p>
      <p class="carta-firma">El equipo de servicio de la parroquia</p>
    </>
  )
}

export function Carta({ numero }: { numero: number }) {
  const clave = `postas:carta-vista:${numero}`
  const [abierta, setAbierta] = useState(() => {
    try { return !localStorage.getItem(clave) } catch { return true }
  })
  const [leer, setLeer] = useState(false)

  function cerrar() {
    try { localStorage.setItem(clave, '1') } catch { /* nada */ }
    setAbierta(false)
  }

  return (
    <>
      {abierta && (
        <div class="carta-pantalla" role="dialog" aria-label="Llegaste">
          <div class="carta-hoja">
            <img src="/virgen.webp" alt="" class="carta-virgen" />
            <Texto />
            <button class="btn" onClick={cerrar}>Amén 💙</button>
          </div>
        </div>
      )}
      <button class="carta-boton" onClick={() => setLeer(!leer)}>
        💌 <b>Una carta para vos</b> <span>{leer ? 'cerrar' : 'leer'}</span>
      </button>
      {leer && <div class="carta-hoja chica"><Texto /></div>}
    </>
  )
}
