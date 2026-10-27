import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwInput, GwWindow, formatGw } from './index'

// «Ctrl+Intro» de GeminisWin: situado en un campo de búsqueda de una ficha (Código Interno,
// Descripción, Nombre, NIF…), abre la lista de TODOS los registros ordenada por ese campo,
// marcando el registro actual (o el texto tecleado), con búsqueda incremental por el inicio
// del campo. La lista se pide al servidor por tramos (RPC gw_lista_ordenada, cursor por el
// valor del campo + clave), hacia arriba y hacia abajo según se desplaza: nunca trae la tabla.

export interface GwListaColumna {
  key: string
  label: string
  width?: number
  /** Si se indica, la columna es numérica y se muestra con estos decimales, a la derecha. */
  decimales?: number
}

export interface GwListaOrdenadaDef {
  /** Fuente permitida en gw_lista_ordenada: articulo, articulo_compra, articulo_barras, cliente, proveedor, familia… */
  fuente: string
  /** Campo por el que se ordena y se busca. */
  campo: string
  /** Nombre del campo para el título («Descripción», «NIF»…). */
  etiqueta: string
  /** Qué se lista («Artículos», «Clientes»…). */
  que: string
  columnas: GwListaColumna[]
  /** No listar los registros con el campo vacío (códigos de barras, NIF…). */
  omitirVacios?: boolean
}

export type GwListaFila = Record<string, unknown> & { _sk: string; _k: string }

export interface GwListaOrdenadaAbrir {
  /** Texto tecleado en el campo: la lista se posiciona en él. */
  texto?: string | null
  /** Clave del registro actual (para la fuente): la lista se abre marcándolo. */
  ancla?: string | null
  onPick: (fila: GwListaFila) => void
}

const PAGINA = 60
const MARGEN_CARGA = 240

async function pedir(def: GwListaOrdenadaDef, modo: 'ge' | 'gt' | 'lt', sk: string, k: string, ancla?: string | null) {
  const { data, error } = await supabase.rpc('gw_lista_ordenada', {
    p_fuente: def.fuente,
    p_campo: def.campo,
    p_modo: modo,
    p_sk: sk,
    p_k: k,
    p_ancla: ancla ?? null,
    p_limite: PAGINA,
    p_omitir_vacios: !!def.omitirVacios,
  })
  if (error) throw error
  return (data ?? []) as GwListaFila[]
}

/** Códigos de cliente/proveedor de GeminisWin: escribir «2» es el 00002. */
export const gwConCeros = (t: string) => (/^\d{1,4}$/.test(t) ? t.padStart(5, '0') : t)

/** Primer registro cuyo campo empieza por `texto` (como el SEEK de GeminisWin), o null. */
export async function gwBuscarPorInicio(fuente: string, campo: string, texto: string): Promise<GwListaFila | null> {
  const t = texto.trim().toUpperCase()
  if (!t) return null
  const filas = await pedir({ fuente, campo, etiqueta: campo, que: '', columnas: [] }, 'ge', t, '').catch(() => [])
  const f = filas[0]
  return f && f._sk.startsWith(t) ? f : null
}

function celda(v: unknown, c: GwListaColumna) {
  if (c.decimales != null) return v == null || v === '' ? '' : formatGw(Number(v), c.decimales)
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  return v == null ? '' : String(v)
}

