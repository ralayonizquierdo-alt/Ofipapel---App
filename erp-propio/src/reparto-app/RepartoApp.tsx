import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as PEvent, type ReactNode } from 'react'
import {
  cambiarTelefono,
  cancelarTraspaso,
  proponerTraspaso,
  responderTraspaso,
  traspasos,
  type TraspasoRecibido,
  type TraspasoRespuesta,
  cola,
  encolar,
  enviarCola,
  entrar,
  entrarDesdeFichaje,
  ErrorApp,
  avisoUbicacion,
  lineasOficina,
  todasLasRutas,
  type LineaOficina,
  type RutaOficina,
  cambiarPin,
  guardar,
  guardarCache,
  guardarSesion,
  leer,
  lineas as cargarLineas,
  lineasEnCache,
  posicion,
  repartidores,
  repartos as cargarRepartos,
  rutasDestino,
  sesionGuardada,
  type LineaApp,
  type RepartoApp,
  type Sesion,
} from './api'
import { estadoFichaje, estadoGuardado, type EstadoFichaje } from './fichaje'
import { AVISO_PIE, AVISO_PUNTOS, AVISO_TITULO, AVISO_VERSION } from './avisoUbicacion'
import { OPERATIVA_OFICINA, OPERATIVA_REPARTIDOR } from './operativaReparto'

// App de repartidores (/repartidor): móvil, sin cuenta del ERP. Mismo estilo que Fichaje (fichaje.html):
// verdes de Ofipapel, fondo con tréboles, tarjetas blancas con borde lima.
// Flujo: nombre → PIN → ruta → «Comprobar» (albaranes antes de salir) → «Repartir» (marcar cada pedido).

const V = {
  verde: '#1A5C1A',
  verdeMed: '#237523',
  verdeCl: '#3DAF3D',
  pale: '#EBF7EB',
  lima: '#8DC41E',
  naranja: '#F5A623',
  rojo: '#C62828',
  texto: '#1b2a1b',
  gris: '#5f6b5f',
}

const INCIDENCIAS: [string, string][] = [
  ['faltan', 'Faltan artículos'],
  ['devuelve', 'Devuelve artículos'],
  ['no_corresponde', 'No corresponde con lo pedido'],
  ['otro', 'Otro'],
]
const MOTIVOS: [string, string][] = [
  ['no_contesta', 'Nadie contesta'],
  ['direccion', 'La dirección no coincide'],
  ['ausente', 'Cliente ausente'],
  ['cerrado', 'Cerrado'],
  ['otro', 'Otro'],
]

