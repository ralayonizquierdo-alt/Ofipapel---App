import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { GwField, GwInput, GwLookupButton, GwPlusButton, GwTabs, type GwTabDef } from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { type Articulo, type ArticuloPrecioNivel, emptyArticulo, NIVELES_TARIFA } from './types'
import { COSTE_FIELDS, aplicarCambioNivel, costeBase, recalcularTodos, type NivelPatch } from './pricing'
import { CodigosBarrasDialog, CodigosCompraDialog } from './dialogs/CodigosDialogs'
import { TabCaracteristicas } from './tabs/TabCaracteristicas'
import { TabUnidadesVenta } from './tabs/TabUnidadesVenta'
import { TabObservaciones } from './tabs/TabObservaciones'
import { TabParametrosPvp } from './tabs/TabParametrosPvp'
import { TabPreciosOferta } from './tabs/TabPreciosOferta'
import { TabAlmacen } from './tabs/TabAlmacen'
import { TabTallasColores } from './tabs/TabTallasColores'
import { TabEquivalentes } from './tabs/TabEquivalentes'
import { TabPreciosProveedor } from './tabs/TabPreciosProveedor'
import { TabComposicion } from './tabs/TabComposicion'
import { TabImagen, TabWeb } from './tabs/TabImagenWeb'

interface Maestro {
  codigo: string
  nombre: string
}

interface CodigoDesc {
  codigo_interno: string
  descripcion: string
}

const TAB_ROWS: GwTabDef[][] = [
  [
    { key: 'proveedores', label: 'Precios por Proveedor' },
    { key: 'composicion', label: 'Composición Articulo' },
    { key: 'imagen', label: 'Imagen' },
    { key: 'web', label: 'Web' },
  ],
  [
    { key: 'caracteristicas', label: 'Características' },
    { key: 'unidades', label: 'Unds. de Stock y Venta' },
    { key: 'observaciones', label: 'Observaciones' },
    { key: 'parametros', label: 'Parámetros para el Cálculo del Pvp' },
    { key: 'ofertas', label: 'Precios de oferta' },
    { key: 'almacen', label: 'Almacén' },
    { key: 'tallas', label: 'Tallas y colores' },
    { key: 'equivalentes', label: 'Equivalentes' },
  ],
]

// Pestañas cuyos datos viven en tablas satélite: necesitan que el artículo ya exista.
const TABS_SATELITE = new Set(['proveedores', 'composicion', 'unidades', 'ofertas', 'tallas', 'equivalentes'])

function nivelesVacios(codigo: string): ArticuloPrecioNivel[] {
  return NIVELES_TARIFA.map((n) => ({
    articulo_codigo: codigo,
    nivel_tarifa: n.nivel,
    pvp: 0,
    incremento_pct: null,
    modo_calculo: n.nivel >= 4 ? 'D' : 'P',
    permite_descuento_linea: false,
  }))
}

type Lookup = 'marca' | 'proveedor' | 'familia' | 'buscar' | 'compra' | 'barras' | null

