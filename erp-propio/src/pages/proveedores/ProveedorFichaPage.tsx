import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { textoRegistro, useNavRegistro, type NavDir, type NavFiltro } from '../../components/gw/useNavRegistro'
import { GwField, GwInput, GwTabs, type GwTabDef } from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { GwCampoBusqueda } from '../../components/gw/GwCampoBusqueda'
import { gwBuscarPorInicio, useListaOrdenada } from '../../components/gw/GwListaOrdenada'
import { buscarTerceroPorCodigo, defTercero } from '../../components/gw/listasTerceros'
import { type Proveedor, emptyProveedor } from './types'
import { TabDatosGenerales } from './tabs/TabDatosGenerales'
import { TabDatosComerciales } from './tabs/TabDatosComerciales'
import { TabPlantillaTarifas } from './tabs/TabPlantillaTarifas'
import { TabEnlaces } from './tabs/TabEnlaces'
import { TabBancos } from './tabs/TabBancos'
import { TabArticulos } from './tabs/TabArticulos'
import { TabCompras } from './tabs/TabCompras'
import { TabObservaciones } from './tabs/TabObservaciones'

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

// Pestañas que no tienen sentido para un acreedor (no vende mercancía).
const TABS_SOLO_PROVEEDOR = new Set(['plantilla', 'articulos'])
const TAB_ROWS_ACREEDOR: GwTabDef[][] = [TAB_ROWS[0].filter((t) => !TABS_SOLO_PROVEEDOR.has(t.key))]

// Pestañas con datos en tablas satélite: necesitan que el proveedor ya exista.
const TABS_SATELITE = new Set(['bancos', 'articulos', 'compras'])

const hoy = () => new Date().toISOString().slice(0, 10)

/**
 * Siguiente código: los acreedores, como en GeminisWin, en el grupo 60 (60001, 60002…); los
 * proveedores, el mayor de 5 cifras fuera de ese grupo más uno.
 */
async function siguienteCodigo(acreedor: boolean) {
  let q = supabase.from('proveedor').select('codigo').filter('codigo', 'match', acreedor ? '^60[0-9]{3}$' : '^[0-9]{5}$')
  if (!acreedor) q = q.not('codigo', 'like', '60%')
  const { data } = await q.order('codigo', { ascending: false }).limit(1)
  const max = Number((data ?? [])[0]?.codigo ?? 0)
  return acreedor ? String(Math.max(max, 60000) + 1) : String(max + 1).padStart(5, '0')
}

/**
 * Ficha de Proveedores y, con `acreedores`, la de Acreedores (Compras → Acreedores): misma tabla,
 * columna `tipo`. Cada ficha recorre solo los suyos; si se llega a uno del otro tipo (búsqueda por
 * código, cambio de tipo) se pasa a su ficha.
 */
