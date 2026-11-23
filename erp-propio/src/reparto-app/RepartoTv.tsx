import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { BotonClaro, PanelReparto, type DatosSeg } from './PanelReparto'

// Pantalla de la TV del departamento de pedidos (/reparto-tv?k=<código>): sin ERP ni usuario. El código lo crea el ERP
// (Ventas → Seguimiento de Repartos → «Enlace para la TV») y se guarda en la TV. Solo lee (fn_reparto_tv).
// Se refresca cada 20 s y alterna «Rutas» y «Mapa» cada 30 s.

const K = 'reparto.tv.clave'

function claveInicial(): string | null {
  const k = new URLSearchParams(location.search).get('k')
  try {
    if (k) {
      localStorage.setItem(K, k)
      return k
    }
    return localStorage.getItem(K)
  } catch {
    return k
  }
}

/**
 * La pantalla de repartos. Dos formas de abrirla:
 *  · /reparto-tv?k=<código> — para la TV: sin usuario, con el código del enlace.
 *  · /reparto-pantalla (interna) — desde el ERP, con la sesión del empleado que ya ha entrado: sin enlace ni código.
 */
export function RepartoTv({ interna = false }: { interna?: boolean }) {
  const [clave, setClave] = useState<string | null>(() => (interna ? null : claveInicial()))
  const [codigo, setCodigo] = useState<string | null>(null)
  const [datos, setDatos] = useState<DatosSeg | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState<'rutas' | 'mapa'>('rutas')
  const [hora, setHora] = useState(() => new Date())

  useEffect(() => {
    const titulo = document.title
    document.title = 'Repartos de hoy · Ofipapel'
    if (!document.getElementById('reparto-fuentes')) {
      const l = document.createElement('link')
      l.id = 'reparto-fuentes'
      l.rel = 'stylesheet'
      l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&family=Poppins:wght@700;800&display=swap'
      document.head.appendChild(l)
    }
    return () => {
      document.title = titulo
    }
  }, [])

  // Sin enlace: la TV pide un código corto y lo enseña en grande; en el ERP se escribe (Seguimiento de Repartos → Enlace para la
  // TV → «Vincular TV») y la TV recoge sola su clave (fn_reparto_tv_pedir / _recoger / _vincular).
  useEffect(() => {
    if (clave || interna) return
    let vivo = true
    const KC = 'reparto.tv.codigo'
    let actual: string | null = null
    try {
      actual = localStorage.getItem(KC)
    } catch {
      actual = null
    }
    const pedir = async () => {
      const { data, error: e } = await supabase.rpc('fn_reparto_tv_pedir')
      if (!vivo) return
      if (e || typeof data !== 'string') return setError('Sin conexión: se reintenta solo.')
      actual = data
      try {
        localStorage.setItem(KC, data)
      } catch {
        /* sin almacenamiento: el código vale mientras la pantalla siga abierta */
      }
      setError(null)
      setCodigo(data)
    }
    if (actual) setCodigo(actual)
    else void pedir()
    const t = setInterval(async () => {
      if (!actual) return void pedir()
      const { data, error: e } = await supabase.rpc('fn_reparto_tv_recoger', { p_codigo: actual })
      if (!vivo) return
      if (e) {
        if (/codigo_tv/.test(e.message)) void pedir()
        return
      }
      if (typeof data === 'string' && data) {
        try {
          localStorage.setItem(K, data)
          localStorage.removeItem(KC)
        } catch {
          /* se usa solo en esta sesión */
        }
        setCodigo(null)
        setClave(data)
      }
    }, 3000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [clave, interna])

  const cargar = useCallback(async () => {
    if (interna) {
      const { data, error: e } = await supabase.rpc('fn_reparto_seguimiento', { p_fecha: null })
      if (e) setError(/permiso|42501|JWT|sesi/i.test(e.message + (e.code ?? '')) ? 'Para ver esta pantalla entra primero en el ERP con un usuario que tenga permiso de Repartos.' : 'Sin conexión: se reintenta solo.')
      else {
        setDatos(data as DatosSeg)
        setError(null)
      }
      return
    }
    if (!clave) return
    const { data, error: e } = await supabase.rpc('fn_reparto_tv', { p_clave: clave })
    if (e) setError(/clave_tv/.test(e.message) ? (e.hint ?? 'Este enlace ya no vale: crea uno nuevo en el ERP.') : 'Sin conexión: se reintenta solo.')
    else {
      setDatos(data as DatosSeg)
      setError(null)
    }
  }, [clave, interna])

  useEffect(() => {
    void cargar()
    const t = setInterval(() => void cargar(), 20_000)
    const v = setInterval(() => setVista((x) => (x === 'rutas' ? 'mapa' : 'rutas')), 30_000)
    const h = setInterval(() => setHora(new Date()), 1000)
    return () => {
      clearInterval(t)
      clearInterval(v)
      clearInterval(h)
    }
  }, [cargar])

  const pantallaCompleta = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen().catch(() => {})
  }

  return (
    <div style={{ height: '100dvh' }}>
      <PanelReparto
        datos={datos}
        error={error}
        vista={vista}
        setVista={setVista}
        tv
        derecha={
          <>
            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 34, fontWeight: 600 }}>
              {hora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Atlantic/Canary' })}
            </div>
            <BotonClaro onClick={pantallaCompleta}>⛶</BotonClaro>
            {interna && <BotonClaro onClick={() => (history.length > 1 ? history.back() : window.close())}>✕</BotonClaro>}
          </>
        }
        avisos={
          !clave && !interna ? (
            <div style={{ color: '#fff', textAlign: 'center', textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>
              <div style={{ fontSize: 26 }}>Para ver los repartos, en el ERP escribe este código:</div>
              <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 110, fontWeight: 700, letterSpacing: 12, margin: '12px 0' }}>{codigo ?? '········'}</div>
              <div style={{ fontSize: 20 }}>Ventas → Seguimiento de Repartos → Enlace para la TV → «Vincular TV». Esta pantalla se pone sola cuando lo escribas.</div>
            </div>
          ) : !datos && !error ? (
            <div style={{ color: '#fff', fontSize: 22, textAlign: 'center', textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>Cargando…</div>
          ) : null
        }
      />
    </div>
  )
}
