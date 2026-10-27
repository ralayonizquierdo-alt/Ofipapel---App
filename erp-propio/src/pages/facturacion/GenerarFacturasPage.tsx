import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, CheckSquare, Search, Settings2, Square, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwCheck, GwDate, GwField, GwGroup, GwInput, GwLookupButton, GwRadio, GwSelect, GwTextArea, GwWindow, formatGw } from '../../components/gw'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { gwConCeros } from '../../components/gw/GwListaOrdenada'
import { FilasVacias } from '../../components/gw/GwGridParts'
import { cargarLineas, desgloseAlbaran, fechaEs, hoy, n, r2 } from './facturaModel'

// «Generar Facturas» (Facturación → Generar Facturas en GeminisWin: «Generar facturación mensual,
// etc»). Busca los ALBARANES pendientes (ventas a crédito sin factura, no anuladas ni aplazadas),
// los agrupa por cliente y genera una factura por cliente (o por albarán) en una sola
// transacción (fn_facturar_albaranes): cada factura lleva su registro VeriFactu y sus albaranes
// quedan bloqueados.

interface Pendiente {
  tienda_terminal_codigo: string
  numero: number
  fecha: string
  cliente_codigo: string
  nombre_cliente: string | null
  forma_pago_codigo: string | null
  subtotal_2: number
  total_igic_pie: number
  total: number
  total_pagado: number
  observaciones: string | null
  marcado: boolean
}

interface ClienteInfo {
  codigo: string
  nombre: string
  nif: string | null
  tipo_factura_global: number | null
  forma_pago_codigo: string | null
}

interface Grupo {
  cliente: string
  nombre: string
  nif: string | null
  tipoGlobal: number | null
  albaranes: Pendiente[]
}

const primeroDeMes = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('sv-SE')
}

