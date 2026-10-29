import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, FolderOpen, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { todasLasFilas } from '../../../lib/todasLasFilas'
import { GwField, GwInput, GwRadio, GwTextArea } from '../../../components/gw'
import { GwRecordBar } from '../../../components/gw/GwRecordBar'
import { GwLookupDialog, type GwLookupColumn } from '../../../components/gw/GwLookupDialog'
import { FilasVacias, GridMiniBar } from '../../../components/gw/GwGridParts'
import { useBusquedaFicha } from '../../../components/gw/useBusquedaFicha'
import { GwAnterior, GwBuscar, GwPrimero, GwSiguiente, GwUltimo } from '../../../components/gw/GwIconos'

export const hoy = () => new Date().toISOString().slice(0, 10)

/** Siguiente código numérico con los dígitos de GeminisWin (repartidor 607, zona 8002, ruta 12…). */
export function siguienteCodigo(codigos: string[], digitos: number) {
  const max = codigos.reduce((m, c) => (/^\d+$/.test(c) ? Math.max(m, Number(c)) : m), 0)
  return String(max + 1).padStart(digitos, '0')
}

type Registro = { codigo: string; actualizado_en?: string } & Record<string, unknown>

/**
 * Estado común de una ficha de maestro con la barra de GeminisWin: carga por código desde
 * la ruta comodín (/x, /x/nuevo, /x/:codigo), alta, modificación, navegación y orden.
 */
