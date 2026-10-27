import { useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Globe,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  Store,
  Truck,
  UserRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { BarrasApiladas, BarrasSimples, C, Card, ColumnasComparadas, GraficoHoras, Vacio } from './charts'
import { PERIODOS, REFRESCO_MS, fmtFecha, fmtNum, hoyCanarias, usePanelData, type PanelData, type Periodo } from './panelData'

// Panel de Control: pantalla que se abre al entrar. Operativo (lo ven todos los empleados):
// solo número de operaciones y unidades, nunca importes. Ver panelData.ts para el futuro panel
// económico de gerencia.

const leer = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const guardar = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export function PanelControlPage() {
  const navigate = useNavigate()
  const [tienda, setTienda] = useState(() => leer('panel.tienda') ?? '')
  const [periodo, setPeriodo] = useState<Periodo>(() => {
    const p = leer('panel.periodo')
    return PERIODOS.some((x) => x.value === p) ? (p as Periodo) : 'hoy'
  })
  const { data, cargando, error, actualizado, recargar } = usePanelData(tienda, periodo)
  const per = PERIODOS.find((p) => p.value === periodo)!
  const hoy = data?.meta.hoy ?? hoyCanarias()
  const diaSemana = DIAS[new Date(`${hoy}T12:00:00Z`).getUTCDay()]

  const abrir = (ruta: string) => navigate(ruta)

  return (
    <div
      className="flex min-h-full flex-col gap-1.5 bg-[#e9ebee] p-0.5 text-[12px]"
      style={{ '--panel-chart-h': 'clamp(140px, calc((100vh - 640px) / 2), 230px)' } as CSSProperties}
    >
      {/* Filtros: una sola fila, arriba, y afectan a todo lo de abajo */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-[#adadad] bg-[var(--gw-face)] px-2 py-1">
        <label className="flex items-center gap-1.5">
          <span className="gw-label">Tienda</span>
          <select
            className="gw-input !w-[220px]"
            value={tienda}
            onChange={(e) => {
              setTienda(e.target.value)
              guardar('panel.tienda', e.target.value)
            }}
          >
            <option value="">Todas las tiendas</option>
            {data?.tiendas.map((t) => (
              <option key={t.codigo} value={t.codigo}>
                {t.codigo} · {t.descripcion ?? ''}
              </option>
            ))}
          </select>
        </label>
        <div className="flex" role="radiogroup" aria-label="Periodo">
          {PERIODOS.map((p) => {
            const on = p.value === periodo
            return (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setPeriodo(p.value)
                  guardar('panel.periodo', p.value)
                }}
                className={`gw-btn -ml-px first:ml-0 ${on ? '!border-[#1d5fb4] !bg-[#cfe3fa] font-bold' : ''}`}
              >
                {p.label}
              </button>
            )
          })}
        </div>
        <button type="button" className="gw-btn" onClick={() => void recargar()} disabled={cargando}>
          <RefreshCw size={13} className={cargando ? 'animate-spin' : ''} /> Actualizar
        </button>
        <span className="text-[11px] text-[#6d6d6d]">
          {actualizado ? `Actualizado a las ${actualizado.toLocaleTimeString('es-ES')}` : 'Cargando…'} · se actualiza solo cada{' '}
          {REFRESCO_MS / 60000} min
        </span>
        <span className="ml-auto text-[12px] font-bold capitalize text-[#1d3a8a]">
          {diaSemana}, {fmtFecha(hoy)}
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 border border-[#d03b3b] bg-[#fdecec] px-2 py-1 text-[#8a1c1c]">
          <AlertTriangle size={14} /> No se ha podido cargar el panel: {error}
          <button type="button" className="gw-btn ml-auto" onClick={() => void recargar()}>
            Reintentar
          </button>
        </div>
      )}

      {!data ? (
        !error && <div className="flex flex-1 items-center justify-center text-[#6d6d6d]">Cargando panel…</div>
      ) : (
        <div className={`flex flex-col gap-1.5 transition-opacity ${cargando ? 'opacity-60' : ''}`}>
          <Kpis d={data} per={per} abrir={abrir} />

          <div className="grid grid-cols-12 gap-1.5">
            <Card className="col-span-5" title="Actividad de hoy por hora" sub={`${diaSemana} ${fmtFecha(hoy)}`}>
              <GraficoHoras datos={data.por_hora} />
            </Card>
            <Card className="col-span-3" title="Pedidos por origen" sub={per.label.toLowerCase()}>
              <BarrasSimples
                serie="pedidos"
                vacio="Sin pedidos en este periodo"
                datos={[
                  { nombre: 'Comerciales', valor: data.origenes.comercial },
                  { nombre: 'Web', valor: data.origenes.web },
                  { nombre: 'Tienda / oficina', valor: data.origenes.tienda },
                ]}
              />
            </Card>
            <Card className="col-span-4" title="Avisos" sub="lo que conviene mirar hoy">
              <Alertas d={data} abrir={abrir} />
            </Card>
          </div>

          <div className="grid grid-cols-12 gap-1.5">
            <Card className="col-span-5" title="Ranking de vendedores" sub={`nº de operaciones · ${per.label.toLowerCase()}`}>
              <BarrasApiladas
                vacio="Ningún vendedor con pedidos o ventas en este periodo"
                datos={data.vendedores.map((v) => ({ nombre: v.nombre, pedidos: v.pedidos, ventas: v.ventas }))}
                series={[
                  { key: 'pedidos', label: 'Pedidos', color: C.s1 },
                  { key: 'ventas', label: 'Ventas directas (sin pedido)', color: C.s2 },
                ]}
                alto={data.vendedores.length * 22}
              />
            </Card>
            <Card className="col-span-4" title="Tickets por tienda" sub={per.label.toLowerCase()}>
              <ColumnasComparadas
                vacio="Sin tickets en este periodo"
                datos={data.por_tienda}
                actual={per.label}
                anterior={per.comparado.charAt(0).toUpperCase() + per.comparado.slice(1)}
              />
            </Card>
            <Card className="col-span-3" title="Más vendidos" sub={`unidades · ${per.label.toLowerCase()}`}>
              <TopArticulos d={data} abrir={abrir} />
            </Card>
          </div>

          <div className="grid grid-cols-12 gap-1.5">
            <Card className="col-span-8" title="Últimos pedidos" sub={per.label.toLowerCase()} right={<Enlace onClick={() => abrir('/gestor-pedidos')}>Gestor de pedidos</Enlace>}>
              <UltimosPedidos d={data} soloHora={periodo === 'hoy'} abrir={abrir} />
            </Card>
            <Card className="col-span-4" title="Repartos de hoy" sub="entregas por ruta" right={<Enlace onClick={() => abrir('/repartos')}>Repartos</Enlace>}>
              <RepartosHoy d={data} abrir={abrir} />
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function Enlace({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-[11px] text-[#1d5fb4] underline-offset-2 hover:underline">
      {children} »
    </button>
  )
}

// ---- KPIs ----------------------------------------------------------------------------------

function Kpi({
  label,
  icon: Icon,
  valor,
  children,
  onClick,
  alerta,
}: {
  label: string
  icon: LucideIcon
  valor: ReactNode
  children?: ReactNode
  onClick?: () => void
  alerta?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-0 flex-col items-stretch border bg-white px-2.5 py-1.5 text-left hover:border-[#1d5fb4] hover:bg-[#f5f9ff] ${
        alerta ? 'border-[#d03b3b] shadow-[inset_3px_0_0_#d03b3b]' : 'border-[#adadad] shadow-[inset_3px_0_0_#2a78d6]'
      }`}
    >
      <span className="flex items-center gap-1.5 text-[11px] text-[#52514e]">
        <Icon size={13} className={alerta ? 'text-[#d03b3b]' : 'text-[#2a78d6]'} />
        <span className="truncate">{label}</span>
      </span>
      <span className="mt-0.5 text-[26px] font-bold leading-[30px] text-[#111]">{valor}</span>
      <span className="truncate text-[11px] leading-[15px] text-[#52514e]">{children}</span>
    </button>
  )
}

function Kpis({ d, per, abrir }: { d: PanelData; per: (typeof PERIODOS)[number]; abrir: (r: string) => void }) {
  const ph = d.pedidos_hoy
  const r = d.reparto_hoy
  const k = d.kpi
  const delta = k.tickets_ant > 0 ? ((k.tickets - k.tickets_ant) / k.tickets_ant) * 100 : null
  return (
    <div className="grid grid-cols-6 gap-1.5">
      <Kpi label="Pedidos nuevos hoy" icon={ClipboardList} valor={fmtNum(ph.total)} onClick={() => abrir('/gestor-pedidos')}>
        Comerciales {ph.comercial} · Web {ph.web} · Tienda {ph.tienda}
      </Kpi>
      <Kpi
        label="Pendientes de preparar"
        icon={PackageCheck}
        valor={fmtNum(d.pendientes.por_preparar)}
        alerta={d.pendientes.atrasados > 0}
        onClick={() => abrir('/gestor-pedidos')}
      >
        {d.pendientes.preparados} preparados sin servir
        {d.pendientes.atrasados > 0 ? ` · ${d.pendientes.atrasados} fuera de plazo` : ''}
      </Kpi>
      <Kpi
        label="Reparto de hoy"
        icon={Truck}
        valor={
          r.entregas ? (
            <>
              {fmtNum(r.entregadas)}
              <span className="text-[16px] font-normal text-[#52514e]"> / {fmtNum(r.entregas)} entregas</span>
            </>
          ) : (
            '—'
          )
        }
        alerta={r.no_entregadas > 0}
        onClick={() => abrir('/repartos')}
      >
        {r.entregas ? <Medidor e={r.entregadas} p={r.pendientes} n={r.no_entregadas} /> : 'Sin repartos para hoy'}
      </Kpi>
      <Kpi
        label="Reparaciones abiertas"
        icon={Wrench}
        valor={fmtNum(d.reparaciones.abiertas)}
        alerta={d.reparaciones.atrasadas > 0}
        onClick={() => abrir('/reparaciones')}
      >
        {d.reparaciones.atrasadas > 0 ? `${d.reparaciones.atrasadas} atrasadas` : 'Ninguna atrasada'}
      </Kpi>
      <Kpi label="Pedidos web sin servir" icon={Globe} valor={fmtNum(d.web_sin_servir)} alerta={d.web_sin_servir > 0} onClick={() => abrir('/gestor-pedidos')}>
        {d.web_sin_servir > 0 ? 'Pendientes de preparar o enviar' : 'Todo servido'}
      </Kpi>
      <Kpi
        label={`Tickets · ${per.label.toLowerCase()}`}
        icon={ReceiptText}
        valor={
          <span className="flex items-baseline gap-2">
            {fmtNum(k.tickets)}
            {delta !== null && (
              <span
                className={`flex items-center text-[12px] font-bold ${delta >= 0 ? 'text-[#006300]' : 'text-[#b02a2a]'}`}
                title={`Frente a ${per.comparado}: ${fmtNum(k.tickets_ant)} tickets`}
              >
                {delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {fmtNum(Math.abs(delta), 0)} %
              </span>
            )}
          </span>
        }
        onClick={() => abrir('/ventas')}
      >
        {fmtNum(k.unidades, 2)} {k.unidades === 1 ? 'ud. vendida' : 'uds. vendidas'} · {k.devoluciones} devol. · vs {fmtNum(k.tickets_ant)}
      </Kpi>
    </div>
  )
}

/** Barra de estado del reparto: verde entregadas, ámbar pendientes, rojo no entregadas. */
function Medidor({ e, p, n, ancho }: { e: number; p: number; n: number; ancho?: string }) {
  const t = e + p + n || 1
  const seg = (v: number, color: string, titulo: string) =>
    v > 0 && <span title={`${v} ${titulo}`} style={{ width: `${(v / t) * 100}%`, background: color }} className="h-full first:rounded-l-[2px] last:rounded-r-[2px]" />
  return (
    <span className="flex items-center gap-1.5">
      <span className={`flex h-[8px] gap-[2px] bg-white ${ancho ?? 'w-[64px] flex-none'}`}>
        {seg(e, C.ok, 'entregadas')}
        {seg(p, C.aviso, 'pendientes')}
        {seg(n, C.mal, 'no entregadas')}
      </span>
      <span className="truncate">
        {p} pend.{n ? ` · ${n} no entreg.` : ''}
      </span>
    </span>
  )
}

// ---- Avisos --------------------------------------------------------------------------------

function Alertas({ d, abrir }: { d: PanelData; abrir: (r: string) => void }) {
  const a = d.alertas
  const filas: { n: number; texto: string; detalle?: string; ruta: string; grave?: boolean }[] = [
    {
      n: a.stock_bajo,
      texto: a.stock_bajo === 1 ? 'artículo bajo stock mínimo' : 'artículos bajo stock mínimo',
      detalle: a.stock_bajo_ej.map((x) => `${x.descripcion ?? x.codigo} (${fmtNum(x.actual ?? 0)}/${fmtNum(x.minimo)})`).join(' · '),
      ruta: '/stock',
    },
    {
      n: a.pp_retrasados,
      texto: a.pp_retrasados === 1 ? 'pedido a proveedor retrasado' : 'pedidos a proveedor retrasados',
      detalle: `${a.pp_pendientes} pendientes de recibir${a.pp_sin_fecha_prevista ? ` · ${a.pp_sin_fecha_prevista} sin fecha prevista` : ''}`,
      ruta: '/gestor-pedidos-proveedor',
      grave: true,
    },
    {
      n: a.cajas_antiguas.length,
      texto: a.cajas_antiguas.length === 1 ? 'caja abierta de días anteriores' : 'cajas abiertas de días anteriores',
      detalle: a.cajas_antiguas.length ? `Terminal ${a.cajas_antiguas.join(', ')}` : undefined,
      ruta: '/caja',
      grave: true,
    },
    {
      n: d.reparaciones.atrasadas,
      texto: d.reparaciones.atrasadas === 1 ? 'reparación atrasada' : 'reparaciones atrasadas',
      detalle: `${d.reparaciones.abiertas} abiertas en total`,
      ruta: '/reparaciones',
    },
    {
      n: d.pendientes.atrasados,
      texto: d.pendientes.atrasados === 1 ? 'pedido de cliente fuera de plazo' : 'pedidos de cliente fuera de plazo',
      detalle: 'Fecha de entrega ya pasada y sin servir',
      ruta: '/gestor-pedidos',
      grave: true,
    },
  ]
  return (
    <ul className="flex flex-col">
      {filas.map((f) => {
        const Icon = f.n === 0 ? CheckCircle2 : AlertTriangle
        const color = f.n === 0 ? C.ok : f.grave ? C.mal : '#c27c00'
        return (
          <li key={f.texto}>
            <button
              type="button"
              onClick={() => abrir(f.ruta)}
              className="flex w-full items-start gap-2 border-b border-[#eeeeee] px-1 py-[5px] text-left last:border-b-0 hover:bg-[#f2f7fd]"
            >
              <Icon size={15} color={color} className="mt-[1px] flex-none" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className={f.n ? 'text-[#111]' : 'text-[#6d6d6d]'}>
                  <b className="tabular-nums">{fmtNum(f.n)}</b> {f.texto}
                </span>
                {f.detalle && f.n > 0 && <span className="block truncate text-[11px] text-[#6d6d6d]">{f.detalle}</span>}
              </span>
              {f.n > 0 && <span className="flex-none text-[11px] text-[#1d5fb4]">Ver »</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ---- Listas --------------------------------------------------------------------------------

function TopArticulos({ d, abrir }: { d: PanelData; abrir: (r: string) => void }) {
  const lista = d.top_articulos
  if (!lista.length) return <Vacio texto="Sin ventas en este periodo" />
  const max = Math.max(...lista.map((a) => a.unidades), 1)
  return (
    <ol className="flex flex-col gap-1">
      {lista.map((a, i) => (
        <li key={a.codigo}>
          <button type="button" onClick={() => abrir(`/articulos/${encodeURIComponent(a.codigo)}`)} className="w-full px-0.5 text-left hover:bg-[#f2f7fd]">
            <span className="flex items-baseline gap-1.5">
              <span className="w-[14px] flex-none text-right text-[11px] text-[#76746e]">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate" title={`${a.codigo} · ${a.descripcion ?? ''}`}>
                {a.descripcion ?? a.codigo}
              </span>
              <b className="flex-none tabular-nums">{fmtNum(a.unidades, 2)}</b>
            </span>
            <span className="ml-[20px] mt-[2px] block h-[6px] bg-[#eef3fb]">
              <span className="block h-full rounded-r-[3px]" style={{ width: `${(a.unidades / max) * 100}%`, background: C.s1 }} />
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}

const ORIGEN: Record<string, { label: string; icon: LucideIcon }> = {
  web: { label: 'Web', icon: Globe },
  comercial: { label: 'Comercial', icon: UserRound },
  tienda: { label: 'Tienda', icon: Store },
}

const ESTADO: Record<string, string> = {
  Pendiente: 'bg-[#fff4d6] text-[#7a5200] border-[#f0d58a]',
  Aceptado: 'bg-[#eef3fb] text-[#1d3a8a] border-[#c9d7ee]',
  'En reparto': 'bg-[#eef3fb] text-[#1d3a8a] border-[#c9d7ee]',
  Preparado: 'bg-[#e3effd] text-[#14457f] border-[#b3cdee]',
  Servido: 'bg-[#e6f4e6] text-[#195e19] border-[#b9dcb9]',
  Anulado: 'bg-[#f0f0f0] text-[#6d6d6d] border-[#d9d9d9] line-through',
}

function UltimosPedidos({ d, soloHora, abrir }: { d: PanelData; soloHora: boolean; abrir: (r: string) => void }) {
  if (!d.ultimos_pedidos.length) return <Vacio texto="Sin pedidos en este periodo" />
  return (
    <table className="gw-grid table-fixed text-[12px]">
      <colgroup>
        <col className="w-[128px]" />
        <col className="w-[80px]" />
        <col className="w-[100px]" />
        <col />
        <col className="w-[130px]" />
        <col className="w-[92px]" />
      </colgroup>
      <thead>
        <tr>
          <th>{soloHora ? 'Hora' : 'Fecha'}</th>
          <th>Pedido</th>
          <th>Origen</th>
          <th>Cliente</th>
          <th>Comercial</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        {d.ultimos_pedidos.map((p) => {
          const o = ORIGEN[p.origen] ?? ORIGEN.tienda
          const Icon = p.reparacion ? Wrench : o.icon
          return (
            <tr
              key={`${p.tienda}-${p.numero}`}
              className="cursor-pointer hover:[&>td]:bg-[#e5f1fb]"
              onClick={() => abrir(`/${p.reparacion ? 'reparaciones' : 'pedidos'}/${encodeURIComponent(p.tienda)}/${p.numero}`)}
              title="Abrir el pedido"
            >
              <td className="tabular-nums">{soloHora ? (p.hora ?? '') : `${fmtFecha(p.fecha)} ${p.hora ?? ''}`.trim()}</td>
              <td className="tabular-nums">
                {p.tienda}/{p.numero}
              </td>
              <td>
                <span className="flex items-center gap-1">
                  <Icon size={13} className="flex-none text-[#5d6d7e]" />
                  {p.reparacion ? 'Reparación' : o.label}
                </span>
              </td>
              <td className="truncate">{p.cliente ?? ''}</td>
              <td className="truncate">{p.comercial ?? '—'}</td>
              <td>
                <span className={`inline-block border px-1.5 text-[11px] leading-[16px] ${ESTADO[p.estado] ?? ESTADO.Pendiente}`}>{p.estado}</span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function RepartosHoy({ d, abrir }: { d: PanelData; abrir: (r: string) => void }) {
  if (!d.repartos_hoy.length) return <Vacio texto="No hay repartos generados para hoy" />
  return (
    <>
      <div className="mb-1 flex flex-wrap gap-x-3 text-[11px] text-[#52514e]">
        {[
          [C.ok, 'Entregadas'],
          [C.aviso, 'Pendientes'],
          [C.mal, 'No entregadas'],
        ].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1">
            <span className="inline-block h-[10px] w-[10px] rounded-[2px]" style={{ background: c }} />
            {l}
          </span>
        ))}
      </div>
      <ul className="flex flex-col">
        {d.repartos_hoy.map((r) => (
          <li key={`${r.tienda}-${r.numero}`}>
            <button
              type="button"
              onClick={() => abrir(`/repartos/${encodeURIComponent(r.tienda)}/${r.numero}`)}
              className="flex w-full flex-col gap-0.5 border-b border-[#eeeeee] px-1 py-1 text-left hover:bg-[#f2f7fd]"
            >
              <span className="flex items-baseline gap-1.5">
                <b className="truncate">{r.ruta}</b>
                <span className="truncate text-[11px] text-[#6d6d6d]">{r.repartidor ?? 'sin repartidor'}</span>
                <span className="ml-auto flex-none tabular-nums">
                  <b>{r.entregadas}</b>/{r.entregas}
                </span>
              </span>
              {r.entregas ? <Medidor e={r.entregadas} p={r.pendientes} n={r.no_entregadas} ancho="flex-1" /> : <span className="text-[11px] text-[#6d6d6d]">Sin entregas</span>}
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
