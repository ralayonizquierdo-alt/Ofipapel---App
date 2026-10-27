import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link2, Link2Off, RefreshCw, Upload, Wand2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwCheck, GwField, GwGroup, GwInput, GwNumber, GwSelect } from '../../components/gw'
import { eur0, fechaEs, isoDe } from './contabModel'
import { CONCEPTOS_COMUNES, parseNorma43 } from './norma43'
import { Aviso, Barra, Rejilla, Vacio } from './ui'

interface Extracto {
  id: number
  cuenta_contable: string
  entidad: string | null
  oficina: string | null
  numero_cuenta: string | null
  titular: string | null
  fecha_desde: string | null
  fecha_hasta: string | null
  saldo_inicial: number | null
  saldo_final: number | null
  num_movimientos: number | null
  nombre_fichero: string | null
}

interface Mov {
  id: number
  linea: number
  fecha_operacion: string
  fecha_valor: string | null
  concepto_comun: string | null
  concepto_propio: string | null
  importe: number
  documento: string | null
  referencia1: string | null
  referencia2: string | null
  conceptos: string | null
  conciliado: boolean
  conciliado_tipo: string | null
  apunte_id: number | null
  cobro_tienda_codigo: string | null
  cobro_codigo: number | null
  pago_tienda_codigo: string | null
  pago_codigo: number | null
  nota: string | null
}

interface Candidato {
  id: number
  debe: number
  haber: number
  concepto: string | null
  documento: string | null
  asiento: { fecha: string; numero: number | null }
}

const sumarDias = (iso: string, d: number) => {
  const x = new Date(`${iso}T00:00:00`)
  x.setDate(x.getDate() + d)
  return isoDe(x)
}

