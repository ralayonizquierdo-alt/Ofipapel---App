import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowDownAZ,
  Binoculars,
  ChevronFirst,
  ChevronLast,
  DoorOpen,
  FilePen,
  FilePlus2,
  FileX2,
  Play,
  Printer,
  Save,
  Undo2,
  X,
  ScanBarcode,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwInput, GwLookupButton, GwNumber, GwSelect, GwWindow, formatGw } from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import { FilasVacias } from '../../../components/gw/GwGridParts'
import { BIG_INPUT, BIG_LABEL, type ArticuloStock, empleadoActual, fechaHora, resolverArticulo, stockDe } from './comun'
import { GwDateTime } from '../../../components/gw/GwDateTime'
import { navDir, navIndice, useNavRegistro, type NavDir } from '../../../components/gw/useNavRegistro'
import { conTecla, useTeclasFicha } from '../../../components/gw/teclasFicha'

// Traspasos de artículos entre almacenes (Almacén → Traspasos en GeminisWin, TRASPCAB/TRASPLIN).
// A diferencia de GeminisWin, la pantalla abre en consulta y el número se asigna al guardar.

type Modo = 'consulta' | 'edicion' | 'alta'

interface Cab {
  tienda_terminal_codigo: string
  numero: number | null
  fecha: string
  documento_externo: string | null
  empleado_codigo: string | null
  almacen_origen_codigo: string
  almacen_destino_codigo: string
  confirmado: boolean
  stock_movido: boolean
  tipo_valoracion: number
}

interface Linea {
  articulo_codigo: string
  descripcion: string
  cantidad: number
  cajas: number | null
  bultos: number | null
  precio: number
  unidades_por_caja: number | null
  cajas_por_bulto: number | null
}

interface Maestro {
  codigo: string
  nombre: string
}

/** TRASPCAB.TIPOVALOR: precio con el que se valora el traspaso (confirmar códigos con Luis). */
const VALORACIONES = [
  { value: 0, label: 'Coste Puro' },
  { value: 1, label: 'Coste Neto' },
  { value: 2, label: 'Coste Bruto' },
  { value: 3, label: 'Coste Líquido' },
]

const CAB_COLS =
  'tienda_terminal_codigo, numero, fecha, documento_externo, empleado_codigo, almacen_origen_codigo, almacen_destino_codigo, confirmado, stock_movido, tipo_valoracion'

function precioSegun(a: ArticuloStock, tipo: number): number {
  const v = tipo === 0 ? a.coste_puro : tipo === 1 ? a.coste_neto : tipo === 3 ? a.precio_liquidado : a.coste_bruto
  return Number(v ?? a.coste_bruto ?? a.coste_neto ?? 0)
}

function conCajas(l: Linea): Linea {
  const cajas = l.unidades_por_caja ? Math.round((l.cantidad / l.unidades_por_caja) * 100) / 100 : null
  const bultos = cajas != null && l.cajas_por_bulto ? Math.round((cajas / l.cajas_por_bulto) * 100) / 100 : null
  return { ...l, cajas, bultos }
}

function cabVacia(tienda: string, almacenTienda: string | null, empleado: string | null): Cab {
  return {
    tienda_terminal_codigo: tienda,
    numero: null,
    fecha: new Date().toISOString(),
    documento_externo: null,
    empleado_codigo: empleado,
    almacen_origen_codigo: almacenTienda ?? '',
    almacen_destino_codigo: '',
    confirmado: true,
    stock_movido: false,
    tipo_valoracion: 2,
  }
}

/** Mueve el stock de las líneas: signo 1 aplica el traspaso (sale del origen, entra en destino), -1 lo deshace. */
async function moverStock(cab: Cab, lineas: Linea[], signo: 1 | -1) {
  const movimientos = lineas
    .filter((l) => l.articulo_codigo && l.cantidad !== 0)
    .flatMap((l, i) => {
      const s = (l.cantidad > 0 ? 1 : -1) * signo
      const base = {
        tipo_movimiento: 'traspaso',
        articulo_codigo: l.articulo_codigo,
        cantidad: Math.abs(l.cantidad),
        costo_unitario: l.precio,
        documento_origen_tipo: 'traspaso_almacen',
        documento_origen_tienda_codigo: cab.tienda_terminal_codigo,
        documento_origen_numero: cab.numero,
        documento_origen_linea: i + 1,
        tienda_terminal_codigo: cab.tienda_terminal_codigo,
        empleado_codigo: cab.empleado_codigo,
        observaciones: signo === -1 ? 'Anulación de movimiento por modificación del traspaso' : null,
      }
      return [
        { ...base, sentido: -s, almacen_codigo: cab.almacen_origen_codigo },
        { ...base, sentido: s, almacen_codigo: cab.almacen_destino_codigo },
      ]
    })
  if (movimientos.length === 0) return null
  const { error } = await supabase.from('movimiento_stock').insert(movimientos)
  return error
}

