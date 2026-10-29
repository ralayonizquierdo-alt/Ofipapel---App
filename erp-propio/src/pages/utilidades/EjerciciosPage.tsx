// Archivo → Periodos, como la ficha «Periodos» de GeminisWin: Código, Descripción, Fecha Inicio
// y Fecha Final, con sus casillas-botón debajo. Un periodo dura lo que se quiera (en GeminisWin
// se cierran cada ~3 años).
//  · «En curso»: el periodo con el que trabajan todos los equipos. Solo uno.
//  · «Cerrado»: archivado, solo consulta. La base de datos no deja grabar, modificar ni borrar
//    documentos con fecha dentro de él (fn_bloquear_periodo_cerrado). Se consulta con Archivo →
//    Seleccionar Periodo.
// Solo los super administradores entran aquí (y la RLS solo les deja escribir a ellos).
// Un periodo no se borra.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GwDate, GwField, GwInput } from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { supabase } from '../../lib/supabase'
import { fijarEjercicioActivo } from '../../lib/sesionTrabajo'
import { useEsSuperAdministrador } from '../archivo/comun'
import { Mensaje } from './comun'
import { fechaEs } from './datos'

interface Periodo {
  anio: number
  descripcion: string | null
  fecha_inicio: string
  fecha_fin: string
  cerrado: boolean
  activo: boolean
}

const nuevo = (anio: number, desde: string): Periodo => ({
  anio,
  descripcion: `Periodo ${anio}`,
  fecha_inicio: desde,
  fecha_fin: `${anio + 2}-12-31`,
  cerrado: false,
  activo: false,
})

const codigo = (anio: number) => String(anio).padStart(6, '0')

