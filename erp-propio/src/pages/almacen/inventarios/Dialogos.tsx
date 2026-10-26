import { useEffect, useRef, useState, type ReactNode } from 'react'
import { GwWindow, formatGw } from '../../../components/gw'
import type { Linea, Punto } from './logica'

const inp = 'h-[26px] border border-[var(--gw-border)] bg-white px-1 text-[15px] outline-none focus:border-[var(--gw-select)] disabled:text-black'

function Modal({ titulo, onClose, ancho, children }: { titulo: string; onClose: () => void; ancho: number; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-20" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title={titulo} onClose={onClose} className="max-w-[95vw]">
        <div style={{ width: ancho }} className="max-w-full">
          {children}
        </div>
      </GwWindow>
    </div>
  )
}

const parseNum = (s: string) => {
  const t = s.trim().replace(/\./g, '').replace(',', '.')
  if (t === '') return null
  const v = Number(t)
  return Number.isFinite(v) ? v : NaN
}

/** Alta o modificación de una línea desde la mini barra de la rejilla. */
export function DialogoLinea({
  linea,
  onBuscar,
  codigoElegido,
  onAceptar,
  onClose,
}: {
  linea: Linea | null
  onBuscar: () => void
  codigoElegido: string | null
  onAceptar: (codigo: string, cantidad: number | null) => Promise<string | null>
  onClose: () => void
}) {
  const [codigo, setCodigo] = useState(linea?.articulo_codigo ?? '')
  const [cantidad, setCantidad] = useState(linea?.cantidad_contada != null ? String(linea.cantidad_contada).replace('.', ',') : '')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    if (codigoElegido) setCodigo(codigoElegido)
  }, [codigoElegido])

  async function aceptar() {
    const c = parseNum(cantidad)
    if (Number.isNaN(c)) return setError('Cantidad no válida.')
    setOcupado(true)
    const e = await onAceptar(codigo, c)
    setOcupado(false)
    if (e) setError(e)
  }

  return (
    <Modal titulo={linea ? 'Modificar línea' : 'Nueva línea'} onClose={onClose} ancho={460}>
      <div className="flex flex-col gap-1.5 text-[15px]">
        <label className="flex items-center gap-2">
          <span className="w-[110px]">Código</span>
          <input className={`${inp} min-w-0 flex-1`} autoFocus={!linea} disabled={!!linea} value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          <button type="button" className="gw-btn gw-lookup" disabled={!!linea} onClick={onBuscar} title="Buscar artículo">
            ···
          </button>
        </label>
        {linea && <div className="pl-[118px] text-[13px] text-[#555]">{linea.descripcion}</div>}
        <label className="flex items-center gap-2">
          <span className="w-[110px]">Inventariado</span>
          <input
            className={`${inp} w-[140px] text-right`}
            autoFocus={!!linea}
            value={cantidad}
            placeholder="pendiente"
            onChange={(e) => setCantidad(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && aceptar()}
          />
          <span className="text-[12px] text-[#555]">vacío = 0-Pendiente</span>
        </label>
        {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-0.5 text-[13px] text-[#c42b1c]">{error}</div>}
        <div className="flex justify-end gap-1.5">
          <button type="button" className="gw-btn" disabled={ocupado || !codigo.trim()} onClick={aceptar}>
            Aceptar
          </button>
          <button type="button" className="gw-btn" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  )
}

const FILTROS = ['No filtrar; Mostrar todos los artículos', 'Mostrar solo los artículos Pendientes', 'Mostrar solo los artículos Inventariados']

/**
 * «Inventariar Artículos»: tomas en bucle (código o código de barras + cantidad).
 * Si el artículo no está en el inventario se añade como línea nueva.
 */
export function DialogoInventariar({
  lineas,
  porBarras,
  filtroInicial,
  onToma,
  onClose,
}: {
  lineas: Linea[]
  porBarras: boolean
  filtroInicial: number
  onToma: (codigo: string, cantidad: number) => Promise<string>
  onClose: () => void
}) {
  const [codigo, setCodigo] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [filtro, setFiltro] = useState(filtroInicial)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const refCodigo = useRef<HTMLInputElement>(null)
  const refCantidad = useRef<HTMLInputElement>(null)

  const visibles = lineas.filter((l) => (filtro === 1 ? l.estado === 0 : filtro === 2 ? l.estado === 1 : true))

  async function tomar() {
    const c = parseNum(cantidad)
    if (c == null || Number.isNaN(c)) return setMsg({ ok: false, texto: 'Cantidad no válida.' })
    setOcupado(true)
    try {
      setMsg({ ok: true, texto: await onToma(codigo, c) })
      setCodigo('')
      setCantidad('1')
      refCodigo.current?.focus()
    } catch (e) {
      setMsg({ ok: false, texto: (e as Error).message })
    }
    setOcupado(false)
  }

  return (
    <Modal titulo="Inventariar Artículos" onClose={onClose} ancho={720}>
      <div className="flex flex-col gap-1.5 text-[15px]">
        <div className="flex items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col">
            <span>{porBarras ? 'Código o código de barras' : 'Código'}</span>
            <input
              ref={refCodigo}
              autoFocus
              className={inp}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && codigo.trim() && refCantidad.current?.select()}
            />
          </label>
          <label className="flex w-[130px] flex-col">
            <span>Cantidad</span>
            <input
              ref={refCantidad}
              className={`${inp} text-right`}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && tomar()}
            />
          </label>
          <button type="button" className="gw-btn h-[26px]!" disabled={ocupado || !codigo.trim()} onClick={tomar}>
            Inventariar
          </button>
        </div>
        <label className="flex items-center gap-2">
          <span>Filtrarlos según el Estado</span>
          <select className={`${inp} flex-1`} value={filtro} onChange={(e) => setFiltro(Number(e.target.value))}>
            {FILTROS.map((f, i) => (
              <option key={i} value={i}>
                {f}
              </option>
            ))}
          </select>
        </label>
        {msg && (
          <div className={`border px-2 py-0.5 text-[13px] ${msg.ok ? 'border-[var(--gw-border)] bg-white text-[#1a4fd0]' : 'border-[#c42b1c] bg-[#fde7e9] text-[#c42b1c]'}`}>
            {msg.texto}
          </div>
        )}
        <div className="h-[260px] overflow-y-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid">
            <thead className="sticky top-0">
              <tr>
                <th style={{ width: 110 }}>Código</th>
                <th>Descripción</th>
                <th style={{ width: 110 }}>Estado</th>
                <th style={{ width: 100 }}>Inventariado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((l) => (
                <tr key={l.numero_linea}>
                  <td>{l.articulo_codigo}</td>
                  <td className="truncate">{l.descripcion}</td>
                  <td>{l.estado === 1 ? '1-Inventariado' : '0-Pendiente'}</td>
                  <td className="text-right">{l.cantidad_contada == null ? '' : formatGw(l.cantidad_contada, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end">
          <button type="button" className="gw-btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** Localizar una línea del inventario por código o descripción. */
export function DialogoBuscarLinea({ onBuscar, onClose }: { onBuscar: (texto: string) => boolean; onClose: () => void }) {
  const [texto, setTexto] = useState('')
  const [noEsta, setNoEsta] = useState(false)
  const buscar = () => (onBuscar(texto) ? onClose() : setNoEsta(true))
  return (
    <Modal titulo="Buscar en el inventario" onClose={onClose} ancho={420}>
      <div className="flex flex-col gap-1.5 text-[15px]">
        <span>Código o parte de la descripción</span>
        <input autoFocus className={inp} value={texto} onChange={(e) => (setTexto(e.target.value), setNoEsta(false))} onKeyDown={(e) => e.key === 'Enter' && buscar()} />
        {noEsta && <span className="text-[13px] text-[#c42b1c]">No está en este inventario.</span>}
        <div className="flex justify-end gap-1.5">
          <button type="button" className="gw-btn" disabled={!texto.trim()} onClick={buscar}>
            Buscar
          </button>
          <button type="button" className="gw-btn" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  )
}

const fechaHora = (v: string | null) => (v ? new Date(v).toLocaleString('es-ES') : '')

/** «Ver Puntos de Restauración»: los puntos creados por este inventario y el botón de deshacer. */
export function DialogoPuntos({
  puntos,
  puedeDeshacer,
  onDeshacer,
  onClose,
}: {
  puntos: Punto[]
  puedeDeshacer: boolean
  onDeshacer: () => void
  onClose: () => void
}) {
  return (
    <Modal titulo="Puntos de Restauración" onClose={onClose} ancho={640}>
      <div className="flex flex-col gap-1.5 text-[15px]">
        <div className="h-[220px] overflow-y-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid">
            <thead className="sticky top-0">
              <tr>
                <th style={{ width: 60 }}>Tienda</th>
                <th style={{ width: 70 }}>Número</th>
                <th style={{ width: 100 }}>Fecha</th>
                <th>Concepto</th>
                <th style={{ width: 70 }}>Líneas</th>
                <th style={{ width: 150 }}>Restaurado</th>
              </tr>
            </thead>
            <tbody>
              {puntos.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-[#6d6d6d]">
                    Este inventario no tiene puntos de restauración.
                  </td>
                </tr>
              )}
              {puntos.map((p) => (
                <tr key={`${p.tienda_terminal_codigo}-${p.numero}`}>
                  <td>{p.tienda_terminal_codigo}</td>
                  <td className="text-right">{p.numero}</td>
                  <td>{p.fecha.split('-').reverse().join('/')}</td>
                  <td className="truncate">{p.concepto}</td>
                  <td className="text-right">{p.lineas}</td>
                  <td>{fechaHora(p.fecha_hora_restaurado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-1.5">
          <button type="button" className="gw-btn" disabled={!puedeDeshacer} onClick={onDeshacer} title="Restaura el stock que había antes de actualizar el inventario">
            Deshacer Inventario
          </button>
          <button type="button" className="gw-btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  )
}