export function useFicha<T extends Registro>({
  tabla,
  ruta,
  vacio,
  digitos,
  campoNombre,
  que = 'el registro',
  titulo = 'Registros',
  etiquetaNombre = 'Descripción',
}: {
  tabla: string
  ruta: string
  vacio: T
  digitos: number
  campoNombre: keyof T & string
  /** Para los avisos de la búsqueda: «No existe la zona 12». */
  que?: string
  /** Para la lista ordenada (Ctrl+Intro): «Zonas Territoriales ordenadas por …». */
  titulo?: string
  etiquetaNombre?: string
}) {
  const params = useParams()
  const sub = params['*'] ? decodeURIComponent(params['*']) : ''
  const codigo = sub || undefined
  const isNew = codigo === 'nuevo'
  const navigate = useNavigate()

  const [mode, setMode] = useState<'consulta' | 'edicion' | 'alta'>(isNew ? 'alta' : 'consulta')
  const [registro, setRegistro] = useState<T>(vacio)
  const [draft, setDraft] = useState<T>(vacio)
  const [loading, setLoading] = useState(true)
  const [vacia, setVacia] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lista, setLista] = useState<{ codigo: string; nombre: string }[]>([])
  const [listaCargada, setListaCargada] = useState(false)
  const [orden, setOrden] = useState<'codigo' | 'nombre'>('codigo')

  useEffect(() => {
    supabase
      .from(tabla)
      .select(`codigo, ${campoNombre}`)
      .order('codigo')
      .then(({ data }) => {
        setLista(((data ?? []) as unknown as Record<string, string>[]).map((r) => ({ codigo: r.codigo, nombre: r[campoNombre] ?? '' })))
        setListaCargada(true)
      })
  }, [tabla, campoNombre])

  useEffect(() => {
    setError(null)
    if (isNew) {
      setRegistro(vacio)
      setDraft(vacio)
      setVacia(false)
      setMode('alta')
      setLoading(false)
      return
    }
    if (!codigo) {
      supabase
        .from(tabla)
        .select('codigo')
        .order('codigo')
        .limit(1)
        .then(({ data }) => {
          if (data && data[0]) navigate(`${ruta}/${encodeURIComponent((data[0] as { codigo: string }).codigo)}`, { replace: true })
          else {
            setVacia(true)
            setMode('consulta')
            setLoading(false)
          }
        })
      return
    }
    setLoading(true)
    supabase
      .from(tabla)
      .select('*')
      .eq('codigo', codigo)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError('No se ha encontrado el registro.')
          setLoading(false)
          return
        }
        setRegistro(data as T)
        setDraft(data as T)
        setVacia(false)
        setMode('consulta')
        setLoading(false)
      })
    // vacio es constante por pantalla
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo, isNew, navigate, tabla, ruta])

  useEffect(() => {
    if (mode === 'alta' && listaCargada && !draft.codigo) {
      setDraft((d) => ({ ...d, codigo: siguienteCodigo(lista.map((l) => l.codigo), digitos) }))
    }
  }, [mode, listaCargada, lista, draft.codigo, digitos])

  const patch = (p: Partial<T>) => setDraft((d) => ({ ...d, ...p }))

  async function guardar(extra?: Partial<T>) {
    setError(null)
    const cod = String(draft.codigo ?? '').trim()
    const nombre = String(draft[campoNombre] ?? '').trim()
    if (!cod || !nombre) {
      setError('El código y la descripción son obligatorios.')
      return
    }
    setSaving(true)
    const { actualizado_en: _a, ...resto } = draft
    const payload: Record<string, unknown> = { ...resto, ...extra, codigo: cod, [campoNombre]: nombre }
    const res =
      mode === 'alta'
        ? await supabase.from(tabla).insert(payload)
        : await supabase.from(tabla).update(payload).eq('codigo', registro.codigo)
    setSaving(false)
    if (res.error) {
      setError(res.error.code === '23505' ? `Ya existe el código ${cod}.` : res.error.message)
      return
    }
    if (mode === 'alta') {
      setLista((l) => [...l, { codigo: cod, nombre }].sort((a, b) => a.codigo.localeCompare(b.codigo)))
      navigate(`${ruta}/${encodeURIComponent(cod)}`, { replace: true })
      return
    }
    const { data } = await supabase.from(tabla).select('*').eq('codigo', cod).maybeSingle()
    const guardado = (data as T | null) ?? draft
    setRegistro(guardado)
    setDraft(guardado)
    setLista((l) => l.map((x) => (x.codigo === cod ? { ...x, nombre } : x)))
    setMode('consulta')
  }

  function cancelar() {
    if (mode === 'alta') {
      navigate(lista[0] ? `${ruta}/${encodeURIComponent(lista[0].codigo)}` : ruta)
      return
    }
    setDraft(registro)
    setError(null)
    setMode('consulta')
  }

  const ordenada = useMemo(
    () => (orden === 'codigo' ? lista : [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.codigo.localeCompare(b.codigo))),
    [lista, orden],
  )

  // Intro en Código/Descripción (consulta) y Ctrl+Intro: lista ordenada (gw_lista_ordenada).
  const busq = useBusquedaFicha({
    fuente: tabla,
    campoNombre,
    etiquetaNombre,
    que,
    titulo,
    digitos,
    consulta: mode === 'consulta',
    actual: registro.codigo || null,
    goTo: (c) => navigate(`${ruta}/${encodeURIComponent(c)}`),
    setError,
  })

  return {
    busqueda: busq.busqueda,
    dialogoLista: busq.dialogo,
    mode,
    setMode,
    registro,
    setRegistro,
    draft,
    setDraft,
    patch,
    loading,
    vacia,
    saving,
    error,
    setError,
    lista,
    setLista,
    ordenada,
    orden,
    setOrden,
    guardar,
    cancelar,
    navigate,
    editing: mode !== 'consulta',
  }
}