const normal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
const hora = (v: string | null) => (v ? new Date(v).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Atlantic/Canary' }) : '')
/** Número para WhatsApp (con el 34 delante) si el teléfono es un móvil español o ya trae prefijo; si es un fijo, nada. */
const numeroWhatsApp = (tel: string | null | undefined): string | null => {
  if (!tel) return null
  let n = tel.replace(/\D/g, '')
  if (tel.trim().startsWith('+')) return n.length >= 9 ? n : null
  if (n.startsWith('00')) return n.length >= 11 ? n.slice(2) : null
  if (n.length === 11 && n.startsWith('34')) n = n.slice(2)
  return n.length === 9 && /^[67]/.test(n) ? '34' + n : null
}
const euros = (n: number | null | undefined) => (n == null ? '' : n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €')
const base = import.meta.env.BASE_URL
// Fichaje (/fichaje, en el ERP): el registro horario legal; lo gestiona gerencia en Archivo → Fichaje.
const FICHAJE_URL = `${base}fichaje`

function useFuentesYManifiesto() {
  useEffect(() => {
    const id = 'reparto-fuentes'
    if (!document.getElementById(id)) {
      const l = document.createElement('link')
      l.id = id
      l.rel = 'stylesheet'
      l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&family=Poppins:wght@700;800&display=swap'
      document.head.appendChild(l)
    }
    const man = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    const antes = man?.getAttribute('href') ?? null
    if (man) man.setAttribute('href', `${base}repartidor.webmanifest`)
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    const color = meta?.content ?? null
    if (meta) meta.content = V.verde
    const titulo = document.title
    document.title = 'Reparto · Ofipapel'
    return () => {
      if (man && antes) man.setAttribute('href', antes)
      if (meta && color) meta.content = color
      document.title = titulo
    }
  }, [])
}

// ------------------------------------------------------------------ Piezas de estilo
function Cabecera({ sub, derecha }: { sub?: string; derecha?: ReactNode }) {
  const [ayuda, setAyuda] = useState(false)
  const apartados = sub === 'OFICINA' ? OPERATIVA_OFICINA : OPERATIVA_REPARTIDOR
  return (
    <div
      style={{
        background: 'linear-gradient(135deg,#0d3d0d 0%,#1A5C1A 45%,#237523 75%,#3a8f2a 100%)',
        borderRadius: 22,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,.25)',
      }}
    >
      <img src={`${base}marca/logo-ofipapel.png`} alt="Ofipapel" style={{ height: 44, width: 'auto', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, color: '#fff' }}>
        <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 24, lineHeight: 1.1 }}>Reparto</div>
        <div style={{ fontSize: 12, letterSpacing: 2.5, fontWeight: 600, opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sub ?? 'OFIPAPEL'}
        </div>
      </div>
      {/* Operativa: discreta, en todas las pantallas. */}
      <button
        type="button"
        onClick={() => setAyuda(true)}
        aria-label="Cómo funciona"
        style={{ width: 32, height: 32, borderRadius: 16, border: '1.5px solid rgba(255,255,255,.55)', background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 16, fontWeight: 700, flexShrink: 0 }}
      >
        ?
      </button>
      {derecha}
      {ayuda && (
        <div onClick={() => setAyuda(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', width: '100%', maxWidth: 560, maxHeight: '88dvh', borderRadius: '22px 22px 0 0', borderTop: `5px solid ${V.lima}`, display: 'flex', flexDirection: 'column', color: V.texto }}
          >
            <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px 10px' }}>
              <div style={{ flex: 1, fontWeight: 700, fontSize: 19, color: V.verde }}>Cómo funciona</div>
              <button type="button" onClick={() => setAyuda(false)} style={{ border: 'none', background: V.pale, color: V.verde, borderRadius: 12, padding: '8px 14px', fontWeight: 700, fontSize: 15 }}>
                Cerrar
              </button>
            </div>
            <div style={{ overflowY: 'auto', padding: '0 16px 28px' }}>
              {apartados.map((a) => (
                <div key={a.titulo} style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: V.verde, marginBottom: 4 }}>
                    {a.icono} {a.titulo}
                  </div>
                  {a.pasos.map((t) => (
                    <div key={t} style={{ display: 'flex', gap: 8, fontSize: 15, lineHeight: 1.4, marginBottom: 4 }}>
                      <span style={{ color: V.verdeCl, flexShrink: 0 }}>•</span>
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Tarjeta({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,.97)',
        borderRadius: 22,
        borderTop: `5px solid ${V.lima}`,
        padding: 16,
        boxShadow: '0 8px 24px rgba(0,0,0,.18)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function Boton({ children, onClick, color = V.verdeMed, claro, disabled, style }: { children: ReactNode; onClick?: () => void; color?: string; claro?: boolean; disabled?: boolean; style?: CSSProperties }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: claro ? '#fff' : color,
        color: claro ? color : '#fff',
        border: `2px solid ${color}`,
        borderRadius: 14,
        padding: '12px 14px',
        fontWeight: 700,
        fontSize: 16,
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function BotonCabecera({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background: 'rgba(255,255,255,.14)', color: '#fff', border: '1px solid rgba(255,255,255,.35)', borderRadius: 12, padding: '8px 10px', fontWeight: 600, fontSize: 13 }}
    >
      {children}
    </button>
  )
}

// ------------------------------------------------------------------ App
export function RepartoApp() {
  useFuentesYManifiesto()
  const [sesion, setSesion] = useState<Sesion | null>(() => sesionGuardada())
  const [reparto, setReparto] = useState<RepartoApp | null>(() => leer<RepartoApp>('reparto.abierto'))

  // Desde Fichaje («🚚 Mi reparto»): /repartidor?t=<token>, ya identificado con su PIN allí.
  useEffect(() => {
    const t = new URLSearchParams(location.search).get('t')
    if (!t) return
    history.replaceState(null, '', location.pathname)
    entrarDesdeFichaje(t)
      .then(setSesion)
      .catch(() => {
        /* caducado: que entre con su PIN */
      })
  }, [])

  // Aviso de ubicación: se enseña una vez por repartidor y versión del texto (también queda en el servidor).
  const [, setAvisoVisto] = useState(0)
  const avisoLeido = !!sesion && leer<string>(`reparto.aviso.${sesion.repartidor}`) === AVISO_VERSION

  const salir = () => {
    guardarSesion(null)
    guardar('reparto.abierto', null)
    setSesion(null)
    setReparto(null)
  }
  const elegir = (r: RepartoApp | null) => {
    guardar('reparto.abierto', r)
    setReparto(r)
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: `#1A5C1A url(${base}marca/fondo-reparto.jpg) center top / cover fixed`,
        fontFamily: 'Inter, system-ui, sans-serif',
        color: V.texto,
        padding: '14px 12px 90px',
      }}
    >
      <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!sesion ? (
          <Entrada onEntrar={setSesion} />
        ) : sesion.supervisor ? (
          <Oficina sesion={sesion} onSalir={salir} onCaducada={() => setSesion(null)} />
        ) : !avisoLeido ? (
          <AvisoUbicacion sesion={sesion} onLeido={() => setAvisoVisto((v) => v + 1)} onSalir={salir} onCaducada={() => setSesion(null)} />
        ) : !reparto ? (
          <ElegirRuta sesion={sesion} onElegir={elegir} onSalir={salir} onCaducada={() => setSesion(null)} />
        ) : (
          <Ruta sesion={sesion} reparto={reparto} onVolver={() => elegir(null)} onCaducada={() => setSesion(null)} />
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Oficina: todas las rutas (solo lectura)
const ESTADO_OFI: Record<LineaOficina['estado'], [string, string]> = {
  entregado: ['Entregado', V.verdeMed],
  incidencia: ['Entregado con incidencia', V.naranja],
  no_entregado: ['NO entregado', V.rojo],
  pendiente: ['Pendiente', V.gris],
}
const textoDe = (lista: [string, string][], v: string | null) => (v ? (lista.find(([k]) => k === v)?.[1] ?? v) : null)

function Oficina({ sesion, onSalir, onCaducada }: { sesion: Sesion; onSalir: () => void; onCaducada: () => void }) {
  const [rutas, setRutas] = useState<RutaOficina[] | null>(null)
  const [hoy, setHoy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<RutaOficina | null>(null)
  const [lineas, setLineas] = useState<LineaOficina[] | null>(null)
  const [hora, setHora] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await todasLasRutas(sesion.token)
      setRutas(r.rutas ?? [])
      setHoy(r.hoy ?? null)
      setError(null)
      setHora(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
    } catch (e) {
      const err = e as ErrorApp
      if (err.caducada) onCaducada()
      else setError(err.red ? 'Sin conexión: se reintenta solo.' : err.message)
    }
  }, [sesion.token, onCaducada])
  const cargarLineas = useCallback(
    async (r: RutaOficina) => {
      try {
        setLineas(await lineasOficina(sesion.token, r.tienda, r.numero))
      } catch (e) {
        const err = e as ErrorApp
        if (err.caducada) onCaducada()
        else setError(err.red ? 'Sin conexión: se reintenta solo.' : err.message)
      }
    },
    [sesion.token, onCaducada],
  )
  // Se refresca sola cada 30 segundos (la lista y, si hay una ruta abierta, su detalle).
  useEffect(() => {
    void cargar()
    if (abierta) void cargarLineas(abierta)
    const t = setInterval(() => {
      void cargar()
      if (abierta) void cargarLineas(abierta)
    }, 30_000)
    return () => clearInterval(t)
  }, [cargar, cargarLineas, abierta])

  const titulo = (r: RutaOficina) => `RUTA ${r.ruta && /^\d+$/.test(r.ruta) ? Number(r.ruta) : (r.ruta ?? '')} · ${r.ruta_nombre ?? ''}`
  const dia = (f: string) => new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
  const situacion = (r: RutaOficina): [string, string] =>
    r.estado !== 2
      ? ['Cerrado', V.gris]
      : !r.total
        ? ['Sin pedidos', V.gris]
        : r.pendientes === 0
          ? ['✔ Listo para cerrar', V.verdeMed]
          : r.pendientes === r.total
            ? [hoy && r.fecha > hoy ? 'Preparado, sin salir' : 'Sin empezar', V.gris]
            : [`En reparto · quedan ${r.pendientes}`, V.naranja]

  if (abierta) {
    const r = rutas?.find((x) => x.tienda === abierta.tienda && x.numero === abierta.numero) ?? abierta
    const [sit, color] = situacion(r)
    return (
      <>
        <Cabecera
          sub="OFICINA"
          derecha={
            <BotonCabecera
              onClick={() => {
                setAbierta(null)
                setLineas(null)
              }}
            >
              ← Rutas
            </BotonCabecera>
          }
        />
        <Tarjeta>
          <div style={{ fontWeight: 700, fontSize: 19, color: V.verde }}>{titulo(r)}</div>
          <div style={{ color: V.gris, fontSize: 14 }}>
            {r.repartidor ?? 'Sin repartidor'} · {dia(r.fecha)} · reparto nº {r.numero}
          </div>
          <div style={{ fontWeight: 700, color, margin: '6px 0 10px' }}>{sit}</div>
          {!lineas && <div style={{ color: V.gris }}>Cargando…</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lineas?.map((l) => {
              const [et, ec] = ESTADO_OFI[l.estado]
              const detalle = [textoDe(MOTIVOS, l.motivo), textoDe(INCIDENCIAS, l.incidencia), l.nota].filter(Boolean).join(' · ')
              return (
                <div key={`${l.vt}-${l.vn}`} style={{ borderLeft: `6px solid ${ec}`, background: '#f7faf7', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{l.cliente}</div>
                  <div style={{ fontSize: 13, color: V.gris }}>
                    {l.factura ? `Factura ${l.factura}` : `Albarán ${l.vt}/${l.vn}`} · {euros(l.total)}
                    {l.contado ? (l.total != null && l.pagado != null && l.total - l.pagado > 0.005 ? ' · CONTADO sin pagar' : ' · contado, pagado') : ''}
                    {l.poblacion ? ` · ${l.poblacion}` : ''}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: ec, marginTop: 2 }}>
                    {et}
                    {l.hora ? ` · ${l.hora}` : ''}
                  </div>
                  {detalle && <div style={{ fontSize: 13, color: V.texto }}>{detalle}</div>}
                  {l.telefono_repartidor && <div style={{ fontSize: 13, color: '#1f6fb2' }}>📞 El repartidor usó otro teléfono: {l.telefono_repartidor}</div>}
                </div>
              )
            })}
          </div>
          {error && <div style={{ color: V.rojo, marginTop: 10 }}>{error}</div>}
        </Tarjeta>
      </>
    )
  }

  return (
    <>
      <Cabecera sub="OFICINA" derecha={<BotonCabecera onClick={onSalir}>Salir</BotonCabecera>} />
      <Tarjeta>
        <div style={{ fontWeight: 700, fontSize: 18, color: V.verde }}>Todas las rutas</div>
        <div style={{ color: V.gris, fontSize: 13, marginBottom: 10 }}>Solo para mirar. Se actualiza sola{hora ? ` · ${hora}` : ''}.</div>
        {!rutas && !error && <div style={{ color: V.gris }}>Cargando…</div>}
        {rutas && !rutas.length && <div style={{ color: V.gris }}>No hay ningún reparto abierto ni de hoy.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rutas?.map((r) => {
            const [sit, color] = situacion(r)
            return (
              <button
                key={`${r.tienda}-${r.numero}`}
                type="button"
                onClick={() => {
                  setLineas(null)
                  setAbierta(r)
                }}
                style={{ textAlign: 'left', background: '#fff', border: `2px solid ${color}`, borderRadius: 16, padding: 12 }}
              >
                <div style={{ fontWeight: 700, fontSize: 17, color: V.verde }}>{titulo(r)}</div>
                <div style={{ color: V.gris, fontSize: 13 }}>
                  {r.repartidor ?? 'Sin repartidor'} · {dia(r.fecha)}
                </div>
                <div style={{ fontWeight: 700, color, marginTop: 4 }}>{sit}</div>
                <div style={{ fontSize: 13, color: V.texto }}>
                  {r.total} pedidos · {r.entregados} entregados
                  {r.incidencias ? ` · ${r.incidencias} con incidencia` : ''}
                  {r.no_entregados ? ` · ${r.no_entregados} NO entregados` : ''}
                </div>
              </button>
            )
          })}
        </div>
        {error && <div style={{ color: V.rojo, marginTop: 10 }}>{error}</div>}
      </Tarjeta>
    </>
  )
}

// ------------------------------------------------------------------ Aviso de ubicación (primera vez)
function AvisoUbicacion({ sesion, onLeido, onSalir, onCaducada }: { sesion: Sesion; onLeido: () => void; onSalir: () => void; onCaducada: () => void }) {
  const [estado, setEstado] = useState<'comprobando' | 'leer' | 'enviando'>('comprobando')
  const [error, setError] = useState<string | null>(null)
  const hecho = useCallback(() => {
    guardar(`reparto.aviso.${sesion.repartidor}`, AVISO_VERSION)
    onLeido()
  }, [sesion.repartidor, onLeido])
  // Si ya lo leyó en otro móvil, no se le vuelve a enseñar.
  useEffect(() => {
    avisoUbicacion(sesion.token, AVISO_VERSION)
      .then((r) => (r.leido ? hecho() : setEstado('leer')))
      .catch((e: ErrorApp) => (e.caducada ? onCaducada() : setEstado('leer')))
  }, [sesion.token, hecho, onCaducada])
  const aceptar = async () => {
    setEstado('enviando')
    setError(null)
    try {
      await avisoUbicacion(sesion.token, AVISO_VERSION, true)
      hecho()
    } catch (e) {
      const err = e as ErrorApp
      if (err.caducada) return onCaducada()
      setError(err.red ? 'Sin conexión: hace falta cobertura para confirmar la lectura.' : err.message)
      setEstado('leer')
    }
  }
  return (
    <>
      <Cabecera sub={sesion.nombre.toUpperCase()} derecha={<BotonCabecera onClick={onSalir}>Salir</BotonCabecera>} />
      <Tarjeta>
        <div style={{ fontWeight: 700, fontSize: 20, color: V.verde, marginBottom: 10 }}>📍 {AVISO_TITULO}</div>
        {estado === 'comprobando' ? (
          <div style={{ color: V.gris }}>Un momento…</div>
        ) : (
          <>
            {AVISO_PUNTOS.map(([t, d]) => (
              <div key={t} style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700, color: V.verde, fontSize: 15 }}>{t}</div>
                <div style={{ fontSize: 15, lineHeight: 1.35 }}>{d}</div>
              </div>
            ))}
            <div style={{ fontSize: 12.5, color: V.gris, lineHeight: 1.35, margin: '12px 0' }}>{AVISO_PIE}</div>
            {error && <div style={{ color: V.rojo, marginBottom: 10 }}>{error}</div>}
            <Boton disabled={estado === 'enviando'} onClick={aceptar} style={{ width: '100%' }}>
              He leído y entiendo
            </Boton>
          </>
        )}
      </Tarjeta>
    </>
  )
}

// ------------------------------------------------------------------ Entrada: nombre + PIN
function Entrada({ onEntrar }: { onEntrar: (s: Sesion) => void }) {
  const [lista, setLista] = useState<{ codigo: string; nombre: string }[] | null>(null)
  const [quien, setQuien] = useState<{ codigo: string; nombre: string } | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [ahora, setAhora] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    repartidores()
      .then((l) => {
        setLista(l)
        // Desde Fichaje se puede abrir con el repartidor ya elegido: /repartidor?r=CODIGO
        // …o desde Fichaje con su nombre: /repartidor?n=Nombre Apellidos (se busca por nombre; el PIN sigue haciendo falta)
        const q = new URLSearchParams(location.search)
        const r = q.get('r')
        const nom = normal(q.get('n') ?? '')
        const encontrado = r
          ? l.find((x) => x.codigo === r)
          : nom
            ? (l.find((x) => normal(x.nombre) === nom) ?? l.find((x) => nom.split(' ').includes(normal(x.nombre).split(' ')[0])))
            : null
        if (encontrado) setQuien(encontrado)
      })
      .catch((e: ErrorApp) => setError(e.red ? 'Sin conexión. Prueba otra vez cuando tengas cobertura.' : e.message))
  }, [])

  // PIN de 4 a 8 cifras: se teclea y se pulsa «Entrar». Con el PIN inicial (o si lo pide), antes de pasar se elige uno nuevo.
  const [quiereCambiar, setQuiereCambiar] = useState(false)
  const [paso, setPaso] = useState<'pin' | 'nuevo' | 'repite'>('pin')
  const [pendiente, setPendiente] = useState<{ sesion: Sesion; actual: string } | null>(null)
  const [nuevo, setNuevo] = useState('')

  const volver = () => {
    setQuien(null)
    setPin('')
    setError(null)
    setPaso('pin')
    setPendiente(null)
    setNuevo('')
    setQuiereCambiar(false)
  }
  const pulsar = (d: string) => {
    if (cargando) return
    setPin((p) => (p + d).slice(0, 8))
    setError(null)
  }
  const aceptar = async () => {
    if (cargando || pin.length < 4 || !quien) return
    if (paso === 'pin') {
      setCargando(true)
      try {
        const r = await entrar(quien.codigo, pin)
        if (r.debeCambiar || quiereCambiar) {
          setPendiente({ sesion: r.sesion, actual: pin })
          setPaso('nuevo')
          setPin('')
        } else onEntrar(r.sesion)
      } catch (e) {
        setError((e as Error).message)
        setPin('')
      } finally {
        setCargando(false)
      }
    } else if (paso === 'nuevo') {
      if (pendiente && pin === pendiente.actual) {
        setError('El PIN nuevo tiene que ser distinto del que tenías.')
        setPin('')
        return
      }
      setNuevo(pin)
      setPin('')
      setPaso('repite')
    } else if (pendiente) {
      if (pin !== nuevo) {
        setError('No coincide. Empieza otra vez con el PIN nuevo.')
        setPin('')
        setNuevo('')
        setPaso('nuevo')
        return
      }
      setCargando(true)
      try {
        await cambiarPin(pendiente.sesion.token, pendiente.actual, nuevo)
        guardarSesion(pendiente.sesion)
        onEntrar(pendiente.sesion)
      } catch (e) {
        setError((e as ErrorApp).red ? 'Sin conexión: inténtalo con cobertura.' : (e as Error).message)
        setPin('')
        setNuevo('')
        setPaso('nuevo')
      } finally {
        setCargando(false)
      }
    }
  }
  const rotulo =
    paso === 'pin'
      ? quiereCambiar
        ? 'Pon primero tu PIN de ahora'
        : 'Pon tu PIN y pulsa Entrar'
      : paso === 'nuevo'
        ? 'Elige tu PIN nuevo: 4, 6 u 8 cifras'
        : 'Repite el PIN nuevo'

  return (
    <>
      <Cabecera />
      <Tarjeta>
        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 40, fontWeight: 600, color: V.verde, textAlign: 'center' }}>
          {ahora.toLocaleTimeString('es-ES', { timeZone: 'Atlantic/Canary' })}
        </div>
        <div style={{ textAlign: 'center', color: V.verdeMed, fontWeight: 500, textTransform: 'capitalize' }}>
          {ahora.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Atlantic/Canary' })}
        </div>
      </Tarjeta>
      {!quien ? (
        <Tarjeta>
          <div style={{ textAlign: 'center', color: V.gris, marginBottom: 12 }}>Toca tu nombre</div>
          {!lista && !error && <div style={{ textAlign: 'center', color: V.gris }}>Cargando…</div>}
          {lista && !lista.length && <div style={{ textAlign: 'center', color: V.gris }}>Aún no hay repartidores con PIN. Pídelo en la oficina.</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {lista?.map((r) => (
              <Boton key={r.codigo} claro onClick={() => setQuien(r)} style={{ padding: '16px 10px' }}>
                {r.nombre}
              </Boton>
            ))}
          </div>
          {error && <div style={{ color: V.rojo, textAlign: 'center', marginTop: 10 }}>{error}</div>}
        </Tarjeta>
      ) : (
        <Tarjeta>
          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 20, color: V.verde }}>Hola, {quien.nombre}</div>
          {paso !== 'pin' && (
            <div style={{ background: '#fff7e0', border: `1px solid ${V.naranja}`, borderRadius: 12, padding: '8px 12px', fontSize: 14, margin: '8px 0' }}>
              🔑 {quiereCambiar ? 'Vas a cambiar tu PIN.' : 'Es la primera vez que entras: tienes que poner un PIN tuyo.'} Que no lo sepa nadie más.
            </div>
          )}
          <div style={{ textAlign: 'center', color: paso === 'pin' ? V.gris : V.verde, fontWeight: paso === 'pin' ? 400 : 700, marginBottom: 10 }}>{rotulo}</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 14, minHeight: 18 }}>
            {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
              <span key={i} style={{ width: 18, height: 18, borderRadius: 9, background: i < pin.length ? V.verdeMed : '#dfe8df' }} />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <Boton key={d} claro onClick={() => pulsar(d)} style={{ fontSize: 26, padding: '14px 0' }}>
                {d}
              </Boton>
            ))}
            <Boton claro color={V.gris} onClick={volver} style={{ fontSize: 14 }}>
              No soy yo
            </Boton>
            <Boton claro onClick={() => pulsar('0')} style={{ fontSize: 26, padding: '14px 0' }}>
              0
            </Boton>
            <Boton claro color={V.gris} onClick={() => setPin(pin.slice(0, -1))} style={{ fontSize: 22 }}>
              ⌫
            </Boton>
          </div>
          <Boton disabled={cargando || pin.length < 4 || (paso !== 'pin' && pin.length % 2 === 1)} onClick={aceptar} style={{ width: '100%', marginTop: 12, fontSize: 20, padding: '14px 0' }}>
            {cargando ? 'Un momento…' : paso === 'pin' ? 'Entrar' : paso === 'nuevo' ? 'Siguiente' : 'Guardar y entrar'}
          </Boton>
          {error && <div style={{ color: V.rojo, textAlign: 'center', marginTop: 10, fontWeight: 600 }}>{error}</div>}
          {paso === 'pin' && (
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <button
                type="button"
                onClick={() => (setQuiereCambiar(!quiereCambiar), setPin(''), setError(null))}
                style={{ background: 'none', border: 'none', color: V.verdeMed, fontSize: 15, textDecoration: 'underline', padding: 8 }}
              >
                {quiereCambiar ? 'No, solo quiero entrar' : '🔑 Cambiar mi PIN'}
              </button>
            </div>
          )}
        </Tarjeta>
      )}
    </>
  )
}

