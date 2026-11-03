// «Mi fichaje» (Rober, 03/11/2026): botón de la barra de accesos del ERP para fichar desde el ordenador más cercano,
// sin hacer cola en un solo aparato. Ficha la persona que tiene abierta la sesión del ERP (fn_fichaje_mio /
// fn_fichaje_fichar_mio). En un puesto compartido, «Otra persona» ficha con nombre + PIN, como en /fichaje.
// Lo abre el evento «gw:mi-fichaje» (Layout → QuickBar). Gestión: Archivo → Fichaje.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { GwField, GwInput, GwSelect, GwWindow } from '../../components/gw'
import { ESTADOS_FICHAJE, horaCan, TIPOS_FICHAJE, type EstadoFichaje, type TipoFichaje } from '../../lib/fichaje'

interface Panel {
  ok: boolean
  error?: string
  nombre: string
  estado: EstadoFichaje
  siguientes: TipoFichaje[]
  hoy: { tipo: TipoFichaje; en: string; origen: string }[]
  reparto_token: string | null
}

const BOTON: Record<TipoFichaje, { texto: string; color: string }> = {
  entrada: { texto: '▶ Fichar entrada', color: '#127a12' },
  pausa_inicio: { texto: '⏸ Empezar pausa', color: '#b26a00' },
  pausa_fin: { texto: '▶ Terminar pausa', color: '#127a12' },
  salida: { texto: '■ Fichar salida', color: '#c42b1c' },
}

async function ubicacion(): Promise<{ lat: number; lng: number; precision: number } | null> {
  if (!navigator.geolocation) return null
  return new Promise((ok) => {
    const t = setTimeout(() => ok(null), 4000)
    navigator.geolocation.getCurrentPosition(
      (p) => (clearTimeout(t), ok({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy })),
      () => (clearTimeout(t), ok(null)),
      { timeout: 4000, maximumAge: 120_000 },
    )
  })
}

export function MiFichajeHost() {
  const [abierto, setAbierto] = useState(false)
  useEffect(() => {
    const abrir = () => setAbierto(true)
    window.addEventListener('gw:mi-fichaje', abrir)
    return () => window.removeEventListener('gw:mi-fichaje', abrir)
  }, [])
  return abierto ? <MiFichajeDialog onCerrar={() => setAbierto(false)} /> : null
}

