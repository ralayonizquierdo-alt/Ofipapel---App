import { useEffect, useRef, useState, type ReactNode } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MUNICIPIOS_TENERIFE } from './municipiosTenerife'

// Panel de seguimiento de repartos: lo usan la pantalla del ERP (Ventas → Repartos → «Seguimiento de hoy», con cerrar y PIN; sin ranking)
// y la pantalla de la TV del departamento de pedidos (/reparto-tv, sin ERP). Datos: reparto_privado.seguimiento()
// vía fn_reparto_seguimiento (ERP) o fn_reparto_tv (TV, con el código del enlace).

export interface RutaSeg {
  tienda: string
  numero: number
  estado: number
  ruta: string | null
  ruta_nombre: string | null
  /** El reparto se generó en el ERP (se cierra en el ERP); si no, viene de GeminisWin y se cierra allí. */
  generado_erp?: boolean
  repartidor: string | null
  repartidor_nombre: string | null
  total: number
  entregados: number
  incidencias: number
  no_entregados: number
  pendientes: number
  comprobados: number
  posicion: { lat: number; lng: number; en: string } | null
  /** Dónde estaba el repartidor al marcar cada pedido, con el cliente y la hora. */
  puntos: { lat: number; lng: number; estado: string; cliente?: string | null; hora?: string | null }[]
  /** Un elemento por pedido (marcados por hora y luego los que quedan): estado y hora de entrega o del intento. */
  pedidos?: { e: 'entregado' | 'incidencia' | 'no_entregado' | 'pendiente'; h: string | null; /** Contado con importe por cobrar (azul mientras está por entregar). */ c?: boolean }[]
}
export interface DatosSeg {
  fecha: string
  rutas: RutaSeg[]
  ranking: { repartidor: string; entregados: number }[]
  totales: { semana: number; mes: number; anio: number }
}

