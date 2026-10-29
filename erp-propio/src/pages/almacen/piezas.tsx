import { useEffect, useRef, useState, type ReactNode } from 'react'
import { conTecla, useTeclasFicha, type AccionFicha } from '../../components/gw/teclasFicha'
import { useNavigate } from 'react-router-dom'
import { FolderOpen } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwInput, GwRadio, formatGw } from '../../components/gw'
import { FilasVacias } from '../../components/gw/GwGridParts'
import type { ModoFicha } from './useFichaMaestro'
import { GwAceptar, GwAnterior, GwBuscar, GwCancelar, GwEliminar, GwImprimir, GwModificar, GwNuevo, GwOrdenar, GwPrimero, GwSalir, GwSiguiente, GwUltimo } from '../../components/gw/GwIconos'

/**
 * Imagen con «Ver Imagen a … Tamaño real / Tamaño ajustado / Rellenar marco» y la ruta
 * debajo con su botón de carpeta, como en Familias y Marcas de GeminisWin.
 */
export function ImagenConModo({
  url,
  modo,
  alto,
  disabled,
  onUrl,
  onModo,
  nombre,
}: {
  url: string | null
  modo: number
  alto: number
  disabled: boolean
  onUrl: (v: string | null) => void
  onModo: (v: number) => void
  nombre: string
}) {
  const [rota, setRota] = useState(false)
  useEffect(() => setRota(false), [url])
  const limpia = url?.trim() || null
  const ajuste = modo === 0 ? 'object-none' : modo === 2 ? 'object-fill' : 'object-contain'
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[minmax(0,1fr)_200px] gap-1.5">
        <div className="relative overflow-hidden border border-[var(--gw-border)] bg-[var(--gw-face)]" style={{ height: alto }} title="IMAGEN">
          {limpia && !rota ? (
            <img src={limpia} alt="" className={`h-full w-full ${ajuste}`} onError={() => setRota(true)} />
          ) : (
            <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100" aria-label="Sin imagen">
              <line x1="0" y1="0" x2="100" y2="100" stroke="#9a9a9a" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
              <line x1="100" y1="0" x2="0" y2="100" stroke="#9a9a9a" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
        </div>
        <div className="flex flex-col">
          <span className="gw-label">Ver Imagen a ...</span>
          <div className="flex flex-col gap-0.5 border border-[var(--gw-border-light)] px-1.5 py-1">
            {['Tamaño real', 'Tamaño ajustado', 'Rellenar marco'].map((l, i) => (
              <GwRadio key={l} name={`${nombre}-imagen-modo`} label={l} checked={modo === i} disabled={disabled} onChange={() => onModo(i)} />
            ))}
          </div>
        </div>
      </div>
      <div className="flex">
        <GwInput value={url ?? ''} disabled={disabled} title="Ruta o dirección de la imagen" onChange={(e) => onUrl(e.target.value || null)} />
        <button
          type="button"
          className="gw-btn flex-none px-0"
          style={{ width: 40, height: 22 }}
          disabled={disabled}
          title="Elegir imagen (dirección de la imagen)"
          onClick={() => {
            const v = prompt('Dirección (URL) de la imagen', url ?? '')
            if (v !== null) onUrl(v.trim() || null)
          }}
        >
          <FolderOpen size={14} className="text-[#b8860b]" />
        </button>
      </div>
    </div>
  )
}

/**
 * Barra inferior de las fichas pequeñas de GeminisWin (Plantillas de tarifas, Marcas):
 * navegación en dos filas a la izquierda y botones grandes con texto (Imprimir, Agregar,
 * Editar, Eliminar, Cerrar). En alta o modificación, Editar y Eliminar pasan a Aceptar y
 * Cancelar.
 */
export function BarraCompacta({
  mode,
  canNavigate,
  saving,
  onFirst,
  onPrev,
  onNext,
  onLast,
  onSort,
  onSearch,
  onPrint,
  onNew,
  onEdit,
  onDelete,
  onSave,
  onCancel,
  onExit,
}: {
  mode: ModoFicha
  canNavigate: boolean
  saving?: boolean
  onFirst: () => void
  onPrev: () => void
  onNext: () => void
  onLast: () => void
  onSort: () => void
  onSearch: () => void
  onPrint: () => void
  onNew: () => void
  onEdit: () => void
  onDelete: () => void
  onSave: () => void
  onCancel: () => void
  onExit: () => void
}) {
  const consulta = mode === 'consulta'
  // Las mismas teclas que GwRecordBar (teclasFicha): F1 aceptar, Alt+Retroceso/Esc cancelar,
  // RePág/AvPág, Ctrl+Inicio/Fin, F2 editar, F3 agregar, F5 buscar, Esc cerrar.
  const raiz = useRef<HTMLDivElement>(null)
  useTeclasFicha({
    mode,
    canNavigate,
    saving,
    raiz,
    acciones: {
      primero: onFirst,
      anterior: onPrev,
      siguiente: onNext,
      ultimo: onLast,
      buscar: onSearch,
      nuevo: onNew,
      modificar: onEdit,
      guardar: onSave,
      cancelar: onCancel,
      salir: onExit,
    },
  })
  const t = (titulo: string, a: AccionFicha) => conTecla(titulo, a)
  const mini =
    'flex h-[22px] items-center justify-center border-r border-b border-[var(--gw-border-light)] text-[#1d3a8a] hover:bg-[#e5f1fb] disabled:text-[#9a9a9a] disabled:hover:bg-transparent'
  const Grande = ({ label, accion, onClick, disabled, children }: { label: string; accion?: AccionFicha; onClick: () => void; disabled?: boolean; children: ReactNode }) => (
    <button
      type="button"
      title={accion ? t(label, accion) : label}
      data-gw-estado={accion ? t(label, accion) : label}
      onClick={onClick}
      disabled={disabled}
      className="group flex h-[44px] w-[96px] flex-col items-center justify-center gap-0.5 gw-boton-barra text-[12px]"
    >
      {children}
      <span className="text-[#000] group-disabled:text-[#9a9a9a]">{label}</span>
    </button>
  )
  return (
    <div ref={raiz} className="mt-1.5 flex border border-[var(--gw-border)] bg-[var(--gw-face)] p-[2px]">
      <div className="grid w-[192px] grid-cols-3 border-t border-l border-[var(--gw-border-light)]">
        <button type="button" className={mini} title={t('Primero', 'primero')} data-gw-estado={t('Primero', 'primero')} disabled={!canNavigate} onClick={onFirst}>
          <GwPrimero />
        </button>
        <button type="button" className={mini} title={t('Siguiente', 'siguiente')} data-gw-estado={t('Siguiente', 'siguiente')} disabled={!canNavigate} onClick={onNext}>
          <GwSiguiente />
        </button>
        <button type="button" className={mini} title="Ordenar" disabled={!consulta} onClick={onSort}>
          <GwOrdenar />
        </button>
        <button type="button" className={mini} title={t('Anterior', 'anterior')} data-gw-estado={t('Anterior', 'anterior')} disabled={!canNavigate} onClick={onPrev}>
          <GwAnterior />
        </button>
        <button type="button" className={mini} title={t('Último', 'ultimo')} data-gw-estado={t('Último', 'ultimo')} disabled={!canNavigate} onClick={onLast}>
          <GwUltimo />
        </button>
        <button type="button" className={mini} title={t('Buscar', 'buscar')} data-gw-estado={t('Buscar', 'buscar')} disabled={!consulta} onClick={onSearch}>
          <GwBuscar />
        </button>
      </div>
      <Grande label="Imprimir" onClick={onPrint} disabled={!consulta}>
        <GwImprimir />
      </Grande>
      <Grande label="Agregar" accion="nuevo" onClick={onNew} disabled={!consulta}>
        <GwNuevo />
      </Grande>
      {consulta ? (
        <>
          <Grande label="Editar" accion="modificar" onClick={onEdit}>
            <GwModificar />
          </Grande>
          <Grande label="Eliminar" onClick={onDelete}>
            <GwEliminar />
          </Grande>
        </>
      ) : (
        <>
          <Grande label="Aceptar" accion="guardar" onClick={onSave} disabled={saving}>
            <GwAceptar />
          </Grande>
          <Grande label="Cancelar" accion="cancelar" onClick={onCancel} disabled={saving}>
            <GwCancelar />
          </Grande>
        </>
      )}
      <Grande label="Cerrar" accion="salir" onClick={onExit}>
        <GwSalir />
      </Grande>
    </div>
  )
}

/** Recuadro de imagen de GeminisWin: la imagen ajustada o un aspa si no hay ninguna. */
export function ImagenRecuadro({ url, alto = 170 }: { url: string | null; alto?: number }) {
  const [rota, setRota] = useState(false)
  useEffect(() => setRota(false), [url])
  const limpia = url?.trim() || null
  return (
    <div className="relative overflow-hidden border border-[var(--gw-border)] bg-[var(--gw-face)]" style={{ height: alto }}>
      {limpia && !rota ? (
        <img src={limpia} alt="" className="h-full w-full object-contain" onError={() => setRota(true)} />
      ) : (
        <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100" aria-label="Sin imagen">
          <line x1="0" y1="0" x2="100" y2="100" stroke="#9a9a9a" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          <line x1="100" y1="0" x2="0" y2="100" stroke="#9a9a9a" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  )
}

/** Línea bajo la barra de navegación: orden, nº de registro y modo, como en Artículos y Clientes. */
export function PieEstado({
  orden,
  idx,
  total,
  mode,
  que,
  porNombre = 'por descripción',
}: {
  orden: 'codigo' | 'nombre'
  idx: number
  total: number
  mode: ModoFicha
  que: string
  porNombre?: string
}) {
  return (
    <div className="text-[11px] text-[#444]">
      Orden: {orden === 'codigo' ? 'por código' : porNombre}
      {idx >= 0 ? ` · Registro ${idx + 1} de ${total}` : ''}
      {mode === 'alta' ? ` · Alta de ${que}` : mode === 'edicion' ? ' · Modificando' : ''}
    </div>
  )
}

interface ArticuloFila {
  codigo_interno: string
  descripcion: string
  pvp: number | null
  coste_neto: number | null
  activo: boolean
}

/** Rejilla de solo lectura con los artículos que usan un maestro (familia, marca, plantilla…). */
export function ArticulosDe({ columna, valor, titulo }: { columna: string; valor: string; titulo: string }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState<ArticuloFila[]>([])
  const [total, setTotal] = useState(0)
  const [sel, setSel] = useState(0)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!valor) return
    setCargando(true)
    supabase
      .from('articulo')
      .select('codigo_interno, descripcion, pvp, coste_neto, activo', { count: 'exact' })
      .eq(columna, valor)
      .order('codigo_interno')
      .limit(500)
      .then(({ data, count }) => {
        setRows((data ?? []) as ArticuloFila[])
        setTotal(count ?? 0)
        setSel(0)
        setCargando(false)
      })
  }, [columna, valor])

  const abrir = (r?: ArticuloFila) => r && navigate(`/articulos/${encodeURIComponent(r.codigo_interno)}`)

  return (
    <div className="flex flex-col gap-1" title={titulo}>
      <div className="h-[262px] overflow-y-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: '18%' }}>Código Interno</th>
              <th>Descripción</th>
              <th style={{ width: 110 }} className="text-right!">
                PVP General
              </th>
              <th style={{ width: 110 }} className="text-right!">
                Coste Neto
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.codigo_interno}
                className={i === sel ? 'gw-selected' : r.activo ? '' : 'text-[#8a8a8a]'}
                onClick={() => setSel(i)}
                onDoubleClick={() => abrir(r)}
              >
                <td>{r.codigo_interno}</td>
                <td>{r.descripcion}</td>
                <td className="text-right">{formatGw(r.pvp ?? 0, 3)}</td>
                <td className="text-right">{formatGw(r.coste_neto ?? 0, 3)}</td>
              </tr>
            ))}
            <FilasVacias cols={4} ocupadas={rows.length} total={11} />
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 text-[13px]">
        <span className="text-[#1a4fd0]">
          {cargando ? 'Cargando…' : `Nº Artículos: ${total}${total > rows.length ? ` (se muestran ${rows.length})` : ''}`}
        </span>
        <button type="button" className="gw-btn" disabled={!rows[sel]} onClick={() => abrir(rows[sel])}>
          Ir al Artículo
        </button>
      </div>
    </div>
  )
}
