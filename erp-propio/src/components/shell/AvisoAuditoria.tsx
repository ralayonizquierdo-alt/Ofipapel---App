import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../lib/PermisosContext'

// Globo 🛡️ de la auditoría para los super administradores (Luis, 30/10 y 01/11/2026). Pequeño, en la
// cabecera, distinto del 🧾 de devoluciones. Cuenta los avisos nuevos (fn_auditoria_avisos): claves
// incorrectas, fuera de horario, remoto sin permiso, uso fuera de lo normal, datos de Contabilidad
// descargados o impresos, asientos anulados, con fecha atrasada o manuales en caja/bancos/clientes,
// cierre y reapertura de ejercicio o mes, cambios en el plan de cuentas o en los parámetros de control,
// borrados, permisos, precios por debajo del coste… y los asientos que esperan su segunda firma.
// Al pulsarlo se ve el resumen; «Ver en Auditoría» abre la lista y los da por vistos.

const CADA_MS = 5 * 60 * 1000

const ICONO: Record<string, string> = {
  'Contraseña incorrecta': '🔑',
  'Intento fuera de horario': '🕐',
  'Entrada remota sin permiso': '🏠',
  'Uso fuera de lo normal': '⏱️',
  'Datos de Contabilidad sacados fuera': '📤',
  'Cierre / reapertura de ejercicio': '📕',
  'Cierre / reapertura de mes': '📅',
  'Asiento anulado o modificado': '✏️',
  'Asiento con fecha atrasada': '⏪',
  'Asiento manual en caja, bancos o clientes': '🏦',
  'Cambio en el plan de cuentas': '📒',
  'Asiento pendiente de segunda firma': '✍️',
  'Cambio de parámetros de control': '⚙️',
  'Cambio en las redes de las tiendas': '📶',
  Borrado: '🗑️',
  'Cambio de permisos / periodos': '🔐',
  'Cambio de empleado / acceso': '👤',
  'Precio por debajo del coste': '💸',
}

interface Resumen {
  motivo: string
  total: number
  nuevos: number
}

export function AvisoAuditoria() {
  const { superAdmin } = usePermisos()
  const navigate = useNavigate()
  const [n, setN] = useState(0)
  const [porFirmar, setPorFirmar] = useState(0)
  const [resumen, setResumen] = useState<Resumen[]>([])
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!superAdmin) return
    let vivo = true
    const mirar = () =>
      supabase.rpc('fn_auditoria_avisos', { p_dias: 30 }).then(({ data }) => {
        if (!vivo) return
        const d = data as { pendientes?: number; por_firmar?: number; resumen?: Resumen[] } | null
        setN(Number(d?.pendientes ?? 0))
        setPorFirmar(Number(d?.por_firmar ?? 0))
        setResumen(d?.resumen ?? [])
      })
    void mirar()
    const t = setInterval(() => document.visibilityState === 'visible' && void mirar(), CADA_MS)
    const vistos = () => {
      setN(0)
      setResumen((r) => r.map((x) => ({ ...x, nuevos: 0 })))
    }
    window.addEventListener('erp:avisos-auditoria-vistos', vistos)
    return () => {
      vivo = false
      clearInterval(t)
      window.removeEventListener('erp:avisos-auditoria-vistos', vistos)
    }
  }, [superAdmin])

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  if (!superAdmin || (!n && !porFirmar)) return null
  const nuevos = resumen.filter((r) => r.nuevos > 0)
  return (
    <div ref={caja} className="relative flex-none">
      <button
        type="button"
        className="relative flex h-[18px] items-center rounded border border-[#d0d7e2] bg-white px-1 text-[12px] leading-none hover:bg-[#fdecea]"
        onClick={() => setAbierto((a) => !a)}
        title={`${n} aviso${n === 1 ? '' : 's'} de auditoría nuevo${n === 1 ? '' : 's'}${porFirmar ? ` · ${porFirmar} asiento(s) por firmar` : ''}`}
        aria-label="Avisos de auditoría"
      >
        🛡️
        <span className="absolute -right-1.5 -top-1.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-[#c42b1c] px-[3px] text-[9px] font-bold text-white">
          {n + porFirmar}
        </span>
      </button>
      {abierto && (
        <div className="absolute left-0 top-[22px] z-[260] flex w-[320px] flex-col gap-1 border border-[#6f6f6f] bg-white p-2 text-[12px] shadow-lg">
          <b className="text-[13px] text-[#1d3a8a]">🛡️ Avisos de auditoría</b>
          {porFirmar > 0 && (
            <button
              type="button"
              className="flex items-center gap-1.5 rounded bg-[#fff4ce] px-1 py-0.5 text-left font-bold hover:bg-[#ffe9a0]"
              onClick={() => {
                setAbierto(false)
                navigate('/contabilidad/control')
              }}
            >
              ✍️ {porFirmar} asiento{porFirmar === 1 ? '' : 's'} esperando tu firma
            </button>
          )}
          {nuevos.length ? (
            nuevos.map((r) => (
              <div key={r.motivo} className="flex items-center gap-1.5">
                <span className="w-[18px] text-center">{ICONO[r.motivo] ?? '•'}</span>
                <span className="flex-1">{r.motivo}</span>
                <b className="text-[#c42b1c]">{r.nuevos}</b>
              </div>
            ))
          ) : (
            <div className="text-[#555]">Nada nuevo desde la última vez.</div>
          )}
          <button
            type="button"
            className="gw-btn mt-1 self-end"
            onClick={() => {
              setAbierto(false)
              navigate('/archivo/auditoria?avisos=1')
            }}
          >
            Ver en Auditoría
          </button>
        </div>
      )}
    </div>
  )
}
