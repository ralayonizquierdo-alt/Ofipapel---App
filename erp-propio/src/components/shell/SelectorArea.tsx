// Ventana de entrada con los 4 botones de área (Luis, 01/11/2026): Gestión, Contabilidad, Web y
// AVATAR (todo el ERP, con el verde corporativo de Ofipapel #237523). Grandes, con icono y un color
// muy claro cada uno. Teclas 1 a 4.

import { useEffect } from 'react'
import { BookOpenText, Globe, LayoutGrid, Store, type LucideIcon } from 'lucide-react'
import type { Area } from '../../lib/areaTrabajo'

export const AREAS: { id: Area; titulo: string; texto: string; icono: LucideIcon; fondo: string; borde: string; color: string }[] = [
  { id: 'gestion', titulo: 'Gestión', texto: 'Ventas, compras, almacén, caja y clientes', icono: Store, fondo: '#fff2e6', borde: '#f2bf8f', color: '#c8641a' },
  {
    id: 'contabilidad',
    titulo: 'Contabilidad',
    texto: 'Asientos, balances, IGIC y bancos',
    icono: BookOpenText,
    fondo: '#e9f0fb',
    borde: '#a9c1ea',
    color: '#1d3a8a',
  },
  { id: 'web', titulo: 'Web', texto: 'Tienda online, pedidos y clientes web', icono: Globe, fondo: '#f3ecfa', borde: '#cdb4e8', color: '#7b3fb0' },
  { id: 'avatar', titulo: 'Avatar', texto: 'Todo el ERP: todas las áreas juntas', icono: LayoutGrid, fondo: '#ecf8ea', borde: '#9fd69a', color: '#237523' },
]

export const tituloArea = (a: Area) => AREAS.find((x) => x.id === a)?.titulo ?? ''

export function SelectorArea({
  onElegir,
  disponibles,
  marcada,
  mensaje,
}: {
  onElegir: (a: Area) => void
  /** Si se pasa, las áreas sin permiso salen apagadas. */
  disponibles?: Partial<Record<Area, boolean>>
  marcada?: Area | null
  mensaje?: string | null
}) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (n >= 1 && n <= 4 && !e.ctrlKey && !e.altKey && !(e.target instanceof HTMLInputElement)) {
        const a = AREAS[n - 1]
        if (!disponibles || disponibles[a.id] !== false) onElegir(a.id)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onElegir, disponibles])

  return (
    <div className="flex flex-col items-center gap-3">
      {mensaje && (
        <div className="max-w-[560px] border border-[#e0b400] bg-[#fff8e1] px-3 py-1.5 text-center text-[13px] font-bold text-[#8a5a00]">{mensaje}</div>
      )}
      <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
        {AREAS.map((a, i) => {
          const apagada = disponibles ? disponibles[a.id] === false : false
          const Icono = a.icono
          return (
            <button
              key={a.id}
              type="button"
              disabled={apagada}
              onClick={() => onElegir(a.id)}
              title={apagada ? 'Tu grupo de acceso no tiene esta área' : `${a.titulo} (tecla ${i + 1})`}
              className={`group relative flex h-[150px] w-[250px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 shadow-sm transition ${
                apagada ? 'cursor-not-allowed opacity-40 grayscale' : 'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2'
              } ${marcada === a.id && !apagada ? 'ring-2 ring-offset-2' : ''}`}
              style={{ background: a.fondo, borderColor: a.borde, color: a.color, ['--tw-ring-color' as string]: a.borde }}
            >
              <span className="absolute left-2 top-1.5 text-[11px] opacity-50">{i + 1}</span>
              {a.id === 'avatar' ? (
                // AVATAR: el anagrama de Ofipapel (OFI con el trébol) encima del nombre.
                <img src={`${import.meta.env.BASE_URL}marca/icono-256.png`} alt="" width={54} height={54} className="select-none" draggable={false} />
              ) : (
                <Icono size={46} strokeWidth={1.6} fill={a.color} fillOpacity={0.12} aria-hidden />
              )}
              <span className={`text-[20px] font-bold`}>{a.titulo}</span>
              <span className="px-3 text-center text-[12px] text-[#555]">{a.texto}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
