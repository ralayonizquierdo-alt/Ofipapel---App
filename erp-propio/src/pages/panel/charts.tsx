import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import { fmtNum } from './panelData'

// Gráficos del Panel de Control. Colores con rol fijo (validados con la skill dataviz sobre
// fondo blanco): azul = serie principal, naranja = segunda serie, gris = referencia (media o
// periodo anterior). Estados de reparto con la paleta de estado (verde / ámbar / rojo), siempre
// con su etiqueta en la leyenda.
export const C = {
  s1: '#2a78d6',
  s2: '#eb6834',
  s1Claro: '#9ec5f4', // mismo azul, paso claro: «resto del periodo» junto a «hoy»
  ref: '#b9b7ae',
  refLinea: '#898781',
  ok: '#0ca30c',
  aviso: '#fab219',
  mal: '#d03b3b',
  grid: '#e6e5df',
  eje: '#c3c2b7',
  tinta2: '#52514e',
  tintaMuda: '#76746e',
}

const fuente = { fontFamily: 'Tahoma, "Segoe UI", Verdana, Arial, sans-serif', fontSize: 11, fill: C.tintaMuda }

// ---- Piezas comunes ------------------------------------------------------------------------

export function Card({
  title,
  sub,
  right,
  children,
  className = '',
}: {
  title: string
  sub?: string
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`flex min-w-0 flex-col border border-[#adadad] bg-white shadow-[1px_1px_0_#ffffff_inset] ${className}`}>
      <header className="flex h-[24px] flex-none items-center gap-2 border-b border-[#d0d7e2] bg-gradient-to-b from-[#f6f8fb] to-[#e4eaf3] px-2">
        <h2 className="truncate text-[12px] font-bold text-[#1d3a8a]">{title}</h2>
        {sub && <span className="truncate text-[11px] text-[#6d6d6d]">{sub}</span>}
        {right && <span className="ml-auto flex-none">{right}</span>}
      </header>
      <div className="flex min-h-0 flex-1 flex-col p-2">{children}</div>
    </section>
  )
}

export function Vacio({ texto }: { texto: string }) {
  return (
    <div className="flex flex-1 items-center justify-center text-center text-[12px] text-[#8a8a8a]" style={{ minHeight: 'var(--panel-chart-h)' }}>
      {texto}
    </div>
  )
}

