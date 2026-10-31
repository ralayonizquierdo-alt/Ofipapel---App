// Contabilidad → Empresas de la Contabilidad (Luis, 31/10/2026: «en CONTANET tenemos varias
// contabilidades de otras empresas del grupo Ofipapel»). Cada empresa lleva su propio plan de
// cuentas, sus asientos, su numeración y sus ejercicios. La principal (Ofipapel) es la del ERP:
// solo ella recibe los asientos automáticos. Alta y modificación: super administradores.
// Datos: fn_contab_empresas, fn_contab_guardar_empresa, fn_contab_elegir_empresa
// (migración 20261031_contabilidad_multiempresa).

import { useCallback, useEffect, useState } from 'react'
import { Building2, FilePlus2, Save } from 'lucide-react'
import { GwCheck, GwField, GwGroup, GwInput, GwTextArea } from '../../components/gw'
import { GwOperativa } from '../../components/gw/GwOperativa'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../lib/PermisosContext'
import { fechaEs } from './contabModel'
import { Aviso, Barra, Rejilla } from './ui'

export interface EmpresaContable {
  id: number
  nombre: string
  nombre_corto: string | null
  cif: string | null
  observaciones: string | null
  principal: boolean
  activa: boolean
  elegida: boolean
  cuentas: number
  asientos: number
  ultimo: string | null
}

export async function cargarEmpresas(): Promise<EmpresaContable[]> {
  const { data, error } = await supabase.rpc('fn_contab_empresas')
  if (error) throw new Error(error.message)
  return (data as EmpresaContable[]) ?? []
}

const vacia = { id: null as number | null, nombre: '', nombre_corto: '', cif: '', observaciones: '', activa: true }

