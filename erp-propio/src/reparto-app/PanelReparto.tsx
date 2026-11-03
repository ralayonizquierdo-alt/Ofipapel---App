import { useEffect, useRef, type ReactNode } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Panel de seguimiento de repartos: lo usan la pantalla del ERP (Ventas → Repartos → «Seguimiento de hoy», con cerrar y PIN; sin ranking)
// y la pantalla de la TV del departamento de pedidos (/reparto-tv, sin ERP). Datos: reparto_privado.seguimiento()
// vía fn_reparto_seguimiento (ERP) o fn_reparto_tv (TV, con el código del enlace).

export interface RutaSeg {
  tienda: string
  numero: number
  estado: number
  ruta: string | null
  ruta_nombre: string | null
  repartidor: string | null
  repartidor_nombre: string | null
  total: number
  entregados: number
  incidencias: number
  no_entregados: number
  pendientes: number
  comprobados: number
  posicion: { lat: number; lng: number; en: string } | null
  puntos: { lat: number; lng: number; estado: string }[]
  /** Un elemento por pedido (marcados por hora y luego los que quedan): estado y hora de entrega o del intento. */
  pedidos?: { e: 'entregado' | 'incidencia' | 'no_entregado' | 'pendiente'; h: string | null }[]
}
export interface DatosSeg {
  fecha: string
  rutas: RutaSeg[]
  ranking: { repartidor: string; entregados: number }[]
  totales: { semana: number; mes: number; anio: number }
}

export const C = { verde: '#1A5C1A', verdeMed: '#237523', verdeCl: '#3DAF3D', lima: '#8DC41E', naranja: '#F5A623', rojo: '#C62828', gris: '#b9c4b9' }
const COLORES_RUTA = ['#237523', '#1f6fb2', '#c2185b', '#ef6c00', '#6a1b9a', '#00838f', '#5d4037', '#827717', '#283593', '#ad1457']
export const base = import.meta.env.BASE_URL
export const n = (v: number) => v.toLocaleString('es-ES')
const hace = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h`
}


export function PanelReparto({
  datos,
  error,
  vista,
  setVista,
  tv,
  derecha,
  avisos,
  onCerrar,
  onAbrir,
}: {
  datos: DatosSeg | null
  error: string | null
  vista: 'rutas' | 'mapa'
  setVista: (v: 'rutas' | 'mapa') => void
  /** Letra y huecos grandes, para la TV. */
  tv: boolean
  derecha?: ReactNode
  avisos?: ReactNode
  onCerrar?: (r: RutaSeg) => void
  /** ERP: abrir la ficha del reparto (Ventas → Repartos). */
  onAbrir?: (r: RutaSeg) => void
}) {
  const rutas = datos?.rutas ?? []
  const abiertas = rutas.filter((r) => r.estado === 2)
  const quedan = abiertas.reduce((s, r) => s + r.pendientes, 0)
  return (
    <div
      style={{
        minHeight: '100%',
        background: `#1A5C1A url(${base}marca/fondo-reparto.jpg) center / cover`,
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: tv ? 24 : 12,
        display: 'flex',
        flexDirection: 'column',
        gap: tv ? 18 : 10,
        overflow: 'auto',
      }}
    >
      {/* Cabecera */}
      <div
        style={{
          background: 'linear-gradient(135deg,#0d3d0d 0%,#1A5C1A 45%,#237523 75%,#3a8f2a 100%)',
          borderRadius: 20,
          padding: tv ? '16px 24px' : '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          color: '#fff',
          boxShadow: '0 8px 24px rgba(0,0,0,.25)',
        }}
      >
        <img src={`${base}marca/logo-ofipapel.png`} alt="Ofipapel" style={{ height: tv ? 60 : 40 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: tv ? 36 : 22 }}>Repartos de hoy</div>
          <div style={{ letterSpacing: 2, fontSize: tv ? 16 : 12, opacity: 0.9 }}>
            {abiertas.length} rutas en la calle · {n(quedan)} pedidos por entregar
          </div>
        </div>
        <Grupo>
          <Pestana activa={vista === 'rutas'} onClick={() => setVista('rutas')} grande={tv}>
            Rutas
          </Pestana>
          <Pestana activa={vista === 'mapa'} onClick={() => setVista('mapa')} grande={tv}>
            Mapa
          </Pestana>
        </Grupo>
        {derecha}
      </div>

      {error && <Aviso color={C.rojo}>{error}</Aviso>}
      {avisos}

      <div style={{ display: 'grid', gridTemplateColumns: tv ? '1fr 360px' : 'minmax(0,1fr)', gap: tv ? 18 : 10, flex: 1, minHeight: 0 }}>
        <div style={{ minWidth: 0 }}>
          {vista === 'rutas' ? <VistaRutas rutas={rutas} tv={tv} onCerrar={onCerrar} onAbrir={onAbrir} /> : <VistaMapa rutas={rutas} tv={tv} />}
        </div>
        {/* Totales y ranking: solo en la TV (Rober: en el ERP no). */}
        {tv && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: tv ? 18 : 10 }}>
          <Tarjeta titulo="Pedidos entregados" tv={tv}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center' }}>
              {(
                [
                  ['Semana', datos?.totales.semana],
                  ['Mes', datos?.totales.mes],
                  ['Año', datos?.totales.anio],
                ] as const
              ).map(([t, v]) => (
                <div key={t}>
                  <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, fontSize: tv ? 38 : 24, color: C.verde }}>{n(v ?? 0)}</div>
                  <div style={{ color: '#5f6b5f', fontSize: tv ? 16 : 12 }}>{t}</div>
                </div>
              ))}
            </div>
          </Tarjeta>
          <Tarjeta titulo="🏆 Ranking de la semana" tv={tv}>
            {!datos?.ranking.length && <div style={{ color: '#5f6b5f' }}>Aún no hay entregas esta semana.</div>}
            {datos?.ranking.map((r, i) => {
              const max = datos.ranking[0].entregados || 1
              return (
                <div key={r.repartidor} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: tv ? 10 : 6, fontSize: tv ? 20 : 14 }}>
                  <span style={{ width: tv ? 34 : 24, textAlign: 'center' }}>{['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}</span>
                  <span style={{ width: tv ? 110 : 80, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.repartidor}</span>
                  <span style={{ flex: 1, background: '#e3ece3', borderRadius: 8, height: tv ? 18 : 12 }}>
                    <span style={{ display: 'block', width: `${(r.entregados / max) * 100}%`, height: '100%', borderRadius: 8, background: i === 0 ? C.lima : C.verdeMed }} />
                  </span>
                  <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, minWidth: 36, textAlign: 'right' }}>{r.entregados}</span>
                </div>
              )
            })}
          </Tarjeta>
        </div>
        )}
      </div>

    </div>
  )
}

