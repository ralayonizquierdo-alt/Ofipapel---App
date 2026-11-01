// Cierre de sesión por inactividad (Luis, 01/11/2026: «cerrar las sesiones si no hay uso en un tiempo a
// elegir»). El tiempo es el parámetro «local.cerrar_inactividad» (Archivo → Parámetros → Locales →
// Inicio y Finalización), por empleado; «0» = nunca. La actividad (ratón, teclado, toque) se apunta en
// localStorage para que dos pestañas del mismo puesto cuenten como uso. Un minuto antes sale un aviso
// con «Seguir trabajando»; al llegar al tiempo se cierra la sesión sin preguntar (queda en la auditoría
// como SALIDA, como cualquier salida) y vuelve a la entrada con los 3 botones.

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { useParametro } from '../../lib/parametros'

const CLAVE = 'erp.ultimaActividad'
const AVISO_SEG = 60

function marcar() {
  try {
    localStorage.setItem(CLAVE, String(Date.now()))
  } catch {
    /* sin almacenamiento: cuenta solo esta pestaña */
  }
  ultimaLocal = Date.now()
}
let ultimaLocal = Date.now()
function ultima() {
  try {
    return Math.max(Number(localStorage.getItem(CLAVE)) || 0, ultimaLocal)
  } catch {
    return ultimaLocal
  }
}

export function CierreInactividad() {
  const { signOut } = useAuth()
  const minutos = Number(useParametro<string>('local.cerrar_inactividad') ?? '60') || 0
  const [quedan, setQuedan] = useState<number | null>(null)
  // signOut cambia en cada renovación de la sesión: por referencia, para no reiniciar el reloj.
  const salir = useRef(signOut)
  useEffect(() => {
    salir.current = signOut
  }, [signOut])

  useEffect(() => {
    if (!minutos) return
    marcar()
    let ultimoMarcado = 0
    const actividad = () => {
      // Como mucho una escritura cada 5 s (mover el ratón dispara muchos eventos).
      const ahora = Date.now()
      if (ahora - ultimoMarcado > 5000) {
        ultimoMarcado = ahora
        marcar()
      }
    }
    const eventos = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'] as const
    for (const ev of eventos) window.addEventListener(ev, actividad, { passive: true })
    const reloj = window.setInterval(() => {
      const restan = Math.round((ultima() + minutos * 60000 - Date.now()) / 1000)
      if (restan <= 0) {
        window.clearInterval(reloj)
        void salir.current()
      } else setQuedan(restan <= AVISO_SEG ? restan : null)
    }, 1000)
    return () => {
      for (const ev of eventos) window.removeEventListener(ev, actividad)
      window.clearInterval(reloj)
    }
  }, [minutos])

  if (quedan == null) return null
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/30" role="alertdialog" aria-label="Cierre por inactividad">
      <div className="flex w-[380px] max-w-[92vw] flex-col items-center gap-3 rounded-lg border border-[#e0b400] bg-white p-4 text-center shadow-lg">
        <div className="text-[15px] font-bold text-[#8a5a00]">⏱ La sesión se va a cerrar por inactividad</div>
        <div className="text-[28px] font-bold text-[#c42b1c]">{quedan} s</div>
        <div className="text-[12px] text-[#555]">Lleva {minutos} minutos sin usarse. Lo que no esté guardado se perderá.</div>
        <button
          type="button"
          className="gw-btn h-[30px] px-4 font-bold"
          autoFocus
          onClick={() => {
            marcar()
            setQuedan(null)
          }}
        >
          Seguir trabajando
        </button>
      </div>
    </div>
  )
}
