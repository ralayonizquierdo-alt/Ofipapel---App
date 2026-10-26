import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwInput, GwRadio, GwSelect, GwWindow } from './index'
import type { GwLookupColumn } from './GwLookupDialog'

export interface GwLocalizarCampo {
  key: string
  label: string
  tipo?: 'texto' | 'numero' | 'fecha'
}

type Union = 'Y' | 'O' | 'fin'

interface Condicion {
  campo: string
  operador: string
  valor: string
  union: Union
}

const OPERADORES: { value: string; label: string; sinValor?: boolean }[] = [
  { value: 'eq', label: 'Igual a' },
  { value: 'neq', label: 'Distinto de' },
  { value: 'gt', label: 'Mayor que' },
  { value: 'gte', label: 'Mayor o igual que' },
  { value: 'lt', label: 'Menor que' },
  { value: 'lte', label: 'Menor o igual que' },
  { value: 'contiene', label: 'Contiene' },
  { value: 'empieza', label: 'Empieza por' },
  { value: 'vacio', label: 'Está vacío', sinValor: true },
]

const nueva = (campo: string): Condicion => ({ campo, operador: 'eq', valor: '', union: 'fin' })

/** Valor entre comillas para los filtros de PostgREST (admite comas y paréntesis). */
function q(v: string) {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function condicionFiltro(c: Condicion, tipo: GwLocalizarCampo['tipo']): string | null {
  if (c.operador === 'vacio') return `${c.campo}.is.null`
  const v = c.valor.trim()
  if (!v) return null
  let valor = v
  if (tipo === 'numero') valor = v.replace(/\./g, '').replace(',', '.')
  if (tipo === 'fecha') {
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (m) valor = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  if (c.operador === 'contiene') return `${c.campo}.ilike.${q(`*${valor}*`)}`
  if (c.operador === 'empieza') return `${c.campo}.ilike.${q(`${valor}*`)}`
  return `${c.campo}.${c.operador}.${q(valor)}`
}

/** Combina las condiciones de izquierda a derecha, como el «Y / O» de GeminisWin. */
function construirFiltro(conds: Condicion[], campos: GwLocalizarCampo[]): string | null {
  let expr: string | null = null
  let union: Union = 'Y'
  for (const c of conds) {
    const f = condicionFiltro(c, campos.find((k) => k.key === c.campo)?.tipo)
    if (f) expr = expr == null ? f : `${union === 'O' ? 'or' : 'and'}(${expr},${f})`
    union = c.union
    if (c.union === 'fin') break
  }
  return expr
}

function textoFiltro(conds: Condicion[], campos: GwLocalizarCampo[]) {
  const partes: string[] = []
  for (const c of conds) {
    const campo = campos.find((k) => k.key === c.campo)?.label ?? c.campo
    const op = OPERADORES.find((o) => o.value === c.operador)
    partes.push(`${campo} ${op?.label.toLowerCase()}${op?.sinValor ? '' : ` «${c.valor}»`}`)
    if (c.union === 'fin') break
    partes.push(c.union)
  }
  return partes.join(' ')
}

/**
 * «Localizar registros» de GeminisWin (botón Buscar de la barra de las fichas): condiciones
 * Campo / Operador / Valor encadenadas con Y / O («<<» cierra la lista), orden de los
 * registros, «Ver Filtro», «Limpiar Filtros», Aceptar y Cancelar. Con un único resultado
 * lo elige directamente; con varios muestra la rejilla para escoger.
 */
export function GwLocalizarDialog<T extends Record<string, unknown>>({
  title = 'Localizar registros',
  table,
  columns,
  searchColumns,
  orderBy,
  keyColumn,
  campos,
  onPick,
  onResults,
  onClose,
}: {
  title?: string
  table: string
  columns: GwLookupColumn[]
  searchColumns: string[]
  orderBy: string
  keyColumn: string
  /** Campos por los que se puede buscar, con su tipo. Por defecto, searchColumns como texto. */
  campos?: GwLocalizarCampo[]
  onPick: (row: T) => void
  /** Opcional: recibe todos los registros encontrados, para navegar entre ellos desde la ficha. */
  onResults?: (rows: T[]) => void
  onClose: () => void
}) {
  const listaCampos: GwLocalizarCampo[] =
    campos ?? searchColumns.map((k) => ({ key: k, label: columns.find((c) => c.key === k)?.label ?? k, tipo: 'texto' }))
  const [conds, setConds] = useState<Condicion[]>([nueva(listaCampos[0]?.key ?? keyColumn)])
  const [orden, setOrden] = useState(orderBy)
  const [verFiltro, setVerFiltro] = useState(false)
  const [rows, setRows] = useState<T[] | null>(null)
  const [sel, setSel] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)

  function cambiar(i: number, patch: Partial<Condicion>) {
    setConds((prev) => {
      const next = prev.map((c, j) => (j === i ? { ...c, ...patch } : c))
      if (patch.union && patch.union !== 'fin' && i === next.length - 1) next.push(nueva(next[i].campo))
      if (patch.union === 'fin') next.splice(i + 1)
      return next
    })
    setRows(null)
    setAviso(null)
  }

  async function aceptar() {
    if (rows && rows[sel]) return onPick(rows[sel])
    const filtro = construirFiltro(conds, listaCampos)
    setBuscando(true)
    setAviso(null)
    let consulta = supabase.from(table).select(columns.map((c) => c.key).join(', ')).order(orden).limit(500)
    if (filtro) consulta = consulta.or(filtro)
    const { data, error } = await consulta
    setBuscando(false)
    if (error) return setAviso(`No se ha podido buscar: ${error.message}`)
    const encontrados = (data ?? []) as unknown as T[]
    onResults?.(encontrados)
    if (encontrados.length === 0) return setAviso('No hay ningún registro que cumpla la condición.')
    if (encontrados.length === 1) return onPick(encontrados[0])
    setRows(encontrados)
    setSel(0)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-24"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') aceptar()
      }}
    >
      <GwWindow title={title} onClose={onClose} className="w-[1010px] max-w-[96vw]">
        <div className="flex flex-col gap-1.5 text-[15px]">
          <div className="flex flex-col gap-2 border border-[var(--gw-border-light)] p-2">
            <div className="grid grid-cols-[minmax(0,310px)_minmax(0,210px)_minmax(0,1fr)] gap-x-4">
              <span className="gw-label text-[15px]">Campo:</span>
              <span className="gw-label text-[15px]">Operador:</span>
              <span className="gw-label text-[15px]">Valor:</span>
            </div>
            {conds.map((c, i) => {
              const op = OPERADORES.find((o) => o.value === c.operador)
              const tipo = listaCampos.find((k) => k.key === c.campo)?.tipo
              return (
                <div key={i} className="flex flex-col gap-2">
                  <div className="grid grid-cols-[minmax(0,310px)_minmax(0,210px)_minmax(0,1fr)] gap-x-4">
                    <GwSelect
                      autoFocus={i === 0}
                      className="!h-[30px] text-[15px]"
                      value={c.campo}
                      onChange={(e) => cambiar(i, { campo: e.target.value })}
                    >
                      {listaCampos.map((k) => (
                        <option key={k.key} value={k.key}>
                          {k.label}
                        </option>
                      ))}
                    </GwSelect>
                    <GwSelect className="!h-[30px] text-[15px]" value={c.operador} onChange={(e) => cambiar(i, { operador: e.target.value })}>
                      {OPERADORES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </GwSelect>
                    <GwInput
                      className="!h-[30px] text-[15px]"
                      disabled={op?.sinValor}
                      placeholder={tipo === 'fecha' ? 'dd/mm/aaaa' : undefined}
                      value={c.valor}
                      onChange={(e) => cambiar(i, { valor: e.target.value })}
                    />
                  </div>
                  <div className="flex w-[290px] items-center gap-12 border border-[var(--gw-border-light)] px-2 py-1.5 text-[18px] font-bold">
                    <GwRadio name={`union${i}`} label={<u>Y</u>} checked={c.union === 'Y'} onChange={() => cambiar(i, { union: 'Y' })} />
                    <GwRadio name={`union${i}`} label={<u>O</u>} checked={c.union === 'O'} onChange={() => cambiar(i, { union: 'O' })} />
                    <GwRadio name={`union${i}`} label="<<" checked={c.union === 'fin'} onChange={() => cambiar(i, { union: 'fin' })} />
                  </div>
                </div>
              )
            })}
            {verFiltro && (
              <div className="border border-[var(--gw-border-light)] bg-white px-2 py-1 text-[13px] text-[#1a4fd0]">
                {textoFiltro(conds, listaCampos) || '(sin condiciones)'}
              </div>
            )}
            {aviso && <div className="text-[13px] text-[#c42b1c]">{aviso}</div>}
          </div>

          {rows && (
            <div className="max-h-[260px] overflow-y-auto border border-[var(--gw-border)]">
              <table className="gw-grid">
                <thead className="sticky top-0">
                  <tr>
                    {columns.map((c) => (
                      <th key={c.key} style={c.width ? { width: c.width } : undefined}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={String(r[keyColumn]) + i}
                      className={i === sel ? 'gw-selected' : ''}
                      onClick={() => setSel(i)}
                      onDoubleClick={() => onPick(r)}
                    >
                      {columns.map((c) => (
                        <td key={c.key}>{String(r[c.key] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-stretch gap-1.5 border border-[var(--gw-border-light)] p-1">
            <button type="button" className="gw-btn !h-auto w-[86px] flex-col !gap-0 py-0.5 text-[17px] leading-[22px]" onClick={() => setVerFiltro((v) => !v)}>
              <span>
                <u>V</u>er
              </span>
              <span>Filtro</span>
            </button>
            <button
              type="button"
              className="gw-btn !h-auto w-[106px] flex-col !gap-0 py-0.5 text-[17px] leading-[22px]"
              onClick={() => {
                setConds([nueva(listaCampos[0]?.key ?? keyColumn)])
                setRows(null)
                setAviso(null)
              }}
            >
              <span>
                <u>L</u>impiar
              </span>
              <span>Filtros</span>
            </button>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="gw-label text-[18px] leading-[22px]">Orden de los Registros</span>
              <GwSelect className="!h-[30px] text-[15px]" value={orden} onChange={(e) => setOrden(e.target.value)}>
                {columns.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </GwSelect>
            </div>
            <button type="button" className="gw-btn !h-auto w-[190px] text-[18px]" disabled={buscando} onClick={aceptar}>
              <Check size={16} strokeWidth={3} className="text-[#127a12]" />
              <span>
                <u>A</u>ceptar
              </span>
            </button>
            <button type="button" className="gw-btn !h-auto w-[190px] text-[18px]" onClick={onClose}>
              <X size={16} strokeWidth={3} className="text-[#c42b1c]" />
              <span>
                <u>C</u>ancelar
              </span>
            </button>
          </div>
        </div>
      </GwWindow>
    </div>
  )
}
