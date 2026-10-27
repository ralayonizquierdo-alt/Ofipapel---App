import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { GwField, GwInput, GwTabs, type GwTabDef } from '../../../components/gw'
import { GwRecordBar } from '../../../components/gw/GwRecordBar'
import { GwLocalizarDialog } from '../../../components/gw/GwLocalizarDialog'
import { GwCampoBusqueda } from '../../../components/gw/GwCampoBusqueda'
import { useBusquedaFicha } from '../../../components/gw/useBusquedaFicha'
import { CONFIG, type Comisiones, type TipoFicha, type Vendedor, emptyVendedor } from './types'
import { VendedoresListPage } from './VendedoresListPage'
import { TabDatosGenerales } from './tabs/TabDatosGenerales'
import { TabComisiones } from './tabs/TabComisiones'
import { TabBancos } from './tabs/TabBancos'
import { TabConsultas } from './tabs/TabConsultas'
import { TabObservaciones } from './tabs/TabObservaciones'

interface CodigoNombre {
  codigo: string
  nombre: string
}

const TAB_ROWS: GwTabDef[][] = [
  [
    { key: 'generales', label: 'Datos Generales' },
    { key: 'comisiones', label: 'Comisiones' },
    { key: 'bancos', label: 'Bancos' },
    { key: 'consultas', label: 'Consultas' },
    { key: 'obs', label: 'Observaciones e Imagen' },
  ],
]

const TABS_SATELITE = new Set(['bancos', 'consultas'])
const NIVELES = [0, 1, 2, 3, 4, 5, 6]

const hoy = () => new Date().toISOString().slice(0, 10)

/** Siguiente código numérico con 3 dígitos, como los de GeminisWin (008, 592…). */
function siguienteCodigo(codigos: string[]) {
  const max = codigos.reduce((m, c) => (/^\d+$/.test(c) ? Math.max(m, Number(c)) : m), 0)
  return String(max + 1).padStart(3, '0')
}

/** Ficha de Vendedores y de Técnicos: rutas /vendedores/<código>, /vendedores/nuevo y /vendedores/lista (ídem /tecnicos). */
export function VendedorFichaPage({ tipo = 'vendedor' }: { tipo?: TipoFicha }) {
  const resto = useParams()['*'] ?? ''
  if (resto === 'lista') return <VendedoresListPage tipo={tipo} />
  return <Ficha key={tipo} tipo={tipo} codigo={resto ? decodeURIComponent(resto) : undefined} />
}

