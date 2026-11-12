import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { GwDate, GwInput, GwLookupButton, GwNumber, GwSelect, GwTextArea, formatGw } from '../../../components/gw'
import { GridMiniBar, FilasVacias } from '../../../components/gw/GwGridParts'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import { GwRecordBar } from '../../../components/gw/GwRecordBar'
import { textoRegistro, useNavRegistro, type NavDir } from '../../../components/gw/useNavRegistro'
import { IN, L } from '../../../components/gw/GwInformeArticulos'
import { OperativaDialogo } from '../../utilidades/comun'
import { ModalGw, fechaEs, msgError, useAlmacenes, useTiendas } from './comun'

// Almacén → Puntos de Restauración Stock, CALCADA de GeminisWin (captura 04 del bloque 8, 12/11/2026).
// Un punto de restauración es una copia del stock por almacén en un momento dado
// (punto_restauracion_stock + punto_restauracion_stock_linea = STKPTRT / STKPTRTD).
// Es una ficha como las demás: cabecera, rejilla de artículos y barra de registro. La rejilla puede
// tener cientos de miles de líneas (317.955 en la captura), así que NUNCA se trae entera: se pide por
// tramos de TRAMO líneas según se baja y el total se cuenta en el servidor.
// Crear un punto: fn_punto_restauracion_crear_rango (migración 20261113_puntos_restauracion.sql).
// Restaurar: fn_punto_restauracion_restaurar, que ya existía (movimientos de regularización por la
// diferencia, en una transacción); aquí solo se llama, no se ha tocado.

interface Clave {
  tienda_terminal_codigo: string
  numero: number
}
interface Punto {
  tienda_terminal_codigo: string
  numero: number | null
  fecha: string
  concepto: string | null
  observaciones: string | null
  almacen_desde_codigo: string | null
  almacen_hasta_codigo: string | null
  documento_externo: string | null
  origen_tipo: string | null
  origen_numero: number | null
  fecha_hora_restaurado: string | null
}
interface Linea {
  numero_linea: number
  almacen_codigo: string | null
  articulo_codigo: string
  descripcion: string | null
  fecha_stock_inicial: string | null
  cantidad_inicial: number | null
  cantidad_antes_de_restaurar: number | null
  articulo: { descripcion: string | null } | null
}

const CAMPOS =
  'tienda_terminal_codigo, numero, fecha, concepto, observaciones, almacen_desde_codigo, almacen_hasta_codigo, documento_externo, origen_tipo, origen_numero, fecha_hora_restaurado'
const CAMPOS_LINEA =
  'numero_linea, almacen_codigo, articulo_codigo, descripcion, fecha_stock_inicial, cantidad_inicial, cantidad_antes_de_restaurar, articulo(descripcion)'
const TRAMO = 200
/** Desplegable «Origen:» (en la captura, «Tarea Progr.»). */
const ORIGENES = [
  { v: 'manual', t: 'Manual' },
  { v: 'inventario', t: 'Inventario' },
  { v: 'tarea_programada', t: 'Tarea Progr.' },
]
const hoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const vacio = (tienda: string): Punto => ({
  tienda_terminal_codigo: tienda,
  numero: null,
  fecha: hoy(),
  concepto: '',
  observaciones: '',
  almacen_desde_codigo: null,
  almacen_hasta_codigo: null,
  documento_externo: '',
  origen_tipo: 'manual',
  origen_numero: null,
  fecha_hora_restaurado: null,
})
/** «03/11/2024 1:15:03», como la columna Fecha Inicial de GeminisWin (hora de Canarias). */
function fechaHora(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const f = d.toLocaleDateString('es-ES', { timeZone: 'Atlantic/Canary', day: '2-digit', month: '2-digit', year: 'numeric' })
  const h = d.toLocaleTimeString('es-ES', { timeZone: 'Atlantic/Canary', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: false })
  return `${f} ${h.replace(/^0(\d)/, '$1')}`
}

