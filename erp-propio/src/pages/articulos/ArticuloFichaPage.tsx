import { useEffect, useState, type ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { FormField, TextInput, SelectInput } from '../../components/FormField'
import { Tabs, TabPanel, useTabs } from '../../components/Tabs'
import { RecordToolbar } from '../../components/RecordToolbar'
import { type Articulo, emptyArticulo } from './types'
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
import { TabImagenWeb } from './tabs/TabImagenWeb'

interface Maestro {
  codigo: string
  nombre: string
}

const TABS = [
  { key: 'caracteristicas', label: 'Características' },
  { key: 'unidades', label: 'Unidades de stock y venta' },
  { key: 'observaciones', label: 'Observaciones' },
  { key: 'parametros', label: 'Parámetros PVP' },
  { key: 'ofertas', label: 'Precios de oferta' },
  { key: 'almacen', label: 'Almacén' },
  { key: 'tallas', label: 'Tallas y colores' },
  { key: 'equivalentes', label: 'Equivalentes' },
  { key: 'proveedores', label: 'Precios por proveedor' },
  { key: 'composicion', label: 'Composición' },
  { key: 'web', label: 'Imagen y Web' },
]

export function ArticuloFichaPage() {
  const { codigo } = useParams<{ codigo: string }>()
  const navigate = useNavigate()
  const isNew = codigo === 'nuevo'

  const [mode, setMode] = useState<'consulta' | 'edicion' | 'alta'>(isNew ? 'alta' : 'consulta')
  const [articulo, setArticulo] = useState<Articulo>({ ...emptyArticulo, actualizado_en: '' })
  const [draft, setDraft] = useState<Articulo>({ ...emptyArticulo, actualizado_en: '' })
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [familias, setFamilias] = useState<Maestro[]>([])
  const [marcas, setMarcas] = useState<string[]>([])
  const [proveedores, setProveedores] = useState<Maestro[]>([])
  const [plantillas, setPlantillas] = useState<Maestro[]>([])
  const [allCodes, setAllCodes] = useState<string[]>([])
  const { active, setActive } = useTabs(TABS)

  useEffect(() => {
    Promise.all([
      supabase.from('familia').select('codigo, descripcion').order('codigo'),
      supabase.from('marca').select('codigo').order('codigo'),
      supabase.from('proveedor').select('codigo, nombre').order('nombre'),
      supabase.from('plantilla_tarifa').select('codigo, descripcion').order('codigo'),
      supabase.from('articulo').select('codigo_interno').order('codigo_interno'),
    ]).then(([f, m, p, t, codes]) => {
      setFamilias((f.data ?? []).map((r) => ({ codigo: r.codigo, nombre: r.descripcion })))
      setMarcas((m.data ?? []).map((r) => r.codigo))
      setProveedores(p.data ?? [])
      setPlantillas((t.data ?? []).map((r) => ({ codigo: r.codigo, nombre: r.descripcion })))
      setAllCodes((codes.data ?? []).map((r) => r.codigo_interno))
    })
  }, [])

  useEffect(() => {
    if (isNew) {
      setArticulo({ ...emptyArticulo, actualizado_en: '' })
      setDraft({ ...emptyArticulo, actualizado_en: '' })
      setMode('alta')
      setLoading(false)
      return
    }
    if (!codigo) return
    setLoading(true)
    supabase
      .from('articulo')
      .select('*')
      .eq('codigo_interno', codigo)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError('No se ha encontrado el artículo.')
          setLoading(false)
          return
        }
        setArticulo(data as Articulo)
        setDraft(data as Articulo)
        setMode('consulta')
        setLoading(false)
      })
  }, [codigo, isNew])

  function field<K extends keyof Articulo>(key: K) {
    return {
      value: (draft[key] ?? '') as string | number,
      onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const raw = e.target.value
        setDraft((d) => ({ ...d, [key]: raw === '' ? null : raw }))
      },
      disabled: mode === 'consulta',
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { actualizado_en: _ignored, ...payload } = draft
    if (mode === 'alta') {
      const { error: err } = await supabase.from('articulo').insert(payload)
      setSaving(false)
      if (err) {
        setError(err.message)
        return
      }
      navigate(`/articulos/${encodeURIComponent(payload.codigo_interno)}`, { replace: true })
      return
    }
    const { error: err } = await supabase
      .from('articulo')
      .update(payload)
      .eq('codigo_interno', articulo.codigo_interno)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setArticulo({ ...draft })
    setMode('consulta')
  }

  async function handleDelete() {
    if (!confirm(`¿Dar de baja el artículo ${articulo.codigo_interno}? No se elimina físicamente, queda marcado como inactivo.`)) return
    const { error: err } = await supabase
      .from('articulo')
      .update({ activo: false, fecha_baja: new Date().toISOString().slice(0, 10) })
      .eq('codigo_interno', articulo.codigo_interno)
    if (err) {
      setError(err.message)
      return
    }
    navigate('/articulos')
  }

  function goTo(targetCodigo: string) {
    navigate(`/articulos/${encodeURIComponent(targetCodigo)}`)
  }

  const idx = allCodes.indexOf(articulo.codigo_interno)
  const canNavigate = mode === 'consulta' && idx >= 0

  if (loading) return <div className="p-8 text-sm text-slate-400">Cargando…</div>

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {isNew ? 'Nuevo artículo' : articulo.descripcion || articulo.codigo_interno}
          </h1>
          <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
            {mode === 'alta' ? 'Alta de artículo' : mode === 'edicion' ? 'Modificando' : 'Consulta'}
            {!articulo.activo && mode !== 'alta' ? ' · Baja' : ''}
          </p>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {/* Cabecera, siempre visible, igual en GeminisWin para todas las pestañas */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label="Código interno *">
          <TextInput {...field('codigo_interno')} disabled={mode !== 'alta'} required />
        </FormField>
        <FormField label="Descripción *" hint="DESCRIP">
          <TextInput className="lg:col-span-2" {...field('descripcion')} required />
        </FormField>
        <FormField label="Descripción corta" hint="DESCRCORTA">
          <TextInput {...field('descripcion_corta')} />
        </FormField>
        <FormField label="Código de compra" hint="COD_COMPRA">
          <TextInput {...field('codigo_compra_habitual')} />
        </FormField>
        <FormField label="Código de venta" hint="COD_VENTA">
          <TextInput {...field('codigo_venta')} />
        </FormField>
        <FormField label="Código de barras principal" hint="COD_BARRAS — más códigos en la pestaña Características">
          <TextInput {...field('codigo_barras_principal')} />
        </FormField>
        <FormField label="Marca" hint="MARCA">
          <SelectInput {...field('marca_codigo')}>
            <option value="">—</option>
            {marcas.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </SelectInput>
        </FormField>
        <FormField label="Familia" hint="COD_FAM">
          <SelectInput {...field('familia_codigo')}>
            <option value="">—</option>
            {familias.map((f) => (
              <option key={f.codigo} value={f.codigo}>
                {f.codigo} — {f.nombre}
              </option>
            ))}
          </SelectInput>
        </FormField>
        <FormField label="Proveedor principal" hint="COD_PROV">
          <SelectInput {...field('proveedor_habitual_codigo')}>
            <option value="">—</option>
            {proveedores.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.nombre}
              </option>
            ))}
          </SelectInput>
        </FormField>
        <FormField label="Campo libre" hint="CMP_LIBRE">
          <TextInput {...field('campo_libre')} />
        </FormField>
      </div>

      <div>
        <Tabs tabs={TABS} active={active} onChange={setActive} />
        <TabPanel>
          {isNew ? (
            <p className="text-sm text-slate-400">
              Guarda la cabecera para poder rellenar el resto de pestañas (códigos de barras, precios, stock por
              almacén…), igual que en GeminisWin: primero se crea el artículo y luego se completa la ficha.
            </p>
          ) : (
            <>
              {active === 'caracteristicas' && (
                <TabCaracteristicas
                  articulo={draft}
                  editing={mode !== 'consulta'}
                  onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
                  plantillas={plantillas}
                />
              )}
              {active === 'unidades' && <TabUnidadesVenta articuloCodigo={articulo.codigo_interno} />}
              {active === 'observaciones' && (
                <TabObservaciones
                  articulo={draft}
                  editing={mode !== 'consulta'}
                  onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
                />
              )}
              {active === 'parametros' && (
                <TabParametrosPvp
                  articulo={draft}
                  editing={mode !== 'consulta'}
                  onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
                />
              )}
              {active === 'ofertas' && <TabPreciosOferta articuloCodigo={articulo.codigo_interno} />}
              {active === 'almacen' && (
                <TabAlmacen
                  articulo={draft}
                  editing={mode !== 'consulta'}
                  onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
                />
              )}
              {active === 'tallas' && <TabTallasColores articuloCodigo={articulo.codigo_interno} />}
              {active === 'equivalentes' && <TabEquivalentes articuloCodigo={articulo.codigo_interno} />}
              {active === 'proveedores' && (
                <TabPreciosProveedor articuloCodigo={articulo.codigo_interno} proveedores={proveedores} />
              )}
              {active === 'composicion' && <TabComposicion articuloCodigo={articulo.codigo_interno} />}
              {active === 'web' && (
                <TabImagenWeb
                  articulo={draft}
                  editing={mode !== 'consulta'}
                  onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
                />
              )}
            </>
          )}
        </TabPanel>
      </div>

      <RecordToolbar
        mode={mode}
        canNavigate={canNavigate}
        saving={saving}
        onFirst={() => allCodes[0] && goTo(allCodes[0])}
        onPrev={() => idx > 0 && goTo(allCodes[idx - 1])}
        onNext={() => idx >= 0 && idx < allCodes.length - 1 && goTo(allCodes[idx + 1])}
        onLast={() => allCodes.length > 0 && goTo(allCodes[allCodes.length - 1])}
        onSearch={() => navigate('/articulos')}
        onList={() => navigate('/articulos')}
        onNew={() => navigate('/articulos/nuevo')}
        onEdit={() => setMode('edicion')}
        onSave={handleSave}
        onCancel={() => {
          setDraft(articulo)
          setMode('consulta')
        }}
        onDelete={handleDelete}
        onExit={() => navigate('/articulos')}
      />
    </div>
  )
}
