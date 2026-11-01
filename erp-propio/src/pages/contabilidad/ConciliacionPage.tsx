// Contabilidad → Conciliación Bancaria inteligente, fase 1 (Luis, 01/11/2026: «es lo que más personal y
// tiempo nos cuesta»). Bancos: Santander, BBVA, CaixaBank y Cajasiete; los Norma 43 se descargan de la
// web de cada banco y se arrastran aquí (varios a la vez). Cada fichero se reconoce por su cuenta
// (banco_cuenta) y un movimiento nunca entra dos veces (huella). El ERP propone con qué casar cada
// movimiento y lo pinta con semáforo: verde seguro, amarillo revisar, rojo sin propuesta.
// Datos: migración 20261101_conciliacion_inteligente (fn_concilia_*).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookPlus, Check, CheckCheck, Link2, Link2Off, ListChecks, RefreshCw, Settings2, Upload, Wand2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwDate, GwField, GwGroup, GwInput, GwNumber, GwSelect, GwWindow } from '../../components/gw'
import { GwOperativa } from '../../components/gw/GwOperativa'
import { eur0, fechaEs, isoDe, leerTodo } from './contabModel'
import { CONCEPTOS_COMUNES, parseNorma43, type CuentaN43 } from './norma43'
import { Aviso, Barra, Rejilla, Vacio } from './ui'

const ENTIDADES: Record<string, string> = { '0049': 'Santander', '0182': 'BBVA', '2100': 'CaixaBank', '3076': 'Cajasiete' }

interface BancoCuenta {
  id: number
  nombre: string
  entidad: string
  oficina: string
  numero_cuenta: string
  cuenta_contable: string
  cuenta_comisiones: string
  activo: boolean
}

interface Propuesta {
  tipo: 'regla' | 'apunte' | 'varios' | 'datafono' | 'cobro' | 'pago'
  confianza: 'verde' | 'amarillo'
  motivo: string
  apuntes?: number[]
}

interface Mov {
  id: number
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
  asiento_generado_id: number | null
  nota: string | null
  propuesta: Propuesta | null
}

interface Candidato {
  id: number
  fecha: string
  numero: number | null
  concepto: string | null
  contrapartida: string | null
  nombre: string | null
  importe: number
}

interface Resumen {
  saldo_banco: number | null
  saldo_contable: number
  pendiente_banco: number
  n_pendiente_banco: number
  pendiente_contable: number
  n_pendiente_contable: number
}

interface Regla {
  id: number
  nombre: string
  texto: string
  sentido: string
  cuenta_contrapartida: string
  concepto: string | null
  activa: boolean
  veces: number
  ultima_vez: string | null
}

type Luz = 'verde' | 'amarillo' | 'rojo' | 'hecho'
const luzDe = (m: Mov): Luz => (m.conciliado ? 'hecho' : (m.propuesta?.confianza ?? 'rojo'))
const PUNTO: Record<Luz, string> = { verde: '🟢', amarillo: '🟡', rojo: '🔴', hecho: '✔' }
const TITULO_LUZ: Record<Luz, string> = { verde: 'Seguros', amarillo: 'Revisar', rojo: 'Sin casar', hecho: 'Conciliados' }

const textoMov = (m: Mov) => [m.concepto_propio, m.conceptos].filter((x) => x && x.trim()).join(' · ')
const mesActual = () => {
  const d = new Date()
  return [isoDe(new Date(d.getFullYear(), d.getMonth(), 1)), isoDe(new Date(d.getFullYear(), d.getMonth() + 1, 0))]
}

