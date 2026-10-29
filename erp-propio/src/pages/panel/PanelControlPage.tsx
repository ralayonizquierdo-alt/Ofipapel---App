import { useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePermisos } from '../../lib/PermisosContext'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileText,
  MessageSquarePlus,
  ShoppingCart,
  Globe,
  PackageCheck,
  RefreshCw,
  Store,
  Truck,
  UserRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { BarrasApiladas, BarrasSimples, C, Card, ColumnasComparadas, GraficoHoras, Vacio } from './charts'
import { PERIODOS, REFRESCO_MS, fmtFecha, fmtNum, hoyCanarias, usePanelData, usePanelDia, type PanelData, type PanelDia, type Periodo } from './panelData'
import { GwWindow } from '../../components/gw'
import { GwOperativa } from '../../components/gw/GwOperativa'

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
  const dia = usePanelDia(tienda, actualizado)
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  const [ayuda, setAyuda] = useState(false)
  const per = PERIODOS.find((p) => p.value === periodo)!
  const hoy = data?.meta.hoy ?? hoyCanarias()
  const diaSemana = DIAS[new Date(`${hoy}T12:00:00Z`).getUTCDay()]

  // Solo enlazan las tarjetas y avisos que llevan a pantallas que el grupo de acceso permite.
  const { puedeRuta } = usePermisos()
  const abrir: Abrir = (ruta) => (puedeRuta(ruta) ? () => navigate(ruta) : undefined)

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
        <button type="button" className="gw-btn" onClick={() => setAyuda(true)}>
          Operativa
        </button>
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

      {ayuda && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-20" onKeyDown={(e) => e.key === 'Escape' && setAyuda(false)}>
          <GwWindow title="Panel de Control · Operativa" onClose={() => setAyuda(false)} className="w-[640px] max-w-[95vw]">
            <GwOperativa
              bloques={[
                {
                  titulo: 'Tarjetas de arriba',
                  notas: [
                    'Pedidos, pendientes de preparar, reparto y pedidos web: pulsa para abrir su pantalla.',
                    'Presupuestos hoy: hechos hoy, cuántos aceptados, pendientes y en seguimiento; debajo, a cuántos hay que llamar hoy y cuántos están vencidos (en rojo).',
                    'Al pulsar Presupuestos: lista «Para llamar» (marca «Solo los míos»); pulsa uno para abrirlo.',
                    'Compras hoy: altas del día actualizadas, pendientes de actualizar y abonos.',
                    'Peticiones hoy: cuántas, por nº de vendedor.',
                    'Pulsa Presupuestos, Compras o Peticiones para ver la lista con sus números (pedido, albarán, factura, código de venta…).',
                  ],
                },
                {
                  titulo: 'Bueno es saber',
                  notas: [
                    '«En seguimiento» se marca en la ficha del presupuesto (botón junto a Aceptado).',
                    'Tienda y periodo de arriba cambian lo de abajo; se actualiza solo cada pocos minutos.',
                  ],
                },
              ]}
            />
          </GwWindow>
        </div>
      )}
      {detalle && dia && <DetalleDia que={detalle} dia={dia} abrir={abrir} onClose={() => setDetalle(null)} />}
      {!data ? (
        !error && <div className="flex flex-1 items-center justify-center text-[#6d6d6d]">Cargando panel…</div>
      ) : (
        <div className={`flex flex-col gap-1.5 transition-opacity ${cargando ? 'opacity-60' : ''}`}>
          <Kpis d={data} dia={dia} abrir={abrir} verDetalle={setDetalle} />

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
            <Card className="col-span-5" title="Pedidos por comercial" sub={`nº de pedidos de cliente · ${per.label.toLowerCase()}`}>
              {periodo === 'hoy' ? (
                <BarrasSimples
                  serie="pedidos hoy"
                  vacio="Ningún comercial con pedidos hoy"
                  datos={data.vendedores.map((v) => ({ nombre: v.nombre, valor: v.pedidos }))}
                  alto={data.vendedores.length * 24}
                />
              ) : (
                <BarrasApiladas
                  vacio="Ningún comercial con pedidos en este periodo"
                  datos={data.vendedores.map((v) => ({ nombre: v.nombre, hoy: v.hoy, antes: v.pedidos - v.hoy }))}
                  series={[
                    { key: 'hoy', label: 'Hoy', color: C.s1 },
                    { key: 'antes', label: `Resto de ${per.label.toLowerCase()}`, color: C.s1Claro },
                  ]}
                  alto={data.vendedores.length * 24}
                />
              )}
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
            <Card className="col-span-8" title="Últimos pedidos" sub={per.label.toLowerCase()} right={<Enlace onClick={abrir('/gestor-pedidos')}>Gestor de pedidos</Enlace>}>
              <UltimosPedidos d={data} soloHora={periodo === 'hoy'} abrir={abrir} />
            </Card>
            <Card className="col-span-4" title="Repartos de hoy" sub="entregas por ruta" right={<Enlace onClick={abrir('/repartos')}>Repartos</Enlace>}>
              <RepartosHoy d={data} abrir={abrir} />
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

/** Devuelve la acción de abrir la pantalla, o undefined si el grupo de acceso no la permite. */
type Abrir = (ruta: string) => (() => void) | undefined

function Enlace({ onClick, children }: { onClick?: () => void; children: ReactNode }) {
  if (!onClick) return null
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
      disabled={!onClick}
      className={`flex min-w-0 flex-col items-stretch border bg-white px-2.5 py-1.5 text-left ${onClick ? 'hover:border-[#1d5fb4] hover:bg-[#f5f9ff]' : 'cursor-default'} ${
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

type Detalle = 'presupuestos' | 'compras' | 'peticiones'

function Kpis({ d, dia, abrir, verDetalle }: { d: PanelData; dia: PanelDia | null; abrir: Abrir; verDetalle: (q: Detalle) => void }) {
  const ph = d.pedidos_hoy
  const r = d.reparto_hoy
  const pr = dia?.presupuestos
  const co = dia?.compras
  const pe = dia?.peticiones
  const cifra = (txt: string, n: number | undefined, color?: string) => (
    <span key={txt} className="whitespace-nowrap">
      {txt} <b style={{ color }} className={color ? '' : 'text-[#111]'}>{n ?? '·'}</b>
    </span>
  )
  return (
    <div className="grid grid-cols-7 gap-1.5">
      <Kpi label="Pedidos nuevos hoy" icon={ClipboardList} valor={fmtNum(ph.total)} onClick={abrir('/gestor-pedidos')}>
        <span className="flex items-center gap-2.5">
          {(
            [
              [UserRound, 'Comercial', ph.comercial],
              [Globe, 'Web', ph.web],
              [Store, 'Tienda', ph.tienda],
            ] as const
          ).map(([Icono, txt, n]) => (
            <span key={txt} className="flex items-center gap-1" title={`${n} pedidos de ${txt.toLowerCase()} hoy`}>
              <Icono size={12} className="hidden flex-none text-[#5d6d7e] 2xl:inline" />
              {txt} <b className="text-[#111]">{n}</b>
            </span>
          ))}
        </span>
      </Kpi>
      <Kpi
        label="Pendientes de preparar"
        icon={PackageCheck}
        valor={fmtNum(d.pendientes.por_preparar)}
        alerta={d.pendientes.atrasados > 0}
        onClick={abrir('/gestor-pedidos')}
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
        onClick={abrir('/repartos')}
      >
        {r.entregas ? <Medidor e={r.entregadas} p={r.pendientes} n={r.no_entregadas} /> : 'Sin repartos para hoy'}
      </Kpi>
      <Kpi label="Nuevos pedidos web · hoy" icon={Globe} valor={fmtNum(d.pedidos_web.hoy)} onClick={abrir('/web/estado-pedidos')}>
        {d.pedidos_web.por_preparar > 0
          ? `${d.pedidos_web.por_preparar} pendientes de preparar`
          : d.pedidos_web.ultimo_fecha
            ? `Último: ${d.pedidos_web.ultimo_fecha === d.meta.hoy ? 'hoy' : fmtFecha(d.pedidos_web.ultimo_fecha)}${d.pedidos_web.ultimo_hora ? ' a las ' + d.pedidos_web.ultimo_hora : ''}`
            : 'Aún no hay pedidos web'}
      </Kpi>
      <Kpi
        label="Presupuestos hoy"
        icon={FileText}
        valor={pr ? fmtNum(pr.total) : '…'}
        alerta={!!dia && dia.seguimiento.vencidos + dia.seguimiento.caducados > 0}
        onClick={() => verDetalle('presupuestos')}
      >
        <span className="flex flex-col">
          <span className="flex gap-2">
            {cifra('Acept.', pr?.aceptados, '#127a12')}
            {cifra('Pend.', pr?.pendientes, '#b45309')}
            {cifra('Seguim.', pr?.seguimiento, '#1d5fb4')}
          </span>
          {dia && (
            <span className="flex gap-2" title="Seguimientos: presupuestos a los que hay que llamar">
              {cifra('Llamar hoy', dia.seguimiento.hoy, '#1d5fb4')}
              {cifra('Vencidos', dia.seguimiento.vencidos, '#c42b1c')}
            </span>
          )}
        </span>
      </Kpi>
      <Kpi
        label="Compras hoy"
        icon={ShoppingCart}
        valor={co ? fmtNum(co.actualizadas + co.pendientes + co.abonos) : '…'}
        alerta={!!co && co.pendientes > 0}
        onClick={() => verDetalle('compras')}
      >
        <span className="flex gap-2">
          {cifra('Actualiz.', co?.actualizadas, '#127a12')}
          {cifra('Pend.', co?.pendientes, '#b45309')}
          {cifra('Abonos', co?.abonos, '#c42b1c')}
        </span>
      </Kpi>
      <Kpi label="Peticiones hoy" icon={MessageSquarePlus} valor={pe ? fmtNum(pe.total) : '…'} onClick={() => verDetalle('peticiones')}>
        {pe && pe.por_operario.length ? (
          <span className="flex gap-2">{pe.por_operario.slice(0, 3).map((x) => cifra(`Vend. ${x.operario ?? '?'}`, x.n))}</span>
        ) : (
          'Ninguna petición hoy'
        )}
      </Kpi>
    </div>
  )
}

/** Ventana con el detalle de una tarjeta del día (números de presupuesto, pedido, albarán…). */
function DetalleDia({ que, dia, abrir, onClose }: { que: Detalle; dia: PanelDia; abrir: Abrir; onClose: () => void }) {
  const t =
    que === 'presupuestos'
      ? {
          titulo: 'Presupuestos de hoy',
          ruta: '/gestor-presupuestos',
          cols: ['Nº presupuesto', 'Cliente', 'Estado', 'Vend.'],
          filas: dia.presupuestos.lista.map((x) => [`${x.tienda}-${x.numero}`, x.cliente ?? '', x.estado, x.operario ?? '']),
        }
      : que === 'compras'
        ? {
            titulo: 'Compras de hoy',
            ruta: '/gestor-pedidos-proveedor',
            cols: ['Tipo', 'Nº pedido', 'Albarán', 'Factura', 'Proveedor'],
            filas: dia.compras.lista.map((x) => [x.tipo, `${x.tienda}-${x.numero}`, x.albaran ?? '', x.factura ?? '', x.proveedor ?? '']),
          }
        : {
            titulo: 'Peticiones de hoy',
            ruta: '/peticiones',
            cols: ['Nº petición', 'Vend.', 'Código venta', 'Descripción', 'Cant.', 'Estado'],
            filas: dia.peticiones.lista.map((x) => [`${x.tienda}-${x.numero}`, x.operario ?? '', x.codigo_venta ?? '', x.descripcion ?? '', fmtNum(x.cantidad, 2), x.estado ?? '']),
          }
  const ir = abrir(t.ruta)
  const navigate = useNavigate()
  const [soloMios, setSoloMios] = useState(false)
  const seguir = dia.seguimiento.lista.filter((x) => !soloMios || x.mio)
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-20" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title={t.titulo} onClose={onClose} className="w-[760px] max-w-[95vw]">
        <div className="flex flex-col gap-1.5 text-[13px]">
          {que === 'presupuestos' && (
            <>
              <div className="flex items-center gap-2">
                <b className="text-[14px] text-[#1d3a8a]">Para llamar ({seguir.length})</b>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={soloMios} onChange={(e) => setSoloMios(e.target.checked)} />
                  Solo los míos
                </label>
              </div>
              <div className="max-h-[260px] overflow-y-auto border border-[var(--gw-border)] bg-white">
                <table className="gw-grid">
                  <thead className="sticky top-0">
                    <tr>
                      <th>Nº presupuesto</th>
                      <th>Cliente</th>
                      <th>Estado</th>
                      <th>Llamar</th>
                      <th>Vend.</th>
                      <th className="text-right!">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seguir.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-[#777]">
                          Nadie a quien llamar hoy.
                        </td>
                      </tr>
                    )}
                    {seguir.map((x) => (
                      <tr
                        key={`${x.tienda}-${x.numero}`}
                        className="cursor-pointer hover:bg-[#e5f1fb]"
                        title="Abrir el presupuesto"
                        onClick={() => (onClose(), navigate(`/presupuestos/${encodeURIComponent(x.tienda)}/${x.numero}`))}
                      >
                        <td>
                          {x.tienda}-{x.numero}
                        </td>
                        <td className="truncate">{x.cliente ?? ''}</td>
                        <td>{x.estado === 'seguimiento' ? 'En seguimiento' : x.estado === 'enviado' ? 'Enviado' : 'Borrador'}</td>
                        <td className={x.caducado || (x.dias_retraso ?? 0) > 0 ? 'font-bold text-[#c42b1c]' : 'text-[#1d5fb4]'}>
                          {x.caducado ? 'Caducado' : (x.dias_retraso ?? 0) > 0 ? `Vencido hace ${x.dias_retraso} d` : 'Hoy'}
                        </td>
                        <td>{x.responsable ?? ''}</td>
                        <td className="text-right">{x.total != null ? fmtNum(x.total, 2) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <b className="text-[14px] text-[#1d3a8a]">Hechos hoy</b>
            </>
          )}
          <div className="max-h-[400px] overflow-y-auto border border-[var(--gw-border)] bg-white">
            <table className="gw-grid">
              <thead className="sticky top-0">
                <tr>
                  {t.cols.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.filas.length === 0 && (
                  <tr>
                    <td colSpan={t.cols.length} className="text-[#777]">
                      Nada hoy.
                    </td>
                  </tr>
                )}
                {t.filas.map((f, i) => (
                  <tr key={i}>
                    {f.map((v, j) => (
                      <td key={j} className={`truncate ${v === 'Abono' || v === 'Pendiente' ? 'font-bold' : ''} ${v === 'Abono' ? 'text-[#c42b1c]' : v === 'Pendiente' ? 'text-[#b45309]' : v === 'Aceptado' || v === 'Actualizada' ? 'text-[#127a12]' : ''}`}>
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-1.5">
            {ir && (
              <button type="button" className="gw-btn" onClick={() => (onClose(), ir())}>
                Abrir la pantalla
              </button>
            )}
            <button type="button" className="gw-btn" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </GwWindow>
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

function Alertas({ d, abrir }: { d: PanelData; abrir: Abrir }) {
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
      n: d.web_sin_servir,
      texto: d.web_sin_servir === 1 ? 'pedido web sin servir' : 'pedidos web sin servir',
      detalle: d.pedidos_web.por_preparar ? `${d.pedidos_web.por_preparar} aún sin preparar` : 'Preparados, falta entregarlos o enviarlos',
      ruta: '/web/pendientes',
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
              onClick={abrir(f.ruta)}
              disabled={!abrir(f.ruta)}
              className="flex w-full items-start gap-2 border-b border-[#eeeeee] px-1 py-[5px] text-left last:border-b-0 enabled:hover:bg-[#f2f7fd] disabled:cursor-default"
            >
              <Icon size={15} color={color} className="mt-[1px] flex-none" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className={f.n ? 'text-[#111]' : 'text-[#6d6d6d]'}>
                  <b className="tabular-nums">{fmtNum(f.n)}</b> {f.texto}
                </span>
                {f.detalle && f.n > 0 && <span className="block truncate text-[11px] text-[#6d6d6d]">{f.detalle}</span>}
              </span>
              {f.n > 0 && abrir(f.ruta) && <span className="flex-none text-[11px] text-[#1d5fb4]">Ver »</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ---- Listas --------------------------------------------------------------------------------

function TopArticulos({ d, abrir }: { d: PanelData; abrir: Abrir }) {
  const lista = d.top_articulos
  if (!lista.length) return <Vacio texto="Sin ventas en este periodo" />
  const max = Math.max(...lista.map((a) => a.unidades), 1)
  return (
    <ol className="flex flex-col gap-1">
      {lista.map((a, i) => (
        <li key={a.codigo}>
          <button type="button" onClick={abrir(`/articulos/${encodeURIComponent(a.codigo)}`)} disabled={!abrir('/articulos')} className="w-full px-0.5 text-left enabled:hover:bg-[#f2f7fd] disabled:cursor-default">
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

function UltimosPedidos({ d, soloHora, abrir }: { d: PanelData; soloHora: boolean; abrir: Abrir }) {
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
          const abrirPedido = abrir(`/${p.reparacion ? 'reparaciones' : 'pedidos'}/${encodeURIComponent(p.tienda)}/${p.numero}`)
          return (
            <tr
              key={`${p.tienda}-${p.numero}`}
              className={abrirPedido ? 'cursor-pointer hover:[&>td]:bg-[#e5f1fb]' : ''}
              onClick={abrirPedido}
              title={abrirPedido ? 'Abrir el pedido' : undefined}
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

function RepartosHoy({ d, abrir }: { d: PanelData; abrir: Abrir }) {
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
              onClick={abrir(`/repartos/${encodeURIComponent(r.tienda)}/${r.numero}`)}
              disabled={!abrir('/repartos')}
              className="flex w-full flex-col gap-0.5 border-b border-[#eeeeee] px-1 py-1 text-left enabled:hover:bg-[#f2f7fd] disabled:cursor-default"
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