/** Barra inferior + línea de estado + buscador de registros, igual que en el resto de fichas. */
export function BarraFicha<T extends Registro>({
  f,
  ruta,
  tabla,
  titulo,
  columnas,
  buscarEn,
  onDelete,
}: {
  f: ReturnType<typeof useFicha<T>>
  ruta: string
  tabla: string
  titulo: string
  columnas: GwLookupColumn[]
  buscarEn: string[]
  onDelete?: () => void
}) {
  const [buscar, setBuscar] = useState(false)
  const idx = f.ordenada.findIndex((r) => r.codigo === f.registro.codigo)
  const goTo = (c?: string) => c && f.navigate(`${ruta}/${encodeURIComponent(c)}`)
  return (
    <>
      <GwRecordBar
        mode={f.mode}
        canNavigate={f.mode === 'consulta' && f.ordenada.length > 0}
        saving={f.saving}
        onFirst={() => goTo(f.ordenada[0]?.codigo)}
        onPrev={() => goTo(f.ordenada[idx - 1]?.codigo)}
        onNext={() => goTo(f.ordenada[idx + 1]?.codigo)}
        onLast={() => goTo(f.ordenada[f.ordenada.length - 1]?.codigo)}
        onSort={() => f.setOrden((o) => (o === 'codigo' ? 'nombre' : 'codigo'))}
        onSearch={() => setBuscar(true)}
        onPrint={() => window.print()}
        onNew={() => f.navigate(`${ruta}/nuevo`)}
        onEdit={() => !f.vacia && f.setMode('edicion')}
        onDelete={onDelete}
        onSave={() => f.guardar()}
        onCancel={f.cancelar}
        onExit={() => f.navigate('/')}
      />
      {f.dialogoLista}
      <div className="text-[11px] text-[#444]">
        Orden: {f.orden === 'codigo' ? 'por código' : 'por descripción'}
        {idx >= 0 ? ` · Registro ${idx + 1} de ${f.ordenada.length}` : ''}
        {f.mode === 'alta' ? ' · Alta' : f.mode === 'edicion' ? ' · Modificando' : ''}
      </div>
      {buscar && (
        <GwLookupDialog<Record<string, unknown> & { codigo: string }>
          title={titulo}
          table={tabla}
          columns={columnas}
          searchColumns={buscarEn}
          orderBy={f.orden === 'codigo' ? 'codigo' : buscarEn[1] ?? 'codigo'}
          keyColumn="codigo"
          onPick={(r) => {
            setBuscar(false)
            goTo(r.codigo)
          }}
          onClose={() => setBuscar(false)}
        />
      )}
    </>
  )
}