// ------------------------------------------------------------------ Elegir ruta
function ElegirRuta({ sesion, onElegir, onSalir, onCaducada }: { sesion: Sesion; onElegir: (r: RepartoApp) => void; onSalir: () => void; onCaducada: () => void }) {
  const [lista, setLista] = useState<RepartoApp[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    cargarRepartos(sesion.token)
      .then(setLista)
      .catch((e: ErrorApp) => (e.caducada ? onCaducada() : setError(e.red ? 'Sin conexión.' : e.message)))
  }, [sesion.token, onCaducada])
  return (
    <>
      <Cabecera sub={sesion.nombre.toUpperCase()} derecha={<BotonCabecera onClick={onSalir}>Salir</BotonCabecera>} />
      <AvisosTraspaso sesion={sesion} />
      <Tarjeta>
        <div style={{ fontWeight: 700, fontSize: 18, color: V.verde, marginBottom: 10 }}>Tu ruta de hoy</div>
        {!lista && !error && <div style={{ color: V.gris }}>Cargando…</div>}
        {lista && !lista.some((r) => !r.manana) && (
          <div style={{ color: V.gris }}>{lista.length ? 'Hoy no tienes ninguna ruta abierta.' : 'No hay rutas abiertas para ti. Si esperabas una, avisa en la oficina.'}</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lista
            ?.filter((r) => !r.manana)
            .map((r) => (
              <button
                key={`${r.tienda}-${r.numero}`}
                type="button"
                onClick={() => onElegir(r)}
                style={{ textAlign: 'left', background: r.mio ? V.pale : '#fff', border: `2px solid ${r.mio ? V.verdeMed : '#cfe0cf'}`, borderRadius: 16, padding: 14 }}
              >
                <div style={{ fontWeight: 700, fontSize: 18, color: V.verde }}>🚚 {r.ruta_nombre ?? 'Sin ruta'}</div>
                <div style={{ color: V.gris, fontSize: 14 }}>
                  {r.pedidos} pedidos · {r.pendientes} por entregar{r.mio ? ' · tuya' : ' · sin repartidor'}
                </div>
              </button>
            ))}
        </div>
        {error && <div style={{ color: V.rojo, marginTop: 10 }}>{error}</div>}
      </Tarjeta>
      {!!lista?.some((r) => r.manana) && (
        <Tarjeta style={{ borderTopColor: '#8a968a', background: '#f1f4f1' }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#4a564a' }}>📅 Reparto de mañana</div>
          <div style={{ color: V.gris, fontSize: 13, marginBottom: 10 }}>Para ir mirándolo y comprobar los albaranes. No se entrega hasta su día.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lista
              .filter((r) => r.manana)
              .map((r) => (
                <button
                  key={`${r.tienda}-${r.numero}`}
                  type="button"
                  onClick={() => onElegir(r)}
                  style={{ textAlign: 'left', background: '#fafbfa', border: '2px dashed #b3bdb3', borderRadius: 16, padding: 12 }}
                >
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#4a564a' }}>🚚 {r.ruta_nombre ?? 'Sin ruta'}</div>
                  <div style={{ color: V.gris, fontSize: 13 }}>
                    {new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })} · {r.pedidos} pedidos
                    {r.mio ? '' : ' · sin repartidor'}
                  </div>
                </button>
              ))}
          </div>
        </Tarjeta>
      )}
    </>
  )
}