export const C = { verde: '#1A5C1A', verdeMed: '#237523', verdeCl: '#3DAF3D', lima: '#8DC41E', naranja: '#F5A623', rojo: '#C62828', gris: '#b9c4b9', azul: '#1E6FD9' }
// Rótulos del mapa: nombre corto y, para los municipios pequeños del norte, dónde va el nombre (en el mar).
const ROTULOS: Record<string, { corto?: string; en?: [number, number] }> = {
  'San Cristóbal de La Laguna': { corto: 'La Laguna' },
  'Santa Cruz de Tenerife': { corto: 'Santa Cruz' },
  'Buenavista del Norte': { corto: 'Buenavista' },
  'Granadilla de Abona': { corto: 'Granadilla' },
  'San Miguel de Abona': { corto: 'San Miguel' },
  'Vilaflor de Chasna': { corto: 'Vilaflor' },
  'Icod de los Vinos': { corto: 'Icod' },
  Tegueste: { en: [28.585, -16.4] },
  Tacoronte: { en: [28.56, -16.45] },
  'El Sauzal': { en: [28.538, -16.49] },
  'La Matanza de Acentejo': { corto: 'La Matanza', en: [28.516, -16.53] },
  'La Victoria de Acentejo': { corto: 'La Victoria', en: [28.494, -16.565] },
  'Santa Úrsula': { en: [28.472, -16.6] },
  'Puerto de la Cruz': { en: [28.452, -16.64] },
  'San Juan de la Rambla': { corto: 'S. Juan de la Rambla', en: [28.43, -16.725] },
  'La Guancha': { en: [28.472, -16.765] },
  Garachico: { en: [28.447, -16.835] },
  'El Tanque': { en: [28.245, -16.9] },
  'Los Silos': { en: [28.418, -16.9] },
}
// Colores suaves del mapa político: los municipios vecinos nunca repiten color.
const COLORES_MUNICIPIO = ['#f9d5a7', '#b8dfc4', '#f4b6c2', '#bcd4f0', '#e3d0f0', '#f6efa6', '#c9e8e4', '#e9c9b1']
const COLORES_RUTA = ['#237523', '#1f6fb2', '#c2185b', '#ef6c00', '#6a1b9a', '#00838f', '#5d4037', '#827717', '#283593', '#ad1457']
export const base = import.meta.env.BASE_URL
export const n = (v: number) => v.toLocaleString('es-ES')
/** Minutos sin recibir posición de un furgón (ruta abierta) a partir de los cuales sale en rojo. */
const MINUTOS_SIN_SEÑAL = 15

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
            <div style={{ width: tv ? 300 : 190, minWidth: 0 }}>
              {/* «RUTA 1», «RUTA 2»… en grande, encima del nombre de la zona (Rober, 13/11/2026). */}
              {r.ruta && (
                <div style={{ fontWeight: 900, fontSize: tv ? 30 : 17, lineHeight: 1.05, color: '#1b3a1b', whiteSpace: 'nowrap' }}>
                  RUTA {/^\d+$/.test(r.ruta) ? Number(r.ruta) : r.ruta}
                </div>
              )}
              <div
                onClick={onAbrir ? () => onAbrir(r) : undefined}
                title={onAbrir ? 'Abrir la ficha del reparto' : undefined}
                style={{ fontWeight: 800, fontSize: tv ? 24 : 15, color: C.verde, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: onAbrir ? 'pointer' : undefined, textDecoration: onAbrir ? 'underline' : undefined }}
              >
                {r.ruta_nombre ?? 'Sin ruta'}{onAbrir ? ` · nº ${r.numero}` : ''}
              </div>
              <div style={{ color: '#5f6b5f', fontSize: tv ? 16 : 12 }}>
                🚚 {r.repartidor_nombre ?? 'sin repartidor'}
              </div>
              {/* Última posición recibida, en letra pequeña; en rojo si lleva más de 15 min sin avisar (ruta abierta). */}
              {r.posicion && (
                <div style={{ fontSize: tv ? 13 : 10, color: !cerrado && Date.now() - new Date(r.posicion.en).getTime() > MINUTOS_SIN_SEÑAL * 60_000 ? C.rojo : '#8a948a', fontWeight: !cerrado && Date.now() - new Date(r.posicion.en).getTime() > MINUTOS_SIN_SEÑAL * 60_000 ? 700 : 400 }}>
                  📍 última posición {new Date(r.posicion.en).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Atlantic/Canary' })} · {hace(r.posicion.en)}
                </div>
              )}
            </div>
            <BarraPuntos r={r} alto={tv ? 34 : 20} horas={tv} />
            <div style={{ textAlign: 'right', minWidth: tv ? 130 : 90 }}>
              <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, fontSize: tv ? 30 : 18, color: cerrado ? '#5f6b5f' : r.pendientes ? C.verde : C.verdeCl }}>
                {cerrado ? 'Cerrado' : !r.total ? 'Sin pedidos' : r.pendientes ? `${r.pendientes} quedan` : '✔ Listo para cerrar'}
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
        {!tv && <Leyenda color={C.azul}>Contado por cobrar</Leyenda>}
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
  detalle,
  onPunto,
}: {
  r: Pick<RutaSeg, 'entregados' | 'incidencias' | 'no_entregados' | 'pendientes' | 'pedidos'>
  alto: number
  /** Hora encima de cada punto (TV: pocas rutas y pantalla grande). */
  horas?: boolean
  /** Texto al pasar el ratón por el punto i (Control de Repartos del ERP: cliente, importe, forma de pago…). */
  detalle?: (i: number) => string | undefined
  /** Pinchar el punto i (Control de Repartos: abre la lista de pedidos con ese pedido resaltado). */
  onPunto?: (i: number) => void
}) {
  const COLOR = { entregado: C.verdeCl, incidencia: C.naranja, no_entregado: C.rojo, pendiente: C.gris } as const
  const puntos: { c: string; h: string | null }[] = r.pedidos
    ? r.pedidos.map((p) => ({ c: p.e === 'pendiente' && p.c && !horas ? C.azul : (COLOR[p.e] ?? C.gris), h: p.h })) // en la TV (horas) no se enseña nada de cobros: solo verde, naranja, rojo y gris
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
        <span key={i} style={{ position: 'relative', flex: '0 1 auto', minWidth: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
          {conHoras && (
            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: letra, fontWeight: 600, lineHeight: 1, color: p.h ? (p.c === C.rojo ? C.rojo : p.c === C.naranja ? '#a86400' : C.verde) : 'transparent', whiteSpace: 'nowrap', marginBottom: (alto - d) / 2 + 6 }}>
              {p.h ?? '00:00'}
            </span>
          )}
          <span
            title={detalle?.(i)}
            role={onPunto ? 'button' : undefined}
            onClick={
              onPunto
                ? (e) => {
                    e.stopPropagation()
                    onPunto(i)
                  }
                : undefined
            }
            style={{
              cursor: onPunto ? 'pointer' : detalle ? 'help' : undefined,
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
  // Al pinchar en un furgón el mapa se acerca al callejero y lo sigue; «Ver toda la isla» vuelve atrás.
  const [seguido, setSeguido] = useState<string | null>(null)
  const seguidoRef = useRef<string | null>(null)
  const isla = useRef<L.LatLngBounds | null>(null)
  const verIsla = () => {
    seguidoRef.current = null
    setSeguido(null)
    if (mapa.current && isla.current) mapa.current.flyToBounds(isla.current, { duration: 0.8 })
  }

  useEffect(() => {
    if (!caja.current || mapa.current) return
    // Mapa político de Tenerife: sin relieve; cada municipio con su color y su nombre, sobre el mar.
    // Solo la isla: no se puede salir de ella ni alejar más. Al acercar (zoom 12+) salen debajo las calles.
    const isla0 = L.latLngBounds([27.985, -16.935], [28.6, -16.105])
    const m = L.map(caja.current, { zoomControl: !tv, attributionControl: true, zoomSnap: 0.25, maxBounds: isla0.pad(0.12), maxBoundsViscosity: 1 }).fitBounds(isla0)
    m.setMinZoom(m.getZoom())
    caja.current.style.background = '#cfe3f1'
    const calles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' })
    m.attributionControl.addAttribution('© OpenStreetMap')
    m.createPane('municipios').style.zIndex = '350'
    m.createPane('rotulos').style.zIndex = '380'
    m.getPane('rotulos')!.style.pointerEvents = 'none'
    const formas = MUNICIPIOS_TENERIFE.map((mu) =>
      L.polygon(mu.g.map((pol) => pol.map((an) => an.map(([lng, lat]) => [lat, lng] as [number, number]))), {
        pane: 'municipios',
        color: '#5b6b7a',
        weight: 1.2,
        fillColor: COLORES_MUNICIPIO[mu.k % COLORES_MUNICIPIO.length],
        fillOpacity: 1,
        interactive: false,
      }).addTo(m),
    )
    const nombres = L.layerGroup(
      MUNICIPIOS_TENERIFE.flatMap((mu) => {
        const r = ROTULOS[mu.n]
        const donde = r?.en ?? mu.c
        const rotulo = L.marker(donde, {
          pane: 'rotulos',
          interactive: false,
          icon: L.divIcon({
            className: '',
            iconSize: [0, 0],
            html: `<div style="transform:translate(-50%,-50%);width:max-content;max-width:${tv ? 112 : 90}px;text-align:center;font:700 ${tv ? 13 : 10.5}px/1.08 Inter,sans-serif;color:#22303c;text-transform:uppercase;letter-spacing:.2px;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff">${r?.corto ?? mu.n}</div>`,
          }),
        })
        // Municipios pequeños de la costa norte: el nombre va en el mar, con una raya hasta el municipio.
        return r?.en ? [L.polyline([r.en, mu.c], { pane: 'rotulos', color: '#22303c', weight: 1, opacity: 0.7, interactive: false }), rotulo] : [rotulo]
      }),
    )
    const ajustar = () => {
      const cerca = m.getZoom() >= 12
      if (cerca && !m.hasLayer(calles)) calles.addTo(m)
      if (!cerca && m.hasLayer(calles)) m.removeLayer(calles)
      if (cerca && m.hasLayer(nombres)) m.removeLayer(nombres)
      if (!cerca && !m.hasLayer(nombres)) nombres.addTo(m)
      formas.forEach((f) => f.setStyle({ fillOpacity: cerca ? 0.28 : 1 }))
    }
    m.on('zoomend', ajustar)
    ajustar()
    capa.current = L.layerGroup().addTo(m)
    mapa.current = m
    isla.current = isla0
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
        const c = p.estado === 'liquidado' ? (tv ? C.verdeCl : '#1f6fb2') : p.estado === 'no_entregado' ? C.rojo : p.estado === 'incidencia' ? C.naranja : C.verdeCl
        // Al pulsar el punto: qué pedido se marcó ahí, cómo quedó y a qué hora (Rober, 17/11/2026).
        const que = p.estado === 'liquidado' ? 'Liquidada' : p.estado === 'no_entregado' ? 'No entregado' : p.estado === 'incidencia' ? 'Entregado con incidencia' : 'Entregado'
        const caja = document.createElement('div')
        caja.style.cssText = 'font:14px Inter,sans-serif;line-height:1.35'
        const nombre = document.createElement('b')
        nombre.textContent = p.cliente ?? 'Pedido'
        const detalle = document.createElement('div')
        detalle.style.color = c === C.verdeCl ? '#1f7a1f' : c
        detalle.textContent = `${que}${p.hora ? ' · ' + p.hora : ''} · ${r.repartidor_nombre ?? ''}`
        caja.append(nombre, detalle)
        L.circleMarker([p.lat, p.lng], { radius: tv ? 7 : 6, color: '#fff', weight: 1.5, fillColor: c, fillOpacity: 0.95 }).bindPopup(caja).addTo(g)
      }
      if (r.posicion) {
        // Cada furgón se queda siempre en su última posición conocida y dice a qué hora fue (Rober, 25/11/2026).
        // Sin noticias desde hace más de 15 min (ruta abierta): sale en ROJO. Ruta cerrada: en gris.
        const cerradaRuta = r.estado !== 2
        const viejo = !cerradaRuta && Date.now() - new Date(r.posicion.en).getTime() > MINUTOS_SIN_SEÑAL * 60_000
        const hora = new Date(r.posicion.en).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Atlantic/Canary' })
        const fondo = cerradaRuta ? '#7a847a' : viejo ? C.rojo : color
        const icono = L.divIcon({
          className: '',
          iconSize: [0, 0],
          html: `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center">
                   <div style="background:${fondo};color:#fff;border-radius:12px;padding:3px 8px;font:700 ${tv ? 15 : 12}px Inter,sans-serif;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.4)">🚚 ${r.repartidor_nombre ?? ''} · ${cerradaRuta ? 'cerrada' : r.pendientes} · ${hora}</div>
                   <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${fondo}"></div>
                 </div>`,
        })
        const clave = `${r.tienda}-${r.numero}`
        const pos: [number, number] = [r.posicion.lat, r.posicion.lng]
        L.marker(pos, { icon: icono, title: 'Pincha para acercar el mapa a este furgón' })
          .on('click', () => {
            seguidoRef.current = clave
            setSeguido(clave)
            mapa.current?.flyTo(pos, 16, { duration: 0.8 })
          })
          .addTo(g)
        // Si se está siguiendo a este furgón, el mapa se mueve con él en cada refresco.
        if (seguidoRef.current === clave && mapa.current && mapa.current.getZoom() >= 12) mapa.current.panTo(pos)
      }
    })
  }, [rutas, tv])

  const sinPosicion = rutas.filter((r) => r.estado === 2 && !r.posicion)
  return (
    <div style={{ position: 'relative', height: tv ? 'calc(100vh - 180px)' : 520, borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,.25)' }}>
      <div ref={caja} style={{ position: 'absolute', inset: 0 }} />
      {seguido && (
        <div style={{ position: 'absolute', right: 10, top: 10, zIndex: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: 'rgba(255,255,255,.94)', borderRadius: 10, padding: '6px 10px', fontSize: tv ? 15 : 12, fontWeight: 700 }}>
            🚚 Siguiendo a {rutas.find((r) => `${r.tienda}-${r.numero}` === seguido)?.repartidor_nombre ?? 'este furgón'}
          </span>
          <button type="button" onClick={verIsla} style={{ background: C.verde, color: '#fff', border: 'none', borderRadius: 10, padding: '7px 12px', fontSize: tv ? 15 : 13, fontWeight: 700, cursor: 'pointer' }}>
            ⤢ Ver toda la isla
          </button>
        </div>
      )}
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
