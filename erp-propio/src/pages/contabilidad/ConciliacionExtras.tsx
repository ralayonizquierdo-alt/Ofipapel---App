// Conciliación bancaria, fase 3 (Luis, 01/11/2026):
// · PartidasPendientes: informe por banco y antigüedad (lo que está en el banco y no en la contabilidad,
//   y al revés), con Excel e impresión. Datos: fn_concilia_pendientes.
// · ImportarHojaBanco: extractos en Excel (.xlsx) o CSV para los bancos o meses que no den Norma 43.
//   Se elige la cuenta, se dice qué columna es cada cosa (casi siempre lo adivina) y se importan con la
//   misma protección contra repetidos que el Norma 43 (huella).

import { useEffect, useMemo, useState } from 'react'
import { FileDown, Printer, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwDate, GwField, GwSelect, GwWindow } from '../../components/gw'
import { crearXlsx, descargar, leerHoja, type Tabla } from '../../lib/hojaCalculo'
import { eur0, fechaEs, isoDe } from './contabModel'
import { Aviso, Vacio } from './ui'
import { fechaBanco, importeBanco } from './extractoHoja'

interface Banco {
  id: number
  nombre: string
  cuenta_contable: string
  entidad: string
  oficina: string
  numero_cuenta: string
  iban?: string | null
}

// ------------------------------------------------------------------ Partidas pendientes

interface Pendiente {
  lado: 'banco' | 'contabilidad'
  fecha: string
  concepto: string | null
  documento: string | null
  importe: number
  dias: number
  referencia: string | null
}

const TRAMOS = [
  { hasta: 7, texto: 'Hasta 7 días' },
  { hasta: 30, texto: '8 a 30 días' },
  { hasta: 90, texto: '31 a 90 días' },
  { hasta: Infinity, texto: 'Más de 90 días' },
]
const tramo = (d: number) => TRAMOS.findIndex((t) => d <= t.hasta)

