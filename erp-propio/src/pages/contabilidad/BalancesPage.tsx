import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwField, GwSelect } from '../../components/gw'
import { descargarCsv, eur, eur0, finAnio, inicioAnio, numCsv, r2 } from './contabModel'
import { Aviso, Barra, Rango, Rejilla, Vacio } from './ui'

interface FilaSS {
  cuenta: string
  descripcion: string | null
  debe: number
  haber: number
  saldo_deudor: number
  saldo_acreedor: number
}

async function sumasSaldos(desde: string, hasta: string, nivel: number) {
  const { data, error } = await supabase.rpc('fn_contab_sumas_saldos', { p_desde: desde, p_hasta: hasta, p_nivel: nivel })
  if (error) throw new Error(error.message)
  return (data ?? []) as FilaSS[]
}

/** Contabilidad → Sumas y Saldos (agrupado por número de dígitos). */
export function SumasSaldosPage() {
  const navigate = useNavigate()
  const [desde, setDesde] = useState(inicioAnio())
  const [hasta, setHasta] = useState(finAnio())
  const [nivel, setNivel] = useState(3)
  const [filas, setFilas] = useState<FilaSS[]>([])
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      setFilas(await sumasSaldos(desde, hasta, nivel))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [desde, hasta, nivel])

  useEffect(() => {
    cargar()
  }, [cargar])

  const t = filas.reduce(
    (s, f) => ({ d: s.d + Number(f.debe), h: s.h + Number(f.haber), sd: s.sd + Number(f.saldo_deudor), sa: s.sa + Number(f.saldo_acreedor) }),
    { d: 0, h: 0, sd: 0, sa: 0 },
  )

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <Barra>
        <Rango desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
        <GwField label="Nivel (dígitos)">
          <GwSelect value={nivel} onChange={(e) => setNivel(Number(e.target.value))} className="w-[160px]">
            <option value={1}>1 · Grupos</option>
            <option value={2}>2 · Subgrupos</option>
            <option value={3}>3 · Cuentas</option>
            <option value={4}>4 · Cuentas</option>
            <option value={10}>Subcuentas</option>
          </GwSelect>
        </GwField>
        <button type="button" className="gw-btn" onClick={cargar}>
          <RefreshCw size={14} /> Actualizar
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={!filas.length}
          onClick={() =>
            descargarCsv(
              `sumas_y_saldos_${desde}_${hasta}.csv`,
              ['Cuenta', 'Descripción', 'Sumas Debe', 'Sumas Haber', 'Saldo deudor', 'Saldo acreedor'],
              filas.map((f) => [f.cuenta, f.descripcion ?? '', numCsv(f.debe), numCsv(f.haber), numCsv(f.saldo_deudor), numCsv(f.saldo_acreedor)]),
            )
          }
        >
          <Download size={14} /> Excel (CSV)
        </button>
      </Barra>
      <Aviso error={error} />
      <Rejilla alto="calc(100vh - 290px)">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th className="w-[110px]">Cuenta</th>
              <th>Descripción</th>
              <th className="w-[120px] text-right!">Sumas Debe</th>
              <th className="w-[120px] text-right!">Sumas Haber</th>
              <th className="w-[120px] text-right!">Saldo deudor</th>
              <th className="w-[120px] text-right!">Saldo acreedor</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <Vacio cols={6} />}
            {filas.map((f) => (
              <tr key={f.cuenta} onDoubleClick={() => navigate(`/contabilidad/mayor?cuenta=${f.cuenta}`)} title="Doble clic: Mayor">
                <td className="font-mono">{f.cuenta}</td>
                <td>{f.descripcion ?? '(sin descripción en el Plan de Cuentas)'}</td>
                <td className="text-right">{eur(f.debe)}</td>
                <td className="text-right">{eur(f.haber)}</td>
                <td className="text-right">{eur(f.saldo_deudor)}</td>
                <td className="text-right">{eur(f.saldo_acreedor)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0">
            <tr className="bg-[#f0f0f0] font-bold">
              <td colSpan={2} className="text-right">
                Totales {Math.abs(t.d - t.h) > 0.005 ? '(¡no cuadran!)' : ''}
              </td>
              <td className="text-right">{eur0(t.d)}</td>
              <td className="text-right">{eur0(t.h)}</td>
              <td className="text-right">{eur0(t.sd)}</td>
              <td className="text-right">{eur0(t.sa)}</td>
            </tr>
          </tfoot>
        </table>
      </Rejilla>
    </div>
  )
}

/** Contabilidad → Pérdidas y Ganancias (resumen de los grupos 6 y 7). */
export function PerdidasGananciasPage() {
  const [desde, setDesde] = useState(inicioAnio())
  const [hasta, setHasta] = useState(finAnio())
  const [n2, setN2] = useState<FilaSS[]>([])
  const [n3, setN3] = useState<FilaSS[]>([])
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const [a, b] = await Promise.all([sumasSaldos(desde, hasta, 2), sumasSaldos(desde, hasta, 3)])
      setN2(a.filter((f) => /^[67]/.test(f.cuenta)))
      setN3(b.filter((f) => /^[67]/.test(f.cuenta)))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [desde, hasta])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Gastos en positivo (Debe - Haber), ingresos en positivo (Haber - Debe)
  const imp = (f: FilaSS) => (f.cuenta.startsWith('6') ? r2(Number(f.debe) - Number(f.haber)) : r2(Number(f.haber) - Number(f.debe)))
  const gastos = useMemo(() => r2(n2.filter((f) => f.cuenta.startsWith('6')).reduce((s, f) => s + imp(f), 0)), [n2])
  const ingresos = useMemo(() => r2(n2.filter((f) => f.cuenta.startsWith('7')).reduce((s, f) => s + imp(f), 0)), [n2])
  const resultado = r2(ingresos - gastos)

  const bloque = (g: '6' | '7') => (
    <table className="gw-grid">
      <thead className="sticky top-0">
        <tr>
          <th className="w-[80px]">Cuenta</th>
          <th>{g === '6' ? 'Gastos' : 'Ingresos'}</th>
          <th className="w-[120px] text-right!">Importe</th>
        </tr>
      </thead>
      <tbody>
        {n2.filter((f) => f.cuenta.startsWith(g)).length === 0 && <Vacio cols={3} />}
        {n2
          .filter((f) => f.cuenta.startsWith(g))
          .flatMap((s) => [
            <tr key={s.cuenta} className="bg-[#e8eef8] font-bold">
              <td className="font-mono">{s.cuenta}</td>
              <td>{s.descripcion}</td>
              <td className="text-right">{eur0(imp(s))}</td>
            </tr>,
            ...n3
              .filter((c) => c.cuenta.startsWith(s.cuenta))
              .map((c) => (
                <tr key={c.cuenta}>
                  <td className="pl-4! font-mono">{c.cuenta}</td>
                  <td>{c.descripcion}</td>
                  <td className="text-right">{eur0(imp(c))}</td>
                </tr>
              )),
          ])}
      </tbody>
      <tfoot>
        <tr className="font-bold">
          <td colSpan={2} className="text-right">
            Total {g === '6' ? 'gastos' : 'ingresos'}
          </td>
          <td className="text-right">{eur0(g === '6' ? gastos : ingresos)}</td>
        </tr>
      </tfoot>
    </table>
  )

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <Barra>
        <Rango desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
        <button type="button" className="gw-btn" onClick={cargar}>
          <RefreshCw size={14} /> Actualizar
        </button>
        <button
          type="button"
          className="gw-btn"
          onClick={() =>
            descargarCsv(
              `perdidas_y_ganancias_${desde}_${hasta}.csv`,
              ['Cuenta', 'Descripción', 'Importe'],
              [...n2, ...n3]
                .sort((a, b) => a.cuenta.localeCompare(b.cuenta))
                .map((f) => [f.cuenta, f.descripcion ?? '', numCsv(imp(f))])
                .concat([['', 'Total ingresos', numCsv(ingresos)], ['', 'Total gastos', numCsv(gastos)], ['', 'Resultado', numCsv(resultado)]]),
            )
          }
        >
          <Download size={14} /> Excel (CSV)
        </button>
        <span className={`mb-1 ml-auto text-[15px] font-bold ${resultado < 0 ? 'text-[#c42b1c]' : 'text-[#127a12]'}`}>
          Resultado ({resultado < 0 ? 'pérdidas' : 'beneficio'}): {eur0(resultado)}
        </span>
      </Barra>
      <Aviso error={error} />
      <p className="text-[12px] text-[#555]">
        Resumen de los asientos correctos del periodo. Sin regularización de existencias ni amortizaciones (las pone la gestoría al cierre).
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <Rejilla alto="calc(100vh - 320px)">{bloque('7')}</Rejilla>
        <Rejilla alto="calc(100vh - 320px)">{bloque('6')}</Rejilla>
      </div>
    </div>
  )
}
