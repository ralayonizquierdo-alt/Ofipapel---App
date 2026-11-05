// Aviso en la cabecera (Luis, 01/11/2026: «ante una devolución el programa debe como mínimo avisar a la
// persona encargada»): cuántos recibos devueltos están pendientes de decidir. Lo ve quien tiene acceso a
// Contabilidad → Remesas SEPA; al pulsarlo abre la pestaña Devoluciones.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const CADA_MS = 10 * 60 * 1000 // antes 5 min

export function AvisoDevoluciones() {
  const navigate = useNavigate()
  const [n, setN] = useState(0)
  useEffect(() => {
    let vivo = true
    const mirar = () =>
      supabase.rpc('fn_remesa_devoluciones_pendientes').then(({ data }) => {
        if (vivo) setN(Number(data ?? 0))
      })
    void mirar()
    const t = setInterval(() => document.visibilityState === 'visible' && void mirar(), CADA_MS)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [])
  if (!n) return null
  // Globo pequeño y escueto (Luis): icono de recibo con el número en rojo; el detalle, al pasar el ratón.
  return (
    <button
      type="button"
      className="relative flex h-[18px] flex-none items-center rounded border border-[#d0d7e2] bg-white px-1 text-[12px] leading-none hover:bg-[#fdecea]"
      onClick={() => navigate('/contabilidad/remesas?pestana=devoluciones')}
      title={`${n} recibo${n === 1 ? '' : 's'} devuelto${n === 1 ? '' : 's'} por el banco pendiente${n === 1 ? '' : 's'} de decidir qué hacer`}
      aria-label={`${n} recibos devueltos por decidir`}
    >
      🧾
      <span className="absolute -right-1.5 -top-1.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-[#c42b1c] px-[3px] text-[9px] font-bold text-white">
        {n}
      </span>
    </button>
  )
}
