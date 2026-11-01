// Ventana de entrada con los botones de área (Luis, 01/11/2026): Contabilidad, Gestión y Web, grandes,
// con icono y un color muy claro cada uno. Teclas 1 a 3. El programa en sí es el icono OFI (Avatar).

import { useEffect } from 'react'
import { BookOpenText, Globe, LayoutGrid, Store, type LucideIcon } from 'lucide-react'
import type { Area } from '../../lib/areaTrabajo'

export const AREAS: { id: Area; titulo: string; texto: string; icono: LucideIcon; fondo: string; borde: string; color: string }[] = [
  {
    id: 'contabilidad',
    titulo: 'Contabilidad',
    texto: 'Asientos, balances, IGIC y bancos',
    icono: BookOpenText,
    fondo: '#e9f0fb',
    borde: '#a9c1ea',
    color: '#1d3a8a',
  },
  { id: 'gestion', titulo: 'Gestión', texto: 'Ventas, compras, almacén, caja y clientes', icono: Store, fondo: '#fff2e6', borde: '#f2bf8f', color: '#c8641a' },
  { id: 'web', titulo: 'Web', texto: 'Tienda online, pedidos y clientes web', icono: Globe, fondo: '#f3ecfa', borde: '#cdb4e8', color: '#7b3fb0' },
  // Gestión · Avatar: el ERP entero (todas las áreas), con el anagrama OFI y el verde de Ofipapel.
  {
    id: 'avatar',
    titulo: 'Gestión',
    texto: 'Todo el ERP',
    icono: LayoutGrid,
    fondo: '#ecf8ea',
    borde: '#9fd69a',
    color: '#237523',
  },
]

/** Botones de la entrada (Luis: «Contabilidad - Gestión - Web»; debajo de Gestión, Avatar). Gestión
 *  abre Avatar, el ERP entero. El área «gestion» sin contabilidad queda sin botón. */
const EN_ENTRADA: Area[] = ['contabilidad', 'avatar', 'web']

export const tituloArea = (a: Area) => (a === 'avatar' ? 'Gestión · Avatar' : (AREAS.find((x) => x.id === a)?.titulo ?? ''))

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
      if (n >= 1 && n <= 3 && !e.ctrlKey && !e.altKey && !(e.target instanceof HTMLInputElement)) {
        const a = EN_ENTRADA.map((id) => AREAS.find((x) => x.id === id)!)[n - 1]
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
      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        {EN_ENTRADA.map((id) => AREAS.find((x) => x.id === id)!).map((a, i) => {
          const apagada = disponibles ? disponibles[a.id] === false : false
          const Icono = a.icono
          return (
            <button
              key={a.id}
              type="button"
              disabled={apagada}
              onClick={() => onElegir(a.id)}
              title={apagada ? 'Tu grupo de acceso no tiene esta área' : `${a.titulo} (tecla ${i + 1})`}
              className={`group relative flex h-[165px] w-[250px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 shadow-sm transition ${
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
              <span className="text-[20px] font-bold leading-tight">{a.titulo}</span>
              {a.id === 'avatar' && <span className="-mt-1 text-[15px] font-bold">Avatar</span>}
              <span className="px-3 text-center text-[12px] text-[#555]">{a.texto}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
