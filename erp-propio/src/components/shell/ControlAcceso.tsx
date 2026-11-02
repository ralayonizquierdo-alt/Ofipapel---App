// Control de horario y teletrabajo (Luis, 01/11/2026). Vale para TODOS, también administradores y super
// administradores («las condiciones de la auditoría las tienen que cumplir todos»). Los datos los da
// fn_mi_control: si entra desde una red de las tiendas o desde fuera (remoto), si puede teletrabajar y
// sus horarios (general, de teletrabajo y de Contabilidad). Se configura en Archivo → Parámetros →
// Control de Accesos; las redes de las tiendas, en Archivo → Uso por Operario → Redes.
// Cada bloqueo dice cómo hacerlo bien y queda en la auditoría (aviso en el globo 🛡️).

import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { areaDeRuta } from '../../lib/registroUso'

export interface Horario {
  dias: number[]
  desde: string
  hasta: string
}

interface MiControl {
  ip: string | null
  red: string | null
  remoto: boolean | null
  control_remoto: boolean
  remoto_permitido: boolean
  horario: Horario | null
  horario_remoto: Horario | null
  horario_contabilidad: Horario | null
}

export function dentro(h: Horario | null, ahora = new Date()): boolean {
  if (!h) return true
  const dia = ((ahora.getDay() + 6) % 7) + 1
  const hm = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`
  return h.dias.includes(dia) && hm >= h.desde && hm <= h.hasta
}

export const textoHorario = (h: Horario) => `${h.dias.map((d) => 'LMXJVSD'[d - 1]).join(' ')} de ${h.desde} a ${h.hasta}`

export function ControlAcceso({ onSalir, onCambiarArea }: { onSalir: () => void; onCambiarArea: () => void }) {
  const { pathname } = useLocation()
  const [c, setC] = useState<MiControl | null>(null)
  const [, setMinuto] = useState(0)

  useEffect(() => {
    let vivo = true
    const mirar = () =>
      supabase.rpc('fn_mi_control').then(({ data }) => {
        if (vivo && data) setC(data as MiControl)
      })
    void mirar()
    const t = setInterval(() => void mirar(), 5 * 60_000)
    const m = setInterval(() => setMinuto((x) => x + 1), 60_000)
    return () => {
      vivo = false
      clearInterval(t)
      clearInterval(m)
    }
  }, [])

  const remoto = c?.remoto === true
  const sinTeletrabajo = Boolean(c && c.control_remoto && remoto && !c.remoto_permitido)
  const horario = c ? (remoto && c.horario_remoto ? c.horario_remoto : c.horario) : null
  const fueraHorario = Boolean(c && !sinTeletrabajo && !dentro(horario))
  const enContabilidad = areaDeRuta(pathname) === 'contabilidad'
  const fueraContab = Boolean(c && !sinTeletrabajo && !fueraHorario && enContabilidad && !dentro(c.horario_contabilidad))
  const motivo = sinTeletrabajo ? 'REMOTO_DENEGADO' : fueraHorario || fueraContab ? 'FUERA_HORARIO' : null

  // Queda en la auditoría (la base de datos no repite el mismo aviso en 30 minutos).
  useEffect(() => {
    if (!motivo) return
    void supabase.rpc('fn_uso_evento', {
      p_tipo: motivo,
      p_area: areaDeRuta(pathname),
      p_ruta: pathname,
      p_titulo: sinTeletrabajo ? 'Entrada desde fuera de las tiendas sin permiso' : fueraContab ? 'Fuera del horario de Contabilidad' : 'Fuera de horario',
      p_detalle: c?.ip ? `IP ${c.ip}` : null,
    })
  }, [motivo, pathname, sinTeletrabajo, fueraContab, c?.ip])

  if (!motivo) return null
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50">
      <div className="flex w-[480px] max-w-[95vw] flex-col gap-3 border border-[#6f6f6f] bg-[var(--gw-face)] p-5 text-[15px] shadow-lg">
        {sinTeletrabajo ? (
          <>
            <b className="text-[17px] text-[#a00]">No tienes permiso para trabajar desde fuera de las tiendas</b>
            <span>Estás entrando desde una conexión que no es de ninguna tienda ni de la oficina{c?.ip ? ` (${c.ip})` : ''}.</span>
            <span className="text-[13px]">
              <b>Cómo hacerlo bien:</b> entra desde la tienda o la oficina, o pide a un administrador que te dé permiso de teletrabajo en Archivo → Parámetros →
              Control de Accesos → Teletrabajo. Si estás en una tienda nueva, un super administrador la da de alta en Archivo → Uso por Operario → Redes de las
              tiendas.
            </span>
          </>
        ) : fueraContab ? (
          <>
            <b className="text-[17px] text-[#a00]">Fuera de tu horario de Contabilidad</b>
            <span>Tu horario de Contabilidad es {textoHorario(c!.horario_contabilidad!)}.</span>
            <span className="text-[13px]">
              <b>Cómo hacerlo bien:</b> puedes seguir trabajando en otra área (Gestión). Si necesitas Contabilidad ahora, pídeselo a un administrador (Archivo →
              Parámetros → Control de Accesos).
            </span>
          </>
        ) : (
          <>
            <b className="text-[17px] text-[#a00]">Fuera de tu horario de acceso</b>
            <span>
              Tu horario {remoto && c?.horario_remoto ? 'de teletrabajo ' : ''}es {textoHorario(horario!)}.
            </span>
            <span className="text-[13px]">
              <b>Cómo hacerlo bien:</b> si necesitas entrar, pídeselo a un administrador (Archivo → Parámetros → Control de Accesos).
            </span>
          </>
        )}
        <div className="flex justify-end gap-1.5">
          {fueraContab && (
            <button type="button" className="gw-btn" onClick={onCambiarArea}>
              Cambiar de área
            </button>
          )}
          <button type="button" className="gw-btn" onClick={onSalir}>
            Salir
          </button>
        </div>
      </div>
    </div>
  )
}