async function sha256(txt: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Primeras palabras útiles del concepto, para proponer el texto de una regla. */
function textoRegla(m: Mov) {
  const t = textoMov(m)
    .toUpperCase()
    .replace(/[0-9/.,-]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3)
  return t.slice(0, 3).join(' ')
}

export function ConciliacionPage() {
  const [bancos, setBancos] = useState<BancoCuenta[]>([])
  const [bancoId, setBancoId] = useState<number | null>(null)
  const [[desde, hasta], setRango] = useState(mesActual)
  const [dias, setDias] = useState(3)
  const [movs, setMovs] = useState<Mov[]>([])
  const [filtro, setFiltro] = useState<Luz | 'todos'>('todos')
  const [sel, setSel] = useState<number | null>(null)
  const [cands, setCands] = useState<Candidato[]>([])
  const [marcados, setMarcados] = useState<number[]>([])
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const [ayuda, setAyuda] = useState(false)
  const [verBancos, setVerBancos] = useState(false)
  const [verReglas, setVerReglas] = useState(false)
  const [asiento, setAsiento] = useState({ cuenta: '', concepto: '' })
  const [regla, setRegla] = useState<{ nombre: string; texto: string; cuenta: string; sentido: string } | null>(null)
  const ficheroRef = useRef<HTMLInputElement>(null)

  const banco = bancos.find((b) => b.id === bancoId) ?? null

  const cargarBancos = useCallback(async () => {
    const { data, error: e } = await supabase.from('banco_cuenta').select('*').order('nombre')
    if (e) return setError(e.message)
    const lista = (data ?? []) as BancoCuenta[]
    setBancos(lista)
    setBancoId((prev) => prev ?? lista.find((b) => b.activo)?.id ?? null)
  }, [])

  const cargarMovs = useCallback(async () => {
    if (!bancoId) return setMovs([])
    try {
      const data = await leerTodo<Mov>((a, b) =>
        supabase
          .from('extracto_movimiento')
          .select('*, extracto:extracto_id!inner(banco_cuenta_id, activo)')
          .eq('extracto.banco_cuenta_id', bancoId)
          .eq('extracto.activo', true)
          .gte('fecha_operacion', desde)
          .lte('fecha_operacion', hasta)
          .order('fecha_operacion')
          .order('id')
          .range(a, b),
      )
      setMovs(data)
      const { data: r } = await supabase.rpc('fn_concilia_resumen', { p_banco: bancoId, p_desde: desde, p_hasta: hasta })
      setResumen((r as Resumen) ?? null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [bancoId, desde, hasta])

  useEffect(() => {
    void cargarBancos()
  }, [cargarBancos])
  useEffect(() => {
    void cargarMovs()
    setSel(null)
  }, [cargarMovs])

  const actual = movs.find((m) => m.id === sel) ?? null

  // Candidatos para casar a mano (uno o varios apuntes de la cuenta del banco, ±15 días)
  useEffect(() => {
    setMarcados([])
    if (!actual || actual.conciliado) return setCands([])
    setAsiento({ cuenta: '', concepto: textoMov(actual).slice(0, 80) })
    setRegla(null)
    supabase.rpc('fn_concilia_candidatos', { p_mov: actual.id, p_dias: 15 }).then(({ data, error: e }) => {
      if (e) return setError(e.message)
      setCands((data ?? []) as Candidato[])
    })
  }, [actual])

  async function proponer(id = bancoId, d = desde, h = hasta) {
    if (!id) return
    setTrabajando(true)
    setError(null)
    const { data, error: e } = await supabase.rpc('fn_concilia_proponer', { p_banco: id, p_desde: d, p_hasta: h, p_dias: dias })
    setTrabajando(false)
    if (e) return setError(e.message)
    const r = data as { verde: number; amarillo: number; rojo: number }
    setOk(`Propuestas: 🟢 ${r.verde} seguras · 🟡 ${r.amarillo} para revisar · 🔴 ${r.rojo} sin casar.`)
    await cargarMovs()
  }

  async function importarFicheros(files: FileList | File[]) {
    setError(null)
    setOk(null)
    setTrabajando(true)
    const avisos: string[] = []
    let nuevos = 0
    let repetidos = 0
    let ultimoBanco: number | null = null
    let minF = ''
    let maxF = ''
    try {
      const { data: cfg } = await supabase.from('configuracion_contable').select('cuenta_bancos').eq('id', 1).maybeSingle()
      let lista = bancos
      for (const file of Array.from(files)) {
        const texto = new TextDecoder('iso-8859-1').decode(await file.arrayBuffer())
        let cuentas: CuentaN43[]
        try {
          cuentas = parseNorma43(texto)
        } catch {
          avisos.push(`${file.name}: no es un Norma 43`)
          continue
        }
        if (!cuentas.length) {
          avisos.push(`${file.name}: no es un Norma 43 (descárgalo del banco en formato «Norma 43» o «Cuaderno 43»)`)
          continue
        }
        for (const c of cuentas) {
          let b = lista.find((x) => x.entidad === c.entidad && x.oficina === c.oficina && x.numero_cuenta === c.cuenta)
          if (!b) {
            const { data: nb, error: eb } = await supabase
              .from('banco_cuenta')
              .insert({
                nombre: `${ENTIDADES[c.entidad] ?? `Banco ${c.entidad}`} ${c.cuenta.slice(-4)}`,
                entidad: c.entidad,
                oficina: c.oficina,
                numero_cuenta: c.cuenta,
                cuenta_contable: cfg?.cuenta_bancos ?? '57200000',
              })
              .select('*')
              .single()
            if (eb) throw new Error(eb.message)
            b = nb as BancoCuenta
            lista = [...lista, b]
            avisos.push(`Cuenta nueva: ${b.nombre}. Revisa su subcuenta contable en «Cuentas bancarias».`)
          }
          const { data: ext, error: e1 } = await supabase
            .from('extracto_bancario')
            .insert({
              banco_cuenta_id: b.id,
              cuenta_contable: b.cuenta_contable,
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
          // Huella: mismos datos = mismo movimiento (con nº de orden si hay dos idénticos el mismo día)
          const vistos = new Map<string, number>()
          const filas = []
          for (const m of c.movimientos) {
            const base = [
              c.entidad,
              c.oficina,
              c.cuenta,
              m.fechaOperacion,
              m.fechaValor,
              m.importe.toFixed(2),
              m.conceptoComun,
              m.conceptoPropio,
              m.documento,
              m.referencia1,
              m.referencia2,
              m.conceptos.join(' '),
            ]
              .map((x) => String(x ?? '').trim())
              .join('|')
            const n = (vistos.get(base) ?? 0) + 1
            vistos.set(base, n)
            filas.push({
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
              huella: await sha256(`${base}#${n}`),
            })
            if (!minF || m.fechaOperacion < minF) minF = m.fechaOperacion
            if (!maxF || m.fechaOperacion > maxF) maxF = m.fechaOperacion
          }
          let entran = 0
          for (let i = 0; i < filas.length; i += 500) {
            const { data: ins, error: e2 } = await supabase
              .from('extracto_movimiento')
              .upsert(filas.slice(i, i + 500), { onConflict: 'huella', ignoreDuplicates: true })
              .select('id')
            if (e2) throw new Error(e2.message)
            entran += ins?.length ?? 0
          }
          nuevos += entran
          repetidos += filas.length - entran
          if (entran === 0) await supabase.from('extracto_bancario').delete().eq('id', ext.id)
          else await supabase.from('extracto_bancario').update({ num_movimientos: entran }).eq('id', ext.id)
          ultimoBanco = b.id
        }
      }
      setBancos(lista)
      setOk(
        `Importados ${nuevos} movimientos nuevos${repetidos ? ` (${repetidos} ya estaban y no se repiten)` : ''}.${avisos.length ? ' ' + avisos.join(' ') : ''}`,
      )
      if (ultimoBanco && minF) {
        setBancoId(ultimoBanco)
        setRango([minF.slice(0, 8) + '01', maxF])
        await proponer(ultimoBanco, minF.slice(0, 8) + '01', maxF)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTrabajando(false)
    }
  }

  const rpc = async (fn: string, args: Record<string, unknown>, mensaje: string) => {
    setError(null)
    setOk(null)
    const { error: e } = await supabase.rpc(fn, args)
    if (e) return setError(e.message)
    setOk(mensaje)
    await cargarMovs()
  }

  async function confirmarVerdes() {
    if (!bancoId) return
    setTrabajando(true)
    const { data, error: e } = await supabase.rpc('fn_concilia_confirmar_verdes', { p_banco: bancoId, p_desde: desde, p_hasta: hasta })
    setTrabajando(false)
    if (e) return setError(e.message)
    const r = data as { confirmados: number; con_problema: number }
    setOk(`Confirmados ${r.confirmados} movimientos verdes${r.con_problema ? `; ${r.con_problema} pasan a amarillo (míralos)` : ''}.`)
    await cargarMovs()
  }

  async function guardarRegla() {
    if (!regla || !actual) return
    const { error: e } = await supabase.from('conciliacion_regla').insert({
      nombre: regla.nombre.trim() || regla.texto.trim(),
      texto: regla.texto.trim(),
      sentido: regla.sentido,
      cuenta_contrapartida: regla.cuenta.trim(),
      concepto: regla.nombre.trim() || null,
      banco_cuenta_id: null,
    })
    if (e) return setError(e.message)
    setRegla(null)
    setOk(`Regla «${regla.nombre || regla.texto}» guardada. Desde ahora se aplica sola.`)
    await proponer()
  }

  const cuenta = useMemo(() => {
    const c: Record<Luz, number> = { verde: 0, amarillo: 0, rojo: 0, hecho: 0 }
    for (const m of movs) c[luzDe(m)]++
    return c
  }, [movs])
  const filas = useMemo(() => (filtro === 'todos' ? movs : movs.filter((m) => luzDe(m) === filtro)), [movs, filtro])
  const sumaMarcados = cands.filter((c) => marcados.includes(c.id)).reduce((s, c) => s + Number(c.importe), 0)
  const diferencia = resumen?.saldo_banco != null ? Number(resumen.saldo_banco) - Number(resumen.saldo_contable) : null

  const conciliadoCon = (m: Mov) =>
    ({
      apunte: `Apunte ${m.apunte_id}`,
      varios: 'Varios apuntes',
      regla: `Regla → asiento ${m.asiento_generado_id ?? ''}`,
      asiento: `Asiento creado ${m.asiento_generado_id ?? ''}`,
      datafono: `Datáfono → asiento ${m.asiento_generado_id ?? ''}`,
      cobro: `Cobro ${m.cobro_tienda_codigo}-${m.cobro_codigo}`,
      pago: `Pago ${m.pago_tienda_codigo}-${m.pago_codigo}`,
      manual: `Sin documento${m.nota ? `: ${m.nota}` : ''}`,
      remesa: m.nota ?? 'Remesa',
      devolucion: m.nota ?? 'Devolución de recibo',
    })[m.conciliado_tipo ?? ''] ??
    m.conciliado_tipo ??
    ''

  return (
    <div
      className="flex min-w-0 flex-col gap-1.5 text-[13px]"
      onDragOver={(e) => {
        e.preventDefault()
        setArrastrando(true)
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={(e) => {
        e.preventDefault()
        setArrastrando(false)
        if (e.dataTransfer.files.length) void importarFicheros(e.dataTransfer.files)
      }}
    >
      <Barra>
        <button
          type="button"
          className={`gw-btn h-[44px] border-dashed! px-3 font-bold ${arrastrando ? 'bg-[#91c9f7]' : ''}`}
          onClick={() => ficheroRef.current?.click()}
          disabled={trabajando}
          title="Arrastra aquí los ficheros Norma 43 de los bancos (varios a la vez) o pulsa para elegirlos"
        >
          <Upload size={18} /> {arrastrando ? 'Suelta aquí los ficheros' : 'Arrastra aquí los Norma 43 (o pulsa)'}
        </button>
        <input
          ref={ficheroRef}
          type="file"
          multiple
          accept=".txt,.n43,.aeb,.csb,.dat,.q43,text/plain"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void importarFicheros(e.target.files)
            e.target.value = ''
          }}
        />
        <GwField label="Cuenta bancaria">
          <GwSelect value={bancoId ?? ''} onChange={(e) => setBancoId(Number(e.target.value) || null)} className="w-[230px]">
            {bancos.length === 0 && <option value="">(importa un Norma 43)</option>}
            {bancos.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre} · {b.cuenta_contable}
                {b.activo ? '' : ' (baja)'}
              </option>
            ))}
          </GwSelect>
        </GwField>
        <GwField label="Desde">
          <GwDate value={desde} onChange={(v) => v && setRango([v, hasta])} className="w-[100px]" />
        </GwField>
        <GwField label="Hasta">
          <GwDate value={hasta} onChange={(v) => v && setRango([desde, v])} className="w-[100px]" />
        </GwField>
        <GwField label="± días">
          <GwNumber value={dias} decimals={0} onChange={(v) => setDias(Math.max(0, Math.min(15, Math.trunc(v ?? 0))))} className="w-[45px]" />
        </GwField>
        <button type="button" className="gw-btn" onClick={() => void proponer()} disabled={!bancoId || trabajando}>
          <Wand2 size={14} /> Buscar propuestas
        </button>
        <button type="button" className="gw-btn font-bold" onClick={() => void confirmarVerdes()} disabled={!cuenta.verde || trabajando}>
          <CheckCheck size={14} color="#127a12" /> Confirmar las {cuenta.verde} verdes
        </button>
        <button type="button" className="gw-btn" onClick={() => void cargarMovs()} title="Actualizar">
          <RefreshCw size={14} />
        </button>
        <span className="flex-1" />
        <button type="button" className="gw-btn" onClick={() => setVerReglas(true)}>
          <ListChecks size={14} /> Reglas
        </button>
        <button type="button" className="gw-btn" onClick={() => setVerBancos(true)}>
          <Settings2 size={14} /> Cuentas bancarias
        </button>
        <button type="button" className="gw-btn" onClick={() => setAyuda((a) => !a)}>
          Operativa
        </button>
      </Barra>
      <Aviso error={error} ok={trabajando ? 'Trabajando…' : ok} />
      {ayuda && <OperativaConciliacion />}

      {banco && (
        <div className="flex flex-wrap items-center gap-2">
          {(['todos', 'verde', 'amarillo', 'rojo', 'hecho'] as const).map((f) => (
            <button key={f} type="button" className={`gw-btn h-[24px] ${filtro === f ? 'bg-[#91c9f7] font-bold' : ''}`} onClick={() => setFiltro(f)}>
              {f === 'todos' ? `Todos (${movs.length})` : `${PUNTO[f]} ${TITULO_LUZ[f]} (${cuenta[f]})`}
            </button>
          ))}
          {resumen && (
            <span className="ml-auto flex flex-wrap gap-3 text-[12px]">
              <span>
                Saldo banco <b>{resumen.saldo_banco == null ? '—' : eur0(resumen.saldo_banco)}</b>
              </span>
              <span>
                Saldo contable ({banco.cuenta_contable}) <b>{eur0(resumen.saldo_contable)}</b>
              </span>
              {diferencia != null && (
                <b className={Math.abs(diferencia) < 0.005 ? 'text-[#127a12]' : 'text-[#c42b1c]'}>
                  {Math.abs(diferencia) < 0.005 ? '✔ Cuadra' : `Diferencia ${eur0(diferencia)}`}
                </b>
              )}
              <span title="Apuntes de la cuenta del banco en el periodo que no están casados con ningún movimiento">
                Apuntes sin casar: {resumen.n_pendiente_contable} ({eur0(resumen.pendiente_contable)})
              </span>
            </span>
          )}
        </div>
      )}

      <Rejilla alto={actual ? 'calc(100vh - 520px)' : 'calc(100vh - 340px)'}>
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th className="w-[28px]" />
              <th className="w-[80px]">Fecha</th>
              <th>Concepto del banco</th>
              <th className="w-[100px] text-right!">Importe</th>
              <th className="w-[42%]">Propuesta / conciliado con</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <Vacio cols={5} texto={bancoId ? 'Sin movimientos en estas fechas.' : 'Arrastra aquí los ficheros Norma 43 de los bancos.'} />
            )}
            {filas.map((m) => {
              const luz = luzDe(m)
              return (
                <tr key={m.id} className={sel === m.id ? 'gw-selected' : luz === 'hecho' ? 'text-[#666]' : ''} onClick={() => setSel(m.id)}>
                  <td className="text-center">{PUNTO[luz]}</td>
                  <td>{fechaEs(m.fecha_operacion)}</td>
                  <td className="truncate" title={`${CONCEPTOS_COMUNES[m.concepto_comun ?? ''] ?? ''} · ${textoMov(m)}`}>
                    {textoMov(m) || CONCEPTOS_COMUNES[m.concepto_comun ?? '']}
                  </td>
                  <td className={`text-right ${m.importe < 0 ? 'text-[#c42b1c]' : 'text-[#127a12]'}`}>{eur0(m.importe)}</td>
                  <td className="truncate" title={m.propuesta?.motivo}>
                    {m.conciliado ? `✔ ${conciliadoCon(m)}` : (m.propuesta?.motivo ?? '')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Rejilla>

      {actual && actual.conciliado && (
        <div className="flex items-center gap-2 border border-[var(--gw-border)] bg-[#eef8ee] p-1.5">
          <span>
            ✔ {fechaEs(actual.fecha_operacion)} · {eur0(actual.importe)} conciliado con <b>{conciliadoCon(actual)}</b>.
          </span>
          <button type="button" className="gw-btn" onClick={() => void rpc('fn_concilia_deshacer', { p_mov: actual.id }, 'Conciliación deshecha.')}>
            <Link2Off size={14} /> Deshacer
          </button>
          {actual.asiento_generado_id && <span className="text-[12px] text-[#555]">(el asiento que se hizo se anula)</span>}
        </div>
      )}

      {actual && !actual.conciliado && (
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-2 max-lg:grid-cols-1">
          <GwGroup title={`${fechaEs(actual.fecha_operacion)} · ${eur0(actual.importe)} · ${textoMov(actual).slice(0, 60)}`}>
            {actual.propuesta ? (
              <div
                className={`mb-1 flex items-center gap-2 border p-1.5 ${actual.propuesta.confianza === 'verde' ? 'border-[#6cbf6c] bg-[#eef8ee]' : 'border-[#e0b400] bg-[#fff8e1]'}`}
              >
                <span className="flex-1">
                  {PUNTO[actual.propuesta.confianza]} {actual.propuesta.motivo}
                </span>
                <button type="button" className="gw-btn font-bold" onClick={() => void rpc('fn_concilia_confirmar', { p_mov: actual.id }, 'Conciliado.')}>
                  <Check size={14} color="#127a12" /> Aceptar
                </button>
                <button type="button" className="gw-btn" onClick={() => void rpc('fn_concilia_descartar', { p_mov: actual.id }, 'Propuesta descartada.')}>
                  <X size={14} /> No es esto
                </button>
              </div>
            ) : (
              <div className="mb-1 text-[#c42b1c]">🔴 Sin propuesta: cásalo a mano, crea el asiento o crea una regla.</div>
            )}
            <div className="mb-0.5 flex items-center gap-2 text-[12px]">
              <b>Casar a mano</b> (marca uno o varios apuntes; ±15 días)
              <span className="ml-auto">
                Marcado <b>{eur0(sumaMarcados)}</b> de {eur0(Math.abs(actual.importe))}
              </span>
              <button
                type="button"
                className="gw-btn h-[22px]"
                disabled={!marcados.length || Math.abs(sumaMarcados - Math.abs(actual.importe)) > 0.005}
                onClick={() => void rpc('fn_concilia_casar_apuntes', { p_mov: actual.id, p_apuntes: marcados }, 'Conciliado.')}
              >
                <Link2 size={13} /> Casar
              </button>
            </div>
            <div className="max-h-[150px] overflow-auto border border-[var(--gw-border-light)] bg-white">
              <table className="gw-grid">
                <tbody>
                  {cands.length === 0 && <Vacio cols={5} texto="No hay apuntes sin casar en la cuenta del banco cerca de esa fecha." />}
                  {cands.map((c) => (
                    <tr
                      key={c.id}
                      className={marcados.includes(c.id) ? 'bg-[#dce6f5]' : ''}
                      onClick={() => setMarcados((x) => (x.includes(c.id) ? x.filter((y) => y !== c.id) : [...x, c.id]))}
                    >
                      <td className="w-[24px] text-center">{marcados.includes(c.id) ? '☑' : '☐'}</td>
                      <td className="w-[75px]">{fechaEs(c.fecha)}</td>
                      <td className="w-[60px]">As. {c.numero}</td>
                      <td className="truncate">
                        {c.concepto}
                        {c.nombre ? <span className="text-[#555]"> · {c.nombre}</span> : ''}
                      </td>
                      <td className={`w-[90px] text-right ${Math.abs(Number(c.importe) - Math.abs(actual.importe)) < 0.005 ? 'font-bold text-[#127a12]' : ''}`}>
                        {eur0(c.importe)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GwGroup>
          <div className="flex flex-col gap-2">
            <GwGroup title="Crear el asiento (no está en la contabilidad)">
              <div className="flex flex-wrap items-end gap-1.5">
                <GwField label="Cuenta contrapartida">
                  <GwInput
                    value={asiento.cuenta}
                    onChange={(e) => setAsiento({ ...asiento, cuenta: e.target.value.replace(/\D/g, '') })}
                    className="w-[95px] font-mono"
                    placeholder="62800000"
                  />
                </GwField>
                <GwField label="Concepto" className="min-w-[160px] flex-1">
                  <GwInput value={asiento.concepto} onChange={(e) => setAsiento({ ...asiento, concepto: e.target.value })} maxLength={120} />
                </GwField>
                <button
                  type="button"
                  className="gw-btn"
                  disabled={!asiento.cuenta}
                  onClick={() =>
                    void rpc(
                      'fn_concilia_crear_asiento',
                      { p_mov: actual.id, p_cuenta: asiento.cuenta, p_concepto: asiento.concepto },
                      'Asiento creado y conciliado.',
                    )
                  }
                >
                  <BookPlus size={14} /> Crear asiento
                </button>
              </div>
              <div className="mt-1 text-[11px] text-[#555]">
                Banco {actual.importe > 0 ? 'al Debe' : 'al Haber'} ({banco?.cuenta_contable}) contra la cuenta que pongas.
              </div>
            </GwGroup>
            <GwGroup title="Crear regla (para que la próxima vez lo haga solo)">
              {regla ? (
                <div className="flex flex-wrap items-end gap-1.5">
                  <GwField label="Si el concepto contiene">
                    <GwInput value={regla.texto} onChange={(e) => setRegla({ ...regla, texto: e.target.value.toUpperCase() })} className="w-[150px]" />
                  </GwField>
                  <GwField label="Va a la cuenta">
                    <GwInput
                      value={regla.cuenta}
                      onChange={(e) => setRegla({ ...regla, cuenta: e.target.value.replace(/\D/g, '') })}
                      className="w-[90px] font-mono"
                    />
                  </GwField>
                  <GwField label="Nombre (concepto del asiento)">
                    <GwInput value={regla.nombre} onChange={(e) => setRegla({ ...regla, nombre: e.target.value })} className="w-[150px]" />
                  </GwField>
                  <GwField label="Solo">
                    <GwSelect value={regla.sentido} onChange={(e) => setRegla({ ...regla, sentido: e.target.value })} className="w-[90px]">
                      <option value="cargo">cargos</option>
                      <option value="abono">abonos</option>
                      <option value="ambos">los dos</option>
                    </GwSelect>
                  </GwField>
                  <button type="button" className="gw-btn font-bold" disabled={!regla.texto.trim() || !regla.cuenta} onClick={() => void guardarRegla()}>
                    Guardar regla
                  </button>
                  <button type="button" className="gw-btn" onClick={() => setRegla(null)}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="gw-btn"
                  onClick={() =>
                    setRegla({ texto: textoRegla(actual), cuenta: asiento.cuenta, nombre: textoRegla(actual), sentido: actual.importe < 0 ? 'cargo' : 'abono' })
                  }
                >
                  <ListChecks size={14} /> Crear regla con este movimiento
                </button>
              )}
            </GwGroup>
            <button
              type="button"
              className="gw-btn self-start"
              onClick={() => {
                const nota = window.prompt('Nota (p. ej. «ya contabilizado en CONTANET»):', '')
                if (nota != null) void rpc('fn_concilia_marcar', { p_mov: actual.id, p_nota: nota }, 'Marcado como conciliado.')
              }}
            >
              Marcar conciliado sin documento
            </button>
          </div>
        </div>
      )}

      {verBancos && <CuentasBancarias onCerrar={() => setVerBancos(false)} onCambio={cargarBancos} />}
      {verReglas && <Reglas onCerrar={() => setVerReglas(false)} />}
    </div>
  )
}

function CuentasBancarias({ onCerrar, onCambio }: { onCerrar: () => void; onCambio: () => void }) {
  const [lista, setLista] = useState<BancoCuenta[]>([])
  const [error, setError] = useState<string | null>(null)
  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from('banco_cuenta').select('*').order('nombre')
    if (e) return setError(e.message)
    setLista((data ?? []) as BancoCuenta[])
  }, [])
  useEffect(() => {
    void cargar()
  }, [cargar])
  const guardar = async (b: BancoCuenta, cambios: Partial<BancoCuenta>) => {
    const { error: e } = await supabase.from('banco_cuenta').update(cambios).eq('id', b.id)
    if (e) return setError(e.message)
    await cargar()
    onCambio()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-16" onKeyDown={(e) => e.key === 'Escape' && onCerrar()}>
      <GwWindow title="Cuentas bancarias" onClose={onCerrar} className="w-[860px] max-w-[95vw]">
        <div className="flex flex-col gap-1.5 text-[13px]">
          <div className="text-[12px] text-[#555]">
            Se crean solas al importar el primer Norma 43 de cada cuenta. Aquí se pone su nombre y la subcuenta contable (p. ej. Santander 57205740) y la de
            comisiones.
          </div>
          <Aviso error={error} />
          <table className="gw-grid">
            <thead>
              <tr>
                <th>Nombre</th>
                <th className="w-[160px]">Entidad · oficina · cuenta</th>
                <th className="w-[100px]">Subcuenta 572</th>
                <th className="w-[100px]">Comisiones</th>
                <th className="w-[60px]">Activa</th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 && <Vacio cols={5} texto="Todavía no hay ninguna: importa un Norma 43." />}
              {lista.map((b) => (
                <tr key={b.id}>
                  <td>
                    <input
                      className="gw-input h-[22px] w-full"
                      defaultValue={b.nombre}
                      onBlur={(e) => e.target.value !== b.nombre && void guardar(b, { nombre: e.target.value })}
                    />
                  </td>
                  <td className="font-mono text-[12px]">
                    {b.entidad} {ENTIDADES[b.entidad] ? `(${ENTIDADES[b.entidad]})` : ''} · {b.oficina} · …{b.numero_cuenta.slice(-4)}
                  </td>
                  <td>
                    <input
                      className="gw-input h-[22px] w-full font-mono"
                      defaultValue={b.cuenta_contable}
                      onBlur={(e) => e.target.value !== b.cuenta_contable && void guardar(b, { cuenta_contable: e.target.value.replace(/\D/g, '') })}
                    />
                  </td>
                  <td>
                    <input
                      className="gw-input h-[22px] w-full font-mono"
                      defaultValue={b.cuenta_comisiones}
                      onBlur={(e) => e.target.value !== b.cuenta_comisiones && void guardar(b, { cuenta_comisiones: e.target.value.replace(/\D/g, '') })}
                    />
                  </td>
                  <td className="text-center">
                    <input type="checkbox" checked={b.activo} onChange={(e) => void guardar(b, { activo: e.target.checked })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GwWindow>
    </div>
  )
}

function Reglas({ onCerrar }: { onCerrar: () => void }) {
  const [lista, setLista] = useState<Regla[]>([])
  const [error, setError] = useState<string | null>(null)
  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from('conciliacion_regla').select('*').order('nombre')
    if (e) return setError(e.message)
    setLista((data ?? []) as Regla[])
  }, [])
  useEffect(() => {
    void cargar()
  }, [cargar])
  const cambiar = async (r: Regla, cambios: Partial<Regla>) => {
    const { error: e } = await supabase.from('conciliacion_regla').update(cambios).eq('id', r.id)
    if (e) return setError(e.message)
    await cargar()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-16" onKeyDown={(e) => e.key === 'Escape' && onCerrar()}>
      <GwWindow title="Reglas de conciliación" onClose={onCerrar} className="w-[860px] max-w-[95vw]">
        <div className="flex flex-col gap-1.5 text-[13px]">
          <div className="text-[12px] text-[#555]">
            Se crean desde un movimiento («Crear regla con este movimiento»). Cuando el concepto del banco contiene el texto, el movimiento sale en verde y al
            confirmarlo se hace el asiento contra la cuenta.
          </div>
          <Aviso error={error} />
          <div className="max-h-[60vh] overflow-auto">
            <table className="gw-grid">
              <thead className="sticky top-0">
                <tr>
                  <th>Nombre</th>
                  <th>Si el concepto contiene</th>
                  <th className="w-[70px]">Solo</th>
                  <th className="w-[90px]">Cuenta</th>
                  <th className="w-[60px] text-right!">Usada</th>
                  <th className="w-[80px]">Última vez</th>
                  <th className="w-[60px]">Activa</th>
                </tr>
              </thead>
              <tbody>
                {lista.length === 0 && <Vacio cols={7} texto="Todavía no hay reglas." />}
                {lista.map((r) => (
                  <tr key={r.id} className={r.activa ? '' : 'text-[#888]'}>
                    <td>{r.nombre}</td>
                    <td className="font-mono">{r.texto}</td>
                    <td>{r.sentido === 'ambos' ? 'los dos' : `${r.sentido}s`}</td>
                    <td className="font-mono">{r.cuenta_contrapartida}</td>
                    <td className="text-right">{r.veces}</td>
                    <td>{fechaEs(r.ultima_vez)}</td>
                    <td className="text-center">
                      <input type="checkbox" checked={r.activa} onChange={(e) => void cambiar(r, { activa: e.target.checked })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </GwWindow>
    </div>
  )
}

function OperativaConciliacion() {
  return (
    <div className="border border-[var(--gw-border)] bg-white p-2">
      <GwOperativa
        bloques={[
          {
            titulo: '1. Traer los movimientos del banco',
            pasos: [
              'En la web de cada banco (Santander, BBVA, CaixaBank, Cajasiete) descarga los movimientos en formato «Norma 43» (o «Cuaderno 43»).',
              'Arrastra los ficheros al recuadro «Arrastra aquí los Norma 43» (puedes soltar los de los cuatro bancos a la vez) o pulsa en él para elegirlos.',
              'Cada fichero va solo a su cuenta bancaria. Si una cuenta es nueva, se crea: entra en «Cuentas bancarias» y pon su subcuenta 572 (p. ej. Santander 57205740).',
              'No pasa nada por importar dos veces el mismo periodo o fechas que se solapan: un movimiento nunca entra repetido.',
            ],
          },
          {
            titulo: '2. El semáforo',
            pasos: [
              'Al importar se buscan solas las propuestas (o pulsa «Buscar propuestas»).',
              '🟢 Seguro: mismo importe y fecha con un solo apunte posible, o con el nombre del cliente en el concepto, o una regla. Pulsa «Confirmar las verdes» y se casan todas de golpe.',
              '🟡 Revisar: hay una propuesta pero con dudas (varios posibles, varias facturas, datáfono…). Pincha el movimiento, lee el porqué y pulsa «Aceptar» o «No es esto».',
              '🔴 Sin casar: cásalo a mano (marca uno o varios apuntes hasta que la suma coincida y pulsa «Casar»), crea el asiento, o crea una regla.',
              '✔ Conciliado. Si te equivocas, pincha y «Deshacer» (si se había hecho un asiento, se anula).',
            ],
          },
          {
            titulo: '3. Qué busca solo',
            notas: [
              'Reglas: «cuando el concepto diga ENDESA, va a la 628…». Se crean desde un movimiento con «Crear regla con este movimiento» y desde entonces se aplican solas.',
              'Un apunte de la cuenta del banco con el mismo importe (± los días que pongas arriba).',
              'Una transferencia que paga varias facturas del mismo cliente: busca las que suman justo el importe.',
              'Datáfono: las ventas con tarjeta de los días anteriores menos la comisión (hasta un 3,5 %); al aceptarlo hace el asiento con la comisión aparte.',
              'Cobros y pagos del ERP con el mismo importe.',
            ],
          },
          {
            titulo: 'Bueno es saber',
            notas: [
              'Arriba a la derecha: saldo del banco y saldo contable de la cuenta. Si cuadran sale ✔ Cuadra.',
              '«Apuntes sin casar»: lo que está en la contabilidad y no ha salido todavía en el banco (cheques, remesas pendientes…).',
              'Todo queda en la auditoría (quién casó qué y cuándo).',
            ],
          },
        ]}
      />
    </div>
  )
}
