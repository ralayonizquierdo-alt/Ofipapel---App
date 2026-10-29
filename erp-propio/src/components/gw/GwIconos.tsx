import type { SVGProps } from 'react'

/**
 * Iconos de la botonera inferior de GeminisWin (16×16, a color, como los de Windows clásico):
 * flechas azul marino, ordenar A-Z, ventana con prismáticos, impresora, hoja en blanco, ventana
 * con lápiz, ventana con aspa y puerta de salida. Copiados de la captura de la ficha de Artículos.
 * En un botón desactivado salen en gris (`.gw-boton-barra:disabled svg`, index.css).
 */
type P = SVGProps<SVGSVGElement> & { size?: number }

const AZUL = '#00007f'

function Svg({ size = 16, children, ...p }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden {...p}>
      {children}
    </svg>
  )
}

export const GwPrimero = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="3" width="2" height="10" fill={AZUL} />
    <path d="M12 3v10L6 8z" fill={AZUL} />
  </Svg>
)

export const GwAnterior = (p: P) => (
  <Svg {...p}>
    <path d="M10 3v10L5 8z" fill={AZUL} />
  </Svg>
)

export const GwSiguiente = (p: P) => (
  <Svg {...p}>
    <path d="M6 3v10l5-5z" fill={AZUL} />
  </Svg>
)

export const GwUltimo = (p: P) => (
  <Svg {...p}>
    <path d="M4 3v10l6-5z" fill={AZUL} />
    <rect x="11" y="3" width="2" height="10" fill={AZUL} />
  </Svg>
)

export const GwOrdenar = (p: P) => (
  <Svg {...p}>
    <text x="1" y="7" fontSize="7" fontWeight="bold" fontFamily="Arial, sans-serif" fill={AZUL} shapeRendering="auto">
      A
    </text>
    <text x="1" y="15" fontSize="7" fontWeight="bold" fontFamily="Arial, sans-serif" fill={AZUL} shapeRendering="auto">
      Z
    </text>
    <rect x="11" y="2" width="1" height="10" fill={AZUL} />
    <path d="M8.5 10h6L11.5 14z" fill={AZUL} />
  </Svg>
)

/** Ventana con barra de título azul: base de Buscar, Modificar y Eliminar. */
function Ventana() {
  return (
    <>
      <rect x="1.5" y="2.5" width="12" height="10" fill="#fff" stroke="#000" />
      <rect x="2" y="3" width="11" height="2" fill="#0000c0" />
      <rect x="3" y="7" width="7" height="1" fill="#808080" />
      <rect x="3" y="9" width="5" height="1" fill="#808080" />
    </>
  )
}

export const GwBuscar = (p: P) => (
  <Svg {...p}>
    <Ventana />
    <circle cx="8.5" cy="12.5" r="2.3" fill="#000" />
    <circle cx="13" cy="12.5" r="2.3" fill="#000" />
    <rect x="8" y="8" width="2" height="3" fill="#000" />
    <rect x="12" y="8" width="2" height="3" fill="#000" />
    <rect x="10" y="10" width="2" height="2" fill="#000" />
  </Svg>
)

export const GwImprimir = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 1.5h7v5h-7z" fill="#fff" stroke="#000" />
    <path d="M1.5 6.5h13v6h-13z" fill="#c0c0c0" stroke="#000" />
    <rect x="2" y="7" width="12" height="1" fill="#fff" />
    <rect x="11" y="9" width="2" height="1" fill="#008000" />
    <path d="M3.5 10.5h9v4h-9z" fill="#fff" stroke="#000" />
    <rect x="5" y="12" width="6" height="1" fill="#000" />
  </Svg>
)

export const GwNuevo = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 1.5h6l3 3v10h-9z" fill="#fff" stroke="#000" />
    <path d="M9.5 1.5v3h3" fill="none" stroke="#000" />
  </Svg>
)

export const GwModificar = (p: P) => (
  <Svg {...p}>
    <Ventana />
    <path d="M14.5 6.5l1.2 1.2-6.5 6.5-1.9.7.7-1.9z" fill="#ffd400" stroke="#000" strokeWidth="0.8" shapeRendering="auto" />
    <path d="M14.5 6.5l1.2 1.2-1 1-1.2-1.2z" fill="#e05050" shapeRendering="auto" />
  </Svg>
)

export const GwEliminar = (p: P) => (
  <Svg {...p}>
    <Ventana />
    <path d="M9 9l5 5M14 9l-5 5" stroke="#d00000" strokeWidth="2" shapeRendering="auto" />
  </Svg>
)

export const GwSalir = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 1.5h7v13h-7z" fill="#fff" stroke="#000" />
    <path d="M4 2l5 2v11l-5-1z" fill="#6b7d1c" stroke="#3a4410" strokeWidth="0.8" shapeRendering="auto" />
    <rect x="7" y="8" width="1" height="2" fill="#ffd400" />
    <path d="M11 11h3M12.5 9.5L14.5 11l-2 1.5" stroke="#0000c0" strokeWidth="1.4" fill="none" shapeRendering="auto" />
  </Svg>
)

export const GwAceptar = (p: P) => (
  <Svg {...p}>
    <path d="M2 8.5l4 4 8-9" stroke="#008000" strokeWidth="2.6" fill="none" shapeRendering="auto" />
  </Svg>
)

export const GwCancelar = (p: P) => (
  <Svg {...p}>
    <path d="M3 3l10 10M13 3L3 13" stroke="#d00000" strokeWidth="2.6" shapeRendering="auto" />
  </Svg>
)
