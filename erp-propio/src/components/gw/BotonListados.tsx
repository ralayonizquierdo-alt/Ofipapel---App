// Botón «Listados» de las pantallas (Luis, 29/10/2026): mismo tamaño que los de la botonera de
// abajo y fondo gris (aunque la ventana tenga color de sección). Abre el Generador de listados con
// la fuente de la pantalla (fuenteDeRuta) o la que se le diga, y filtros ya puestos si hace falta
// (p. ej. las ventas de un cliente: filtros={{ cliente: '00001' }}).

import { useLocation, useNavigate } from 'react-router-dom'
import { fuenteDeRuta } from '../../lib/listados/fuentes'
import { GwListados } from './GwIconos'

export function BotonListados({ fuente, filtros, className = '' }: { fuente?: string; filtros?: Record<string, string>; className?: string }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const f = fuente ?? fuenteDeRuta(pathname)
  return (
    <button
      type="button"
      title="Generador de listados de esta pantalla"
      onClick={() => {
        const q = new URLSearchParams()
        if (f) q.set('fuente', f)
        for (const [c, v] of Object.entries(filtros ?? {})) q.append('filtro', `${c}:${v}`)
        navigate(`/listados${q.toString() ? `?${q.toString()}` : ''}`)
      }}
      className={`gw-boton-barra h-[34px] w-[84px] flex-none gap-1 text-[12px] ${className}`}
      style={{ background: '#e8e8e8' }}
    >
      <GwListados size={20} />
      Listados
    </button>
  )
}
