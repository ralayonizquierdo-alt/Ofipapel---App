import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { GwDate, GwField, GwGroup, GwInline, GwInput, GwLookupButton, GwNumber, GwSelect, GwTabs, formatGw, type GwTabDef } from '../../../components/gw'
import { GwRecordBar } from '../../../components/gw/GwRecordBar'
import { GwLookupDialog, type GwLookupColumn } from '../../../components/gw/GwLookupDialog'
import { FilasVacias, GridMiniBar } from '../../../components/gw/GwGridParts'
import { GwOperativa } from '../../../components/gw/GwOperativa'
import { ModalGw, fechaEs, useAlmacenes, useTiendas } from './comun'

// Almacén → Control de Lotes, calcada de GeminisWin (capturas ZIP 7, 04/11/2026): ficha de
// lote con códigos de barras, fechas de consumo y tres pestañas (Datos de Producción, Series o
// Sublotes y Stock del Lote). Tablas lote, lote_serie y lote_stock
// (migración 20261104_control_lotes_ficha.sql). El stock del lote es informativo: NO cambia el
// stock general de los almacenes (eso va por Regularización de Stock), igual que en GeminisWin.
// La consulta antigua de movimientos (articulo_lote) sigue en /almacen/lotes/consulta.

interface Lote {
  id: number | null
  tienda_terminal_codigo: string | null
  lote_externo: string | null
  descripcion: string | null
  proveedor_codigo: string | null
  articulo_codigo: string | null
  ean_ucc14: string | null
  ean128_1: string | null
  ean128_2: string | null
  sscc: string | null
  fecha_entrada: string | null
  fecha_envasado: string | null
  fecha_consumo_preferente: string | null
  fecha_caducidad: string | null
  variedad: string | null
  clasificacion: string | null
  pieza: string | null
  conservacion: string | null
  pais_produccion_codigo: string | null
  pais_nacimiento_codigo: string | null
  pais_sacrificio_codigo: string | null
  pais_despiece_codigo: string | null
  pais_cebo_codigo: string | null
  fecha_produccion: string | null
  fecha_nacimiento: string | null
  registro_sanitario_sacrificio: string | null
  fecha_sacrificio: string | null
  registro_sanitario_despiece: string | null
  fecha_envasado_despiece: string | null
}

const VACIO: Lote = {
  id: null,
  tienda_terminal_codigo: null,
  lote_externo: null,
  descripcion: null,
  proveedor_codigo: null,
  articulo_codigo: null,
  ean_ucc14: null,
  ean128_1: null,
  ean128_2: null,
  sscc: null,
  fecha_entrada: null,
  fecha_envasado: null,
  fecha_consumo_preferente: null,
  fecha_caducidad: null,
  variedad: null,
  clasificacion: null,
  pieza: null,
  conservacion: null,
  pais_produccion_codigo: null,
  pais_nacimiento_codigo: null,
  pais_sacrificio_codigo: null,
  pais_despiece_codigo: null,
  pais_cebo_codigo: null,
  fecha_produccion: null,
  fecha_nacimiento: null,
  registro_sanitario_sacrificio: null,
  fecha_sacrificio: null,
  registro_sanitario_despiece: null,
  fecha_envasado_despiece: null,
}

interface Serie {
  id: number
  numero_serie: string
  fecha_entrada: string | null
  serie_secundaria: string | null
  serie_electronica: string | null
}
interface StockLinea {
  id: number
  numero_serie: string
  almacen_codigo: string
  stock: number
}

const TABS: GwTabDef[][] = [
  [
    { key: 'produccion', label: 'Datos de Producción' },
    { key: 'series', label: 'Series o Sublotes' },
    { key: 'stock', label: 'Stock del Lote' },
    { key: 'operativa', label: 'Operativa' },
  ],
]

const SIN_TABLA = 'Falta crear las tablas de lotes en la base de datos (migración 20261104_control_lotes_ficha.sql). Pídeselo a Rober o a quien administra la base; mientras, la consulta antigua está en «Consulta de movimientos».'

function esSinTabla(e: { code?: string; message?: string } | null) {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || /relation .* does not exist|Could not find the table/i.test(e.message ?? ''))
}

const hoy = () => new Date().toLocaleDateString('sv-SE')

