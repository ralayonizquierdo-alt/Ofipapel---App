import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, DoorOpen, Download, Search } from 'lucide-react'
import { nombreEstadoWeb, type WcPedido } from '../../lib/woocommerce'
import { indexarArticulos, proponerPedido, type ClienteCruce, type ConfigImportacion, type IndiceArticulos, type PedidoPropuesto } from '../../lib/webMapeo'
import {
  cargarArticulos,
  cargarPedidosErpWeb,
  cargarClientes,
  cargarConfigWeb,
  eur,
  fechaHoraEs,
  filtroWebInicial,
  FiltroFechas,
  Nota,
  Tabla,
  useEmpleadoActual,
  WebError,
  ESTILO_FALTA,
  type Col,
  type PedidoErpWeb,
} from './comun'
import { cargarPedidosWeb } from './pedidosWeb'
import { importarPedido } from './importar'

interface Fila {
  p: WcPedido
  prop: PedidoPropuesto
  erp: PedidoErpWeb | undefined
}

/** Web → Importar Pedidos Web: lee los pedidos de WooCommerce y los graba como pedidos de cliente en el ERP. */
export function ImportarPedidosWebPage() {
  const navigate = useNavigate()
  const empleado = useEmpleadoActual()
  const [filtro, setFiltro] = useState(() => filtroWebInicial('El Mes pasado y actual', ''))
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [pedidos, setPedidos] = useState<WcPedido[] | null>(null)
  const [erp, setErp] = useState<Map<number, PedidoErpWeb>>(new Map())
  const [truncado, setTruncado] = useState(false)
  const [ctx, setCtx] = useState<{ ix: IndiceArticulos; clientes: ClienteCruce[]; cfg: ConfigImportacion } | null>(null)
  const [sel, setSel] = useState(0)
  const [soloPendientes, setSoloPendientes] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)

  async function prepararCtx() {
    if (ctx) return ctx
    const [{ arts, barras }, clientes, cfg] = await Promise.all([cargarArticulos(), cargarClientes(), cargarConfigWeb()])
    const c = { ix: indexarArticulos(arts, barras), clientes, cfg }
    setCtx(c)
    return c
  }

  async function buscar() {
    setCargando(true)
    setError(null)
    setMsg(null)
    try {
      await prepararCtx()
      const r = await cargarPedidosWeb(filtro)
      setPedidos(r.pedidos)
      setErp(r.erp)
      setTruncado(r.truncado)
      setSel(0)
    } catch (e) {
      setError(e)
    }
    setCargando(false)
  }

  useEffect(() => {
    buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filas: Fila[] = useMemo(() => {
    if (!pedidos || !ctx) return []
    const generico = ctx.cfg.cliente_generico_codigo ? ctx.clientes.find((c) => c.codigo === ctx.cfg.cliente_generico_codigo) ?? null : null
    return pedidos
      .map((p) => ({ p, prop: proponerPedido(p, ctx.ix, ctx.clientes, ctx.cfg, generico), erp: erp.get(p.id) }))
      .filter((f) => !soloPendientes || !f.erp)
  }, [pedidos, ctx, erp, soloPendientes])

  const actual = filas[sel] ?? null

  const cols: Col<Fila>[] = useMemo(
    () => [
      { key: 'num', label: 'Nº Web', width: 75, align: 'right', value: (r) => Number(r.p.number ?? r.p.id) },
      { key: 'fecha', label: 'Fecha', width: 120, value: (r) => r.p.date_created, render: (r) => fechaHoraEs(r.p.date_created) },
      { key: 'estado', label: 'Estado web', width: 120, value: (r) => nombreEstadoWeb(r.p.status) },
      { key: 'cliweb', label: 'Cliente en la web', width: 210, value: (r) => r.prop.nombre_cliente },
      { key: 'email', label: 'Email', width: 190, value: (r) => r.p.billing?.email ?? '' },
      { key: 'total', label: 'Total web', width: 85, align: 'right', value: (r) => r.prop.totalWeb, render: (r) => eur(r.prop.totalWeb) },
      { key: 'lin', label: 'Lín.', width: 45, align: 'right', value: (r) => r.p.line_items?.length ?? 0 },
      {
        key: 'cli',
        label: 'Cliente ERP',
        width: 175,
        value: (r) => (r.prop.cliente ? `${r.prop.cliente.codigo} (${r.prop.clienteVia})` : '— sin cliente —'),
        cellStyle: (r) => (!r.prop.cliente ? { color: '#c42b1c', fontWeight: 700 } : r.prop.clienteVia === 'genérico' ? ESTILO_FALTA : undefined),
      },
      {
        key: 'erp',
        label: 'Pedido ERP',
        width: 105,
        value: (r) => (r.erp ? `${r.erp.tienda}/${r.erp.numero}` : ''),
        cellStyle: (r) => (r.erp ? { color: '#127a12', fontWeight: 700 } : undefined),
      },
      {
        key: 'sit',
        label: 'Situación',
        width: 160,
        value: (r) => (r.erp ? 'Ya importado' : r.prop.bloqueos.length ? 'No importable' : r.prop.avisos.length ? `Con ${r.prop.avisos.length} aviso(s)` : 'Listo para importar'),
        cellStyle: (r) => (r.erp ? undefined : r.prop.bloqueos.length ? { color: '#c42b1c', fontWeight: 700 } : r.prop.avisos.length ? { color: '#b05a00' } : { color: '#127a12' }),
      },
    ],
    [],
  )

  const colsL: Col<PedidoPropuesto['lineas'][number]>[] = useMemo(
    () => [
      { key: 'sku', label: 'SKU web', width: 110, value: (l) => l.sku },
      { key: 'nombre', label: 'Producto en la web', width: 250, value: (l) => l.nombreWeb },
      {
        key: 'art',
        label: 'Artículo ERP',
        width: 120,
        value: (l) => l.articulo_codigo ?? '— no encontrado —',
        cellStyle: (l) => (!l.encontrado && l.tipo === 'articulo' ? { background: '#ffd6d6', color: '#8a1c1c', fontWeight: 700 } : undefined),
      },
      { key: 'via', label: 'Por', width: 80, value: (l) => l.via },
      { key: 'desc', label: 'Descripción ERP', width: 230, value: (l) => l.descripcion },
      { key: 'cant', label: 'Cant.', width: 60, align: 'right', value: (l) => l.cantidad },
      { key: 'precio', label: 'Precio', width: 75, align: 'right', value: (l) => l.precio, render: (l) => eur(l.precio) },
      { key: 'dto', label: '% Dto.', width: 60, align: 'right', value: (l) => l.descuento_pct, render: (l) => (l.descuento_pct ? eur(l.descuento_pct) : '') },
      { key: 'igic', label: '% IGIC', width: 60, align: 'right', value: (l) => l.igic_pct },
    ],
    [],
  )

  async function importar(lista: Fila[]) {
    if (!ctx || !lista.length) return
    const textos = lista.map((f) => f.prop.numeroWeb).join(', ')
    if (!confirm(`¿Importar en el ERP ${lista.length === 1 ? 'el pedido web' : `${lista.length} pedidos web`} ${textos}? (No se cambia nada en la web.)`)) return
    setImportando(true)
    const hechos: string[] = []
    const fallos: string[] = []
    for (const f of lista) {
      const r = await importarPedido(f.prop, ctx.cfg, empleado)
      if (r.ok) hechos.push(`${f.prop.numeroWeb} → ${r.tienda}/${r.numero}`)
      else fallos.push(`${f.prop.numeroWeb}: ${r.error}`)
    }
    const nuevoErp = await cargarPedidosErpWeb((pedidos ?? []).map((p) => p.id))
    setErp(nuevoErp)
    setSel(0)
    setMsg([hechos.length ? `Importados: ${hechos.join(', ')}.` : '', fallos.length ? `No importados: ${fallos.join(' · ')}` : ''].filter(Boolean).join(' '))
    setImportando(false)
  }

  const importables = filas.filter((f) => !f.erp && !f.prop.bloqueos.length)

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <FiltroFechas filtro={filtro} onChange={setFiltro}>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} /> Solo los no importados
        </label>
        <button type="button" className="gw-btn" onClick={buscar} disabled={cargando}>
          <Search size={14} /> {cargando ? 'Leyendo la web…' : 'Buscar en la web'}
        </button>
      </FiltroFechas>
      <WebError error={error} />
      {truncado && <Nota>Hay más pedidos de los que se han traído (tope de 2.000): acota las fechas.</Nota>}
      <Tabla rows={filas} cols={cols} rowKey={(r) => String(r.p.id)} sel={sel} onSel={setSel} vacio={pedidos ? 'No hay pedidos web con este filtro.' : 'Pulsa «Buscar en la web».'} />
      <div className="flex h-[230px] flex-none gap-1.5">
        <div className="flex min-w-0 flex-[3] flex-col gap-1">
          <span className="gw-label">Líneas que se grabarían en el pedido del ERP{actual ? ` (web nº ${actual.prop.numeroWeb})` : ''}:</span>
          <Tabla rows={actual?.prop.lineas ?? []} cols={colsL} rowKey={(l) => `${l.tipo}${l.sku}${l.nombreWeb}`} vacio="Selecciona un pedido." className="min-h-0!" />
        </div>
        <div className="flex min-w-0 flex-[2] flex-col gap-1">
          <span className="gw-label">
            Total ERP: <b>{actual ? eur(actual.prop.totalErp) : ''}</b> · Total web: <b>{actual ? eur(actual.prop.totalWeb) : ''}</b>
          </span>
          <div className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap border border-[var(--gw-border)] bg-white p-1 text-[12px]">
            {actual && (
              <>
                {actual.prop.bloqueos.map((b) => (
                  <div key={b} className="font-bold text-[#c42b1c]">
                    ✖ {b}
                  </div>
                ))}
                {actual.prop.avisos.map((a) => (
                  <div key={a} className="text-[#b05a00]">
                    ⚠ {a}
                  </div>
                ))}
                <div className="mt-1 text-[#333]">
                  <b>Observación:</b> {actual.prop.observaciones}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {msg && <div className="flex-none font-bold">{msg}</div>}
      <div className="flex flex-none flex-wrap items-center gap-2">
        <button type="button" className="gw-btn" disabled={!actual || !!actual.erp || !!actual.prop.bloqueos.length || importando} onClick={() => actual && importar([actual])}>
          <Download size={14} /> Importar seleccionado
        </button>
        <button type="button" className="gw-btn" disabled={!importables.length || importando} onClick={() => importar(importables)}>
          <Check size={14} /> Importar todos los listos ({importables.length})
        </button>
        <button type="button" className="gw-btn" disabled={!actual?.erp} onClick={() => actual?.erp && navigate(`/pedidos/${encodeURIComponent(actual.erp.tienda)}/${actual.erp.numero}`)}>
          Abrir pedido del ERP
        </button>
        <Nota>Solo se escribe en el ERP; la web no se toca. Un pedido web no se puede importar dos veces.</Nota>
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}
