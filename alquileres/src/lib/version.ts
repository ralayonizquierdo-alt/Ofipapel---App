/**
 * ¿Está el navegador con la última versión publicada?
 *
 * Compara el fichero JS que está ejecutando el navegador con el que anuncia el
 * index.html del servidor. Como Vite pone un hash en el nombre de cada compilación,
 * si no coinciden es que hay una versión nueva, o que el navegador sirve una vieja.
 *
 * Lo usan el aviso de la pantalla de entrada (`VersionBadge`) y la franja amarilla
 * que sale con la aplicación abierta (`AvisoVersion`).
 */

export type EstadoVersion = 'comprobando' | 'actual' | 'nueva' | 'error'

const BUNDLE_EN_USO = (() => {
  try {
    return new URL(import.meta.url).pathname.split('/').pop() || ''
  } catch {
    return ''
  }
})()

export async function consultarServidor(): Promise<EstadoVersion> {
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

/**
 * Tira la caché y recarga saltándosela, que es lo que no se podía hacer a mano.
 *
 * Recarga desde la entrada de la app, no desde la pantalla en la que se esté: la
 * copia de GitHub Pages no sabe servir «/alquileres/cobros» al recargar y da
 * «Página no encontrada» (Luis, 06/11/2026, con Ctrl + F5). Desde la entrada, la
 * app intenta volver a la última pantalla (`RecuerdaPantalla` en App.tsx).
 */
export async function actualizar() {
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
  const url = new URL(import.meta.env.BASE_URL || '/', location.origin)
  url.searchParams.set('v', String(Date.now()))
  location.replace(url.toString())
}
