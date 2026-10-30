import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../lib/PermisosContext'

// Aviso rojo para los super administradores (Luis, 30/10/2026): cuando en la auditoría hay avisos
// nuevos (borrados, precios por debajo del coste, cambios de permisos, contraseñas incorrectas,
// intentos fuera de horario…), sale arriba en todo el programa. Al pulsarlo se abre Archivo →
// Auditoría con los avisos, y dejan de ser nuevos (fn_auditoria_avisos_vistos).

const CADA_MS = 5 * 60 * 1000

export function AvisoAuditoria() {
  const { superAdmin } = usePermisos()
  const navigate = useNavigate()
  const [n, setN] = useState(0)

  useEffect(() => {
    if (!superAdmin) return setN(0)
    let vivo = true
    const mirar = () =>
      supabase.rpc('fn_auditoria_avisos', { p_dias: 30 }).then(({ data }) => {
        if (vivo) setN(Number((data as { pendientes?: number } | null)?.pendientes ?? 0))
      })
    void mirar()
    const t = setInterval(() => document.visibilityState === 'visible' && void mirar(), CADA_MS)
    const vistos = () => setN(0)
    window.addEventListener('erp:avisos-auditoria-vistos', vistos)
    return () => {
      vivo = false
      clearInterval(t)
      window.removeEventListener('erp:avisos-auditoria-vistos', vistos)
    }
  }, [superAdmin])

  if (!n) return null
  return (
    <button
      type="button"
      className="fixed right-[90px] top-[2px] z-[250] border border-[#8c1d12] bg-[#c42b1c] px-3 py-[2px] text-[13px] font-bold text-white shadow"
      onClick={() => navigate('/archivo/auditoria?avisos=1')}
      title="Borrados, precios por debajo del coste, cambios de permisos, contraseñas incorrectas…"
    >
      🔔 {n} aviso{n === 1 ? '' : 's'} de auditoría
    </button>
  )
}
