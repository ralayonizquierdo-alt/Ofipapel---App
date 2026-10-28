// SIN CAPTURA de GeminisWin: Archivo → Periodos o Ejercicios. Mantenimiento de la tabla
// `ejercicio` (año, descripción, fechas, cerrado y activo). El «activo» es el que se propone por
// defecto en todos los puestos; cada puesto puede elegir otro con Archivo → Seleccionar Periodo.
// Solo los administradores dan de alta o modifican (lo impone la RLS). No se borra: se cierra.
// No toca la contabilidad.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GwCheck, GwDate, GwField, GwGroup, GwInput } from '../../components/gw'
import { supabase } from '../../lib/supabase'
import { ejercicioTrabajo, elegirEjercicio, fijarEjercicioActivo, useSesionTrabajo } from '../../lib/sesionTrabajo'
import { useEsAdministrador } from '../archivo/comun'
import { Mensaje } from './comun'
import { fechaEs } from './datos'

interface Ejercicio {
  anio: number
  descripcion: string | null
  fecha_inicio: string
  fecha_fin: string
  cerrado: boolean
  activo: boolean
}

const vacio = (anio: number): Ejercicio => ({
  anio,
  descripcion: `Periodo ${anio}`,
  fecha_inicio: `${anio}-01-01`,
  fecha_fin: `${anio}-12-31`,
  cerrado: false,
  activo: false,
})

