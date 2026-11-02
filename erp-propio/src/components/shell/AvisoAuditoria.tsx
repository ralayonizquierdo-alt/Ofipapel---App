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
// Por responsable y a sus horas (Luis, 02/11/2026): a cada super administrador solo le llegan los avisos
// de sus departamentos (empleado.avisos_grupos) y el globo solo aparece al entrar y a sus horas
// (empleado.avisos_horas, 12:00 y 18:00); entre medias se van juntando. Lo urgente (usuario bloqueado,
// remoto sin permiso, asientos por firmar) sale en el momento. «Visto» lo apaga hasta la siguiente hora.

const CADA_MS = 5 * 60 * 1000
// Cuándo se abrió el programa: «al entrar» cuenta como una de las horas del globo.
const INICIO = Date.now()

/** Última hora del globo que ya ha pasado: la de entrada o una de las horas de hoy. */
function ultimoHito(horas: string[], ahora = new Date()): number {
  let h = INICIO
  for (const t of horas) {
    const [hh, mm] = t.split(':').map(Number)
    if (Number.isNaN(hh)) continue
    const d = new Date(ahora)
    d.setHours(hh, mm || 0, 0, 0)
    if (d.getTime() <= ahora.getTime() && d.getTime() > h) h = d.getTime()
  }
  return h
}

const ICONO: Record<string, string> = {
  'Contraseña incorrecta': '🔑',
  'Intento fuera de horario': '🕐',
  'Entrada remota sin permiso': '🏠',
  'Uso fuera de lo normal': '⏱️',
  'Datos de Contabilidad sacados fuera': '📤',
  'Usuario bloqueado por claves incorrectas': '⛔',
  'Reapertura de ejercicio': '📕',
  'Reapertura de mes': '📅',
  'Cambio de cuenta bancaria': '💳',
  'Regularización de stock': '📦',
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
  nuevos: number
  urgente?: boolean
}

export function AvisoAuditoria() {
  const { superAdmin } = usePermisos()
  const navigate = useNavigate()
  const [n, setN] = useState(0)
  const [porFirmar, setPorFirmar] = useState(0)
  const [urgentes, setUrgentes] = useState(0)
  const [horas, setHoras] = useState<string[]>(['12:00', '18:00'])
  const [vistoHasta, setVistoHasta] = useState<number>(0)
  const [, setMinuto] = useState(0)
  const [resumen, setResumen] = useState<Resumen[]>([])
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!superAdmin) return
    let vivo = true
    const mirar = () =>
      supabase.rpc('fn_auditoria_avisos', { p_dias: 30 }).then(({ data }) => {
        if (!vivo) return
        const d = data as {
          pendientes?: number
          urgentes?: number
          por_firmar?: number
          resumen?: Resumen[]
          horas?: string[]
          visto_hasta?: string | null
        } | null
        setN(Number(d?.pendientes ?? 0))
        setUrgentes(Number(d?.urgentes ?? 0))
        setPorFirmar(Number(d?.por_firmar ?? 0))
        setResumen(d?.resumen ?? [])
        if (d?.horas) setHoras(d.horas)
        setVistoHasta(d?.visto_hasta ? new Date(d.visto_hasta).getTime() : 0)
      })
    void mirar()
    const t = setInterval(() => document.visibilityState === 'visible' && void mirar(), CADA_MS)
    // Cada minuto se mira si ha llegado una de las horas del globo.
    const m = setInterval(() => setMinuto((x) => x + 1), 60_000)
    const vistos = () => {
      setN(0)
      setUrgentes(0)
      setVistoHasta(Date.now())
      setResumen([])
    }
    window.addEventListener('erp:avisos-auditoria-vistos', vistos)
    return () => {
      vivo = false
      clearInterval(t)
      clearInterval(m)
      window.removeEventListener('erp:avisos-auditoria-vistos', vistos)
    }
  }, [superAdmin])

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  async function visto() {
    await supabase.rpc('fn_auditoria_avisos_vistos')
    window.dispatchEvent(new Event('erp:avisos-auditoria-vistos'))
    setAbierto(false)
  }

  // Se ve si hay algo urgente o por firmar, o si hay avisos y ya ha llegado una de sus horas desde el último «Visto».
  const tocaHora = n > 0 && vistoHasta < ultimoHito(horas)
  if (!superAdmin || (!urgentes && !porFirmar && !tocaHora)) return null
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
                <b className="text-[#c42b1c]">
                  {r.urgente ? '¡' : ''}
                  {r.nuevos}
                </b>
              </div>
            ))
          ) : (
            <div className="text-[#555]">Nada nuevo desde la última vez.</div>
          )}
          <div className="mt-1 flex justify-end gap-1">
            <button type="button" className="gw-btn" onClick={() => void visto()} title="Apagar el globo hasta la siguiente hora de avisos">
              Visto
            </button>
            <button
              type="button"
              className="gw-btn"
              onClick={() => {
                setAbierto(false)
                navigate('/archivo/auditoria?avisos=1')
              }}
            >
              Ver en Auditoría
            </button>
          </div>
          <div className="text-[10px] text-[#777]">Sale al entrar y a las {horas.join(' y ')}; lo urgente, en el momento.</div>
        </div>
      )}
    </div>
  )
}