export function ProveedorFichaPage({ acreedores = false }: { acreedores?: boolean }) {
  const tipo: Proveedor['tipo'] = acreedores ? 'acreedor' : 'proveedor'
  const base = acreedores ? '/acreedores' : '/proveedores'
  const palabra = acreedores ? 'acreedor' : 'proveedor'
  const { codigo } = useParams<{ codigo: string }>()
  const navigate = useNavigate()
  const isNew = codigo === 'nuevo'

  const [mode, setMode] = useState<'consulta' | 'edicion' | 'alta'>(isNew ? 'alta' : 'consulta')
  const [proveedor, setProveedor] = useState<Proveedor>({ ...emptyProveedor, tipo, actualizado_en: '' })
  const [draft, setDraft] = useState<Proveedor>({ ...emptyProveedor, tipo, actualizado_en: '' })
  const [loading, setLoading] = useState(true)
  const [vacio, setVacio] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orden, setOrden] = useState<'codigo' | 'nombre'>('codigo')
  const [buscar, setBuscar] = useState(false)
  const [tab, setTab] = useState('generales')

  const editing = mode !== 'consulta'
  const consulta = mode === 'consulta'
  const listaOrd = useListaOrdenada()

  // Cada ficha recorre solo los de su tipo.
  const soloTipo = useCallback<NavFiltro>((q) => q.eq('tipo', tipo), [tipo])
  // Anterior/siguiente/primero/último y «Registro X de N» pidiendo al servidor solo el vecino.
  const nav = useNavRegistro<{ codigo: string }>({
    tabla: 'proveedor',
    orden: orden === 'codigo' ? ['codigo'] : ['nombre', 'codigo'],
    actual: vacio || mode === 'alta' || !proveedor.codigo ? null : orden === 'codigo' ? [proveedor.codigo] : [proveedor.nombre, proveedor.codigo],
    select: 'codigo',
    filtro: soloTipo,
  })

  useEffect(() => {
    setError(null)
    if (isNew) {
      const nuevo = { ...emptyProveedor, tipo, fecha_alta: hoy(), actualizado_en: '' }
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
        .eq('tipo', tipo)
        .order('codigo')
        .limit(1)
        .then(({ data }) => {
          if (data && data[0]) navigate(`${base}/${encodeURIComponent(data[0].codigo)}`, { replace: true })
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
          setError(`No se ha encontrado el ${palabra}.`)
          setLoading(false)
          return
        }
        if ((data as Proveedor).tipo !== tipo) {
          navigate(`${(data as Proveedor).tipo === 'acreedor' ? '/acreedores' : '/proveedores'}/${encodeURIComponent(codigo)}`, { replace: true })
          return
        }
        setProveedor(data as Proveedor)
        setDraft(data as Proveedor)
        setVacio(false)
        setMode('consulta')
        setLoading(false)
      })
  }, [codigo, isNew, navigate, tipo, base, palabra])

  useEffect(() => {
    if (mode === 'alta' && !draft.codigo) {
      let vivo = true
      siguienteCodigo(acreedores).then((c) => vivo && setDraft((d) => (d.codigo ? d : { ...d, codigo: c })))
      return () => {
        vivo = false
      }
    }
  }, [mode, draft.codigo, acreedores])

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
      setError(res.error.code === '23505' ? `Ya existe un proveedor o acreedor con el código ${cod}.` : res.error.message)
      return
    }
    if (mode === 'alta') {
      nav.refrescar()
      navigate(`${payload.tipo === 'acreedor' ? '/acreedores' : '/proveedores'}/${encodeURIComponent(cod)}`, { replace: true })
      return
    }
    if (payload.tipo !== tipo) {
      // Ha cambiado de Proveedor a Acreedor (o al revés): pasa a la otra ficha.
      navigate(`${payload.tipo === 'acreedor' ? '/acreedores' : '/proveedores'}/${encodeURIComponent(cod)}`, { replace: true })
      return
    }
    const { data } = await supabase.from('proveedor').select('*').eq('codigo', cod).maybeSingle()
    const guardado = (data as Proveedor | null) ?? { ...draft }
    setProveedor(guardado)
    setDraft(guardado)
    setMode('consulta')
  }

  function handleCancel() {
    if (mode === 'alta') {
      navigate(base)
      return
    }
    setDraft(proveedor)
    setError(null)
    setMode('consulta')
  }

  async function handleDelete() {
    if (vacio || !proveedor.codigo) return
    if (!confirm(`¿Dar de baja el ${palabra} ${proveedor.codigo} ${proveedor.nombre}? Queda marcado como baja, no se borra.`)) return
    const f = hoy()
    const { error: err } = await supabase.from('proveedor').update({ activo: false, fecha_baja: f }).eq('codigo', proveedor.codigo)
    if (err) return setError(err.message)
    setProveedor((c) => ({ ...c, activo: false, fecha_baja: f }))
    setDraft((c) => ({ ...c, activo: false, fecha_baja: f }))
  }

  const canNavigate = mode === 'consulta' && !vacio
  const goTo = (c?: string) => c && navigate(`${base}/${encodeURIComponent(c)}`)
  const irA = async (d: NavDir) => goTo((await nav.ir(d))?.codigo)

  // Búsqueda desde los campos en consulta (Intro) y lista ordenada por el campo (Ctrl+Intro).
  async function buscarCodigo(t: string) {
    const c = await buscarTerceroPorCodigo('proveedor', t)
    if (c) goTo(c)
    else setError(`No existe el ${palabra} ${t}`)
  }
  const buscarInicio = (campo: string, que: string) => async (t: string) => {
    const f = await gwBuscarPorInicio('proveedor', campo, t)
    if (f) goTo(String(f.codigo))
    else setError(`No existe ningún ${palabra} con ${que} que empiece por «${t}»`)
  }
  const listaCampo = (campo: string) =>
    consulta
      ? (texto: string | null) => listaOrd.abrir(defTercero('proveedor', campo), { texto, ancla: proveedor.codigo, onPick: (f) => goTo(String(f.codigo)) })
      : undefined
  const campoBusqueda = (campo: 'nombre' | 'razon_social' | 'nif', title: string, que: string, className?: string) => (
    <GwCampoBusqueda
      value={(draft[campo] ?? '') as string}
      editable={editing}
      title={title}
      className={className}
      onChange={(v) => patch({ [campo]: campo === 'nombre' ? v : v === '' ? null : v } as Partial<typeof draft>)}
      onBuscar={buscarInicio(campo, que)}
      onLista={listaCampo(campo)}
    />
  )

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
        {vacio ? `No hay ningún ${palabra}. Pulsa Nuevo para dar de alta el primero.` : `Acepta el alta del ${palabra} para poder rellenar esta pestaña.`}
      </div>
    ) : (
      contenido
    )
  const tabProps = { proveedor: draft, editing, onChange: patch }
  const tabVisible = draft.tipo === 'acreedor' && TABS_SOLO_PROVEEDOR.has(tab) ? 'generales' : tab

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[130px_auto_minmax(0,1fr)_160px] gap-x-1.5">
        <GwField label="Código">
          <GwCampoBusqueda
            value={draft.codigo}
            editable={mode === 'alta'}
            disabled={mode === 'edicion'}
            title="CODIGO"
            onChange={(v) => patch({ codigo: v })}
            onBuscar={buscarCodigo}
            onLista={listaCampo('codigo')}
          />
        </GwField>
        <GwField label="Tipo">
          <TipoTercero value={draft.tipo} editable={editing} onChange={(t) => patch({ tipo: t })} />
        </GwField>
        <GwField label="Nombre">
          {campoBusqueda('nombre', 'NOMBRE', 'nombre')}
        </GwField>
        <GwField label="Dni/Nif">{campoBusqueda('nif', 'NIF', 'NIF')}</GwField>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] gap-x-1.5">
        <GwField label="Razón Social">{campoBusqueda('razon_social', 'RAZONSOC', 'razón social')}</GwField>
        <GwField label="Contacto">{txt('contacto', 'CONTACTO')}</GwField>
      </div>

      {(error || (!proveedor.activo && !vacio && mode !== 'alta')) && (
        <div className="text-[13px] text-[#c42b1c]">{error ?? (acreedores ? 'Acreedor dado de baja.' : 'Proveedor dado de baja.')}</div>
      )}

      <div className="mt-1">
        <GwTabs rows={draft.tipo === 'acreedor' ? TAB_ROWS_ACREEDOR : TAB_ROWS} active={tabVisible} onChange={setTab}>
          {vacio && !TABS_SATELITE.has(tabVisible) ? (
            <div className="p-3 text-[13px]">No hay ningún {palabra}. Pulsa Nuevo para dar de alta el primero.</div>
          ) : (
            <>
              {tabVisible === 'generales' && <TabDatosGenerales {...tabProps} />}
              {tabVisible === 'comerciales' && <TabDatosComerciales {...tabProps} />}
              {tabVisible === 'plantilla' && <TabPlantillaTarifas {...tabProps} />}
              {tabVisible === 'enlaces' && <TabEnlaces {...tabProps} />}
              {tabVisible === 'bancos' && aviso(<TabBancos {...tabProps} />)}
              {tabVisible === 'articulos' && aviso(<TabArticulos {...tabProps} />)}
              {tabVisible === 'compras' && aviso(<TabCompras {...tabProps} />)}
              {tabVisible === 'obs' && <TabObservaciones {...tabProps} />}
            </>
          )}
        </GwTabs>
      </div>

      <GwRecordBar
        mode={mode}
        canNavigate={canNavigate}
        saving={saving}
        onFirst={() => irA('primero')}
        onPrev={() => irA('anterior')}
        onNext={() => irA('siguiente')}
        onLast={() => irA('ultimo')}
        onSort={() => setOrden((o) => (o === 'codigo' ? 'nombre' : 'codigo'))}
        onSearch={() => setBuscar(true)}
        onPrint={() => window.print()}
        onNew={() => navigate(`${base}/nuevo`)}
        onEdit={() => !vacio && setMode('edicion')}
        onDelete={handleDelete}
        onSave={handleSave}
        onCancel={handleCancel}
        onExit={() => navigate('/')}
      />
      <div className="text-[11px] text-[#444]">
        Orden: {orden === 'codigo' ? 'por código' : 'por nombre'}
        {textoRegistro(nav)}
        {mode === 'alta' ? ` · Alta de ${palabra}` : mode === 'edicion' ? ' · Modificando' : ''}
      </div>

      {listaOrd.dialogo}
      {buscar && (
        <GwLookupDialog<{ codigo: string; nombre: string; nif: string | null; poblacion: string | null }>
          title={acreedores ? 'Buscar Acreedor' : 'Buscar Proveedor'}
          table="proveedor"
          eq={{ tipo }}
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

/** Proveedor (mercancía) o Acreedor (servicios y gastos): dos botones pegados, el elegido en color. */
function TipoTercero({ value, editable, onChange }: { value: 'proveedor' | 'acreedor'; editable: boolean; onChange: (t: 'proveedor' | 'acreedor') => void }) {
  const boton = (t: 'proveedor' | 'acreedor', texto: string, color: string) => (
    <button
      type="button"
      disabled={!editable}
      title={editable ? `Marcar como ${texto}` : 'Pulsa Modificar para cambiarlo'}
      onClick={() => onChange(t)}
      className={`h-full px-2.5 text-[12px] ${value === t ? `${color} font-bold text-white` : 'bg-white text-[#555] enabled:hover:bg-[#e5f1fb]'}`}
    >
      {texto}
    </button>
  )
  return (
    <span className="flex h-[20px] border border-[var(--gw-border)] [&>button+button]:border-l [&>button+button]:border-[var(--gw-border)]">
      {boton('proveedor', 'Proveedor', 'bg-[#1d3a8a]')}
      {boton('acreedor', 'Acreedor', 'bg-[#97572b]')}
    </span>
  )
}
