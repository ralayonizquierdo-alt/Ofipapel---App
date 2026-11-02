// Contabilidad → Resultados por Tienda (Luis, 01/11/2026: contabilidad por tienda). Ingresos (grupo 7) y
// gastos (grupo 6) de cada tienda por cuenta de 3 dígitos, con el resultado de cada una. La tienda es la
// del documento que originó el asiento (ticket, factura, cobro…) o la elegida en el asiento manual; lo
// que no tiene tienda (gastos generales) sale en «Sin tienda». Datos: fn_contab_resultado_tiendas
// (migración 20261101_contabilidad_por_tienda).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { descargarCsv, eur0, finAnio, inicioAnio, numCsv, r2 } from './contabModel'
import { Aviso, Barra, Rango, Rejilla, Vacio } from './ui'

interface Fila {
  tienda: string
  tienda_nombre: string | null
  cuenta: string
  descripcion: string | null
  importe: number
}

export function ResultadosTiendasPage() {
  const [desde, setDesde] = useState(inicioAnio())
  const [hasta, setHasta] = useState(finAnio())
  const [filas, setFilas] = useState<Fila[]>([])
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    const { data, error: e } = await supabase.rpc('fn_contab_resultado_tiendas', { p_desde: desde, p_hasta: hasta })
    if (e) return setError(e.message)
    setFilas((data ?? []) as Fila[])
  }, [desde, hasta])
  useEffect(() => {
    void cargar()
  }, [cargar])

  // Columnas: tiendas con movimiento (las sin tienda al final); filas: cuentas de 3 dígitos.
  const tiendas = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of filas) m.set(f.tienda, f.tienda ? `${f.tienda}${f.tienda_nombre ? ` ${f.tienda_nombre}` : ''}` : 'Sin tienda')
    return [...m.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
  }, [filas])
  const cuentas = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of filas) m.set(f.cuenta, f.descripcion ?? '')
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filas])
  const valor = (cuenta: string, tienda: string) => {
    const f = filas.find((x) => x.cuenta === cuenta && x.tienda === tienda)
    if (!f) return 0
    // Ingresos en positivo (Haber − Debe), gastos en positivo (Debe − Haber).
    return cuenta.startsWith('6') ? -Number(f.importe) : Number(f.importe)
  }
  const total = (grupo: '6' | '7', tienda: string | null) =>
    r2(
      cuentas
        .filter(([c]) => c.startsWith(grupo))
        .reduce((s, [c]) => s + (tienda == null ? tiendas.reduce((t, [k]) => t + valor(c, k), 0) : valor(c, tienda)), 0),
    )
  const resultado = (tienda: string | null) => r2(total('7', tienda) - total('6', tienda))

  const excel = () =>
    descargarCsv(
      `resultados_por_tienda_${desde}_${hasta}.csv`,
      ['Cuenta', 'Descripción', ...tiendas.map(([, t]) => t), 'Total'],
      [
        ...cuentas.map(([c, d]) => [c, d, ...tiendas.map(([k]) => numCsv(valor(c, k))), numCsv(tiendas.reduce((s, [k]) => s + valor(c, k), 0))]),
        ['', 'Total ingresos', ...tiendas.map(([k]) => numCsv(total('7', k))), numCsv(total('7', null))],
        ['', 'Total gastos', ...tiendas.map(([k]) => numCsv(total('6', k))), numCsv(total('6', null))],
        ['', 'Resultado', ...tiendas.map(([k]) => numCsv(resultado(k))), numCsv(resultado(null))],
      ],
    )

  const bloque = (grupo: '6' | '7', titulo: string) => (
    <>
      <tr className="bg-[#e8eef8] font-bold">
        <td colSpan={2 + tiendas.length + 1}>{titulo}</td>
      </tr>
      {cuentas
        .filter(([c]) => c.startsWith(grupo))
        .map(([c, d]) => (
          <tr key={c}>
            <td className="font-mono">{c}</td>
            <td className="truncate">{d}</td>
            {tiendas.map(([k]) => (
              <td key={k} className="text-right">
                {valor(c, k) ? eur0(valor(c, k)) : ''}
              </td>
            ))}
            <td className="text-right font-bold">{eur0(tiendas.reduce((s, [k]) => s + valor(c, k), 0))}</td>
          </tr>
        ))}
      <tr className="font-bold">
        <td colSpan={2}>Total {titulo.toLowerCase()}</td>
        {tiendas.map(([k]) => (
          <td key={k} className="text-right">
            {eur0(total(grupo, k))}
          </td>
        ))}
        <td className="text-right">{eur0(total(grupo, null))}</td>
      </tr>
    </>
  )

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <Barra>
        <Rango desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
        <button type="button" className="gw-btn" onClick={() => void cargar()}>
          <RefreshCw size={14} /> Actualizar
        </button>
        <button type="button" className="gw-btn" disabled={!filas.length} onClick={excel}>
          <Download size={14} /> Excel (CSV)
        </button>
        <button type="button" className="gw-btn" onClick={() => window.print()}>
          🖨 Imprimir / PDF
        </button>
      </Barra>
      <Aviso error={error} />
      <div className="informe-impresion">
        <div className="hidden text-[12pt] font-bold print:block">
          Resultados por tienda · del {desde.split('-').reverse().join('/')} al {hasta.split('-').reverse().join('/')}
        </div>
        <Rejilla alto="calc(100vh - 300px)">
          <table className="gw-grid">
            <thead className="sticky top-0">
              <tr>
                <th className="w-[60px]">Cuenta</th>
                <th>Descripción</th>
                {tiendas.map(([k, t]) => (
                  <th key={k} className="w-[110px] text-right!" title={t}>
                    {k || 'Sin tienda'}
                  </th>
                ))}
                <th className="w-[110px] text-right!">Total</th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && <Vacio cols={3} texto="Sin ingresos ni gastos en el periodo." />}
              {filas.length > 0 && bloque('7', 'Ingresos')}
              {filas.length > 0 && bloque('6', 'Gastos')}
              {filas.length > 0 && (
                <tr className="bg-[#1d3a8a] font-bold text-white">
                  <td colSpan={2}>RESULTADO</td>
                  {tiendas.map(([k]) => (
                    <td key={k} className="text-right">
                      {eur0(resultado(k))}
                    </td>
                  ))}
                  <td className="text-right">{eur0(resultado(null))}</td>
                </tr>
              )}
            </tbody>
          </table>
        </Rejilla>
      </div>
    </div>
  )
}
