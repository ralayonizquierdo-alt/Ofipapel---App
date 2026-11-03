import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as PEvent, type ReactNode } from 'react'
import {
  cambiarRuta,
  cola,
  encolar,
  enviarCola,
  entrar,
  ErrorApp,
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
const euros = (n: number | null | undefined) => (n == null ? '' : n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €')
const base = import.meta.env.BASE_URL
// Fichaje (fichaje.html, Firebase): el registro horario legal lo lleva Fichaje y lo gestiona gerencia.
const FICHAJE_URL = 'https://ofipapel.netlify.app/fichaje.html'

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
      {derecha}
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
        ) : !reparto ? (
          <ElegirRuta sesion={sesion} onElegir={elegir} onSalir={salir} onCaducada={() => setSesion(null)} />
        ) : (
          <Ruta sesion={sesion} reparto={reparto} onVolver={() => elegir(null)} onCaducada={() => setSesion(null)} />
        )}
      </div>
    </div>
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

  const pulsar = async (d: string) => {
    if (cargando) return
    const nuevo = (pin + d).slice(0, 4)
    setPin(nuevo)
    setError(null)
    if (nuevo.length === 4 && quien) {
      setCargando(true)
      try {
        onEntrar(await entrar(quien.codigo, nuevo))
      } catch (e) {
        setError((e as Error).message)
        setPin('')
      } finally {
        setCargando(false)
      }
    }
  }

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
          <div style={{ textAlign: 'center', color: V.gris, marginBottom: 10 }}>Pon tu PIN</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 14 }}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} style={{ width: 18, height: 18, borderRadius: 9, background: i < pin.length ? V.verdeMed : '#dfe8df' }} />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <Boton key={d} claro onClick={() => pulsar(d)} style={{ fontSize: 26, padding: '14px 0' }}>
                {d}
              </Boton>
            ))}
            <Boton claro color={V.gris} onClick={() => (setQuien(null), setPin(''), setError(null))} style={{ fontSize: 14 }}>
              No soy yo
            </Boton>
            <Boton claro onClick={() => pulsar('0')} style={{ fontSize: 26, padding: '14px 0' }}>
              0
            </Boton>
            <Boton claro color={V.gris} onClick={() => setPin(pin.slice(0, -1))} style={{ fontSize: 22 }}>
              ⌫
            </Boton>
          </div>
          {cargando && <div style={{ textAlign: 'center', color: V.gris, marginTop: 10 }}>Entrando…</div>}
          {error && <div style={{ color: V.rojo, textAlign: 'center', marginTop: 10, fontWeight: 600 }}>{error}</div>}
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
      <Tarjeta>
        <div style={{ fontWeight: 700, fontSize: 18, color: V.verde, marginBottom: 10 }}>Elige tu ruta de hoy</div>
        {!lista && !error && <div style={{ color: V.gris }}>Cargando…</div>}
        {lista && !lista.length && <div style={{ color: V.gris }}>No hay rutas abiertas para ti. Si esperabas una, avisa en la oficina.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lista?.map((r) => (
            <button
              key={`${r.tienda}-${r.numero}`}
              type="button"
              onClick={() => onElegir(r)}
              style={{ textAlign: 'left', background: r.mio ? V.pale : '#fff', border: `2px solid ${r.mio ? V.verdeMed : '#cfe0cf'}`, borderRadius: 16, padding: 14 }}
            >
              <div style={{ fontWeight: 700, fontSize: 18, color: V.verde }}>🚚 {r.ruta_nombre ?? 'Sin ruta'}</div>
              <div style={{ color: V.gris, fontSize: 14 }}>
                {r.manana ? 'Mañana · ' : ''}
                {r.pedidos} pedidos · {r.pendientes} por entregar{r.mio ? ' · tuya' : ' · sin repartidor'}
              </div>
            </button>
          ))}
        </div>
        {error && <div style={{ color: V.rojo, marginTop: 10 }}>{error}</div>}
      </Tarjeta>
    </>
  )
}

// ------------------------------------------------------------------ Ruta
type Hoja = { tipo: 'incidencia' | 'no_entregado' | 'ruta'; linea: LineaApp } | null

