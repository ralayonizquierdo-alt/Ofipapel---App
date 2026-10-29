import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Avisos de presupuestos (Luis, 30/10/2026): cuántos presupuestos de los que soy responsable toca
// llamar hoy o ya vencidos (fn_mis_avisos_presupuestos). Da el número del globo rojo de la pestaña
// Presupuestos y, una vez al día (o si sube el número), un aviso del sistema en el móvil/tablet.
// El aviso sale mientras el ERP está abierto (aunque sea en otra pestaña o minimizado).

const CADA_MS = 5 * 60 * 1000
const BASE = import.meta.env.BASE_URL
export const URL_RELACION = `${BASE}presupuestos?relacion=1`

let registro: Promise<ServiceWorkerRegistration | null> | null = null
function trabajador(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null)
  registro ??= navigator.serviceWorker.register(`${BASE}avisos-sw.js`, { scope: BASE }).catch(() => null)
  return registro
}

async function avisar(n: number) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const hoy = new Date().toLocaleDateString('sv-SE')
  const clave = `erp.avisoPresupuestos.${hoy}`
  try {
    if (Number(localStorage.getItem(clave) ?? 0) >= n) return
    localStorage.setItem(clave, String(n))
  } catch {
    /* sin almacenamiento: avisa igual */
  }
  const titulo = 'Ofipapel · Presupuestos'
  const opciones: NotificationOptions = {
    body: n === 1 ? 'Tienes 1 presupuesto para llamar hoy.' : `Tienes ${n} presupuestos para llamar hoy.`,
    icon: `${BASE}marca/icono-256.png`,
    tag: 'presupuestos-seguimiento',
    data: { url: URL_RELACION },
  }
  const sw = await trabajador()
  if (sw) return sw.showNotification(titulo, opciones)
  try {
    new Notification(titulo, opciones).onclick = () => window.open(URL_RELACION, '_self')
  } catch {
    /* el navegador no deja avisar sin trabajador: queda el globo rojo */
  }
}

/** Pide permiso para avisar la primera vez que se toca la pantalla (los navegadores lo exigen así). */
function pedirPermisoAlTocar() {
  if (!('Notification' in window) || Notification.permission !== 'default') return
  const pedir = () => {
    window.removeEventListener('pointerdown', pedir)
    void Notification.requestPermission()
  }
  window.addEventListener('pointerdown', pedir, { once: true })
}

export function useAvisosPresupuestos(): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    let vivo = true
    pedirPermisoAlTocar()
    void trabajador()
    const mirar = async () => {
      const { data } = await supabase.rpc('fn_mis_avisos_presupuestos')
      if (!vivo) return
      const v = Number(data ?? 0)
      setN(v)
      const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
      if (v > 0) {
        void nav.setAppBadge?.(v).catch(() => {})
        void avisar(v)
      } else void nav.clearAppBadge?.().catch(() => {})
    }
    void mirar()
    const t = setInterval(mirar, CADA_MS)
    const alVolver = () => document.visibilityState === 'visible' && void mirar()
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      vivo = false
      clearInterval(t)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [])
  return n
}