export function ControlLotesPage() {
  const navigate = useNavigate()
  const tiendas = useTiendas()
  const [lista, setLista] = useState<{ id: number; descripcion: string | null }[]>([])
  const [orden, setOrden] = useState<'id' | 'descripcion'>('id')
  const [actualId, setActualId] = useState<number | null>(null)
  const [registro, setRegistro] = useState<Lote>(VACIO)
  const [draft, setDraft] = useState<Lote>(VACIO)
  const [mode, setMode] = useState<'consulta' | 'edicion' | 'alta'>('consulta')
  const [tab, setTab] = useState('produccion')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [buscar, setBuscar] = useState(false)

  const editing = mode !== 'consulta'
  const ro = !editing

  const cargarLista = useCallback(async () => {
    const { data, error: e } = await supabase.from('lote').select('id, descripcion').order('id').limit(5000)
    if (e) {
      setError(esSinTabla(e) ? SIN_TABLA : e.message)
      setCargando(false)
      return [] as { id: number; descripcion: string | null }[]
    }
    const l = (data ?? []) as { id: number; descripcion: string | null }[]
    setLista(l)
    return l
  }, [])

  useEffect(() => {
    cargarLista().then((l) => {
      setActualId(l[0]?.id ?? null)
      setCargando(false)
    })
  }, [cargarLista])

  useEffect(() => {
    if (actualId == null) {
      setRegistro(VACIO)
      setDraft(VACIO)
      return
    }
    let vivo = true
    supabase
      .from('lote')
      .select('*')
      .eq('id', actualId)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (!vivo) return
        if (e) return setError(e.message)
        const r = { ...VACIO, ...((data ?? {}) as Partial<Lote>) }
        setRegistro(r)
        setDraft(r)
      })
    return () => {
      vivo = false
    }
  }, [actualId])

  const ordenada = useMemo(
    () => (orden === 'id' ? lista : [...lista].sort((a, b) => (a.descripcion ?? '').localeCompare(b.descripcion ?? '', 'es') || a.id - b.id)),
    [lista, orden],
  )
  const idx = ordenada.findIndex((r) => r.id === actualId)
  const vacia = !cargando && lista.length === 0 && mode !== 'alta'

  const patch = (p: Partial<Lote>) => setDraft((d) => ({ ...d, ...p }))
  const txt = (k: keyof Lote, title: string, extra = '') => (
    <GwInput
      className={extra}
      value={(draft[k] ?? '') as string}
      disabled={ro}
      title={title}
      onChange={(e) => patch({ [k]: e.target.value === '' ? null : e.target.value } as Partial<Lote>)}
    />
  )
  const fecha = (k: keyof Lote, title: string) => (
    <GwDate className="!w-[160px]" title={title} value={(draft[k] as string | null) ?? null} disabled={ro} onChange={(v) => patch({ [k]: v } as Partial<Lote>)} />
  )

  async function guardar() {
    setError(null)
    if (!draft.articulo_codigo?.trim() && !draft.descripcion?.trim()) {
      setError('Indica al menos el artículo o la descripción del lote para poder guardarlo.')
      return
    }
    setSaving(true)
    const { id: _id, ...valores } = draft
    const limpio = Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, typeof v === 'string' ? v.trim() || null : v]))
    const res =
      mode === 'alta'
        ? await supabase.from('lote').insert(limpio).select('id').single()
        : await supabase.from('lote').update(limpio).eq('id', registro.id!).select('id').single()
    setSaving(false)
    if (res.error) {
      setError(
        esSinTabla(res.error)
          ? SIN_TABLA
          : res.error.code === '23503'
            ? 'Algún código (tienda, proveedor, artículo o país) no existe. Elígelo con el botón «···» de su campo.'
            : res.error.code === '42501'
              ? 'No tienes permiso para modificar lotes. Pide a un administrador que te dé acceso a Almacén → Control de Lotes.'
              : res.error.message,
      )
      return
    }
    const nuevoId = (res.data as { id: number }).id
    await cargarLista()
    setMode('consulta')
    if (nuevoId === actualId) {
      const { data } = await supabase.from('lote').select('*').eq('id', nuevoId).maybeSingle()
      const r = { ...VACIO, ...((data ?? {}) as Partial<Lote>) }
      setRegistro(r)
      setDraft(r)
    } else setActualId(nuevoId)
  }

  function cancelar() {
    setError(null)
    setDraft(registro)
    setMode('consulta')
  }

  async function borrar() {
    if (registro.id == null) return
    if (!confirm(`¿Eliminar el lote ${registro.id}${registro.descripcion ? ` ${registro.descripcion}` : ''}? Se borran también sus series y su stock (el stock general de los almacenes no cambia).`)) return
    const { data, error: e } = await supabase.from('lote').delete().eq('id', registro.id).select('id')
    if (e) return setError(e.message)
    if (!data?.length) return setError('No tienes permiso para eliminar lotes. Pide a un administrador que te dé acceso a Almacén → Control de Lotes.')
    const l = await cargarLista()
    const sig = ordenada[idx + 1]?.id ?? ordenada[idx - 1]?.id ?? l[0]?.id ?? null
    setActualId(sig)
  }

  if (cargando) return <div className="p-4 text-[13px]">Cargando…</div>

  const satelite = (c: ReactNode) =>
    mode === 'alta' || registro.id == null ? (
      <div className="min-h-[190px] p-3 text-[13px]">{vacia ? 'No hay ningún lote. Pulsa Nuevo para dar de alta el primero.' : 'Acepta el alta del lote para poder rellenar esta pestaña.'}</div>
    ) : (
      c
    )

  return (
    <div className="flex flex-col gap-1">
      {/* Cabecera: Tienda · Id. Lote · Nº De Lote Externo · Descripción del Lote */}
      <GwGroup className="grid grid-cols-[100px_150px_200px_minmax(0,1fr)] items-end gap-x-2">
        <GwField label="Tienda">
          <GwSelect value={draft.tienda_terminal_codigo ?? ''} disabled={ro} title="TIENDA" onChange={(e) => patch({ tienda_terminal_codigo: e.target.value || null })}>
            <option value="" />
            {tiendas.map((t) => (
              <option key={t.codigo} value={t.codigo}>
                {t.codigo}
              </option>
            ))}
          </GwSelect>
        </GwField>
        <GwField label="Id. Lote">
          <GwInput value={mode === 'alta' ? '' : (registro.id ?? '').toString()} disabled title="IDLOTE — lo pone el programa al aceptar el alta" />
        </GwField>
        <GwField label="Nº De Lote Externo">{txt('lote_externo', 'LOTEEXTERNO — nº de lote del fabricante')}</GwField>
        <GwField label="Descripción del Lote">{txt('descripcion', 'DESCRIPCION')}</GwField>
      </GwGroup>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <GwGroup title="Proveedor">
          <CodigoNombre
            tabla="proveedor"
            titulo="Proveedores"
            anchoCodigo={120}
            value={draft.proveedor_codigo}
            disabled={ro}
            title="PROVEEDOR"
            eq={{ tipo: 'proveedor' }}
            onChange={(v) => patch({ proveedor_codigo: v })}
          />
        </GwGroup>
        <GwGroup title="Artículo">
          <CodigoNombre
            tabla="articulo"
            clave="codigo_interno"
            campoNombre="descripcion"
            titulo="Artículos"
            anchoCodigo={95}
            value={draft.articulo_codigo}
            disabled={ro}
            title="ARTICULO"
            onChange={(v) => patch({ articulo_codigo: v })}
          />
        </GwGroup>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-2">
        <GwGroup title="Códigos de barras" className="flex flex-col gap-1">
          <GwInline label={<span className="inline-block w-[110px]">EAN*UCC-14:</span>}>{txt('ean_ucc14', 'EAN UCC-14', '!w-[230px]')}</GwInline>
          <GwInline label={<span className="inline-block w-[110px]">1º EAN 128:</span>}>{txt('ean128_1', '1º EAN 128')}</GwInline>
          <GwInline label={<span className="inline-block w-[110px]">2º EAN 128:</span>}>{txt('ean128_2', '2º EAN 128')}</GwInline>
          <GwInline label={<span className="inline-block w-[110px]">SSCC:</span>}>{txt('sscc', 'SSCC — código de la unidad logística')}</GwInline>
        </GwGroup>
        <GwGroup title="Fechas Consumo" className="flex flex-col gap-1">
          <GwInline label={<span className="inline-block w-[110px]">Fech. Entrada:</span>}>{fecha('fecha_entrada', 'Fecha de entrada')}</GwInline>
          <GwInline label={<span className="inline-block w-[110px]">F. Envasado..:</span>}>{fecha('fecha_envasado', 'Fecha de envasado')}</GwInline>
          <GwInline label={<span className="inline-block w-[110px]">F. Cons. Pref.:</span>}>{fecha('fecha_consumo_preferente', 'Fecha de consumo preferente')}</GwInline>
          <GwInline label={<span className="inline-block w-[110px]">F. Caducidad:</span>}>{fecha('fecha_caducidad', 'Fecha de caducidad')}</GwInline>
        </GwGroup>
      </div>

      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[13px] text-[#a4262c]">{error}</div>}

      <GwTabs rows={TABS} active={tab} onChange={setTab}>
        {tab === 'operativa' ? (
          <GwOperativa
            bloques={[
              {
                titulo: 'Cómo se usa',
                pasos: [
                  'Pulsa Nuevo (F3), elige el artículo y el proveedor con «···», escribe el nº de lote del fabricante y las fechas, y Acepta (F1). El Id. Lote lo pone el programa.',
                  'En «Datos de Producción» se apunta la trazabilidad (variedad, países, registros sanitarios y fechas) cuando el producto la exige.',
                  'En «Series o Sublotes» se dan de alta los números de serie del lote (botón Nueva línea).',
                  'En «Stock del Lote» se apunta cuánto hay de cada serie en cada almacén.',
                ],
                notas: [
                  'El stock del lote es informativo: no cambia el stock general de los almacenes. Para eso, Almacén → Regularización de Stock.',
                  'Las rejillas se pueden tocar cuando la ficha está guardada (no hace falta pulsar Modificar).',
                  'La consulta antigua de lotes por caducidad y sus movimientos sigue en «Consulta de movimientos».',
                ],
              },
            ]}
          />
        ) : vacia ? (
          <div className="min-h-[190px] p-3 text-[13px]">No hay ningún lote. Pulsa Nuevo para dar de alta el primero.</div>
        ) : (
          <>
            {tab === 'produccion' && <DatosProduccion d={draft} ro={ro} patch={patch} txt={txt} fecha={fecha} />}
            {tab === 'series' && satelite(<SeriesLote loteId={registro.id!} />)}
            {tab === 'stock' && satelite(<StockLote loteId={registro.id!} />)}
          </>
        )}
      </GwTabs>

      <GwRecordBar
        mode={mode}
        canNavigate={mode === 'consulta' && ordenada.length > 0}
        saving={saving}
        onFirst={() => setActualId(ordenada[0]?.id ?? null)}
        onPrev={() => idx > 0 && setActualId(ordenada[idx - 1].id)}
        onNext={() => idx < ordenada.length - 1 && setActualId(ordenada[idx + 1].id)}
        onLast={() => setActualId(ordenada[ordenada.length - 1]?.id ?? null)}
        onSort={() => setOrden((o) => (o === 'id' ? 'descripcion' : 'id'))}
        onSearch={() => setBuscar(true)}
        onPrint={() => window.print()}
        onNew={() => {
          setError(null)
          setDraft({ ...VACIO, fecha_entrada: hoy() })
          setMode('alta')
        }}
        onEdit={() => registro.id != null && setMode('edicion')}
        onDelete={borrar}
        onSave={guardar}
        onCancel={cancelar}
        onExit={() => navigate('/')}
      />
      <div className="flex text-[11px] text-[#444]">
        <span>
          Orden: {orden === 'id' ? 'por Id. Lote' : 'por descripción'}
          {idx >= 0 ? ` · Registro ${idx + 1} de ${ordenada.length}` : ''}
          {mode === 'alta' ? ' · Alta de lote' : mode === 'edicion' ? ' · Modificando' : ''}
        </span>
        <button type="button" className="ml-auto underline" onClick={() => navigate('/almacen/lotes/consulta')}>
          Consulta de movimientos
        </button>
      </div>

      {buscar && (
        <GwLookupDialog<{ id: number; descripcion: string | null; lote_externo: string | null; articulo_codigo: string | null } & Record<string, unknown>>
          title="Buscar Lote"
          table="lote"
          columns={[
            { key: 'id', label: 'Id. Lote', width: 90 },
            { key: 'lote_externo', label: 'Nº Lote Externo', width: 150 },
            { key: 'articulo_codigo', label: 'Artículo', width: 110 },
            { key: 'descripcion', label: 'Descripción del Lote' },
          ]}
          searchColumns={['lote_externo', 'articulo_codigo', 'descripcion']}
          orderBy={orden === 'id' ? 'id' : 'descripcion'}
          keyColumn="id"
          onPick={(r) => {
            setBuscar(false)
            setActualId(Number(r.id))
          }}
          onClose={() => setBuscar(false)}
        />
      )}
    </div>
  )
}

