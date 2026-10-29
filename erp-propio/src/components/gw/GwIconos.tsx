import type { SVGProps } from 'react'

/**
 * Iconos de la botonera inferior de GeminisWin, a color, como los de Windows clásico: flechas
 * azul marino, ordenar A-Z, rejilla con prismáticos, impresora, hoja en blanco, rejilla con
 * lápiz, rejilla con aspa y puerta de salida. Copiados de la captura de la ficha de Artículos.
 * Dibujados en una cuadrícula de 24 px con coordenadas enteras (sin difuminar los bordes); en un
 * botón bajo (rejillas) se encogen para caber (.gw-icono, index.css). En un botón desactivado, en gris.
 */
type P = SVGProps<SVGSVGElement> & { size?: number }

const AZUL = '#000080'

function Svg({ size = 24, children, ...p }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" shapeRendering="crispEdges" aria-hidden className="gw-icono flex-none" {...p}>
      {children}
    </svg>
  )
}

export const GwPrimero = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="5" width="3" height="14" fill={AZUL} />
    <path d="M19 5v14l-9-7z" fill={AZUL} shapeRendering="geometricPrecision" />
  </Svg>
)

export const GwAnterior = (p: P) => (
  <Svg {...p}>
    <path d="M15 5v14l-8-7z" fill={AZUL} shapeRendering="geometricPrecision" />
  </Svg>
)

export const GwSiguiente = (p: P) => (
  <Svg {...p}>
    <path d="M9 5v14l8-7z" fill={AZUL} shapeRendering="geometricPrecision" />
  </Svg>
)

export const GwUltimo = (p: P) => (
  <Svg {...p}>
    <path d="M5 5v14l9-7z" fill={AZUL} shapeRendering="geometricPrecision" />
    <rect x="16" y="5" width="3" height="14" fill={AZUL} />
  </Svg>
)

export const GwOrdenar = (p: P) => (
  <Svg {...p}>
    {/* A */}
    <path d="M3 11L6.5 2h1L11 11h-2.2l-.8-2.2H6L5.2 11zM6.6 7h1.8L7.5 4.4z" fill={AZUL} shapeRendering="geometricPrecision" />
    {/* Z */}
    <path d="M3 13h8v1.8L5.6 20.2H11V22H3v-1.8l5.4-5.4H3z" fill={AZUL} />
    {/* flecha hacia abajo */}
    <rect x="16" y="3" width="2" height="13" fill={AZUL} />
    <path d="M13 15h8l-4 6z" fill={AZUL} shapeRendering="geometricPrecision" />
  </Svg>
)

/** Rejilla de GeminisWin: cabecera azul con puntos blancos y filas punteadas. Base de Buscar, Modificar y Eliminar. */
function Rejilla() {
  return (
    <>
      <rect x="1" y="3" width="17" height="14" fill="#fff" />
      <rect x="1" y="3" width="17" height="4" fill="#0000ff" />
      {[3, 6, 9, 12, 15].map((x) => (
        <rect key={x} x={x} y="4" width="1" height="2" fill="#fff" />
      ))}
      {[9, 12, 15].flatMap((y) => [2, 4, 6, 8, 10, 12, 14, 16].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#808080" />))}
      <path d="M1.5 3.5h16v13h-16z" fill="none" stroke="#000" />
    </>
  )
}

export const GwBuscar = (p: P) => (
  <Svg {...p}>
    <Rejilla />
    {/* prismáticos */}
    <rect x="11" y="11" width="4" height="5" fill="#000" />
    <rect x="18" y="11" width="4" height="5" fill="#000" />
    <rect x="14" y="13" width="5" height="3" fill="#000" />
    <rect x="10" y="16" width="6" height="6" fill="#000" />
    <rect x="17" y="16" width="6" height="6" fill="#000" />
    <rect x="11" y="17" width="2" height="2" fill="#6a6a6a" />
    <rect x="18" y="17" width="2" height="2" fill="#6a6a6a" />
  </Svg>
)

export const GwImprimir = (p: P) => (
  <Svg {...p}>
    {/* papel de entrada */}
    <rect x="6" y="3" width="12" height="6" fill="#fff" />
    <path d="M6.5 3.5h11v6h-11z" fill="none" stroke="#000" />
    {/* cuerpo */}
    <rect x="2" y="9" width="20" height="9" fill="#404040" />
    <rect x="3" y="10" width="18" height="3" fill="#808080" />
    <rect x="17" y="11" width="2" height="1" fill="#00e000" />
    <rect x="2" y="18" width="20" height="2" fill="#202020" />
    {/* bandeja de salida */}
    <rect x="5" y="15" width="14" height="2" fill="#c0c0c0" />
  </Svg>
)

export const GwNuevo = (p: P) => (
  <Svg {...p}>
    <path d="M5 2h10l5 5v15H5z" fill="#fff" />
    <path d="M5.5 2.5h9l5 5v14h-14z" fill="none" stroke="#000" />
    <path d="M14.5 2.5v5h5" fill="none" stroke="#000" />
  </Svg>
)

export const GwModificar = (p: P) => (
  <Svg {...p}>
    <Rejilla />
    {/* lápiz en diagonal */}
    <path d="M20 8l3 3-9 9-4 1 1-4z" fill="#ffd800" stroke="#000" strokeWidth="1" shapeRendering="geometricPrecision" />
    <path d="M20 8l3 3-2 2-3-3z" fill="#e04040" stroke="#000" strokeWidth="1" shapeRendering="geometricPrecision" />
    <path d="M11 17l-1 4 4-1z" fill="#000" shapeRendering="geometricPrecision" />
  </Svg>
)

export const GwEliminar = (p: P) => (
  <Svg {...p}>
    <Rejilla />
    <path d="M12 12l9 9M21 12l-9 9" stroke="#e00000" strokeWidth="3" shapeRendering="geometricPrecision" />
  </Svg>
)

export const GwSalir = (p: P) => (
  <Svg {...p}>
    {/* marco de la puerta */}
    <rect x="5" y="2" width="11" height="20" fill="#000" />
    <rect x="6" y="3" width="9" height="18" fill="#fff" />
    {/* hoja abierta */}
    <path d="M6 3l7 3v17l-7-2z" fill="#808000" stroke="#000" strokeWidth="1" shapeRendering="geometricPrecision" />
    <rect x="11" y="13" width="1" height="2" fill="#ffff00" />
    {/* flecha de salida */}
    <rect x="15" y="16" width="5" height="2" fill="#0000ff" />
    <path d="M19 13l4 4-4 4z" fill="#0000ff" shapeRendering="geometricPrecision" />
  </Svg>
)

export const GwAceptar = (p: P) => (
  <Svg {...p}>
    <path d="M3 12l6 6L21 5" stroke="#008000" strokeWidth="3.5" fill="none" shapeRendering="geometricPrecision" />
  </Svg>
)

export const GwCancelar = (p: P) => (
  <Svg {...p}>
    <path d="M5 5l14 14M19 5L5 19" stroke="#e00000" strokeWidth="3.5" shapeRendering="geometricPrecision" />
  </Svg>
)