function Ficha({ tipo, codigo }: { tipo: TipoFicha; codigo?: string }) {
  const cfg = CONFIG[tipo]
  const navigate = useNavigate()
  const isNew = codigo === 'nuevo'

  const [mode, setMode] = useState<'consulta' | 'edicion' | 'alta'>(isNew ? 'alta' : 'consulta')
  const [registro, setRegistro] = useState<Vendedor>({ ...emptyVendedor, actualizado_en: '' })
  const [draft, setDraft] = useState<Vendedor>({ ...emptyVendedor, actualizado_en: '' })
  const [comisiones, setComisiones] = useState<Comisiones>({})
  const [comisionesGuardadas, setComisionesGuardadas] = useState<Comisiones>({})
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
  const ir = (c: string) => navigate(`${cfg.ruta}/${encodeURIComponent(c)}`)

  useEffect(() => {
    supabase
      .from(cfg.tabla)
      .select('codigo, nombre')
      .order('codigo')
      .then(({ data }) => {
        setLista((data ?? []) as CodigoNombre[])
        setListaCargada(true)
      })
  }, [cfg.tabla])

  useEffect(() => {
    setError(null)
    if (isNew) {
      const nuevo = { ...emptyVendedor, fecha_alta: hoy(), actualizado_en: '' }
      setRegistro(nuevo)
      setDraft(nuevo)
      setComisiones({})
      setComisionesGuardadas({})
      setVacio(false)
      setMode('alta')
      setLoading(false)
      return
    }
    if (!codigo) {
      // Como en GeminisWin, la opción del menú abre directamente la ficha del primero.
      supabase
        .from(cfg.tabla)
        .select('codigo')
        .order('codigo')
        .limit(1)
        .then(({ data }) => {
          if (data && data[0]) navigate(`${cfg.ruta}/${encodeURIComponent(data[0].codigo)}`, { replace: true })
          else {
            setVacio(true)
            setMode('consulta')
            setLoading(false)
          }
        })
      return
    }
    setLoading(true)
    Promise.all([
      supabase.from(cfg.tabla).select('*').eq('codigo', codigo).maybeSingle(),
      supabase.from(cfg.tablaComision).select('nivel_tarifa, comision_pct').eq(cfg.fk, codigo),
    ]).then(([r, c]) => {
      if (r.error || !r.data) {
        setError(`No se ha encontrado el ${cfg.singular}.`)
        setLoading(false)
        return
      }
      const reg = { ...emptyVendedor, ...(r.data as Vendedor) }
      const com: Comisiones = {}
      for (const fila of (c.data ?? []) as { nivel_tarifa: number; comision_pct: number | null }[]) {
        com[fila.nivel_tarifa] = fila.comision_pct == null ? null : Number(fila.comision_pct)
      }
      setRegistro(reg)
      setDraft(reg)
      setComisiones(com)
      setComisionesGuardadas(com)
      setVacio(false)
      setMode('consulta')
      setLoading(false)
    })
  }, [codigo, isNew, navigate, cfg])

  useEffect(() => {
    if (mode === 'alta' && listaCargada && !draft.codigo) {
      setDraft((d) => ({ ...d, codigo: siguienteCodigo(lista.map((l) => l.codigo)) }))
    }
  }, [mode, listaCargada, lista, draft.codigo])

  function patch(p: Partial<Vendedor>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  async function guardarComisiones(cod: string) {
    const filas = NIVELES.filter((n) => comisiones[n] != null).map((n) => ({ [cfg.fk]: cod, nivel_tarifa: n, comision_pct: comisiones[n] }))
    const quitar = NIVELES.filter((n) => comisiones[n] == null && comisionesGuardadas[n] != null)
    if (filas.length) {
      const { error: err } = await supabase.from(cfg.tablaComision).upsert(filas, { onConflict: `${cfg.fk},nivel_tarifa` })
      if (err) return err.message
    }
    if (quitar.length) {
      const { error: err } = await supabase.from(cfg.tablaComision).update({ comision_pct: null }).eq(cfg.fk, cod).in('nivel_tarifa', quitar)
      if (err) return err.message
    }
    setComisionesGuardadas({ ...comisiones })
    return null
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
        ? await supabase.from(cfg.tabla).insert({ ...payload, fecha_alta: payload.fecha_alta ?? hoy() })
        : await supabase.from(cfg.tabla).update(payload).eq('codigo', registro.codigo)
    if (res.error) {
      setSaving(false)
      setError(res.error.code === '23505' ? `Ya existe un ${cfg.singular} con el código ${cod}.` : res.error.message)
      return
    }
    const errCom = await guardarComisiones(cod)
    setSaving(false)
    if (errCom) setError(`Guardado, pero las comisiones no: ${errCom}`)
    if (mode === 'alta') {
      setLista((l) => [...l, { codigo: cod, nombre: payload.nombre }].sort((a, b) => a.codigo.localeCompare(b.codigo)))
      ir(cod)
      return
    }
    const { data } = await supabase.from(cfg.tabla).select('*').eq('codigo', cod).maybeSingle()
    const guardado = data ? { ...emptyVendedor, ...(data as Vendedor) } : { ...draft }
    setRegistro(guardado)
    setDraft(guardado)
    setLista((l) => l.map((x) => (x.codigo === cod ? { ...x, nombre: guardado.nombre } : x)))
    setMode('consulta')
  }

  function handleCancel() {
    if (mode === 'alta') {
      if (lista[0]) ir(lista[0].codigo)
      else navigate(cfg.ruta)
      return
    }
    setDraft(registro)
    setComisiones(comisionesGuardadas)
    setError(null)
    setMode('consulta')
  }

  async function handleDelete() {
    if (vacio || !registro.codigo) return
    if (!confirm(`¿Dar de baja el ${cfg.singular} ${registro.codigo} ${registro.nombre}? Queda marcado como baja, no se borra.`)) return
    const f = hoy()
    const { error: err } = await supabase.from(cfg.tabla).update({ activo: false, fecha_baja: f }).eq('codigo', registro.codigo)
    if (err) return setError(err.message)
    setRegistro((c) => ({ ...c, activo: false, fecha_baja: f }))
    setDraft((c) => ({ ...c, activo: false, fecha_baja: f }))
  }

  const ordenada = useMemo(
    () => (orden === 'codigo' ? lista : [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.codigo.localeCompare(b.codigo))),
    [lista, orden],
  )
  const idx = ordenada.findIndex((r) => r.codigo === registro.codigo)
  const canNavigate = mode === 'consulta' && ordenada.length > 0
  const goTo = (c?: string) => c && ir(c)
  // Intro en Código/Nombre (consulta) y Ctrl+Intro: lista ordenada (gw_lista_ordenada).
  const busq = useBusquedaFicha({
    fuente: cfg.tabla,
    campoNombre: 'nombre',
    que: `el ${cfg.singular}`,
    titulo: cfg.titulo,
    digitos: 3,
    consulta: mode === 'consulta',
    actual: registro.codigo || null,
    goTo: ir,
    setError,
    columnasExtra: [
      { key: 'nombre_corto', label: 'Nomb. corto', width: 120 },
      { key: 'dni', label: 'Dni/Nif', width: 110 },
    ],
  })

  const ro = !editing
  const txt = (key: keyof Vendedor, title: string) => (
    <GwInput
      value={(draft[key] ?? '') as string}
      disabled={ro}
      title={title}
      onChange={(e) => patch({ [key]: e.target.value === '' ? null : e.target.value } as Partial<Vendedor>)}
    />
  )

  if (loading) return <div className="p-4 text-[13px]">Cargando…</div>

  const satelitesBloqueados = mode === 'alta' || vacio
  const aviso = (contenido: ReactNode) =>
    satelitesBloqueados ? (
      <div className="min-h-[250px] p-3 text-[13px]">
        {vacio ? `No hay ningún ${cfg.singular}. Pulsa Nuevo para dar de alta el primero.` : `Acepta el alta del ${cfg.singular} para poder rellenar esta pestaña.`}
      </div>
    ) : (
      contenido
    )
  const tabProps = { tipo, vendedor: draft, editing, onChange: patch }

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[96px_minmax(0,1fr)_180px_210px] gap-x-4">
        <GwField label="Código">
          <GwCampoBusqueda
            value={draft.codigo}
            editable={mode === 'alta'}
            disabled={mode === 'edicion'}
            title={tipo === 'vendedor' ? 'IDVENDEDOR' : 'IDTECNICO'}
            onChange={(v) => patch({ codigo: v })}
            {...busq.busqueda('codigo')}
          />
        </GwField>
        <GwField label="Nombre">
          <GwCampoBusqueda value={draft.nombre} editable={!ro} title="NOMBRE" onChange={(v) => patch({ nombre: v })} {...busq.busqueda('nombre')} />
        </GwField>
        <GwField label="Nomb. corto">{txt('nombre_corto', 'NOMBCORTO')}</GwField>
        <GwField label="Dni/Nif">{txt('dni', 'DNI')}</GwField>
      </div>

      {(error || (!registro.activo && !vacio && mode !== 'alta')) && (
        <div className="text-[13px] text-[#c42b1c]">{error ?? (tipo === 'vendedor' ? 'Vendedor dado de baja.' : 'Técnico dado de baja.')}</div>
      )}

      <div className="mt-1">
        <GwTabs rows={TAB_ROWS} active={tab} onChange={setTab}>
          {vacio && !TABS_SATELITE.has(tab) ? (
            <div className="min-h-[250px] p-3 text-[13px]">No hay ningún {cfg.singular}. Pulsa Nuevo para dar de alta el primero.</div>
          ) : (
            <>
              {tab === 'generales' && <TabDatosGenerales {...tabProps} />}
              {tab === 'comisiones' && (
                <TabComisiones {...tabProps} comisiones={comisiones} onComision={(n, v) => setComisiones((c) => ({ ...c, [n]: v }))} />
              )}
              {tab === 'bancos' && aviso(<TabBancos codigo={registro.codigo} tipoEntidad={tipo} editing={editing} />)}
              {tab === 'consultas' && aviso(<TabConsultas codigo={registro.codigo} campo={cfg.fk as 'vendedor_codigo' | 'tecnico_codigo'} />)}
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
        onNew={() => navigate(`${cfg.ruta}/nuevo`)}
        onEdit={() => !vacio && setMode('edicion')}
        onDelete={handleDelete}
        onSave={handleSave}
        onCancel={handleCancel}
        onExit={() => navigate('/')}
      />
      <div className="text-[11px] text-[#444]">
        Orden: {orden === 'codigo' ? 'por código' : 'por nombre'}
        {idx >= 0 ? ` · Registro ${idx + 1} de ${ordenada.length}` : ''}
        {mode === 'alta' ? ` · Alta de ${cfg.singular}` : mode === 'edicion' ? ' · Modificando' : ''}
        {' · '}
        <button type="button" className="underline" onClick={() => navigate(`${cfg.ruta}/lista`)}>
          Lista
        </button>
      </div>

      {busq.dialogo}
      {buscar && (
        <GwLocalizarDialog<{ codigo: string; nombre: string; nombre_corto: string | null; dni: string | null; poblacion: string | null }>
          table={cfg.tabla}
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'nombre', label: 'Nombre' },
            { key: 'nombre_corto', label: 'Nomb. corto', width: 120 },
            { key: 'dni', label: 'Dni/Nif', width: 110 },
            { key: 'poblacion', label: 'Población', width: 140 },
          ]}
          searchColumns={['codigo', 'nombre', 'nombre_corto', 'dni', 'poblacion']}
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