/** Código + nombre + «···», como Proveedor, Artículo y los países de GeminisWin. */
function CodigoNombre({
  tabla,
  clave = 'codigo',
  campoNombre = 'nombre',
  titulo,
  anchoCodigo,
  value,
  disabled,
  title,
  eq,
  onChange,
}: {
  tabla: string
  clave?: string
  campoNombre?: string
  titulo: string
  anchoCodigo: number
  value: string | null
  disabled?: boolean
  title?: string
  eq?: Record<string, string>
  onChange: (v: string | null) => void
}) {
  const [nombre, setNombre] = useState('')
  const [abierto, setAbierto] = useState(false)
  useEffect(() => {
    const c = value?.trim()
    if (!c) return setNombre('')
    let vivo = true
    supabase
      .from(tabla)
      .select(campoNombre)
      .eq(clave, c)
      .maybeSingle()
      .then(({ data }) => vivo && setNombre(data ? String((data as unknown as Record<string, unknown>)[campoNombre] ?? '') : 'No existe'))
    return () => {
      vivo = false
    }
  }, [tabla, clave, campoNombre, value])
  const columnas: GwLookupColumn[] = [
    { key: clave, label: 'Código', width: 110 },
    { key: campoNombre, label: campoNombre === 'nombre' ? 'Nombre' : 'Descripción' },
  ]
  return (
    <span className="flex min-w-0 gap-1">
      <GwInput
        style={{ width: anchoCodigo }}
        className="flex-none"
        value={value ?? ''}
        disabled={disabled}
        title={title}
        onChange={(e) => onChange(e.target.value.trim() === '' ? null : e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'F4' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
            e.preventDefault()
            setAbierto(true)
          }
        }}
      />
      <span className="flex min-w-0 flex-1">
        <GwInput className="min-w-0 flex-1" value={nombre} disabled readOnly tabIndex={-1} />
        <GwLookupButton disabled={disabled} onClick={() => setAbierto(true)} title={`Buscar (${titulo})`} />
      </span>
      {abierto && (
        <GwLookupDialog<Record<string, unknown>>
          title={titulo}
          table={tabla}
          columns={columnas}
          searchColumns={[clave, campoNombre]}
          orderBy={clave}
          keyColumn={clave}
          eq={eq}
          onPick={(r) => {
            setAbierto(false)
            onChange(String(r[clave] ?? '') || null)
          }}
          onClose={() => setAbierto(false)}
        />
      )}
    </span>
  )
}