export function ArticuloFichaPage() {
  const { codigo } = useParams<{ codigo: string }>()
  const navigate = useNavigate()
  const isNew = codigo === 'nuevo'

  const [mode, setMode] = useState<'consulta' | 'edicion' | 'alta'>(isNew ? 'alta' : 'consulta')
  const [articulo, setArticulo] = useState<Articulo>({ ...emptyArticulo, actualizado_en: '' })
  const [draft, setDraft] = useState<Articulo>({ ...emptyArticulo, actualizado_en: '' })
  const [niveles, setNiveles] = useState<ArticuloPrecioNivel[]>(() => nivelesVacios(''))
  const [nivelesOrig, setNivelesOrig] = useState<ArticuloPrecioNivel[]>(() => nivelesVacios(''))
  const [preciosCargados, setPreciosCargados] = useState(false)
  const [loading, setLoading] = useState(true)
  const [vacio, setVacio] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proveedores, setProveedores] = useState<Maestro[]>([])
  const [plantillas, setPlantillas] = useState<Maestro[]>([])
  const [lista, setLista] = useState<CodigoDesc[]>([])
  const [orden, setOrden] = useState<'codigo' | 'descripcion'>('codigo')
  const [nombreProveedor, setNombreProveedor] = useState('')
  const [descFamilia, setDescFamilia] = useState('')
  const [lookup, setLookup] = useState<Lookup>(null)
  const [tab, setTab] = useState('caracteristicas')

  const editing = mode !== 'consulta'

  useEffect(() => {
    Promise.all([
      supabase.from('proveedor').select('codigo, nombre').order('codigo'),
      supabase.from('plantilla_tarifa').select('codigo, descripcion').order('codigo'),
      supabase.from('articulo').select('codigo_interno, descripcion').order('codigo_interno'),
    ]).then(([p, t, codes]) => {
      setProveedores(p.data ?? [])
      setPlantillas((t.data ?? []).map((r) => ({ codigo: r.codigo, nombre: r.descripcion })))
      setLista((codes.data ?? []) as CodigoDesc[])
    })
  }, [])

  useEffect(() => {
    setError(null)
    if (isNew) {
      const vacioArt = { ...emptyArticulo, actualizado_en: '' }
      setArticulo(vacioArt)
      setDraft(vacioArt)
      setNiveles(nivelesVacios(''))
      setNivelesOrig(nivelesVacios(''))
      setPreciosCargados(true)
      setNombreProveedor('')
      setDescFamilia('')
      setVacio(false)
      setMode('alta')
      setLoading(false)
      return
    }
    if (!codigo) {
      // Como en GeminisWin, Almacén → Artículos abre directamente la ficha del primer artículo.
      supabase
        .from('articulo')
        .select('codigo_interno')
        .order('codigo_interno')
        .limit(1)
        .then(({ data }) => {
          if (data && data[0]) navigate(`/articulos/${encodeURIComponent(data[0].codigo_interno)}`, { replace: true })
          else {
            setVacio(true)
            setMode('consulta')
            setLoading(false)
          }
        })
      return
    }
    setLoading(true)
    setPreciosCargados(false)
    Promise.all([
      supabase.from('articulo').select('*').eq('codigo_interno', codigo).maybeSingle(),
      supabase.from('articulo_precio_nivel').select('*').eq('articulo_codigo', codigo),
    ]).then(([a, p]) => {
      if (a.error || !a.data) {
        setError('No se ha encontrado el artículo.')
        setLoading(false)
        return
      }
      const art = a.data as Articulo
      const base = nivelesVacios(art.codigo_interno)
      for (const row of (p.data ?? []) as ArticuloPrecioNivel[]) {
        const i = base.findIndex((b) => b.nivel_tarifa === row.nivel_tarifa)
        if (i >= 0)
          base[i] = {
            ...row,
            pvp: Number(row.pvp),
            incremento_pct: row.incremento_pct == null ? null : Number(row.incremento_pct),
          }
      }
      setArticulo(art)
      setDraft(art)
      setNiveles(base)
      setNivelesOrig(base)
      setPreciosCargados(true)
      setVacio(false)
      setMode('consulta')
      setLoading(false)
    })
  }, [codigo, isNew, navigate])

  useEffect(() => {
    const c = draft.proveedor_habitual_codigo
    if (!c) return setNombreProveedor('')
    const local = proveedores.find((p) => p.codigo === c)
    if (local) return setNombreProveedor(local.nombre)
    supabase
      .from('proveedor')
      .select('nombre')
      .eq('codigo', c)
      .maybeSingle()
      .then(({ data }) => setNombreProveedor(data?.nombre ?? ''))
  }, [draft.proveedor_habitual_codigo, proveedores])

  useEffect(() => {
    const c = draft.familia_codigo
    if (!c) return setDescFamilia('')
    supabase
      .from('familia')
      .select('descripcion')
      .eq('codigo', c)
      .maybeSingle()
      .then(({ data }) => setDescFamilia(data?.descripcion ?? ''))
  }, [draft.familia_codigo])

  function patchArticulo(patch: Partial<Articulo>) {
    const next = { ...draft, ...patch }
    const tocaCoste = Object.keys(patch).some((k) => COSTE_FIELDS.includes(k as keyof Articulo))
    if (tocaCoste && preciosCargados && !next.no_calcular_pvp_auto) {
      const base = costeBase(next)
      if (base != null) {
        const recalc = recalcularTodos(niveles, base)
        setNiveles(recalc)
        next.coste_usado_calculo_pvp = base
        next.pvp = recalc.find((n) => n.nivel_tarifa === 0)?.pvp ?? next.pvp
      }
    }
    setDraft(next)
  }

  function recalcularPvps() {
    const base = costeBase(draft)
    if (!preciosCargados || base == null) return
    const recalc = recalcularTodos(niveles, base)
    setNiveles(recalc)
    setDraft((d) => ({ ...d, coste_usado_calculo_pvp: base, pvp: recalc.find((n) => n.nivel_tarifa === 0)?.pvp ?? d.pvp }))
  }

  function cambiarNivel(nivel: number, patch: NivelPatch) {
    const base = costeBase(draft)
    const next = aplicarCambioNivel(niveles, nivel, patch, base)
    setNiveles(next)
    setDraft((d) => ({
      ...d,
      pvp: next.find((n) => n.nivel_tarifa === 0)?.pvp ?? d.pvp,
      coste_usado_calculo_pvp: base ?? d.coste_usado_calculo_pvp,
    }))
  }

  const preciosCambiados = useMemo(
    () =>
      niveles.some((n) => {
        const o = nivelesOrig.find((x) => x.nivel_tarifa === n.nivel_tarifa)
        return (
          !o ||
          o.pvp !== n.pvp ||
          o.incremento_pct !== n.incremento_pct ||
          o.modo_calculo !== n.modo_calculo ||
          o.permite_descuento_linea !== n.permite_descuento_linea
        )
      }),
    [niveles, nivelesOrig],
  )

  async function handleSave() {
    setError(null)
    if (!draft.codigo_interno.trim() || !draft.descripcion.trim()) {
      setError('El código interno y la descripción son obligatorios.')
      return
    }
    setSaving(true)
    const { actualizado_en: _ignorado, ...resto } = draft
    const payload = {
      ...resto,
      codigo_interno: resto.codigo_interno.trim(),
      fecha_ultima_modificacion_pvp: preciosCambiados ? new Date().toISOString() : resto.fecha_ultima_modificacion_pvp,
    }
    const res =
      mode === 'alta'
        ? await supabase.from('articulo').insert({ ...payload, fecha_alta: payload.fecha_alta ?? new Date().toISOString().slice(0, 10) })
        : await supabase.from('articulo').update(payload).eq('codigo_interno', articulo.codigo_interno)
    if (res.error) {
      setSaving(false)
      setError(res.error.code === '23505' ? `Ya existe un artículo con el código ${payload.codigo_interno}.` : res.error.message)
      return
    }
    if (preciosCambiados || mode === 'alta') {
      const rows = niveles.map((n) => ({ ...n, articulo_codigo: payload.codigo_interno, pvp: n.pvp ?? 0 }))
      const { error: err } = await supabase.from('articulo_precio_nivel').upsert(rows, { onConflict: 'articulo_codigo,nivel_tarifa' })
      if (err) {
        setSaving(false)
        setError(`Artículo guardado, pero los precios no: ${err.message}`)
        return
      }
    }
    setSaving(false)
    if (mode === 'alta') {
      setLista((l) => [...l, { codigo_interno: payload.codigo_interno, descripcion: payload.descripcion }])
      navigate(`/articulos/${encodeURIComponent(payload.codigo_interno)}`, { replace: true })
      return
    }
    const { data } = await supabase.from('articulo').select('*').eq('codigo_interno', payload.codigo_interno).maybeSingle()
    const guardado = (data as Articulo | null) ?? { ...draft }
    setArticulo(guardado)
    setDraft(guardado)
    setNivelesOrig(niveles)
    setMode('consulta')
  }

  function handleCancel() {
    if (mode === 'alta') {
      navigate(lista[0] ? `/articulos/${encodeURIComponent(lista[0].codigo_interno)}` : '/articulos')
      return
    }
    setDraft(articulo)
    setNiveles(nivelesOrig)
    setError(null)
    setMode('consulta')
  }

  async function handleDelete() {
    if (vacio || !articulo.codigo_interno) return
    if (!confirm(`¿Dar de baja el artículo ${articulo.codigo_interno}? Queda marcado como baja, no se borra.`)) return
    const { error: err } = await supabase
      .from('articulo')
      .update({ activo: false, fecha_baja: new Date().toISOString().slice(0, 10) })
      .eq('codigo_interno', articulo.codigo_interno)
    if (err) return setError(err.message)
    const hoy = new Date().toISOString().slice(0, 10)
    setArticulo((a) => ({ ...a, activo: false, fecha_baja: hoy }))
    setDraft((a) => ({ ...a, activo: false, fecha_baja: hoy }))
  }

  const ordenada = useMemo(
    () =>
      orden === 'codigo'
        ? lista
        : [...lista].sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es') || a.codigo_interno.localeCompare(b.codigo_interno)),
    [lista, orden],
  )
  const idx = ordenada.findIndex((r) => r.codigo_interno === articulo.codigo_interno)
  const canNavigate = mode === 'consulta' && ordenada.length > 0
  const goTo = (c?: string) => c && navigate(`/articulos/${encodeURIComponent(c)}`)

  const ro = !editing
  const txt = (key: keyof Articulo, extra: { readOnly?: boolean; className?: string; title?: string } = {}) => (
    <GwInput
      value={(draft[key] ?? '') as string}
      disabled={ro || extra.readOnly}
      className={extra.className}
      title={extra.title}
      onChange={(e) => patchArticulo({ [key]: e.target.value === '' ? null : e.target.value } as Partial<Articulo>)}
    />
  )

  if (loading) return <div className="p-4 text-[13px]">Cargando…</div>

  const satelitesBloqueados = mode === 'alta' || vacio
  const enAvisoSatelite = (contenido: ReactNode) =>
    satelitesBloqueados ? (
      <div className="p-3 text-[13px]">
        {vacio ? 'No hay ningún artículo. Pulsa Nuevo para dar de alta el primero.' : 'Acepta el alta del artículo para poder rellenar esta pestaña.'}
      </div>
    ) : (
      contenido
    )

  return (
    <div className="flex flex-col gap-1">
      {/* Cabecera, tres filas como en GeminisWin */}
      <div className="grid grid-cols-[220px_minmax(0,1fr)_250px] gap-x-2">
        <GwField label="Código Interno">
          <GwInput
            value={draft.codigo_interno}
            disabled={mode !== 'alta'}
            title="COD_INTERN"
            onChange={(e) => patchArticulo({ codigo_interno: e.target.value })}
          />
        </GwField>
        <GwField label="Descripción">{txt('descripcion', { title: 'DESCRIP' })}</GwField>
        <GwField label="Descr. Corta:">{txt('descripcion_corta', { title: 'DESCRCORTA' })}</GwField>
      </div>
      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-x-2">
        <GwField label="Códigos de Compra">
          <span className="flex">
            {txt('codigo_compra_habitual', { title: 'COD_COMPRA' })}
            <GwPlusButton title="Códigos de compra por proveedor" disabled={satelitesBloqueados} onClick={() => setLookup('compra')} />
          </span>
        </GwField>
        <GwField label="Código Venta">{txt('codigo_venta', { title: 'COD_VENTA' })}</GwField>
        <GwField label="Códigos de Barras">
          <span className="flex">
            {txt('codigo_barras_principal', { title: 'COD_BARRAS' })}
            <GwPlusButton title="Más códigos de barras" disabled={satelitesBloqueados} onClick={() => setLookup('barras')} />
          </span>
        </GwField>
        <GwField label="Marca">
          <span className="flex">
            {txt('marca_codigo', { title: 'MARCA' })}
            <GwLookupButton disabled={ro} onClick={() => setLookup('marca')} title="Buscar marca" />
          </span>
        </GwField>
        <GwField label="Campo Libre">{txt('campo_libre', { title: 'CMP_LIBRE' })}</GwField>
      </div>
      <div className="grid grid-cols-[150px_minmax(0,1.6fr)_150px_minmax(0,1.6fr)] gap-x-2">
        <GwField label="Proveedor">
          <span className="flex">
            {txt('proveedor_habitual_codigo', { title: 'COD_PROV' })}
            <GwLookupButton disabled={ro} onClick={() => setLookup('proveedor')} title="Buscar proveedor" />
          </span>
        </GwField>
        <GwField label="Nombre Proveedor">
          <span className="flex">
            <GwInput readOnly value={nombreProveedor} disabled={ro} />
            <GwLookupButton disabled={ro} onClick={() => setLookup('proveedor')} title="Buscar proveedor" />
          </span>
        </GwField>
        <GwField label="Familia">
          <span className="flex">
            {txt('familia_codigo', { title: 'COD_FAM' })}
            <GwLookupButton disabled={ro} onClick={() => setLookup('familia')} title="Buscar familia" />
          </span>
        </GwField>
        <GwField label="Descripción Familia">
          <span className="flex">
            <GwInput readOnly value={descFamilia} disabled={ro} />
            <GwLookupButton disabled={ro} onClick={() => setLookup('familia')} title="Buscar familia" />
          </span>
        </GwField>
      </div>

      {(error || (!articulo.activo && !vacio && mode !== 'alta')) && (
        <div className="text-[13px] text-[#c42b1c]">{error ?? 'Artículo dado de baja.'}</div>
      )}

      <div className="mt-1">
        <GwTabs rows={TAB_ROWS} active={tab} onChange={setTab}>
          {vacio && !TABS_SATELITE.has(tab) ? (
            <div className="p-3 text-[13px]">No hay ningún artículo. Pulsa Nuevo para dar de alta el primero.</div>
          ) : (
            <>
              {tab === 'caracteristicas' && (
                <TabCaracteristicas
                  articulo={draft}
                  editing={editing}
                  onChange={patchArticulo}
                  plantillas={plantillas}
                  niveles={niveles}
                  onNivelChange={cambiarNivel}
                  preciosCargados={preciosCargados}
                />
              )}
              {tab === 'unidades' && enAvisoSatelite(<TabUnidadesVenta articuloCodigo={articulo.codigo_interno} articulo={draft} editing={editing} onChange={patchArticulo} />)}
              {tab === 'observaciones' && <TabObservaciones articulo={draft} editing={editing} onChange={patchArticulo} />}
              {tab === 'parametros' && <TabParametrosPvp articulo={draft} editing={editing} onChange={patchArticulo} onRecalcularPvps={recalcularPvps} />}
              {tab === 'ofertas' && enAvisoSatelite(<TabPreciosOferta articuloCodigo={articulo.codigo_interno} editing={editing} costeBase={costeBase(draft)} />)}
              {tab === 'almacen' && <TabAlmacen articulo={draft} editing={editing} onChange={patchArticulo} />}
              {tab === 'tallas' && enAvisoSatelite(<TabTallasColores articuloCodigo={articulo.codigo_interno} editing={editing} />)}
              {tab === 'equivalentes' && enAvisoSatelite(<TabEquivalentes articuloCodigo={articulo.codigo_interno} />)}
              {tab === 'proveedores' &&
                enAvisoSatelite(<TabPreciosProveedor articuloCodigo={articulo.codigo_interno} proveedores={proveedores} />)}
              {tab === 'composicion' && enAvisoSatelite(<TabComposicion articuloCodigo={articulo.codigo_interno} articulo={draft} editing={mode !== 'consulta'} onChange={patchArticulo} />)}
              {tab === 'imagen' && <TabImagen articulo={draft} editing={editing} onChange={patchArticulo} />}
              {tab === 'web' && <TabWeb articulo={draft} editing={editing} onChange={patchArticulo} />}
            </>
          )}
        </GwTabs>
      </div>

      <GwRecordBar
        mode={mode}
        canNavigate={canNavigate}
        saving={saving}
        onFirst={() => goTo(ordenada[0]?.codigo_interno)}
        onPrev={() => goTo(ordenada[idx - 1]?.codigo_interno)}
        onNext={() => goTo(ordenada[idx + 1]?.codigo_interno)}
        onLast={() => goTo(ordenada[ordenada.length - 1]?.codigo_interno)}
        onSort={() => setOrden((o) => (o === 'codigo' ? 'descripcion' : 'codigo'))}
        onSearch={() => setLookup('buscar')}
        onPrint={() => window.print()}
        onNew={() => navigate('/articulos/nuevo')}
        onEdit={() => !vacio && setMode('edicion')}
        onDelete={handleDelete}
        onSave={handleSave}
        onCancel={handleCancel}
        onExit={() => navigate('/')}
      />
      <div className="text-[11px] text-[#444]">
        Orden: {orden === 'codigo' ? 'por código' : 'por descripción'}
        {idx >= 0 ? ` · Registro ${idx + 1} de ${ordenada.length}` : ''}
        {mode === 'alta' ? ' · Alta de artículo' : mode === 'edicion' ? ' · Modificando' : ''}
      </div>

      {lookup === 'marca' && (
        <GwLookupDialog<{ codigo: string }>
          title="Marcas"
          table="marca"
          columns={[{ key: 'codigo', label: 'Marca' }]}
          searchColumns={['codigo']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            patchArticulo({ marca_codigo: r.codigo })
            setLookup(null)
          }}
          onClose={() => setLookup(null)}
        />
      )}
      {lookup === 'proveedor' && (
        <GwLookupDialog<{ codigo: string; nombre: string }>
          title="Proveedores"
          table="proveedor"
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            patchArticulo({ proveedor_habitual_codigo: r.codigo })
            setLookup(null)
          }}
          onClose={() => setLookup(null)}
        />
      )}
      {lookup === 'familia' && (
        <GwLookupDialog<{ codigo: string; descripcion: string }>
          title="Familias"
          table="familia"
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'descripcion', label: 'Descripción' },
          ]}
          searchColumns={['codigo', 'descripcion']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            patchArticulo({ familia_codigo: r.codigo })
            setLookup(null)
          }}
          onClose={() => setLookup(null)}
        />
      )}
      {lookup === 'buscar' && (
        <GwLookupDialog<{ codigo_interno: string; descripcion: string; codigo_barras_principal: string | null }>
          title="Buscar Artículo"
          table="articulo"
          columns={[
            { key: 'codigo_interno', label: 'Código Interno', width: 120 },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'codigo_barras_principal', label: 'Código de Barras', width: 140 },
          ]}
          searchColumns={['codigo_interno', 'descripcion', 'codigo_barras_principal']}
          orderBy={orden === 'codigo' ? 'codigo_interno' : 'descripcion'}
          keyColumn="codigo_interno"
          onPick={(r) => {
            setLookup(null)
            goTo(r.codigo_interno)
          }}
          onClose={() => setLookup(null)}
        />
      )}
      {lookup === 'compra' && (
        <CodigosCompraDialog
          articuloCodigo={articulo.codigo_interno}
          proveedores={proveedores}
          editable={editing}
          onClose={() => setLookup(null)}
        />
      )}
      {lookup === 'barras' && (
        <CodigosBarrasDialog articuloCodigo={articulo.codigo_interno} editable={editing} onClose={() => setLookup(null)} />
      )}
    </div>
  )
}
