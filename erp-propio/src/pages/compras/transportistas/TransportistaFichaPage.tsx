import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { GwField, GwInput, GwTabs, type GwTabDef } from '../../../components/gw'
import { GwRecordBar } from '../../../components/gw/GwRecordBar'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import { emptyProveedor, type Proveedor } from '../../proveedores/types'
import { TabDatosGenerales } from '../../proveedores/tabs/TabDatosGenerales'
import { TabBancos } from '../../proveedores/tabs/TabBancos'
import { TabCompras } from '../../proveedores/tabs/TabCompras'
import { TabObservaciones } from '../../proveedores/tabs/TabObservaciones'
import { type Transportista, emptyTransportista } from './types'
import { TabDatosComercialesTransportista } from './TabDatosComercialesTransportista'
import { TabEnlacesTransportista } from './TabEnlacesTransportista'

interface CodigoNombre {
  codigo: string
  nombre: string
}

const TAB_ROWS: GwTabDef[][] = [
  [
    { key: 'generales', label: 'Datos Generales' },
    { key: 'comerciales', label: 'Datos comerciales' },
    { key: 'enlaces', label: 'Enlaces' },
    { key: 'bancos', label: 'Bancos' },
    { key: 'obs', label: 'Observaciones e Imagen' },
    { key: 'compras', label: 'Compras' },
  ],
]

const TABS_SATELITE = new Set(['bancos', 'compras'])

const hoy = () => new Date().toISOString().slice(0, 10)

/** Siguiente código numérico con 6 dígitos, como GeminisWin (000104…). */
function siguienteCodigo(codigos: string[]) {
  const max = codigos.reduce((m, c) => (/^\d+$/.test(c) ? Math.max(m, Number(c)) : m), 0)
  return String(max + 1).padStart(6, '0')
}