function DatosProduccion({
  d,
  ro,
  patch,
  txt,
  fecha,
}: {
  d: Lote
  ro: boolean
  patch: (p: Partial<Lote>) => void
  txt: (k: keyof Lote, title: string, extra?: string) => ReactNode
  fecha: (k: keyof Lote, title: string) => ReactNode
}) {
  const pais = (k: keyof Lote, titulo: string) => (
    <GwGroup title={titulo}>
      <CodigoNombre tabla="pais" titulo="Países" anchoCodigo={55} value={d[k] as string | null} disabled={ro} title={titulo} onChange={(v) => patch({ [k]: v } as Partial<Lote>)} />
    </GwGroup>
  )
  return (
    <div className="grid min-h-[190px] grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
      <GwGroup title="Características" className="flex flex-col gap-1">
        <GwField label="Variedad">{txt('variedad', 'Variedad')}</GwField>
        <GwField label="Clasificación">{txt('clasificacion', 'Clasificación')}</GwField>
        <GwField label="Pieza">{txt('pieza', 'Pieza')}</GwField>
        <GwField label="Cond. Conservación">{txt('conservacion', 'Condiciones de conservación')}</GwField>
      </GwGroup>
      <div className="flex flex-col gap-1">
        {pais('pais_produccion_codigo', 'País de Producción')}
        {pais('pais_nacimiento_codigo', 'País de Nacimiento')}
        {pais('pais_sacrificio_codigo', 'País de Sacrificio')}
        {pais('pais_despiece_codigo', 'País de Despiece')}
      </div>
      <div className="flex flex-col gap-1">
        <GwField label="Fecha Produción">{fecha('fecha_produccion', 'Fecha de producción')}</GwField>
        <GwField label="Fecha Nacimiento">{fecha('fecha_nacimiento', 'Fecha de nacimiento')}</GwField>
        <GwField label="Reg. Sanitario Sacrificio">{txt('registro_sanitario_sacrificio', 'Registro sanitario del matadero')}</GwField>
        <GwField label="Reg. Sanitario Despiece">{txt('registro_sanitario_despiece', 'Registro sanitario de la sala de despiece')}</GwField>
      </div>
      <div className="flex flex-col gap-1">
        {pais('pais_cebo_codigo', 'País de Cebo')}
        <GwField label="Fecha Sacrificio">{fecha('fecha_sacrificio', 'Fecha de sacrificio')}</GwField>
        <GwField label="Fech. de Envasado">{fecha('fecha_envasado_despiece', 'Fecha de envasado (despiece)')}</GwField>
      </div>
    </div>
  )
}

