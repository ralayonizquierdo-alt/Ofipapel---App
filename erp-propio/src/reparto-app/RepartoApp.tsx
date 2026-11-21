import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as PEvent, type ReactNode } from 'react'
import {
  cambiarTelefono,
  cancelarTraspaso,
  proponerTraspaso,
  responderTraspaso,
  soltarRuta,
  traspasos,
  type TraspasoRecibido,
  type TraspasoRespuesta,
  cola,
  encolar,
  enviarCola,
  entrar,
  entrarDesdeFichaje,
  fichajeHoy,
  fichar,
  type FichajeHoy,
  type TipoFichaje,
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
  type PorCobrar,
  porCobrar,
  validarIncidencia,
  type Liquidacion,
  type PorApuntar,
  liquidar,
  liquidaciones,
  anularLiquidacion,
  type RepartoApp,
  type Sesion,
} from './api'
import { GRUPO_ABONOS, GRUPO_NULOS, gruposPorCobrar, listaPorCobrar, sumaPorCobrar, tipoPago } from './porCobrar'
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
  ['sin_tiempo', 'No me dio tiempo'],
  ['otro', 'Otro'],
]

/** Entregado pero sin cobrar (Rober, 17/11/2026): por qué. La factura sale del reparto y pasa a administración. */
const NO_COBRO: [string, string][] = [
  ['paga_banco', 'Dice que paga por transferencia'],
  ['sin_dinero', 'No tenía el dinero'],
  ['no_responsable', 'No estaba quien paga'],
  ['importe', 'No está de acuerdo con el importe'],
  ['ya_pagado', 'Dice que ya la pagó'],
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
/** «RUTA 1 · LOS CRISTIANOS»: el número de la ruta delante del nombre de la zona. */
const nombreRuta = (ruta: string | null | undefined, nombre: string | null | undefined) =>
  [ruta ? `RUTA ${/^\d+$/.test(ruta) ? Number(ruta) : ruta}` : null, nombre || (ruta ? null : 'Sin ruta')].filter(Boolean).join(' · ')
// «always»: punto de millar también en 1.250,00 (en español, por defecto, solo desde 10.000).
const euros = (n: number | null | undefined) =>
  n == null ? '' : n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' as unknown as boolean }) + ' €'
const base = import.meta.env.BASE_URL

/**
 * Qué hay que hacer con el albarán, a la vista en la lista sin abrir el pedido (Rober, 17/11/2026):
 * crédito → revisar y firmar; contado ya pagado → solo revisar; contado sin pagar → revisar y cobrar.
 * Cuando el repartidor ya ha pagado la factura en administración y GeminisWin la da por liquidada, no
 * queda nada que hacer: pone «Liquidada» (Rober, 17/11/2026).
 * Manda la forma de pago, no solo la marca de contado (Rober y David, 17/11/2026): una venta puede ir
 * como contado en GeminisWin y pagarse por el banco.
 */
const AZUL = '#1f6fb2'
function queHacer(l: { total: number | null; pagado: number | null; contado?: boolean | null; estado?: string; forma_pago?: string | null; no_cobro?: string | null; medio?: 'efectivo' | 'tarjeta' | null }): [string, string] | null {
  if (l.estado === 'liquidado') return ['Liquidada', AZUL]
  const tipo = tipoPago(l.forma_pago)
  if (tipo === 'pagada') return ['Solo revisar · Pagado', V.verdeMed]
  if (l.contado === false || tipo === 'banco') return ['Revisar y firmar', AZUL]
  if (l.total == null) return null
  if (l.pagado != null && l.total - l.pagado > 0.005) {
    // Ya entregada: deja de ser una orden («cobrar») y pasa a decir cómo quedó.
    if (l.estado === 'entregado') return l.no_cobro ? ['Sin cobrar', V.naranja] : [l.medio === 'tarjeta' ? 'Cobrado · 💳 tarjeta' : l.medio === 'efectivo' ? 'Cobrado · efectivo' : 'Cobrado', V.verdeMed]
    return ['Revisar y cobrar', V.rojo]
  }
  return ['Solo revisar · Pagado', V.verdeMed]
}
/** ¿Es de cobrar en mano? Contado o contra reembolso con importe pendiente, esté o no entregada todavía. */
const hayQueCobrar = (l: Parameters<typeof queHacer>[0]) =>
  l.estado !== 'liquidado' && l.contado !== false && tipoPago(l.forma_pago) === 'mano' && l.total != null && l.pagado != null && l.total - l.pagado > 0.005
/**
 * Importe a la derecha del nombre, en su misma línea, sin ensanchar la casilla. La indicación va justo
 * debajo, en pequeño: en un móvil de 360 px, con las tres cosas en una línea el nombre no se leía.
 */
function Importe({ l }: { l: { total: number | null } }) {
  if (l.total == null) return null
  return <span style={{ flexShrink: 0, fontWeight: 700, fontSize: 14, color: V.texto, whiteSpace: 'nowrap' }}>{euros(l.total)}</span>
}
/**
 * La indicación y, a su lado, la forma de pago tal como viene de GeminisWin (Rober y David, 17/11/2026):
 * una factura puede ir marcada como contado y pagarse por remesa o transferencia, y sin ese dato no se
 * entiende por qué el repartidor no la cobró.
 */
function QueHacer({ l }: { l: Parameters<typeof queHacer>[0] }) {
  const q = queHacer(l)
  const forma = l.forma_pago?.trim()
  if (!q && !forma) return null
  return (
    <div style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {q && <b style={{ color: q[1] }}>{q[0]}</b>}
      {forma && <span style={{ color: V.gris }}>{q ? ' · ' : ''}{forma}</span>}
    </div>
  )
}
// Fichaje (/fichaje, en el ERP): el registro horario legal; lo gestiona gerencia en Archivo → Fichaje.

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
    // Icono propio de Reparto (aro turquesa con furgoneta) en la pestaña y al guardarla en el móvil;
    // al salir de la app de reparto vuelve el del ERP.
    const iconos = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]'))
    const iconosAntes = iconos.map((l) => l.getAttribute('href'))
    iconos.forEach((l) => {
      const t = l.getAttribute('sizes')
      l.setAttribute('href', `${base}reparto-icono/${l.rel === 'apple-touch-icon' ? 'apple-touch-icon.png' : t === '16x16' ? 'favicon-16x16.png' : t === '32x32' ? 'favicon-32x32.png' : 'icon-192.png'}`)
    })
    const titulo = document.title
    document.title = 'Reparto · Ofipapel'
    return () => {
      iconos.forEach((l, i) => iconosAntes[i] && l.setAttribute('href', iconosAntes[i]))
      if (man && antes) man.setAttribute('href', antes)
      if (meta && color) meta.content = color
      document.title = titulo
    }
  }, [])
}

// ------------------------------------------------------------------ Piezas de estilo
// ------------------------------------------------------------------ Instalar en el móvil
// Android (Chrome) avisa con «beforeinstallprompt» de que se puede instalar; se guarda para lanzarlo desde el botón.
// El iPhone no tiene nada parecido: ahí solo se pueden dar las instrucciones de «Añadir a pantalla de inicio».
type AvisoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let avisoInstalar: AvisoInstalar | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    avisoInstalar = e as AvisoInstalar
  })
}
const yaInstalada = () =>
  typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
const esIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

