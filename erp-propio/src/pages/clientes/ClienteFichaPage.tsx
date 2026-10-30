import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { siguienteCodigoServidor, textoRegistro, useNavRegistro, type NavDir } from '../../components/gw/useNavRegistro'
import { GwDate, GwField, GwTabs, type GwTabDef } from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { GwCampoBusqueda } from '../../components/gw/GwCampoBusqueda'
import { gwBuscarPorInicio, useListaOrdenada } from '../../components/gw/GwListaOrdenada'
import { buscarTerceroPorCodigo, defTercero } from '../../components/gw/listasTerceros'
import { type Cliente, emptyCliente } from './types'
import { TabGeneral } from './tabs/TabGeneral'
import { TabComercial } from './tabs/TabComercial'
import { TabTarifas } from './tabs/TabTarifas'
import { TabEnlaces } from './tabs/TabEnlaces'
import { TabBancos } from './tabs/TabBancos'
import { TabSucursales } from './tabs/TabSucursales'
import { TabAgenda } from './tabs/TabAgenda'
import { TabObsImg } from './tabs/TabObsImg'
import { TabConsultas } from './tabs/TabConsultas'
import { TabWeb } from './tabs/TabWeb'
import { TabArticulosComprados } from './tabs/TabArticulosComprados'
import { GwOperativa } from '../../components/gw/GwOperativa'

const TAB_ROWS: GwTabDef[][] = [
  [
    { key: 'general', label: 'General' },
    { key: 'comercial', label: 'Comercial' },
    { key: 'tarifas', label: 'Tarifas' },
    { key: 'enlaces', label: 'Enlaces' },
    { key: 'bancos', label: 'Bancos' },
    { key: 'sucursales', label: 'Sucursales' },
    { key: 'agenda', label: 'Agenda' },
    { key: 'obs', label: 'Obs. e Img.' },
    { key: 'consultas', label: 'Consultas' },
    { key: 'comprados', label: 'Art. comprados' },
    { key: 'web', label: 'Web' },
    { key: 'operativa', label: 'Operativa' },
  ],
]

// Pestañas con datos en tablas satélite: necesitan que el cliente ya exista.
const TABS_SATELITE = new Set(['tarifas', 'bancos', 'sucursales', 'agenda', 'consultas', 'comprados'])

const hoy = () => new Date().toISOString().slice(0, 10)

function FechaInput({ value, onChange, disabled, title }: { value: string | null; onChange: (v: string | null) => void; disabled?: boolean; title?: string }) {
  return (
    <GwDate title={title} value={value} disabled={disabled} onChange={onChange} />
  )
}