function Ruta({ sesion, reparto, onVolver, onCaducada }: { sesion: Sesion; reparto: RepartoApp; onVolver: () => void; onCaducada: () => void }) {
  const [datos, setDatos] = useState(() => lineasEnCache(reparto.tienda, reparto.numero))
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [hoja, setHoja] = useState<Hoja>(null)
  const [pendientesCola, setPendientesCola] = useState(() => cola().length)
  const [modo, setModo] = useState<'comprobar' | 'repartir'>(() => (leer<string>(`reparto.modo.${reparto.tienda}-${reparto.numero}`) as 'comprobar' | 'repartir') ?? 'comprobar')
  const [gps, setGps] = useState<'si' | 'no' | null>(() => leer<'si' | 'no'>('reparto.gps'))
  // Fichaje: sin la entrada fichada hoy no se puede entregar (sí ver, comprobar, ordenar y cambiar de ruta).
  const persona = sesion.fichaje_persona
  const [fichaje, setFichaje] = useState<EstadoFichaje | 'sin_vinculo' | 'comprobando' | 'sin_conexion'>(() =>
    !persona ? 'sin_vinculo' : (estadoGuardado(persona) ?? 'comprobando'),
  )
  const mirarFichaje = useCallback(async () => {
    if (!persona) return setFichaje('sin_vinculo')
    try {
      setFichaje(await estadoFichaje(persona))
    } catch {
      setFichaje(estadoGuardado(persona) ?? 'sin_conexion')
    }
  }, [persona])
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
  const puedeEntregar = fichaje === 'trabajando'

  const ls = useMemo(() => datos?.lineas ?? [], [datos])
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
      p_tienda: reparto.tienda,
      p_numero: reparto.numero,
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
    encolar('fn_app_rep_comprobar', { p_tienda: reparto.tienda, p_numero: reparto.numero, p_vt: l.vt, p_vn: l.vn, p_ok: !l.comprobado })
    setPendientesCola(cola().length)
    void enviar()
  }

  const reordenar = (nuevas: LineaApp[]) => {
    if (!datos) return
    const nuevo = { ...datos, lineas: nuevas }
    setDatos(nuevo)
    guardarCache(reparto.tienda, reparto.numero, nuevo)
    encolar('fn_app_rep_orden', { p_tienda: reparto.tienda, p_numero: reparto.numero, p_orden: nuevas.map((l) => ({ vt: l.vt, vn: l.vn })) })
    setPendientesCola(cola().length)
    void enviar()
  }

  const cambiarModo = (m: 'comprobar' | 'repartir') => {
    setModo(m)
    guardar(`reparto.modo.${reparto.tienda}-${reparto.numero}`, m)
  }

  const comprobados = ls.filter((l) => l.comprobado).length
  const hechos = ls.filter((l) => !['pendiente', 'viene_anterior'].includes(l.estado)).length

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

      {!puedeEntregar && (
        <Tarjeta style={{ borderTopColor: V.naranja }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: V.rojo }}>🕒 {fichaje === 'pausa' ? 'Estás en pausa' : fichaje === 'salida' ? 'Ya has fichado la salida' : 'Lo primero: fichar'}</div>
          <div style={{ fontSize: 14, color: V.gris, margin: '6px 0 10px' }}>
            {fichaje === 'sin_vinculo'
              ? 'Para entregar, entra en Fichaje, ficha la entrada y pulsa «🚚 Mi reparto». Mientras, puedes ver, comprobar y ordenar tu ruta.'
              : fichaje === 'comprobando'
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
            {fichaje !== 'sin_vinculo' && (
              <button type="button" onClick={() => void mirarFichaje()} style={{ ...enlace, background: '#fff' }}>
                Ya he fichado
              </button>
            )}
          </div>
        </Tarjeta>
      )}

      <div style={{ display: 'flex', background: 'rgba(255,255,255,.9)', borderRadius: 16, padding: 4, gap: 4 }}>
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
          puedeCambiarRuta={sesion.puede_cambiar_ruta}
          bloqueado={!puedeEntregar}
        />
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
      {hoja?.tipo === 'ruta' && (
        <HojaCambioRuta
          sesion={sesion}
          reparto={reparto}
          linea={hoja.linea}
          onCerrar={() => setHoja(null)}
          onHecho={() => {
            setHoja(null)
            setAviso('Pedido cambiado de ruta.')
            void recargar()
          }}
        />
      )}
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
                  {l.total != null && l.pagado != null && l.total - l.pagado > 0.005 ? ` · por cobrar ${euros(l.total - l.pagado)}` : l.total ? ' · pagado' : ''}
                </div>
                {l.antes && <div style={{ fontSize: 13, color: V.rojo, marginTop: 4 }}>{l.antes}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {l.telefono && (
                    <a href={`tel:${l.telefono.replace(/\s/g, '')}`} style={enlace}>
                      📞 Llamar
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
                  {puedeCambiarRuta && (
                    <button type="button" onClick={() => onHoja({ tipo: 'ruta', linea: l })} style={{ ...enlace, background: '#fff' }}>
                      🔀 Otra ruta
                    </button>
                  )}
                </div>
                {modo === 'repartir' &&
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
      await cambiarRuta(sesion.token, reparto.tienda, reparto.numero, linea.vt, linea.vn, destino.tienda, destino.numero, motivo.trim())
      onHecho()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <Hoja titulo={`Cambiar de ruta: ${linea.cliente}`} onCerrar={onCerrar}>
      {!rutas && !error && <div style={{ color: V.gris }}>Cargando…</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '35vh', overflow: 'auto' }}>
        {rutas?.map((r) => (
          <Boton key={`${r.tienda}-${r.numero}`} claro={destino !== r} onClick={() => setDestino(r)} style={{ textAlign: 'left', fontSize: 15 }}>
            {r.ruta_nombre} {r.repartidor ? `· ${r.repartidor}` : ''}
          </Boton>
        ))}
        {rutas && !rutas.length && <div style={{ color: V.gris }}>No hay otras rutas abiertas hoy.</div>}
      </div>
      <textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="¿Por qué se cambia? (obligatorio)"
        rows={2}
        style={{ width: '100%', border: '2px solid #cfe0cf', borderRadius: 12, padding: 10, fontSize: 16, marginTop: 10 }}
      />
      {error && <div style={{ color: V.rojo, marginTop: 6 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Boton claro color={V.gris} onClick={onCerrar} style={{ flex: 1 }}>
          Cancelar
        </Boton>
        <Boton disabled={!destino || !motivo.trim()} onClick={hacer} style={{ flex: 2 }}>
          Cambiar
        </Boton>
      </div>
    </Hoja>
  )
}