function Cabecera({ sub, derecha, oficina = false }: { sub?: string; derecha?: ReactNode; oficina?: boolean }) {
  const [ayuda, setAyuda] = useState(false)
  const [instalar, setInstalar] = useState(false)
  const [instalada, setInstalada] = useState(yaInstalada)
  const pulsarInstalar = async () => {
    if (avisoInstalar) {
      try {
        await avisoInstalar.prompt()
        const r = await avisoInstalar.userChoice
        if (r.outcome === 'accepted') setInstalada(true)
        avisoInstalar = null
        return
      } catch {
        /* si falla, se enseñan las instrucciones */
      }
    }
    setInstalar(true)
  }
  const apartados = oficina ? OPERATIVA_OFICINA : OPERATIVA_REPARTIDOR
  return (
    <div
      style={{
        background: 'linear-gradient(135deg,#0d3d0d 0%,#1A5C1A 45%,#237523 75%,#3a8f2a 100%)',
        borderRadius: 22,
        padding: '14px 12px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        rowGap: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,.25)',
      }}
    >
      {/* Logo y título juntos. Si con los botones no caben (móvil estrecho o letra grande), los botones bajan a una
          segunda fila en vez de cortar «Reparto». El subtítulo no cuenta para eso (width 0 + minWidth 100 %): se corta él. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 auto', minWidth: 0 }}>
        <img src={`${base}marca/logo-ofipapel.png`} alt="Ofipapel" style={{ height: 'auto', width: 'clamp(56px, 18vw, 112px)', flexShrink: 0 }} />
        <div style={{ flex: '1 1 auto', minWidth: 0, color: '#fff' }}>
          <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 21, lineHeight: 1.1, whiteSpace: 'nowrap' }}>Reparto</div>
          <div style={{ width: 0, minWidth: '100%', fontSize: 11, letterSpacing: 1.2, fontWeight: 600, opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {sub ?? 'OFIPAPEL'}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto', marginLeft: 'auto' }}>
      {!instalada && (
        <button
          type="button"
          onClick={() => void pulsarInstalar()}
          aria-label="Instalar la app en el móvil"
          title="Instalar en el móvil"
          style={{ width: 32, height: 32, borderRadius: 16, border: '1.5px solid rgba(255,255,255,.55)', background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 15, flexShrink: 0, padding: 0 }}
        >
          📲
        </button>
      )}
      {instalar && (
        <div onClick={() => setInstalar(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', width: '100%', maxWidth: 560, borderRadius: '22px 22px 0 0', borderTop: `5px solid ${V.lima}`, padding: 16, paddingBottom: 28, color: V.texto }}
          >
            <div style={{ fontWeight: 700, fontSize: 19, color: V.verde, marginBottom: 10 }}>📲 Poner Reparto en tu móvil</div>
            {(esIphone()
              ? ['Abre esta página con Safari (no con Chrome).', 'Pulsa el botón Compartir: el cuadrado con una flecha hacia arriba.', 'Baja y pulsa «Añadir a pantalla de inicio».', 'Pulsa «Añadir». Te queda el icono de Reparto como una app más.']
              : ['Pulsa los tres puntos ⋮ de arriba a la derecha del navegador.', 'Pulsa «Instalar aplicación» o «Añadir a pantalla de inicio».', 'Pulsa «Instalar». Te queda el icono de Reparto como una app más.']
            ).map((t, i) => (
              <div key={t} style={{ display: 'flex', gap: 10, fontSize: 16, lineHeight: 1.4, marginBottom: 8 }}>
                <span style={{ width: 26, height: 26, borderRadius: 13, background: V.verdeMed, color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                <span>{t}</span>
              </div>
            ))}
            <Boton onClick={() => setInstalar(false)} style={{ width: '100%', marginTop: 8 }}>
              Entendido
            </Boton>
          </div>
        </div>
      )}
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
      </div>
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
        ) : sesion.supervisor || sesion.solo_caja ? (
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
  liquidado: ['Liquidada', AZUL],
  incidencia: ['Entregado con incidencia', V.naranja],
  no_entregado: ['NO entregado', V.rojo],
  pendiente: ['Pendiente', V.gris],
}
const textoDe = (lista: [string, string][], v: string | null | undefined) => (v ? (lista.find(([k]) => k === v)?.[1] ?? v) : null)

function Oficina({ sesion, onSalir, onCaducada }: { sesion: Sesion; onSalir: () => void; onCaducada: () => void }) {
  const [rutas, setRutas] = useState<RutaOficina[] | null>(null)
  const [hoy, setHoy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<RutaOficina | null>(null)
  const [lineas, setLineas] = useState<LineaOficina[] | null>(null)
  const [hora, setHora] = useState<string | null>(null)
  // «Por cobrar»: facturas entregadas con importe pendiente; se despliega debajo de las rutas.
  const [cobros, setCobros] = useState<PorCobrar[] | null>(null)
  const [verCobros, setVerCobros] = useState(false)
  const [verCobrosRuta, setVerCobrosRuta] = useState(true)
  const validar = async (c: PorCobrar) => {
    const que = c.nulo ? 'el nulo' : (c.total ?? 0) < -0.005 ? 'el abono' : 'la factura a cero'
    if (!window.confirm(`¿Validar ${que} de ${c.cliente}? Confirma que la mercancía ha llegado al almacén y está bien.`)) return
    try {
      await validarIncidencia(sesion.token, c)
      setCobros((cs) => (cs ?? []).filter((x) => !(x.vt === c.vt && x.vn === c.vn && x.rt === c.rt && x.rn === c.rn)))
    } catch (e) {
      const err = e as ErrorApp
      if (err.caducada) onCaducada()
      else window.alert(err.red ? 'Sin conexión: inténtalo otra vez cuando haya cobertura.' : err.message)
    }
  }
  // Dos vistas: las rutas (David) y la caja (Cande). Cada móvil recuerda en cuál se quedó.
  // Quien entra por «CAJA» solo tiene la caja: ni rutas ni botones para cambiar.
  const soloCaja = sesion.solo_caja === true && !sesion.supervisor
  const [vista, setVista] = useState<'rutas' | 'caja'>(() => (soloCaja || leer<string>('reparto.oficina.vista') === 'caja' ? 'caja' : 'rutas'))
  const cambiarVista = (v: 'rutas' | 'caja') => {
    setVista(v)
    guardar('reparto.oficina.vista', v)
  }

  const cargar = useCallback(async () => {
    try {
      if (soloCaja) {
        setCobros(await porCobrar(sesion.token))
        setError(null)
        setHora(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
        return
      }
      const r = await todasLasRutas(sesion.token)
      setRutas(r.rutas ?? [])
      // Si falla solo esta lista, las rutas se siguen viendo.
      porCobrar(sesion.token)
        .then(setCobros)
        .catch(() => {})
      setHoy(r.hoy ?? null)
      setError(null)
      setHora(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
    } catch (e) {
      const err = e as ErrorApp
      if (err.caducada) onCaducada()
      else setError(err.red ? 'Sin conexión: se reintenta solo.' : err.message)
    }
  }, [sesion.token, onCaducada, soloCaja])
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
          sub={sesion.nombre.toUpperCase()} oficina
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
            {r.repartidor ?? 'Sin repartidor'}{r.repartidor ? (r.entrada ? ` · entró a las ${r.entrada}` : ' · sin fichar la entrada') : ''} · {dia(r.fecha)} · reparto nº {r.numero}
          </div>
          <div style={{ fontWeight: 700, color, margin: '6px 0 10px' }}>{sit}</div>
          {/* Incidencias de esta ruta (Rober, 19/11/2026): por cobrar, abonos/facturas a cero y nulos por validar. */}
          {cobros && listaPorCobrar(cobros.filter((c) => c.ruta === r.ruta)).length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <TarjetaPorCobrar titulo="INCIDENCIAS DE LA RUTA" cobros={cobros.filter((c) => c.ruta === r.ruta)} abierta={verCobrosRuta} onAbrir={() => setVerCobrosRuta((v) => !v)} onValidar={sesion.supervisor ? validar : undefined} />
            </div>
          )}
          {!lineas && <div style={{ color: V.gris }}>Cargando…</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lineas?.map((l) => {
              // Entregada pero sin cobrar: pasa a administración para el cobro, con el motivo que dio el repartidor.
              const sinCobrar = l.estado === 'entregado' && !!l.no_cobro
              const [et, ec] = sinCobrar ? (['Entregado SIN COBRAR', V.naranja] as [string, string]) : ESTADO_OFI[l.estado]
              const detalle = [textoDe(MOTIVOS, l.motivo), textoDe(INCIDENCIAS, l.incidencia), sinCobrar ? textoDe(NO_COBRO, l.no_cobro) : null, l.nota].filter(Boolean).join(' · ')
              return (
                <div key={`${l.vt}-${l.vn}`} style={{ borderLeft: `6px solid ${ec}`, background: '#f7faf7', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.cliente}</span>
                    <Importe l={l} />
                  </div>
                  <QueHacer l={l} />
                  <div style={{ fontSize: 13, color: V.gris }}>
                    {l.factura ? `Factura ${l.factura}` : `Albarán ${l.vt}/${l.vn}`}
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
      <Cabecera sub={sesion.nombre.toUpperCase()} oficina derecha={<BotonCabecera onClick={onSalir}>Salir</BotonCabecera>} />
      {!soloCaja && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <Boton claro={vista !== 'rutas'} onClick={() => cambiarVista('rutas')} style={{ flex: 1, padding: '10px 8px' }}>
            Rutas
          </Boton>
          <Boton claro={vista !== 'caja'} color={AZUL} onClick={() => cambiarVista('caja')} style={{ flex: 1, padding: '10px 8px' }}>
            Caja
          </Boton>
        </div>
      )}
      {vista === 'caja' && <Caja token={sesion.token} cobros={cobros} hora={hora} error={error} quien={sesion.nombre} onRecargar={() => void cargar()} />}
      <Tarjeta style={vista === 'caja' ? { display: 'none' } : undefined}>
        <div style={{ fontWeight: 700, fontSize: 18, color: V.verde }}>Todas las rutas</div>
        <div style={{ color: V.gris, fontSize: 13, marginBottom: 10 }}>Solo para mirar. Se actualiza sola{hora ? ` · ${hora}` : ''}.</div>
        {!rutas && !error && <div style={{ color: V.gris }}>Cargando…</div>}
        {rutas && !rutas.length && <div style={{ color: V.gris }}>No hay ningún reparto abierto ni de hoy.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Las abiertas primero; las ya cerradas de hoy, al final (siguen visibles hasta que acaba el día). */}
          {[...(rutas ?? [])]
            .sort((a, b) => Number(a.estado !== 2) - Number(b.estado !== 2))
            .map((r) => {
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
                  {r.repartidor ?? 'Sin repartidor'}{r.repartidor && r.entrada ? ` · entró ${r.entrada}` : ''} · {dia(r.fecha)}
                </div>
                <div style={{ fontWeight: 700, color, marginTop: 4 }}>
                  {sit}
                  {(() => {
                    const n = (cobros ?? []).filter((c) => c.ruta === r.ruta && (c.abono || c.nulo)).length
                    return n ? <span style={{ color: V.rojo }}> · ⚠ {n} por validar</span> : null
                  })()}
                </div>
                <div style={{ fontSize: 13, color: V.texto }}>
                  {r.total} pedidos · {r.entregados} entregados
                  {r.incidencias ? ` · ${r.incidencias} con incidencia` : ''}
                  {r.no_entregados ? ` · ${r.no_entregados} NO entregados` : ''}
                </div>
              </button>
            )
          })}
          {cobros && cobros.length > 0 && <TarjetaPorCobrar cobros={cobros} abierta={verCobros} onAbrir={() => setVerCobros((v) => !v)} onValidar={sesion.supervisor ? validar : undefined} />}
        </div>
        {error && <div style={{ color: V.rojo, marginTop: 10 }}>{error}</div>}
      </Tarjeta>
    </>
  )
}

/**
 * La caja del repartidor (Rober, 17/11/2026): lo mismo que ve administración en su Caja, pero de su ruta.
 * Qué facturas ha cobrado y cuánto dinero tiene que entregar arriba, sin tener que sumarlo a mano. Sale de
 * lo que él mismo ha ido marcando, así que funciona también sin cobertura.
 */
function CajaRepartidor({ lineas }: { lineas: LineaApp[] }) {
  const pend = (l: LineaApp) => Math.max(0, (l.total ?? 0) - (l.pagado ?? 0))
  const suma = (ls: LineaApp[]) => ls.reduce((t, l) => t + pend(l), 0)
  const entregadas = lineas.filter((l) => l.estado === 'entregado')
  const cobradas = entregadas.filter((l) => !l.no_cobro && hayQueCobrar(l))
  // Lo cobrado con tarjeta no se entrega en mano: va al banco por el datáfono.
  const enEfectivo = cobradas.filter((l) => l.medio !== 'tarjeta')
  const conTarjeta = cobradas.filter((l) => l.medio === 'tarjeta')
  const sinCobrar = entregadas.filter((l) => !!l.no_cobro)
  const liquidadas = lineas.filter((l) => l.estado === 'liquidado')
  const porRepartir = lineas.filter((l) => ['pendiente', 'viene_anterior'].includes(l.estado) && hayQueCobrar(l))
  const fila = (l: LineaApp, extra?: ReactNode) => (
    <div key={`${l.vt}-${l.vn}`} style={{ background: '#fff', border: '1px solid #d6dfd6', borderRadius: 12, padding: '8px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.cliente}</span>
        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, fontSize: 16, whiteSpace: 'nowrap' }}>{euros(pend(l))}</span>
      </div>
      <div style={{ fontSize: 12, color: V.gris }}>
        {l.factura ? `Factura ${l.factura}` : `Albarán ${l.vt}/${l.vn}`}
        {l.forma_pago ? ` · ${l.forma_pago}` : ''}
        {l.entregado_en ? ` · ${hora(l.entregado_en)}` : ''}
      </div>
      {extra}
    </div>
  )
  return (
    <Tarjeta style={{ borderTopColor: AZUL }}>
      <div style={{ fontWeight: 700, fontSize: 18, color: V.verde }}>Tu caja</div>
      <div style={{ color: V.gris, fontSize: 13 }}>Lo que has cobrado en mano en esta ruta y tienes que entregar en administración.</div>
      <div style={{ background: V.verde, color: '#fff', borderRadius: 16, padding: '12px 14px', margin: '10px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 13, opacity: 0.85 }}>TIENES QUE ENTREGAR</div>
        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, fontSize: 40, lineHeight: 1.1 }}>{euros(suma(enEfectivo))}</div>
        <div style={{ fontSize: 13, opacity: 0.85 }}>
          en efectivo · {enEfectivo.length} factura{enEfectivo.length === 1 ? '' : 's'}
        </div>
      </div>
      {conTarjeta.length > 0 && (
        <div style={{ background: '#eef5fc', borderRadius: 12, padding: '8px 10px', marginBottom: 10, display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ flex: 1, fontSize: 14, color: AZUL, fontWeight: 700 }}>💳 Con tarjeta ({conTarjeta.length}) · no se entrega</span>
          <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, fontSize: 16, color: AZUL }}>{euros(suma(conTarjeta))}</span>
        </div>
      )}
      {!cobradas.length && <div style={{ color: V.gris, fontSize: 14 }}>Todavía no has cobrado ninguna factura en mano.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {cobradas.map((l) => fila(l, l.medio === 'tarjeta' ? <div style={{ fontSize: 12, fontWeight: 700, color: AZUL }}>💳 Con tarjeta</div> : undefined))}
      </div>

      {sinCobrar.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 14, borderBottom: `2px solid ${V.rojo}`, paddingBottom: 2 }}>
            <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: V.rojo }}>Entregadas sin cobrar ({sinCobrar.length})</span>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{euros(suma(sinCobrar))}</span>
          </div>
          <div style={{ fontSize: 12, color: V.gris, margin: '2px 0 6px' }}>De estas no tienes que entregar dinero: pasan a administración.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sinCobrar.map((l) => fila(l, <div style={{ fontSize: 12, fontWeight: 700, color: V.rojo }}>{[textoDe(NO_COBRO, l.no_cobro), l.nota].filter(Boolean).join(' · ')}</div>))}
          </div>
        </>
      )}

      {(porRepartir.length > 0 || liquidadas.length > 0) && (
        <div style={{ fontSize: 13, color: V.texto, marginTop: 14, background: '#eef5fc', borderRadius: 12, padding: '8px 10px' }}>
          {porRepartir.length > 0 && (
            <div>
              Te quedan por repartir <b>{porRepartir.length}</b> factura{porRepartir.length === 1 ? '' : 's'} de cobro: <b>{euros(suma(porRepartir))}</b>
            </div>
          )}
          {liquidadas.length > 0 && (
            <div>
              Ya liquidadas en administración: <b>{liquidadas.length}</b>
            </div>
          )}
        </div>
      )}
      <div style={{ fontSize: 12, color: V.gris, marginTop: 10 }}>
        Sale de lo que vas marcando al entregar. Si ves algo mal, abre el pedido en «Repartir» y corrígelo.
      </div>
    </Tarjeta>
  )
}