/** Contabilidad → Conciliación Bancaria: importa extractos Norma 43 y los casa con la contabilidad. */
export function ConciliacionPage() {
  const [extractos, setExtractos] = useState<Extracto[]>([])
  const [extId, setExtId] = useState<number | null>(null)
  const [movs, setMovs] = useState<Mov[]>([])
  const [cuentaBanco, setCuentaBanco] = useState('57200000')
  const [dias, setDias] = useState(3)
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [sel, setSel] = useState<number | null>(null)
  const [cands, setCands] = useState<Candidato[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const cargarExtractos = useCallback(async () => {
    const { data, error: e } = await supabase.from('extracto_bancario').select('*').eq('activo', true).order('id', { ascending: false })
    if (e) return setError(e.message)
    setExtractos((data ?? []) as Extracto[])
    setExtId((prev) => prev ?? data?.[0]?.id ?? null)
  }, [])

  const cargarMovs = useCallback(async () => {
    if (!extId) return setMovs([])
    const { data, error: e } = await supabase.from('extracto_movimiento').select('*').eq('extracto_id', extId).order('linea')
    if (e) return setError(e.message)
    setMovs((data ?? []) as Mov[])
  }, [extId])

  useEffect(() => {
    cargarExtractos()
    supabase
      .from('configuracion_contable')
      .select('cuenta_bancos')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => data && setCuentaBanco(data.cuenta_bancos))
  }, [cargarExtractos])

  useEffect(() => {
    cargarMovs()
    setSel(null)
  }, [cargarMovs])

  const extracto = extractos.find((e) => e.id === extId) ?? null
  const actual = movs.find((m) => m.id === sel) ?? null

  // Candidatos para casar a mano: apuntes de la cuenta del banco, mismo sentido, ±15 días
  useEffect(() => {
    if (!actual || actual.conciliado || !extracto) return setCands([])
    const lado = actual.importe > 0 ? 'debe' : 'haber'
    supabase
      .from('apunte')
      .select('id, debe, haber, concepto, documento, asiento:asiento_id!inner(fecha, numero, estado)')
      .eq('cuenta', extracto.cuenta_contable)
      .gt(lado, 0)
      .eq('asiento.estado', 'correcto')
      .gte('asiento.fecha', sumarDias(actual.fecha_operacion, -15))
      .lte('asiento.fecha', sumarDias(actual.fecha_operacion, 15))
      .limit(200)
      .then(({ data, error: e }) => {
        if (e) return setError(e.message)
        const usados = new Set(movs.filter((m) => m.apunte_id).map((m) => m.apunte_id))
        const lista = ((data ?? []) as unknown as Candidato[]).filter((c) => !usados.has(c.id))
        const imp = Math.abs(actual.importe)
        lista.sort((a, b) => Math.abs(Number(a[lado]) - imp) - Math.abs(Number(b[lado]) - imp))
        setCands(lista)
      })
  }, [actual, extracto, movs])

  async function importar(file: File) {
    setError(null)
    setOk(null)
    try {
      // Los bancos suelen generar Norma 43 en ISO-8859-1
      const buf = await file.arrayBuffer()
      const texto = new TextDecoder('iso-8859-1').decode(buf)
      const cuentas = parseNorma43(texto)
      let ultimo: number | null = null
      let total = 0
      for (const c of cuentas) {
        const { data: dup } = await supabase
          .from('extracto_bancario')
          .select('id')
          .eq('activo', true)
          .eq('numero_cuenta', c.cuenta)
          .eq('fecha_desde', c.fechaDesde)
          .eq('fecha_hasta', c.fechaHasta)
          .limit(1)
        if (dup?.length && !window.confirm(`Ya hay un extracto de la cuenta ${c.cuenta} del ${fechaEs(c.fechaDesde)} al ${fechaEs(c.fechaHasta)}. ¿Importarlo otra vez?`))
          continue
        const { data: ext, error: e1 } = await supabase
          .from('extracto_bancario')
          .insert({
            cuenta_contable: cuentaBanco,
            entidad: c.entidad,
            oficina: c.oficina,
            numero_cuenta: c.cuenta,
            titular: c.titular,
            fecha_desde: c.fechaDesde || null,
            fecha_hasta: c.fechaHasta || null,
            divisa: c.divisa,
            saldo_inicial: c.saldoInicial,
            saldo_final: c.saldoFinal,
            total_debe: c.totalDebe,
            total_haber: c.totalHaber,
            num_movimientos: c.movimientos.length,
            nombre_fichero: file.name,
          })
          .select('id')
          .single()
        if (e1) throw new Error(e1.message)
        if (c.movimientos.length) {
          const { error: e2 } = await supabase.from('extracto_movimiento').insert(
            c.movimientos.map((m) => ({
              extracto_id: ext.id,
              linea: m.linea,
              fecha_operacion: m.fechaOperacion,
              fecha_valor: m.fechaValor || null,
              concepto_comun: m.conceptoComun,
              concepto_propio: m.conceptoPropio,
              importe: m.importe,
              documento: m.documento || null,
              referencia1: m.referencia1 || null,
              referencia2: m.referencia2 || null,
              conceptos: m.conceptos.join(' · ') || null,
            })),
          )
          if (e2) throw new Error(e2.message)
        }
        ultimo = ext.id
        total += c.movimientos.length
      }
      setOk(`Importado: ${cuentas.length} cuenta(s), ${total} movimientos.`)
      await cargarExtractos()
      if (ultimo) setExtId(ultimo)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function casarAuto() {
    if (!extId) return
    setError(null)
    const { data, error: e } = await supabase.rpc('fn_contab_conciliar_auto', { p_extracto: extId, p_dias: dias })
    if (e) return setError(e.message)
    setOk(`Casados automáticamente: ${data} movimientos.`)
    cargarMovs()
  }

  async function casar(cambios: Partial<Mov>) {
    if (!actual) return
    const { error: e } = await supabase
      .from('extracto_movimiento')
      .update({ ...cambios, conciliado: true, conciliado_en: new Date().toISOString() })
      .eq('id', actual.id)
    if (e) return setError(e.message)
    setOk('Movimiento conciliado.')
    cargarMovs()
  }

  async function descasar() {
    if (!actual) return
    const { error: e } = await supabase
      .from('extracto_movimiento')
      .update({
        conciliado: false,
        conciliado_tipo: null,
        apunte_id: null,
        cobro_tienda_codigo: null,
        cobro_codigo: null,
        pago_tienda_codigo: null,
        pago_codigo: null,
        nota: null,
        conciliado_en: null,
      })
      .eq('id', actual.id)
    if (e) return setError(e.message)
    cargarMovs()
  }

  const filas = useMemo(() => (soloPendientes ? movs.filter((m) => !m.conciliado) : movs), [movs, soloPendientes])
  const pendientes = movs.filter((m) => !m.conciliado).length
  const conciliadoCon = (m: Mov) =>
    m.conciliado_tipo === 'apunte'
      ? `Apunte ${m.apunte_id}`
      : m.conciliado_tipo === 'cobro'
        ? `Cobro ${m.cobro_tienda_codigo}-${m.cobro_codigo}`
        : m.conciliado_tipo === 'pago'
          ? `Pago ${m.pago_tienda_codigo}-${m.pago_codigo}`
          : m.conciliado_tipo === 'manual'
            ? `Manual${m.nota ? `: ${m.nota}` : ''}`
            : ''

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <Barra>
        <GwField label="Cuenta contable del banco">
          <GwInput value={cuentaBanco} onChange={(e) => setCuentaBanco(e.target.value.replace(/\D/g, ''))} className="w-[90px] font-mono" />
        </GwField>
        <label className="gw-btn cursor-default">
          <Upload size={14} /> Importar Norma 43…
          <input
            type="file"
            accept=".txt,.n43,.aeb,.csb,.dat,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importar(f)
              e.target.value = ''
            }}
          />
        </label>
        <GwField label="Extracto">
          <GwSelect value={extId ?? ''} onChange={(e) => setExtId(Number(e.target.value) || null)} className="w-[290px]">
            {extractos.length === 0 && <option value="">(ninguno importado)</option>}
            {extractos.map((x) => (
              <option key={x.id} value={x.id}>
                {x.entidad}-{x.oficina} {x.numero_cuenta} · {fechaEs(x.fecha_desde)} a {fechaEs(x.fecha_hasta)} ({x.num_movimientos} mov.)
              </option>
            ))}
          </GwSelect>
        </GwField>
        <GwField label="± días">
          <GwNumber value={dias} decimals={0} onChange={(v) => setDias(Math.max(0, Math.trunc(v ?? 0)))} className="w-[50px]" />
        </GwField>
        <button type="button" className="gw-btn" onClick={casarAuto} disabled={!extId}>
          <Wand2 size={14} /> Casar automáticamente
        </button>
        <GwCheck label="Solo pendientes" checked={soloPendientes} onChange={setSoloPendientes} className="mb-1" />
        <button type="button" className="gw-btn" onClick={cargarMovs}>
          <RefreshCw size={14} />
        </button>
      </Barra>
      <Aviso error={error} ok={ok} />
      {extracto && (
        <div className="flex flex-wrap gap-4 text-[12px]">
          <span>{extracto.titular}</span>
          <span>
            Saldo inicial <b>{eur0(extracto.saldo_inicial)}</b>
          </span>
          <span>
            Saldo final <b>{eur0(extracto.saldo_final)}</b>
          </span>
          <span>Cuenta contable {extracto.cuenta_contable}</span>
          <span className={pendientes ? 'font-bold text-[#c42b1c]' : 'font-bold text-[#127a12]'}>
            {pendientes ? `${pendientes} movimientos sin conciliar` : 'Todo conciliado'}
          </span>
        </div>
      )}
      <Rejilla alto={actual && !actual.conciliado ? 'calc(100vh - 470px)' : 'calc(100vh - 330px)'}>
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th className="w-[85px]">F. operación</th>
              <th className="w-[85px]">F. valor</th>
              <th className="w-[190px]">Concepto común</th>
              <th>Conceptos</th>
              <th className="w-[100px]">Documento</th>
              <th className="w-[100px] text-right!">Importe</th>
              <th className="w-[180px]">Conciliado con</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <Vacio cols={7} texto={extId ? 'Sin movimientos.' : 'Importa un fichero Norma 43 (AEB/CSB 43) del banco.'} />}
            {filas.map((m) => (
              <tr key={m.id} className={sel === m.id ? 'gw-selected' : m.conciliado ? '' : 'bg-[#fff8e1]'} onClick={() => setSel(m.id)}>
                <td>{fechaEs(m.fecha_operacion)}</td>
                <td>{fechaEs(m.fecha_valor)}</td>
                <td className="truncate">
                  {m.concepto_comun} {CONCEPTOS_COMUNES[m.concepto_comun ?? ''] ?? ''}
                </td>
                <td className="truncate" title={m.conceptos ?? ''}>
                  {m.conceptos}
                </td>
                <td className="truncate">{m.documento}</td>
                <td className={`text-right ${m.importe < 0 ? 'text-[#c42b1c]' : ''}`}>{eur0(m.importe)}</td>
                <td className="truncate">{m.conciliado ? `✔ ${conciliadoCon(m)}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Rejilla>
      {actual && actual.conciliado && (
        <div className="flex items-center gap-2">
          <span>Conciliado con {conciliadoCon(actual)}.</span>
          <button type="button" className="gw-btn" onClick={descasar}>
            <Link2Off size={14} /> Deshacer casado
          </button>
        </div>
      )}
      {actual && !actual.conciliado && (
        <GwGroup title={`Casar a mano el movimiento de ${eur0(actual.importe)} del ${fechaEs(actual.fecha_operacion)} con un apunte de la ${extracto?.cuenta_contable} (±15 días)`}>
          <div className="max-h-[120px] overflow-auto border border-[var(--gw-border-light)] bg-white">
            <table className="gw-grid">
              <tbody>
                {cands.length === 0 && <Vacio cols={5} texto="No hay apuntes candidatos. Puedes marcarlo como conciliado sin documento." />}
                {cands.map((c) => (
                  <tr key={c.id}>
                    <td className="w-[85px]">{fechaEs(c.asiento.fecha)}</td>
                    <td className="w-[70px]">As. {c.asiento.numero}</td>
                    <td className="truncate">{c.concepto}</td>
                    <td className="w-[100px] text-right">{eur0(Number(c.debe) || Number(c.haber))}</td>
                    <td className="w-[90px]">
                      <button type="button" className="gw-btn" onClick={() => casar({ conciliado_tipo: 'apunte', apunte_id: c.id })}>
                        <Link2 size={13} /> Casar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="gw-btn mt-1"
            onClick={() => {
              const nota = window.prompt('Nota (p. ej. «comisión, se contabiliza a mano»):', '')
              if (nota != null) casar({ conciliado_tipo: 'manual', nota: nota || null })
            }}
          >
            Marcar conciliado sin documento
          </button>
        </GwGroup>
      )}
    </div>
  )
}