export function TransportistaFichaPage() {
  const codigo = useParams()['*'] || undefined
  const navigate = useNavigate()
  const isNew = codigo === 'nuevo'

  const [mode, setMode] = useState<'consulta' | 'edicion' | 'alta'>(isNew ? 'alta' : 'consulta')
  const [registro, setRegistro] = useState<Transportista>({ ...emptyTransportista, actualizado_en: '' })
  const [draft, setDraft] = useState<Transportista>({ ...emptyTransportista, actualizado_en: '' })
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
      .from('transportista')
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
      const nuevo = { ...emptyTransportista, fecha_alta: hoy(), actualizado_en: '' }
      setRegistro(nuevo)
      setDraft(nuevo)
      setVacio(false)
      setMode('alta')
      setLoading(false)
      return
    }
    if (!codigo) {
      // Compras → Transportistas abre directamente la ficha del primero, como Proveedores.
      supabase
        .from('transportista')
        .select('codigo')
        .order('codigo')
        .limit(1)
        .then(({ data }) => {
          if (data && data[0]) navigate(`/transportistas/${encodeURIComponent(data[0].codigo)}`, { replace: true })
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
      .from('transportista')
      .select('*')
      .eq('codigo', codigo)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError('No se ha encontrado el transportista.')
          setLoading(false)
          return
        }
        setRegistro(data as Transportista)
        setDraft(data as Transportista)
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

  function patch(p: Partial<Transportista>) {
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
        ? await supabase.from('transportista').insert({ ...payload, fecha_alta: payload.fecha_alta ?? hoy() })
        : await supabase.from('transportista').update(payload).eq('codigo', registro.codigo)
    setSaving(false)
    if (res.error) {
      setError(res.error.code === '23505' ? `Ya existe un transportista con el código ${cod}.` : res.error.message)
      return
    }
    if (mode === 'alta') {
      setLista((l) => [...l, { codigo: cod, nombre: payload.nombre }].sort((a, b) => a.codigo.localeCompare(b.codigo)))
      navigate(`/transportistas/${encodeURIComponent(cod)}`, { replace: true })
      return
    }
    const { data } = await supabase.from('transportista').select('*').eq('codigo', cod).maybeSingle()
    const guardado = (data as Transportista | null) ?? { ...draft }
    setRegistro(guardado)
    setDraft(guardado)
    setLista((l) => l.map((x) => (x.codigo === cod ? { ...x, nombre: guardado.nombre } : x)))
    setMode('consulta')
  }

  function handleCancel() {
    if (mode === 'alta') {
      navigate(lista[0] ? `/transportistas/${encodeURIComponent(lista[0].codigo)}` : '/transportistas')
      return
    }
    setDraft(registro)
    setError(null)
    setMode('consulta')
  }

  async function handleDelete() {
    if (vacio || !registro.codigo) return
    if (!confirm(`¿Dar de baja el transportista ${registro.codigo} ${registro.nombre}? Queda marcado como baja, no se borra.`)) return
    const f = hoy()
    const { error: err } = await supabase.from('transportista').update({ activo: false, fecha_baja: f }).eq('codigo', registro.codigo)
    if (err) return setError(err.message)
    setRegistro((c) => ({ ...c, activo: false, fecha_baja: f }))
    setDraft((c) => ({ ...c, activo: false, fecha_baja: f }))
  }

  const ordenada = useMemo(
    () =>
      orden === 'codigo'
        ? lista
        : [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.codigo.localeCompare(b.codigo)),
    [lista, orden],
  )
  const idx = ordenada.findIndex((r) => r.codigo === registro.codigo)
  const canNavigate = mode === 'consulta' && ordenada.length > 0
  const goTo = (c?: string) => c && navigate(`/transportistas/${encodeURIComponent(c)}`)

  const ro = !editing
  const txt = (key: keyof Transportista, title: string) => (
    <GwInput
      value={(draft[key] ?? '') as string}
      disabled={ro}
      title={title}
      onChange={(e) => patch({ [key]: e.target.value === '' ? null : e.target.value } as Partial<Transportista>)}
    />
  )

  if (loading) return <div className="p-4 text-[13px]">Cargando…</div>

  const satelitesBloqueados = mode === 'alta' || vacio
  const aviso = (contenido: ReactNode) =>
    satelitesBloqueados ? (
      <div className="p-3 text-[13px]">
        {vacio ? 'No hay ningún transportista. Pulsa Nuevo para dar de alta el primero.' : 'Acepta el alta del transportista para poder rellenar esta pestaña.'}
      </div>
    ) : (
      contenido
    )
  // Las pestañas comunes con Proveedores (dirección, bancos, compras, observaciones) se reutilizan:
  // solo leen y escriben columnas que existen con el mismo nombre en las dos tablas.
  const comun = {
    proveedor: { ...emptyProveedor, ...draft } as Proveedor,
    editing,
    onChange: (p: Partial<Proveedor>) => patch(p as Partial<Transportista>),
  }
  const tabProps = { transportista: draft, editing, onChange: patch }

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

      {(error || (!registro.activo && !vacio && mode !== 'alta')) && (
        <div className="text-[13px] text-[#c42b1c]">{error ?? 'Transportista dado de baja.'}</div>
      )}

      <div className="mt-1">
        <GwTabs rows={TAB_ROWS} active={tab} onChange={setTab}>
          {vacio && !TABS_SATELITE.has(tab) ? (
            <div className="p-3 text-[13px]">No hay ningún transportista. Pulsa Nuevo para dar de alta el primero.</div>
          ) : (
            <>
              {tab === 'generales' && <TabDatosGenerales {...comun} />}
              {tab === 'comerciales' && <TabDatosComercialesTransportista {...tabProps} />}
              {tab === 'enlaces' && <TabEnlacesTransportista {...tabProps} />}
              {tab === 'bancos' && aviso(<TabBancos {...comun} tipoEntidad="transportista" />)}
              {tab === 'obs' && <TabObservaciones {...comun} tabla="TRANSPOR" />}
              {tab === 'compras' && aviso(<TabCompras {...comun} campo="transportista_codigo" />)}
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
        onNew={() => navigate('/transportistas/nuevo')}
        onEdit={() => !vacio && setMode('edicion')}
        onDelete={handleDelete}
        onSave={handleSave}
        onCancel={handleCancel}
        onExit={() => navigate('/')}
      />
      <div className="text-[11px] text-[#444]">
        Orden: {orden === 'codigo' ? 'por código' : 'por nombre'}
        {idx >= 0 ? ` · Registro ${idx + 1} de ${ordenada.length}` : ''}
        {mode === 'alta' ? ' · Alta de transportista' : mode === 'edicion' ? ' · Modificando' : ''}
      </div>

      {buscar && (
        <GwLookupDialog<{ codigo: string; nombre: string; nif: string | null; poblacion: string | null }>
          title="Buscar Transportista"
          table="transportista"
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
