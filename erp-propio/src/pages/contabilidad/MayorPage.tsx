import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Download, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwField, GwInput } from '../../components/gw'
import { descargarCsv, eur, eur0, fechaEs, finAnio, inicioAnio, numCsv } from './contabModel'
import { Aviso, Barra, Rango, Rejilla, Vacio } from './ui'

interface FilaMayor {
  cuenta: string
  descripcion: string | null
  asiento_id: number | null
  numero: number | null
  fecha: string | null
  concepto: string
  documento: string | null
  contrapartida: string | null
  debe: number
  haber: number
  saldo: number
}

/** Contabilidad → Mayor / Extracto de Cuenta (con saldo acumulado; admite un prefijo, p. ej. 430). */
export function MayorPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [cuenta, setCuenta] = useState(params.get('cuenta') ?? '')
  const [desde, setDesde] = useState(inicioAnio())
  const [hasta, setHasta] = useState(finAnio())
  const [filas, setFilas] = useState<FilaMayor[]>([])
  const [error, setError] = useState<string | null>(null)
  const [consultada, setConsultada] = useState(false)

  const consultar = useCallback(async () => {
    setError(null)
    if (!/^\d{1,10}$/.test(cuenta)) return setError('Escribe una cuenta o el principio de varias (p. ej. 430 para todos los clientes).')
    const { data, error: e } = await supabase.rpc('fn_contab_mayor', { p_cuenta: cuenta, p_desde: desde, p_hasta: hasta })
    if (e) return setError(e.message)
    setFilas((data ?? []) as FilaMayor[])
    setConsultada(true)
  }, [cuenta, desde, hasta])

  useEffect(() => {
    if (params.get('cuenta')) consultar()
    // Solo al entrar con ?cuenta=
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cuentas = useMemo(() => {
    const m = new Map<string, { descripcion: string | null; debe: number; haber: number; saldo: number }>()
    for (const f of filas) {
      const x = m.get(f.cuenta) ?? { descripcion: f.descripcion, debe: 0, haber: 0, saldo: 0 }
      x.debe += Number(f.debe)
      x.haber += Number(f.haber)
      x.saldo = Number(f.saldo)
      m.set(f.cuenta, x)
    }
    return m
  }, [filas])

  function exportar() {
    descargarCsv(
      `mayor_${cuenta}_${desde}_${hasta}.csv`,
      ['Cuenta', 'Descripción', 'Fecha', 'Asiento', 'Concepto', 'Documento', 'Contrapartida', 'Debe', 'Haber', 'Saldo'],
      filas.map((f) => [f.cuenta, f.descripcion ?? '', fechaEs(f.fecha), f.numero ?? '', f.concepto, f.documento ?? '', f.contrapartida ?? '', numCsv(f.debe), numCsv(f.haber), numCsv(f.saldo)]),
    )
  }

  let anterior = ''
  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <Barra>
        <GwField label="Cuenta (o prefijo)">
          <GwInput
            value={cuenta}
            maxLength={10}
            className="w-[120px] font-mono"
            autoFocus
            onChange={(e) => setCuenta(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && consultar()}
          />
        </GwField>
        <Rango desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
        <button type="button" className="gw-btn" onClick={consultar}>
          <Search size={14} /> Consultar
        </button>
        <button type="button" className="gw-btn" onClick={exportar} disabled={!filas.length}>
          <Download size={14} /> Excel (CSV)
        </button>
        <span className="mb-1 text-[12px] text-[#555]">El saldo anterior suma desde el 1 de enero del ejercicio. Doble clic en un apunte: ver el asiento.</span>
      </Barra>
      <Aviso error={error} />
      <Rejilla alto="calc(100vh - 280px)">
        <table className="gw-grid">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-[85px]">Fecha</th>
              <th className="w-[65px]">Asiento</th>
              <th>Concepto</th>
              <th className="w-[110px]">Documento</th>
              <th className="w-[100px]">Contrapartida</th>
              <th className="w-[100px] text-right!">Debe</th>
              <th className="w-[100px] text-right!">Haber</th>
              <th className="w-[110px] text-right!">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {consultada && filas.length === 0 && <Vacio cols={8} texto="La cuenta no tiene movimientos en el periodo." />}
            {filas.map((f, i) => {
              const cab = f.cuenta !== anterior
              anterior = f.cuenta
              const t = cuentas.get(f.cuenta)
              return [
                cab && (
                  <tr key={`c${f.cuenta}`} className="bg-[#e8eef8] font-bold">
                    <td colSpan={5}>
                      <span className="font-mono">{f.cuenta}</span> {f.descripcion}
                    </td>
                    <td className="text-right">{eur0(t?.debe)}</td>
                    <td className="text-right">{eur0(t?.haber)}</td>
                    <td className="text-right">{eur0(t?.saldo)}</td>
                  </tr>
                ),
                <tr
                  key={i}
                  className={f.asiento_id ? '' : 'italic text-[#555]'}
                  onDoubleClick={() => f.fecha && navigate(`/contabilidad/diario?desde=${f.fecha}&hasta=${f.fecha}`)}
                >
                  <td>{fechaEs(f.fecha)}</td>
                  <td className="text-right">{f.numero ?? ''}</td>
                  <td className="truncate" title={f.concepto}>
                    {f.concepto}
                  </td>
                  <td className="truncate">{f.documento}</td>
                  <td className="font-mono">{f.contrapartida}</td>
                  <td className="text-right">{eur(f.debe)}</td>
                  <td className="text-right">{eur(f.haber)}</td>
                  <td className={`text-right ${Number(f.saldo) < 0 ? 'text-[#c42b1c]' : ''}`}>{eur0(f.saldo)}</td>
                </tr>,
              ]
            })}
          </tbody>
        </table>
      </Rejilla>
    </div>
  )
}