export function EjerciciosPage() {
  const admin = useEsAdministrador()
  const navigate = useNavigate()
  useSesionTrabajo() // repinta la marca «en uso» al cambiar de periodo
  const [lista, setLista] = useState<Ejercicio[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [draft, setDraft] = useState<Ejercicio | null>(null)
  const [modo, setModo] = useState<'consulta' | 'alta' | 'edicion'>('consulta')
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null)

  const cargar = useCallback(async (seleccionar?: number) => {
    const { data, error } = await supabase.from('ejercicio').select('anio, descripcion, fecha_inicio, fecha_fin, cerrado, activo').order('anio', { ascending: false })
    if (error) return setMensaje({ texto: error.message, error: true })
    const l = (data ?? []) as Ejercicio[]
    setLista(l)
    const s = l.find((e) => e.anio === (seleccionar ?? ejercicioTrabajo().anio)) ?? l[0] ?? null
    setSel(s?.anio ?? null)
    setDraft(s)
    const act = l.find((e) => e.activo)
    fijarEjercicioActivo(act ? { anio: act.anio, desde: act.fecha_inicio, hasta: act.fecha_fin } : null)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const enUso = ejercicioTrabajo().anio
  const ro = modo === 'consulta'
  const set = (p: Partial<Ejercicio>) => setDraft((d) => (d ? { ...d, ...p } : d))

  function elegir(e: Ejercicio) {
    if (!ro) return
    setSel(e.anio)
    setDraft(e)
    setMensaje(null)
  }

  async function guardar() {
    if (!draft) return
    if (!Number.isInteger(draft.anio) || draft.anio < 1900 || draft.anio > 2999) return setMensaje({ texto: 'El año no es válido.', error: true })
    if (!draft.fecha_inicio || !draft.fecha_fin || draft.fecha_fin < draft.fecha_inicio)
      return setMensaje({ texto: 'La fecha de fin debe ser igual o posterior a la de inicio.', error: true })
    const fila = { descripcion: draft.descripcion, fecha_inicio: draft.fecha_inicio, fecha_fin: draft.fecha_fin, cerrado: draft.cerrado }
    const { error } =
      modo === 'alta' ? await supabase.from('ejercicio').insert({ anio: draft.anio, ...fila }) : await supabase.from('ejercicio').update(fila).eq('anio', draft.anio)
    if (error) return setMensaje({ texto: error.code === '23505' ? `Ya existe el ejercicio ${draft.anio}.` : error.message, error: true })
    if (draft.activo && !lista.find((e) => e.anio === draft.anio)?.activo) {
      const r = await supabase.rpc('fn_ejercicio_activar', { p_anio: draft.anio })
      if (r.error) return setMensaje({ texto: r.error.message, error: true })
    }
    // Si este puesto trabaja con este ejercicio, se actualizan sus fechas.
    if (enUso === draft.anio) elegirEjercicio({ anio: draft.anio, desde: draft.fecha_inicio, hasta: draft.fecha_fin })
    setModo('consulta')
    setMensaje({ texto: `Ejercicio ${draft.anio} guardado.` })
    cargar(draft.anio)
  }

  return (
    <div className="flex w-[640px] max-w-full flex-col gap-1.5 text-[12px]">
      <div className="flex gap-1">
        <button
          type="button"
          className="gw-btn w-[80px]"
          disabled={!admin || !ro}
          onClick={() => {
            const sig = (lista[0]?.anio ?? new Date().getFullYear() - 1) + 1
            setDraft(vacio(sig))
            setSel(null)
            setModo('alta')
            setMensaje(null)
          }}
        >
          Nuevo
        </button>
        <button type="button" className="gw-btn w-[80px]" disabled={!admin || !ro || !draft} onClick={() => setModo('edicion')}>
          Modificar
        </button>
        <button type="button" className="gw-btn w-[80px]" disabled={ro} onClick={guardar}>
          Guardar
        </button>
        <button
          type="button"
          className="gw-btn w-[80px]"
          disabled={ro}
          onClick={() => {
            setModo('consulta')
            setDraft(lista.find((e) => e.anio === sel) ?? lista[0] ?? null)
            setSel((s) => s ?? lista[0]?.anio ?? null)
          }}
        >
          Cancelar
        </button>
        <span className="flex-1" />
        <button
          type="button"
          className="gw-btn"
          disabled={!ro || !draft}
          title="Trabajar en este puesto con el ejercicio elegido (como Archivo → Seleccionar Periodo)"
          onClick={() => draft && elegirEjercicio({ anio: draft.anio, desde: draft.fecha_inicio, hasta: draft.fecha_fin })}
        >
          Usar en este puesto
        </button>
        <button type="button" className="gw-btn w-[80px]" onClick={() => navigate('/')}>
          Salir
        </button>
      </div>
      <div className="h-[190px] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th className="w-[50px]">Año</th>
              <th>Descripción</th>
              <th className="w-[80px]">Inicio</th>
              <th className="w-[80px]">Fin</th>
              <th className="w-[60px]">Estado</th>
              <th className="w-[50px]">Activo</th>
              <th className="w-[80px]">Este puesto</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.anio} className={e.anio === sel ? 'gw-selected' : ''} onClick={() => elegir(e)}>
                <td>{e.anio}</td>
                <td className="truncate">{e.descripcion}</td>
                <td>{fechaEs(e.fecha_inicio)}</td>
                <td>{fechaEs(e.fecha_fin)}</td>
                <td>{e.cerrado ? 'Cerrado' : 'Abierto'}</td>
                <td>{e.activo ? 'Sí' : ''}</td>
                <td>{e.anio === enUso ? 'En uso' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {draft && (
        <GwGroup title={modo === 'alta' ? 'Nuevo ejercicio' : modo === 'edicion' ? 'Modificando' : 'Ejercicio'}>
          <div className="flex flex-wrap items-end gap-2">
            <GwField label="Año">
              <GwInput
                className="w-[60px] text-right"
                value={draft.anio}
                readOnly={modo !== 'alta'}
                onChange={(e) => {
                  const a = Number(e.target.value.replace(/\D/g, '').slice(0, 4))
                  set(a >= 1900 ? { ...vacio(a), descripcion: draft.descripcion?.startsWith('Periodo ') ? `Periodo ${a}` : draft.descripcion } : { anio: a })
                }}
              />
            </GwField>
            <GwField label="Descripción">
              <GwInput className="w-[220px]" value={draft.descripcion ?? ''} readOnly={ro} onChange={(e) => set({ descripcion: e.target.value })} />
            </GwField>
            <GwField label="Fecha inicio">
              <GwDate value={draft.fecha_inicio} readOnly={ro} onChange={(v) => set({ fecha_inicio: v ?? '' })} style={{ width: 100 }} />
            </GwField>
            <GwField label="Fecha fin">
              <GwDate value={draft.fecha_fin} readOnly={ro} onChange={(v) => set({ fecha_fin: v ?? '' })} style={{ width: 100 }} />
            </GwField>
            <div className="flex flex-col gap-1 pb-0.5">
              <GwCheck label="Cerrado" checked={draft.cerrado} disabled={ro} onChange={(v) => set({ cerrado: v })} />
              <GwCheck
                label="Activo (por defecto)"
                checked={draft.activo}
                disabled={ro || lista.find((e) => e.anio === draft.anio)?.activo === true}
                onChange={(v) => set({ activo: v })}
              />
            </div>
          </div>
        </GwGroup>
      )}
      {admin === false && <span className="text-[#444]">Solo los administradores pueden crear o modificar ejercicios.</span>}
      {mensaje && <Mensaje {...mensaje} />}
      <span className="text-[#444]">
        El ejercicio fija las fechas que proponen por defecto los listados y gestores. Un ejercicio no se borra: se marca cerrado. No
        afecta a la contabilidad.
      </span>
    </div>
  )
}
