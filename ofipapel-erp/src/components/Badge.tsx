const PALETTE = [
  'bg-slate-100 text-slate-700',
  'bg-emerald-100 text-emerald-700',
  'bg-orange-100 text-orange-700',
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-red-100 text-red-700',
]

const OVERRIDES: Record<string, string> = {
  Facturado: 'bg-emerald-100 text-emerald-700',
  Albarán: 'bg-blue-100 text-blue-700',
  Pedido: 'bg-orange-100 text-orange-700',
  Presupuesto: 'bg-slate-100 text-slate-700',
  Recibido: 'bg-emerald-100 text-emerald-700',
  Pendiente: 'bg-orange-100 text-orange-700',
  'Bajo mínimo': 'bg-red-100 text-red-700',
  OK: 'bg-emerald-100 text-emerald-700',
  'En ruta': 'bg-emerald-100 text-emerald-700',
  'En base': 'bg-slate-100 text-slate-700',
  Mantenimiento: 'bg-orange-100 text-orange-700',
  Taller: 'bg-red-100 text-red-700',
  Mayorista: 'bg-blue-100 text-blue-700',
  Minorista: 'bg-purple-100 text-purple-700',
}

function hash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

export default function Badge({ label }: { label: string }) {
  const classes = OVERRIDES[label] ?? PALETTE[hash(label) % PALETTE.length]
  return <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${classes}`}>{label}</span>
}
