import { render } from 'preact'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app'
import { escucharInstalacion } from './pantallas/comunes'
import './estilos.css'
import './pantallas.css'

escucharInstalacion()

// El service worker precachea el shell entero, supabase-js incluido: después
// de la primera visita con señal, la app abre igual en modo avión. Se
// actualiza solo; una versión nueva entra la próxima vez que se abre.
registerSW({ immediate: true })

render(<App />, document.getElementById('app')!)
