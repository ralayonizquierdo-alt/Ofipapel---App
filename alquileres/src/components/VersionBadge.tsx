import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

type Estado = 'comprobando' | 'actual' | 'nueva' | 'error'

/**
 * Compara el fichero JS que está ejecutando el navegador con el que anuncia el
 * index.html del servidor. Como Vite pone un hash en el nombre de cada compilación,
 * si no coinciden es que el móvil está sirviendo una versión cacheada.
 *
 * Nace de una noche perdida depurando un fallo ya corregido que no llegaba al
 * móvil porque el navegador seguía dando una versión vieja, sin forma de saberlo.
 */

const BUNDLE_EN_USO = (() => {
  try {
    return new URL(import.meta.url).pathname.split('/').pop() || ''
  } catch {
    return ''
  }
})()

async function consultarServidor(): Promise<Estado> {
  try {
    const base = import.meta.env.BASE_URL || '/'
    const res = await fetch(`${base}index.html?_=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return 'error'
    const html = await res.text()
    const encontrados = html.match(/assets\/[A-Za-z0-9._-]+\.js/g)
    if (!encontrados || !BUNDLE_EN_USO) return 'error'
    const enServidor = encontrados.map(s => s.split('/').pop())
    return enServidor.includes(BUNDLE_EN_USO) ? 'actual' : 'nueva'
  } catch {
    return 'error'
  }
}

/** Tira la caché y recarga saltándosela, que es lo que no se podía hacer a mano. */
async function actualizar() {
  try {
    if ('caches' in window) {
      const claves = await caches.keys()
      await Promise.all(claves.map(k => caches.delete(k)))
    }
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? []
    await Promise.all(regs.map(r => r.unregister()))
  } catch {
    // Si no se puede limpiar, la recarga con parámetro nuevo suele bastar.
  }
  const url = new URL(location.href)
  url.searchParams.set('v', String(Date.now()))
  location.replace(url.toString())
}

const ESTILOS: Record<Estado, { fondo: string; texto: string; punto: string; etiqueta: string }> = {
  comprobando: { fondo: 'bg-slate-100 border-slate-200', texto: 'text-slate-500', punto: 'bg-slate-400', etiqueta: 'Comprobando versión…' },
  actual:      { fondo: 'bg-green-50 border-green-300',  texto: 'text-green-800', punto: 'bg-green-500', etiqueta: 'Estás en la última versión' },
  nueva:       { fondo: 'bg-orange-50 border-orange-300', texto: 'text-orange-800', punto: 'bg-orange-500', etiqueta: 'Hay una versión nueva' },
  error:       { fondo: 'bg-slate-100 border-slate-200', texto: 'text-slate-500', punto: 'bg-slate-400', etiqueta: 'No se pudo comprobar' },
}

export default function VersionBadge() {
  const [estado, setEstado] = useState<Estado>('comprobando')

  const comprobar = useCallback(async () => {
    setEstado('comprobando')
    setEstado(await consultarServidor())
  }, [])

  useEffect(() => { comprobar() }, [comprobar])

  const s = ESTILOS[estado]

  return (
    <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-2">
      <button
        type="button"
        onClick={estado === 'nueva' ? actualizar : comprobar}
        className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${s.fondo} ${s.texto}`}
      >
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.punto} ${estado === 'nueva' ? 'animate-pulse' : ''}`} />
        <span className="text-left">
          {s.etiqueta}
          {estado === 'nueva' && <span className="block font-semibold">Toca aquí para actualizar</span>}
        </span>
      </button>

      <button
        type="button"
        onClick={actualizar}
        title="Forzar actualización"
        aria-label="Forzar actualización"
        className="p-2.5 rounded-lg border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-colors"
      >
        <RefreshCw size={15} />
      </button>
    </div>
  )
}
