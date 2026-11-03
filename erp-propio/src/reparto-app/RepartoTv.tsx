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

export function RepartoTv() {
  const [clave] = useState(claveInicial)
  const [datos, setDatos] = useState<DatosSeg | null>(null)
  const [error, setError] = useState<string | null>(clave ? null : 'Falta el enlace de la pantalla: créalo en el ERP (Ventas → Seguimiento de Repartos → Enlace para la TV) y ábrelo aquí.')
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

  const cargar = useCallback(async () => {
    if (!clave) return
    const { data, error: e } = await supabase.rpc('fn_reparto_tv', { p_clave: clave })
    if (e) setError(/clave_tv/.test(e.message) ? (e.hint ?? 'Este enlace ya no vale: crea uno nuevo en el ERP.') : 'Sin conexión: se reintenta solo.')
    else {
      setDatos(data as DatosSeg)
      setError(null)
    }
  }, [clave])

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
          </>
        }
        avisos={
          !datos && !error ? <div style={{ color: '#fff', fontSize: 22, textAlign: 'center', textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>Cargando…</div> : null
        }
      />
    </div>
  )
}
