// «No soy un robot» con Cloudflare Turnstile (Luis, 01/11/2026). Solo aparece si existe la variable
// VITE_TURNSTILE_SITE_KEY (clave pública del sitio, en Netlify). Sin ella no se pinta nada y todo
// funciona igual. La clave secreta va aparte: en Supabase (Auth → captcha) y como secreto
// TURNSTILE_SECRET de la función clave-recuperar. Ver la tarea del Registro de incidencias.
import { useEffect, useRef } from 'react'

export const SITE_KEY_TURNSTILE: string = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? ''

interface TurnstileApi {
  render: (el: HTMLElement, o: Record<string, unknown>) => string
  remove: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let cargando: Promise<void> | null = null
function cargar(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  cargando ??= new Promise((ok, mal) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => ok()
    s.onerror = () => mal(new Error('No se ha podido cargar «No soy un robot».'))
    document.head.appendChild(s)
  })
  return cargando
}

/** Cada código vale una sola vez: para pedir otro, cambia la `key` del componente. */
export function NoSoyRobot({ onToken }: { onToken: (t: string | null) => void }) {
  const caja = useRef<HTMLDivElement>(null)
  const aviso = useRef(onToken)
  useEffect(() => {
    aviso.current = onToken
  })
  useEffect(() => {
    if (!SITE_KEY_TURNSTILE) return
    let id: string | null = null
    let vivo = true
    void cargar().then(() => {
      if (!vivo || !caja.current || !window.turnstile) return
      id = window.turnstile.render(caja.current, {
        sitekey: SITE_KEY_TURNSTILE,
        language: 'es',
        callback: (t: string) => aviso.current(t),
        'expired-callback': () => aviso.current(null),
        'error-callback': () => aviso.current(null),
      })
    })
    return () => {
      vivo = false
      if (id && window.turnstile) window.turnstile.remove(id)
    }
  }, [])
  if (!SITE_KEY_TURNSTILE) return null
  return <div ref={caja} className="flex justify-center" />
}
