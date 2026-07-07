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

const VEHICLE_COLORS = ['#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316']

/** Silueta de furgón o turismo generada localmente, ya que no partimos de fotos reales de la flota. */
export function vehiclePlaceholderImageFor(tipo: 'Furgón de reparto' | 'Coche comercial', seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  const color = VEHICLE_COLORS[Math.abs(hash) % VEHICLE_COLORS.length]
  const body =
    tipo === 'Furgón de reparto'
      ? '<path d="M15 95 V55 a6 6 0 0 1 6-6 h95 a10 10 0 0 1 10 10 v10 h20 l16 18 v8 h8 v0" fill="none"/>' +
        '<rect x="18" y="45" width="150" height="55" rx="8" fill="white" opacity="0.92"/>' +
        '<rect x="128" y="60" width="34" height="30" rx="4" fill="' + color + '" opacity="0.35"/>'
      : '<path d="M20 95 q0-20 18-24 l14-18 q6-7 16-7 h34 q10 0 16 7 l14 18 q18 4 18 24" fill="white" opacity="0.92"/>' +
        '<rect x="55" y="52" width="60" height="20" rx="6" fill="' + color + '" opacity="0.35"/>'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120">
    <rect width="180" height="120" rx="14" fill="${color}"/>
    <rect x="0" y="98" width="180" height="22" fill="#00000022"/>
    ${body}
    <circle cx="50" cy="96" r="10" fill="#1e293b"/>
    <circle cx="140" cy="96" r="10" fill="#1e293b"/>
    <circle cx="50" cy="96" r="4" fill="#94a3b8"/>
    <circle cx="140" cy="96" r="4" fill="#94a3b8"/>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