// ------------------------------------------------------------------ Vista «Rutas» (una línea por ruta)
function VistaRutas({ rutas, tv, onCerrar, onAbrir }: { rutas: RutaSeg[]; tv: boolean; onCerrar?: (r: RutaSeg) => void; onAbrir?: (r: RutaSeg) => void }) {
  if (!rutas.length) return <Tarjeta tv={tv}>No hay repartos hoy.</Tarjeta>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tv ? 12 : 8 }}>
      {rutas.map((r, i) => {
        const cerrado = r.estado !== 2
        return (
          <div
            key={`${r.tienda}-${r.numero}`}
            style={{
              background: 'rgba(255,255,255,.96)',
              borderRadius: 16,
              borderLeft: `8px solid ${COLORES_RUTA[i % COLORES_RUTA.length]}`,
              padding: tv ? '14px 18px' : '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: tv ? 18 : 10,
              opacity: cerrado ? 0.6 : 1,
              boxShadow: '0 4px 12px rgba(0,0,0,.15)',
            }}
          >
            <div style={{ width: tv ? 240 : 170, minWidth: 0 }}>
              <div
                onClick={onAbrir ? () => onAbrir(r) : undefined}
                title={onAbrir ? 'Abrir la ficha del reparto' : undefined}
                style={{ fontWeight: 800, fontSize: tv ? 24 : 15, color: C.verde, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: onAbrir ? 'pointer' : undefined, textDecoration: onAbrir ? 'underline' : undefined }}
              >
                {r.ruta_nombre ?? 'Sin ruta'}{onAbrir ? ` · nº ${r.numero}` : ''}
              </div>
              <div style={{ color: '#5f6b5f', fontSize: tv ? 16 : 12 }}>
                🚚 {r.repartidor_nombre ?? 'sin repartidor'}
                {r.posicion && <span> · 📍 {hace(r.posicion.en)}</span>}
              </div>
            </div>
            <BarraPuntos r={r} alto={tv ? 34 : 20} horas={tv} />
            <div style={{ textAlign: 'right', minWidth: tv ? 130 : 90 }}>
              <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, fontSize: tv ? 30 : 18, color: cerrado ? '#5f6b5f' : r.pendientes ? C.verde : C.verdeCl }}>
                {cerrado ? 'Cerrado' : !r.total ? 'Sin pedidos' : r.pendientes ? `${r.pendientes} quedan` : '✔ Hecho'}
              </div>
              <div style={{ color: '#5f6b5f', fontSize: tv ? 14 : 11 }}>
                {r.entregados + r.incidencias}/{r.total} entregados
                {r.incidencias ? ` · ${r.incidencias} incid.` : ''}
                {r.no_entregados ? ` · ${r.no_entregados} no` : ''}
              </div>
            </div>
            {onCerrar && !cerrado && (
              <button
                type="button"
                onClick={() => onCerrar(r)}
                style={{ border: `2px solid ${C.verdeMed}`, color: C.verde, background: '#fff', borderRadius: 10, padding: '6px 10px', fontWeight: 700, fontSize: 12 }}
              >
                Cerrar reparto
              </button>
            )}
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 14, color: '#fff', fontSize: tv ? 16 : 12, textShadow: '0 1px 2px rgba(0,0,0,.6)' }}>
        <Leyenda color={C.verdeCl}>Entregado</Leyenda>
        <Leyenda color={C.naranja}>Con incidencia</Leyenda>
        <Leyenda color={C.rojo}>No entregado</Leyenda>
        <Leyenda color={C.gris}>Por entregar</Leyenda>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Barra con un punto por pedido (Rober, 03/11/2026)