export function EjerciciosPage() {
  const superAdmin = useEsSuperAdministrador()
  const navigate = useNavigate()
  const [lista, setLista] = useState<Periodo[]>([])
  const [idx, setIdx] = useState(0)
  const [draft, setDraft] = useState<Periodo | null>(null)
  const [modo, setModo] = useState<'consulta' | 'alta' | 'edicion'>('consulta')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null)

  const cargar = useCallback(async (seleccionar?: number) => {
    const { data, error } = await supabase.from('ejercicio').select('anio, descripcion, fecha_inicio, fecha_fin, cerrado, activo').order('fecha_inicio')
    if (error) return setMensaje({ texto: error.message, error: true })
    const l = (data ?? []) as Periodo[]
    setLista(l)
    const i = Math.max(0, l.findIndex((e) => (seleccionar != null ? e.anio === seleccionar : e.activo)))
    setIdx(i)
    setDraft(l[i] ?? null)
    const act = l.find((e) => e.activo)
    fijarEjercicioActivo(act ? { anio: act.anio, desde: act.fecha_inicio, hasta: act.fecha_fin, descripcion: act.descripcion } : null)
  }, [])

  useEffect(() => {
    if (superAdmin) cargar()
  }, [superAdmin, cargar])

  if (superAdmin === null) return <div className="p-3 text-[13px]">Comprobando permisos…</div>
  if (!superAdmin)
    return (
      <div className="p-3">
        <Mensaje texto="Los periodos solo los gestionan los super administradores." error />
      </div>
    )

  const ro = modo === 'consulta'
  const set = (p: Partial<Periodo>) => setDraft((d) => (d ? { ...d, ...p } : d))
  const ir = (i: number) => {
    if (!lista[i]) return
    setIdx(i)
    setDraft(lista[i])
    setMensaje(null)
  }

  async function guardar() {
    if (!draft) return
    if (!Number.isInteger(draft.anio) || draft.anio < 1900 || draft.anio > 2999) return setMensaje({ texto: 'El código (año) no es válido.', error: true })
    if (!draft.fecha_inicio || !draft.fecha_fin || draft.fecha_fin < draft.fecha_inicio)
      return setMensaje({ texto: 'La fecha final debe ser igual o posterior a la de inicio.', error: true })
    const antes = lista.find((e) => e.anio === draft.anio)
    const nombre = `«${draft.descripcion ?? draft.anio}» (${fechaEs(draft.fecha_inicio)} – ${fechaEs(draft.fecha_fin)})`
    if (draft.cerrado && !antes?.cerrado) {
      if (!confirm(`Vas a CERRAR el periodo ${nombre}.\n\nDesde ese momento NADIE podrá grabar, modificar ni borrar documentos con fecha dentro de él: quedará solo para consulta.\n\n¿Continuar?`)) return
      if (!confirm(`Confirma otra vez: ¿cerrar el periodo ${nombre}?`)) return
    }
    if (!draft.cerrado && antes?.cerrado && !confirm(`Vas a REABRIR el periodo ${nombre}: se podrá volver a grabar en sus fechas. ¿Seguro?`)) return
    setGuardando(true)
    const fila = { descripcion: draft.descripcion, fecha_inicio: draft.fecha_inicio, fecha_fin: draft.fecha_fin, cerrado: draft.cerrado, activo: draft.activo && antes?.activo === true }
    const { error } =
      modo === 'alta' ? await supabase.from('ejercicio').insert({ anio: draft.anio, ...fila, activo: false }) : await supabase.from('ejercicio').update(fila).eq('anio', draft.anio)
    if (!error && draft.activo && !antes?.activo) {
      const r = await supabase.rpc('fn_ejercicio_activar', { p_anio: draft.anio })
      if (r.error) {
        setGuardando(false)
        return setMensaje({ texto: r.error.message, error: true })
      }
    }
    setGuardando(false)
    if (error) return setMensaje({ texto: error.code === '23505' ? `Ya existe el periodo ${codigo(draft.anio)}.` : error.message, error: true })
    setModo('consulta')
    setMensaje({ texto: `Periodo ${codigo(draft.anio)} guardado.` })
    cargar(draft.anio)
  }

  return (
    <div className="flex w-[820px] max-w-full flex-col gap-1.5 text-[13px]">
      {draft && (
        <>
          <div className="grid grid-cols-[110px_minmax(0,1fr)_140px_140px] gap-x-2">
            <GwField label="Código">
              <GwInput
                value={modo === 'alta' ? String(draft.anio || '') : codigo(draft.anio)}
                readOnly={modo !== 'alta'}
                title="Año en que empieza el periodo"
                onChange={(e) => {
                  const a = Number(e.target.value.replace(/\D/g, '').slice(-4))
                  set({ anio: a, ...(a >= 1900 && draft.descripcion?.startsWith('Periodo ') ? { descripcion: `Periodo ${a}` } : {}) })
                }}
              />
            </GwField>
            <GwField label="Descripción">
              <GwInput value={draft.descripcion ?? ''} readOnly={ro} onChange={(e) => set({ descripcion: e.target.value })} />
            </GwField>
            <GwField label="Fecha Inicio">
              <GwDate value={draft.fecha_inicio} readOnly={ro} onChange={(v) => set({ fecha_inicio: v ?? '' })} />
            </GwField>
            <GwField label="Fecha Final">
              <GwDate value={draft.fecha_fin} readOnly={ro} onChange={(v) => set({ fecha_fin: v ?? '' })} />
            </GwField>
          </div>
          <Casilla
            on={draft.activo}
            disabled={ro || draft.cerrado || lista.find((e) => e.anio === draft.anio)?.activo === true}
            onChange={(v) => set({ activo: v })}
          >
            Este periodo es el que está en curso: con él trabajan todos los equipos
          </Casilla>
          <Casilla on={draft.cerrado} disabled={ro || draft.activo} onChange={(v) => set({ cerrado: v })}>
            Periodo cerrado: solo consulta (nadie puede grabar, modificar ni borrar en sus fechas)
          </Casilla>
        </>
      )}
      <div className="h-[200px] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th className="w-[80px]">Código</th>
              <th>Descripción</th>
              <th className="w-[95px]">Fecha Inicio</th>
              <th className="w-[95px]">Fecha Final</th>
              <th className="w-[130px]">Estado</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e, i) => (
              <tr key={e.anio} className={i === idx && modo !== 'alta' ? 'gw-selected' : ''} onClick={() => ro && ir(i)}>
                <td>{codigo(e.anio)}</td>
                <td className="truncate">{e.descripcion}</td>
                <td>{fechaEs(e.fecha_inicio)}</td>
                <td>{fechaEs(e.fecha_fin)}</td>
                <td className={e.cerrado ? 'text-[#a00]' : e.activo ? 'font-bold text-[#127a12]' : ''}>{e.cerrado ? 'Cerrado' : e.activo ? 'En curso' : 'Abierto'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mensaje && <Mensaje {...mensaje} />}
      <GwRecordBar
        mode={modo}
        canNavigate={ro && lista.length > 0}
        saving={guardando}
        onFirst={() => ir(0)}
        onPrev={() => ir(idx - 1)}
        onNext={() => ir(idx + 1)}
        onLast={() => ir(lista.length - 1)}
        onNew={() => {
          const ult = lista[lista.length - 1]
          const desde = ult ? siguienteDia(ult.fecha_fin) : `${new Date().getFullYear()}-01-01`
          setDraft(nuevo(Number(desde.slice(0, 4)), desde))
          setModo('alta')
          setMensaje(null)
        }}
        onEdit={() => draft && setModo('edicion')}
        onSave={guardar}
        onCancel={() => {
          setModo('consulta')
          setDraft(lista[idx] ?? null)
          setMensaje(null)
        }}
        onExit={() => navigate('/')}
      />
    </div>
  )
}

function siguienteDia(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const f = new Date(Date.UTC(y, m - 1, d + 1))
  return f.toISOString().slice(0, 10)
}

/** Casilla-botón de GeminisWin: ✔ verde activada, ✖ gris desactivada, a todo el ancho. */
function Casilla({ on, disabled, onChange, children }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void; children: string }) {
  return (
    <button
      type="button"
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
      onClick={() => !disabled && onChange(!on)}
      className={`gw-boton-barra h-[34px] w-full gap-2 text-[15px] ${disabled ? 'pointer-events-none' : ''}`}
    >
      <span className={on ? 'text-[18px] font-bold text-[#127a12]' : 'text-[18px] font-bold text-[#909090]'}>{on ? '✔' : '✖'}</span>
      <span className={on ? 'text-black' : 'text-[#707070]'}>{children}</span>
    </button>
  )
}