export function ClienteFichaPage() {
  const { codigo } = useParams<{ codigo: string }>()
  const navigate = useNavigate()
  const isNew = codigo === 'nuevo'

  const [mode, setMode] = useState<'consulta' | 'edicion' | 'alta'>(isNew ? 'alta' : 'consulta')
  const [cliente, setCliente] = useState<Cliente>({ ...emptyCliente, actualizado_en: '' })
  const [draft, setDraft] = useState<Cliente>({ ...emptyCliente, actualizado_en: '' })
  const [loading, setLoading] = useState(true)
  const [vacio, setVacio] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orden, setOrden] = useState<'codigo' | 'nombre'>('codigo')
  const [buscar, setBuscar] = useState(false)
  const [tab, setTab] = useState('general')

  const editing = mode !== 'consulta'
  const consulta = mode === 'consulta'
  const listaOrd = useListaOrdenada()

  // Anterior/siguiente/primero/último y «Registro X de N» pidiendo al servidor solo el vecino.
  const nav = useNavRegistro<{ codigo: string }>({
    tabla: 'cliente',
    orden: orden === 'codigo' ? ['codigo'] : ['nombre', 'codigo'],
    actual: vacio || mode === 'alta' || !cliente.codigo ? null : orden === 'codigo' ? [cliente.codigo] : [cliente.nombre, cliente.codigo],
    select: 'codigo',
  })

  useEffect(() => {
    setError(null)
    if (isNew) {
      const nuevo = { ...emptyCliente, fecha_alta: hoy(), actualizado_en: '' }
      setCliente(nuevo)
      setDraft(nuevo)
      setVacio(false)
      setMode('alta')
      setLoading(false)
      return
    }
    if (!codigo) {
      // Como en GeminisWin, Clientes → Clientes abre directamente la ficha del primer cliente.
      supabase
        .from('cliente')
        .select('codigo')
        .order('codigo')
        .limit(1)
        .then(({ data }) => {
          if (data && data[0]) navigate(`/clientes/${encodeURIComponent(data[0].codigo)}`, { replace: true })
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
      .from('cliente')
      .select('*')
      .eq('codigo', codigo)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError('No se ha encontrado el cliente.')
          setLoading(false)
          return
        }
        setCliente(data as Cliente)
        setDraft(data as Cliente)
        setVacio(false)
        setMode('consulta')
        setLoading(false)
      })
  }, [codigo, isNew, navigate])

  // En alta, proponer el siguiente código libre en cuanto se conoce la lista.
  useEffect(() => {
    if (mode === 'alta' && !draft.codigo) {
      let vivo = true
      siguienteCodigoServidor('cliente', 5).then((c) => vivo && setDraft((d) => (d.codigo ? d : { ...d, codigo: c })))
      return () => {
        vivo = false
      }
    }
  }, [mode, draft.codigo])

  function patch(p: Partial<Cliente>) {
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
    // La contraseña web solo existe como hash y nunca se reenvía desde la ficha.
    const { actualizado_en: _a, web_contrasena_hash: _h, ...resto } = draft
    const payload = { ...resto, codigo: cod, nombre: resto.nombre.trim() }
    const res =
      mode === 'alta'
        ? await supabase.from('cliente').insert({ ...payload, fecha_alta: payload.fecha_alta ?? hoy() })
        : await supabase.from('cliente').update(payload).eq('codigo', cliente.codigo)
    setSaving(false)
    if (res.error) {
      setError(res.error.code === '23505' ? `Ya existe un cliente con el código ${cod}.` : res.error.message)
      return
    }
    if (mode === 'alta') {
      nav.refrescar()
      navigate(`/clientes/${encodeURIComponent(cod)}`, { replace: true })
      return
    }
    const { data } = await supabase.from('cliente').select('*').eq('codigo', cod).maybeSingle()
    const guardado = (data as Cliente | null) ?? { ...draft }
    setCliente(guardado)
    setDraft(guardado)
    setMode('consulta')
  }

  function handleCancel() {
    if (mode === 'alta') {
      navigate('/clientes')
      return
    }
    setDraft(cliente)
    setError(null)
    setMode('consulta')
  }

  async function handleDelete() {
    if (vacio || !cliente.codigo) return
    if (!confirm(`¿Dar de baja el cliente ${cliente.codigo} ${cliente.nombre}? Queda marcado como baja, no se borra.`)) return
    const f = hoy()
    const { error: err } = await supabase.from('cliente').update({ activo: false, fecha_baja: f }).eq('codigo', cliente.codigo)
    if (err) return setError(err.message)
    setCliente((c) => ({ ...c, activo: false, fecha_baja: f }))
    setDraft((c) => ({ ...c, activo: false, fecha_baja: f }))
  }

  const canNavigate = mode === 'consulta' && !vacio
  const goTo = (c?: string) => c && navigate(`/clientes/${encodeURIComponent(c)}`)
  const irA = async (d: NavDir) => goTo((await nav.ir(d))?.codigo)

  // Búsqueda desde los campos en consulta (Intro) y lista ordenada por el campo (Ctrl+Intro).
  async function buscarCodigo(t: string) {
    const c = await buscarTerceroPorCodigo('cliente', t)
    if (c) goTo(c)
    else setError(`No existe el cliente ${t}`)
  }
  const buscarInicio = (campo: string, que: string) => async (t: string) => {
    const f = await gwBuscarPorInicio('cliente', campo, t)
    if (f) goTo(String(f.codigo))
    else setError(`No existe ningún cliente con ${que} que empiece por «${t}»`)
  }
  const listaCampo = (campo: string) =>
    consulta
      ? (texto: string | null) => listaOrd.abrir(defTercero('cliente', campo), { texto, ancla: cliente.codigo, onPick: (f) => goTo(String(f.codigo)) })
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

  if (loading) return <div className="p-4 text-[13px]">Cargando…</div>

  const satelitesBloqueados = mode === 'alta' || vacio
  const aviso = (contenido: ReactNode) =>
    satelitesBloqueados ? (
      <div className="p-3 text-[13px]">
        {vacio ? 'No hay ningún cliente. Pulsa Nuevo para dar de alta el primero.' : 'Acepta el alta del cliente para poder rellenar esta pestaña.'}
      </div>
    ) : (
      contenido
    )
  const tabProps = { cliente: draft, editing, onChange: patch }

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[110px_minmax(0,1fr)_120px] gap-x-1.5">
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
        <GwField label="Nombre">
          {campoBusqueda('nombre', 'NOMBRE', 'nombre', draft.bloqueado ? '!font-bold !text-[#c42b1c] [-webkit-text-fill-color:#c42b1c]' : '')}
        </GwField>
        <GwField label="Fe. Nacimiento">
          <FechaInput value={draft.fecha_nacimiento} disabled={ro} title="FECHANAC" onChange={(v) => patch({ fecha_nacimiento: v })} />
        </GwField>
      </div>
      <div className="grid grid-cols-[110px_minmax(0,1fr)_120px_120px] gap-x-1.5">
        <GwField label="Dni/Nif">{campoBusqueda('nif', 'NIF', 'NIF')}</GwField>
        <GwField label="Razón Social:">{campoBusqueda('razon_social', 'RAZONSOC', 'razón social')}</GwField>
        <GwField label="Fecha de Alta">
          <FechaInput value={draft.fecha_alta} disabled={ro} title="F_ALTA" onChange={(v) => patch({ fecha_alta: v })} />
        </GwField>
        <GwField label="Fecha de Baja">
          <FechaInput value={draft.fecha_baja} disabled={ro} title="F_BAJA" onChange={(v) => patch({ fecha_baja: v })} />
        </GwField>
      </div>
      {draft.bloqueado && (
        <div className="text-[13px] font-bold text-[#c42b1c]" title="BLOQUEADO">
          CLIENTE BLOQUEADO
        </div>
      )}

      {(error || (!cliente.activo && !vacio && mode !== 'alta')) && (
        <div className="text-[13px] text-[#c42b1c]">{error ?? 'Cliente dado de baja.'}</div>
      )}

      <div className="mt-1">
        <GwTabs rows={TAB_ROWS} active={tab} onChange={setTab}>
          {vacio && !TABS_SATELITE.has(tab) ? (
            <div className="p-3 text-[13px]">No hay ningún cliente. Pulsa Nuevo para dar de alta el primero.</div>
          ) : (
            <>
              {tab === 'general' && <TabGeneral {...tabProps} />}
              {tab === 'comercial' && <TabComercial {...tabProps} />}
              {tab === 'tarifas' && aviso(<TabTarifas {...tabProps} />)}
              {tab === 'enlaces' && <TabEnlaces {...tabProps} />}
              {tab === 'bancos' && aviso(<TabBancos {...tabProps} />)}
              {tab === 'sucursales' && aviso(<TabSucursales {...tabProps} />)}
              {tab === 'agenda' && aviso(<TabAgenda {...tabProps} />)}
              {tab === 'obs' && <TabObsImg {...tabProps} />}
              {tab === 'consultas' && aviso(<TabConsultas {...tabProps} />)}
              {tab === 'web' && <TabWeb {...tabProps} />}
              {tab === 'comprados' && aviso(<TabArticulosComprados {...tabProps} />)}
              {tab === 'operativa' && (
                <GwOperativa
                  bloques={[
                    {
                      titulo: 'Artículos comprados',
                      notas: [
                        'Todo lo que ha comprado el cliente, un renglón por artículo: unidades en total y el último precio al que se le facturó.',
                        'Buscar: escribe parte del código, la referencia o la descripción.',
                        'Ordenar: pulsa el título de una columna (otra vez, al revés).',
                        'Web: cuántas de esas compras vinieron de la tienda online.',
                        'Vend.: número del empleado que hizo la última venta de ese artículo.',
                        'Ventas Vend.: ventas que no son de la web (Veces − Web). Pasa el ratón por encima para ver cuántas hizo cada vendedor.',
                        'Botón Listados: abre el Generador de listados con las ventas de este cliente.',
                        'Doble clic en un artículo: abre su ficha.',
                      ],
                    },
                  ]}
                />
              )}
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
        // Impresora: abre sus «Informes de…», como GeminisWin (Luis, 30/10/2026).
        onPrint={() => navigate('/listados-clientes/clientes')}
        onNew={() => navigate('/clientes/nuevo')}
        onEdit={() => !vacio && setMode('edicion')}
        onDelete={handleDelete}
        onSave={handleSave}
        onCancel={handleCancel}
        onExit={() => navigate('/')}
      />
      <div className="text-[11px] text-[#444]">
        Orden: {orden === 'codigo' ? 'por código' : 'por nombre'}
        {textoRegistro(nav)}
        {mode === 'alta' ? ' · Alta de cliente' : mode === 'edicion' ? ' · Modificando' : ''}
      </div>

      {listaOrd.dialogo}
      {buscar && (
        <GwLookupDialog<{ codigo: string; nombre: string; nif: string | null; poblacion: string | null }>
          title="Buscar Cliente"
          table="cliente"
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
