// Barra del ejercicio contable, arriba de todas las pantallas de Contabilidad (Luis, 31/10/2026,
// «como CONTANET»): se elige el año y todas las pantallas trabajan con él. Un ejercicio cerrado es
// solo consulta (🔒): la base de datos no deja crear, modificar ni anular asientos de ese año.
// Los super administradores lo cierran (regularización, cierre y apertura del año siguiente, con
// simulación antes) o lo reabren con motivo. Funciones: fn_contab_ejercicios,
// fn_contab_cerrar_ejercicio, fn_contab_reabrir_ejercicio (migración 20261031_contabilidad_ejercicios).

import { useCallback, useEffect, useState } from 'react'
import { GwOperativa } from '../../components/gw/GwOperativa'
import { GwWindow } from '../../components/gw'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../lib/PermisosContext'
import { eur0, fechaEs } from './contabModel'
import { cargarEmpresas, type EmpresaContable } from './EmpresasContablesPage'

export interface EjercicioInfo {
  anio: number
  cerrado: boolean
  cerrado_en: string | null
  cerrado_por: string | null
  reabierto_en: string | null
  asientos: number
  errores: number
}

interface Simulacion {
  resultado: number
  cuentas_regularizadas: number
  cuentas_cierre: number
  asientos_con_error: number
}