export function Leyenda({ items }: { items: { color: string; label: string; tipo?: 'barra' | 'linea' }[] }) {
  return (
    <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#52514e]">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1">
          {i.tipo === 'linea' ? (
            <span className="inline-block h-[2px] w-[14px] rounded" style={{ background: i.color }} />
          ) : (
            <span className="inline-block h-[10px] w-[10px] rounded-[2px]" style={{ background: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  )
}

/** Tooltip con el aspecto de las ventanas GW: el valor manda, el nombre de la serie acompaña. */
function GwTooltip({ active, payload, label, titulo }: TooltipContentProps<number, string> & { titulo?: (l: unknown) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="pointer-events-none min-w-[120px] border border-[#8a8a8a] bg-white px-2 py-1 text-[11px] shadow-[2px_2px_4px_rgba(0,0,0,0.25)]">
      <div className="mb-0.5 text-[#52514e]">{titulo ? titulo(label) : String(label ?? '')}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-1.5">
          <span className="inline-block h-[2px] w-[10px]" style={{ background: (p.color as string) ?? '#000' }} />
          <span className="font-bold tabular-nums text-black">{fmtNum(Number(p.value ?? 0), 2)}</span>
          <span className="text-[#52514e]">{p.name}</span>
        </div>
      ))}
    </div>
  )
}

const cursor = { fill: 'rgba(42,120,214,0.07)' }
const ejeY = { ...fuente, tickFormatter: (v: number) => fmtNum(v) }

// ---- Actividad de hoy por hora --------------------------------------------------------------

export function GraficoHoras({ datos }: { datos: { h: number; tickets: number; tickets_media: number; pedidos: number }[] }) {
  const conDatos = datos.filter((d) => d.tickets || d.pedidos || d.tickets_media)
  const desde = Math.min(8, ...conDatos.map((d) => d.h))
  const hasta = Math.max(20, ...conDatos.map((d) => d.h))
  const filas = datos.filter((d) => d.h >= desde && d.h <= hasta)
  const hayHoy = datos.some((d) => d.tickets || d.pedidos)
  return (
    <>
      <Leyenda
        items={[
          { color: C.s1, label: 'Tickets hoy' },
          { color: C.s2, label: 'Pedidos hoy' },
          { color: C.refLinea, label: 'Media de tickets (4 semanas, mismo día)', tipo: 'linea' },
        ]}
      />
      {!hayHoy && !conDatos.length ? (
        <Vacio texto="Sin actividad hoy todavía" />
      ) : (
        <div style={{ height: 'var(--panel-chart-h)' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={filas} margin={{ top: 6, right: 4, left: -18, bottom: 0 }} barGap={2} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="h" tick={fuente} tickLine={false} axisLine={{ stroke: C.eje }} tickFormatter={(h: number) => `${h}h`} interval={0} />
              <YAxis tick={ejeY} tickFormatter={ejeY.tickFormatter} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
              <Tooltip cursor={cursor} content={(p) => <GwTooltip {...(p as TooltipContentProps<number, string>)} titulo={(l) => `De ${l}:00 a ${l}:59`} />} />
              <Bar dataKey="tickets" name="tickets" fill={C.s1} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
              <Bar dataKey="pedidos" name="pedidos" fill={C.s2} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
              <Line dataKey="tickets_media" name="media tickets" stroke={C.refLinea} strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  )
}

// ---- Barras horizontales de una sola serie (pedidos por origen) ------------------------------

export function BarrasSimples({
  datos,
  vacio,
  serie,
  onClick,
  alto,
}: {
  datos: { nombre: string; valor: number; clave?: string }[]
  vacio: string
  serie: string
  onClick?: (clave: string) => void
  alto?: number
}) {
  if (!datos.some((d) => d.valor)) return <Vacio texto={vacio} />
  return (
    <div style={{ height: alto ? `max(var(--panel-chart-h), ${alto}px)` : 'var(--panel-chart-h)' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 36, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid horizontal={false} stroke={C.grid} />
          <XAxis type="number" tick={ejeY} tickFormatter={ejeY.tickFormatter} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="nombre" tick={{ ...fuente, fill: C.tinta2 }} axisLine={{ stroke: C.eje }} tickLine={false} width={118} />
          <Tooltip cursor={cursor} content={(p) => <GwTooltip {...(p as TooltipContentProps<number, string>)} />} />
          <Bar
            dataKey="valor"
            name={serie}
            fill={C.s1}
            radius={[0, 4, 4, 0]}
            maxBarSize={24}
            isAnimationActive={false}
            cursor={onClick ? 'pointer' : undefined}
            onClick={onClick ? (d) => onClick(String((d as unknown as { clave?: string }).clave ?? '')) : undefined}
          >
            <LabelList dataKey="valor" position="right" formatter={(v: unknown) => fmtNum(Number(v))} style={{ ...fuente, fill: '#1a1a1a', fontWeight: 700 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---- Barras horizontales apiladas (ranking de vendedores, reparto por ruta) -----------------

export function BarrasApiladas({
  datos,
  series,
  vacio,
  alto,
}: {
  datos: Record<string, string | number>[]
  series: { key: string; label: string; color: string }[]
  vacio: string
  alto?: number
}) {
  if (!datos.length) return <Vacio texto={vacio} />
  const conTotal = datos.map((d) => ({ ...d, __total: series.reduce((s, x) => s + Number(d[x.key] ?? 0), 0) }))
  return (
    <>
      <Leyenda items={series.map((s) => ({ color: s.color, label: s.label }))} />
      <div style={{ height: alto ? `max(var(--panel-chart-h), ${alto}px)` : 'var(--panel-chart-h)' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={conTotal} layout="vertical" margin={{ top: 2, right: 34, left: 0, bottom: 0 }} barCategoryGap="24%">
            <CartesianGrid horizontal={false} stroke={C.grid} />
            <XAxis type="number" tick={ejeY} tickFormatter={ejeY.tickFormatter} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="nombre" tick={{ ...fuente, fill: C.tinta2 }} axisLine={{ stroke: C.eje }} tickLine={false} width={118} interval={0} />
            <Tooltip cursor={cursor} content={(p) => <GwTooltip {...(p as TooltipContentProps<number, string>)} />} />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="a"
                fill={s.color}
                stroke="#ffffff"
                strokeWidth={1}
                radius={i === series.length - 1 ? [0, 4, 4, 0] : 0}
                maxBarSize={22}
                isAnimationActive={false}
              >
                {i === series.length - 1 && (
                  <LabelList dataKey="__total" position="right" formatter={(v: unknown) => fmtNum(Number(v))} style={{ ...fuente, fill: '#1a1a1a', fontWeight: 700 }} />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

// ---- Columnas agrupadas: periodo actual frente al anterior (tickets por tienda) ------------

export function ColumnasComparadas({
  datos,
  vacio,
  actual,
  anterior,
}: {
  datos: { codigo: string; descripcion: string; actual: number; anterior: number }[]
  vacio: string
  actual: string
  anterior: string
}) {
  if (!datos.some((d) => d.actual || d.anterior)) return <Vacio texto={vacio} />
  const porCodigo = new Map(datos.map((d) => [d.codigo, d.descripcion]))
  return (
    <>
      <Leyenda
        items={[
          { color: C.s1, label: actual },
          { color: C.ref, label: anterior },
        ]}
      />
      <div style={{ height: 'var(--panel-chart-h)' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} margin={{ top: 14, right: 4, left: -18, bottom: 0 }} barGap={2} barCategoryGap="24%">
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="codigo" tick={{ ...fuente, fill: C.tinta2 }} axisLine={{ stroke: C.eje }} tickLine={false} interval={0} />
            <YAxis tick={ejeY} tickFormatter={ejeY.tickFormatter} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
            <Tooltip
              cursor={cursor}
              content={(p) => (
                <GwTooltip {...(p as TooltipContentProps<number, string>)} titulo={(l) => `${String(l)} · ${porCodigo.get(String(l)) ?? ''}`} />
              )}
            />
            <Bar dataKey="actual" name={actual} fill={C.s1} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
              {datos.length <= 8 && (
                <LabelList dataKey="actual" position="top" formatter={(v: unknown) => fmtNum(Number(v))} style={{ ...fuente, fill: '#1a1a1a', fontWeight: 700 }} />
              )}
            </Bar>
            <Bar dataKey="anterior" name={anterior} fill={C.ref} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}
