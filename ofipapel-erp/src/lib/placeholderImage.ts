/** Imágenes ficticias generadas localmente (SVG), sin depender de fotos reales ni de red. */
const CATEGORY_COLORS: Record<string, string> = {
  'Papelería': '#60a5fa',
  'Escritura': '#f472b6',
  'Archivo y Clasificación': '#fb923c',
  'Informática y Consumibles': '#818cf8',
  'Mobiliario de oficina': '#a78bfa',
  'Embalaje y Manipulado': '#facc15',
  'Impresión y Tóner': '#38bdf8',
  'Material Escolar': '#4ade80',
  'Limpieza e Higiene': '#2dd4bf',
  'Regalo y Detalle': '#f87171',
}

function initialsFor(categoria: string): string {
  return categoria
    .split(' ')
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

export function placeholderImageFor(categoria: string): string {
  const color = CATEGORY_COLORS[categoria] ?? '#94a3b8'
  const initials = initialsFor(categoria)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">
    <rect width="160" height="160" rx="16" fill="${color}"/>
    <text x="80" y="96" font-family="system-ui, sans-serif" font-size="52" font-weight="600" fill="white" text-anchor="middle">${initials}</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