/** Botón-casilla de GeminisWin: × roja cuando está desactivado, ✓ verde cuando está activado. */
export function BotonCasilla({
  label,
  checked,
  disabled,
  title,
  onChange,
  className = '',
}: {
  label: ReactNode
  checked: boolean
  disabled?: boolean
  title?: string
  onChange: (v: boolean) => void
  className?: string
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-1 border border-[var(--gw-border)] px-2 text-left text-[14px] leading-[16px] ${
        checked ? 'bg-[#dfe9f7]' : 'bg-[var(--gw-face)]'
      } disabled:text-[var(--gw-text)] ${className}`}
    >
      {checked ? <Check size={13} strokeWidth={3} className="flex-none text-[#127a12]" /> : <X size={13} strokeWidth={3} className="flex-none text-[#c42b1c]" />}
      <span>{label}</span>
    </button>
  )
}

/** ✓ verde o vacío, como la columna «Habilt.» de las rejillas de GeminisWin. */
export function Tick({ on }: { on: boolean }) {
  return <span className="flex justify-center">{on ? <Check size={13} strokeWidth={3} className="text-[#16a316]" /> : null}</span>
}

/** Mini barra de navegación de rejilla: primero · anterior · siguiente · último · buscar. */
export function GridNavBar({
  total,
  sel,
  onSel,
  onBuscar,
}: {
  total: number
  sel: number
  onSel: (i: number) => void
  onBuscar?: () => void
}) {
  const b =
    'flex h-[22px] w-[58px] items-center justify-center gw-boton-barra'
  return (
    <div className="flex w-fit border border-[var(--gw-border)] bg-[var(--gw-face)]">
      <button type="button" className={b} title="Primero" disabled={total === 0 || sel <= 0} onClick={() => onSel(0)}>
        <GwPrimero />
      </button>
      <button type="button" className={b} title="Anterior" disabled={total === 0 || sel <= 0} onClick={() => onSel(sel - 1)}>
        <GwAnterior />
      </button>
      <button type="button" className={b} title="Siguiente" disabled={total === 0 || sel >= total - 1} onClick={() => onSel(sel + 1)}>
        <GwSiguiente />
      </button>
      <button type="button" className={b} title="Último" disabled={total === 0 || sel >= total - 1} onClick={() => onSel(total - 1)}>
        <GwUltimo />
      </button>
      <button type="button" className={b} title="Buscar" disabled={total === 0 || !onBuscar} onClick={onBuscar}>
        <GwBuscar />
      </button>
    </div>
  )
}

export { FilasVacias, GridMiniBar }

const MODOS = [
  { valor: 0, label: 'Tamaño real', fit: 'object-none' },
  { valor: 1, label: 'Tamaño ajustado', fit: 'object-contain' },
  { valor: 2, label: 'Rellenar marco', fit: 'object-fill' },
]

/** Pestaña «Observaciones e Imagen» común a repartidores, zonas y rutas. */
export function ObsImagen({
  observaciones,
  imagenUrl,
  imagenModo,
  editing,
  onChange,
  nombre,
}: {
  observaciones: string | null
  imagenUrl: string | null
  imagenModo: number
  editing: boolean
  onChange: (p: { observaciones?: string | null; imagen_url?: string | null; imagen_modo?: number }) => void
  nombre: string
}) {
  const [rota, setRota] = useState<string | null>(null)
  const ro = !editing
  const url = imagenUrl?.trim() || null
  const modo = MODOS.find((m) => m.valor === imagenModo) ?? MODOS[1]
  return (
    <div className="grid min-h-[300px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
      <GwField label="Observaciones">
        <GwTextArea
          title="OBSERV"
          className="h-[285px]"
          disabled={ro}
          value={observaciones ?? ''}
          onChange={(e) => onChange({ observaciones: e.target.value === '' ? null : e.target.value })}
        />
      </GwField>
      <div className="flex flex-col gap-1 pt-1">
        <div className="grid grid-cols-[minmax(0,1fr)_200px] gap-1">
          <div className="relative h-[245px] overflow-hidden border border-[var(--gw-border)] bg-[var(--gw-face)]">
            {url && rota !== url ? (
              <img src={url} alt="" className={`h-full w-full ${modo.fit}`} onError={() => setRota(url)} />
            ) : (
              <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100" aria-label="Sin imagen">
                <line x1="0" y1="0" x2="100" y2="100" stroke="#9a9a9a" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                <line x1="100" y1="0" x2="0" y2="100" stroke="#9a9a9a" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
              </svg>
            )}
          </div>
          <div className="flex flex-col">
            <span className="gw-label">Ver Imagen a ...</span>
            <div className="flex flex-col gap-0.5 border border-[var(--gw-border-light)] p-1">
              {MODOS.map((m) => (
                <GwRadio
                  key={m.valor}
                  name={`${nombre}-imagen-modo`}
                  label={m.label}
                  checked={modo.valor === m.valor}
                  disabled={ro}
                  onChange={() => onChange({ imagen_modo: m.valor })}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-1">
          <GwInput
            title="IMAGEN — ruta o dirección de la imagen"
            disabled={ro}
            value={imagenUrl ?? ''}
            onChange={(e) => onChange({ imagen_url: e.target.value === '' ? null : e.target.value })}
          />
          <button type="button" className="gw-btn flex-none px-2" disabled={ro} title="Elegir imagen (escribe la ruta o URL)">
            <FolderOpen size={14} className="text-[#b58a1a]" />
          </button>
        </div>
      </div>
    </div>
  )
}

/** Rejilla de solo lectura de clientes (por zona o por ruta) con su barra de navegación. */
export function RejillaClientes({ filtro, valor }: { filtro: 'zona_territorial_codigo' | 'ruta_codigo'; valor: string }) {
  const [rows, setRows] = useState<{ codigo: string; nombre: string; direccion: string | null; codigo_postal: string | null; poblacion: string | null }[]>([])
  const [sel, setSel] = useState(0)
  const [buscar, setBuscar] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!valor) return setRows([])
    const consulta = () => {
      const q = supabase.from('cliente').select('codigo, nombre, direccion, codigo_postal, poblacion').eq(filtro, valor)
      return filtro === 'ruta_codigo' ? q.order('orden_en_ruta', { nullsFirst: false }).order('codigo') : q.order('codigo')
    }
    // Supabase corta cada respuesta en 1000 filas: por bloques.
    todasLasFilas<(typeof rows)[number]>(consulta).then(({ data }) => {
      setRows(data)
      setSel(0)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, valor])

  useEffect(() => {
    document.querySelector('.rejilla-clientes tr.gw-selected')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  return (
    <div className="flex flex-col gap-1">
      <div className="rejilla-clientes h-[255px] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid min-w-[900px]" title="CLIENTES">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: 90 }}>Código</th>
              <th style={{ width: 320 }}>Nombre</th>
              <th style={{ width: 290 }}>Dirección</th>
              <th style={{ width: 70 }}>C.Post.</th>
              <th>Población</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.codigo} className={i === sel ? 'gw-selected' : ''} onClick={() => setSel(i)} onDoubleClick={() => navigate(`/clientes/${encodeURIComponent(r.codigo)}`)}>
                <td>{r.codigo}</td>
                <td className="truncate">{r.nombre}</td>
                <td className="truncate">{r.direccion ?? ''}</td>
                <td>{r.codigo_postal ?? ''}</td>
                <td className="truncate">{r.poblacion ?? ''}</td>
              </tr>
            ))}
            <FilasVacias cols={5} ocupadas={rows.length} total={10} />
          </tbody>
        </table>
      </div>
      <GridNavBar total={rows.length} sel={sel} onSel={setSel} onBuscar={() => setBuscar(true)} />
      {buscar && (
        <BuscarEnFilas
          titulo="Localizar cliente"
          filas={rows.map((r) => ({ clave: r.codigo, texto: `${r.codigo} ${r.nombre} ${r.poblacion ?? ''}` }))}
          onPick={(i) => {
            setSel(i)
            setBuscar(false)
          }}
          onClose={() => setBuscar(false)}
        />
      )}
    </div>
  )
}

/** Localizar una fila dentro de una rejilla ya cargada (prismáticos de la mini barra). */
export function BuscarEnFilas({
  titulo,
  filas,
  onPick,
  onClose,
}: {
  titulo: string
  filas: { clave: string; texto: string }[]
  onPick: (indice: number) => void
  onClose: () => void
}) {
  const [t, setT] = useState('')
  const encontradas = filas.map((f, i) => ({ ...f, i })).filter((f) => f.texto.toLowerCase().includes(t.trim().toLowerCase()))
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-24" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="w-[480px] max-w-[95vw] border border-[#6f6f6f] bg-[var(--gw-face)] p-2 shadow-lg">
        <div className="mb-1 text-[13px] font-bold">{titulo}</div>
        <GwInput autoFocus value={t} placeholder="Escribe para filtrar…" onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && encontradas[0] && onPick(encontradas[0].i)} />
        <div className="mt-1 max-h-[260px] overflow-y-auto border border-[var(--gw-border)] bg-white">
          {encontradas.slice(0, 200).map((f) => (
            <div key={f.clave} className="cursor-default px-2 py-0.5 text-[13px] hover:bg-[#e5f1fb]" onDoubleClick={() => onPick(f.i)} onClick={() => onPick(f.i)}>
              {f.texto}
            </div>
          ))}
          {encontradas.length === 0 && <div className="px-2 py-1 text-[13px] text-[#6d6d6d]">Sin coincidencias.</div>}
        </div>
        <div className="mt-1 flex justify-end">
          <button type="button" className="gw-btn" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

/** Desplegable de opción para elegir un registro relacionado (ruta, zona, repartidor). */
export function SelectorDialog({
  titulo,
  tabla,
  campoNombre,
  onPick,
  onClose,
}: {
  titulo: string
  tabla: string
  campoNombre: string
  onPick: (codigo: string) => void
  onClose: () => void
}) {
  return (
    <GwLookupDialog<Record<string, unknown> & { codigo: string }>
      title={titulo}
      table={tabla}
      columns={[
        { key: 'codigo', label: 'Código', width: 90 },
        { key: campoNombre, label: campoNombre === 'nombre' ? 'Nombre' : 'Descripción' },
      ]}
      searchColumns={['codigo', campoNombre]}
      orderBy="codigo"
      keyColumn="codigo"
      onPick={(r) => onPick(r.codigo)}
      onClose={onClose}
    />
  )
}