function MiFichajeDialog({ onCerrar }: { onCerrar: () => void }) {
  const [panel, setPanel] = useState<Panel | null>(null)
  const [otra, setOtra] = useState(false)
  const [personas, setPersonas] = useState<{ grupo: string; personas: { codigo: string; nombre: string }[] }[]>([])
  const [quien, setQuien] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [ahora, setAhora] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const cargarMio = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('fn_fichaje_mio')
    if (e) return setError(e.message)
    const r = data as Panel
    if (!r.ok) {
      setError(r.error ?? 'No se puede fichar.')
      setOtra(true)
    } else setPanel(r)
  }, [])
  useEffect(() => {
    void cargarMio()
  }, [cargarMio])
  useEffect(() => {
    if (!otra || personas.length) return
    void supabase.rpc('fn_fichaje_personas').then(({ data }) => setPersonas((data ?? []) as typeof personas))
  }, [otra, personas.length])

  const entrarOtra = async () => {
    setError(null)
    setOcupado(true)
    const { data, error: e } = await supabase.rpc('fn_fichaje_entrar', { p_empleado: quien, p_pin: pin })
    setOcupado(false)
    const r = data as Panel | null
    if (e || !r?.ok) {
      setPin('')
      return setError(e?.message ?? r?.error ?? 'PIN incorrecto.')
    }
    setPanel(r)
  }

  const fichar = async (tipo: TipoFichaje) => {
    setError(null)
    setOcupado(true)
    const pos = await ubicacion()
    const comun = { p_tipo: tipo, p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null, p_precision: pos?.precision ?? null, p_dispositivo: navigator.userAgent.slice(0, 150) }
    const { data, error: e } = otra
      ? await supabase.rpc('fn_fichaje_fichar', { ...comun, p_empleado: quien, p_pin: pin })
      : await supabase.rpc('fn_fichaje_fichar_mio', comun)
    setOcupado(false)
    const r = data as Panel | null
    if (e || !r?.ok) return setError(e?.message ?? r?.error ?? 'No se ha podido fichar.')
    setPanel(r)
    setHecho(`✔ ${TIPOS_FICHAJE[tipo]} de ${r.nombre} fichada a las ${horaCan(r.hoy[r.hoy.length - 1]?.en)}`)
    // Con «Otra persona» en un puesto compartido, se cierra solo para que no quede abierto con su PIN.
    if (otra) setTimeout(onCerrar, 4000)
  }

  return (
    <div className="fixed inset-0 z-[320] flex items-start justify-center bg-black/25 pt-16" onKeyDown={(e) => e.key === 'Escape' && onCerrar()}>
      <GwWindow title="Mi fichaje" onClose={onCerrar} className="w-[440px] max-w-[95vw]">
        <div className="flex flex-col gap-2 p-2 text-[13px]">
          <div className="text-center">
            <div className="font-mono text-[30px] font-bold text-[#1d3a8a]">{ahora.toLocaleTimeString('es-ES', { timeZone: 'Atlantic/Canary' })}</div>
            <div className="capitalize text-[#333]">{ahora.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Atlantic/Canary' })}</div>
          </div>
          {otra && !panel && (
            <div className="flex flex-wrap items-end gap-2 border border-[var(--gw-border)] bg-white p-2">
              <GwField label="Persona" className="flex-1">
                <GwSelect value={quien} onChange={(e) => (setQuien(e.target.value), setPin(''))}>
                  <option value="">Elige…</option>
                  {personas.map((g) => (
                    <optgroup key={g.grupo} label={g.grupo}>
                      {g.personas.map((p) => (
                        <option key={p.codigo} value={p.codigo}>
                          {p.nombre}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </GwSelect>
              </GwField>
              <GwField label="PIN">
                <GwInput
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  onKeyDown={(e) => e.key === 'Enter' && quien && pin.length === 4 && void entrarOtra()}
                  className="w-[80px]"
                />
              </GwField>
              <button type="button" className="gw-btn font-bold" disabled={!quien || pin.length !== 4 || ocupado} onClick={() => void entrarOtra()}>
                Entrar
              </button>
            </div>
          )}
          {panel && (
            <div className="flex flex-col gap-2 border border-[var(--gw-border)] bg-white p-2">
              <div className="text-center text-[15px]">
                <b>{panel.nombre}</b> · {ESTADOS_FICHAJE[panel.estado]}
              </div>
              {panel.siguientes.map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={ocupado}
                  onClick={() => void fichar(t)}
                  className="gw-btn !h-[40px] text-[16px] font-bold"
                  style={{ color: BOTON[t].color }}
                >
                  {panel.estado === 'salida' && t === 'entrada' ? '▶ Volver a entrar' : BOTON[t].texto}
                </button>
              ))}
              {!!panel.hoy.length && (
                <div className="border-t border-[var(--gw-border-light)] pt-1">
                  {panel.hoy.map((e, i) => (
                    <div key={i} className="flex justify-between">
                      <span>
                        {TIPOS_FICHAJE[e.tipo]}
                        {e.origen === 'correccion' ? ' (corregido)' : ''}
                      </span>
                      <b className="font-mono">{horaCan(e.en)}</b>
                    </div>
                  ))}
                </div>
              )}
              {panel.reparto_token && (
                <a className="gw-btn !h-[32px] justify-center font-bold" href={`${import.meta.env.BASE_URL}repartidor?t=${panel.reparto_token}`} target="_blank" rel="noreferrer">
                  🚚 Mi reparto
                </a>
              )}
            </div>
          )}
          {hecho && <div className="text-center text-[14px] font-bold text-[#127a12]">{hecho}</div>}
          {error && <div className="font-bold text-[#c42b1c]">{error}</div>}
          <div className="flex justify-between">
            {!otra ? (
              <button type="button" className="gw-btn" onClick={() => (setOtra(true), setPanel(null), setError(null), setHecho(null))} title="En un ordenador compartido: ficha otra persona con su PIN">
                Otra persona
              </button>
            ) : (
              <span />
            )}
            <button type="button" className="gw-btn" onClick={onCerrar}>
              Cerrar
            </button>
          </div>
          <div className="text-[11px] text-[#555]">La hora la pone el servidor. Si te equivocas, avisa a gerencia: lo corrige dejando constancia (Archivo → Fichaje).</div>
        </div>
      </GwWindow>
    </div>
  )
}
