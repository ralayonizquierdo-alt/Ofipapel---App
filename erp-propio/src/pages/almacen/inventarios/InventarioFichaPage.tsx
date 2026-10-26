import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, ClipboardList, History } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { formatGw } from '../../../components/gw'
import { GwRecordBar } from '../../../components/gw/GwRecordBar'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import { GridMiniBar } from '../../../components/gw/GwGridParts'
import {
  CAMPOS_CAB,
  actualizarInventario,
  anadirLinea,
  cargarLineas,
  crearInventario,
  datosCab,
  deshacerInventario,
  normalizarCab,
  puntosDe,
  resolverArticulo,
  tomarLinea,
  vacia,
  type Cabecera,
  type Clave,
  type Linea,
  type Punto,
} from './logica'
import { DialogoBuscarLinea, DialogoInventariar, DialogoLinea, DialogoPuntos } from './Dialogos'

// Ficha de Inventarios (Almacén → Inventarios en GeminisWin): ARTINVEN + ARTINVDT.
// Las líneas se guardan al momento (como las tomas de GeminisWin); la cabecera y las
// opciones, con Aceptar. «Actualizado» aplica el inventario al stock vía movimiento_stock.

const lbl = 'text-[19px] leading-[22px] whitespace-nowrap'
const inp =
  'h-[30px]! text-[19px]! px-1.5! bg-white border border-[var(--gw-border)] outline-none focus:border-[var(--gw-select)] disabled:bg-white disabled:text-black'
const sel = `${inp} w-full`

const OPC = {
  tipo_inventario: ['Clásico'],
  tipo_actualizacion: [
    'Actualizar solo los artículos del inventario que hayan sido Inventariados',
    'Actualizar todos los artículos del inventario, aunque no hayan sido Inventariados',
    'Antes de actualizar, añadir al inventario todos los artículos faltantes del Almacén',
  ],
  tipo_punto_restauracion: [
    'No crear Punto de Restauración',
    'Crearlo solo de los artículos Inventariados o Actualizados',
    'Crearlo de todos los artículos del Almacén',
  ],
  tipo_stock_a_cero: [
    'No Poner a Cero Nunca',
    'Poner a Cero los artículos del inventario no Inventariados',
    'Poner a Cero todo el Almacén salvo lo Inventariado',
  ],
  tipo_deshacer: ['Con el valor Antiguo que había antes del Inventario', 'Restando los movimientos generados por el Inventario'],
  opcion_al_error: [
    'Mostrar error y preguntar para aceptar o descartar la toma',
    'Aceptar siempre la nueva toma',
    'Descartar siempre la nueva toma',
  ],
  filtro_linea_inventario: ['No filtrar; Mostrar todos los artículos', 'Mostrar solo los artículos Pendientes', 'Mostrar solo los artículos Inventariados'],
}

function fechaHoraEs(v: string | null) {
  if (!v) return ' /  /        :  :'
  const d = new Date(v)
  return `${d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-ES')}`
}

function Puntos({ onClick, disabled }: { onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Buscar"
      style={{ opacity: 1, color: '#000' }}
      className="gw-btn h-[30px]! w-[48px] flex-none text-[20px] font-bold leading-[10px] tracking-[2px] pb-[8px]!"
    >
      ···
    </button>
  )
}

