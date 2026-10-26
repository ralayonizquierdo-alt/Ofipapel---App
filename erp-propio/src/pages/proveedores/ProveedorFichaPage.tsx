import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { GwField, GwInput, GwTabs, type GwTabDef } from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { type Proveedor, emptyProveedor } from './types'
import { TabDatosGenerales } from './tabs/TabDatosGenerales'
import { TabDatosComerciales } from './tabs/TabDatosComerciales'
import { TabPlantillaTarifas } from './tabs/TabPlantillaTarifas'
import { TabEnlaces } from './tabs/TabEnlaces'
import { TabBancos } from './tabs/TabBancos'
import { TabArticulos } from './tabs/TabArticulos'
import { TabCompras } from './tabs/TabCompras'
import { TabObservaciones } from './tabs/TabObservaciones'

interface CodigoNombre {
  codigo: string
  nombre: string
}

const TAB_ROWS: GwTabDef[][] = [
  [
    { key: 'generales', label: 'Datos Generales' },
    { key: 'comerciales', label: 'Datos Comerciales' },
    { key: 'plantilla', label: 'Plantilla tarifas' },
    { key: 'enlaces', label: 'Enlaces' },
    { key: 'bancos', label: 'Bancos' },
    { key: 'articulos', label: 'Artículos' },
    { key: 'compras', label: 'Compras' },
    { key: 'obs', label: 'Observaciones e Imagen' },
  ],
]

// Pestañas con datos en tablas satélite: necesitan que el proveedor ya exista.
const TABS_SATELITE = new Set(['bancos', 'articulos', 'compras'])

const hoy = () => new Date().toISOString().slice(0, 10)

/** Siguiente código numérico con 5 dígitos, como GeminisWin (05520…). */
function siguienteCodigo(codigos: string[]) {
  const max = codigos.reduce((m, c) => (/^\d+$/.test(c) ? Math.max(m, Number(c)) : m), 0)
  return String(max + 1).padStart(5, '0')
}