/** Un punto por pedido a lo largo de la barra, con el color de su estado (entregados primero, luego incidencias, no
 *  entregados y los que quedan). Con muchos pedidos los puntos se hacen más pequeños para que quepan todos. */
export function BarraPuntos({
  r,
  alto,
  horas = false,
}: {
  r: Pick<RutaSeg, 'entregados' | 'incidencias' | 'no_entregados' | 'pendientes' | 'pedidos'>
  alto: number
  /** Hora encima de cada punto (TV: pocas rutas y pantalla grande). */
  horas?: boolean
}) {
  const COLOR = { entregado: C.verdeCl, incidencia: C.naranja, no_entregado: C.rojo, pendiente: C.gris } as const
  const puntos: { c: string; h: string | null }[] = r.pedidos
    ? r.pedidos.map((p) => ({ c: COLOR[p.e] ?? C.gris, h: p.h }))
    : [
        ...Array<string>(r.entregados).fill(C.verdeCl),
        ...Array<string>(r.incidencias).fill(C.naranja),
        ...Array<string>(r.no_entregados).fill(C.rojo),
        ...Array<string>(r.pendientes).fill(C.gris),
      ].map((c) => ({ c, h: null }))
  const d = Math.max(6, Math.min(alto - 6, 22))
  const conHoras = horas && puntos.some((p) => p.h)
  const letra = Math.max(9, Math.round(alto * 0.45))
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: puntos.length > 1 ? 'space-between' : 'flex-start',
        gap: 2,
        height: alto + (conHoras ? letra + 6 : 0),
        borderRadius: alto / 2,
        background: conHoras ? `linear-gradient(transparent ${letra + 6}px, #eef2ee ${letra + 6}px)` : '#eef2ee',
        padding: `0 ${alto / 3}px`,
      }}
      title={`${r.entregados} entregados · ${r.incidencias} con incidencia · ${r.no_entregados} no entregados · ${r.pendientes} por entregar`}
    >
      {puntos.map((p, i) => (
        <span key={i} style={{ flex: '0 1 auto', minWidth: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
          {conHoras && (
            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: letra, fontWeight: 600, lineHeight: 1, color: p.h ? (p.c === C.rojo ? C.rojo : p.c === C.naranja ? '#a86400' : C.verde) : 'transparent', whiteSpace: 'nowrap', marginBottom: (alto - d) / 2 + 6 }}>
              {p.h ?? '00:00'}
            </span>
          )}
          <span
            style={{
              width: d,
              height: d,
              marginBottom: (alto - d) / 2,
              borderRadius: '50%',
              background: p.c,
              flexShrink: 0,
              boxShadow: p.c === C.gris ? 'inset 0 0 0 1px #a4ada4' : '0 1px 2px rgba(0,0,0,.25)',
            }}
          />
        </span>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ Vista «Mapa» (Tenerife)
export function VistaMapa({ rutas, tv }: { rutas: RutaSeg[]; tv: boolean }) {
  const caja = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const capa = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!caja.current || mapa.current) return
    const m = L.map(caja.current, { zoomControl: !tv, attributionControl: true, zoomSnap: 0.25 }).fitBounds([[27.99, -16.93], [28.6, -16.1]])
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(m)
    capa.current = L.layerGroup().addTo(m)
    mapa.current = m
    return () => {
      m.remove()
      mapa.current = null
    }
  }, [tv])

  useEffect(() => {
    const g = capa.current
    if (!g) return
    g.clearLayers()
    rutas.forEach((r, i) => {
      const color = COLORES_RUTA[i % COLORES_RUTA.length]
      for (const p of r.puntos) {
        const c = p.estado === 'no_entregado' ? C.rojo : p.estado === 'incidencia' ? C.naranja : C.verdeCl
        L.circleMarker([p.lat, p.lng], { radius: tv ? 7 : 5, color: '#fff', weight: 1.5, fillColor: c, fillOpacity: 0.95 }).addTo(g)
      }
      if (r.posicion && r.estado === 2) {
        const icono = L.divIcon({
          className: '',
          iconSize: [0, 0],
          html: `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center">
                   <div style="background:${color};color:#fff;border-radius:12px;padding:3px 8px;font:700 ${tv ? 15 : 12}px Inter,sans-serif;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.4)">🚚 ${r.repartidor_nombre ?? ''} · ${r.pendientes}</div>
                   <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${color}"></div>
                 </div>`,
        })
        L.marker([r.posicion.lat, r.posicion.lng], { icon: icono }).addTo(g)
      }
    })
  }, [rutas, tv])

  const sinPosicion = rutas.filter((r) => r.estado === 2 && !r.posicion)
  return (
    <div style={{ position: 'relative', height: tv ? 'calc(100vh - 180px)' : 520, borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,.25)' }}>
      <div ref={caja} style={{ position: 'absolute', inset: 0 }} />
      {sinPosicion.length > 0 && (
        <div style={{ position: 'absolute', left: 10, bottom: 24, zIndex: 500, background: 'rgba(255,255,255,.92)', borderRadius: 10, padding: '6px 10px', fontSize: tv ? 15 : 12 }}>
          Sin ubicación: {sinPosicion.map((r) => r.repartidor_nombre ?? r.ruta_nombre).join(', ')}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ Piezas
export function Tarjeta({ titulo, tv, children }: { titulo?: string; tv: boolean; children: ReactNode }) {
  return (
    <div style={{ background: 'rgba(255,255,255,.96)', borderRadius: 18, borderTop: `5px solid ${C.lima}`, padding: tv ? 18 : 12, boxShadow: '0 6px 18px rgba(0,0,0,.18)' }}>
      {titulo && <div style={{ fontWeight: 800, color: C.verde, fontSize: tv ? 22 : 15, marginBottom: tv ? 12 : 8 }}>{titulo}</div>}
      {children}
    </div>
  )
}
export function Grupo({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', background: 'rgba(255,255,255,.15)', borderRadius: 12, padding: 3, gap: 3 }}>{children}</div>
}
export function Pestana({ activa, onClick, children, grande }: { activa: boolean; onClick: () => void; children: ReactNode; grande: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ border: 'none', borderRadius: 10, padding: grande ? '8px 18px' : '5px 12px', fontWeight: 700, fontSize: grande ? 18 : 13, background: activa ? '#fff' : 'transparent', color: activa ? C.verde : '#fff' }}
    >
      {children}
    </button>
  )
}
export function BotonClaro({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{ background: 'rgba(255,255,255,.14)', color: '#fff', border: '1px solid rgba(255,255,255,.35)', borderRadius: 10, padding: '6px 10px', fontWeight: 600, fontSize: 13 }}>
      {children}
    </button>
  )
}
export function Aviso({ color, children, onCerrar }: { color: string; children: ReactNode; onCerrar?: () => void }) {
  return (
    <div style={{ background: '#fff', borderLeft: `6px solid ${color}`, borderRadius: 10, padding: '8px 12px', fontSize: 14, display: 'flex', gap: 8 }}>
      <span style={{ flex: 1 }}>{children}</span>
      {onCerrar && (
        <button type="button" onClick={onCerrar} style={{ border: 'none', background: 'none', fontSize: 16 }}>
          ✕
        </button>
      )}
    </div>
  )
}
export function Leyenda({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 14, height: 14, borderRadius: 4, background: color, display: 'inline-block' }} />
      {children}
    </span>
  )
}