export function PartidasPendientes({ bancos, bancoInicial, onCerrar }: { bancos: Banco[]; bancoInicial: number | null; onCerrar: () => void }) {
  const [bancoId, setBancoId] = useState<number | null>(bancoInicial)
  const [hasta, setHasta] = useState(isoDe(new Date()))
  const [filas, setFilas] = useState<Pendiente[]>([])
  const [error, setError] = useState<string | null>(null)
  const banco = bancos.find((b) => b.id === bancoId)

  useEffect(() => {
    if (!bancoId) return
    supabase.rpc('fn_concilia_pendientes', { p_banco: bancoId, p_hasta: hasta }).then(({ data, error: e }) => {
      if (e) return setError(e.message)
      setError(null)
      setFilas((data ?? []) as Pendiente[])
    })
  }, [bancoId, hasta])

  const resumen = useMemo(
    () =>
      (['banco', 'contabilidad'] as const).map((lado) => {
        const l = filas.filter((f) => f.lado === lado)
        return {
          lado,
          n: l.length,
          total: l.reduce((s, f) => s + Number(f.importe), 0),
          tramos: TRAMOS.map((_, i) => l.filter((f) => tramo(f.dias) === i).reduce((s, f) => s + Number(f.importe), 0)),
        }
      }),
    [filas],
  )

  const excel = async () => {
    const cab = ['Lado', 'Fecha', 'Días', 'Concepto', 'Documento', 'Importe', 'Propuesta / asiento']
    const datos = filas.map((f) => [
      f.lado === 'banco' ? 'En el banco, no en contabilidad' : 'En contabilidad, no en el banco',
      fechaEs(f.fecha),
      f.dias,
      f.concepto ?? '',
      f.documento ?? '',
      Number(f.importe),
      f.referencia ?? '',
    ])
    descargar(await crearXlsx('Pendientes', [cab, ...datos], [30, 11, 6, 50, 14, 12, 40]), `partidas_pendientes_${banco?.nombre ?? ''}_${hasta}.xlsx`)
  }

  const tabla = (lado: 'banco' | 'contabilidad', titulo: string) => {
    const l = filas.filter((f) => f.lado === lado)
    return (
      <div className="flex flex-col gap-1">
        <b className="text-[#1d3a8a]">
          {titulo} ({l.length})
        </b>
        <div className="max-h-[38vh] overflow-auto border border-[var(--gw-border)] bg-white print:max-h-none">
          <table className="gw-grid">
            <thead className="sticky top-0">
              <tr>
                <th className="w-[80px]">Fecha</th>
                <th className="w-[45px] text-right!">Días</th>
                <th>Concepto</th>
                <th className="w-[95px] text-right!">Importe</th>
              </tr>
            </thead>
            <tbody>
              {l.length === 0 && <Vacio cols={4} texto="Nada pendiente." />}
              {l.map((f, i) => (
                <tr key={i} className={f.dias > 30 ? 'text-[#c42b1c]' : ''} title={f.referencia ?? ''}>
                  <td>{fechaEs(f.fecha)}</td>
                  <td className="text-right">{f.dias}</td>
                  <td className="truncate">{f.concepto}</td>
                  <td className="text-right">{eur0(f.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-8 print:static print:bg-white print:pt-0"
      onKeyDown={(e) => e.key === 'Escape' && onCerrar()}
    >
      <GwWindow title="Partidas pendientes de conciliar" onClose={onCerrar} className="w-[1000px] max-w-[96vw]">
        <div className="informe-impresion flex flex-col gap-2 text-[13px]">
          <div className="flex flex-wrap items-end gap-2 print:hidden">
            <GwField label="Cuenta bancaria">
              <GwSelect value={bancoId ?? ''} onChange={(e) => setBancoId(Number(e.target.value) || null)} className="w-[240px]">
                {bancos.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre} · {b.cuenta_contable}
                  </option>
                ))}
              </GwSelect>
            </GwField>
            <GwField label="A fecha">
              <GwDate value={hasta} onChange={(v) => v && setHasta(v)} className="w-[100px]" />
            </GwField>
            <button type="button" className="gw-btn" disabled={!filas.length} onClick={() => void excel()}>
              <FileDown size={14} /> Excel
            </button>
            <button type="button" className="gw-btn" onClick={() => window.print()}>
              <Printer size={14} /> Imprimir / PDF
            </button>
          </div>
          <div className="hidden text-[12pt] font-bold print:block">
            Partidas pendientes de conciliar · {banco?.nombre} ({banco?.cuenta_contable}) · a {fechaEs(hasta)}
          </div>
          <Aviso error={error} />
          <table className="gw-grid">
            <thead>
              <tr>
                <th>Pendiente</th>
                <th className="w-[50px] text-right!">Nº</th>
                {TRAMOS.map((t) => (
                  <th key={t.texto} className="w-[105px] text-right!">
                    {t.texto}
                  </th>
                ))}
                <th className="w-[105px] text-right!">Total</th>
              </tr>
            </thead>
            <tbody>
              {resumen.map((r) => (
                <tr key={r.lado}>
                  <td>{r.lado === 'banco' ? 'En el banco y no en la contabilidad' : 'En la contabilidad y no en el banco'}</td>
                  <td className="text-right">{r.n}</td>
                  {r.tramos.map((t, i) => (
                    <td key={i} className={`text-right ${i >= 2 && t ? 'font-bold text-[#c42b1c]' : ''}`}>
                      {t ? eur0(t) : ''}
                    </td>
                  ))}
                  <td className="text-right font-bold">{eur0(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid grid-cols-2 gap-2 max-lg:grid-cols-1 print:grid-cols-1">
            {tabla('banco', 'En el banco y no en la contabilidad')}
            {tabla('contabilidad', 'En la contabilidad y no en el banco')}
          </div>
          <div className="text-[11px] text-[#555] print:hidden">
            En rojo, lo que lleva más de 30 días. Lo de «contabilidad» suelen ser cheques o remesas que el banco todavía no ha movido, o apuntes mal metidos:
            revísalos.
          </div>
        </div>
      </GwWindow>
    </div>
  )
}

// ------------------------------------------------------------------ Importar Excel / CSV

type Campo = 'fecha' | 'valor' | 'concepto' | 'concepto2' | 'importe' | 'cargo' | 'abono' | 'saldo'
const CAMPOS: { c: Campo; texto: string; patron: RegExp }[] = [
  { c: 'fecha', texto: 'Fecha (operación)', patron: /^f(echa)?\.? ?(operaci|op|contable)?|^fecha$/i },
  { c: 'valor', texto: 'Fecha valor (opcional)', patron: /valor/i },
  { c: 'concepto', texto: 'Concepto', patron: /concepto|descripci|detalle|movimiento/i },
  { c: 'concepto2', texto: 'Más concepto (opcional)', patron: /referencia|observ|beneficiario|ordenante|remitente/i },
  { c: 'importe', texto: 'Importe (con signo)', patron: /^importe|cantidad|^euros?$/i },
  { c: 'cargo', texto: 'Cargo / Debe (si va aparte)', patron: /cargo|debe|gasto|salida/i },
  { c: 'abono', texto: 'Abono / Haber (si va aparte)', patron: /abono|haber|ingreso|entrada/i },
  { c: 'saldo', texto: 'Saldo (opcional)', patron: /saldo|disponible/i },
]

async function sha256(txt: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function ImportarHojaBanco({
  fichero,
  bancos,
  bancoInicial,
  onCerrar,
  onImportado,
}: {
  fichero: File
  bancos: Banco[]
  bancoInicial: number | null
  onCerrar: () => void
  onImportado: (banco: number, desde: string, hasta: string, mensaje: string) => void
}) {
  const [hoja, setHoja] = useState<Tabla>([])
  const [cab, setCab] = useState(0)
  const [mapa, setMapa] = useState<Partial<Record<Campo, number>>>({})
  const [bancoId, setBancoId] = useState<number | null>(bancoInicial)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  // Leer el fichero, buscar la fila de cabecera y adivinar columnas y cuenta.
  useEffect(() => {
    leerHoja(fichero)
      .then((t) => {
        setHoja(t)
        const fc = Math.max(
          0,
          t.findIndex((f) => f.some((c) => /fecha/i.test(c)) && f.some((c) => /importe|cargo|abono|debe|haber|cantidad/i.test(c))),
        )
        setCab(fc)
        const usadas = new Set<number>()
        const m: Partial<Record<Campo, number>> = {}
        for (const { c, patron } of CAMPOS) {
          const i = (t[fc] ?? []).findIndex((h, j) => !usadas.has(j) && patron.test(h.trim()))
          if (i >= 0) {
            m[c] = i
            usadas.add(i)
          }
        }
        if (m.importe != null) {
          delete m.cargo
          delete m.abono
        }
        setMapa(m)
        // Cuenta: un IBAN o nº de cuenta de las cuentas dadas de alta que aparezca en las primeras filas
        const arriba = t
          .slice(0, fc + 1)
          .flat()
          .join(' ')
          .replace(/\s/g, '')
        const b = bancos.find((x) => (x.iban && arriba.includes(x.iban.replace(/\s/g, ''))) || (x.numero_cuenta && arriba.includes(x.numero_cuenta)))
        if (b) setBancoId(b.id)
      })
      .catch((e: Error) => setError(e.message))
  }, [fichero, bancos])

  const cabecera = hoja[cab] ?? []
  const movimientos = useMemo(() => {
    const col = (f: string[], c: Campo) => (mapa[c] != null ? (f[mapa[c]!] ?? '') : '')
    return hoja
      .slice(cab + 1)
      .map((f) => {
        const fecha = fechaBanco(col(f, 'fecha'))
        let imp = mapa.importe != null ? importeBanco(col(f, 'importe')) : null
        if (mapa.importe == null) {
          const c = importeBanco(col(f, 'cargo'))
          const a = importeBanco(col(f, 'abono'))
          imp = c || a ? Math.round(((a ?? 0) - Math.abs(c ?? 0)) * 100) / 100 : null
        }
        return {
          fecha,
          valor: fechaBanco(col(f, 'valor')),
          concepto: [col(f, 'concepto'), col(f, 'concepto2')]
            .map((x) => x.trim())
            .filter(Boolean)
            .join(' · '),
          importe: imp,
          saldo: importeBanco(col(f, 'saldo')),
        }
      })
      .filter((m) => m.fecha && m.importe != null && m.importe !== 0) as {
      fecha: string
      valor: string | null
      concepto: string
      importe: number
      saldo: number | null
    }[]
  }, [hoja, cab, mapa])

  const listo = bancoId && mapa.fecha != null && (mapa.importe != null || mapa.cargo != null || mapa.abono != null) && movimientos.length > 0

  const importar = async () => {
    const b = bancos.find((x) => x.id === bancoId)
    if (!b || !listo) return
    setTrabajando(true)
    setError(null)
    try {
      // Los bancos suelen dar el más reciente primero: se ordena por fecha (estable).
      const movs = [...movimientos].sort((x, y) => x.fecha.localeCompare(y.fecha))
      const desde = movs[0].fecha
      const hasta = movs[movs.length - 1].fecha
      const conSaldo = movs.find((m) => m.saldo != null)
      const { data: ext, error: e1 } = await supabase
        .from('extracto_bancario')
        .insert({
          banco_cuenta_id: b.id,
          cuenta_contable: b.cuenta_contable,
          entidad: b.entidad,
          oficina: b.oficina,
          numero_cuenta: b.numero_cuenta,
          fecha_desde: desde,
          fecha_hasta: hasta,
          divisa: '978',
          saldo_inicial: conSaldo ? Math.round((conSaldo.saldo! - conSaldo.importe) * 100) / 100 : null,
          num_movimientos: movs.length,
          nombre_fichero: fichero.name,
        })
        .select('id')
        .single()
      if (e1) throw new Error(e1.message)
      const vistos = new Map<string, number>()
      const filas = []
      for (const [i, m] of movs.entries()) {
        // Misma huella que el Norma 43 (cuenta, fechas, importe, concepto…), para no repetir.
        const base = [b.entidad, b.oficina, b.numero_cuenta, m.fecha, m.valor ?? '', m.importe.toFixed(2), m.concepto.toUpperCase()].join('|')
        const n = (vistos.get(base) ?? 0) + 1
        vistos.set(base, n)
        filas.push({
          extracto_id: ext.id,
          linea: i + 1,
          fecha_operacion: m.fecha,
          fecha_valor: m.valor,
          concepto_comun: /DEVOL|IMPAGAD/i.test(m.concepto) ? '14' : '99',
          importe: m.importe,
          conceptos: m.concepto || null,
          huella: await sha256(`hoja|${base}#${n}`),
        })
      }
      let entran = 0
      for (let i = 0; i < filas.length; i += 500) {
        const { data, error: e2 } = await supabase
          .from('extracto_movimiento')
          .upsert(filas.slice(i, i + 500), { onConflict: 'huella', ignoreDuplicates: true })
          .select('id')
        if (e2) throw new Error(e2.message)
        entran += data?.length ?? 0
      }
      if (entran === 0) await supabase.from('extracto_bancario').delete().eq('id', ext.id)
      else await supabase.from('extracto_bancario').update({ num_movimientos: entran }).eq('id', ext.id)
      onImportado(
        b.id,
        desde.slice(0, 8) + '01',
        hasta,
        `Importados ${entran} movimientos de ${fichero.name}${filas.length - entran ? ` (${filas.length - entran} ya estaban y no se repiten)` : ''}.`,
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-8" onKeyDown={(e) => e.key === 'Escape' && onCerrar()}>
      <GwWindow title={`Importar extracto en Excel / CSV · ${fichero.name}`} onClose={onCerrar} className="w-[980px] max-w-[96vw]">
        <div className="flex flex-col gap-2 text-[13px]">
          <Aviso error={error} />
          <div className="flex flex-wrap items-end gap-2">
            <GwField label="Cuenta bancaria del extracto">
              <GwSelect value={bancoId ?? ''} onChange={(e) => setBancoId(Number(e.target.value) || null)} className="w-[240px]">
                <option value="">(elige la cuenta)</option>
                {bancos.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre} · {b.cuenta_contable}
                  </option>
                ))}
              </GwSelect>
            </GwField>
            <GwField label="Fila de los títulos">
              <GwSelect value={cab} onChange={(e) => setCab(Number(e.target.value))} className="w-[90px]">
                {hoja.slice(0, 30).map((_, i) => (
                  <option key={i} value={i}>
                    Fila {i + 1}
                  </option>
                ))}
              </GwSelect>
            </GwField>
          </div>
          <div className="grid grid-cols-4 gap-1.5 max-lg:grid-cols-2">
            {CAMPOS.map(({ c, texto }) => (
              <GwField key={c} label={texto}>
                <GwSelect
                  value={mapa[c] ?? ''}
                  onChange={(e) => setMapa((m) => ({ ...m, [c]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  className={`w-full ${mapa[c] != null ? 'font-bold' : ''}`}
                >
                  <option value="">—</option>
                  {cabecera.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Columna ${i + 1}`}
                    </option>
                  ))}
                </GwSelect>
              </GwField>
            ))}
          </div>
          <div className="text-[12px] text-[#555]">
            Vista previa: {movimientos.length} movimientos leídos
            {movimientos.length
              ? ` (del ${fechaEs(movimientos.map((m) => m.fecha).sort()[0])} al ${fechaEs(
                  movimientos
                    .map((m) => m.fecha)
                    .sort()
                    .slice(-1)[0],
                )})`
              : ''}
            . Comprueba que las fechas, conceptos e importes (cargos en negativo) salen bien.
          </div>
          <div className="max-h-[40vh] overflow-auto border border-[var(--gw-border)] bg-white">
            <table className="gw-grid">
              <thead className="sticky top-0">
                <tr>
                  <th className="w-[85px]">Fecha</th>
                  <th className="w-[85px]">F. valor</th>
                  <th>Concepto</th>
                  <th className="w-[95px] text-right!">Importe</th>
                  <th className="w-[95px] text-right!">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.length === 0 && <Vacio cols={5} texto="Elige qué columna es la fecha y cuál el importe (o cargo y abono)." />}
                {movimientos.slice(0, 200).map((m, i) => (
                  <tr key={i}>
                    <td>{fechaEs(m.fecha)}</td>
                    <td>{fechaEs(m.valor)}</td>
                    <td className="truncate">{m.concepto}</td>
                    <td className={`text-right ${m.importe < 0 ? 'text-[#c42b1c]' : 'text-[#127a12]'}`}>{eur0(m.importe)}</td>
                    <td className="text-right">{m.saldo != null ? eur0(m.saldo) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="gw-btn" onClick={onCerrar}>
              Cancelar
            </button>
            <button type="button" className="gw-btn font-bold" disabled={!listo || trabajando} onClick={() => void importar()}>
              <Upload size={14} /> {trabajando ? 'Importando…' : `Importar ${movimientos.length} movimientos`}
            </button>
          </div>
        </div>
      </GwWindow>
    </div>
  )
}
