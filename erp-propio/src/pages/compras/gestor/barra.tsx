import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDownAZ, Binoculars, ChevronFirst, ChevronLast, DoorOpen, Play, Printer } from 'lucide-react'
import { BarButton } from '../../ventas/gestores/comun'
import type { Orden } from '../../ventas/gestores/rejilla'

export interface GridCtl {
  sel: number
  set: (i: number) => void
  n: number
  ord: Orden | null
  setOrd: (o: Orden) => void
  first: string
}

/** Barra inferior de cada pestaña del gestor: navegación por la rejilla + botones propios + Salir. */
export function BarraGestor({
  grid,
  onLocalizar,
  children,
  derecha,
  ancho = 'w-[96px]',
}: {
  grid: GridCtl
  onLocalizar: () => void
  children?: ReactNode
  derecha?: ReactNode
  ancho?: string
}) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-none items-center gap-0">
      <BarButton title="Primero" className={ancho} disabled={!grid.n} onClick={() => grid.set(0)}>
        <ChevronFirst size={18} strokeWidth={3} />
      </BarButton>
      <BarButton title="Anterior" className={ancho} disabled={!grid.n} onClick={() => grid.set(Math.max(grid.sel - 1, 0))}>
        <Play size={12} className="rotate-180" fill="currentColor" />
      </BarButton>
      <BarButton title="Siguiente" className={ancho} disabled={!grid.n} onClick={() => grid.set(Math.min(grid.sel + 1, grid.n - 1))}>
        <Play size={12} fill="currentColor" />
      </BarButton>
      <BarButton title="Último" className={ancho} disabled={!grid.n} onClick={() => grid.set(grid.n - 1)}>
        <ChevronLast size={18} strokeWidth={3} />
      </BarButton>
      <BarButton title="Buscar (Localizar registros)" className={ancho} disabled={!grid.n} onClick={onLocalizar}>
        <Binoculars size={17} />
      </BarButton>
      <BarButton
        title="Ordenar"
        className={ancho}
        disabled={!grid.n}
        onClick={() => grid.setOrd(grid.ord ? { ...grid.ord, asc: !grid.ord.asc } : { key: grid.first, asc: true })}
      >
        <ArrowDownAZ size={17} />
      </BarButton>
      <BarButton title="Imprimir" className={ancho} onClick={() => window.print()}>
        <Printer size={17} />
      </BarButton>
      {children}
      <span className="ml-auto" />
      {derecha}
      <BarButton title="Salir" className={ancho} onClick={() => navigate('/')}>
        <DoorOpen size={18} />
      </BarButton>
    </div>
  )
}

/** Busca `texto` en cualquier columna a partir de la fila siguiente a `sel`; -1 si no aparece. */
export function buscarFila<T>(rows: T[], cols: { value: (r: T) => string | number | null }[], sel: number, texto: string) {
  const t = texto.trim().toLowerCase()
  if (!t || !rows.length) return -1
  for (let k = 1; k <= rows.length; k++) {
    const i = (sel + k) % rows.length
    if (cols.some((c) => String(c.value(rows[i]) ?? '').toLowerCase().includes(t))) return i
  }
  return -1
}

/** Contador azul de la barra («Nº Mov.: 45»). */
export function Contador({ texto }: { texto: string }) {
  return <span className="mx-3 whitespace-nowrap text-[18px] text-[#1a4fd0]">{texto}</span>
}