export function ProveedorFichaPage() {
  const { codigo } = useParams<{ codigo: string }>()
  const navigate = useNavigate()
  const isNew = codigo === 'nuevo'

  const [mode, setMode] = useState<'consulta' | 'edicion' | 'alta'>(isNew ? 'alta' : 'consulta')
  const [proveedor, setProveedor] = useState<Proveedor>({ ...emptyProveedor, actualizado_en: '' })
  const [draft, setDraft] = useState<Proveedor>({ ...emptyProveedor, actualizado_en: '' })
  const [loading, setLoading] = useState(true)
  const [vacio, setVacio] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lista, setLista] = useState<CodigoNombre[]>([])
  const [listaCargada, setListaCargada] = useState(false)
  const [orden, setOrden] = useState<'codigo' | 'nombre'>('codigo')
  const [buscar, setBuscar] = useState(false)
  const [tab, setTab] = useState('generales')

  const editing = mode !== 'consulta'

  useEffect(() => {
    supabase
      .from('proveedor')
      .select('codigo, nombre')
      .order('codigo')
      .then(({ data }) => {
        setLista((data ?? []) as CodigoNombre[])
        setListaCargada(true)
      })
  }, [])

  useEffect(() => {
    setError(null)
    if (isNew) {
      const nuevo = { ...emptyProveedor, fecha_alta: hoy(), actualizado_en: '' }
      setProveedor(nuevo)
      setDraft(nuevo)
      setVacio(false)
      setMode('alta')
      setLoading(false)
      return
    }
    if (!codigo) {
      // Como en GeminisWin, Compras → Proveedores abre directamente la ficha del primer proveedor.
      supabase
        .from('proveedor')
        .select('codigo')
        .order('codigo')
        .limit(1)
        .then(({ data }) => {
          if (data && data[0]) navigate(`/proveedores/${encodeURIComponent(data[0].codigo)}`, { replace: true })
          else {
            setVacio(true)
            setMode('consulta')
            setLoading(false)
          }
        })
      return
    }
    setLoading(true)
    supabase
      .from('proveedor')
      .select('*')
      .eq('codigo', codigo)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError('No se ha encontrado el proveedor.')
          setLoading(false)
          return
        }
        setProveedor(data as Proveedor)
        setDraft(data as Proveedor)
        setVacio(false)
        setMode('consulta')
        setLoading(false)
      })
  }, [codigo, isNew, navigate])

  useEffect(() => {
    if (mode === 'alta' && listaCargada && !draft.codigo) {
      setDraft((d) => ({ ...d, codigo: siguienteCodigo(lista.map((l) => l.codigo)) }))
    }
  }, [mode, listaCargada, lista, draft.codigo])

  function patch(p: Partial<Proveedor>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  async function handleSave() {
    setError(null)
    const cod = draft.codigo.trim()
    if (!cod || !draft.nombre.trim()) {
      setError('El código y el nombre son obligatorios.')
      return
    }
    setSaving(true)
    const { actualizado_en: _a, ...resto } = draft
    const payload = { ...resto, codigo: cod, nombre: resto.nombre.trim() }
    const res =
      mode === 'alta'
        ? await supabase.from('proveedor').insert({ ...payload, fecha_alta: payload.fecha_alta ?? hoy() })
        : await supabase.from('proveedor').update(payload).eq('codigo', proveedor.codigo)
    setSaving(false)
    if (res.error) {
      setError(res.error.code === '23505' ? `Ya existe un proveedor con el código ${cod}.` : res.error.message)
      return
    }
    if (mode === 'alta') {
      setLista((l) => [...l, { codigo: cod, nombre: payload.nombre }].sort((a, b) => a.codigo.localeCompare(b.codigo)))
      navigate(`/proveedores/${encodeURIComponent(cod)}`, { replace: true })
      return
    }
    const { data } = await supabase.from('proveedor').select('*').eq('codigo', cod).maybeSingle()
    const guardado = (data as Proveedor | null) ?? { ...draft }
    setProveedor(guardado)
    setDraft(guardado)
    setLista((l) => l.map((x) => (x.codigo === cod ? { ...x, nombre: guardado.nombre } : x)))
    setMode('consulta')
  }

  function handleCancel() {
    if (mode === 'alta') {
      navigate(lista[0] ? `/proveedores/${encodeURIComponent(lista[0].codigo)}` : '/proveedores')
      return
    }
    setDraft(proveedor)
    setError(null)
    setMode('consulta')
  }

  async function handleDelete() {
    if (vacio || !proveedor.codigo) return
    if (!confirm(`¿Dar de baja el proveedor ${proveedor.codigo} ${proveedor.nombre}? Queda marcado como baja, no se borra.`)) return
    const f = hoy()
    const { error: err } = await supabase.from('proveedor').update({ activo: false, fecha_baja: f }).eq('codigo', proveedor.codigo)
    if (err) return setError(err.message)
    setProveedor((c) => ({ ...c, activo: false, fecha_baja: f }))
    setDraft((c) => ({ ...c, activo: false, fecha_baja: f }))
  }

  const ordenada = useMemo(
    () =>
      orden === 'codigo'
        ? lista
        : [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.codigo.localeCompare(b.codigo)),
    [lista, orden],
  )
  const idx = ordenada.findIndex((r) => r.codigo === proveedor.codigo)
  const canNavigate = mode === 'consulta' && ordenada.length > 0
  const goTo = (c?: string) => c && navigate(`/proveedores/${encodeURIComponent(c)}`)

  const ro = !editing
  const txt = (key: keyof Proveedor, title: string) => (
    <GwInput
      value={(draft[key] ?? '') as string}
      disabled={ro}
      title={title}
      onChange={(e) => patch({ [key]: e.target.value === '' ? null : e.target.value } as Partial<Proveedor>)}
    />
  )

  if (loading) return <div className="p-4 text-[13px]">Cargando…</div>

  const satelitesBloqueados = mode === 'alta' || vacio
  const aviso = (contenido: ReactNode) =>
    satelitesBloqueados ? (
      <div className="p-3 text-[13px]">
        {vacio ? 'No hay ningún proveedor. Pulsa Nuevo para dar de alta el primero.' : 'Acepta el alta del proveedor para poder rellenar esta pestaña.'}
      </div>
    ) : (
      contenido
    )
  const tabProps = { proveedor: draft, editing, onChange: patch }

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[130px_minmax(0,1fr)_160px] gap-x-1.5">
        <GwField label="Código">
          <GwInput value={draft.codigo} disabled={mode !== 'alta'} title="CODIGO" onChange={(e) => patch({ codigo: e.target.value })} />
        </GwField>
        <GwField label="Nombre">
          <GwInput value={draft.nombre} disabled={ro} title="NOMBRE" onChange={(e) => patch({ nombre: e.target.value })} />
        </GwField>
        <GwField label="Dni/Nif">{txt('nif', 'NIF')}</GwField>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] gap-x-1.5">
        <GwField label="Razón Social">{txt('razon_social', 'RAZONSOC')}</GwField>
        <GwField label="Contacto">{txt('contacto', 'CONTACTO')}</GwField>
      </div>

      {(error || (!proveedor.activo && !vacio && mode !== 'alta')) && (
        <div className="text-[13px] text-[#c42b1c]">{error ?? 'Proveedor dado de baja.'}</div>
      )}

      <div className="mt-1">
        <GwTabs rows={TAB_ROWS} active={tab} onChange={setTab}>
          {vacio && !TABS_SATELITE.has(tab) ? (
            <div className="p-3 text-[13px]">No hay ningún proveedor. Pulsa Nuevo para dar de alta el primero.</div>
          ) : (
            <>
              {tab === 'generales' && <TabDatosGenerales {...tabProps} />}
              {tab === 'comerciales' && <TabDatosComerciales {...tabProps} />}
              {tab === 'plantilla' && <TabPlantillaTarifas {...tabProps} />}
              {tab === 'enlaces' && <TabEnlaces {...tabProps} />}
              {tab === 'bancos' && aviso(<TabBancos {...tabProps} />)}
              {tab === 'articulos' && aviso(<TabArticulos {...tabProps} />)}
              {tab === 'compras' && aviso(<TabCompras {...tabProps} />)}
              {tab === 'obs' && <TabObservaciones {...tabProps} />}
            </>
          )}
        </GwTabs>
      </div>

      <GwRecordBar
        mode={mode}
        canNavigate={canNavigate}
        saving={saving}
        onFirst={() => goTo(ordenada[0]?.codigo)}
        onPrev={() => goTo(ordenada[idx - 1]?.codigo)}
        onNext={() => goTo(ordenada[idx + 1]?.codigo)}
        onLast={() => goTo(ordenada[ordenada.length - 1]?.codigo)}
        onSort={() => setOrden((o) => (o === 'codigo' ? 'nombre' : 'codigo'))}
        onSearch={() => setBuscar(true)}
        onPrint={() => window.print()}
        onNew={() => navigate('/proveedores/nuevo')}
        onEdit={() => !vacio && setMode('edicion')}
        onDelete={handleDelete}
        onSave={handleSave}
        onCancel={handleCancel}
        onExit={() => navigate('/')}
      />
      <div className="text-[11px] text-[#444]">
        Orden: {orden === 'codigo' ? 'por código' : 'por nombre'}
        {idx >= 0 ? ` · Registro ${idx + 1} de ${ordenada.length}` : ''}
        {mode === 'alta' ? ' · Alta de proveedor' : mode === 'edicion' ? ' · Modificando' : ''}
      </div>

      {buscar && (
        <GwLookupDialog<{ codigo: string; nombre: string; nif: string | null; poblacion: string | null }>
          title="Buscar Proveedor"
          table="proveedor"
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'nombre', label: 'Nombre' },
            { key: 'nif', label: 'NIF', width: 110 },
            { key: 'poblacion', label: 'Población', width: 140 },
          ]}
          searchColumns={['codigo', 'nombre', 'nif', 'poblacion', 'razon_social']}
          orderBy={orden === 'codigo' ? 'codigo' : 'nombre'}
          keyColumn="codigo"
          onPick={(r) => {
            setBuscar(false)
            goTo(r.codigo)
          }}
          onClose={() => setBuscar(false)}
        />
      )}
    </div>
  )
}
