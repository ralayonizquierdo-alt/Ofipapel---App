import { useEffect, useState } from 'react'

const CADA_MS = 60_000

/**
 * Aviso de versión nueva: cada minuto (y al volver a la pestaña) mira version.json, que se
 * genera en cada publicación (vite.config.ts). Si no coincide con la versión cargada, sale una
 * franja amarilla con «Actualizar», que recarga la página. No recarga solo, para no perder lo que
 * se esté escribiendo. En desarrollo no hay version.json y no hace nada.
 */
export function AvisoVersion() {
  const [hayNueva, setHayNueva] = useState(false)

  useEffect(() => {
    if (import.meta.env.DEV) return
    let vivo = true
    const mirar = async () => {
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!r.ok) return
        const { build } = (await r.json()) as { build?: string }
        if (vivo && build && build !== __APP_BUILD_ID__) setHayNueva(true)
      } catch {
        /* sin conexión: se vuelve a mirar en la siguiente vuelta */
      }
    }
    const alVolver = () => document.visibilityState === 'visible' && mirar()
    const t = setInterval(mirar, CADA_MS)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      vivo = false
      clearInterval(t)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [])

  if (!hayNueva) return null
  return (
    <div className="flex items-center justify-center gap-3 border-b border-[#d4b106] bg-[#fff6bf] px-2 py-0.5 text-[12px]">
      <span>Hay una versión nueva del ERP.</span>
      <button type="button" className="gw-btn !h-[20px] font-bold" onClick={() => window.location.reload()}>
        Actualizar
      </button>
      <span className="text-[#6d6d6d]">(guarda antes lo que estés escribiendo)</span>
    </div>
  )
}