export function EmpresasContablesPage({ onCambio }: { onCambio?: () => void }) {
  const { superAdmin } = usePermisos()
  const [lista, setLista] = useState<EmpresaContable[]>([])
  const [ficha, setFicha] = useState(vacia)
  const [copiar, setCopiar] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [ayuda, setAyuda] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setLista(await cargarEmpresas())
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])
  useEffect(() => {
    void cargar()
  }, [cargar])

  const principal = lista.find((e) => e.principal)
  const elegir = (e: EmpresaContable) =>
    setFicha({ id: e.id, nombre: e.nombre, nombre_corto: e.nombre_corto ?? '', cif: e.cif ?? '', observaciones: e.observaciones ?? '', activa: e.activa })

  const guardar = async () => {
    setError(null)
    setOk(null)
    const { error: e } = await supabase.rpc('fn_contab_guardar_empresa', {
      p: { ...ficha, id: ficha.id ?? '' },
      p_copiar_plan_de: ficha.id == null && copiar ? (principal?.id ?? 1) : null,
    })
    if (e) return setError(e.message)
    setOk(ficha.id == null ? `Empresa «${ficha.nombre}» dada de alta.` : 'Cambios guardados.')
    setFicha(vacia)
    await cargar()
    onCambio?.()
  }

  const trabajarCon = async (e: EmpresaContable) => {
    setError(null)
    const { error: err } = await supabase.rpc('fn_contab_elegir_empresa', { p_id: e.id })
    if (err) return setError(err.message)
    setOk(`Ahora trabajas con ${e.nombre_corto || e.nombre}.`)
    await cargar()
    onCambio?.()
  }

  const nueva = ficha.id == null

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <Barra>
        <span className="mb-1 flex items-center gap-1 text-[14px] font-bold text-[#1d3a8a]">
          <Building2 size={18} /> Empresas del grupo con contabilidad
        </span>
        <span className="flex-1" />
        <button type="button" className="gw-btn" onClick={() => setAyuda((a) => !a)}>
          Operativa
        </button>
      </Barra>
      <Aviso error={error} ok={ok} />
      {ayuda && (
        <div className="border border-[var(--gw-border)] bg-white p-2">
          <GwOperativa
            bloques={[
              {
                titulo: 'Empresas de la contabilidad',
                pasos: [
                  'Cada empresa del grupo lleva su contabilidad separada: su Plan de Cuentas, sus asientos con su propia numeración y sus ejercicios (cerrados o abiertos).',
                  'Para trabajar con otra empresa: elígela arriba en «Empresa» (en la barra del ejercicio) o pulsa «Trabajar con esta» en la lista. Todas las pantallas de Contabilidad pasan a esa empresa.',
                  'La empresa con la que trabajas queda guardada para ti: la próxima vez que entres sigues en ella.',
                ],
              },
              {
                titulo: 'Dar de alta una empresa (super administradores)',
                pasos: [
                  'Rellena nombre, nombre corto (el que sale en el selector) y CIF, y pulsa «Dar de alta».',
                  'Si dejas marcado «Copiar el plan de cuentas de Ofipapel», la empresa nueva empieza con las mismas cuentas (sin las subcuentas de clientes, proveedores y acreedores). Si no, empieza vacía.',
                  'Para modificarla, pínchala en la lista, cambia los datos y pulsa «Guardar». Desmarcando «Activa» se da de baja (no se borra nada).',
                ],
              },
              {
                titulo: 'Bueno es saber',
                notas: [
                  'La empresa principal (Ofipapel) es la del ERP: solo ella recibe los asientos automáticos de ventas, facturas, cobros, pagos y caja. En las demás los asientos son manuales (o los que traigamos de CONTANET).',
                  'La conciliación bancaria de una empresa solo casa con sus propios apuntes.',
                ],
              },
            ]}
          />
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-2 max-lg:grid-cols-1">
        <Rejilla alto="calc(100vh - 260px)">
          <table className="gw-grid">
            <thead className="sticky top-0">
              <tr>
                <th className="w-[40px]">Nº</th>
                <th>Empresa</th>
                <th className="w-[100px]">CIF</th>
                <th className="w-[70px] text-right!">Cuentas</th>
                <th className="w-[70px] text-right!">Asientos</th>
                <th className="w-[90px]">Último</th>
                <th className="w-[150px]" />
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr
                  key={e.id}
                  className={`cursor-pointer ${ficha.id === e.id ? 'bg-[#91c9f7]' : e.elegida ? 'bg-[#e8eef8]' : ''} ${e.activa ? '' : 'text-[#888]'}`}
                  onClick={() => elegir(e)}
                >
                  <td>{e.id}</td>
                  <td>
                    <b>{e.nombre_corto || e.nombre}</b>
                    {e.nombre_corto && <span className="text-[#555]"> · {e.nombre}</span>}
                    {e.principal && <span className="ml-1 rounded bg-[#1d3a8a] px-1 text-[11px] text-white">PRINCIPAL (ERP)</span>}
                    {!e.activa && <span className="ml-1 text-[11px] font-bold text-[#c42b1c]">BAJA</span>}
                  </td>
                  <td>{e.cif}</td>
                  <td className="text-right">{e.cuentas}</td>
                  <td className="text-right">{e.asientos}</td>
                  <td>{e.ultimo ? fechaEs(e.ultimo) : ''}</td>
                  <td className="text-center">
                    {e.elegida ? (
                      <b className="text-[#127a12]">✔ Trabajando con esta</b>
                    ) : (
                      e.activa && (
                        <button
                          type="button"
                          className="gw-btn h-[22px]"
                          onClick={(ev) => {
                            ev.stopPropagation()
                            void trabajarCon(e)
                          }}
                        >
                          Trabajar con esta
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Rejilla>
        <GwGroup title={nueva ? 'Alta de empresa' : `Empresa Nº ${ficha.id}`}>
          <div className="flex flex-col gap-1.5">
            {!superAdmin && <div className="text-[12px] text-[#8a5a00]">Solo los super administradores pueden dar de alta o modificar empresas.</div>}
            <GwField label="Nombre (razón social)">
              <GwInput value={ficha.nombre} disabled={!superAdmin} maxLength={120} onChange={(e) => setFicha({ ...ficha, nombre: e.target.value })} />
            </GwField>
            <div className="grid grid-cols-2 gap-1.5">
              <GwField label="Nombre corto">
                <GwInput
                  value={ficha.nombre_corto}
                  disabled={!superAdmin}
                  maxLength={30}
                  onChange={(e) => setFicha({ ...ficha, nombre_corto: e.target.value.toUpperCase() })}
                />
              </GwField>
              <GwField label="CIF">
                <GwInput value={ficha.cif} disabled={!superAdmin} maxLength={15} onChange={(e) => setFicha({ ...ficha, cif: e.target.value.toUpperCase() })} />
              </GwField>
            </div>
            <GwField label="Observaciones">
              <GwTextArea rows={2} value={ficha.observaciones} disabled={!superAdmin} onChange={(e) => setFicha({ ...ficha, observaciones: e.target.value })} />
            </GwField>
            {nueva ? (
              <GwCheck
                label={`Copiar el plan de cuentas de ${principal?.nombre_corto || 'la principal'}`}
                checked={copiar}
                onChange={setCopiar}
                disabled={!superAdmin}
              />
            ) : (
              <GwCheck label="Activa" checked={ficha.activa} onChange={(v) => setFicha({ ...ficha, activa: v })} disabled={!superAdmin} />
            )}
            <div className="flex justify-end gap-2">
              {!nueva && (
                <button type="button" className="gw-btn" onClick={() => setFicha(vacia)}>
                  <FilePlus2 size={14} /> Nueva
                </button>
              )}
              <button type="button" className="gw-btn font-bold" disabled={!superAdmin || !ficha.nombre.trim()} onClick={() => void guardar()}>
                <Save size={14} /> {nueva ? 'Dar de alta' : 'Guardar'}
              </button>
            </div>
          </div>
        </GwGroup>
      </div>
    </div>
  )
}