const celdaCls = 'h-[26px]'

/** Pestaña «Series o Sublotes»: Nº Serie o Sublote · Fecha Entrada · Nº Serie Secundario · Nº Serie Electrónico. */
function SeriesLote({ loteId }: { loteId: number }) {
  const [filas, setFilas] = useState<Serie[]>([])
  const [sel, setSel] = useState(0)
  const [editar, setEditar] = useState<Serie | 'nuevo' | null>(null)
  const [buscar, setBuscar] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from('lote_serie').select('id, numero_serie, fecha_entrada, serie_secundaria, serie_electronica').eq('lote_id', loteId).order('numero_serie')
    if (e) return setError(esSinTabla(e) ? SIN_TABLA : e.message)
    setFilas((data ?? []) as Serie[])
  }, [loteId])
  useEffect(() => {
    cargar()
    setSel(0)
  }, [cargar])

  async function borrar() {
    const f = filas[sel]
    if (!f || !confirm(`¿Borrar la serie ${f.numero_serie}?`)) return
    const { error: e } = await supabase.from('lote_serie').delete().eq('id', f.id)
    if (e) return setError(e.message)
    setSel(0)
    cargar()
  }

  return (
    <div className="flex min-h-[190px] flex-col gap-1">
      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[13px] text-[#a4262c]">{error}</div>}
      <div className="h-[165px] overflow-y-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid" title="Series o sublotes del lote">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: '30%' }}>Nº Serie o Sublote</th>
              <th style={{ width: 150 }}>Fecha Entrada</th>
              <th>Nº Serie Secundario</th>
              <th>Nº Serie Electrónico</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.id} className={`${celdaCls} ${i === sel ? 'gw-selected' : ''}`} onClick={() => setSel(i)} onDoubleClick={() => setEditar(f)}>
                <td>{f.numero_serie}</td>
                <td>{fechaEs(f.fecha_entrada)}</td>
                <td>{f.serie_secundaria}</td>
                <td>{f.serie_electronica}</td>
              </tr>
            ))}
            <FilasVacias cols={4} ocupadas={filas.length} total={7} />
          </tbody>
        </table>
      </div>
      <div className="flex items-center">
        <GridMiniBar
          modificar={filas.length > 0}
          borrar={filas.length > 0}
          buscar={filas.length > 0}
          onNuevo={() => setEditar('nuevo')}
          onModificar={() => filas[sel] && setEditar(filas[sel])}
          onBorrar={borrar}
          onBuscar={() => setBuscar(true)}
        />
        <span className="ml-auto pr-4 text-[17px] text-[#1a4fd0]">Nº Lineas: {filas.length}</span>
      </div>
      {editar && (
        <DialogoSerie
          loteId={loteId}
          serie={editar === 'nuevo' ? null : editar}
          onClose={() => setEditar(null)}
          onHecho={() => {
            setEditar(null)
            cargar()
          }}
        />
      )}
      {buscar && (
        <BuscarTexto
          filas={filas.map((f) => `${f.numero_serie} ${f.serie_secundaria ?? ''} ${f.serie_electronica ?? ''}`)}
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

function DialogoSerie({ loteId, serie, onClose, onHecho }: { loteId: number; serie: Serie | null; onClose: () => void; onHecho: () => void }) {
  const [num, setNum] = useState(serie?.numero_serie ?? '')
  const [fe, setFe] = useState<string | null>(serie?.fecha_entrada ?? hoy())
  const [sec, setSec] = useState(serie?.serie_secundaria ?? '')
  const [ele, setEle] = useState(serie?.serie_electronica ?? '')
  const [error, setError] = useState<string | null>(null)
  async function aceptar() {
    if (!num.trim()) return setError('Escribe el nº de serie o sublote.')
    const v = { numero_serie: num.trim(), fecha_entrada: fe, serie_secundaria: sec.trim() || null, serie_electronica: ele.trim() || null }
    const { error: e } = serie ? await supabase.from('lote_serie').update(v).eq('id', serie.id) : await supabase.from('lote_serie').insert({ lote_id: loteId, ...v })
    if (e) return setError(e.code === '23505' ? `La serie ${num.trim()} ya está en este lote: escribe otra o modifica la que hay.` : e.message)
    onHecho()
  }
  const fila = 'grid grid-cols-[170px_minmax(0,1fr)] items-center gap-2'
  return (
    <ModalGw titulo={serie ? 'Modificar serie o sublote' : 'Nueva serie o sublote'} onClose={onClose} ancho={500}>
      <div className="flex flex-col gap-1.5 text-[15px]">
        <label className={fila}>
          <span>Nº Serie o Sublote</span>
          <GwInput autoFocus value={num} onChange={(e) => setNum(e.target.value)} />
        </label>
        <label className={fila}>
          <span>Fecha Entrada</span>
          <GwDate value={fe} onChange={setFe} />
        </label>
        <label className={fila}>
          <span>Nº Serie Secundario</span>
          <GwInput value={sec} onChange={(e) => setSec(e.target.value)} />
        </label>
        <label className={fila}>
          <span>Nº Serie Electrónico</span>
          <GwInput value={ele} onChange={(e) => setEle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && aceptar()} />
        </label>
        {error && <span className="text-[#c42b1c]">{error}</span>}
        <BotonesDialogo onAceptar={aceptar} onCancelar={onClose} />
      </div>
    </ModalGw>
  )
}

/** Pestaña «Stock del Lote»: Nº Serie o Sublote · Alm. · Nombre Almacén · Stock, con el total y el aviso de GeminisWin. */
function StockLote({ loteId }: { loteId: number }) {
  const almacenes = useAlmacenes()
  const [filas, setFilas] = useState<StockLinea[]>([])
  const [sel, setSel] = useState(0)
  const [editar, setEditar] = useState<StockLinea | 'nuevo' | null>(null)
  const [buscar, setBuscar] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from('lote_stock').select('id, numero_serie, almacen_codigo, stock').eq('lote_id', loteId).order('numero_serie').order('almacen_codigo')
    if (e) return setError(esSinTabla(e) ? SIN_TABLA : e.message)
    setFilas(((data ?? []) as StockLinea[]).map((f) => ({ ...f, stock: Number(f.stock) })))
  }, [loteId])
  useEffect(() => {
    cargar()
    setSel(0)
  }, [cargar])

  const nombreAlm = (c: string) => almacenes.find((a) => a.codigo === c)?.nombre ?? ''
  const total = filas.reduce((s, f) => s + f.stock, 0)

  async function borrar() {
    const f = filas[sel]
    if (!f || !confirm(`¿Borrar la línea de stock de la serie «${f.numero_serie || '(sin serie)'}» en el almacén ${f.almacen_codigo}?`)) return
    const { error: e } = await supabase.from('lote_stock').delete().eq('id', f.id)
    if (e) return setError(e.message)
    setSel(0)
    cargar()
  }

  return (
    <div className="grid min-h-[190px] grid-cols-[minmax(0,1fr)_290px] gap-2">
      <div className="flex min-w-0 flex-col gap-1">
        {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[13px] text-[#a4262c]">{error}</div>}
        <div className="h-[165px] overflow-y-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid" title="Stock del lote por serie y almacén">
            <thead className="sticky top-0">
              <tr>
                <th>Nº Serie o Sublote</th>
                <th style={{ width: 60 }}>Alm.</th>
                <th>Nombre Almacén</th>
                <th style={{ width: 130 }} className="!text-right">
                  Stock
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={f.id} className={`${celdaCls} ${i === sel ? 'gw-selected' : ''}`} onClick={() => setSel(i)} onDoubleClick={() => setEditar(f)}>
                  <td>{f.numero_serie}</td>
                  <td>{f.almacen_codigo}</td>
                  <td className="truncate">{nombreAlm(f.almacen_codigo)}</td>
                  <td className="text-right">{formatGw(f.stock, 3)}</td>
                </tr>
              ))}
              <FilasVacias cols={4} ocupadas={filas.length} total={7} />
            </tbody>
          </table>
        </div>
        <div className="flex items-center">
          <GridMiniBar
            modificar={filas.length > 0}
            borrar={filas.length > 0}
            buscar={filas.length > 0}
            onNuevo={() => setEditar('nuevo')}
            onModificar={() => filas[sel] && setEditar(filas[sel])}
            onBorrar={borrar}
            onBuscar={() => setBuscar(true)}
          />
          <span className="ml-auto pr-8 text-[17px] font-bold">{formatGw(total, 3)}</span>
        </div>
      </div>
      <div className="border border-[var(--gw-border-light)] p-1 text-[17px] leading-[21px] text-[#1a4fd0]">
        Las modificaciones efectuadas aquí, del stock de los Lotes, no repercutirán en el stock general de los almacenes. Para poder modificar el Stock general de los almacenes, se debe
        hacer en la opción de Regularización de Stock.
      </div>
      {editar && (
        <DialogoStock
          loteId={loteId}
          linea={editar === 'nuevo' ? null : editar}
          almacenes={almacenes}
          onClose={() => setEditar(null)}
          onHecho={() => {
            setEditar(null)
            cargar()
          }}
        />
      )}
      {buscar && (
        <BuscarTexto
          filas={filas.map((f) => `${f.numero_serie} ${f.almacen_codigo} ${nombreAlm(f.almacen_codigo)}`)}
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

function DialogoStock({
  loteId,
  linea,
  almacenes,
  onClose,
  onHecho,
}: {
  loteId: number
  linea: StockLinea | null
  almacenes: { codigo: string; nombre: string }[]
  onClose: () => void
  onHecho: () => void
}) {
  const [series, setSeries] = useState<string[]>([])
  const [serie, setSerie] = useState(linea?.numero_serie ?? '')
  const [alm, setAlm] = useState(linea?.almacen_codigo ?? '')
  const [stock, setStock] = useState<number | null>(linea?.stock ?? null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    supabase
      .from('lote_serie')
      .select('numero_serie')
      .eq('lote_id', loteId)
      .order('numero_serie')
      .then(({ data }) => setSeries(((data ?? []) as { numero_serie: string }[]).map((s) => s.numero_serie)))
  }, [loteId])
  async function aceptar() {
    if (!alm) return setError('Elige el almacén.')
    const v = { numero_serie: serie, almacen_codigo: alm, stock: stock ?? 0 }
    const { error: e } = linea ? await supabase.from('lote_stock').update(v).eq('id', linea.id) : await supabase.from('lote_stock').insert({ lote_id: loteId, ...v })
    if (e) return setError(e.code === '23505' ? 'Esa serie ya tiene una línea en ese almacén: modifícala en lugar de crear otra.' : e.message)
    onHecho()
  }
  const fila = 'grid grid-cols-[170px_minmax(0,1fr)] items-center gap-2'
  return (
    <ModalGw titulo={linea ? 'Modificar stock del lote' : 'Nueva línea de stock del lote'} onClose={onClose} ancho={500}>
      <div className="flex flex-col gap-1.5 text-[15px]">
        <label className={fila}>
          <span>Nº Serie o Sublote</span>
          <GwSelect value={serie} onChange={(e) => setSerie(e.target.value)} autoFocus>
            <option value="">(Sin serie)</option>
            {series.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {serie && !series.includes(serie) && <option value={serie}>{serie}</option>}
          </GwSelect>
        </label>
        <label className={fila}>
          <span>Almacén</span>
          <GwSelect value={alm} onChange={(e) => setAlm(e.target.value)}>
            <option value="" />
            {almacenes.map((a) => (
              <option key={a.codigo} value={a.codigo}>
                {a.codigo} {a.nombre}
              </option>
            ))}
          </GwSelect>
        </label>
        <label className={fila}>
          <span>Stock</span>
          <GwNumber value={stock} decimals={3} onChange={setStock} />
        </label>
        <span className="text-[12px] text-[#6d6d6d]">No cambia el stock general del almacén (eso se hace en Regularización de Stock).</span>
        {error && <span className="text-[#c42b1c]">{error}</span>}
        <BotonesDialogo onAceptar={aceptar} onCancelar={onClose} />
      </div>
    </ModalGw>
  )
}

function BotonesDialogo({ onAceptar, onCancelar }: { onAceptar: () => void; onCancelar: () => void }) {
  return (
    <div className="mt-1 flex justify-end gap-2">
      <button type="button" className="gw-btn !h-[30px] !w-[110px]" onClick={onAceptar}>
        Aceptar
      </button>
      <button type="button" className="gw-btn !h-[30px] !w-[110px]" onClick={onCancelar}>
        Cancelar
      </button>
    </div>
  )
}

/** Buscar una línea dentro de una rejilla por texto. */
function BuscarTexto({ filas, onPick, onClose }: { filas: string[]; onPick: (i: number) => void; onClose: () => void }) {
  const [t, setT] = useState('')
  const ir = () => {
    const i = filas.findIndex((f) => f.toLowerCase().includes(t.trim().toLowerCase()))
    if (i >= 0) onPick(i)
  }
  return (
    <ModalGw titulo="Localizar línea" onClose={onClose} ancho={380}>
      <div className="flex gap-2">
        <GwInput autoFocus value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ir()} />
        <button type="button" className="gw-btn !h-[28px] !w-[90px]" onClick={ir}>
          Buscar
        </button>
      </div>
    </ModalGw>
  )
}