export function GwListaOrdenada({
  def,
  texto: textoInicial,
  ancla,
  onPick,
  onClose,
}: GwListaOrdenadaAbrir & { def: GwListaOrdenadaDef; onClose: () => void }) {
  const [texto, setTexto] = useState(textoInicial ?? '')
  const [filas, setFilas] = useState<GwListaFila[]>([])
  const [sel, setSel] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState<string | null>(null)
  const caja = useRef<HTMLDivElement>(null)
  const gen = useRef(0)
  const fin = useRef({ arriba: true, abajo: true })
  const ocupado = useRef({ arriba: false, abajo: false })
  const centrar = useRef(false)
  const altoAntes = useRef<number | null>(null)
  const filasRef = useRef<GwListaFila[]>([])
  filasRef.current = filas

  const posicionar = useCallback(
    async (t: string, anclaClave: string | null | undefined) => {
      const g = ++gen.current
      const sk = t.trim().toUpperCase()
      setCargando(true)
      try {
        const [arriba, abajo] = sk
          ? await Promise.all([pedir(def, 'lt', sk, ''), pedir(def, 'ge', sk, '')])
          : anclaClave
            ? await Promise.all([pedir(def, 'lt', '', '', anclaClave), pedir(def, 'ge', '', '', anclaClave)])
            : [[], await pedir(def, 'ge', '', '')]
        if (g !== gen.current) return
        fin.current = { arriba: arriba.length < PAGINA, abajo: abajo.length < PAGINA }
        ocupado.current = { arriba: false, abajo: false }
        setFilas([...arriba, ...abajo])
        setSel(abajo.length ? arriba.length : Math.max(arriba.length - 1, 0))
        setAviso(sk && !(abajo[0]?._sk ?? '').startsWith(sk) ? `Ningún registro empieza por «${t.trim()}»: se marca el siguiente.` : null)
        centrar.current = true
      } catch (e) {
        if (g === gen.current) setAviso(`No se ha podido cargar la lista: ${(e as Error).message}`)
      } finally {
        if (g === gen.current) setCargando(false)
      }
    },
    [def],
  )

  // Posición inicial y búsqueda incremental (con un pequeño respiro entre pulsaciones).
  const primera = useRef(true)
  useEffect(() => {
    const t = setTimeout(
      () => posicionar(texto, ancla),
      primera.current ? 0 : 140,
    )
    primera.current = false
    return () => clearTimeout(t)
  }, [texto, ancla, posicionar])

  const cargarMas = useCallback(
    async (lado: 'arriba' | 'abajo') => {
      if (fin.current[lado] || ocupado.current[lado]) return
      const actuales = filasRef.current
      const borde = lado === 'arriba' ? actuales[0] : actuales[actuales.length - 1]
      if (!borde) return
      ocupado.current[lado] = true
      const g = gen.current
      try {
        const nuevas = await pedir(def, lado === 'arriba' ? 'lt' : 'gt', borde._sk, borde._k)
        if (g !== gen.current) return
        if (nuevas.length < PAGINA) fin.current[lado] = true
        if (!nuevas.length) return
        if (lado === 'arriba') {
          altoAntes.current = caja.current?.scrollHeight ?? null
          setFilas((f) => [...nuevas, ...f])
          setSel((s) => s + nuevas.length)
        } else {
          setFilas((f) => [...f, ...nuevas])
        }
      } catch {
        /* se reintenta al seguir desplazando */
      } finally {
        if (g === gen.current) ocupado.current[lado] = false
      }
    },
    [def],
  )

  // Tras añadir filas por arriba, conservar lo que se estaba viendo; tras posicionar, centrar.
  useLayoutEffect(() => {
    const el = caja.current
    if (!el) return
    if (altoAntes.current != null) {
      el.scrollTop += el.scrollHeight - altoAntes.current
      altoAntes.current = null
    }
    const fila = el.querySelector<HTMLTableRowElement>(`tr[data-i="${sel}"]`)
    if (fila) {
      if (centrar.current) {
        el.scrollTop = fila.offsetTop - el.clientHeight / 2 + fila.offsetHeight / 2
        centrar.current = false
      } else {
        const thead = el.querySelector('thead')?.offsetHeight ?? 0
        if (fila.offsetTop - thead < el.scrollTop) el.scrollTop = fila.offsetTop - thead
        else if (fila.offsetTop + fila.offsetHeight > el.scrollTop + el.clientHeight) el.scrollTop = fila.offsetTop + fila.offsetHeight - el.clientHeight
      }
    }
    if (sel < 8) void cargarMas('arriba')
    if (sel > filas.length - 9) void cargarMas('abajo')
  }, [filas, sel, cargarMas])

  function alDesplazar() {
    const el = caja.current
    if (!el) return
    if (el.scrollTop < MARGEN_CARGA) void cargarMas('arriba')
    if (el.scrollHeight - el.scrollTop - el.clientHeight < MARGEN_CARGA) void cargarMas('abajo')
  }

  function porPagina() {
    const el = caja.current
    const alto = el?.querySelector('tbody tr')?.clientHeight || 22
    return Math.max(1, Math.floor(((el?.clientHeight ?? 400) - 24) / alto) - 1)
  }

  function teclas(e: React.KeyboardEvent) {
    const mover = (d: number) => {
      e.preventDefault()
      setSel((s) => Math.min(Math.max(s + d, 0), Math.max(filas.length - 1, 0)))
    }
    if (e.key === 'ArrowDown') mover(1)
    else if (e.key === 'ArrowUp') mover(-1)
    else if (e.key === 'PageDown') mover(porPagina())
    else if (e.key === 'PageUp') mover(-porPagina())
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (filas[sel]) onPick(filas[sel])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }

  const { columnas } = def
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-16" onKeyDown={teclas}>
      <GwWindow title={`${def.que} ordenados por ${def.etiqueta}`} onClose={onClose} className="w-[960px] max-w-[96vw]">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="gw-label">{def.etiqueta}:</span>
            <GwInput
              autoFocus
              value={texto}
              title="Escribe el principio del campo: la lista se coloca en el primero que empieza así"
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>
          <div ref={caja} onScroll={alDesplazar} className="h-[440px] max-h-[60vh] overflow-y-auto border border-[var(--gw-border)] bg-white">
            <table className="gw-grid table-fixed">
              <thead className="sticky top-0 z-10">
                <tr>
                  {columnas.map((c) => (
                    <th
                      key={c.key}
                      style={c.width ? { width: c.width } : undefined}
                      className={`${c.decimales != null ? 'text-right!' : ''} ${c.key === def.campo ? 'font-bold!' : ''}`}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!cargando && filas.length === 0 && (
                  <tr>
                    <td colSpan={columnas.length} className="text-center text-[#6d6d6d]">
                      Sin registros.
                    </td>
                  </tr>
                )}
                {filas.map((r, i) => (
                  <tr
                    key={r._k}
                    data-i={i}
                    className={i === sel ? 'gw-selected' : r.activo === false ? 'text-[#8a8a8a]' : ''}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setSel(i)}
                    onDoubleClick={() => onPick(r)}
                  >
                    {columnas.map((c) => (
                      <td key={c.key} className={`truncate ${c.decimales != null ? 'text-right tabular-nums' : ''}`}>
                        {celda(r[c.key], c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[12px] text-[#444]">
              {aviso ? (
                <span className="text-[#c42b1c]">{aviso}</span>
              ) : cargando ? (
                'Cargando…'
              ) : (
                '↑ ↓ Re Pág Av Pág: moverse · Intro o doble clic: elegir · Esc: cerrar'
              )}
            </span>
            <button type="button" className="gw-btn w-[110px]" disabled={!filas[sel]} onClick={() => filas[sel] && onPick(filas[sel])}>
              <Check size={14} strokeWidth={3} className="text-[#127a12]" />
              <u>A</u>ceptar
            </button>
            <button type="button" className="gw-btn w-[110px]" onClick={onClose}>
              <X size={14} strokeWidth={3} className="text-[#c42b1c]" />
              <u>C</u>ancelar
            </button>
          </div>
        </div>
      </GwWindow>
    </div>
  )
}

/**
 * Estado de la ventana de lista ordenada para una ficha: `abrir(def, { texto, ancla, onPick })`
 * y pintar `dialogo` en cualquier sitio de la ficha. Al cerrar sin elegir, el foco vuelve al
 * campo desde el que se abrió.
 */
export function useListaOrdenada() {
  const [abierta, setAbierta] = useState<(GwListaOrdenadaAbrir & { def: GwListaOrdenadaDef }) | null>(null)
  const origen = useRef<HTMLElement | null>(null)
  const abrir = useCallback((def: GwListaOrdenadaDef, opts: GwListaOrdenadaAbrir) => {
    origen.current = document.activeElement as HTMLElement | null
    setAbierta({ def, ...opts })
  }, [])
  const cerrar = () => {
    setAbierta(null)
    const el = origen.current
    if (el?.isConnected) setTimeout(() => el.focus(), 0)
  }
  const dialogo = abierta ? (
    <GwListaOrdenada
      def={abierta.def}
      texto={abierta.texto}
      ancla={abierta.ancla}
      onPick={(f) => {
        setAbierta(null)
        abierta.onPick(f)
      }}
      onClose={cerrar}
    />
  ) : null
  return { abrir, dialogo }
}