export function EjercicioBar({ anio, onAnio, onEmpresa }: { anio: number; onAnio: (a: number) => void; onEmpresa: () => void }) {
  const { superAdmin } = usePermisos()
  const [empresas, setEmpresas] = useState<EmpresaContable[]>([])
  const [lista, setLista] = useState<EjercicioInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cerrar, setCerrar] = useState<Simulacion | null>(null)
  const [reabrir, setReabrir] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [ayuda, setAyuda] = useState(false)

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('fn_contab_ejercicios')
    if (e) return setError(e.message)
    setLista((data as EjercicioInfo[]) ?? [])
  }, [])
  useEffect(() => {
    void cargar()
    cargarEmpresas()
      .then(setEmpresas)
      .catch((e: Error) => setError(e.message))
  }, [cargar])

  const empresa = empresas.find((e) => e.elegida)
  const cambiarEmpresa = async (id: number) => {
    setError(null)
    const { error: e } = await supabase.rpc('fn_contab_elegir_empresa', { p_id: id })
    if (e) return setError(e.message)
    onEmpresa()
  }

  const ej = lista.find((e) => e.anio === anio)
  const anios = lista.some((e) => e.anio === anio) ? lista : [{ anio, cerrado: false } as EjercicioInfo, ...lista]

  const simular = async () => {
    setError(null)
    const { data, error: e } = await supabase.rpc('fn_contab_cerrar_ejercicio', { p_anio: anio, p_simular: true })
    if (e) return setError(e.message)
    setCerrar(data as Simulacion)
  }
  const confirmarCierre = async () => {
    setTrabajando(true)
    const { error: e } = await supabase.rpc('fn_contab_cerrar_ejercicio', { p_anio: anio, p_simular: false })
    setTrabajando(false)
    if (e) return setError(e.message)
    setCerrar(null)
    await cargar()
    onAnio(anio) // vuelve a cargar las pantallas
  }
  const confirmarReapertura = async () => {
    setTrabajando(true)
    const { error: e } = await supabase.rpc('fn_contab_reabrir_ejercicio', { p_anio: anio, p_motivo: motivo })
    setTrabajando(false)
    if (e) return setError(e.message)
    setReabrir(false)
    setMotivo('')
    await cargar()
    onAnio(anio)
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`flex flex-wrap items-center gap-2 border px-2 py-1 text-[13px] ${ej?.cerrado ? 'border-[#c9a400] bg-[#fff6d5]' : 'border-[#c9d7ee] bg-[#eef3fb]'}`}
      >
        <b className="text-[#1d3a8a]">Empresa</b>
        <select
          className="h-[24px] max-w-[260px] border border-[var(--gw-border)] bg-white px-1 text-[14px] font-bold text-[#1d3a8a]"
          value={empresa?.id ?? ''}
          onChange={(e) => void cambiarEmpresa(Number(e.target.value))}
          title="Empresa del grupo con la que trabajan todas las pantallas de Contabilidad"
        >
          {empresas
            .filter((e) => e.activa || e.elegida)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.id} · {e.nombre_corto || e.nombre}
              </option>
            ))}
        </select>
        <b className="ml-2 text-[#1d3a8a]">Ejercicio</b>
        <select
          className="h-[24px] border border-[var(--gw-border)] bg-white px-1 text-[14px] font-bold"
          value={anio}
          onChange={(e) => onAnio(Number(e.target.value))}
          title="Año contable con el que trabajan todas las pantallas de Contabilidad"
        >
          {anios.map((e) => (
            <option key={e.anio} value={e.anio}>
              {e.anio} {e.cerrado ? '🔒' : ''}
            </option>
          ))}
        </select>
        {ej?.cerrado ? (
          <span className="font-bold text-[#8a5a00]">
            🔒 CERRADO — solo consulta{ej.cerrado_en ? ` (el ${fechaEs(ej.cerrado_en.slice(0, 10))}${ej.cerrado_por ? `, Nº ${ej.cerrado_por}` : ''})` : ''}
          </span>
        ) : (
          <span className="text-[#127a12]">
            Abierto · {ej?.asientos ?? 0} asientos{ej?.errores ? <b className="text-[#c42b1c]"> · {ej.errores} con error</b> : ''}
          </span>
        )}
        <span className="flex-1" />
        {superAdmin && !ej?.cerrado && (
          <button
            type="button"
            className="gw-btn h-[24px]"
            onClick={() => void simular()}
            title="Regularización, cierre y apertura del año siguiente (solo super administradores)"
          >
            🔒 Cerrar ejercicio…
          </button>
        )}
        {superAdmin && ej?.cerrado && (
          <button type="button" className="gw-btn h-[24px]" onClick={() => setReabrir(true)} title="Solo super administradores; queda en la auditoría">
            🔓 Reabrir…
          </button>
        )}
        <button type="button" className="gw-btn h-[24px]" onClick={() => setAyuda((a) => !a)}>
          Operativa
        </button>
      </div>
      {error && <div className="text-[13px] font-bold text-[#c42b1c]">{error}</div>}
      {ayuda && (
        <div className="border border-[var(--gw-border)] bg-white p-2">
          <GwOperativa
            bloques={[
              {
                titulo: 'Empresa y ejercicio',
                pasos: [
                  'En «Empresa» eliges la empresa del grupo con la que trabajas (Ofipapel u otra): todas las pantallas de Contabilidad pasan a esa empresa. Se dan de alta en Contabilidad → Empresas de la Contabilidad.',
                  'Arriba a la izquierda eliges el año: Diario, Mayor, balances, IGIC… trabajan con él (puedes cambiar las fechas en cada pantalla).',
                  'Un año con 🔒 está CERRADO: solo consulta. No se pueden crear, modificar ni anular asientos de ese año.',
                ],
              },
              {
                titulo: 'Cerrar el ejercicio (super administradores)',
                pasos: [
                  'Antes, que no queden asientos con error (Contabilidad → Asientos Pendientes / con Errores).',
                  'Pulsa «🔒 Cerrar ejercicio…»: primero sale una simulación con el resultado del año y cuántas cuentas se cierran.',
                  'Al confirmar se hacen tres asientos: Regularización (grupos 6 y 7 contra la 129), Cierre (31/12) y Apertura del año siguiente (1/1), y el año queda cerrado.',
                ],
              },
              {
                titulo: 'Reabrir',
                notas: [
                  'Solo super administradores, escribiendo el motivo: se anulan los tres asientos del cierre y el año vuelve a estar abierto. Queda en la auditoría.',
                  'Si el año siguiente también está cerrado, hay que reabrir primero ese.',
                ],
              },
            ]}
          />
        </div>
      )}

      {cerrar && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-16" onKeyDown={(e) => e.key === 'Escape' && setCerrar(null)}>
          <GwWindow title={`Cerrar el ejercicio ${anio}`} onClose={() => setCerrar(null)} className="w-[560px] max-w-[95vw]">
            <div className="flex flex-col gap-2 text-[14px]">
              <div className="font-bold text-[#1d3a8a]">Simulación (todavía no se ha hecho nada):</div>
              <div>
                Resultado del ejercicio:{' '}
                <b className={cerrar.resultado < 0 ? 'text-[#c42b1c]' : 'text-[#127a12]'}>
                  {eur0(cerrar.resultado)} € ({cerrar.resultado < 0 ? 'pérdidas' : 'beneficio'})
                </b>
              </div>
              <div>Cuentas de gastos e ingresos que se regularizan contra la 129: {cerrar.cuentas_regularizadas}</div>
              <div>
                Cuentas que se cierran el 31/12 y se abren el 01/01/{anio + 1}: {cerrar.cuentas_cierre}
              </div>
              {cerrar.asientos_con_error > 0 && (
                <div className="font-bold text-[#c42b1c]">
                  Hay {cerrar.asientos_con_error} asiento(s) con error: corrígelos antes (Asientos Pendientes / con Errores).
                </div>
              )}
              <div className="text-[12px] text-[#555]">
                Al cerrar, el {anio} queda en solo consulta. Si hiciera falta, un super administrador puede reabrirlo.
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="gw-btn" onClick={() => setCerrar(null)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="gw-btn font-bold"
                  disabled={trabajando || cerrar.asientos_con_error > 0}
                  onClick={() => void confirmarCierre()}
                >
                  {trabajando ? 'Cerrando…' : `🔒 Cerrar el ${anio}`}
                </button>
              </div>
            </div>
          </GwWindow>
        </div>
      )}

      {reabrir && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-16" onKeyDown={(e) => e.key === 'Escape' && setReabrir(false)}>
          <GwWindow title={`Reabrir el ejercicio ${anio}`} onClose={() => setReabrir(false)} className="w-[520px] max-w-[95vw]">
            <div className="flex flex-col gap-2 text-[14px]">
              <div>Se anularán los asientos de regularización, cierre y apertura, y el {anio} volverá a estar abierto.</div>
              <label className="flex flex-col">
                <span className="gw-label">Motivo (obligatorio)</span>
                <input className="gw-input h-[26px]" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" className="gw-btn" onClick={() => setReabrir(false)}>
                  Cancelar
                </button>
                <button type="button" className="gw-btn font-bold" disabled={trabajando || !motivo.trim()} onClick={() => void confirmarReapertura()}>
                  {trabajando ? 'Reabriendo…' : '🔓 Reabrir'}
                </button>
              </div>
            </div>
          </GwWindow>
        </div>
      )}
    </div>
  )
}
