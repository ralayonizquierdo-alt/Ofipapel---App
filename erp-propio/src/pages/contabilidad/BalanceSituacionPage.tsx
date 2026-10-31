// Contabilidad → Balance de Situación (Luis, 31/10/2026): estructura del PGC PYMES (Activo /
// Patrimonio neto y Pasivo), a la fecha elegida y al cierre del año anterior. Cada subcuenta va a
// su epígrafe por su número; lo que no encaja sale en «Cuentas sin epígrafe» para revisarlo.
// Mientras el año no esté cerrado, los gastos e ingresos (grupos 6 y 7) van a «Resultado del
// ejercicio». Datos: fn_contab_balance_situacion (migración 20261031_contabilidad_ejercicios).

import { useCallback, useEffect, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { GwDate, GwField } from '../../components/gw'
import { GwOperativa } from '../../components/gw/GwOperativa'
import { supabase } from '../../lib/supabase'
import { descargarCsv, eur0, ejercicioContable, finAnio, numCsv } from './contabModel'
import { Aviso, Barra, Rejilla } from './ui'

interface Linea {
  orden: number
  nivel: number
  codigo: string
  titulo: string
  lado: 'A' | 'P'
  importe: number
  importe_anterior: number
}

export function BalanceSituacionPage() {
  const [hasta, setHasta] = useState(finAnio())
  const [lineas, setLineas] = useState<Linea[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ayuda, setAyuda] = useState(false)
  const anio = Number(hasta.slice(0, 4)) || ejercicioContable()

  const cargar = useCallback(async () => {
    setError(null)
    const { data, error: e } = await supabase.rpc('fn_contab_balance_situacion', { p_hasta: hasta })
    if (e) return setError(e.message)
    setLineas((data as Linea[]) ?? [])
  }, [hasta])
  useEffect(() => {
    void cargar()
  }, [cargar])

  const total = (c: string) => lineas.find((l) => l.codigo === c)
  const ta = total('TA')
  const tp = total('TP')
  const sin = total('SIN')
  const cuadra = ta && tp && Math.abs(Number(ta.importe) - Number(tp.importe)) < 0.005
  const visibles = lineas.filter((l) => l.codigo !== 'SIN' && (l.nivel <= 1 || Number(l.importe) !== 0 || Number(l.importe_anterior) !== 0))
  const activo = visibles.filter((l) => l.lado === 'A')
  const pasivo = visibles.filter((l) => l.lado === 'P')

  const tabla = (filas: Linea[], titulo: string) => (
    <table className="gw-grid">
      <thead className="sticky top-0">
        <tr>
          <th>{titulo}</th>
          <th className="w-[120px] text-right!">{anio}</th>
          <th className="w-[120px] text-right!">{anio - 1}</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((l) => (
          <tr
            key={l.codigo}
            className={l.nivel === 0 ? 'bg-[#1d3a8a] font-bold text-white' : l.nivel === 1 ? 'bg-[#e8eef8] font-bold' : l.nivel === 2 ? 'font-bold' : ''}
          >
            <td style={{ paddingLeft: 6 + Math.max(l.nivel - 1, 0) * 14 }}>{l.titulo}</td>
            <td className="text-right">{eur0(l.importe)}</td>
            <td className="text-right">{eur0(l.importe_anterior)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <Barra>
        <GwField label="A fecha">
          <GwDate value={hasta} onChange={(v) => v && setHasta(v)} className="w-[100px]" />
        </GwField>
        <button type="button" className="gw-btn" onClick={() => void cargar()}>
          <RefreshCw size={14} /> Actualizar
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={!lineas.length}
          onClick={() =>
            descargarCsv(
              `balance_de_situacion_${hasta}.csv`,
              ['Epígrafe', String(anio), String(anio - 1)],
              lineas.map((l) => [l.titulo, numCsv(l.importe), numCsv(l.importe_anterior)]),
            )
          }
        >
          <Download size={14} /> Excel (CSV)
        </button>
        <button type="button" className="gw-btn" onClick={() => window.print()}>
          🖨 Imprimir / PDF
        </button>
        <button type="button" className="gw-btn" onClick={() => setAyuda((a) => !a)}>
          Operativa
        </button>
        <span className={`mb-1 ml-auto text-[14px] font-bold ${cuadra ? 'text-[#127a12]' : 'text-[#c42b1c]'}`}>
          {lineas.length ? (cuadra ? '✔ Cuadra: Activo = Patrimonio neto + Pasivo' : `✖ No cuadra: diferencia ${eur0(Number(ta?.importe ?? 0) - Number(tp?.importe ?? 0))}`) : ''}
        </span>
      </Barra>
      <Aviso error={error} />
      {ayuda && (
        <div className="border border-[var(--gw-border)] bg-white p-2">
          <GwOperativa
            bloques={[
              {
                titulo: 'Balance de situación',
                pasos: [
                  'Elige la fecha (por defecto, el 31/12 del ejercicio elegido arriba) y pulsa Actualizar.',
                  'Izquierda: lo que tiene la empresa (Activo). Derecha: con qué se financia (Patrimonio neto y Pasivo). Las dos columnas de números: este año y el anterior.',
                  'Arriba a la derecha dice si cuadra (Activo = Patrimonio neto + Pasivo).',
                ],
              },
              {
                titulo: 'Bueno es saber',
                notas: [
                  'Formato del Plan General Contable de PYMES. Cada subcuenta va a su epígrafe por su número.',
                  'Si el año no está cerrado, los gastos e ingresos se ven como «Resultado del ejercicio».',
                  '«Cuentas sin epígrafe»: si sale con importe, hay subcuentas con un número que no corresponde a ningún epígrafe; hay que revisarlas en el Plan de Cuentas.',
                ],
              },
            ]}
          />
        </div>
      )}
      {sin && Number(sin.importe) !== 0 && <div className="font-bold text-[#c42b1c]">Cuentas sin epígrafe (revisar): {eur0(sin.importe)}</div>}
      <div className="informe-impresion grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <div className="hidden text-[12pt] font-bold print:col-span-2 print:block">Balance de situación a {hasta.split('-').reverse().join('/')}</div>
        <Rejilla alto="calc(100vh - 330px)">{tabla(activo, 'ACTIVO')}</Rejilla>
        <Rejilla alto="calc(100vh - 330px)">{tabla(pasivo, 'PATRIMONIO NETO Y PASIVO')}</Rejilla>
      </div>
    </div>
  )
}