const OPERATIVA = [
  {
    titulo: 'Para qué sirve',
    notas: [
      'Un punto de restauración es una copia del stock de cada artículo en cada almacén en un momento dado. Sirve para poder volver a ese stock si algo sale mal (un inventario, una carga, un recálculo).',
      'La rejilla enseña lo que se guardó: almacén, artículo, fecha y stock inicial, y stock. Puede tener cientos de miles de líneas: se van cargando según se baja.',
    ],
  },
  {
    titulo: 'Consultar',
    pasos: [
      'Con las flechas de la barra de abajo se pasa de un punto a otro; «Ordenar» cambia entre orden por número y por fecha; «Buscar» abre la lista de puntos.',
      'En consulta, escribe un número en «Número» y pulsa Intro para ir a ese punto de la tienda que se ve.',
      'El botón de buscar de debajo de la rejilla lleva a un artículo dentro del punto.',
    ],
  },
  {
    titulo: 'Crear un punto',
    pasos: [
      'Pulsa «Nuevo» (F3). Elige la tienda, escribe el concepto y, si quieres, las observaciones.',
      'Pon «Alm. Desde» y «Alm. Hasta» para copiar solo esos almacenes; si los dejas en blanco se copian todos.',
      'Pulsa «Aceptar» (F1): el programa copia el stock de ese momento y le da número.',
    ],
  },
  {
    titulo: 'Modificar, anular y restaurar',
    notas: [
      '«Modificar» (F2) deja cambiar la fecha, el concepto, las observaciones y el documento, y con los botones de debajo de la rejilla añadir, cambiar o quitar líneas del punto.',
      '«Anular» borra el punto entero con todas sus líneas: no se puede recuperar.',
      '«Restaurar Stock» deja el stock de los artículos del punto como estaba cuando se guardó, con movimientos de regularización por la diferencia. Queda anotado en «Fe. Restaur.».',
    ],
  },
]