function Opcion({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col ${className}`}>
      <span className={lbl}>{label}</span>
      {children}
    </label>
  )
}

export function InventarioFichaPage() {
  const params = useParams()
  const navigate = useNavigate()
  const ruta = (params['*'] ?? '').split('/').filter(Boolean)
  const isNew = ruta[0] === 'nuevo'
  const claveRuta: Clave | null =
    ruta.length >= 2 && !isNew ? { tienda_terminal_codigo: decodeURIComponent(ruta[0]), numero: Number(ruta[1]) } : null

  const [mode, setMode] = useState<'consulta' | 'edicion' | 'alta'>(isNew ? 'alta' : 'consulta')
  const [cab, setCab] = useState<Cabecera>(vacia('', ''))
  const [draft, setDraft] = useState<Cabecera>(vacia('', ''))
  const [lineas, setLineas] = useState<Linea[]>([])
  const [selLinea, setSelLinea] = useState(0)
  const [tab, setTab] = useState<'articulos' | 'opciones'>('articulos')
  const [tiendas, setTiendas] = useState<string[]>([])
  const [almacenes, setAlmacenes] = useState<{ codigo: string; nombre: string }[]>([])
  const [lista, setLista] = useState<Clave[]>([])
  const [orden, setOrden] = useState<'numero' | 'fecha'>('numero')
  const [loading, setLoading] = useState(true)
  const [sinDatos, setSinDatos] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [buscar, setBuscar] = useState<null | 'inventario' | 'almacen' | 'articulo'>(null)
  const [dlg, setDlg] = useState<null | 'nueva' | 'modificar' | 'inventariar' | 'buscarLinea' | 'puntos'>(null)
  const [articuloElegido, setArticuloElegido] = useState<string | null>(null)
  const [puntos, setPuntos] = useState<Punto[]>([])

  const editing = mode !== 'consulta'
  const vista = editing ? draft : cab
  const clave: Clave | null = cab.numero != null && mode !== 'alta' ? { tienda_terminal_codigo: cab.tienda_terminal_codigo, numero: cab.numero } : null
  const actualizado = cab.estado === 'inventariado'
  const puedeTomar = !!clave && !actualizado && !ocupado
  const actual = lineas[selLinea] ?? null

  useEffect(() => {
    supabase
      .from('tienda_terminal')
      .select('codigo')
      .order('codigo')
      .then(({ data }) => setTiendas(((data ?? []) as { codigo: string }[]).map((t) => t.codigo)))
    supabase
      .from('almacen')
      .select('codigo, nombre')
      .order('codigo')
      .then(({ data }) => setAlmacenes((data ?? []) as { codigo: string; nombre: string }[]))
  }, [])

  async function cargarLista(o = orden) {
    const q = supabase.from('inventario').select('tienda_terminal_codigo, numero')
    const { data } =
      o === 'numero' ? await q.order('tienda_terminal_codigo').order('numero') : await q.order('fecha', { nullsFirst: true }).order('numero')
    const l = ((data ?? []) as Clave[]).map((r) => ({ tienda_terminal_codigo: r.tienda_terminal_codigo, numero: Number(r.numero) }))
    setLista(l)
    return l
  }

  async function recargar(c: Clave) {
    const { data } = await supabase.from('inventario').select(CAMPOS_CAB).eq('tienda_terminal_codigo', c.tienda_terminal_codigo).eq('numero', c.numero).maybeSingle()
    if (!data) throw new Error('No se ha encontrado el inventario.')
    const r = normalizarCab(data as unknown as Record<string, unknown>)
    const ls = await cargarLineas(c)
    setCab(r)
    setDraft(r)
    setLineas(ls)
    return { r, ls }
  }

  useEffect(() => {
    let cancel = false
    async function run() {
      setError(null)
      setMensaje(null)
      setLoading(true)
      const l = await cargarLista()
      if (cancel) return
      if (isNew) {
        const v = vacia(tiendas[0] ?? '', almacenes[0]?.codigo ?? '')
        setCab(v)
        setDraft(v)
        setLineas([])
        setMode('alta')
        setSinDatos(false)
        setLoading(false)
        return
      }
      const c = claveRuta ?? l[l.length - 1] ?? null
      if (!c) {
        setSinDatos(true)
        setCab(vacia(tiendas[0] ?? '', ''))
        setLineas([])
        setMode('consulta')
        setLoading(false)
        return
      }
      if (!claveRuta) {
        navigate(`/inventario/${encodeURIComponent(c.tienda_terminal_codigo)}/${c.numero}`, { replace: true })
        return
      }
      try {
        await recargar(c)
        if (cancel) return
        setSelLinea(0)
        setMode('consulta')
        setSinDatos(false)
      } catch (e) {
        setError((e as Error).message)
      }
      setLoading(false)
    }
    run()
    return () => {
      cancel = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params['*'], tiendas.length, almacenes.length])

  const idx = claveRuta ? lista.findIndex((c) => c.tienda_terminal_codigo === claveRuta.tienda_terminal_codigo && c.numero === claveRuta.numero) : -1
  const ir = (c?: Clave) => c && navigate(`/inventario/${encodeURIComponent(c.tienda_terminal_codigo)}/${c.numero}`)
  const patch = (p: Partial<Cabecera>) => setDraft((d) => ({ ...d, ...p }))
  const nombreAlmacen = almacenes.find((a) => a.codigo === vista.almacen_codigo)?.nombre ?? ''

  const resumen = useMemo(() => {
    let conDiferencia = 0
    for (const l of lineas) if (l.estado === 1 && (l.cantidad_contada ?? 0) !== (l.stock_al_inventariar ?? 0)) conDiferencia++
    return { lineas: lineas.length, conDiferencia }
  }, [lineas])

  function cancelar() {
    setError(null)
    if (mode === 'alta') {
      const ult = lista[lista.length - 1]
      if (ult) ir(ult)
      else navigate('/inventario')
      return
    }
    setDraft(cab)
    setMode('consulta')
  }

  async function guardar() {
    setError(null)
    setMensaje(null)
    if (!draft.tienda_terminal_codigo) return setError('Indica la tienda.')
    if (!draft.almacen_codigo) return setError('Indica el almacén.')
    if (!almacenes.some((a) => a.codigo === draft.almacen_codigo)) return setError('Ese almacén no existe.')
    if (mode === 'edicion' && draft.almacen_codigo !== cab.almacen_codigo && lineas.length)
      return setError('No se puede cambiar el almacén de un inventario que ya tiene líneas.')
    setSaving(true)
    try {
      if (mode === 'alta') {
        const c = await crearInventario(draft)
        await cargarLista()
        setMode('consulta')
        navigate(`/inventario/${encodeURIComponent(c.tienda_terminal_codigo)}/${c.numero}`, { replace: true })
      } else {
        const { error: err } = await supabase
          .from('inventario')
          .update(datosCab(draft))
          .eq('tienda_terminal_codigo', cab.tienda_terminal_codigo)
          .eq('numero', cab.numero!)
        if (err) throw new Error(err.message)
        await recargar(clave!)
        setMode('consulta')
      }
    } catch (e) {
      setError((e as Error).message)
    }
    setSaving(false)
  }

  async function eliminar() {
    if (!clave) return
    if (actualizado) return setError('El inventario ya está actualizado: deshazlo antes de eliminarlo.')
    if (!window.confirm(`¿Eliminar el inventario ${clave.tienda_terminal_codigo}-${clave.numero} y sus ${lineas.length} línea(s)?`)) return
    const { error: e1 } = await supabase.from('inventario_linea').delete().eq('tienda_terminal_codigo', clave.tienda_terminal_codigo).eq('numero', clave.numero)
    const { error: e2 } = e1 ? { error: e1 } : await supabase.from('inventario').delete().eq('tienda_terminal_codigo', clave.tienda_terminal_codigo).eq('numero', clave.numero)
    if (e2) return setError(e2.message)
    const l = await cargarLista()
    const sig = l[Math.min(Math.max(idx, 0), l.length - 1)]
    if (sig) ir(sig)
    else navigate('/inventario', { replace: true })
  }

  /** Una toma: si el artículo ya está en el inventario actualiza la cantidad; si no, añade la línea. */
  async function registrarToma(codigo: string, cantidad: number | null): Promise<string> {
    if (!clave) throw new Error('Guarda antes el inventario.')
    const art = await resolverArticulo(codigo, cab.permite_codigo_barras)
    if (!art) throw new Error(`No existe el artículo «${codigo.trim()}».`)
    const existente = lineas.find((l) => l.articulo_codigo === art.codigo_interno)
    if (existente) {
      const suma = existente.cantidad_contada != null && cantidad != null && dlg === 'inventariar' ? existente.cantidad_contada + cantidad : cantidad
      const r = await tomarLinea(clave, cab, existente, suma, (m) => window.confirm(m))
      const ls = await cargarLineas(clave)
      setLineas(ls)
      setSelLinea(Math.max(0, ls.findIndex((l) => l.articulo_codigo === art.codigo_interno)))
      if (r === 'descartada') throw new Error(`Toma descartada: el stock de ${art.codigo_interno} ha variado entre tomas.`)
      return `${art.codigo_interno} ${art.descripcion}: ${suma == null ? 'pendiente' : formatGw(suma, 3)}`
    }
    const siguiente = lineas.reduce((m, l) => Math.max(m, l.numero_linea), 0) + 1
    await anadirLinea(clave, cab.almacen_codigo, art, cantidad, siguiente)
    const ls = await cargarLineas(clave)
    setLineas(ls)
    setSelLinea(ls.length - 1)
    return `${art.codigo_interno} ${art.descripcion}: añadido con ${cantidad == null ? 'pendiente' : formatGw(cantidad, 3)}`
  }

  async function borrarLinea() {
    if (!clave || !actual) return
    if (!window.confirm(`¿Borrar la línea del artículo ${actual.articulo_codigo}?`)) return
    const { error: e } = await supabase
      .from('inventario_linea')
      .delete()
      .eq('tienda_terminal_codigo', clave.tienda_terminal_codigo)
      .eq('numero', clave.numero)
      .eq('numero_linea', actual.numero_linea)
    if (e) return setError(e.message)
    const ls = await cargarLineas(clave)
    setLineas(ls)
    setSelLinea(Math.min(selLinea, Math.max(0, ls.length - 1)))
  }

  async function conOcupado(f: () => Promise<string>) {
    setError(null)
    setMensaje(null)
    setOcupado(true)
    try {
      setMensaje(await f())
      await recargar(clave!)
    } catch (e) {
      setError((e as Error).message)
    }
    setOcupado(false)
  }

  function pulsarActualizado() {
    if (!clave || editing) return
    if (!actualizado) {
      const n = lineas.filter((l) => l.estado === 1).length
      if (!window.confirm(`¿Actualizar el inventario ${clave.tienda_terminal_codigo}-${clave.numero}? Se corregirá el stock del almacén ${cab.almacen_codigo} (${n} artículo(s) inventariado(s)).`)) return
      conOcupado(() => actualizarInventario(clave, cab))
    } else deshacer()
  }

  function deshacer() {
    if (!clave || !actualizado) return
    if (!window.confirm(`¿Deshacer el inventario ${clave.tienda_terminal_codigo}-${clave.numero}? Se restaurará el stock del almacén ${cab.almacen_codigo}.`)) return
    setDlg(null)
    conOcupado(() => deshacerInventario(clave, cab))
  }

  async function verPuntos() {
    if (!clave) return
    try {
      setPuntos(await puntosDe(clave))
      setDlg('puntos')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const estadoBarra = loading ? 'Cargando…' : clave ? `Orden: ${orden === 'numero' ? 'Número' : 'Fecha'} · Registro ${idx + 1} de ${lista.length}` : ''

  return (
    <div className="flex min-w-[1180px] flex-col gap-1" style={{ fontFamily: 'Tahoma, Segoe UI, Arial, sans-serif' }}>
      {/* Cabecera */}
      <div className="flex items-end gap-2">
        <label className="flex w-[78px] flex-col">
          <span className={lbl}>Tienda</span>
          <select className={sel} disabled={mode !== 'alta'} value={vista.tienda_terminal_codigo} onChange={(e) => patch({ tienda_terminal_codigo: e.target.value })} title="TIENDA">
            {!tiendas.includes(vista.tienda_terminal_codigo) && <option value={vista.tienda_terminal_codigo}>{vista.tienda_terminal_codigo}</option>}
            {tiendas.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-[124px] flex-col">
          <span className={lbl}>
            <u>N</u>úmero
          </span>
          <input className={`${inp} w-full text-right`} disabled readOnly value={vista.numero ?? ''} title="Se asigna al guardar" />
        </label>
        <label className="flex min-w-0 flex-1 flex-col">
          <span className={lbl}>Nombre</span>
          <input className={`${inp} w-full`} disabled={!editing} value={vista.nombre ?? ''} onChange={(e) => patch({ nombre: e.target.value || null })} title="NOMBRE" />
        </label>
        <label className="flex w-[160px] flex-col">
          <span className={lbl}>Fecha</span>
          <input type="date" className={`${inp} w-full`} disabled={!editing} value={vista.fecha ?? ''} onChange={(e) => patch({ fecha: e.target.value })} />
        </label>
        <label className="flex w-[218px] flex-col">
          <span className={lbl}>Fecha y hora de alta</span>
          <input className={`${inp} w-full`} disabled readOnly value={fechaHoraEs(vista.creado_en)} />
        </label>
        <label className="flex w-[218px] flex-col">
          <span className={lbl}>Fecha Actualización</span>
          <input className={`${inp} w-full bg-[#f0f0f0]! text-[#6d6d6d]!`} disabled readOnly value={fechaHoraEs(vista.fecha_hora_actualizacion)} />
        </label>
      </div>

      <div className="flex gap-3">
        <div className="flex w-[340px] flex-none flex-col gap-1.5">
          <fieldset className="border border-[var(--gw-border-light)] px-1.5 pb-1.5 pt-0">
            <legend className={`${lbl} px-0.5`}>Almacen</legend>
            <div className="flex gap-1">
              <input
                className={`${inp} w-[56px]`}
                disabled={!editing || (mode === 'edicion' && lineas.length > 0)}
                value={vista.almacen_codigo}
                onChange={(e) => patch({ almacen_codigo: e.target.value })}
                title="ALMACEN"
              />
              <select
                className={`${inp} min-w-0 flex-1`}
                disabled={!editing || (mode === 'edicion' && lineas.length > 0)}
                value={vista.almacen_codigo}
                onChange={(e) => patch({ almacen_codigo: e.target.value })}
              >
                {!nombreAlmacen && <option value={vista.almacen_codigo}></option>}
                {almacenes.map((a) => (
                  <option key={a.codigo} value={a.codigo}>
                    {a.nombre}
                  </option>
                ))}
              </select>
              <Puntos disabled={!editing || (mode === 'edicion' && lineas.length > 0)} onClick={() => setBuscar('almacen')} />
            </div>
          </fieldset>
          <div className="flex items-center gap-2">
            <span className={`${lbl} w-[118px]`}>Documento:</span>
            <input
              className={`${inp} min-w-0 flex-1`}
              disabled={!editing}
              value={vista.documento_externo ?? ''}
              onChange={(e) => patch({ documento_externo: e.target.value || null })}
              title="Documento externo (USR_INV)"
            />
            <Puntos disabled />
          </div>
        </div>
        <label className="flex min-w-0 flex-1 flex-col">
          <span className={lbl}>Observaciones</span>
          <textarea
            className="h-[82px] w-full resize-none border border-[var(--gw-border)] bg-white px-1.5 text-[18px] leading-[22px] outline-none disabled:text-black"
            disabled={!editing}
            value={vista.observaciones ?? ''}
            onChange={(e) => patch({ observaciones: e.target.value || null })}
          />
        </label>
      </div>

      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-0.5 text-[13px] text-[#c42b1c] whitespace-pre-line">{error}</div>}
      {mensaje && <div className="border border-[var(--gw-border)] bg-white px-2 py-0.5 text-[13px] text-[#1a4fd0]">{mensaje}</div>}
      {sinDatos && !editing && <div className="px-1 text-[13px] text-[#1a4fd0]">Todavía no hay inventarios. Pulsa «Nuevo».</div>}

      {/* Pestañas */}
      <div className="flex">
        {(['articulos', 'opciones'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`h-[38px] flex-1 border border-[var(--gw-border)] text-[20px] ${tab === t ? 'bg-white font-bold' : 'bg-[var(--gw-face)] hover:bg-[#e5f1fb]'}`}
          >
            {t === 'articulos' ? 'Artículos' : 'Opciones'}
          </button>
        ))}
      </div>

      {tab === 'articulos' ? (
        <div className="flex flex-col gap-1">
          <Rejilla lineas={lineas} sel={selLinea} setSel={setSelLinea} onAbrir={(i) => (setSelLinea(i), puedeTomar && setDlg('modificar'))} />
          <div className="flex items-center gap-3">
            <GridMiniBar
              nuevo={puedeTomar}
              modificar={puedeTomar && !!actual}
              borrar={puedeTomar && !!actual}
              buscar={lineas.length > 0}
              onNuevo={() => (setArticuloElegido(null), setDlg('nueva'))}
              onModificar={() => setDlg('modificar')}
              onBorrar={borrarLinea}
              onBuscar={() => setDlg('buscarLinea')}
            />
            <button
              type="button"
              disabled={!clave || editing || ocupado}
              onClick={pulsarActualizado}
              title={actualizado ? 'Inventario actualizado. Pulsa para deshacerlo.' : 'Pulsa para actualizar el stock con este inventario'}
              className="flex h-[34px] w-[170px] items-center justify-center gap-1 border border-[var(--gw-border)] bg-white text-[19px] hover:bg-[#e5f1fb] disabled:opacity-70"
            >
              <span className={`flex h-[16px] w-[16px] items-center justify-center border ${actualizado ? 'border-transparent text-[#0a8f2e]' : 'border-[var(--gw-border)]'}`}>
                {actualizado && <Check size={18} strokeWidth={3} />}
              </span>
              {ocupado ? 'Procesando…' : 'Actualizado'}
            </button>
            <span className="text-[19px] text-[#1a4fd0]">Nº Lineas: {resumen.lineas}</span>
            <span className="text-[19px] text-[#1a4fd0]" title="Artículos inventariados cuyo recuento difiere del stock">
              Stock:{resumen.conDiferencia}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              disabled={!puedeTomar}
              onClick={() => setDlg('inventariar')}
              className="gw-btn h-[38px]! w-[240px] gap-1.5 text-[19px]! disabled:text-[#8a8a8a]"
            >
              <ClipboardList size={17} />
              Inventariar Artículos
            </button>
          </div>
        </div>
      ) : (
        <Opciones vista={vista} editing={editing} patch={patch} onVerPuntos={verPuntos} puedeVer={!!clave} />
      )}

      <GwRecordBar
        mode={mode}
        canNavigate={!editing && lista.length > 0}
        saving={saving}
        onFirst={() => ir(lista[0])}
        onPrev={() => ir(lista[Math.max(0, idx - 1)])}
        onNext={() => ir(lista[Math.min(lista.length - 1, idx + 1)])}
        onLast={() => ir(lista[lista.length - 1])}
        onSort={async () => {
          const o = orden === 'numero' ? 'fecha' : 'numero'
          setOrden(o)
          await cargarLista(o)
        }}
        onSearch={() => setBuscar('inventario')}
        onPrint={() => window.print()}
        onNew={() => navigate('/inventario/nuevo')}
        onEdit={() => clave && (setDraft(cab), setMode('edicion'))}
        onDelete={eliminar}
        onSave={guardar}
        onCancel={cancelar}
        onExit={() => navigate('/')}
      />
      <div className="px-1 text-[12px] text-[#555]">{estadoBarra}</div>

      {buscar === 'inventario' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Inventarios"
          table="inventario"
          columns={[
            { key: 'tienda_terminal_codigo', label: 'Tienda', width: 60 },
            { key: 'numero', label: 'Número', width: 80 },
            { key: 'fecha', label: 'Fecha', width: 100 },
            { key: 'nombre', label: 'Nombre' },
            { key: 'almacen_codigo', label: 'Alm.', width: 50 },
            { key: 'estado', label: 'Estado', width: 100 },
          ]}
          searchColumns={['nombre', 'almacen_codigo']}
          orderBy="numero"
          keyColumn="numero"
          onPick={(r) => {
            setBuscar(null)
            ir({ tienda_terminal_codigo: String(r.tienda_terminal_codigo), numero: Number(r.numero) })
          }}
          onClose={() => setBuscar(null)}
        />
      )}
      {buscar === 'almacen' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Almacén"
          table="almacen"
          columns={[
            { key: 'codigo', label: 'Código', width: 110 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            patch({ almacen_codigo: String(r.codigo) })
            setBuscar(null)
          }}
          onClose={() => setBuscar(null)}
        />
      )}
      {buscar === 'articulo' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Artículos"
          table="articulo"
          columns={[
            { key: 'codigo_interno', label: 'Código', width: 110 },
            { key: 'descripcion', label: 'Descripción' },
          ]}
          searchColumns={['codigo_interno', 'descripcion']}
          orderBy="codigo_interno"
          keyColumn="codigo_interno"
          onPick={(r) => {
            setArticuloElegido(String(r.codigo_interno))
            setBuscar(null)
          }}
          onClose={() => setBuscar(null)}
        />
      )}
      {(dlg === 'nueva' || (dlg === 'modificar' && actual)) && (
        <DialogoLinea
          linea={dlg === 'modificar' ? actual : null}
          codigoElegido={articuloElegido}
          onBuscar={() => setBuscar('articulo')}
          onAceptar={async (codigo, cantidad) => {
            try {
              setMensaje(await registrarToma(codigo, cantidad))
              setDlg(null)
              return null
            } catch (e) {
              return (e as Error).message
            }
          }}
          onClose={() => setDlg(null)}
        />
      )}
      {dlg === 'inventariar' && (
        <DialogoInventariar
          lineas={lineas}
          porBarras={cab.permite_codigo_barras}
          filtroInicial={cab.filtro_linea_inventario}
          onToma={(codigo, cantidad) => registrarToma(codigo, cantidad)}
          onClose={() => setDlg(null)}
        />
      )}
      {dlg === 'buscarLinea' && (
        <DialogoBuscarLinea
          onBuscar={(texto) => {
            const t = texto.trim().toLowerCase()
            const i = lineas.findIndex((l) => l.articulo_codigo.toLowerCase() === t || (l.descripcion ?? '').toLowerCase().includes(t))
            if (i >= 0) setSelLinea(i)
            return i >= 0
          }}
          onClose={() => setDlg(null)}
        />
      )}
      {dlg === 'puntos' && <DialogoPuntos puntos={puntos} puedeDeshacer={actualizado && !ocupado} onDeshacer={deshacer} onClose={() => setDlg(null)} />}
    </div>
  )
}