// ------------------------------------------------------------------ Ruta
type Hoja = { tipo: 'incidencia' | 'no_entregado' | 'ruta' | 'telefono'; linea: LineaApp } | null

function Ruta({ sesion, reparto, onVolver, onCaducada }: { sesion: Sesion; reparto: RepartoApp; onVolver: () => void; onCaducada: () => void }) {
  const [datos, setDatos] = useState(() => lineasEnCache(reparto.tienda, reparto.numero))
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [hoja, setHoja] = useState<Hoja>(null)
  const [pendientesCola, setPendientesCola] = useState(() => cola().length)
  // Reparto de mañana: se puede mirar y comprobar, no entregar (salvo que el repartidor diga que lo reparte hoy).
  const [adelantado, setAdelantado] = useState(() => leer<boolean>(`reparto.adelantado.${reparto.tienda}-${reparto.numero}`) === true)
  const fechaReparto = datos?.reparto.fecha ?? reparto.fecha
  const esManana = !adelantado && !!fechaReparto && fechaReparto > new Date().toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Canary' })
  const [modoElegido, setModo] = useState<'comprobar' | 'repartir'>(() => (leer<string>(`reparto.modo.${reparto.tienda}-${reparto.numero}`) as 'comprobar' | 'repartir') ?? 'comprobar')
  const [gps, setGps] = useState<'si' | 'no' | null>(() => leer<'si' | 'no'>('reparto.gps'))
  // Fichaje: sin la entrada fichada hoy no se puede entregar (sí ver, comprobar, ordenar y cambiar de ruta).
  const [fichaje, setFichaje] = useState<EstadoFichaje | 'comprobando' | 'sin_conexion'>(() => estadoGuardado(sesion.repartidor) ?? 'comprobando')
  const mirarFichaje = useCallback(async () => {
    try {
      setFichaje(await estadoFichaje(sesion.token, sesion.repartidor))
    } catch {
      setFichaje(estadoGuardado(sesion.repartidor) ?? 'sin_conexion')
    }
  }, [sesion.token, sesion.repartidor])
  useEffect(() => {
    void mirarFichaje()
    const t = setInterval(() => void mirarFichaje(), 60_000)
    const vis = () => document.visibilityState === 'visible' && void mirarFichaje()
    document.addEventListener('visibilitychange', vis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [mirarFichaje])
  const puedeEntregar = fichaje === 'trabajando' || fichaje === 'sin_vinculo'

  // Los pedidos que ya lleva un compañero (pasados y aceptados) salen de la lista; quedan anotados al final.
  const pasados = useMemo(() => (datos?.lineas ?? []).filter((l) => l.traspaso?.estado === 'aceptado'), [datos])
  const ls = useMemo(() => (datos?.lineas ?? []).filter((l) => l.traspaso?.estado !== 'aceptado'), [datos])
  const clave = (l: LineaApp) => `${l.vt}-${l.vn}`

  const recargar = useCallback(async () => {
    try {
      const r = await cargarLineas(sesion.token, reparto.tienda, reparto.numero)
      setDatos(r)
      setError(null)
    } catch (e) {
      const err = e as ErrorApp
      if (err.caducada) onCaducada()
      else if (err.red) setAviso('Sin conexión: trabajas con la última lista guardada.')
      else setError(err.message)
    }
  }, [sesion.token, reparto.tienda, reparto.numero, onCaducada])

  const enviar = useCallback(async () => {
    const r = await enviarCola(sesion.token)
    setPendientesCola(r.pendientes)
    if (r.caducada) return onCaducada()
    if (r.errores.length) {
      setAviso(r.errores.join(' · '))
      void recargar()
    }
  }, [sesion.token, onCaducada, recargar])

  useEffect(() => {
    void (async () => {
      await enviar()
      await recargar()
    })()
    const t = setInterval(() => void enviar(), 20_000)
    const online = () => void enviar().then(recargar)
    window.addEventListener('online', online)
    return () => {
      clearInterval(t)
      window.removeEventListener('online', online)
    }
  }, [enviar, recargar])

  // Posición para la pantalla de pedidos: solo mientras la ruta está abierta y si el repartidor ha aceptado.
  useEffect(() => {
    if (gps !== 'si' || !('geolocation' in navigator)) return
    let ultimo = 0
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (Date.now() - ultimo < 30_000) return
        ultimo = Date.now()
        posicion(sesion.token, reparto.tienda, reparto.numero, p.coords.latitude, p.coords.longitude, p.coords.accuracy).catch(() => {})
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 30_000, timeout: 60_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [gps, sesion.token, reparto.tienda, reparto.numero])

  const ultimaPos = useRef<{ lat: number; lng: number } | null>(null)
  useEffect(() => {
    if (gps !== 'si' || !('geolocation' in navigator)) return
    const id = navigator.geolocation.watchPosition((p) => (ultimaPos.current = { lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { maximumAge: 60_000 })
    return () => navigator.geolocation.clearWatch(id)
  }, [gps])

  const cambiarLocal = (k: string, cambio: Partial<LineaApp>) => {
    if (!datos) return
    const nuevo = { ...datos, lineas: datos.lineas.map((l) => (clave(l) === k ? { ...l, ...cambio } : l)) }
    setDatos(nuevo)
    guardarCache(reparto.tienda, reparto.numero, nuevo)
  }

  const accion = (l: LineaApp, tipo: 'entregado' | 'incidencia' | 'no_entregado' | 'deshacer', detalle?: string, nota?: string) => {
    if (tipo !== 'deshacer' && esManana) {
      setHoja(null)
      setAviso('Este reparto es para mañana: todavía no se puede entregar.')
      return
    }
    if (tipo !== 'deshacer' && !puedeEntregar) {
      setHoja(null)
      setAviso('Primero ficha la entrada en Fichaje: hasta entonces puedes ver, comprobar y ordenar la ruta, pero no entregar.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const ahora = new Date().toISOString()
    const pos = ultimaPos.current
    if (tipo === 'entregado') cambiarLocal(clave(l), { estado: 'entregado', incidencia: null, motivo: null, entregado_en: ahora, nota: nota ?? null })
    if (tipo === 'incidencia') cambiarLocal(clave(l), { estado: 'entregado', incidencia: detalle ?? null, motivo: null, entregado_en: ahora, nota: nota ?? null })
    if (tipo === 'no_entregado')
      cambiarLocal(clave(l), {
        estado: 'no_entregado',
        motivo: detalle ?? null,
        incidencia: null,
        nota: nota ?? null,
        intento1: l.intento1 ?? ahora,
        intento2: l.intento1 ? ahora : null,
        entregado_en: null,
      })
    if (tipo === 'deshacer')
      cambiarLocal(clave(l), {
        estado: l.prioritario ? 'viene_anterior' : 'pendiente',
        incidencia: null,
        motivo: null,
        nota: null,
        entregado_en: null,
        intento2: l.estado === 'no_entregado' && l.intento2 ? null : l.intento2,
        intento1: l.estado === 'no_entregado' && !l.intento2 ? null : l.intento1,
      })
    encolar('fn_app_rep_marcar', {
      p_tienda: l.rt ?? reparto.tienda,
      p_numero: l.rn ?? reparto.numero,
      p_vt: l.vt,
      p_vn: l.vn,
      p_accion: tipo,
      p_detalle: detalle ?? null,
      p_nota: nota ?? null,
      p_en: ahora,
      p_lat: pos?.lat ?? null,
      p_lng: pos?.lng ?? null,
    })
    setPendientesCola(cola().length)
    setHoja(null)
    setAbierta(null)
    void enviar()
  }

  const comprobar = (l: LineaApp) => {
    cambiarLocal(clave(l), { comprobado: !l.comprobado })
    encolar('fn_app_rep_comprobar', { p_tienda: l.rt ?? reparto.tienda, p_numero: l.rn ?? reparto.numero, p_vt: l.vt, p_vn: l.vn, p_ok: !l.comprobado })
    setPendientesCola(cola().length)
    void enviar()
  }

  const reordenar = (nuevas: LineaApp[]) => {
    if (!datos) return
    const nuevo = { ...datos, lineas: [...nuevas, ...pasados] }
    setDatos(nuevo)
    guardarCache(reparto.tienda, reparto.numero, nuevo)
    encolar('fn_app_rep_orden', { p_tienda: reparto.tienda, p_numero: reparto.numero, p_orden: nuevas.filter((l) => !l.viene_de).map((l) => ({ vt: l.vt, vn: l.vn })) })
    setPendientesCola(cola().length)
    void enviar()
  }

  const modo = esManana ? 'comprobar' : modoElegido
  const cambiarModo = (m: 'comprobar' | 'repartir') => {
    if (esManana && m === 'repartir') {
      setAviso('Este reparto es para mañana: hoy solo puedes mirarlo y comprobar los albaranes.')
      return
    }
    setModo(m)
    guardar(`reparto.modo.${reparto.tienda}-${reparto.numero}`, m)
  }

  const alCambiarTraspaso = useCallback(() => void recargar(), [recargar])
  const retirar = (l: LineaApp) => {
    if (!l.traspaso) return
    cancelarTraspaso(sesion.token, l.traspaso.id)
      .then(() => setAviso('Ofrecimiento retirado: el pedido sigue siendo tuyo.'))
      .catch((e: Error) => setAviso(e.message))
      .finally(() => void recargar())
  }

  const comprobados = ls.filter((l) => l.comprobado).length
  const hechos = ls.filter((l) => !['pendiente', 'viene_anterior'].includes(l.estado) || l.traspaso?.estado === 'aceptado').length

  return (
    <>
      <Cabecera sub={`${(datos?.reparto.ruta_nombre ?? reparto.ruta_nombre ?? '').toUpperCase()} · ${sesion.nombre.toUpperCase()}`} derecha={<BotonCabecera onClick={onVolver}>Rutas</BotonCabecera>} />

      {gps === null && (
        <Tarjeta>
          <div style={{ fontWeight: 700, color: V.verde, marginBottom: 6 }}>📍 Ubicación</div>
          <div style={{ fontSize: 14, color: V.gris, marginBottom: 10 }}>
            Mientras tengas la ruta abierta, la app enviará tu ubicación para la pantalla de pedidos de la oficina. Fuera de la ruta no se envía nada.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Boton onClick={() => (guardar('reparto.gps', 'si'), setGps('si'))} style={{ flex: 1 }}>
              De acuerdo
            </Boton>
            <Boton claro color={V.gris} onClick={() => (guardar('reparto.gps', 'no'), setGps('no'))} style={{ flex: 1 }}>
              Ahora no
            </Boton>
          </div>
        </Tarjeta>
      )}

      {fichaje === 'sin_vinculo' && (
        <Tarjeta style={{ borderTopColor: V.naranja, fontSize: 14, color: V.gris }}>
          Tu ficha de Fichaje no está enlazada con el reparto: pide en la oficina que lo hagan (Archivo → Fichaje → Personas). Mientras, ficha igualmente al empezar.
        </Tarjeta>
      )}

      {!puedeEntregar && (
        <Tarjeta style={{ borderTopColor: V.naranja }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: V.rojo }}>🕒 {fichaje === 'pausa' ? 'Estás en pausa' : fichaje === 'salida' ? 'Ya has fichado la salida' : 'Lo primero: fichar'}</div>
          <div style={{ fontSize: 14, color: V.gris, margin: '6px 0 10px' }}>
            {fichaje === 'comprobando'
                ? 'Comprobando tu fichaje…'
                : fichaje === 'sin_conexion'
                  ? 'Sin cobertura no puedo comprobar tu fichaje. En cuanto vuelva la señal lo miro otra vez.'
                  : fichaje === 'pausa'
                    ? 'Ficha el fin de pausa en Fichaje para seguir entregando.'
                    : fichaje === 'salida'
                      ? 'Tu jornada de hoy está cerrada en Fichaje. Si sigues trabajando, ficha la entrada otra vez.'
                      : 'Aún no has fichado la entrada hoy. Ficha en Fichaje y vuelve: hasta entonces puedes ver, comprobar y ordenar la ruta, pero no entregar.'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={FICHAJE_URL} style={{ ...enlace, display: 'block', background: V.verdeMed, color: '#fff' }}>
              🕒 Ir a Fichaje
            </a>
            <button type="button" onClick={() => void mirarFichaje()} style={{ ...enlace, background: '#fff' }}>
              Ya he fichado
            </button>
          </div>
        </Tarjeta>
      )}

      {esManana && (
        <Tarjeta style={{ borderTopColor: '#8a968a', background: '#f1f4f1' }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: '#4a564a' }}>
            📅 Reparto de mañana{fechaReparto ? ` · ${new Date(fechaReparto + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}` : ''}
          </div>
          <div style={{ fontSize: 14, color: V.gris, marginTop: 4 }}>Puedes mirar los pedidos y comprobar los albaranes. Entregar, cuando llegue su día.</div>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm('¿Seguro que este reparto lo haces HOY? Pulsa Aceptar solo si te lo han dicho en la oficina.')) return
              guardar(`reparto.adelantado.${reparto.tienda}-${reparto.numero}`, true)
              setAdelantado(true)
            }}
            style={{ background: 'none', border: 'none', color: V.gris, textDecoration: 'underline', fontSize: 13, padding: '8px 0 0' }}
          >
            Me han dicho que lo reparta hoy
          </button>
        </Tarjeta>
      )}

      <div style={{ display: 'flex', background: 'rgba(255,255,255,.9)', borderRadius: 16, padding: 4, gap: 4, opacity: esManana ? 0.6 : 1 }}>
        {(['comprobar', 'repartir'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => cambiarModo(m)}
            style={{
              flex: 1,
              borderRadius: 12,
              padding: '10px 6px',
              fontWeight: 700,
              border: 'none',
              background: modo === m ? V.verdeMed : 'transparent',
              color: modo === m ? '#fff' : V.verde,
            }}
          >
            {m === 'comprobar' ? `① Comprobar ${comprobados}/${ls.length}` : `② Repartir ${hechos}/${ls.length}`}
          </button>
        ))}
      </div>

      {(aviso || pendientesCola > 0) && (
        <div style={{ background: '#fff7e0', border: `1px solid ${V.naranja}`, borderRadius: 12, padding: '8px 12px', fontSize: 13 }}>
          {pendientesCola > 0 && <div>📶 {pendientesCola} cambio(s) sin enviar: se envían solos al volver la cobertura.</div>}
          {aviso && <div>{aviso}</div>}
        </div>
      )}
      {error && <div style={{ background: '#fdecea', borderRadius: 12, padding: '8px 12px', color: V.rojo }}>{error}</div>}

      {modo === 'comprobar' && (
        <div style={{ color: '#fff', fontSize: 13, textShadow: '0 1px 2px rgba(0,0,0,.6)', padding: '0 4px' }}>
          Antes de salir: marca cada pedido cuyo albarán llevas. Si alguno no es de tu ruta, tócalo para cambiarlo o avisa en la oficina.
        </div>
      )}

      {modo === 'repartir' && ls.length > 0 && hechos === ls.length && (
        <Tarjeta>
          <div style={{ fontWeight: 800, fontSize: 18, color: V.verde }}>✔ Ruta terminada</div>
          <div style={{ fontSize: 14, color: V.gris, margin: '6px 0 10px' }}>
            Pasa por Ofipapel a entregar los cobros y cargar la furgoneta para mañana. Tu jornada termina al guardar la furgoneta en la nave: ficha la salida allí, en Fichaje.
          </div>
          <a href={FICHAJE_URL} style={{ ...enlace, display: 'block' }}>
            🕒 Ir a Fichaje
          </a>
        </Tarjeta>
      )}

      <AvisosTraspaso sesion={sesion} onCambio={alCambiarTraspaso} />

      {!datos ? (
        <Tarjeta>Cargando…</Tarjeta>
      ) : (
        <Lista
          lineas={ls}
          modo={modo}
          abierta={abierta}
          onAbrir={(k) => setAbierta(abierta === k ? null : k)}
          onReordenar={reordenar}
          onComprobar={comprobar}
          onAccion={accion}
          onHoja={setHoja}
          puedeCambiarRuta
          onRetirar={retirar}
          bloqueado={!puedeEntregar}
        />
      )}

      {!!pasados.length && (
        <Tarjeta style={{ padding: 12, fontSize: 14, color: V.gris }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>➡ Pasados a compañeros ({pasados.length})</div>
          {pasados.map((l) => (
            <div key={clave(l)}>
              {l.cliente} · lo lleva {l.traspaso?.a}
            </div>
          ))}
        </Tarjeta>
      )}

      {hoja?.tipo === 'incidencia' && (
        <HojaOpciones
          titulo="Entregado con incidencia"
          opciones={INCIDENCIAS}
          onCerrar={() => setHoja(null)}
          onOk={(d, n) => accion(hoja.linea, 'incidencia', d, n)}
        />
      )}
      {hoja?.tipo === 'no_entregado' && (
        <HojaOpciones
          titulo={hoja.linea.intento1 ? `No entregado · 2.º intento (1.º a las ${hora(hoja.linea.intento1)})` : 'No entregado'}
          opciones={MOTIVOS}
          onCerrar={() => setHoja(null)}
          onOk={(d, n) => accion(hoja.linea, 'no_entregado', d, n)}
        />
      )}
      {hoja?.tipo === 'telefono' && (
        <HojaTelefono
          sesion={sesion}
          reparto={reparto}
          linea={hoja.linea}
          onCerrar={() => setHoja(null)}
          onHecho={(tel) => {
            cambiarLocal(clave(hoja.linea), { telefono: tel ?? hoja.linea.telefono_original ?? null, telefono_cambiado: !!tel })
            setHoja(null)
          }}
        />
      )}
      {hoja?.tipo === 'ruta' && (
        <HojaCambioRuta
          sesion={sesion}
          reparto={reparto}
          linea={hoja.linea}
          onCerrar={() => setHoja(null)}
          onHecho={() => {
            setHoja(null)
            setAviso('Ofrecido. Sigue siendo tuyo hasta que el otro repartidor lo acepte.')
            void recargar()
          }}
        />
      )}
    </>
  )
}

// ------------------------------------------------------------------ Pedidos que me ofrecen otros repartidores
function AvisosTraspaso({ sesion, onCambio }: { sesion: Sesion; onCambio?: () => void }) {
  const [recibidos, setRecibidos] = useState<TraspasoRecibido[]>([])
  const [respuestas, setRespuestas] = useState<TraspasoRespuesta[]>([])
  const [vistas, setVistas] = useState<number[]>(() => leer<number[]>('reparto.traspasos.vistos') ?? [])
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const antes = useRef<string>('')

  const mirar = useCallback(async () => {
    try {
      const r = await traspasos(sesion.token)
      setRecibidos(r.recibidos)
      setRespuestas(r.respuestas)
      // Si otro ha aceptado o rechazado algo mío, se refresca la lista de la ruta.
      const firma = r.respuestas.map((x) => `${x.id}${x.estado}`).join(',')
      if (antes.current !== firma) {
        if (antes.current !== '' || firma !== '') onCambio?.()
        antes.current = firma
      }
    } catch {
      /* sin conexión o sesión caducada: ya lo avisa la pantalla principal */
    }
  }, [sesion.token, onCambio])
  useEffect(() => {
    void mirar()
    const t = setInterval(() => void mirar(), 30_000)
    return () => clearInterval(t)
  }, [mirar])

  const responder = async (t: TraspasoRecibido, aceptar: boolean) => {
    setOcupado(true)
    setError(null)
    try {
      await responderTraspaso(sesion.token, t.id, aceptar)
      onCambio?.()
    } catch (e) {
      setError((e as ErrorApp).red ? 'Sin conexión: inténtalo con cobertura.' : (e as Error).message)
    } finally {
      setOcupado(false)
      void mirar()
    }
  }
  const visto = (id: number) => {
    const v = [...vistas, id].slice(-50)
    setVistas(v)
    guardar('reparto.traspasos.vistos', v)
  }
  const nuevas = respuestas.filter((r) => !vistas.includes(r.id))
  if (!recibidos.length && !nuevas.length && !error) return null
  return (
    <>
      {recibidos.map((t) => (
        <Tarjeta key={t.id} style={{ borderTopColor: '#1f6fb2' }}>
          <div style={{ fontWeight: 700, color: '#1f6fb2', fontSize: 16 }}>📦 {t.de} te pasa un pedido</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>{t.cliente}</div>
          <div style={{ fontSize: 14, color: V.gris }}>
            {[t.direccion, t.poblacion].filter(Boolean).join(' · ') || 'Sin dirección'}
            {t.ruta_origen ? ` · de la ruta ${t.ruta_origen}` : ''}
          </div>
          {t.motivo && <div style={{ fontSize: 14, marginTop: 2 }}>«{t.motivo}»</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Boton disabled={ocupado} claro color={V.rojo} onClick={() => responder(t, false)} style={{ flex: 1 }}>
              Rechazar
            </Boton>
            <Boton disabled={ocupado} onClick={() => responder(t, true)} style={{ flex: 2 }}>
              ✅ Aceptar
            </Boton>
          </div>
        </Tarjeta>
      ))}
      {nuevas.map((r) => (
        <Tarjeta key={r.id} style={{ borderTopColor: r.estado === 'aceptado' ? V.verdeMed : V.rojo, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, fontSize: 14 }}>
              <b style={{ color: r.estado === 'aceptado' ? V.verdeMed : V.rojo }}>
                {r.a} {r.estado === 'aceptado' ? 'ha ACEPTADO' : 'ha RECHAZADO'}
              </b>{' '}
              el pedido de {r.cliente}.{r.estado === 'rechazado' ? ' Sigue siendo tuyo.' : ''}
            </div>
            <Boton claro color={V.gris} onClick={() => visto(r.id)} style={{ fontSize: 13, padding: '8px 12px' }}>
              Vale
            </Boton>
          </div>
        </Tarjeta>
      ))}
      {error && <Tarjeta style={{ borderTopColor: V.rojo, color: V.rojo }}>{error}</Tarjeta>}
    </>
  )
}

// ------------------------------------------------------------------ Lista con arrastre
function Lista({
  lineas,
  modo,
  abierta,
  onAbrir,
  onReordenar,
  onComprobar,
  onAccion,
  onHoja,
  puedeCambiarRuta,
  onRetirar,
  bloqueado,
}: {
  lineas: LineaApp[]
  modo: 'comprobar' | 'repartir'
  abierta: string | null
  onAbrir: (k: string) => void
  onReordenar: (l: LineaApp[]) => void
  onComprobar: (l: LineaApp) => void
  onAccion: (l: LineaApp, t: 'entregado' | 'deshacer') => void
  onHoja: (h: Hoja) => void
  puedeCambiarRuta: boolean
  onRetirar: (l: LineaApp) => void
  bloqueado: boolean
}) {
  const [orden, setOrden] = useState<LineaApp[]>(lineas)
  const [arrastrando, setArrastrando] = useState<string | null>(null)
  const filas = useRef(new Map<string, HTMLDivElement>())
  useEffect(() => {
    if (!arrastrando) setOrden(lineas)
  }, [lineas, arrastrando])

  const k = (l: LineaApp) => `${l.vt}-${l.vn}`

  const empezar = (e: PEvent, l: LineaApp) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setArrastrando(k(l))
  }
  const mover = (e: PEvent) => {
    if (!arrastrando) return
    const y = e.clientY
    const actual = orden.findIndex((l) => k(l) === arrastrando)
    let destino = actual
    orden.forEach((l, i) => {
      const el = filas.current.get(k(l))
      if (!el || k(l) === arrastrando) return
      const r = el.getBoundingClientRect()
      const medio = r.top + r.height / 2
      if (i > actual && y > medio) destino = i
      if (i < actual && y < medio && destino >= actual) destino = i
    })
    if (destino !== actual) {
      const n = [...orden]
      const [x] = n.splice(actual, 1)
      n.splice(destino, 0, x)
      setOrden(n)
    }
  }
  const soltar = () => {
    if (!arrastrando) return
    setArrastrando(null)
    if (orden.some((l, i) => k(l) !== k(lineas[i]))) onReordenar(orden)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {orden.map((l) => {
        const kk = k(l)
        const marcado = !['pendiente', 'viene_anterior'].includes(l.estado)
        const color =
          l.estado === 'no_entregado' ? V.rojo : l.incidencia ? V.naranja : l.estado === 'entregado' || l.estado === 'liquidado' ? V.verdeCl : l.prioritario ? V.rojo : '#cfd8cf'
        const fondo = l.estado === 'no_entregado' ? '#fdecea' : l.incidencia ? '#fff4e0' : marcado ? '#eef8ee' : '#fff'
        const abiertaEsta = abierta === kk
        return (
          <div
            key={kk}
            ref={(el) => {
              if (el) filas.current.set(kk, el)
              else filas.current.delete(kk)
            }}
            style={{
              background: fondo,
              borderRadius: 14,
              borderLeft: `6px solid ${color}`,
              boxShadow: arrastrando === kk ? '0 10px 24px rgba(0,0,0,.35)' : '0 2px 6px rgba(0,0,0,.15)',
              transform: arrastrando === kk ? 'scale(1.02)' : undefined,
              opacity: marcado && modo === 'repartir' && !abiertaEsta ? 0.75 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', minHeight: 52 }}>
              <div
                onPointerDown={(e) => empezar(e, l)}
                onPointerMove={mover}
                onPointerUp={soltar}
                onPointerCancel={soltar}
                style={{ touchAction: 'none', padding: '0 10px', alignSelf: 'stretch', display: 'flex', alignItems: 'center', color: '#9aa79a', fontSize: 20, cursor: 'grab' }}
                aria-label="Arrastrar para ordenar"
              >
                ⋮⋮
              </div>
              {modo === 'comprobar' && (
                <button
                  type="button"
                  onClick={() => onComprobar(l)}
                  aria-label="Albarán comprobado"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: `2px solid ${l.comprobado ? V.verdeMed : '#b8c6b8'}`,
                    background: l.comprobado ? V.verdeMed : '#fff',
                    color: '#fff',
                    fontSize: 20,
                    fontWeight: 800,
                    marginRight: 8,
                    flexShrink: 0,
                  }}
                >
                  {l.comprobado ? '✓' : ''}
                </button>
              )}
              <button type="button" onClick={() => onAbrir(kk)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: '8px 10px 8px 0' }}>
                <div
                  style={{
                    fontWeight: l.prioritario ? 800 : 600,
                    color: l.prioritario ? V.rojo : V.texto,
                    fontSize: 15,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {l.prioritario && '↻ '}
                  {l.cliente}
                </div>
                {l.viene_de && <div style={{ fontSize: 12, color: '#1f6fb2', fontWeight: 700 }}>📦 Te lo pasa: {l.viene_de}</div>}
                {l.traspaso?.estado === 'propuesto' && <div style={{ fontSize: 12, color: V.naranja, fontWeight: 700 }}>⏳ Ofrecido a {l.traspaso.a}: esperando respuesta</div>}
                {l.traspaso?.estado === 'aceptado' && <div style={{ fontSize: 12, color: V.gris, fontWeight: 700 }}>➡ Lo lleva {l.traspaso.a}</div>}
                {marcado && (
                  <div style={{ fontSize: 12, color }}>
                    {l.estado === 'no_entregado'
                      ? `No entregado${l.intento1 ? ' · ' + hora(l.intento1) : ''}${l.intento2 ? ' y ' + hora(l.intento2) : ''}`
                      : `${l.incidencia ? 'Con incidencia' : 'Entregado'}${l.entregado_en ? ' · ' + hora(l.entregado_en) : ''}`}
                  </div>
                )}
              </button>
              {l.bultos != null && (
                <span style={{ background: V.pale, color: V.verde, borderRadius: 10, padding: '4px 8px', fontWeight: 700, fontSize: 13, marginRight: 10, flexShrink: 0 }}>
                  📦 {l.bultos}
                </span>
              )}
            </div>

            {abiertaEsta && (
              <div style={{ padding: '0 12px 12px 12px', borderTop: '1px solid #e3ebe3' }}>
                <div style={{ fontSize: 14, marginTop: 8 }}>
                  {[l.direccion, [l.cp, l.poblacion].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || 'Sin dirección'}
                </div>
                {l.contacto && <div style={{ fontSize: 13, color: V.gris }}>Contacto: {l.contacto}</div>}
                <div style={{ fontSize: 13, color: V.gris, marginTop: 2 }}>
                  {l.factura ? `Factura ${l.factura} · ` : `Albarán ${l.vt}/${l.vn} · `}
                  {euros(l.total)}
                  {l.contado === false ? (
                    // GeminisWin, venta a crédito: no se cobra en la entrega, solo se firma el albarán.
                    ' · crédito: solo firmar'
                  ) : l.total != null && l.pagado != null && l.total - l.pagado > 0.005 ? (
                    <b style={{ color: l.contado ? V.rojo : undefined }}>
                      {' · '}
                      {l.contado ? 'CONTADO: ' : ''}por cobrar {euros(l.total - l.pagado)}
                    </b>
                  ) : l.total ? (
                    ' · pagado'
                  ) : (
                    ''
                  )}
                </div>
                {l.antes && <div style={{ fontSize: 13, color: V.rojo, marginTop: 4 }}>{l.antes}</div>}
                <div style={{ fontSize: 13, color: V.gris, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>
                    📞 {l.telefono || 'Sin teléfono'}
                    {l.telefono_recordado ? ' (guardado de otra entrega)' : l.telefono_cambiado ? ' (corregido)' : ''}
                  </span>
                  <button type="button" onClick={() => onHoja({ tipo: 'telefono', linea: l })} style={{ background: 'none', border: 'none', color: V.verdeMed, textDecoration: 'underline', fontSize: 13, padding: 4 }}>
                    {l.telefono ? 'No es este: poner otro' : 'Poner un teléfono'}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  {l.telefono && (
                    <a href={`tel:${l.telefono.replace(/\s/g, '')}`} style={enlace}>
                      📞 Llamar
                    </a>
                  )}
                  {numeroWhatsApp(l.telefono) && (
                    <a
                      href={`https://wa.me/${numeroWhatsApp(l.telefono)}?text=${encodeURIComponent('Hola, soy el repartidor de Ofipapel. ')}`}
                      target="_blank"
                      rel="noreferrer"
                      style={enlace}
                    >
                      💬 WhatsApp
                    </a>
                  )}
                  {(l.direccion || l.poblacion) && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([l.direccion, l.cp, l.poblacion, 'Tenerife'].filter(Boolean).join(', '))}`}
                      target="_blank"
                      rel="noreferrer"
                      style={enlace}
                    >
                      🗺️ Mapa
                    </a>
                  )}
                  {puedeCambiarRuta && !marcado && !l.traspaso && !l.viene_de && (
                    <button type="button" onClick={() => onHoja({ tipo: 'ruta', linea: l })} style={{ ...enlace, background: '#fff' }}>
                      🔀 Pasar a otro
                    </button>
                  )}
                  {l.traspaso?.estado === 'propuesto' && (
                    <button type="button" onClick={() => onRetirar(l)} style={{ ...enlace, background: '#fff', borderColor: V.naranja, color: V.naranja }}>
                      ✖ Retirar oferta
                    </button>
                  )}
                </div>
                {l.traspaso?.estado === 'aceptado' && (
                  <div style={{ marginTop: 10, background: '#f1f4f1', borderRadius: 10, padding: '8px 10px', fontSize: 14, color: V.gris }}>
                    Este pedido lo lleva ahora <b>{l.traspaso.a}</b>: lo marcará él.
                  </div>
                )}
                {modo === 'repartir' &&
                  l.traspaso?.estado !== 'aceptado' &&
                  (marcado ? (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      {l.estado === 'no_entregado' && !l.intento2 && (
                        <Boton color={V.rojo} onClick={() => onHoja({ tipo: 'no_entregado', linea: l })} style={{ flex: 1, fontSize: 14 }}>
                          2.º intento
                        </Boton>
                      )}
                      {l.estado === 'no_entregado' && (
                        <Boton onClick={() => onAccion(l, 'entregado')} style={{ flex: 1, fontSize: 14 }}>
                          ✅ Ya entregado
                        </Boton>
                      )}
                      <Boton claro color={V.gris} onClick={() => onAccion(l, 'deshacer')} style={{ flex: 1, fontSize: 14 }}>
                        Deshacer
                      </Boton>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10, opacity: bloqueado ? 0.45 : 1 }}>
                      <Boton onClick={() => onAccion(l, 'entregado')} style={{ fontSize: 14, padding: '12px 4px' }}>
                        ✅<br />
                        Entregado
                      </Boton>
                      <Boton color={V.naranja} onClick={() => onHoja({ tipo: 'incidencia', linea: l })} style={{ fontSize: 14, padding: '12px 4px' }}>
                        ⚠️<br />
                        Incidencia
                      </Boton>
                      <Boton color={V.rojo} onClick={() => onHoja({ tipo: 'no_entregado', linea: l })} style={{ fontSize: 14, padding: '12px 4px' }}>
                        ❌<br />
                        No entregado
                      </Boton>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )
      })}
      {!orden.length && <Tarjeta>Esta ruta no tiene pedidos.</Tarjeta>}
    </div>
  )
}

const enlace: CSSProperties = {
  flex: 1,
  textAlign: 'center',
  border: `2px solid ${V.verdeMed}`,
  color: V.verde,
  borderRadius: 12,
  padding: '8px 4px',
  fontWeight: 600,
  fontSize: 14,
  textDecoration: 'none',
}

// ------------------------------------------------------------------ Hojas (abajo)
function Hoja({ titulo, children, onCerrar }: { titulo: string; children: ReactNode; onCerrar: () => void }) {
  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', width: '100%', maxWidth: 560, borderRadius: '22px 22px 0 0', borderTop: `5px solid ${V.lima}`, padding: 16, paddingBottom: 28 }}
      >
        <div style={{ fontWeight: 700, fontSize: 18, color: V.verde, marginBottom: 12 }}>{titulo}</div>
        {children}
      </div>
    </div>
  )
}

function HojaOpciones({ titulo, opciones, onCerrar, onOk }: { titulo: string; opciones: [string, string][]; onCerrar: () => void; onOk: (detalle: string, nota?: string) => void }) {
  const [otro, setOtro] = useState(false)
  const [nota, setNota] = useState('')
  return (
    <Hoja titulo={titulo} onCerrar={onCerrar}>
      {!otro ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {opciones.map(([v, t]) => (
            <Boton key={v} claro onClick={() => (v === 'otro' ? setOtro(true) : onOk(v))} style={{ textAlign: 'left' }}>
              {t}
            </Boton>
          ))}
          <Boton claro color={V.gris} onClick={onCerrar}>
            Cancelar
          </Boton>
        </div>
      ) : (
        <>
          <textarea
            autoFocus
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Explica qué ha pasado"
            rows={3}
            style={{ width: '100%', border: '2px solid #cfe0cf', borderRadius: 12, padding: 10, fontSize: 16 }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Boton claro color={V.gris} onClick={() => setOtro(false)} style={{ flex: 1 }}>
              Atrás
            </Boton>
            <Boton disabled={!nota.trim()} onClick={() => onOk('otro', nota.trim())} style={{ flex: 2 }}>
              Guardar
            </Boton>
          </div>
        </>
      )}
    </Hoja>
  )
}

function HojaTelefono({ sesion, reparto, linea, onCerrar, onHecho }: { sesion: Sesion; reparto: RepartoApp; linea: LineaApp; onCerrar: () => void; onHecho: (tel: string | null) => void }) {
  const [tel, setTel] = useState(linea.telefono_cambiado ? (linea.telefono ?? '') : '')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const guardarTel = async (valor: string) => {
    setEnviando(true)
    setError(null)
    try {
      onHecho(await cambiarTelefono(sesion.token, linea.rt ?? reparto.tienda, linea.rn ?? reparto.numero, linea.vt, linea.vn, valor))
    } catch (e) {
      setError((e as ErrorApp).red ? 'Sin conexión: hace falta cobertura para guardarlo.' : (e as Error).message)
    } finally {
      setEnviando(false)
    }
  }
  return (
    <Hoja titulo={`Teléfono de ${linea.cliente}`} onCerrar={onCerrar}>
      <div style={{ fontSize: 14, color: V.gris, marginBottom: 8 }}>
        Escribe el número bueno. Se recordará para las próximas entregas a este cliente, y la oficina lo verá para corregir la ficha.
        {linea.telefono_original ? ` El que venía: ${linea.telefono_original}.` : ''}
      </div>
      <input
        type="tel"
        inputMode="tel"
        autoFocus
        value={tel}
        onChange={(e) => setTel(e.target.value.replace(/[^0-9+ ]/g, '').slice(0, 18))}
        placeholder="Por ejemplo 600 123 456"
        style={{ width: '100%', border: '2px solid #cfe0cf', borderRadius: 12, padding: 12, fontSize: 20, marginBottom: 10 }}
      />
      {error && <div style={{ color: V.rojo, marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <Boton claro color={V.gris} onClick={onCerrar} style={{ flex: 1 }}>
          Cancelar
        </Boton>
        <Boton disabled={enviando || tel.replace(/\D/g, '').length < 9} onClick={() => guardarTel(tel)} style={{ flex: 2 }}>
          Guardar
        </Boton>
      </div>
      {linea.telefono_cambiado && (
        <div style={{ textAlign: 'center', marginTop: 10 }}>
          <button type="button" disabled={enviando} onClick={() => guardarTel('')} style={{ background: 'none', border: 'none', color: V.rojo, textDecoration: 'underline', fontSize: 14, padding: 6 }}>
            Quitar el mío y volver al que venía
          </button>
        </div>
      )}
    </Hoja>
  )
}

function HojaCambioRuta({ sesion, reparto, linea, onCerrar, onHecho }: { sesion: Sesion; reparto: RepartoApp; linea: LineaApp; onCerrar: () => void; onHecho: () => void }) {
  const [rutas, setRutas] = useState<RepartoApp[] | null>(null)
  const [destino, setDestino] = useState<RepartoApp | null>(null)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    rutasDestino(sesion.token)
      .then((r) => setRutas(r.filter((x) => !(x.tienda === reparto.tienda && x.numero === reparto.numero))))
      .catch((e: Error) => setError(e.message))
  }, [sesion.token, reparto.tienda, reparto.numero])
  const hacer = async () => {
    if (!destino) return
    try {
      await proponerTraspaso(sesion.token, reparto.tienda, reparto.numero, linea.vt, linea.vn, destino.tienda, destino.numero, motivo.trim())
      onHecho()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <Hoja titulo={`Pasar a otro repartidor: ${linea.cliente}`} onCerrar={onCerrar}>
      {!rutas && !error && <div style={{ color: V.gris }}>Cargando…</div>}
      {!!rutas?.length && <div style={{ fontWeight: 700, color: V.verde, marginBottom: 6 }}>¿A qué ruta se lo ofreces? Toca una. El otro repartidor tendrá que aceptarlo:</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '35vh', overflow: 'auto' }}>
        {rutas?.map((r) => {
          // Puede haber dos repartos abiertos de la misma ruta: se distinguen por la fecha y el número.
          const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Canary' })
          const dia = r.fecha === hoy ? 'hoy' : `del ${r.fecha.slice(8, 10)}/${r.fecha.slice(5, 7)}`
          return (
            <Boton key={`${r.tienda}-${r.numero}`} claro={destino !== r} onClick={() => setDestino(r)} style={{ textAlign: 'left', fontSize: 15 }}>
              <div>
                {destino === r ? '✔ ' : ''}
                {r.ruta ? `RUTA ${/^\d+$/.test(r.ruta) ? Number(r.ruta) : r.ruta} · ` : ''}
                {r.ruta_nombre} {r.repartidor ? `· ${r.repartidor}` : '· sin repartidor'}
              </div>
              <div style={{ fontSize: 13, fontWeight: 400, opacity: 0.85 }}>
                Reparto nº {r.numero} · {dia} · {r.pedidos ?? 0} pedido{r.pedidos === 1 ? '' : 's'}
              </div>
            </Boton>
          )
        })}
        {rutas && !rutas.length && <div style={{ color: V.gris }}>No hay otras rutas abiertas hoy con repartidor.</div>}
      </div>
      <textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="¿Por qué? (opcional)"
        rows={2}
        style={{ width: '100%', border: '2px solid #cfe0cf', borderRadius: 12, padding: 10, fontSize: 16, marginTop: 10 }}
      />
      {error && <div style={{ color: V.rojo, marginTop: 6 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Boton claro color={V.gris} onClick={onCerrar} style={{ flex: 1 }}>
          Cancelar
        </Boton>
        <Boton disabled={!destino} onClick={hacer} style={{ flex: 2 }}>
          Ofrecer
        </Boton>
      </div>
    </Hoja>
  )
}