export function GenerarFacturasPage() {
  const navigate = useNavigate()
  const [tiendas, setTiendas] = useState<string[]>([])
  const [series, setSeries] = useState<{ tienda_terminal_codigo: string; serie: string; digito_control: string; descripcion: string | null; es_serie_rectificativas: boolean }[]>([])
  const [formasPago, setFormasPago] = useState<{ codigo: string; descripcion: string }[]>([])

  // Filtros
  const [fDesde, setFDesde] = useState<string | null>(primeroDeMes())
  const [fHasta, setFHasta] = useState<string | null>(hoy())
  const [tDesde, setTDesde] = useState('')
  const [tHasta, setTHasta] = useState('')
  const [cDesde, setCDesde] = useState('')
  const [cHasta, setCHasta] = useState('')
  const [fpModo, setFpModo] = useState<'cualquiera' | 'una'>('cualquiera')
  const [fp, setFp] = useState('')
  const [tipoGlobal, setTipoGlobal] = useState<string>('')
  // Generación
  const [fechaFactura, setFechaFactura] = useState<string | null>(hoy())
  const [tiendaFactura, setTiendaFactura] = useState('')
  const [serie, setSerie] = useState('')
  const [porAlbaran, setPorAlbaran] = useState(false)
  const [observaciones, setObservaciones] = useState('')

  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [clientes, setClientes] = useState<Map<string, ClienteInfo>>(new Map())
  const [buscado, setBuscado] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [selGrupo, setSelGrupo] = useState(0)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creadas, setCreadas] = useState<{ t: string; numero: number; serie: string; n_factura: number; cliente: string; total: number; tipo: string; albaranes: number }[]>([])
  const [lookup, setLookup] = useState<null | 'cDesde' | 'cHasta'>(null)
  const [nuevaSerie, setNuevaSerie] = useState(false)

  async function cargarSeries() {
    const { data } = await supabase.from('serie_facturacion').select('tienda_terminal_codigo, serie, digito_control, descripcion, es_serie_rectificativas').order('serie')
    setSeries((data ?? []) as never)
  }

  useEffect(() => {
    Promise.all([
      supabase.from('tienda_terminal').select('codigo').order('codigo'),
      supabase.from('forma_pago').select('codigo, descripcion').order('codigo'),
    ]).then(([t, f]) => {
      setTiendas((t.data ?? []).map((r) => r.codigo as string))
      setFormasPago((f.data ?? []) as { codigo: string; descripcion: string }[])
    })
    cargarSeries()
  }, [])

  const seriesTienda = series.filter((s) => s.tienda_terminal_codigo === tiendaFactura && !s.es_serie_rectificativas)

  async function buscar() {
    setBuscando(true)
    setError(null)
    setMensaje(null)
    setCreadas([])
    let q = supabase
      .from('venta')
      .select('tienda_terminal_codigo, numero, fecha, cliente_codigo, nombre_cliente, forma_pago_codigo, subtotal_2, total_igic_pie, total, total_pagado, observaciones')
      .ilike('tipo_credito', 'cr%')
      .is('factura_numero', null)
      .is('anulada_en', null)
      .eq('aplazada', false)
    if (fDesde) q = q.gte('fecha', fDesde)
    if (fHasta) q = q.lte('fecha', fHasta)
    if (tDesde) q = q.gte('tienda_terminal_codigo', tDesde)
    if (tHasta) q = q.lte('tienda_terminal_codigo', tHasta)
    if (cDesde) q = q.gte('cliente_codigo', gwConCeros(cDesde))
    if (cHasta) q = q.lte('cliente_codigo', gwConCeros(cHasta))
    if (fpModo === 'una' && fp) q = q.eq('forma_pago_codigo', fp)
    const { data, error: e } = await q.order('cliente_codigo').order('fecha').order('numero').limit(5000)
    if (e) {
      setBuscando(false)
      return setError(e.message)
    }
    let filas = ((data ?? []) as Record<string, unknown>[]).map((v) => ({
      tienda_terminal_codigo: v.tienda_terminal_codigo as string,
      numero: Number(v.numero),
      fecha: v.fecha as string,
      cliente_codigo: v.cliente_codigo as string,
      nombre_cliente: (v.nombre_cliente as string | null) ?? null,
      forma_pago_codigo: (v.forma_pago_codigo as string | null) ?? null,
      subtotal_2: n(v.subtotal_2 as number),
      total_igic_pie: n(v.total_igic_pie as number),
      total: n(v.total as number),
      total_pagado: n(v.total_pagado as number),
      observaciones: (v.observaciones as string | null) ?? null,
      marcado: true,
    }))
    const codigos = [...new Set(filas.map((f) => f.cliente_codigo))]
    const mapa = new Map<string, ClienteInfo>()
    for (let i = 0; i < codigos.length; i += 200) {
      const { data: cs } = await supabase
        .from('cliente')
        .select('codigo, nombre, nif, tipo_factura_global, forma_pago_codigo')
        .in('codigo', codigos.slice(i, i + 200))
      for (const c of (cs ?? []) as ClienteInfo[]) mapa.set(c.codigo, c)
    }
    if (tipoGlobal !== '') filas = filas.filter((f) => String(mapa.get(f.cliente_codigo)?.tipo_factura_global ?? '') === tipoGlobal)
    setClientes(mapa)
    setPendientes(filas)
    setSelGrupo(0)
    setBuscado(true)
    setBuscando(false)
  }

  const grupos = useMemo<Grupo[]>(() => {
    const m = new Map<string, Grupo>()
    for (const p of pendientes) {
      const c = clientes.get(p.cliente_codigo)
      const g = m.get(p.cliente_codigo) ?? {
        cliente: p.cliente_codigo,
        nombre: c?.nombre ?? p.nombre_cliente ?? '',
        nif: c?.nif ?? null,
        tipoGlobal: c?.tipo_factura_global ?? null,
        albaranes: [],
      }
      g.albaranes.push(p)
      m.set(p.cliente_codigo, g)
    }
    return [...m.values()]
  }, [pendientes, clientes])

  const tot = (ps: Pendiente[]) => ({
    base: r2(ps.reduce((s, p) => s + p.subtotal_2, 0)),
    igic: r2(ps.reduce((s, p) => s + p.total_igic_pie, 0)),
    total: r2(ps.reduce((s, p) => s + p.total, 0)),
  })
  const marcados = pendientes.filter((p) => p.marcado)
  const totMarcados = tot(marcados)
  const clientesMarcados = new Set(marcados.map((p) => p.cliente_codigo)).size
  const grupo = grupos[selGrupo] ?? null

  function marcar(pred: (p: Pendiente) => boolean, valor: boolean) {
    setPendientes((ps) => ps.map((p) => (pred(p) ? { ...p, marcado: valor } : p)))
  }

  async function generar() {
    if (marcados.length === 0) return setError('No hay albaranes marcados.')
    if (!fechaFactura) return setError('Indica la fecha de las facturas.')
    // Aviso: en las facturas se usa el desglose de IGIC calculado sobre las líneas de cada albarán.
    const nFact = porAlbaran ? marcados.length : clientesMarcados
    if (
      !confirm(
        `Se van a emitir ${nFact} factura(s) con ${marcados.length} albarán(es), por ${formatGw(totMarcados.total, 2)} €.\n\nCada factura genera su registro VeriFactu y sus albaranes quedan bloqueados. ¿Continuar?`,
      )
    )
      return
    setGenerando(true)
    setError(null)
    const { data, error: e } = await supabase.rpc('fn_facturar_albaranes', {
      p_albaranes: marcados.map((p) => ({ t: p.tienda_terminal_codigo, n: p.numero })),
      p_fecha_factura: fechaFactura,
      p_tienda_factura: tiendaFactura || null,
      p_serie: serie || null,
      p_fecha_desde: fDesde,
      p_fecha_hasta: fHasta,
      p_por_albaran: porAlbaran,
      p_observaciones: observaciones.trim() || null,
    })
    setGenerando(false)
    if (e) return setError(`No se ha facturado nada: ${e.message}`)
    const lista = (data ?? []) as typeof creadas
    setCreadas(lista)
    setMensaje(`Generadas ${lista.length} factura(s).`)
    setPendientes((ps) => ps.filter((p) => !p.marcado))
  }

  /** Comprueba el desglose de IGIC del cliente seleccionado sobre sus líneas (como lo hará la factura). */
  const [desglose, setDesglose] = useState<{ pct: number; base: number; cuota: number }[] | null>(null)
  useEffect(() => {
    setDesglose(null)
    if (!grupo) return
    let vivo = true
    const albs = grupo.albaranes.filter((a) => a.marcado)
    cargarLineas(albs.map((a) => ({ t: a.tienda_terminal_codigo, n: a.numero }))).then(async (ls) => {
      const { data } = await supabase
        .from('venta')
        .select('tienda_terminal_codigo, numero, descuento_pie_pct, igic_pie_pct, subtotal_2, total_igic_pie')
        .eq('cliente_codigo', grupo.cliente)
        .is('factura_numero', null)
        .in('numero', albs.map((a) => a.numero))
      const acc = new Map<number, { base: number; cuota: number }>()
      for (const v of (data ?? []) as Record<string, unknown>[]) {
        if (!albs.some((a) => a.tienda_terminal_codigo === v.tienda_terminal_codigo && a.numero === Number(v.numero))) continue
        const d = desgloseAlbaran(v as never, ls.filter((l) => l.tienda_terminal_codigo === v.tienda_terminal_codigo && Number(l.numero) === Number(v.numero)))
        for (const [k, b] of Object.entries(d.bases)) {
          const x = acc.get(Number(k)) ?? { base: 0, cuota: 0 }
          acc.set(Number(k), { base: r2(x.base + b), cuota: r2(x.cuota + (d.cuotas[k] ?? 0)) })
        }
      }
      if (vivo) setDesglose([...acc.entries()].sort((a, b) => a[0] - b[0]).map(([pct, x]) => ({ pct, ...x })))
    })
    return () => {
      vivo = false
    }
  }, [grupo])

  const etq = (t: string) => <span className="text-[15px]">{t}</span>
  const num = 'text-right tabular-nums'

  return (
    <div className="flex flex-col gap-1">
      {/* Filtros */}
      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,1.3fr)] gap-2">
        <GwGroup title={etq('Fecha de los albaranes')}>
          <div className="flex items-center gap-1.5 text-[14px]">
            Desde
            <GwDate value={fDesde} onChange={setFDesde} />
            Hasta
            <GwDate value={fHasta} onChange={setFHasta} />
          </div>
        </GwGroup>
        <GwGroup title={etq('Tiendas')}>
          <div className="flex items-center gap-1.5 text-[14px]">
            Desde:
            <GwSelect className="!w-[66px]" value={tDesde} onChange={(e) => setTDesde(e.target.value)}>
              <option value="" />
              {tiendas.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </GwSelect>
            Hasta:
            <GwSelect className="!w-[66px]" value={tHasta} onChange={(e) => setTHasta(e.target.value)}>
              <option value="" />
              {tiendas.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </GwSelect>
          </div>
        </GwGroup>
        <GwGroup title={etq('Clientes')}>
          <div className="flex items-center gap-1 text-[14px]">
            Desde
            <GwInput className="!w-[90px]" value={cDesde} onChange={(e) => setCDesde(e.target.value)} onBlur={() => cDesde && setCDesde(gwConCeros(cDesde))} />
            <GwLookupButton onClick={() => setLookup('cDesde')} title="Buscar cliente" />
            Hasta
            <GwInput className="!w-[90px]" value={cHasta} onChange={(e) => setCHasta(e.target.value)} onBlur={() => cHasta && setCHasta(gwConCeros(cHasta))} />
            <GwLookupButton onClick={() => setLookup('cHasta')} title="Buscar cliente" />
          </div>
        </GwGroup>
      </div>
      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,1.3fr)] gap-2">
        <GwGroup title={etq('Forma de pago')}>
          <div className="flex items-center gap-2 text-[14px]">
            <GwRadio name="fp" label="Cualquiera" checked={fpModo === 'cualquiera'} onChange={() => setFpModo('cualquiera')} />
            <GwRadio name="fp" label="Sólo" checked={fpModo === 'una'} onChange={() => setFpModo('una')} />
            <GwSelect disabled={fpModo !== 'una'} value={fp} onChange={(e) => setFp(e.target.value)}>
              <option value="" />
              {formasPago.map((f) => (
                <option key={f.codigo} value={f.codigo}>
                  {f.codigo} {f.descripcion}
                </option>
              ))}
            </GwSelect>
          </div>
        </GwGroup>
        <GwGroup title={etq('Tipo de factura global')}>
          <GwSelect value={tipoGlobal} onChange={(e) => setTipoGlobal(e.target.value)} title="Tipo de factura global de la ficha del cliente">
            <option value="">Cualquiera</option>
            {[0, 1, 2, 3, 4].map((t) => (
              <option key={t} value={String(t)}>
                Tipo {t}
              </option>
            ))}
          </GwSelect>
        </GwGroup>
        <div className="flex items-end justify-end gap-1.5 pb-0.5">
          <button type="button" className="gw-btn h-[38px] w-[200px] gap-1.5 text-[16px]" disabled={buscando} onClick={buscar}>
            <Search size={16} />
            {buscando ? 'Buscando…' : 'Buscar albaranes'}
          </button>
        </div>
      </div>

      {/* Albaranes pendientes agrupados por cliente */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[14px] text-[#1a4fd0]">Clientes con albaranes pendientes de facturar: {grupos.length}</span>
          <div className="h-[290px] overflow-auto border border-[var(--gw-border)] bg-white">
            <table className="gw-grid">
              <thead className="sticky top-0">
                <tr>
                  <th style={{ width: 28 }} />
                  <th style={{ width: 70 }}>Cliente</th>
                  <th>Nombre</th>
                  <th style={{ width: 36 }} title="Tipo de factura global">T.G.</th>
                  <th className="text-center!" style={{ width: 44 }}>Alb.</th>
                  <th className="text-center!" style={{ width: 92 }}>Base</th>
                  <th className="text-center!" style={{ width: 92 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g, i) => {
                  const m = g.albaranes.filter((a) => a.marcado)
                  const t = tot(m)
                  const todos = m.length === g.albaranes.length
                  return (
                    <tr key={g.cliente} className={i === selGrupo ? 'gw-selected' : ''} onClick={() => setSelGrupo(i)}>
                      <td className="text-center">
                        <input
                          type="checkbox"
                          className="m-0 h-[13px] w-[13px] accent-[#0078d7]"
                          checked={m.length > 0}
                          ref={(el) => {
                            if (el) el.indeterminate = m.length > 0 && !todos
                          }}
                          onChange={(e) => marcar((p) => p.cliente_codigo === g.cliente, e.target.checked)}
                        />
                      </td>
                      <td>{g.cliente}</td>
                      <td className="truncate" title={g.nif ? `NIF ${g.nif}` : 'Sin NIF: factura simplificada (F2)'}>
                        {g.nombre}
                        {!g.nif && <span className={i === selGrupo ? '' : 'text-[#c42b1c]'}> (sin NIF)</span>}
                      </td>
                      <td className="text-center">{g.tipoGlobal ?? ''}</td>
                      <td className={num}>
                        {m.length}/{g.albaranes.length}
                      </td>
                      <td className={num}>{formatGw(t.base, 2)}</td>
                      <td className={num}>{formatGw(t.total, 2)}</td>
                    </tr>
                  )
                })}
                {buscado && grupos.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-[#6d6d6d]">
                      No hay albaranes pendientes de facturar con esos filtros.
                    </td>
                  </tr>
                )}
                <FilasVacias cols={7} ocupadas={grupos.length + (buscado && grupos.length === 0 ? 1 : 0)} total={12} />
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[14px] text-[#1a4fd0]">
            Albaranes de {grupo ? `${grupo.cliente} ${grupo.nombre}` : '—'}
          </span>
          <div className="h-[186px] overflow-auto border border-[var(--gw-border)] bg-white">
            <table className="gw-grid">
              <thead className="sticky top-0">
                <tr>
                  <th style={{ width: 28 }} />
                  <th style={{ width: 36 }}>Ti.</th>
                  <th className="text-center!" style={{ width: 82 }}>Id. Venta</th>
                  <th style={{ width: 92 }}>Fecha</th>
                  <th className="text-center!" style={{ width: 86 }}>Base</th>
                  <th className="text-center!" style={{ width: 76 }}>IGIC</th>
                  <th className="text-center!" style={{ width: 86 }}>Total</th>
                  <th>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {(grupo?.albaranes ?? []).map((a) => (
                  <tr key={`${a.tienda_terminal_codigo}-${a.numero}`} onDoubleClick={() => navigate(`/ventas/${a.tienda_terminal_codigo}/${a.numero}`)}>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        className="m-0 h-[13px] w-[13px] accent-[#0078d7]"
                        checked={a.marcado}
                        onChange={(e) => marcar((p) => p.tienda_terminal_codigo === a.tienda_terminal_codigo && p.numero === a.numero, e.target.checked)}
                      />
                    </td>
                    <td>{a.tienda_terminal_codigo}</td>
                    <td className={num}>{a.numero}</td>
                    <td>{fechaEs(a.fecha)}</td>
                    <td className={num}>{formatGw(a.subtotal_2, 2)}</td>
                    <td className={num}>{formatGw(a.total_igic_pie, 2)}</td>
                    <td className={num}>{formatGw(a.total, 2)}</td>
                    <td className="truncate">{a.observaciones ?? ''}</td>
                  </tr>
                ))}
                <FilasVacias cols={8} ocupadas={grupo?.albaranes.length ?? 0} total={7} />
              </tbody>
            </table>
          </div>
          <div className="flex min-h-[80px] gap-2 border border-[var(--gw-border-light)] p-1 text-[13px]">
            <div className="flex-1">
              <div className="gw-label">Desglose de IGIC de la factura de este cliente</div>
              {desglose && desglose.length > 0 ? (
                <table className="w-full">
                  <tbody>
                    {desglose.map((d) => (
                      <tr key={d.pct}>
                        <td>IGIC {formatGw(d.pct, 1)} %</td>
                        <td className={num}>Base {formatGw(d.base, 2)}</td>
                        <td className={num}>Cuota {formatGw(d.cuota, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <span className="text-[#6d6d6d]">{grupo ? 'Calculando…' : 'Selecciona un cliente.'}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Datos de las facturas y botones */}
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-2">
        <GwGroup title={etq('Facturas a generar')}>
          <div className="grid grid-cols-[120px_80px_150px_minmax(0,1fr)] items-end gap-x-2 gap-y-1">
            <GwField label="Fecha factura">
              <GwDate value={fechaFactura} onChange={setFechaFactura} />
            </GwField>
            <GwField label="Tienda">
              <GwSelect
                value={tiendaFactura}
                onChange={(e) => {
                  setTiendaFactura(e.target.value)
                  setSerie('')
                }}
                title="Tienda en la que se numeran las facturas (vacío: la de cada albarán)"
              >
                <option value="">(alb.)</option>
                {tiendas.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </GwSelect>
            </GwField>
            <GwField label="D.C. / Serie">
              <div className="flex gap-1">
                <GwSelect value={serie} disabled={!tiendaFactura} onChange={(e) => setSerie(e.target.value)} title="Serie de facturación (vacío: la primera de la tienda)">
                  <option value="">{tiendaFactura ? (seriesTienda.length ? '(primera)' : '(sin series)') : '(de la tienda)'}</option>
                  {seriesTienda.map((s) => (
                    <option key={s.serie} value={s.serie}>
                      {s.digito_control} · {s.serie}
                    </option>
                  ))}
                </GwSelect>
                <button type="button" className="gw-btn w-[26px] flex-none px-0 font-bold" title="Nueva serie de facturación" onClick={() => setNuevaSerie(true)}>
                  +
                </button>
              </div>
            </GwField>
            <div className="flex flex-col gap-1 pb-0.5">
              <GwCheck label="Una factura por albarán" checked={porAlbaran} onChange={setPorAlbaran} />
            </div>
            <GwField label="Observaciones de las facturas" className="col-span-4">
              <GwTextArea rows={1} className="h-[26px]" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
            </GwField>
          </div>
        </GwGroup>
        <div className="flex flex-col justify-between gap-1">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 text-[15px]">
            <span>Albaranes marcados:</span>
            <span className={`${num} font-bold`}>{marcados.length}</span>
            <span>Facturas a emitir:</span>
            <span className={`${num} font-bold`}>{porAlbaran ? marcados.length : clientesMarcados}</span>
            <span>Base · IGIC:</span>
            <span className={`${num} font-bold`}>
              {formatGw(totMarcados.base, 2)} · {formatGw(totMarcados.igic, 2)}
            </span>
            <span className="text-[16px] font-bold">Total:</span>
            <span className={`${num} text-[16px] font-bold`}>{formatGw(totMarcados.total, 2)}</span>
          </div>
          <div className="grid grid-cols-[1fr_1fr_1.4fr_1fr] gap-1">
            <button type="button" className="gw-btn h-[38px] gap-1 text-[14px]" onClick={() => marcar(() => true, true)} disabled={!pendientes.length}>
              <CheckSquare size={15} /> Marcar
            </button>
            <button type="button" className="gw-btn h-[38px] gap-1 text-[14px]" onClick={() => marcar(() => true, false)} disabled={!pendientes.length}>
              <Square size={15} /> Desmarcar
            </button>
            <button type="button" className="gw-btn h-[38px] gap-1.5 text-[15px] font-bold" onClick={generar} disabled={generando || marcados.length === 0}>
              <Settings2 size={16} />
              {generando ? 'Generando…' : 'Generar Facturas'}
            </button>
            <button type="button" className="gw-btn h-[38px] gap-1 text-[14px]" onClick={() => navigate('/facturacion')}>
              <X size={15} className="text-[#c42b1c]" /> Cerrar
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-[22px] text-[13px]">
        {error && <span className="text-[#c42b1c]">{error}</span>}
        {!error && mensaje && (
          <span className="text-[#127a12]">
            {mensaje}{' '}
            {creadas.map((c) => (
              <button
                key={`${c.t}-${c.numero}`}
                type="button"
                className="mx-0.5 underline"
                onClick={() => navigate(`/facturacion/${c.t}/${c.numero}`)}
                title={`Cliente ${c.cliente} · ${c.albaranes} albarán(es) · ${c.tipo}`}
              >
                {c.serie}-{c.n_factura} ({formatGw(n(c.total), 2)})
              </button>
            ))}
          </span>
        )}
        {!error && !mensaje && (
          <span className="text-[#555]">
            Albaranes = ventas a crédito sin facturar (ni anuladas ni aplazadas). Cada factura genera su registro VeriFactu y bloquea sus albaranes.
          </span>
        )}
      </div>

      {lookup && (
        <GwLookupDialog<Record<string, unknown>>
          title="Clientes"
          table="cliente"
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'nombre', label: 'Nombre' },
            { key: 'nif', label: 'NIF', width: 110 },
          ]}
          searchColumns={['codigo', 'nombre', 'nif']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            if (lookup === 'cDesde') setCDesde(r.codigo as string)
            else setCHasta(r.codigo as string)
            setLookup(null)
          }}
          onClose={() => setLookup(null)}
        />
      )}
      {nuevaSerie && (
        <NuevaSerieDialog
          tiendas={tiendas}
          tienda={tiendaFactura}
          onClose={() => setNuevaSerie(false)}
          onHecho={async (t, s) => {
            setNuevaSerie(false)
            await cargarSeries()
            setTiendaFactura(t)
            setSerie(s)
          }}
        />
      )}
    </div>
  )
}

function NuevaSerieDialog({
  tiendas,
  tienda: tiendaIni,
  onClose,
  onHecho,
}: {
  tiendas: string[]
  tienda: string
  onClose: () => void
  onHecho: (tienda: string, serie: string) => void
}) {
  const [tienda, setTienda] = useState(tiendaIni || tiendas[0] || '')
  const [serie, setSerie] = useState('')
  const [dc, setDc] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [rect, setRect] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function aceptar() {
    if (!tienda || !serie.trim() || !dc.trim()) return setError('Tienda, serie y D.C. son obligatorios.')
    const { error: e } = await supabase.from('serie_facturacion').insert({
      tienda_terminal_codigo: tienda,
      serie: serie.trim().toUpperCase(),
      digito_control: dc.trim(),
      descripcion: descripcion.trim() || null,
      tipo_factura_defecto: 'F1',
      es_serie_rectificativas: rect,
      activa_verifactu: true,
    })
    if (e) return setError(e.message)
    onHecho(tienda, rect ? '' : serie.trim().toUpperCase())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-24" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title="Nueva serie de facturación" onClose={onClose} className="w-[460px]">
        <div className="grid grid-cols-[80px_110px_80px_minmax(0,1fr)] gap-x-1.5 gap-y-1">
          <GwField label="Tienda">
            <GwSelect value={tienda} onChange={(e) => setTienda(e.target.value)}>
              {tiendas.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </GwSelect>
          </GwField>
          <GwField label="Serie">
            <GwInput autoFocus value={serie} maxLength={10} onChange={(e) => setSerie(e.target.value)} />
          </GwField>
          <GwField label="D.C.">
            <GwInput value={dc} maxLength={4} onChange={(e) => setDc(e.target.value)} />
          </GwField>
          <GwField label="Descripción">
            <GwInput value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </GwField>
          <GwCheck className="col-span-4" label="Serie de rectificativas" checked={rect} onChange={setRect} />
        </div>
        {error && <p className="mt-1 text-[13px] text-[#c42b1c]">{error}</p>}
        <div className="mt-2 flex justify-end gap-1.5">
          <button type="button" className="gw-btn w-[110px]" onClick={aceptar}>
            <Check size={14} strokeWidth={3} className="text-[#127a12]" />
            <u>A</u>ceptar
          </button>
          <button type="button" className="gw-btn w-[110px]" onClick={onClose}>
            <X size={14} strokeWidth={3} className="text-[#c42b1c]" />
            <u>C</u>ancelar
          </button>
        </div>
      </GwWindow>
    </div>
  )
}