/**
 * Caja (Rober, 17/11/2026): para quien recibe en administración el dinero de los repartidores. Por cada ruta,
 * las facturas de contado que el repartidor entregó y dice que cobró, y en grande el total que tiene que
 * entregar. Lo que NO cobró no sale aquí: eso es de la vista de rutas («Por cobrar»).
 * Liquidar (18/11/2026): al tocar las facturas contadas y escribir lo que entrega, «Liquidar» lo deja guardado en el
 * ERP (nº de liquidación, quién, cuándo, cuánto) y las facturas salen de la lista. El cobro se sigue apuntando en
 * GeminisWin; hasta que allí queda cobrada, la factura sale en «Falta apuntar en GeminisWin».
 */
function Caja({ token, cobros, hora, error, quien, onRecargar }: { token: string; cobros: PorCobrar[] | null; hora: string | null; error: string | null; quien: string; onRecargar: () => void }) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const [contadas, setContadas] = useState<Record<string, boolean>>({})
  const [entrega, setEntrega] = useState('')
  const [hecha, setHecha] = useState<Liquidacion | null>(null)
  const [hist, setHist] = useState<{ liquidaciones: Liquidacion[]; apuntar: PorApuntar[] } | null>(null)
  const [verHist, setVerHist] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  const cargarHist = useCallback(() => {
    liquidaciones(token)
      .then(setHist)
      .catch(() => {})
  }, [token])
  useEffect(() => {
    cargarHist()
  }, [cargarHist, cobros])

  const enMano = (cobros ?? []).filter((c) => !c.abono && c.contado !== false && tipoPago(c.forma_pago) === 'mano' && !c.no_cobro)
  const clave = (c: PorCobrar) => `${c.ruta ?? ''}|${c.fecha}`
  const rutas = [...new Set(enMano.map(clave))].map((k) => ({ k, filas: enMano.filter((c) => clave(c) === k) }))
  const suma = (fs: { pendiente?: number; importe?: number }[]) => fs.reduce((t, c) => t + (c.pendiente ?? c.importe ?? 0), 0)
  // Efectivo (se entrega en mano) y tarjeta (va al banco por el datáfono: se liquida, pero no se cuenta con el dinero).
  const efectivo = <T extends { medio?: 'efectivo' | 'tarjeta' | null }>(fs: T[]) => fs.filter((c) => c.medio !== 'tarjeta')
  const tarjeta = <T extends { medio?: 'efectivo' | 'tarjeta' | null }>(fs: T[]) => fs.filter((c) => c.medio === 'tarjeta')
  const hoyIso = new Date().toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Canary' })
  const nombreRuta = (c: { ruta: string | null; ruta_nombre: string | null; fecha?: string }) =>
    `RUTA ${c.ruta && /^\d+$/.test(c.ruta) ? Number(c.ruta) : (c.ruta ?? '')} · ${c.ruta_nombre ?? ''}` +
    (c.fecha && c.fecha < hoyIso ? ` · del ${new Date(`${c.fecha}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}` : '')
  const abrir = (k: string | null) => {
    setAbierta(k)
    setContadas({})
    setEntrega('')
    setFallo(null)
  }
  const fechaHora = (iso: string) =>
    new Date(iso).toLocaleString('es-ES', { timeZone: 'Atlantic/Canary', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  // El justificante por WhatsApp (Rober, 17/11/2026: ahorra papel). No lleva firma ni sello: lo que vale es que sale
  // del WhatsApp de administración, con el importe recibido y quién lo recibe. Se abre WhatsApp y quien envía elige
  // el contacto del repartidor.
  const enviarWhatsApp = (titulo: string, repartidor: string | null, filas: { cliente: string | null; factura: string | number | null; vt: string; vn: number; importe: number; medio?: 'efectivo' | 'tarjeta' | null }[], total: number, recibido: number, numero: number | null, en: string) => {
    const conTarjeta = suma(filas.filter((c) => c.medio === 'tarjeta'))
    const dif = Math.round((recibido - total) * 100) / 100
    const texto = [
      '*OFIPAPEL · Justificante de entrega de cobros*',
      `${titulo}${repartidor ? ` · Repartidor: ${repartidor}` : ''}`,
      `${numero ? `Liquidación nº ${numero} · ` : ''}${fechaHora(en)}`,
      '',
      ...filas.map((c) => `• ${c.cliente ?? ''} — ${c.factura ? `Fra. ${c.factura}` : `Alb. ${c.vt}/${c.vn}`} — ${euros(c.importe)}${c.medio === 'tarjeta' ? ' 💳' : ''}`),
      '',
      ...(conTarjeta ? [`Cobrado con tarjeta (no se entrega): ${euros(conTarjeta)}`] : []),
      `Total a entregar en efectivo: *${euros(total)}*`,
      `Entregado: *${euros(recibido)}*${dif === 0 ? ' ✅ Cuadra' : dif < 0 ? ` · Faltan ${euros(-dif)}` : ` · Sobran ${euros(dif)}`}`,
      '',
      `Recibido en administración por ${quien}.`,
    ].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
  }

  // Liquidación hecha: el recibo con su número, para imprimir o mandar, y deshacer si fue un error.
  if (hecha) {
    const filas = hecha.lineas.map((l) => ({ cliente: l.cliente, factura: l.factura, vt: l.vt, vn: l.vn, importe: l.importe, medio: l.medio ?? null }))
    const hechaTarjeta = suma(filas.filter((c) => c.medio === 'tarjeta'))
    const titulo = nombreRuta({ ruta: hecha.ruta, ruta_nombre: hecha.ruta_nombre })
    const dif = Math.round((hecha.entregado - hecha.esperado) * 100) / 100
    return (
      <Tarjeta style={{ borderTopColor: AZUL }}>
        <button type="button" onClick={() => (setHecha(null), abrir(null), onRecargar())} style={{ background: 'none', border: 'none', color: AZUL, fontSize: 14, fontWeight: 700, padding: '0 0 6px' }}>
          ← Volver a la caja
        </button>
        <div style={{ fontWeight: 700, fontSize: 18, color: hecha.anulada ? V.rojo : V.verde }}>
          {hecha.anulada ? `Liquidación nº ${hecha.id} DESHECHA` : `✔ Liquidación nº ${hecha.id} guardada`}
        </div>
        <div style={{ color: V.gris, fontSize: 13 }}>
          {titulo} · {hecha.repartidor ?? 'Sin repartidor apuntado'} · {fechaHora(hecha.en)}
        </div>
        <div style={{ background: hecha.anulada ? '#999' : V.verde, color: '#fff', borderRadius: 16, padding: '12px 14px', margin: '10px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 13, opacity: 0.85 }}>HA ENTREGADO</div>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, fontSize: 40, lineHeight: 1.1 }}>{euros(hecha.entregado)}</div>
          <div style={{ fontSize: 13, opacity: 0.9 }}>
            {hecha.facturas} factura{hecha.facturas === 1 ? '' : 's'} · tenía que entregar {euros(hecha.esperado)} en efectivo
            {dif === 0 ? ' · cuadra' : dif < 0 ? ` · faltan ${euros(-dif)}` : ` · sobran ${euros(dif)}`}
          </div>
          {hechaTarjeta > 0 && <div style={{ fontSize: 13, opacity: 0.9 }}>💳 Con tarjeta: {euros(hechaTarjeta)} (no se entrega)</div>}
        </div>
        {!hecha.anulada && (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <Boton color="#1fa855" onClick={() => enviarWhatsApp(titulo, hecha.repartidor, filas, hecha.esperado, hecha.entregado, hecha.id, hecha.en)} style={{ flex: 1, padding: '12px 6px', fontSize: 15 }}>
                WhatsApp
              </Boton>
              <Boton color={AZUL} onClick={() => window.print()} style={{ flex: 1, padding: '12px 6px', fontSize: 15 }}>
                🖨 Imprimir
              </Boton>
            </div>
            <div style={{ fontSize: 13, color: V.texto, marginTop: 10, background: '#fff6e5', borderRadius: 12, padding: '8px 10px' }}>
              Ahora apunta el cobro de estas facturas en GeminisWin (Pagos Factura). Mientras no esté apuntado allí, salen en «Falta apuntar en GeminisWin».
            </div>
            <button
              type="button"
              disabled={ocupado}
              onClick={async () => {
                if (!window.confirm(`¿Deshacer la liquidación nº ${hecha.id}? Las facturas vuelven a la caja como pendientes de liquidar.`)) return
                setOcupado(true)
                try {
                  await anularLiquidacion(token, hecha.id)
                  setHecha({ ...hecha, anulada: true })
                  cargarHist()
                } catch (e) {
                  setFallo((e as Error).message)
                }
                setOcupado(false)
              }}
              style={{ background: 'none', border: 'none', color: V.rojo, fontSize: 13, marginTop: 10, textDecoration: 'underline' }}
            >
              Deshacer esta liquidación (si te has equivocado)
            </button>
            {fallo && <div style={{ color: V.rojo, marginTop: 6 }}>{fallo}</div>}
            <Justificante ruta={titulo} repartidor={hecha.repartidor} filas={filas} total={hecha.esperado} tarjeta={hechaTarjeta} recibido={hecha.entregado} numero={hecha.id} en={hecha.en} />
          </>
        )}
      </Tarjeta>
    )
  }

  const sel = rutas.find((r) => r.k === abierta)
  if (sel) {
    const total = suma(efectivo(sel.filas))
    const totalTarjeta = suma(tarjeta(sel.filas))
    const marcadas = sel.filas.filter((c) => contadas[`${c.vt}-${c.vn}`])
    const aLiquidar = marcadas.length ? suma(efectivo(marcadas)) : total
    const recibido = Number(entrega.replace(/\./g, '').replace(',', '.'))
    const hayEntrega = entrega.trim() !== '' && Number.isFinite(recibido) && recibido >= 0
    const dif = hayEntrega ? Math.round((recibido - aLiquidar) * 100) / 100 : 0
    const liquidarAhora = async () => {
      if (!marcadas.length) return setFallo('Toca las facturas que te entrega (las que has contado).')
      if (!hayEntrega) return setFallo('Escribe en «Te entrega» el dinero que te da.')
      if (dif !== 0 && !window.confirm(`${dif < 0 ? `Faltan ${euros(-dif)}` : `Sobran ${euros(dif)}`}. ¿Liquidar igualmente? Queda apuntado lo que entregó.`)) return
      setOcupado(true)
      setFallo(null)
      try {
        const r = await liquidar(token, marcadas, recibido, null)
        const c0 = marcadas[0]
        setHecha({
          id: r.id,
          en: r.en,
          esperado: r.esperado,
          entregado: r.entregado,
          facturas: r.facturas,
          tarjeta: r.tarjeta ?? suma(tarjeta(marcadas)),
          lineas: marcadas.map((c) => ({ rt: c.rt, rn: c.rn, vt: c.vt, vn: c.vn, factura: c.factura == null ? null : String(c.factura), cliente: c.cliente, importe: c.pendiente, medio: c.medio === 'tarjeta' ? 'tarjeta' : 'efectivo' })),
          nota: null,
          anulada: false,
          ruta: c0.ruta,
          ruta_nombre: c0.ruta_nombre,
          repartidor: c0.repartidor,
        })
        cargarHist()
      } catch (e) {
        setFallo((e as Error).message)
      }
      setOcupado(false)
    }
    return (
      <Tarjeta style={{ borderTopColor: AZUL }}>
        <button type="button" onClick={() => abrir(null)} style={{ background: 'none', border: 'none', color: AZUL, fontSize: 14, fontWeight: 700, padding: '0 0 6px' }}>
          ← Todas las rutas
        </button>
        <div style={{ fontWeight: 700, fontSize: 18, color: V.verde }}>{nombreRuta(sel.filas[0])}</div>
        <div style={{ color: V.gris, fontSize: 13 }}>{sel.filas[0].repartidor ?? 'Sin repartidor apuntado'}</div>
        <div style={{ background: V.verde, color: '#fff', borderRadius: 16, padding: '12px 14px', margin: '10px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 13, opacity: 0.85 }}>TIENE QUE ENTREGAR EN EFECTIVO</div>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, fontSize: 40, lineHeight: 1.1 }}>{euros(total)}</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            {efectivo(sel.filas).length} factura{efectivo(sel.filas).length === 1 ? '' : 's'} cobrada{efectivo(sel.filas).length === 1 ? '' : 's'} en efectivo
          </div>
        </div>
        {totalTarjeta > 0 && (
          <div style={{ background: '#eef5fc', borderRadius: 12, padding: '8px 10px', marginBottom: 10, display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ flex: 1, fontSize: 14, color: AZUL, fontWeight: 700 }}>💳 Con tarjeta ({tarjeta(sel.filas).length}) · no se entrega</span>
            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, fontSize: 16, color: AZUL }}>{euros(totalTarjeta)}</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', fontSize: 12, color: V.gris, marginBottom: 4 }}>
          <span style={{ flex: 1 }}>Toca cada factura según la vayas contando.</span>
          <button
            type="button"
            onClick={() => setContadas(Object.fromEntries(sel.filas.map((c) => [`${c.vt}-${c.vn}`, true])))}
            style={{ background: 'none', border: 'none', color: AZUL, fontWeight: 700, fontSize: 13 }}
          >
            Marcar todas
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sel.filas.map((c) => {
            const k = `${c.vt}-${c.vn}`
            const ok = !!contadas[k]
            return (
              <button
                key={k}
                type="button"
                onClick={() => setContadas((m) => ({ ...m, [k]: !m[k] }))}
                style={{ textAlign: 'left', background: ok ? '#e6f4e6' : '#fff', border: `2px solid ${ok ? V.verdeCl : '#d6dfd6'}`, borderRadius: 12, padding: '8px 10px' }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ width: 18, fontWeight: 700, color: V.verdeCl }}>{ok ? '✔' : ''}</span>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.cliente}</span>
                  <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, fontSize: 16, whiteSpace: 'nowrap' }}>{euros(c.nulo ? c.total : c.pendiente)}</span>
                </div>
                <div style={{ fontSize: 12, color: V.gris, paddingLeft: 24 }}>
                  {c.factura ? `Factura ${c.factura}` : `Albarán ${c.vt}/${c.vn}`}
                  {c.forma_pago ? ` · ${c.forma_pago}` : ''}
                  {c.hora ? ` · entregada ${c.hora}` : ''}
                  {c.medio === 'tarjeta' ? <b style={{ color: AZUL }}> · 💳 tarjeta</b> : ''}
                </div>
              </button>
            )
          })}
        </div>
        <div style={{ fontSize: 13, color: V.texto, marginTop: 8 }}>
          Contadas {marcadas.length} de {sel.filas.length} · <b>{euros(suma(efectivo(marcadas)))}</b> en efectivo
          {tarjeta(marcadas).length ? ` · ${euros(suma(tarjeta(marcadas)))} con tarjeta` : ''}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Te entrega</span>
          <input
            value={entrega}
            onChange={(e) => setEntrega(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            style={{ flex: 1, minWidth: 0, border: '2px solid #cfe0cf', borderRadius: 12, padding: '10px 12px', fontSize: 20, textAlign: 'right', fontFamily: '"IBM Plex Mono", monospace' }}
          />
          <span style={{ fontSize: 18, fontWeight: 700 }}>€</span>
        </div>
        {hayEntrega && (
          <div style={{ fontWeight: 700, fontSize: 18, marginTop: 6, textAlign: 'center', color: dif === 0 ? V.verdeMed : V.rojo }}>
            {dif === 0 ? '✔ Cuadra' : dif < 0 ? `Faltan ${euros(-dif)}` : `Sobran ${euros(dif)}`}
          </div>
        )}
        <Boton color={V.verdeMed} disabled={ocupado || !marcadas.length || !hayEntrega} onClick={() => void liquidarAhora()} style={{ width: '100%', marginTop: 12, padding: '14px 6px', fontSize: 17 }}>
          {ocupado ? 'Guardando…' : `✔ Liquidar ${marcadas.length || ''} factura${marcadas.length === 1 ? '' : 's'}`}
        </Boton>
        {fallo && <div style={{ color: V.rojo, marginTop: 6 }}>{fallo}</div>}
        <div style={{ fontSize: 12, color: V.gris, marginTop: 6 }}>
          Toca las facturas que te entrega, escribe el dinero y pulsa <b>Liquidar</b>: queda guardado con un número y las facturas salen de la lista. Después podrás imprimir el justificante o mandarlo por WhatsApp.
        </div>
      </Tarjeta>
    )
  }

  const apuntar = hist?.apuntar ?? []
  const recientes = (hist?.liquidaciones ?? []).filter((q) => !q.anulada)
  return (
    <Tarjeta style={{ borderTopColor: AZUL }}>
      <div style={{ fontWeight: 700, fontSize: 18, color: V.verde }}>Caja · cobrar a los repartidores</div>
      <div style={{ color: V.gris, fontSize: 13, marginBottom: 10 }}>
        Lo que cada repartidor dice que ha cobrado en mano y aún no está liquidado. Se actualiza sola{hora ? ` · ${hora}` : ''}.
      </div>
      {!cobros && !error && <div style={{ color: V.gris }}>Cargando…</div>}
      {cobros && !rutas.length && <div style={{ color: V.gris }}>Ahora mismo ningún repartidor tiene cobros pendientes de entregar.</div>}
      {rutas.length > 0 && (
        <div style={{ background: '#eef5fc', borderRadius: 14, padding: '8px 12px', marginBottom: 10, display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ flex: 1, fontWeight: 700, color: AZUL }}>
            Total a recibir en efectivo
            {tarjeta(enMano).length ? <span style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>💳 Además {euros(suma(tarjeta(enMano)))} con tarjeta (no se entrega)</span> : null}
          </span>
          <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, fontSize: 22, color: AZUL }}>{euros(suma(efectivo(enMano)))}</span>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rutas.map((r) => (
          <button key={r.k} type="button" onClick={() => abrir(r.k)} style={{ textAlign: 'left', background: '#fff', border: `2px solid ${AZUL}`, borderRadius: 16, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 17, color: V.verde }}>{nombreRuta(r.filas[0])}</span>
              <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, fontSize: 20, whiteSpace: 'nowrap' }}>{euros(suma(efectivo(r.filas)))}</span>
            </div>
            <div style={{ color: V.gris, fontSize: 13 }}>
              {r.filas[0].repartidor ?? 'Sin repartidor apuntado'} · {r.filas.length} factura{r.filas.length === 1 ? '' : 's'}
              {tarjeta(r.filas).length ? ` · 💳 ${euros(suma(tarjeta(r.filas)))} con tarjeta` : ''}
            </div>
          </button>
        ))}
      </div>
      {error && <div style={{ color: V.rojo, marginTop: 10 }}>{error}</div>}

      {apuntar.length > 0 && (
        <div style={{ marginTop: 14, background: '#fff6e5', border: '2px solid #e0a030', borderRadius: 16, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ flex: 1, fontWeight: 700, color: '#9a5b00' }}>Falta apuntar en GeminisWin · {apuntar.length}</span>
            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600 }}>{euros(suma(apuntar))}</span>
          </div>
          <div style={{ fontSize: 12, color: V.gris, margin: '2px 0 6px' }}>
            Liquidadas aquí pero en GeminisWin todavía sin cobrar. Apunta el cobro allí (Pagos Factura): salen solas en unos minutos.
          </div>
          {apuntar.map((a) => (
            <div key={`${a.vt}-${a.vn}`} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 13, padding: '3px 0', borderTop: '1px solid #f0dcb4' }}>
              <span style={{ width: 110, whiteSpace: 'nowrap' }}>{a.factura ? `Fra. ${a.factura}` : `Alb. ${a.vt}/${a.vn}`}</span>
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.cliente}</span>
              <span style={{ fontFamily: '"IBM Plex Mono", monospace', whiteSpace: 'nowrap' }}>{euros(a.importe)}</span>
            </div>
          ))}
        </div>
      )}

      {recientes.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button type="button" onClick={() => setVerHist(!verHist)} style={{ background: 'none', border: 'none', color: AZUL, fontWeight: 700, fontSize: 14, padding: 0 }}>
            {verHist ? '▾' : '▸'} Liquidaciones de los últimos días ({recientes.length})
          </button>
          {verHist && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
              {recientes.map((q) => (
                <button key={q.id} type="button" onClick={() => setHecha(q)} style={{ textAlign: 'left', background: '#fff', border: '1px solid #cfd8e3', borderRadius: 12, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ flex: 1, fontWeight: 700 }}>
                      Nº {q.id} · {nombreRuta(q)}
                    </span>
                    <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600 }}>{euros(q.entregado)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: V.gris }}>
                    {q.repartidor ?? ''} · {fechaHora(q.en)} · {q.facturas} factura{q.facturas === 1 ? '' : 's'}
                    {Math.round((q.entregado - q.esperado) * 100) !== 0 ? ` · tenía que entregar ${euros(q.esperado)}` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <a
        href="https://web.whatsapp.com"
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '10px 12px', borderRadius: 14, border: '2px solid #1fa855', textDecoration: 'none', color: V.texto }}
      >
        <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
          <path
            fill="#1fa855"
            d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 1.8a8.2 8.2 0 0 1 0 16.4 8.1 8.1 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8Zm-3.2 4c-.2 0-.5 0-.7.3-.3.3-1 1-1 2.3s1 2.7 1.2 2.9c.1.2 2 3.1 4.900 4.300 2.400.9 2.900.8 3.400.7.500 0 1.700-.7 1.900-1.300.2-.700.2-1.200.2-1.300-.1-.2-.3-.2-.6-.4l-2-1c-.3-.1-.5-.1-.7.2l-.9 1.100c-.2.2-.3.2-.6.1a6.700 6.700 0 0 1-3.300-2.900c-.2-.4.300-.400.700-1.300.1-.2 0-.3 0-.5l-.9-2.200c-.2-.5-.4-.5-.6-.5h-.5Z"
          />
        </svg>
        <span style={{ fontSize: 13 }}>
          <b style={{ color: '#1fa855' }}>¿En un ordenador? Abrir WhatsApp Web</b>
          <br />
          Se vincula una sola vez: en el móvil de administración, WhatsApp → Dispositivos vinculados → Vincular, y se escanea el código.
        </span>
      </a>
    </Tarjeta>
  )
}

/**
 * Justificante de entrega de efectivo (Rober, 17/11/2026): el repartidor deja el dinero en administración y
 * se va con este papel firmado y sellado, sin esperar a que se liquide en GeminisWin. Dos copias en la misma
 * hoja: la suya y la de administración. En pantalla no se ve: solo existe al imprimir.
 */
function Justificante({
  ruta,
  repartidor,
  filas,
  total,
  tarjeta = 0,
  recibido,
  numero,
  en,
}: {
  ruta: string
  repartidor: string | null
  filas: { cliente: string | null; factura: string | number | null; vt: string; vn: number; importe: number; medio?: 'efectivo' | 'tarjeta' | null }[]
  total: number
  /** Cobrado con tarjeta (no se entrega en mano). */
  tarjeta?: number
  recibido: number | null
  numero?: number
  en?: string
}) {
  const ahora = new Date(en ?? Date.now()).toLocaleString('es-ES', { timeZone: 'Atlantic/Canary', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const dif = recibido == null ? 0 : Math.round((recibido - total) * 100) / 100
  const celda: CSSProperties = { padding: '3px 4px', borderBottom: '1px solid #999', fontSize: 12 }
  const copia = (para: string, firmaIzq: string, firmaDer: string) => (
    <div style={{ pageBreakInside: 'avoid', color: '#000', fontFamily: 'Arial, sans-serif', padding: '6px 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline' }}>
        <b style={{ flex: 1, fontSize: 18 }}>OFIPAPEL</b>
        <span style={{ fontSize: 11 }}>{para}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, margin: '2px 0 6px' }}>Justificante de entrega de cobros del reparto</div>
      <div style={{ fontSize: 12 }}>
        {numero ? <b>Liquidación nº {numero} · </b> : null}
        <b>{ruta}</b> · Repartidor: <b>{repartidor ?? '______________________'}</b> · {ahora}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
        <thead>
          <tr>
            <th style={{ ...celda, textAlign: 'left' }}>Cliente</th>
            <th style={{ ...celda, textAlign: 'left' }}>Documento</th>
            <th style={{ ...celda, textAlign: 'right' }}>Importe</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((c) => (
            <tr key={`${c.vt}-${c.vn}`}>
              <td style={celda}>{c.cliente}</td>
              <td style={{ ...celda, whiteSpace: 'nowrap' }}>{c.factura ? `Fra. ${c.factura}` : `Alb. ${c.vt}/${c.vn}`}</td>
              <td style={{ ...celda, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {euros(c.importe)}
                {c.medio === 'tarjeta' ? ' (tarjeta)' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 6, fontSize: 14 }}>
        <span>
          {filas.length} documento{filas.length === 1 ? '' : 's'} · Total a entregar en efectivo: <b>{euros(total)}</b>
        </span>
      </div>
      {tarjeta > 0 && <div style={{ textAlign: 'right', fontSize: 12 }}>Cobrado con tarjeta (no se entrega): {euros(tarjeta)}</div>}
      <div style={{ textAlign: 'right', fontSize: 14, marginTop: 2 }}>
        Entregado: <b>{recibido == null ? '______________ €' : euros(recibido)}</b>
        {recibido != null && dif !== 0 ? ` · ${dif < 0 ? 'Faltan' : 'Sobran'} ${euros(Math.abs(dif))}` : ''}
      </div>
      <div style={{ display: 'flex', gap: 24, marginTop: 34, fontSize: 11 }}>
        <div style={{ flex: 1, borderTop: '1px solid #000', paddingTop: 2 }}>{firmaIzq}</div>
        <div style={{ flex: 1, borderTop: '1px solid #000', paddingTop: 2 }}>{firmaDer}</div>
      </div>
      <div style={{ fontSize: 10, marginTop: 4 }}>Acredita la entrega del dinero en administración.</div>
    </div>
  )
  return (
    <div id="justificante-caja">
      <style>{`
        #justificante-caja { display: none; }
        @media print {
          html, body { background: #fff !important; }
          body * { visibility: hidden !important; }
          #justificante-caja, #justificante-caja * { visibility: visible !important; }
          #justificante-caja { display: block; position: absolute; left: 0; top: 0; width: 100%; padding: 0 8px; box-sizing: border-box; }
        }
      `}</style>
      {copia('Ejemplar para el repartidor', 'Recibí — administración (firma y sello)', 'Entregó — repartidor')}
      <div style={{ borderTop: '1px dashed #000', margin: '14px 0', textAlign: 'center', fontSize: 10, color: '#000' }}>✂ cortar por aquí</div>
      {copia('Ejemplar para administración', 'Recibí — administración', 'Entregó — repartidor (firma)')}
    </div>
  )
}

/**
 * «Por cobrar» (Rober y David, 17/11/2026): como una ruta más, en azul, debajo de las demás. Al tocarla se
 * despliega la lista de facturas ya entregadas que siguen con importe pendiente, agrupadas por cómo se
 * cobran. Es informativa: los cobros se apuntan en GeminisWin y la factura sale de aquí sola.
 */
function TarjetaPorCobrar({
  cobros,
  abierta,
  onAbrir,
  titulo = 'POR COBRAR · TODAS LAS RUTAS',
  onValidar,
}: {
  cobros: PorCobrar[]
  abierta: boolean
  onAbrir: () => void
  titulo?: string
  /** Oficina (20/11/2026): validar abonos, facturas a cero y nulos desde la app. */
  onValidar?: (c: PorCobrar) => void
}) {
  // Qué sale y en qué apartado: porCobrar.ts (lo mismo que el cuadro del Control de Repartos del ERP).
  const lista = listaPorCobrar(cobros)
  const grupos = gruposPorCobrar(cobros)
  const suma = sumaPorCobrar
  if (!lista.length) return null
  return (
    <div style={{ background: '#eef5fc', border: `2px solid ${AZUL}`, borderRadius: 16, overflow: 'hidden' }}>
      <button type="button" onClick={onAbrir} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 17, color: AZUL }}>{titulo}</span>
          <span style={{ fontWeight: 700, fontSize: 16, color: AZUL, whiteSpace: 'nowrap' }}>{euros(suma(lista))}</span>
        </div>
        <div style={{ color: V.gris, fontSize: 13 }}>Facturas entregadas con importe pendiente (sin los albaranes a crédito), y abonos, facturas a cero y nulos por validar en almacén · {abierta ? 'toca para cerrar' : 'toca para ver la lista'}</div>
        <div style={{ fontSize: 13, color: V.texto, marginTop: 4 }}>
          {grupos.map((x) => `${x.filas.length} ${x.g.replace('Abonos y facturas a cero · pendientes de validar en almacén', 'abonos/a cero sin validar').replace('Nulos · pendientes de validar en almacén', 'nulos sin validar').replace('Contado · ', '').replace('el repartidor no cobró', 'sin cobrar').replace('entregada, sin liquidar todavía', 'sin liquidar').toLowerCase()}`).join(' · ')}
        </div>
      </button>
      {abierta && (
        <div style={{ padding: '0 10px 10px' }}>
          {grupos.map((x) => (
            <div key={x.g} style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, borderBottom: `2px solid ${x.g === GRUPO_ABONOS || x.g === GRUPO_NULOS ? V.rojo : AZUL}`, paddingBottom: 2 }}>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: x.g.includes('no cobró') || x.g === GRUPO_ABONOS || x.g === GRUPO_NULOS ? V.rojo : AZUL }}>
                  {x.g} ({x.filas.length})
                </span>
                <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>{euros(x.g === GRUPO_ABONOS || x.g === GRUPO_NULOS ? x.filas.reduce((t, c) => t + (c.total ?? 0), 0) : suma(x.filas))}</span>
              </div>
              {x.filas.map((c) => (
                <div key={`${c.vt}-${c.vn}`} style={{ background: '#fff', borderRadius: 10, padding: '6px 8px', marginTop: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.cliente}</span>
                    <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>{euros(c.nulo ? c.total : c.pendiente)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: V.gris }}>
                    {c.factura ? `Factura ${c.factura}` : `Albarán ${c.vt}/${c.vn}`}
                    {c.ruta ? ` · Ruta ${/^\d+$/.test(c.ruta) ? Number(c.ruta) : c.ruta}` : ''}
                    {c.repartidor ? ` · ${c.repartidor}` : ''}
                    {c.hora ? ` · ${c.hora}` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: V.texto }}>
                    {c.forma_pago ?? 'Sin forma de pago'}
                    {!c.nulo && c.total != null && Math.abs(c.total - c.pendiente) > 0.005 ? ` · total ${euros(c.total)}` : ''}
                  </div>
                  {(c.no_cobro || c.nota) && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: c.no_cobro ? V.rojo : V.texto }}>
                      {[c.no_cobro ? `No cobró: ${textoDe(NO_COBRO, c.no_cobro)}` : null, c.nota].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {onValidar && (c.abono || c.nulo) && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                      <Boton claro onClick={() => onValidar(c)} style={{ padding: '3px 12px', fontSize: 13, borderRadius: 999 }}>
                        ✔ Validar
                      </Boton>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
          <div style={{ fontSize: 12, color: V.gris, marginTop: 8 }}>
            El cobro se apunta en GeminisWin: las facturas (contado, transferencias, remesas) salen solas de esta lista cuando allí quedan pagadas o liquidadas. Los abonos, facturas a cero y nulos salen al pulsar «Validar».
          </div>
        </div>
      )}
    </div>
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
      <CajaFichaje sesion={sesion} />
      <AvisosTraspaso sesion={sesion} />
      <Tarjeta>
        <div style={{ fontWeight: 700, fontSize: 18, color: V.verde }}>Elige tu ruta de hoy</div>
        <div style={{ color: V.gris, fontSize: 13, marginBottom: 10 }}>Toca la ruta que vas a repartir. Al cogerla pasa a ser tuya y los demás dejan de verla.</div>
        {!lista && !error && <div style={{ color: V.gris }}>Cargando…</div>}
        {lista && !lista.length && <div style={{ color: V.gris }}>No hay rutas abiertas para ti. Si esperabas una, avisa en la oficina.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lista?.map((r) => (
            <button
              key={`${r.tienda}-${r.numero}`}
              type="button"
              onClick={() => {
                if (!r.mio && !window.confirm(`¿Coges la ${nombreRuta(r.ruta, r.ruta_nombre)}${r.manana ? ' (mañana)' : ''}? Será tuya. Si te equivocas, dentro puedes soltarla.`)) return
                onElegir(r)
              }}
              style={{ textAlign: 'left', background: r.mio ? V.pale : '#fff', border: `2px solid ${r.mio ? V.verdeMed : '#cfe0cf'}`, borderRadius: 16, padding: 14 }}
            >
              <div style={{ fontSize: 18, color: V.verde }}>
                🚚 {r.ruta && <b style={{ fontWeight: 800 }}>RUTA {/^\d+$/.test(r.ruta) ? Number(r.ruta) : r.ruta}</b>}
                {r.ruta && r.ruta_nombre ? ' · ' : ''}
                <span style={{ fontWeight: 500 }}>{r.ruta_nombre ?? (r.ruta ? '' : 'Sin ruta')}</span>
              </div>
              <div style={{ color: V.gris, fontSize: 14 }}>
                {r.manana ? 'Mañana · ' : ''}
                {r.pedidos} pedidos · {r.pendientes} por entregar{r.mio ? ' · TUYA' : ' · libre'}
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
type Hoja = { tipo: 'incidencia' | 'no_entregado' | 'cobro' | 'ruta' | 'telefono'; linea: LineaApp } | null

function Ruta({ sesion, reparto, onVolver, onCaducada }: { sesion: Sesion; reparto: RepartoApp; onVolver: () => void; onCaducada: () => void }) {
  const [datos, setDatos] = useState(() => lineasEnCache(reparto.tienda, reparto.numero))
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [hoja, setHoja] = useState<Hoja>(null)
  const [pendientesCola, setPendientesCola] = useState(() => cola().length)
  const [modo, setModo] = useState<'comprobar' | 'repartir'>(() => (leer<string>(`reparto.modo.${reparto.tienda}-${reparto.numero}`) as 'comprobar' | 'repartir') ?? 'comprobar')
  // Tercera pestaña (Rober, 17/11/2026): la caja del repartidor, qué ha cobrado y cuánto tiene que entregar.
  const [caja, setCaja] = useState(false)
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

  const accion = (l: LineaApp, tipo: 'entregado' | 'sin_cobrar' | 'incidencia' | 'no_entregado' | 'deshacer', detalle?: string, nota?: string) => {
    if (tipo !== 'deshacer' && !puedeEntregar) {
      setHoja(null)
      setAviso('Primero ficha la entrada (botón «Fichar entrada», arriba): hasta entonces puedes ver, comprobar y ordenar la ruta, pero no entregar.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const ahora = new Date().toISOString()
    const pos = ultimaPos.current
    if (tipo === 'entregado') cambiarLocal(clave(l), { estado: 'entregado', incidencia: null, motivo: null, no_cobro: null, medio: detalle === 'tarjeta' || detalle === 'efectivo' ? detalle : null, entregado_en: ahora, nota: nota ?? null })
    if (tipo === 'sin_cobrar') cambiarLocal(clave(l), { estado: 'entregado', incidencia: null, motivo: null, no_cobro: detalle ?? null, medio: null, entregado_en: ahora, nota: nota ?? null })
    if (tipo === 'incidencia') cambiarLocal(clave(l), { estado: 'entregado', incidencia: detalle ?? null, motivo: null, no_cobro: null, medio: null, entregado_en: ahora, nota: nota ?? null })
    if (tipo === 'no_entregado')
      cambiarLocal(clave(l), {
        estado: 'no_entregado',
        motivo: detalle ?? null,
        incidencia: null,
        no_cobro: null,
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
        no_cobro: null,
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
      p_accion: tipo === 'sin_cobrar' ? 'entregado_sin_cobrar' : tipo,
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

  const cambiarModo = (m: 'comprobar' | 'repartir') => {
    setModo(m)
    guardar(`reparto.modo.${reparto.tienda}-${reparto.numero}`, m)
  }

  const alCambiarTraspaso = useCallback(() => void recargar(), [recargar])
  const soltar = () => {
    if (!window.confirm('¿Seguro que esta NO es tu ruta? Quedará libre para que la coja otro repartidor.')) return
    soltarRuta(sesion.token, reparto.tienda, reparto.numero)
      .then(() => onVolver())
      .catch((e: Error) => setAviso(e.message))
  }
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
      <Cabecera sub={`${nombreRuta(datos?.reparto.ruta ?? reparto.ruta, datos?.reparto.ruta_nombre ?? reparto.ruta_nombre).toUpperCase()} · ${sesion.nombre.toUpperCase()}`} derecha={<BotonCabecera onClick={onVolver}>Rutas</BotonCabecera>} />

      {gps === null && (
        <Tarjeta>
          <div style={{ fontWeight: 700, color: V.verde, marginBottom: 6 }}>📍 Ubicación</div>
          <div style={{ fontSize: 14, color: V.gris, marginBottom: 10 }}>
            Mientras tengas la app abierta con tu ruta y estés fichado (entre la entrada y la salida, fuera de las pausas), la app enviará tu ubicación para la pantalla de pedidos de la oficina. Con la app cerrada o sin fichar no se envía nada.
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

      <CajaFichaje sesion={sesion} onCambio={() => void mirarFichaje()} />
      {fichaje === 'sin_conexion' && (
        <Tarjeta style={{ borderTopColor: V.naranja, fontSize: 14, color: V.gris }}>Sin cobertura no puedo comprobar tu fichaje. En cuanto vuelva la señal lo miro otra vez.</Tarjeta>
      )}
      {(fichaje === 'sin_fichar' || fichaje === 'pausa' || fichaje === 'salida') && (
        <div style={{ color: '#fff', fontSize: 13, textAlign: 'center', textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>
          {fichaje === 'pausa' ? 'En pausa no se puede entregar.' : 'Sin fichar la entrada puedes ver, comprobar y ordenar la ruta, pero no entregar.'}
        </div>
      )}

      <div style={{ display: 'flex', background: 'rgba(255,255,255,.9)', borderRadius: 16, padding: 4, gap: 4 }}>
        {(['comprobar', 'repartir'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setCaja(false)
              cambiarModo(m)
            }}
            style={{
              flex: 1,
              borderRadius: 12,
              padding: '10px 4px',
              fontWeight: 700,
              fontSize: 14,
              border: 'none',
              background: !caja && modo === m ? V.verdeMed : 'transparent',
              color: !caja && modo === m ? '#fff' : V.verde,
            }}
          >
            {m === 'comprobar' ? `① Comprobar ${comprobados}/${ls.length}` : `② Repartir ${hechos}/${ls.length}`}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCaja(true)}
          style={{ flex: 0.7, borderRadius: 12, padding: '10px 4px', fontWeight: 700, fontSize: 14, border: 'none', background: caja ? AZUL : 'transparent', color: caja ? '#fff' : AZUL }}
        >
          ③ Caja
        </button>
      </div>

      {(aviso || pendientesCola > 0) && (
        <div style={{ background: '#fff7e0', border: `1px solid ${V.naranja}`, borderRadius: 12, padding: '8px 12px', fontSize: 13 }}>
          {pendientesCola > 0 && <div>📶 {pendientesCola} cambio(s) sin enviar: se envían solos al volver la cobertura.</div>}
          {aviso && <div>{aviso}</div>}
        </div>
      )}
      {error && <div style={{ background: '#fdecea', borderRadius: 12, padding: '8px 12px', color: V.rojo }}>{error}</div>}

      {caja && <CajaRepartidor lineas={ls} />}

      {!caja && modo === 'comprobar' && (
        <div style={{ color: '#fff', fontSize: 13, textShadow: '0 1px 2px rgba(0,0,0,.6)', padding: '0 4px' }}>
          Antes de salir: marca cada pedido cuyo albarán llevas. Si alguno no es de tu ruta, tócalo para cambiarlo o avisa en la oficina.
        </div>
      )}

      {!caja && modo === 'repartir' && ls.length > 0 && hechos === ls.length && (
        <Tarjeta>
          <div style={{ fontWeight: 800, fontSize: 18, color: V.verde }}>✔ Ruta terminada</div>
          <div style={{ fontSize: 14, color: V.gris, margin: '6px 0 10px' }}>
            Pasa por Ofipapel a entregar los cobros y cargar la furgoneta para mañana. Tu jornada termina al guardar la furgoneta en la nave: ficha la salida entonces, con el botón «Fichar salida» de arriba.
          </div>
        </Tarjeta>
      )}

      <AvisosTraspaso sesion={sesion} onCambio={alCambiarTraspaso} />

      {caja ? null : !datos ? (
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

      {hechos === 0 && comprobados === 0 && (
        <div style={{ textAlign: 'center' }}>
          <button type="button" onClick={soltar} style={{ background: 'rgba(255,255,255,.85)', border: 'none', borderRadius: 12, color: V.rojo, fontSize: 14, textDecoration: 'underline', padding: '8px 14px' }}>
            No es mi ruta: soltarla
          </button>
        </div>
      )}

      {hoja?.tipo === 'incidencia' && (
        <HojaOpciones
          titulo="Entregado con incidencia"
          opciones={INCIDENCIAS}
          onCerrar={() => setHoja(null)}
          onOk={(d, n) => accion(hoja.linea, 'incidencia', d, n)}
        />
      )}
      {hoja?.tipo === 'cobro' && (
        <HojaOpciones
          titulo={`Entregado · ¿cobraste ${euros((hoja.linea.total ?? 0) - (hoja.linea.pagado ?? 0))}?`}
          opciones={NO_COBRO}
          cabecera={
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <Boton onClick={() => accion(hoja.linea, 'entregado', 'efectivo')} style={{ flex: 1 }}>
                  💶 En efectivo
                </Boton>
                <Boton color={AZUL} onClick={() => accion(hoja.linea, 'entregado', 'tarjeta')} style={{ flex: 1 }}>
                  💳 Con tarjeta
                </Boton>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: V.rojo, marginTop: 6 }}>No se cobró porque…</div>
            </>
          }
          onCerrar={() => setHoja(null)}
          onOk={(d, n) => accion(hoja.linea, 'sin_cobrar', d, n)}
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

// ------------------------------------------------------------------ Fichar (entrada, pausa y salida) sin salir de la app
const posicionAhora = (): Promise<{ lat: number; lng: number; precision: number | null } | null> =>
  new Promise((ok) => {
    if (leer<string>('reparto.gps') !== 'si' || !('geolocation' in navigator)) return ok(null)
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }),
      () => ok(null),
      { timeout: 5000, maximumAge: 60_000 },
    )
  })

function CajaFichaje({ sesion, onCambio }: { sesion: Sesion; onCambio?: () => void }) {
  const [f, setF] = useState<FichajeHoy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const mirar = useCallback(async () => {
    try {
      setF(await fichajeHoy(sesion.token))
    } catch {
      /* sin conexión o sesión caducada: lo avisa la pantalla principal */
    }
  }, [sesion.token])
  useEffect(() => {
    void mirar()
    const t = setInterval(() => void mirar(), 60_000)
    return () => clearInterval(t)
  }, [mirar])

  const pulsar = async (tipo: TipoFichaje) => {
    if (tipo === 'salida' && !window.confirm('¿Fichas la SALIDA? Tu jornada de hoy quedará terminada.')) return
    setOcupado(true)
    setError(null)
    try {
      setF(await fichar(sesion.token, tipo, await posicionAhora()))
      onCambio?.()
    } catch (e) {
      setError((e as ErrorApp).red ? 'Sin conexión: para fichar hace falta cobertura.' : (e as Error).message)
      void mirar()
    } finally {
      setOcupado(false)
    }
  }
  if (!f || f.estado === 'sin_vinculo') return null
  const h = (tipo: TipoFichaje) => {
    const e = [...f.hoy].reverse().find((x) => x.tipo === tipo)
    return e ? hora(e.en) : ''
  }
  const primera = f.hoy.find((x) => x.tipo === 'entrada')
  const peq: CSSProperties = { fontSize: 14, padding: '10px 6px', flex: 1 }
  return (
    <Tarjeta style={{ padding: 12, borderTopColor: f.estado === 'trabajando' ? V.verdeCl : f.estado === 'pausa' ? V.naranja : V.rojo }}>
      {f.estado === 'sin_fichar' && (
        <>
          <div style={{ fontWeight: 700, color: V.rojo, marginBottom: 8 }}>🕒 Aún no has fichado la entrada</div>
          <Boton disabled={ocupado} onClick={() => void pulsar('entrada')} style={{ width: '100%', fontSize: 18 }}>
            ▶ Fichar entrada
          </Boton>
        </>
      )}
      {f.estado === 'trabajando' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 130px', fontWeight: 700, color: V.verde, fontSize: 14 }}>🟢 Trabajando{primera ? ` · entrada ${hora(primera.en)}` : ''}</div>
          <div style={{ display: 'flex', gap: 8, flex: '1 1 200px' }}>
            <Boton claro color={V.naranja} disabled={ocupado} onClick={() => void pulsar('pausa_inicio')} style={peq}>
              ⏸ Pausa
            </Boton>
            <Boton claro color={V.rojo} disabled={ocupado} onClick={() => void pulsar('salida')} style={peq}>
              ■ Fichar salida
            </Boton>
          </div>
        </div>
      )}
      {f.estado === 'pausa' && (
        <>
          <div style={{ fontWeight: 700, color: V.naranja, marginBottom: 8 }}>⏸ En pausa desde las {h('pausa_inicio')}</div>
          <Boton disabled={ocupado} onClick={() => void pulsar('pausa_fin')} style={{ width: '100%' }}>
            ▶ Terminar pausa
          </Boton>
        </>
      )}
      {f.estado === 'salida' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 150px', fontWeight: 700, color: V.gris, fontSize: 14 }}>
            ■ Jornada terminada{primera ? ` · ${hora(primera.en)}–${h('salida')}` : ''}
          </div>
          <Boton claro color={V.gris} disabled={ocupado} onClick={() => void pulsar('entrada')} style={{ fontSize: 13, padding: '8px 10px' }}>
            Fichar entrada otra vez
          </Boton>
        </div>
      )}
      {error && <div style={{ color: V.rojo, marginTop: 8, fontSize: 14 }}>{error}</div>}
    </Tarjeta>
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
  // Si la factura había que cobrarla, «Entregado» pregunta antes si se cobró (y, si no, por qué).
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
          l.estado === 'liquidado' ? AZUL : l.estado === 'no_entregado' ? V.rojo : l.incidencia || l.no_cobro ? V.naranja : l.estado === 'entregado' ? V.verdeCl : l.prioritario ? V.rojo : '#cfd8cf'
        const fondo = l.estado === 'liquidado' ? '#eaf2fb' : l.estado === 'no_entregado' ? '#fdecea' : l.incidencia || l.no_cobro ? '#fff4e0' : marcado ? '#eef8ee' : '#fff'
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
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
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
                  </span>
                  <Importe l={l} />
                </div>
                <QueHacer l={l} />
                {l.viene_de && <div style={{ fontSize: 12, color: '#1f6fb2', fontWeight: 700 }}>📦 Te lo pasa: {l.viene_de}</div>}
                {l.traspaso?.estado === 'propuesto' && <div style={{ fontSize: 12, color: V.naranja, fontWeight: 700 }}>⏳ Ofrecido a {l.traspaso.a}: esperando respuesta</div>}
                {l.traspaso?.estado === 'aceptado' && <div style={{ fontSize: 12, color: V.gris, fontWeight: 700 }}>➡ Lo lleva {l.traspaso.a}</div>}
                {marcado && (
                  <div style={{ fontSize: 12, color }}>
                    {l.estado === 'liquidado'
                      ? `Liquidada en administración${l.entregado_en ? ' · entregado ' + hora(l.entregado_en) : ''}`
                      : l.estado === 'no_entregado'
                      ? `No entregado${l.intento1 ? ' · ' + hora(l.intento1) : ''}${l.intento2 ? ' y ' + hora(l.intento2) : ''}`
                      : `${l.incidencia ? 'Con incidencia' : l.no_cobro ? 'Entregado SIN COBRAR: ' + (textoDe(NO_COBRO, l.no_cobro) ?? '') : 'Entregado'}${l.entregado_en ? ' · ' + hora(l.entregado_en) : ''}`}
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
                  {l.estado === 'liquidado' ? (
                    ' · liquidada'
                  ) : tipoPago(l.forma_pago) === 'pagada' ? (
                    ' · pagado por Bizum'
                  ) : l.contado === false ? (
                    // GeminisWin, venta a crédito: no se cobra en la entrega, solo se firma el albarán.
                    ' · crédito: solo firmar'
                  ) : tipoPago(l.forma_pago) === 'banco' ? (
                    // Marcada como contado, pero la paga el cliente por el banco (remesa, transferencia…).
                    ` · ${l.forma_pago}: no se cobra, solo firmar`
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
                        <Boton onClick={() => (hayQueCobrar(l) ? onHoja({ tipo: 'cobro', linea: l }) : onAccion(l, 'entregado'))} style={{ flex: 1, fontSize: 14 }}>
                          ✅ Ya entregado
                        </Boton>
                      )}
                      <Boton claro color={V.gris} onClick={() => onAccion(l, 'deshacer')} style={{ flex: 1, fontSize: 14 }}>
                        Deshacer
                      </Boton>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10, opacity: bloqueado ? 0.45 : 1 }}>
                      <Boton onClick={() => (hayQueCobrar(l) ? onHoja({ tipo: 'cobro', linea: l }) : onAccion(l, 'entregado'))} style={{ fontSize: 14, padding: '12px 4px' }}>
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

function HojaOpciones({
  titulo,
  opciones,
  cabecera,
  onCerrar,
  onOk,
}: {
  titulo: string
  opciones: [string, string][]
  /** Lo que va encima de las opciones (p. ej. «Sí, cobrado» antes de los motivos de no cobro). */
  cabecera?: ReactNode
  onCerrar: () => void
  onOk: (detalle: string, nota?: string) => void
}) {
  const [otro, setOtro] = useState(false)
  const [nota, setNota] = useState('')
  return (
    <Hoja titulo={titulo} onCerrar={onCerrar}>
      {!otro ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cabecera}
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