export function TraspasoFichaPage() {
  const navigate = useNavigate()
  const resto = useParams()['*'] ?? ''
  const partes = resto.split('/').filter(Boolean)
  const esNuevo = partes[0] === 'nuevo'
  const claveTienda = !esNuevo && partes.length >= 2 ? decodeURIComponent(partes[0]) : null
  const claveNumero = !esNuevo && partes.length >= 2 ? Number(partes[1]) : null

  const [modo, setModo] = useState<Modo>('consulta')
  const [cab, setCab] = useState<Cab | null>(null)
  const [orig, setOrig] = useState<{ cab: Cab; lineas: Linea[] } | null>(null)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [sel, setSel] = useState(0)
  const [tiendas, setTiendas] = useState<{ codigo: string; almacen_codigo: string | null }[]>([])
  const [almacenes, setAlmacenes] = useState<Maestro[]>([])
  const [empleado, setEmpleado] = useState<Maestro | null>(null)
  const [nombreEmpleado, setNombreEmpleado] = useState('')
  const [ordenDesc, setOrdenDesc] = useState(false)
  const [stock, setStock] = useState({ origen: 0, destino: 0 })
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [dialogo, setDialogo] = useState<null | 'buscar' | 'origen' | 'destino' | 'empleado' | 'documento' | 'articulo' | 'rapida'>(null)
  const codRefs = useRef(new Map<number, HTMLInputElement>())

  const editable = modo !== 'consulta'
  const nombreAlm = (c: string) => almacenes.find((a) => a.codigo === c)?.nombre ?? ''

  useEffect(() => {
    Promise.all([
      supabase.from('tienda_terminal').select('codigo, almacen_codigo').order('codigo'),
      supabase.from('almacen').select('codigo, nombre').order('codigo'),
      empleadoActual(),
    ]).then(([t, a, e]) => {
      setTiendas((t.data ?? []) as { codigo: string; almacen_codigo: string | null }[])
      setAlmacenes((a.data ?? []) as Maestro[])
      setEmpleado(e)
    })
  }, [])

  // Navegación contra el servidor: solo el vecino (gt/lt + limit 1) y el recuento, nunca la lista.
  const nav = useNavRegistro<{ tienda_terminal_codigo: string; numero: number }>({
    tabla: 'traspaso_almacen',
    orden: ['tienda_terminal_codigo', 'numero'],
    actual: cab?.numero != null ? [cab.tienda_terminal_codigo, cab.numero] : null,
  })
  const cargarClaves = nav.refrescar

  // Carga del documento: el de la URL, el último si no hay ninguno, o uno vacío en alta.
  useEffect(() => {
    let cancel = false
    async function run() {
      setCargando(true)
      setMensaje(null)
      setSel(0)
      if (esNuevo) {
        if (tiendas.length === 0) return
        const t = tiendas[0]
        const c = cabVacia(t.codigo, t.almacen_codigo, empleado?.codigo ?? null)
        setCab(c)
        setOrig(null)
        setLineas([])
        setModo('alta')
        setCargando(false)
        return
      }
      let q = supabase.from('traspaso_almacen').select(CAB_COLS)
      if (claveTienda && claveNumero != null) q = q.eq('tienda_terminal_codigo', claveTienda).eq('numero', claveNumero)
      else q = q.order('fecha', { ascending: false }).order('numero', { ascending: false })
      const { data } = await q.limit(1)
      if (cancel) return
      const c = ((data ?? [])[0] as Cab | undefined) ?? null
      setCab(c)
      setModo('consulta')
      if (!c) {
        setLineas([])
        setOrig(null)
        setCargando(false)
        return
      }
      const { data: ls } = await supabase
        .from('traspaso_almacen_linea')
        .select('linea, articulo_codigo, cantidad, cajas, bultos, precio, unidades_por_caja, cajas_por_bulto, articulo:articulo_codigo(descripcion)')
        .eq('tienda_terminal_codigo', c.tienda_terminal_codigo)
        .eq('numero', c.numero!)
        .order('linea')
      if (cancel) return
      const lista: Linea[] = (ls ?? []).map((r) => ({
        articulo_codigo: r.articulo_codigo as string,
        descripcion: ((r.articulo as unknown as { descripcion: string } | null)?.descripcion ?? '') as string,
        cantidad: Number(r.cantidad),
        cajas: r.cajas == null ? null : Number(r.cajas),
        bultos: r.bultos == null ? null : Number(r.bultos),
        precio: Number(r.precio ?? 0),
        unidades_por_caja: r.unidades_por_caja == null ? null : Number(r.unidades_por_caja),
        cajas_por_bulto: r.cajas_por_bulto == null ? null : Number(r.cajas_por_bulto),
      }))
      setLineas(lista)
      setOrig({ cab: c, lineas: lista })
      setCargando(false)
    }
    run()
    return () => {
      cancel = true
    }
  }, [esNuevo, claveTienda, claveNumero, tiendas, empleado])

  useEffect(() => {
    const cod = cab?.empleado_codigo
    if (!cod) return setNombreEmpleado('')
    supabase
      .from('empleado')
      .select('nombre')
      .eq('codigo', cod)
      .maybeSingle()
      .then(({ data }) => setNombreEmpleado((data?.nombre as string | undefined) ?? ''))
  }, [cab?.empleado_codigo])

  const lineaSel = lineas[sel] ?? null
  useEffect(() => {
    const art = lineaSel?.articulo_codigo
    if (!art || !cab) return setStock({ origen: 0, destino: 0 })
    Promise.all([stockDe(art, cab.almacen_origen_codigo), stockDe(art, cab.almacen_destino_codigo)]).then(([o, d]) =>
      setStock({ origen: o, destino: d }),
    )
  }, [lineaSel?.articulo_codigo, cab?.almacen_origen_codigo, cab?.almacen_destino_codigo, cab, guardando])

  const totales = useMemo(
    () => ({
      cantidad: lineas.reduce((s, l) => s + (l.cantidad || 0), 0),
      importe: lineas.reduce((s, l) => s + (l.cantidad || 0) * (l.precio || 0), 0),
    }),
    [lineas],
  )

  const patch = (p: Partial<Cab>) => setCab((c) => (c ? { ...c, ...p } : c))
  const patchLinea = (i: number, p: Partial<Linea>) => setLineas((ls) => ls.map((l, k) => (k === i ? conCajas({ ...l, ...p }) : l)))

  async function ponerArticulo(i: number, a: ArticuloStock) {
    const precio = precioSegun(a, cab?.tipo_valoracion ?? 2)
    patchLinea(i, {
      articulo_codigo: a.codigo_interno,
      descripcion: a.descripcion,
      precio,
      unidades_por_caja: a.unidades_por_caja,
      cajas_por_bulto: a.cajas_por_bulto,
      cantidad: lineas[i]?.cantidad || 1,
    })
  }

  async function resolverLinea(i: number, codigo: string) {
    if (!codigo.trim()) return
    if (codigo === lineas[i]?.articulo_codigo && lineas[i]?.descripcion) return
    const a = await resolverArticulo(codigo)
    if (!a) {
      setMensaje(`No existe ningún artículo con el código ${codigo}.`)
      patchLinea(i, { descripcion: '' })
      return
    }
    setMensaje(null)
    ponerArticulo(i, a)
  }

  function nuevaLinea() {
    setLineas((ls) => [
      ...ls,
      { articulo_codigo: '', descripcion: '', cantidad: 1, cajas: null, bultos: null, precio: 0, unidades_por_caja: null, cajas_por_bulto: null },
    ])
    setSel(lineas.length)
    setTimeout(() => codRefs.current.get(lineas.length)?.focus(), 0)
  }

  function borrarLinea() {
    if (!lineaSel) return
    setLineas((ls) => ls.filter((_, k) => k !== sel))
    setSel((s) => Math.max(0, s - 1))
  }

  async function cambiarValoracion(tipo: number) {
    patch({ tipo_valoracion: tipo })
    const codigos = [...new Set(lineas.map((l) => l.articulo_codigo).filter(Boolean))]
    if (codigos.length === 0) return
    const { data } = await supabase
      .from('articulo')
      .select('codigo_interno, descripcion, coste_puro, coste_neto, coste_bruto, precio_liquidado, unidades_por_caja, cajas_por_bulto')
      .in('codigo_interno', codigos)
    const porCodigo = new Map((data ?? []).map((a) => [a.codigo_interno as string, a as ArticuloStock]))
    setLineas((ls) => ls.map((l) => (porCodigo.get(l.articulo_codigo) ? { ...l, precio: precioSegun(porCodigo.get(l.articulo_codigo)!, tipo) } : l)))
  }

  function irA(t: string, n: number) {
    navigate(`/traspasos/${encodeURIComponent(t)}/${n}`)
  }
  const idx = navIndice(nav, ordenDesc)
  const totalClaves = nav.total ?? 0
  async function navegar(d: NavDir) {
    const r = await nav.ir(navDir(d, ordenDesc))
    if (r) irA(r.tienda_terminal_codigo, Number(r.numero))
  }

  async function guardar() {
    if (!cab) return
    const validas = lineas.filter((l) => l.articulo_codigo)
    if (!cab.almacen_origen_codigo || !cab.almacen_destino_codigo) return setMensaje('Indica el almacén de origen y el de destino.')
    if (cab.almacen_origen_codigo === cab.almacen_destino_codigo) return setMensaje('El almacén de origen y el de destino no pueden ser el mismo.')
    if (validas.some((l) => !l.descripcion)) return setMensaje('Hay líneas con un código de artículo que no existe.')
    setGuardando(true)
    setMensaje(null)
    try {
      let numero = cab.numero
      const total = validas.reduce((s, l) => s + l.cantidad * l.precio, 0)
      const unidades = validas.reduce((s, l) => s + l.cantidad, 0)
      const cabecera = {
        fecha: cab.fecha,
        documento_externo: cab.documento_externo,
        empleado_codigo: cab.empleado_codigo,
        almacen_origen_codigo: cab.almacen_origen_codigo,
        almacen_destino_codigo: cab.almacen_destino_codigo,
        confirmado: cab.confirmado,
        tipo_valoracion: cab.tipo_valoracion,
        total_traspaso: Math.round(total * 1000) / 1000,
        num_articulos: unidades,
        fecha_hora_actualizacion: new Date().toISOString(),
      }
      if (modo === 'alta') {
        const { data: n, error: e1 } = await supabase.rpc('fn_siguiente_numero', {
          p_tienda: cab.tienda_terminal_codigo,
          p_tipo_documento: 'traspaso_almacen',
          p_serie: '',
        })
        if (e1) throw e1
        numero = Number(n)
        const { error: e2 } = await supabase.from('traspaso_almacen').insert({
          tienda_terminal_codigo: cab.tienda_terminal_codigo,
          numero,
          ...cabecera,
          stock_movido: false,
          almacen_origen_ficticio: false,
          almacen_destino_ficticio: false,
          es_multiple: false,
          encadena_segundo_traspaso: false,
        })
        if (e2) throw e2
      } else {
        // Modificación: si el traspaso ya movió stock, se deshace con las líneas y almacenes de antes.
        if (orig?.cab.stock_movido) {
          const e = await moverStock(orig.cab, orig.lineas, -1)
          if (e) throw e
          const { error } = await supabase
            .from('traspaso_almacen')
            .update({ stock_movido: false })
            .eq('tienda_terminal_codigo', cab.tienda_terminal_codigo)
            .eq('numero', numero!)
          if (error) throw error
        }
        const { error: e3 } = await supabase
          .from('traspaso_almacen')
          .update(cabecera)
          .eq('tienda_terminal_codigo', cab.tienda_terminal_codigo)
          .eq('numero', numero!)
        if (e3) throw e3
        const { error: e4 } = await supabase
          .from('traspaso_almacen_linea')
          .delete()
          .eq('tienda_terminal_codigo', cab.tienda_terminal_codigo)
          .eq('numero', numero!)
        if (e4) throw e4
      }
      if (validas.length > 0) {
        const { error: e5 } = await supabase.from('traspaso_almacen_linea').insert(
          validas.map((l, i) => ({
            tienda_terminal_codigo: cab.tienda_terminal_codigo,
            numero,
            linea: i + 1,
            articulo_codigo: l.articulo_codigo,
            cantidad: l.cantidad,
            total_unidades: l.cantidad,
            cajas: l.cajas,
            bultos: l.bultos,
            unidades_por_caja: l.unidades_por_caja,
            cajas_por_bulto: l.cajas_por_bulto,
            precio: l.precio,
            almacen_destino_codigo: cab.almacen_destino_codigo,
          })),
        )
        if (e5) throw e5
      }
      if (cab.confirmado) {
        const e6 = await moverStock({ ...cab, numero }, validas, 1)
        if (e6) throw e6
        const { error } = await supabase
          .from('traspaso_almacen')
          .update({ stock_movido: true })
          .eq('tienda_terminal_codigo', cab.tienda_terminal_codigo)
          .eq('numero', numero!)
        if (error) throw error
      }
      cargarClaves()
      setModo('consulta')
      if (modo === 'alta' || cab.numero !== numero) irA(cab.tienda_terminal_codigo, numero!)
      else {
        const nuevoCab = { ...cab, stock_movido: cab.confirmado }
        setCab(nuevoCab)
        setLineas(validas)
        setOrig({ cab: nuevoCab, lineas: validas })
      }
    } catch (e) {
      setMensaje(`No se ha podido guardar: ${(e as { message?: string }).message ?? String(e)}`)
    } finally {
      setGuardando(false)
    }
  }

  function cancelar() {
    setMensaje(null)
    if (modo === 'alta') {
      if (totalClaves) void navegar('ultimo')
      else {
        setCab(null)
        setLineas([])
        setModo('consulta')
        navigate('/traspasos')
      }
      return
    }
    deshacer()
    setModo('consulta')
  }

  function deshacer() {
    if (modo === 'alta') {
      const t = tiendas[0]
      setCab(cabVacia(t?.codigo ?? '', t?.almacen_codigo ?? null, empleado?.codigo ?? null))
      setLineas([])
      return
    }
    if (orig) {
      setCab(orig.cab)
      setLineas(orig.lineas)
    }
  }

  // Teclas de GeminisWin (F1 guardar, Alt+Retroceso cancelar) y las comunes de la barra: teclasFicha.
  const barra = useRef<HTMLDivElement>(null)
  useTeclasFicha({
    mode: modo,
    canNavigate: !editable && idx >= 0,
    saving: guardando,
    raiz: barra,
    acciones: {
      primero: () => void navegar('primero'),
      anterior: idx > 0 ? () => void navegar('anterior') : undefined,
      siguiente: idx < totalClaves - 1 ? () => void navegar('siguiente') : undefined,
      ultimo: () => void navegar('ultimo'),
      buscar: () => setDialogo('buscar'),
      nuevo: () => navigate('/traspasos/nuevo'),
      modificar: cab ? () => setModo('edicion') : undefined,
      guardar,
      cancelar,
      salir: () => navigate('/'),
    },
  })

  if (cargando && !cab) return <div className="gw-label p-2">Cargando…</div>

  const sinDoc = !cab
  const c = cab ?? cabVacia(tiendas[0]?.codigo ?? '', null, null)

  return (
    <div className="flex min-w-[1000px] flex-col gap-1">
      <div className="grid grid-cols-[minmax(0,620px)_minmax(0,1fr)] gap-3">
        <div className="flex flex-col gap-1">
          <fieldset className="gw-group grid grid-cols-[70px_110px_180px_minmax(0,1fr)] gap-x-1 !pt-1">
            <Campo label="Tienda">
              <GwSelect className={BIG_INPUT} disabled={modo !== 'alta'} value={c.tienda_terminal_codigo} onChange={(e) => patch({ tienda_terminal_codigo: e.target.value })}>
                {tiendas.map((t) => (
                  <option key={t.codigo} value={t.codigo}>
                    {t.codigo}
                  </option>
                ))}
              </GwSelect>
            </Campo>
            <Campo label="Número">
              <GwInput className={`${BIG_INPUT} text-right`} readOnly value={c.numero ?? ''} title="Se asigna al guardar" />
            </Campo>
            <Campo label="Fecha y Hora">
              {editable ? (
                <GwDateTime
                  className={BIG_INPUT}
                  title="dd/mm/aaaa hh:mm · +/- día · H ahora · F4 calendario"
                  value={c.fecha}
                  onChange={(v) => v && patch({ fecha: v })}
                />
              ) : (
                <GwInput className={BIG_INPUT} readOnly value={sinDoc ? '' : fechaHora(c.fecha)} />
              )}
            </Campo>
            <Campo label="Documento">
              <span className="flex">
                <GwInput
                  className={BIG_INPUT}
                  disabled={!editable}
                  value={c.documento_externo ?? ''}
                  onChange={(e) => patch({ documento_externo: e.target.value || null })}
                  title="DOCUMENTO"
                />
                <GwLookupButton disabled={!editable} onClick={() => setDialogo('documento')} title="Buscar documento" />
              </span>
            </Campo>
          </fieldset>
          <fieldset className="gw-group mr-24 !pt-1">
            <legend className={BIG_LABEL}>Empleado</legend>
            <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-1">
              <GwInput className={BIG_INPUT} disabled={!editable} value={c.empleado_codigo ?? ''} onChange={(e) => patch({ empleado_codigo: e.target.value || null })} />
              <span className="flex">
                <GwInput className={BIG_INPUT} readOnly tabIndex={-1} value={nombreEmpleado} />
                <GwLookupButton disabled={!editable} onClick={() => setDialogo('empleado')} title="Buscar empleado" />
              </span>
            </div>
          </fieldset>
          <GwCheck
            className={BIG_LABEL}
            label="Reflejar traspaso en los almacenes"
            checked={c.confirmado}
            disabled={!editable}
            onChange={(v) => patch({ confirmado: v })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <fieldset className="gw-group grid grid-cols-[120px_64px_minmax(0,1fr)] items-center gap-x-1 gap-y-1.5 !py-2">
            <span className={BIG_LABEL}>Alm. Origen:</span>
            <GwInput
              className={BIG_INPUT}
              disabled={!editable}
              value={c.almacen_origen_codigo}
              onChange={(e) => patch({ almacen_origen_codigo: e.target.value })}
            />
            <span className="flex">
              <GwInput className={BIG_INPUT} readOnly tabIndex={-1} value={nombreAlm(c.almacen_origen_codigo)} />
              <GwLookupButton disabled={!editable} onClick={() => setDialogo('origen')} title="Buscar almacén de origen" />
            </span>
            <span className={BIG_LABEL}>Alm. destino:</span>
            <GwInput
              className={BIG_INPUT}
              disabled={!editable}
              value={c.almacen_destino_codigo}
              onChange={(e) => patch({ almacen_destino_codigo: e.target.value })}
            />
            <span className="flex">
              <GwInput className={BIG_INPUT} readOnly tabIndex={-1} value={nombreAlm(c.almacen_destino_codigo)} />
              <GwLookupButton disabled={!editable} onClick={() => setDialogo('destino')} title="Buscar almacén de destino" />
            </span>
          </fieldset>
          <div className="mt-auto flex items-center justify-end gap-3">
            <span className={`${BIG_LABEL} font-bold`}>Precio para valorar el traspaso:</span>
            <GwSelect
              className={`${BIG_INPUT} !w-[240px]`}
              disabled={!editable}
              value={c.tipo_valoracion}
              onChange={(e) => cambiarValoracion(Number(e.target.value))}
              title="TIPOVALOR — confirmar códigos con Luis"
            >
              {VALORACIONES.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </GwSelect>
          </div>
        </div>
      </div>

      <div className="h-[290px] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid !text-[15px]">
          <colgroup>
            <col style={{ width: '17%' }} />
            <col />
            <col style={{ width: '10%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '11%' }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>
              <th>Código</th>
              <th>Descripción</th>
              <th className="!text-center">Cantidad</th>
              <th>Cajas</th>
              <th>Bultos</th>
              <th className="!text-center">Precio</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => {
              const activa = i === sel
              const cls = activa && !editable ? 'gw-selected' : ''
              return (
                <tr key={i} className={cls} onClick={() => setSel(i)}>
                  <td>
                    {editable ? (
                      <input
                        ref={(el) => {
                          if (el) codRefs.current.set(i, el)
                        }}
                        className="w-full bg-transparent outline-none"
                        value={l.articulo_codigo}
                        onFocus={() => setSel(i)}
                        onChange={(e) => patchLinea(i, { articulo_codigo: e.target.value, descripcion: '' })}
                        onBlur={(e) => resolverLinea(i, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      />
                    ) : (
                      l.articulo_codigo
                    )}
                  </td>
                  <td className="truncate">{l.descripcion}</td>
                  <td className="text-right">
                    {editable ? (
                      <GwNumber value={l.cantidad} decimals={3} className="!h-[20px] !border-0 !bg-transparent !text-[15px]" onChange={(v) => patchLinea(i, { cantidad: v ?? 0 })} />
                    ) : (
                      formatGw(l.cantidad, 3)
                    )}
                  </td>
                  <td className="text-right">{l.cajas != null && l.cajas !== 0 ? formatGw(l.cajas, 2) : ''}</td>
                  <td className="text-right">{l.bultos != null && l.bultos !== 0 ? formatGw(l.bultos, 2) : ''}</td>
                  <td className="text-right">
                    {editable ? (
                      <GwNumber value={l.precio} decimals={3} className="!h-[20px] !border-0 !bg-transparent !text-[15px]" onChange={(v) => patchLinea(i, { precio: v ?? 0 })} />
                    ) : (
                      formatGw(l.precio, 3)
                    )}
                  </td>
                  <td className="text-right">{formatGw(l.cantidad * l.precio, 2)}</td>
                </tr>
              )
            })}
            <FilasVacias cols={7} ocupadas={lineas.length} total={12} />
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-[320px_minmax(0,1fr)_130px_150px] items-center gap-3">
        <div className="flex border border-[var(--gw-border)] bg-[var(--gw-face)]">
          <MiniBtn title="Añadir línea" onClick={nuevaLinea} disabled={!editable}>
            <FilePlus2 size={15} />
          </MiniBtn>
          <MiniBtn title="Modificar línea" onClick={() => codRefs.current.get(sel)?.focus()} disabled={!editable || !lineaSel}>
            <FilePen size={15} />
          </MiniBtn>
          <MiniBtn title="Borrar línea" onClick={borrarLinea} disabled={!editable || !lineaSel}>
            <FileX2 size={15} className="text-[#c42b1c]" />
          </MiniBtn>
          <MiniBtn title="Buscar artículo" onClick={() => setDialogo('articulo')} disabled={!editable}>
            <Binoculars size={15} />
          </MiniBtn>
        </div>
        <span className="text-[16px] text-[#1a4fd0]">Nº Lineas: {lineas.length}</span>
        <span className="text-right text-[16px] font-bold">{formatGw(totales.cantidad, 3)}</span>
        <span className="pr-1 text-right text-[16px] font-bold">{formatGw(totales.importe, 2)}</span>
      </div>

      <div className="flex items-center gap-14 border-t border-[var(--gw-border-light)] pt-1">
        <span className="text-[17px] font-bold">Stock en origen: {formatGw(stock.origen, 3)}</span>
        <span className="text-[17px] font-bold">Stock en Destino: {formatGw(stock.destino, 3)}</span>
        <button
          type="button"
          className="gw-btn ml-auto !h-[32px] !w-[200px] !text-[16px]"
          disabled={!editable}
          onClick={() => setDialogo('rapida')}
          title="Entrada rápida de artículos con lector o teclado"
        >
          <ScanBarcode size={15} /> Entrada Rápida
        </button>
      </div>

      {mensaje && <p className="gw-label text-[#c42b1c]">{mensaje}</p>}
      {sinDoc && modo === 'consulta' && <p className="gw-label text-[#1a4fd0]">No hay traspasos todavía. Pulsa Nuevo para crear el primero.</p>}

      <div ref={barra} className="flex border border-[var(--gw-border)] bg-[var(--gw-face)] p-[2px]">
        <BarBtn title={conTecla('Ir al primer registro', 'primero')} disabled={editable || idx < 0} onClick={() => navegar('primero')}>
          <ChevronFirst size={17} strokeWidth={3} />
        </BarBtn>
        <BarBtn title={conTecla('Ir al anterior registro', 'anterior')} disabled={editable || idx <= 0} onClick={() => navegar('anterior')}>
          <Play size={12} className="rotate-180" fill="currentColor" />
        </BarBtn>
        <BarBtn title={conTecla('Ir al siguiente registro', 'siguiente')} disabled={editable || idx < 0 || idx >= totalClaves - 1} onClick={() => navegar('siguiente')}>
          <Play size={12} fill="currentColor" />
        </BarBtn>
        <BarBtn
          title={conTecla('Ir al último registro', 'ultimo')}
          disabled={editable || idx < 0}
          onClick={() => navegar('ultimo')}
        >
          <ChevronLast size={17} strokeWidth={3} />
        </BarBtn>
        <BarBtn title={ordenDesc ? 'Orden: del más nuevo al más antiguo' : 'Orden: del más antiguo al más nuevo'} disabled={editable} onClick={() => setOrdenDesc((o) => !o)}>
          <ArrowDownAZ size={17} />
        </BarBtn>
        <BarBtn title={conTecla('Buscar (Localizar registros)', 'buscar')} disabled={editable} onClick={() => setDialogo('buscar')}>
          <Binoculars size={17} />
        </BarBtn>
        <BarBtn title="Imprimir" disabled={sinDoc} onClick={() => window.print()}>
          <Printer size={17} />
        </BarBtn>
        {editable ? (
          <>
            <BarBtn title={conTecla('Guardar', 'guardar')} disabled={guardando} onClick={guardar}>
              <Save size={17} />
            </BarBtn>
            <BarBtn title={conTecla('Cancelar', 'cancelar')} disabled={guardando} onClick={cancelar}>
              <X size={18} strokeWidth={3} />
            </BarBtn>
            <BarBtn title="Deshacer cambios" disabled={guardando} onClick={deshacer}>
              <Undo2 size={17} />
            </BarBtn>
          </>
        ) : (
          <>
            <BarBtn title={conTecla('Nuevo', 'nuevo')} onClick={() => navigate('/traspasos/nuevo')}>
              <FilePlus2 size={17} />
            </BarBtn>
            <BarBtn title={conTecla('Modificar', 'modificar')} disabled={sinDoc} onClick={() => setModo('edicion')}>
              <FilePen size={17} />
            </BarBtn>
            <BarBtn title="Los traspasos no se eliminan: modifícalo o desmarca «Reflejar traspaso en los almacenes»" disabled>
              <FileX2 size={17} />
            </BarBtn>
          </>
        )}
        <BarBtn title={conTecla('Cerrar', 'salir')} onClick={() => navigate('/')}>
          <DoorOpen size={17} />
        </BarBtn>
      </div>

      {dialogo === 'buscar' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Localizar traspaso"
          table="traspaso_almacen"
          columns={[
            { key: 'tienda_terminal_codigo', label: 'Tienda', width: 70 },
            { key: 'numero', label: 'Número', width: 100 },
            { key: 'almacen_origen_codigo', label: 'Origen', width: 80 },
            { key: 'almacen_destino_codigo', label: 'Destino', width: 80 },
            { key: 'documento_externo', label: 'Documento' },
          ]}
          searchColumns={['documento_externo', 'almacen_origen_codigo', 'almacen_destino_codigo']}
          orderBy="numero"
          keyColumn="numero"
          onPick={(r) => {
            setDialogo(null)
            irA(String(r.tienda_terminal_codigo), Number(r.numero))
          }}
          onClose={() => setDialogo(null)}
        />
      )}
      {(dialogo === 'origen' || dialogo === 'destino') && (
        <GwLookupDialog<Record<string, unknown>>
          title={dialogo === 'origen' ? 'Almacén de origen' : 'Almacén de destino'}
          table="almacen"
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            patch(dialogo === 'origen' ? { almacen_origen_codigo: String(r.codigo) } : { almacen_destino_codigo: String(r.codigo) })
            setDialogo(null)
          }}
          onClose={() => setDialogo(null)}
        />
      )}
      {dialogo === 'empleado' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Empleado"
          table="empleado"
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            patch({ empleado_codigo: String(r.codigo) })
            setDialogo(null)
          }}
          onClose={() => setDialogo(null)}
        />
      )}
      {dialogo === 'documento' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Tipo de documento"
          table="tipo_documento_contable"
          columns={[
            { key: 'codigo', label: 'Código', width: 110 },
            { key: 'descripcion', label: 'Descripción' },
          ]}
          searchColumns={['codigo', 'descripcion']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            patch({ documento_externo: String(r.codigo) })
            setDialogo(null)
          }}
          onClose={() => setDialogo(null)}
        />
      )}
      {dialogo === 'articulo' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Buscar artículo"
          table="articulo"
          columns={[
            { key: 'codigo_interno', label: 'Código', width: 140 },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'codigo_barras_principal', label: 'Cód. barras', width: 140 },
          ]}
          searchColumns={['codigo_interno', 'descripcion', 'codigo_barras_principal']}
          orderBy="codigo_interno"
          keyColumn="codigo_interno"
          onPick={async (r) => {
            setDialogo(null)
            const a = await resolverArticulo(String(r.codigo_interno))
            if (!a) return
            if (!lineaSel || lineaSel.articulo_codigo) {
              const i = lineas.length
              setLineas((ls) => [
                ...ls,
                { articulo_codigo: '', descripcion: '', cantidad: 1, cajas: null, bultos: null, precio: 0, unidades_por_caja: null, cajas_por_bulto: null },
              ])
              setSel(i)
              setTimeout(() => ponerArticulo(i, a), 0)
            } else ponerArticulo(sel, a)
          }}
          onClose={() => setDialogo(null)}
        />
      )}
      {dialogo === 'rapida' && (
        <EntradaRapida
          titulo="Entrada rápida de artículos al traspaso"
          onCerrar={() => setDialogo(null)}
          onAnadir={(a, cantidad) => {
            const precio = precioSegun(a, c.tipo_valoracion)
            setLineas((ls) => {
              const k = ls.findIndex((l) => l.articulo_codigo === a.codigo_interno)
              if (k >= 0) return ls.map((l, j) => (j === k ? conCajas({ ...l, cantidad: l.cantidad + cantidad }) : l))
              return [
                ...ls,
                conCajas({
                  articulo_codigo: a.codigo_interno,
                  descripcion: a.descripcion,
                  cantidad,
                  cajas: null,
                  bultos: null,
                  precio,
                  unidades_por_caja: a.unidades_por_caja,
                  cajas_por_bulto: a.cajas_por_bulto,
                }),
              ]
            })
          }}
        />
      )}
    </div>
  )
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className={BIG_LABEL}>{label}</span>
      {children}
    </div>
  )
}