function Rejilla({ lineas, sel, setSel, onAbrir }: { lineas: Linea[]; sel: number; setSel: (i: number) => void; onAbrir: (i: number) => void }) {
  const vacias = Math.max(0, 10 - lineas.length)
  const td = 'h-[22px] border-r border-b border-[var(--gw-border-light)] px-1 whitespace-nowrap overflow-hidden'
  const num = (v: number | null, color: string) => <span style={{ color }}>{formatGw(v ?? 0, 3)}</span>
  return (
    <div className="h-[262px] overflow-auto border border-[var(--gw-border)] bg-white">
      <table className="w-full table-fixed border-collapse text-[18px]">
        <colgroup>
          <col style={{ width: 140 }} />
          <col style={{ width: 262 }} />
          <col style={{ width: 150 }} />
          <col style={{ width: 138 }} />
          <col style={{ width: 142 }} />
          <col style={{ width: 138 }} />
          <col style={{ width: 138 }} />
          <col style={{ width: 52 }} />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-[var(--gw-face)]">
          <tr>
            {['Código', 'Descripción', 'Estado', 'Stock Anterior', 'Stock al Inven.', 'Inventariado', 'Actualizado', 'Act'].map((h) => (
              <th key={h} className="h-[28px] border-r border-b border-[var(--gw-border)] px-1 text-left text-[19px] font-normal">
                {h}
                {h === 'Act' && <Check size={14} className="inline text-[#0a8f2e]" strokeWidth={3} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lineas.map((l, i) => {
            const s = i === sel
            const inventariado = l.estado === 1
            const verdeSiCero = (v: number | null) => ((v ?? 0) === 0 ? '#0a8f2e' : '#000')
            const colorInv = !inventariado ? '#000' : (l.cantidad_contada ?? 0) !== (l.stock_al_inventariar ?? 0) ? '#e00000' : '#1a3fe0'
            return (
              <tr key={l.numero_linea} onClick={() => setSel(i)} onDoubleClick={() => onAbrir(i)} className={s ? 'bg-[#cce4f7]' : ''}>
                <td className={td}>
                  {s && <span className="float-left text-[9px] leading-[22px]">▸</span>}
                  {l.articulo_codigo}
                </td>
                <td className={td}>{l.descripcion}</td>
                <td className={td}>{inventariado ? '1-Inventariado' : '0-Pendiente'}</td>
                <td className={`${td} text-right tabular-nums`}>{num(l.stock_anterior, verdeSiCero(l.stock_anterior))}</td>
                <td className={`${td} text-right tabular-nums`}>{num(l.stock_al_inventariar, verdeSiCero(l.stock_al_inventariar))}</td>
                <td className={`${td} text-right tabular-nums`}>{num(l.cantidad_contada, colorInv)}</td>
                <td className={`${td} text-right tabular-nums`}>{num(l.stock_actual, verdeSiCero(l.stock_actual))}</td>
                <td className={`${td} text-center`}>
                  <input type="checkbox" readOnly checked={l.inventariada} className="pointer-events-none h-[12px] w-[12px] accent-[#0078d7]" />
                </td>
              </tr>
            )
          })}
          {Array.from({ length: vacias }, (_, i) => (
            <tr key={`v${i}`}>
              {Array.from({ length: 8 }, (_, j) => (
                <td key={j} className={td}>
                  &nbsp;
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Opciones({
  vista,
  editing,
  patch,
  onVerPuntos,
  puedeVer,
}: {
  vista: Cabecera
  editing: boolean
  patch: (p: Partial<Cabecera>) => void
  onVerPuntos: () => void
  puedeVer: boolean
}) {
  const select = (k: keyof typeof OPC) => (
    <select className={sel} disabled={!editing} value={Number(vista[k] ?? 0)} onChange={(e) => patch({ [k]: Number(e.target.value) } as Partial<Cabecera>)}>
      {OPC[k].map((t, i) => (
        <option key={i} value={i}>
          {t}
        </option>
      ))}
    </select>
  )
  return (
    <div className="flex flex-col gap-1.5 border border-[var(--gw-border)] bg-[var(--gw-face)] p-1.5">
      <div className="flex items-start gap-8">
        <Opcion label="Tipo de Inventario" className="w-[180px] flex-none">
          {select('tipo_inventario')}
        </Opcion>
        <div className="flex flex-1 flex-col gap-0.5 border border-[var(--gw-border-light)] px-1.5 py-1">
          {OPC.tipo_actualizacion.map((t, i) => (
            <label key={i} className="flex items-center gap-1.5 text-[18px]">
              <input type="radio" name="tipo_actualizacion" className="h-[12px] w-[12px] accent-[#0078d7]" disabled={!editing} checked={vista.tipo_actualizacion === i} onChange={() => patch({ tipo_actualizacion: i })} />
              {t}
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-start gap-4">
        <div className="flex w-[590px] flex-none flex-col gap-1">
          <Opcion label="Crear Punto de Restauración">{select('tipo_punto_restauracion')}</Opcion>
          <Opcion label="Poner Stock A Cero antes de Actualizar el Inventario">{select('tipo_stock_a_cero')}</Opcion>
          <Opcion label="Al Deshacer un Inventario Restaurar almacén">{select('tipo_deshacer')}</Opcion>
          <Opcion label="Que hacer al producirse una variación de stock entre tomas">{select('opcion_al_error')}</Opcion>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-[22px]">
          <button type="button" className="gw-btn h-[40px]! w-[340px] gap-1.5 text-[19px]!" disabled={!puedeVer || editing} onClick={onVerPuntos}>
            <History size={17} className="text-[#b07a00]" />
            Ver Puntos de Restauración
          </button>
          <label className="flex items-start gap-1.5 text-[18px] leading-[22px]">
            <input
              type="checkbox"
              className="mt-[5px] h-[12px] w-[12px] accent-[#0078d7]"
              disabled={!editing}
              checked={vista.stock_a_cero_al_iniciar}
              onChange={(e) => patch({ stock_a_cero_al_iniciar: e.target.checked })}
            />
            Crear el Punto de Restauración y Poner el Stock a 0, sólo al Agregar un Registro Nuevo
          </label>
          <fieldset className="border border-[var(--gw-border-light)] px-1.5 pb-1.5 pt-0">
            <legend className={`${lbl} px-0.5`}>Opciones al Inventariar artículos</legend>
            <label className="flex items-center gap-1.5 text-[18px]">
              <input
                type="checkbox"
                className="h-[12px] w-[12px] accent-[#0078d7]"
                disabled={!editing}
                checked={vista.permite_codigo_barras}
                onChange={(e) => patch({ permite_codigo_barras: e.target.checked })}
              />
              Localizar Artículos por el Código de Barras
            </label>
            <Opcion label="Filtrarlos según el Estado">{select('filtro_linea_inventario')}</Opcion>
          </fieldset>
        </div>
      </div>
    </div>
  )
}
