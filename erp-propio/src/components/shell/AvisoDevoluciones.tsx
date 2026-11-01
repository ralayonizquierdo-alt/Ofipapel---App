// Aviso en la cabecera (Luis, 01/11/2026: «ante una devolución el programa debe como mínimo avisar a la
// persona encargada»): cuántos recibos devueltos están pendientes de decidir. Lo ve quien tiene acceso a
// Contabilidad → Remesas SEPA; al pulsarlo abre la pestaña Devoluciones.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const CADA_MS = 5 * 60 * 1000

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
  return (
    <button
      type="button"
      className="flex-none rounded border border-[#c9a400] bg-[#fff1c2] px-1.5 text-[11px] font-bold leading-[17px] text-[#8a5a00]"
      onClick={() => navigate('/contabilidad/remesas?pestana=devoluciones')}
      title="Recibos devueltos por el banco que nadie ha decidido todavía qué hacer"
    >
      ⚠ {n} recibo{n === 1 ? '' : 's'} devuelto{n === 1 ? '' : 's'} por decidir
    </button>
  )
}