export function PuntosRestauracionPage() {
  const navigate = useNavigate()
  const almacenes = useAlmacenes()
  const tiendas = useTiendas()
  const [params, setParams] = useSearchParams()
  const [cab, setCab] = useState<Punto | null>(null)
  const [draft, setDraft] = useState<Punto>(vacio(''))
  const [mode, setMode] = useState<'consulta' | 'edicion' | 'alta'>('consulta')
  const [orden, setOrden] = useState<'numero' | 'fecha'>('numero')
  const [cargando, setCargando] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ texto: string; error?: boolean } | null>(null)
  const [buscar, setBuscar] = useState<null | 'punto' | 'desde' | 'hasta'>(null)
  const [numeroTecleado, setNumeroTecleado] = useState<string | null>(null)
  // Rejilla por tramos
  const [lineas, setLineas] = useState<Linea[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [desdeLinea, setDesdeLinea] = useState(0)
  const [hayMas, setHayMas] = useState(false)
  const [cargandoLineas, setCargandoLineas] = useState(false)
  const [selLinea, setSelLinea] = useState<number | null>(null)
  const [buscarArt, setBuscarArt] = useState<string | null>(null)
  const [dlgLinea, setDlgLinea] = useState<null | { nueva: boolean; numero_linea: number | null; almacen: string; articulo: string; stock: number | null }>(null)
  const turno = useRef(0)
  const rejilla = useRef<HTMLDivElement>(null)

  const editing = mode !== 'consulta'
  const vista = editing ? draft : (cab ?? vacio(''))
  const clave: Clave | null = cab && cab.numero != null && mode !== 'alta' ? { tienda_terminal_codigo: cab.tienda_terminal_codigo, numero: cab.numero } : null
  const claveTxt = clave ? `${clave.tienda_terminal_codigo}|${clave.numero}` : ''
  const error = (e: unknown) => setMsg({ texto: typeof e === 'string' ? e : msgError(e), error: true })

  const cargar = useCallback(
    async (c: Clave | null) => {
      setCargando(true)
      let q = supabase.from('punto_restauracion_stock').select(CAMPOS)
      // Sin clave: el último punto (por tienda y número), como al abrir cualquier ficha.
      q = c
        ? q.eq('tienda_terminal_codigo', c.tienda_terminal_codigo).eq('numero', c.numero)
        : q.order('tienda_terminal_codigo', { ascending: false }).order('numero', { ascending: false }).limit(1)
      const { data, error: e } = await q
      setCargando(false)
      if (e) return setMsg({ texto: e.message, error: true })
      const r = ((data ?? []) as Punto[])[0] ?? null
      if (!r && c) return setMsg({ texto: `No existe el punto de restauración ${c.numero} en la tienda ${c.tienda_terminal_codigo}. Búscalo con el botón «Buscar» de la barra.`, error: true })
      setCab(r ? { ...r, numero: Number(r.numero) } : null)
      setMode('consulta')
      setNumeroTecleado(null)
      if (r) setParams({ tienda: r.tienda_terminal_codigo, numero: String(r.numero) }, { replace: true })
    },
    [setParams],
  )
  useEffect(() => {
    const t = params.get('tienda')
    const n = Number(params.get('numero'))
    cargar(t && n ? { tienda_terminal_codigo: t, numero: n } : null)
    // Solo al entrar: después manda el estado de la ficha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Rejilla: un tramo cada vez, por número de línea (clave primaria: no se recorre la tabla) ──
  const cargarTramo = useCallback(async (c: Clave, despuesDe: number, reiniciar: boolean) => {
    const mio = ++turno.current
    setCargandoLineas(true)
    if (reiniciar && rejilla.current) rejilla.current.scrollTop = 0
    const { data, error: e } = await supabase
      .from('punto_restauracion_stock_linea')
      .select(CAMPOS_LINEA)
      .eq('tienda_terminal_codigo', c.tienda_terminal_codigo)
      .eq('numero', c.numero)
      .gt('numero_linea', despuesDe)
      .order('numero_linea')
      .limit(TRAMO)
    if (mio !== turno.current) return
    setCargandoLineas(false)
    if (e) return setMsg({ texto: e.message, error: true })
    const filas = (data ?? []) as unknown as Linea[]
    setHayMas(filas.length === TRAMO)
    setLineas((prev) => (reiniciar ? filas : [...prev, ...filas]))
  }, [])
  const contar = useCallback(async (c: Clave) => {
    const { count } = await supabase
      .from('punto_restauracion_stock_linea')
      .select('numero_linea', { count: 'exact', head: true })
      .eq('tienda_terminal_codigo', c.tienda_terminal_codigo)
      .eq('numero', c.numero)
    setTotal(count ?? 0)
  }, [])
  useEffect(() => {
    setLineas([])
    setTotal(null)
    setSelLinea(null)
    setHayMas(false)
    setDesdeLinea(0)
    if (!claveTxt) return
    const [t, n] = claveTxt.split('|')
    const c = { tienda_terminal_codigo: t, numero: Number(n) }
    cargarTramo(c, 0, true)
    contar(c)
  }, [claveTxt, cargarTramo, contar])
  function alBajar(e: React.UIEvent<HTMLDivElement>) {
    const d = e.currentTarget
    if (!clave || !hayMas || cargandoLineas || !lineas.length) return
    if (d.scrollTop + d.clientHeight >= d.scrollHeight - 120) cargarTramo(clave, lineas[lineas.length - 1].numero_linea, false)
  }
  function recargarLineas(desde = desdeLinea) {
    if (!clave) return
    setDesdeLinea(desde)
    cargarTramo(clave, desde, true)
    contar(clave)
  }

  // ── Navegación de registro (solo el vecino, en el servidor) ──
  const nav = useNavRegistro<Clave>({
    tabla: 'punto_restauracion_stock',
    orden: orden === 'numero' ? ['tienda_terminal_codigo', 'numero'] : ['fecha', 'numero', 'tienda_terminal_codigo'],
    actual: !clave || !cab ? null : orden === 'numero' ? [clave.tienda_terminal_codigo, clave.numero] : [cab.fecha, clave.numero, clave.tienda_terminal_codigo],
    select: 'tienda_terminal_codigo, numero',
  })
  const irNav = async (d: NavDir) => {
    setMsg(null)
    const k = await nav.ir(d)
    if (k) cargar({ tienda_terminal_codigo: k.tienda_terminal_codigo, numero: Number(k.numero) })
  }
  function irNumero(texto: string) {
    const n = Number(texto.replace(/\D/g, ''))
    if (!n || !cab) return error(`«${texto}» no es un número de punto de restauración. Escribe solo el número.`)
    setMsg(null)
    cargar({ tienda_terminal_codigo: cab.tienda_terminal_codigo, numero: n })
  }

  const patch = (p: Partial<Punto>) => setDraft((d) => ({ ...d, ...p }))
  const nombreAlm = (c: string | null) => almacenes.find((a) => a.codigo === c)?.nombre ?? ''

  function nuevo() {
    setMsg(null)
    setDraft(vacio(cab?.tienda_terminal_codigo ?? tiendas[0]?.codigo ?? ''))
    setMode('alta')
  }
  function cancelar() {
    setMsg(null)
    setMode('consulta')
  }
  async function guardar() {
    setMsg(null)
    if (mode === 'alta') {
      if (!draft.tienda_terminal_codigo) return error('Elige la tienda del punto de restauración.')
      const de = draft.almacen_desde_codigo
      const a = draft.almacen_hasta_codigo
      const cuales = de || a ? `los almacenes ${de ?? 'primero'} a ${a ?? 'último'}` : 'TODOS los almacenes'
      if (!confirm(`¿Crear un punto de restauración con el stock que hay ahora mismo en ${cuales}?`)) return
      setSaving(true)
      const { data, error: e } = await supabase.rpc('fn_punto_restauracion_crear_rango', {
        p_tienda: draft.tienda_terminal_codigo,
        p_almacen_desde: de,
        p_almacen_hasta: a,
        p_concepto: draft.concepto || `Punto de restauración ${fechaEs(new Date().toISOString(), true)}`,
        p_observaciones: draft.observaciones,
        p_documento: draft.documento_externo,
      })
      setSaving(false)
      if (e) return error(e)
      await cargar({ tienda_terminal_codigo: draft.tienda_terminal_codigo, numero: Number(data) })
      nav.refrescar()
      setMsg({ texto: `Creado el punto de restauración ${draft.tienda_terminal_codigo}-${data}.` })
      return
    }
    if (!clave) return
    if (!draft.fecha) return error('La fecha es obligatoria. Escríbela como dd/mm/aaaa.')
    setSaving(true)
    const { error: e } = await supabase
      .from('punto_restauracion_stock')
      .update({
        fecha: draft.fecha,
        concepto: draft.concepto?.trim() || null,
        observaciones: draft.observaciones?.trim() || null,
        documento_externo: draft.documento_externo?.trim() || null,
        actualizado_en: new Date().toISOString(),
      })
      .eq('tienda_terminal_codigo', clave.tienda_terminal_codigo)
      .eq('numero', clave.numero)
    setSaving(false)
    if (e) return error(e)
    await cargar(clave)
  }
  async function anular() {
    if (!clave || !cab) return
    setMsg(null)
    const n = total != null ? ` y sus ${total.toLocaleString('es-ES')} líneas` : ' y todas sus líneas'
    const aviso = cab.origen_tipo === 'inventario' ? `\n\nOJO: lo creó el inventario ${cab.origen_numero ?? ''}. Si lo borras, ese inventario ya no se podrá deshacer con este punto.` : ''
    if (!confirm(`¿Anular el punto de restauración ${clave.tienda_terminal_codigo}-${clave.numero}${n}?\n\nSe borra del todo y no se puede recuperar.${aviso}`)) return
    setSaving(true)
    const vecino = (await nav.ir('anterior')) ?? (await nav.ir('siguiente'))
    const { error: e } = await supabase.from('punto_restauracion_stock').delete().eq('tienda_terminal_codigo', clave.tienda_terminal_codigo).eq('numero', clave.numero)
    setSaving(false)
    if (e) return error(e)
    nav.refrescar()
    if (vecino) await cargar({ tienda_terminal_codigo: vecino.tienda_terminal_codigo, numero: Number(vecino.numero) })
    else {
      setCab(null)
      setParams({}, { replace: true })
    }
    setMsg({ texto: `Anulado el punto de restauración ${clave.tienda_terminal_codigo}-${clave.numero}.` })
  }

  /** Restaurar: la función de base de datos que ya existía (regularizaciones por la diferencia). */
  async function restaurar() {
    if (!clave || !cab) return
    setMsg(null)
    setSaving(true)
    const { data: comp, error: e0 } = await supabase.rpc('fn_punto_restauracion_comparar', {
      p_tienda: clave.tienda_terminal_codigo,
      p_numero: clave.numero,
      p_solo_diferencias: true,
      p_limite: 1,
      p_desplazamiento: 0,
    })
    setSaving(false)
    if (e0) return error(e0)
    const n = Number((comp as { total_diferencias: number }[] | null)?.[0]?.total_diferencias ?? 0)
    if (!n) return setMsg({ texto: 'El stock de ahora ya coincide con el del punto: no hay nada que restaurar.' })
    let forzar = false
    if (cab.fecha_hora_restaurado) {
      if (!confirm(`Este punto YA se restauró el ${fechaHora(cab.fecha_hora_restaurado)}. ¿Restaurarlo otra vez?`)) return
      forzar = true
    }
    if (
      !confirm(
        `¿Restaurar el punto ${clave.tienda_terminal_codigo}-${clave.numero}?\n\nSe generarán movimientos de regularización en ${n.toLocaleString('es-ES')} artículo(s)/almacén para dejar el stock como estaba en el punto.`,
      )
    )
      return
    setSaving(true)
    const { data, error: e } = await supabase.rpc('fn_punto_restauracion_restaurar', { p_tienda: clave.tienda_terminal_codigo, p_numero: clave.numero, p_forzar: forzar })
    setSaving(false)
    if (e) return error(e)
    await cargar(clave)
    setMsg({ texto: `Punto restaurado: ${data} movimiento(s) de regularización.` })
  }

  // ── Líneas (solo en «Modificar») ──
  const lineaSel = lineas.find((l) => l.numero_linea === selLinea) ?? null
  async function buscarArticulo() {
    if (!clave || buscarArt == null) return
    const t = buscarArt.trim()
    if (!t) return
    const { data, error: e } = await supabase
      .from('punto_restauracion_stock_linea')
      .select('numero_linea')
      .eq('tienda_terminal_codigo', clave.tienda_terminal_codigo)
      .eq('numero', clave.numero)
      .gte('articulo_codigo', t)
      .lte('articulo_codigo', `${t}￿`)
      .order('articulo_codigo')
      .order('numero_linea')
      .limit(1)
    if (e) return error(e)
    const n = Number((data as { numero_linea: number }[] | null)?.[0]?.numero_linea ?? 0)
    if (!n) return error(`En este punto no hay ningún artículo cuyo código empiece por «${t}». Revisa el código (con sus ceros delante).`)
    setBuscarArt(null)
    setMsg(null)
    setSelLinea(n)
    recargarLineas(n - 1)
  }
  async function guardarLinea() {
    if (!clave || !dlgLinea) return
    const stock = dlgLinea.stock ?? 0
    let e: { message: string } | null = null
    if (dlgLinea.nueva) {
      const art = dlgLinea.articulo.trim()
      if (!dlgLinea.almacen || !art) return error('Para añadir una línea hacen falta el almacén y el código del artículo.')
      const { data: a } = await supabase.from('articulo').select('codigo_interno, descripcion, coste_bruto').eq('codigo_interno', art).maybeSingle()
      if (!a) return error(`No existe el artículo «${art}». Escribe su código interno tal cual sale en la ficha del artículo.`)
      const { data: ult } = await supabase
        .from('punto_restauracion_stock_linea')
        .select('numero_linea')
        .eq('tienda_terminal_codigo', clave.tienda_terminal_codigo)
        .eq('numero', clave.numero)
        .order('numero_linea', { ascending: false })
        .limit(1)
      const art2 = a as { codigo_interno: string; descripcion: string | null; coste_bruto: number | null }
      ;({ error: e } = await supabase.from('punto_restauracion_stock_linea').insert({
        ...clave,
        numero_linea: Number((ult as { numero_linea: number }[] | null)?.[0]?.numero_linea ?? 0) + 1,
        articulo_codigo: art2.codigo_interno,
        descripcion: art2.descripcion,
        almacen_codigo: dlgLinea.almacen,
        precio: art2.coste_bruto,
        cantidad_antes_de_restaurar: stock,
        cantidad_inicial: stock,
        fecha_stock_inicial: new Date().toISOString(),
      }))
    } else {
      ;({ error: e } = await supabase
        .from('punto_restauracion_stock_linea')
        .update({ cantidad_antes_de_restaurar: stock, cantidad_inicial: stock, actualizado_en: new Date().toISOString() })
        .eq('tienda_terminal_codigo', clave.tienda_terminal_codigo)
        .eq('numero', clave.numero)
        .eq('numero_linea', dlgLinea.numero_linea))
    }
    if (e) return error(e)
    setDlgLinea(null)
    setMsg(null)
    recargarLineas()
  }
  async function borrarLinea() {
    if (!clave || !lineaSel) return
    if (!confirm(`¿Quitar del punto la línea del artículo ${lineaSel.articulo_codigo} (almacén ${lineaSel.almacen_codigo ?? ''})?\n\nAl restaurar el punto, ese artículo ya no se tocará.`)) return
    const { error: e } = await supabase
      .from('punto_restauracion_stock_linea')
      .delete()
      .eq('tienda_terminal_codigo', clave.tienda_terminal_codigo)
      .eq('numero', clave.numero)
      .eq('numero_linea', lineaSel.numero_linea)
    if (e) return error(e)
    setSelLinea(null)
    recargarLineas()
  }

  const enEdicion = mode === 'edicion'
  const alta = mode === 'alta'
  const lookupAlm = (campo: 'desde' | 'hasta') => (
    <div className="flex items-center gap-2">
      <span className={`${L} w-[112px] flex-none`}>{campo === 'desde' ? 'Alm. Desde:' : 'Alm. Hasta:'}</span>
      <GwInput
        className={`${IN} !w-[46px] flex-none`}
        maxLength={4}
        disabled={!alta}
        title={campo === 'desde' ? 'Primer almacén que se copia (en blanco: desde el primero)' : 'Último almacén que se copia (en blanco: hasta el último)'}
        value={(campo === 'desde' ? vista.almacen_desde_codigo : vista.almacen_hasta_codigo) ?? ''}
        onChange={(e) => patch(campo === 'desde' ? { almacen_desde_codigo: e.target.value.trim() || null } : { almacen_hasta_codigo: e.target.value.trim() || null })}
      />
      <span className="flex min-w-0 flex-1">
        <GwInput className={IN} readOnly tabIndex={-1} value={nombreAlm(campo === 'desde' ? vista.almacen_desde_codigo : vista.almacen_hasta_codigo)} />
        <GwLookupButton disabled={!alta} onClick={() => setBuscar(campo)} title="Buscar almacén" />
      </span>
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      {/* Cabecera: a la izquierda los campos, a la derecha «Observaciones» a toda la altura */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(260px,30%)] gap-x-2.5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="grid grid-cols-[88px_176px_158px_minmax(0,1fr)] gap-x-2.5">
            <label className="flex flex-col">
              <span className={L}>Tienda</span>
              <GwSelect className={IN} disabled={!alta} value={vista.tienda_terminal_codigo} onChange={(e) => patch({ tienda_terminal_codigo: e.target.value })}>
                {!vista.tienda_terminal_codigo && <option value="" />}
                {tiendas.map((t) => (
                  <option key={t.codigo}>{t.codigo}</option>
                ))}
              </GwSelect>
            </label>
            <label className="flex flex-col">
              <span className={L}>
                <u>N</u>úmero
              </span>
              <GwInput
                className={`${IN} text-right`}
                readOnly={editing}
                title={editing ? 'El número lo da el programa al aceptar' : 'Escribe un número y pulsa Intro para ir a ese punto'}
                value={numeroTecleado ?? (vista.numero != null ? String(vista.numero) : '')}
                onChange={(e) => !editing && setNumeroTecleado(e.target.value)}
                onBlur={() => setNumeroTecleado(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !editing && numeroTecleado != null) {
                    e.preventDefault()
                    irNumero(numeroTecleado)
                  }
                }}
              />
            </label>
            <label className="flex flex-col">
              <span className={L}>Fecha</span>
              <GwDate className={IN} value={vista.fecha} disabled={!enEdicion} onChange={(v) => patch({ fecha: v ?? '' })} />
            </label>
            <label className="flex flex-col">
              <span className={L}>Concepto</span>
              <GwInput className={IN} maxLength={60} disabled={!editing} value={vista.concepto ?? ''} onChange={(e) => patch({ concepto: e.target.value })} />
            </label>
          </div>
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-x-2.5">
            <div className="flex flex-col justify-center gap-1.5 border border-[var(--gw-border)] px-2 py-1.5">
              {lookupAlm('desde')}
              {lookupAlm('hasta')}
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-2 gap-x-2">
                <label className="flex flex-col">
                  <span className={L}>Documento</span>
                  <GwInput className={IN} maxLength={20} disabled={!editing} value={vista.documento_externo ?? ''} onChange={(e) => patch({ documento_externo: e.target.value })} />
                </label>
                <label className="flex flex-col">
                  <span className={L}>Origen:</span>
                  <GwSelect className={IN} disabled value={vista.origen_tipo ?? ''} title="De dónde salió el punto: lo pone el programa">
                    <option value="" />
                    {ORIGENES.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.t}
                      </option>
                    ))}
                    {vista.origen_tipo && !ORIGENES.some((o) => o.v === vista.origen_tipo) && <option value={vista.origen_tipo}>{vista.origen_tipo}</option>}
                  </GwSelect>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <span className={`${L} flex-none`}>Fe. Restaur.:</span>
                <GwInput
                  className={`${IN} whitespace-pre`}
                  readOnly
                  tabIndex={-1}
                  title="Cuándo se restauró el stock con este punto (en blanco: nunca)"
                  value={vista.fecha_hora_restaurado ? fechaHora(vista.fecha_hora_restaurado) : '  /  /        :  :'}
                />
              </div>
            </div>
          </div>
        </div>
        <label className="flex min-h-0 flex-col">
          <span className={L}>Observaciones</span>
          <GwTextArea
            className="!h-auto min-h-0 flex-1 resize-none !text-[15px]"
            disabled={!editing}
            value={vista.observaciones ?? ''}
            onChange={(e) => patch({ observaciones: e.target.value })}
          />
        </label>
      </div>

      {/* Rejilla: se carga por tramos al bajar */}
      <div ref={rejilla} className="min-h-[120px] flex-1 overflow-auto border border-[var(--gw-border)] bg-white" onScroll={alBajar}>
        <table className="gw-grid !text-[15px]">
          <thead className="sticky top-0 z-[1]">
            <tr>
              <th className="w-[84px]">Alm.</th>
              <th className="w-[190px]">Código Artículo</th>
              <th>Descripción Artículo</th>
              <th className="w-[215px]">Fecha Inicial</th>
              <th className="w-[150px]">Stock Inicial</th>
              <th className="w-[150px]">Stock</th>
            </tr>
          </thead>
          <tbody>
            {desdeLinea > 0 && (
              <tr>
                <td colSpan={6} className="cursor-pointer text-center text-[#1a4fd0]" onClick={() => recargarLineas(0)}>
                  ▲ Hay líneas antes de esta: pulsa aquí para volver al principio
                </td>
              </tr>
            )}
            {lineas.map((l) => (
              <tr
                key={l.numero_linea}
                className={selLinea === l.numero_linea ? 'gw-selected' : ''}
                onClick={() => setSelLinea(l.numero_linea)}
                onDoubleClick={() => enEdicion && setDlgLinea({ nueva: false, numero_linea: l.numero_linea, almacen: l.almacen_codigo ?? '', articulo: l.articulo_codigo, stock: Number(l.cantidad_antes_de_restaurar ?? l.cantidad_inicial ?? 0) })}
              >
                <td>{l.almacen_codigo}</td>
                <td>{l.articulo_codigo}</td>
                <td className="max-w-0 truncate">{l.descripcion ?? l.articulo?.descripcion ?? ''}</td>
                <td>{fechaHora(l.fecha_stock_inicial)}</td>
                <td className="text-right">{formatGw(Number(l.cantidad_inicial ?? 0), 3)}</td>
                <td className="text-right">{formatGw(Number(l.cantidad_antes_de_restaurar ?? l.cantidad_inicial ?? 0), 3)}</td>
              </tr>
            ))}
            {cargandoLineas && (
              <tr>
                <td colSpan={6} className="text-center text-[#6d6d6d]">
                  Cargando líneas…
                </td>
              </tr>
            )}
            <FilasVacias cols={6} ocupadas={lineas.length} total={10} />
          </tbody>
        </table>
      </div>
      <GridMiniBar
        nuevo={enEdicion}
        modificar={enEdicion && !!lineaSel}
        borrar={enEdicion && !!lineaSel}
        buscar={!!clave && !alta}
        onNuevo={() => setDlgLinea({ nueva: true, numero_linea: null, almacen: cab?.almacen_desde_codigo ?? almacenes[0]?.codigo ?? '', articulo: '', stock: 0 })}
        onModificar={() =>
          lineaSel && setDlgLinea({ nueva: false, numero_linea: lineaSel.numero_linea, almacen: lineaSel.almacen_codigo ?? '', articulo: lineaSel.articulo_codigo, stock: Number(lineaSel.cantidad_antes_de_restaurar ?? lineaSel.cantidad_inicial ?? 0) })
        }
        onBorrar={borrarLinea}
        onBuscar={() => setBuscarArt('')}
      >
        <span className="flex-1 text-[17px] text-[#1a1aff]">
          {alta ? 'Al aceptar se copia el stock de los almacenes elegidos' : `Registros: ${total == null ? '…' : total.toLocaleString('es-ES')}. Inventario Artículos Implicados`}
        </span>
        <button
          type="button"
          className="gw-btn !h-[24px] !px-3 !text-[13px]"
          disabled={!clave || editing || saving}
          title="Deja el stock de los artículos del punto como estaba cuando se guardó (movimientos de regularización)"
          onClick={restaurar}
        >
          Restaurar Stock
        </button>
      </GridMiniBar>

      {msg && <div className={`px-1 text-[13px] ${msg.error ? 'text-[#c42b1c]' : 'text-[#127a12]'}`}>{msg.texto}</div>}
      <GwRecordBar
        grande
        mode={mode}
        canNavigate={!editing && !!clave}
        saving={saving}
        onFirst={() => irNav('primero')}
        onPrev={() => irNav('anterior')}
        onNext={() => irNav('siguiente')}
        onLast={() => irNav('ultimo')}
        onSort={() => (setMsg(null), setOrden((o) => (o === 'numero' ? 'fecha' : 'numero')))}
        onSearch={() => setBuscar('punto')}
        onPrint={() => window.print()}
        onNew={nuevo}
        onEdit={() => cab && clave && (setMsg(null), setDraft(cab), setMode('edicion'))}
        onDelete={anular}
        onSave={guardar}
        onCancel={cancelar}
        onExit={() => navigate('/')}
      />
      <div className="flex items-start gap-3 px-1 text-[12px] text-[#555]">
        <span className="flex-none pt-0.5">
          {cargando
            ? 'Cargando…'
            : alta
              ? 'Alta de un punto de restauración'
              : !cab
                ? 'No hay ningún punto de restauración. Pulsa «Nuevo» para crear el primero.'
                : `${enEdicion ? 'Modificando' : 'Consulta'} · Orden por ${orden === 'numero' ? 'número' : 'fecha'}${textoRegistro(nav)}`}
        </span>
        <OperativaDialogo bloques={OPERATIVA} />
      </div>

      {buscar === 'punto' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Puntos de Restauración de Stock"
          table="punto_restauracion_stock"
          columns={[
            { key: 'tienda_terminal_codigo', label: 'Tienda', width: 60 },
            { key: 'numero', label: 'Número', width: 80 },
            { key: 'fecha', label: 'Fecha', width: 100 },
            { key: 'concepto', label: 'Concepto' },
            { key: 'almacen_desde_codigo', label: 'Alm. Desde', width: 90 },
            { key: 'almacen_hasta_codigo', label: 'Alm. Hasta', width: 90 },
          ]}
          searchColumns={['concepto', 'documento_externo']}
          orderBy="numero"
          keyColumn="numero"
          onPick={(r) => {
            setBuscar(null)
            setMsg(null)
            cargar({ tienda_terminal_codigo: String(r.tienda_terminal_codigo), numero: Number(r.numero) })
          }}
          onClose={() => setBuscar(null)}
        />
      )}
      {(buscar === 'desde' || buscar === 'hasta') && (
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
            patch(buscar === 'desde' ? { almacen_desde_codigo: String(r.codigo) } : { almacen_hasta_codigo: String(r.codigo) })
            setBuscar(null)
          }}
          onClose={() => setBuscar(null)}
        />
      )}
      {buscarArt != null && (
        <ModalGw titulo="Buscar artículo en el punto" onClose={() => setBuscarArt(null)} ancho={380}>
          <div className="flex flex-col gap-2 p-2">
            <label className="flex flex-col">
              <span className={L}>Código Artículo (o cómo empieza)</span>
              <GwInput className={IN} autoFocus value={buscarArt} onChange={(e) => setBuscarArt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscarArticulo()} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="gw-btn !h-[26px] !px-4" onClick={buscarArticulo}>
                Buscar
              </button>
              <button type="button" className="gw-btn !h-[26px] !px-4" onClick={() => setBuscarArt(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </ModalGw>
      )}
      {dlgLinea && (
        <ModalGw titulo={dlgLinea.nueva ? 'Nueva línea del punto' : 'Modificar línea del punto'} onClose={() => setDlgLinea(null)} ancho={420}>
          <div className="flex flex-col gap-2 p-2">
            <div className="grid grid-cols-[90px_minmax(0,1fr)_130px] gap-x-2">
              <label className="flex flex-col">
                <span className={L}>Alm.</span>
                <GwSelect className={IN} disabled={!dlgLinea.nueva} value={dlgLinea.almacen} onChange={(e) => setDlgLinea({ ...dlgLinea, almacen: e.target.value })}>
                  {almacenes.map((a) => (
                    <option key={a.codigo} value={a.codigo} title={a.nombre}>
                      {a.codigo}
                    </option>
                  ))}
                </GwSelect>
              </label>
              <label className="flex flex-col">
                <span className={L}>Código Artículo</span>
                <GwInput className={IN} disabled={!dlgLinea.nueva} autoFocus={dlgLinea.nueva} value={dlgLinea.articulo} onChange={(e) => setDlgLinea({ ...dlgLinea, articulo: e.target.value })} />
              </label>
              <label className="flex flex-col">
                <span className={L}>Stock</span>
                <GwNumber className={IN} decimals={3} value={dlgLinea.stock} onChange={(v) => setDlgLinea({ ...dlgLinea, stock: v })} />
              </label>
            </div>
            <div className="text-[12px] text-[#555]">«Stock» es la cantidad a la que volverá el artículo en ese almacén si se restaura el punto.</div>
            <div className="flex justify-end gap-2">
              <button type="button" className="gw-btn !h-[26px] !px-4" onClick={guardarLinea}>
                Aceptar
              </button>
              <button type="button" className="gw-btn !h-[26px] !px-4" onClick={() => setDlgLinea(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </ModalGw>
      )}
    </div>
  )
}