function MiniBtn({ title, onClick, disabled, children }: { title: string; onClick?: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-[30px] flex-1 items-center justify-center border-r border-[var(--gw-border-light)] text-[#1d3a8a] last:border-r-0 hover:bg-[#e5f1fb] disabled:text-[#a8a8a8] disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

function BarBtn({ title, onClick, disabled, children }: { title: string; onClick?: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      data-gw-estado={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-[34px] flex-1 items-center justify-center border-r border-[var(--gw-border-light)] text-[#1d3a8a] last:border-r-0 hover:bg-[#e5f1fb] disabled:text-[#a8a8a8] disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

/** Entrada rápida: código (o código de barras) y cantidad; Intro añade y vuelve al código, como con lector. */
export function EntradaRapida({
  titulo,
  etiquetaCantidad = 'Cantidad',
  cantidadInicial = 1,
  onAnadir,
  onCerrar,
}: {
  titulo: string
  etiquetaCantidad?: string
  cantidadInicial?: number
  onAnadir: (a: ArticuloStock, cantidad: number) => void | Promise<void>
  onCerrar: () => void
}) {
  const [codigo, setCodigo] = useState('')
  const [cantidadTxt, setCantidadTxt] = useState(String(cantidadInicial))
  const cantidad = Number(cantidadTxt.trim().replace(/\./g, '').replace(',', '.')) || 0
  const [ultimo, setUltimo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  async function anadir() {
    const a = await resolverArticulo(codigo)
    if (!a) {
      setError(`No existe ningún artículo con el código ${codigo}.`)
      return
    }
    try {
      await onAnadir(a, cantidad ?? 0)
    } catch (e) {
      setError(`No se ha podido añadir: ${(e as { message?: string }).message ?? String(e)}`)
      return
    }
    setUltimo(`${a.codigo_interno} · ${a.descripcion} · ${formatGw(cantidad ?? 0, 3)}`)
    setError(null)
    setCodigo('')
    setCantidadTxt(String(cantidadInicial))
    ref.current?.focus()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-32">
      <GwWindow title={titulo} onClose={onCerrar} className="w-[560px]">
        <div className="flex flex-col gap-2 p-1">
          <div className="grid grid-cols-[minmax(0,1fr)_150px] gap-2">
            <label className="flex flex-col">
              <span className={BIG_LABEL}>Código / Código de barras</span>
              <input
                ref={ref}
                autoFocus
                className={`gw-input ${BIG_INPUT}`}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && codigo.trim() && anadir()}
              />
            </label>
            <label className="flex flex-col">
              <span className={BIG_LABEL}>{etiquetaCantidad}</span>
              <input
                className={`gw-input gw-num ${BIG_INPUT}`}
                value={cantidadTxt}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setCantidadTxt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && codigo.trim() && anadir()}
              />
            </label>
          </div>
          {ultimo && <span className="gw-label text-[#1a4fd0]">Añadido: {ultimo}</span>}
          {error && <span className="gw-label text-[#c42b1c]">{error}</span>}
          <div className="flex justify-end gap-1.5">
            <button type="button" className="gw-btn" disabled={!codigo.trim()} onClick={anadir}>
              Añadir
            </button>
            <button type="button" className="gw-btn" onClick={onCerrar}>
              Terminar
            </button>
          </div>
        </div>
      </GwWindow>
    </div>
  )
}
