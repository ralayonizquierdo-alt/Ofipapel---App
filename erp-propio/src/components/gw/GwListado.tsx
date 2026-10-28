/*
 * GwListado — pieza común de los LISTADOS / INFORMES de GeminisWin.
 * ====================================================================
 *
 * GeminisWin saca todos sus listados igual: una ventana de FILTROS («Informe a procesar»,
 * «Orden de salida», grupos Desde/Hasta · Cualquiera · Seleccionar, botones ×/✓ de estado,
 * destino Pantalla / Impresora / Examinar / Doc. PDF y Procesar / Cerrar) o, en los listados
 * antiguos, un diálogo pequeño gris (Desde/Hasta + Pantalla/Impresora + Aceptar/Cancelar).
 * Al procesar, el informe se ve en una VISTA PRELIMINAR (cabecera con la empresa, título,
 * filtros aplicados, columnas, subtotales por grupo y total general), se imprime en A4 con
 * window.print (solo sale la hoja, el resto de la app se oculta) y se exporta a CSV para Excel
 * («;», coma decimal, UTF-8 con BOM).
 *
 * CÓMO SE USA (ver src/pages/listados/* como ejemplo):
 *
 *   1. SQL: una función `fn_lst_xxx(p jsonb)` SECURITY INVOKER que devuelva filas con
 *      `nivel` (0 detalle · 1 subtotal del grupo · 2 total general), `grupo`, `grupo_desc`
 *      ('' = informe sin grupos) y las columnas del informe; los subtotales y el total se
 *      calculan allí con GROUPING SETS ((grupo, clave), (grupo), ()). Ayudantes SQL ya hechos
 *      (supabase/migrations/20261027_listados_ventas_compras.sql):
 *        lst_en(valor, rango)           rango = {modo:'cualquiera'|'desdeHasta'|'seleccionar', desde, hasta, lista}
 *        lst_fecha(timestamp, fecha)    fecha = {modo, desde:'AAAA-MM-DDTHH:MI:SS', hasta}
 *        lst_par(bool, {si, no})        botones ×/✓ emparejados («Pagadas / No Pagadas»)
 *        lst_tienda_num(t, n, f)        «Tienda y Número» desde/hasta o lista «41/123»
 *        lst_campo_cliente(c, f)        «Filtrar Según Campo de Cliente»
 *        lst_ts(fecha, hora), lst_hora, lst_mes
 *   2. Ventana grande: <ListadoVentana informes=… orden=… onProcesar=…> con grupos dentro:
 *        <GrupoRango titulo="Clientes" valor={rango} onChange=… buscador="cliente" />
 *        <GrupoFecha … />, <BotonOpcion …/> (×/✓), <BotonPulsado …/> (sin icono)
 *      Diálogo pequeño: <DialogoListado titulo=… onAceptar=…> con <CampoCodigo>, <CampoFecha>.
 *   3. Resultado: `const inf = useInforme()`; al procesar
 *        inf.procesar({ titulo, filtros: [...textos], columnas, sinCaptura: true,
 *                       cargar: () => rpc('fn_lst_xxx', { p }) }, destino)
 *      y pintar `{inf.vista}` en la página. Las columnas: {key, titulo, tipo:'texto'|'num'|
 *      'entero'|'fecha', dec, ancho, suma}. `rango()`, `describirRango()` y `describirFecha()`
 *      ayudan a montar el jsonb y la línea de «filtros aplicados».
 *
 * Grupos más específicos ya hechos en src/pages/listados/comun.tsx: «Tienda y Número»,
 * «Filtrar Según Campo de Cliente», «Filtrar según el total del Proveedor» y rpc(fn, p).
 *
 * Buscadores («···» y Ctrl+Intro) ya definidos en BUSCADORES: tienda, almacen, vendedor, tecnico,
 * empleado, cliente, articulo, familia, marca, proveedor, formaPago, moneda, tipoCliente, zona, ruta.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, Check, DoorOpen, FileDown, FileText, ListPlus, Monitor, Printer, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwWindow, formatGw } from './index'
import { GwDate, Calendario } from './GwDate'
import { GwLookupDialog, type GwLookupColumn } from './GwLookupDialog'
import { useListaOrdenada, type GwListaOrdenadaDef } from './GwListaOrdenada'

/* =====================================================================
 * Tipos y ayudantes de filtros
 * ===================================================================== */

export type ModoRango = 'desdeHasta' | 'cualquiera' | 'seleccionar'

export interface Rango {
  modo: ModoRango
  desde: string
  hasta: string
  /** Códigos seleccionados, separados por comas (lo que se ve en el campo). */
  lista: string
}

export const rango = (modo: ModoRango = 'cualquiera', desde = '', hasta = ''): Rango => ({ modo, desde, hasta, lista: '' })

/** Rango → jsonb que entienden lst_en / lst_tienda_num. */
export function rangoSql(r: Rango) {
  return {
    modo: r.modo,
    desde: r.desde.trim(),
    hasta: r.hasta.trim(),
    lista: r.lista
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  }
}

export function describirRango(nombre: string, r: Rango): string | null {
  if (r.modo === 'desdeHasta' && (r.desde.trim() || r.hasta.trim()))
    return `${nombre}: desde ${r.desde.trim() || 'el primero'} hasta ${r.hasta.trim() || 'el último'}`
  if (r.modo === 'seleccionar' && r.lista.trim()) return `${nombre}: ${r.lista.trim()}`
  return null
}

export interface Par {
  si: boolean
  no: boolean
}
export const par = (): Par => ({ si: false, no: false })

/** Texto de un par ×/✓ para los filtros aplicados, o null si no filtra. */
export function describirPar(si: string, no: string, p: Par): string | null {
  if (p.si && !p.no) return si
  if (p.no && !p.si) return no
  return null
}

/** Fecha y hora 'AAAA-MM-DDTHH:MM:SS' ('' = vacía). */
export interface RangoFecha {
  modo: 'desdeHasta' | 'cualquiera'
  desde: string
  hasta: string
}

const pad2 = (n: number) => String(n).padStart(2, '0')
export const hoyIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
export function fechaEs(iso: string | null | undefined) {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}
/** '2026-10-01T00:00:00' → '01/10/2026 0:00:00' (como GeminisWin). */
export function fechaHoraEs(v: string) {
  if (!v) return ''
  const [f, h = ''] = v.split('T')
  const [hh = '0', mm = '00', ss = '00'] = h.split(':')
  return `${fechaEs(f)} ${Number(hh)}:${mm}:${ss}`
}
export function describirFecha(nombre: string, r: RangoFecha): string | null {
  if (r.modo !== 'desdeHasta' || (!r.desde && !r.hasta)) return null
  return `${nombre}: ${r.desde ? fechaHoraEs(r.desde) : '…'} a ${r.hasta ? fechaHoraEs(r.hasta) : '…'}`
}

/* =====================================================================
 * Buscadores («···» y Ctrl+Intro)
 * ===================================================================== */

export interface Buscador {
  titulo: string
  tabla: string
  clave: string
  nombre?: string
  columnas: GwLookupColumn[]
  busca: string[]
  orden: string
  /** Lista ordenada de Ctrl+Intro (si la fuente existe en gw_lista_ordenada). */
  lista?: GwListaOrdenadaDef
}

const cod = (label = 'Código', width = 90): GwLookupColumn => ({
  key: 'codigo',
  label,
  width,
})

export const BUSCADORES = {
  tienda: {
    titulo: 'Tiendas',
    tabla: 'tienda_terminal',
    clave: 'codigo',
    nombre: 'descripcion',
    columnas: [cod(), { key: 'descripcion', label: 'Descripción' }],
    busca: ['codigo', 'descripcion'],
    orden: 'codigo',
  },
  almacen: {
    titulo: 'Almacenes',
    tabla: 'almacen',
    clave: 'codigo',
    nombre: 'nombre',
    columnas: [cod(), { key: 'nombre', label: 'Nombre' }],
    busca: ['codigo', 'nombre'],
    orden: 'codigo',
  },
  vendedor: {
    titulo: 'Vendedores',
    tabla: 'vendedor',
    clave: 'codigo',
    nombre: 'nombre',
    columnas: [cod(), { key: 'nombre', label: 'Nombre' }],
    busca: ['codigo', 'nombre'],
    orden: 'codigo',
  },
  tecnico: {
    titulo: 'Técnicos',
    tabla: 'tecnico',
    clave: 'codigo',
    nombre: 'nombre',
    columnas: [cod(), { key: 'nombre', label: 'Nombre' }],
    busca: ['codigo', 'nombre'],
    orden: 'codigo',
  },
  empleado: {
    titulo: 'Empleados',
    tabla: 'empleado',
    clave: 'codigo',
    nombre: 'nombre',
    columnas: [cod(), { key: 'nombre', label: 'Nombre' }],
    busca: ['codigo', 'nombre'],
    orden: 'codigo',
  },
  cliente: {
    titulo: 'Clientes',
    tabla: 'cliente',
    clave: 'codigo',
    nombre: 'nombre',
    columnas: [cod(), { key: 'nombre', label: 'Nombre' }, { key: 'nif', label: 'NIF', width: 110 }],
    busca: ['codigo', 'nombre', 'nif'],
    orden: 'codigo',
    lista: {
      fuente: 'cliente',
      campo: 'codigo',
      etiqueta: 'Código',
      que: 'Clientes',
      columnas: [
        { key: 'codigo', label: 'Código', width: 80 },
        { key: 'nombre', label: 'Nombre' },
        { key: 'nif', label: 'NIF', width: 110 },
      ],
    },
  },
  proveedor: {
    titulo: 'Proveedores',
    tabla: 'proveedor',
    clave: 'codigo',
    nombre: 'nombre',
    columnas: [cod(), { key: 'nombre', label: 'Nombre' }, { key: 'nif', label: 'NIF', width: 110 }],
    busca: ['codigo', 'nombre', 'nif'],
    orden: 'codigo',
    lista: {
      fuente: 'proveedor',
      campo: 'codigo',
      etiqueta: 'Código',
      que: 'Proveedores',
      columnas: [
        { key: 'codigo', label: 'Código', width: 80 },
        { key: 'nombre', label: 'Nombre' },
        { key: 'nif', label: 'NIF', width: 110 },
      ],
    },
  },
  articulo: {
    titulo: 'Artículos',
    tabla: 'articulo',
    clave: 'codigo_interno',
    nombre: 'descripcion',
    columnas: [
      { key: 'codigo_interno', label: 'Cód. Interno', width: 110 },
      { key: 'descripcion', label: 'Descripción' },
    ],
    busca: ['codigo_interno', 'descripcion'],
    orden: 'codigo_interno',
    lista: {
      fuente: 'articulo',
      campo: 'codigo_interno',
      etiqueta: 'Código Interno',
      que: 'Artículos',
      columnas: [
        { key: 'codigo_interno', label: 'Cód. Interno', width: 110 },
        { key: 'descripcion', label: 'Descripción' },
        { key: 'pvp', label: 'P.V.P.', width: 80, decimales: 3 },
      ],
    },
  },
  familia: {
    titulo: 'Familias',
    tabla: 'familia',
    clave: 'codigo',
    nombre: 'descripcion',
    columnas: [cod(), { key: 'descripcion', label: 'Descripción' }],
    busca: ['codigo', 'descripcion'],
    orden: 'codigo',
    lista: {
      fuente: 'familia',
      campo: 'codigo',
      etiqueta: 'Código',
      que: 'Familias',
      columnas: [
        { key: 'codigo', label: 'Código', width: 90 },
        { key: 'descripcion', label: 'Descripción' },
      ],
    },
  },
  marca: {
    titulo: 'Marcas',
    tabla: 'marca',
    clave: 'codigo',
    columnas: [cod('Marca', 260)],
    busca: ['codigo'],
    orden: 'codigo',
    lista: {
      fuente: 'marca',
      campo: 'codigo',
      etiqueta: 'Marca',
      que: 'Marcas',
      columnas: [{ key: 'codigo', label: 'Marca' }],
    },
  },
  formaPago: {
    titulo: 'Formas de Pago',
    tabla: 'forma_pago',
    clave: 'codigo',
    nombre: 'descripcion',
    columnas: [cod(), { key: 'descripcion', label: 'Descripción' }],
    busca: ['codigo', 'descripcion'],
    orden: 'codigo',
  },
  moneda: {
    titulo: 'Monedas',
    tabla: 'moneda',
    clave: 'codigo',
    nombre: 'descripcion',
    columnas: [cod(), { key: 'descripcion', label: 'Descripción' }],
    busca: ['codigo', 'descripcion'],
    orden: 'codigo',
  },
  tipoCliente: {
    titulo: 'Tipos de Cliente',
    tabla: 'tipo_cliente',
    clave: 'codigo',
    nombre: 'descripcion',
    columnas: [cod(), { key: 'descripcion', label: 'Descripción' }],
    busca: ['codigo', 'descripcion'],
    orden: 'codigo',
  },
  zona: {
    titulo: 'Zonas Territoriales',
    tabla: 'zona_territorial',
    clave: 'codigo',
    nombre: 'descripcion',
    columnas: [cod(), { key: 'descripcion', label: 'Descripción' }],
    busca: ['codigo', 'descripcion'],
    orden: 'codigo',
  },
  ruta: {
    titulo: 'Rutas de Reparto',
    tabla: 'ruta_reparto',
    clave: 'codigo',
    nombre: 'descripcion',
    columnas: [cod(), { key: 'descripcion', label: 'Descripción' }],
    busca: ['codigo', 'descripcion'],
    orden: 'codigo',
  },
} satisfies Record<string, Buscador>

export type NombreBuscador = keyof typeof BUSCADORES

/**
 * Buscador de una tabla: `abrir(onPick)` abre la rejilla de «···»; `lista(texto, onPick)` abre
 * la lista ordenada de Ctrl+Intro (o la rejilla si la tabla no la tiene). Pintar `dialogo`.
 */
export function useBuscador(nombre: NombreBuscador | undefined) {
  const [pick, setPick] = useState<null | ((codigo: string) => void)>(null)
  const ordenada = useListaOrdenada()
  const b: Buscador | undefined = nombre ? BUSCADORES[nombre] : undefined
  const abrir = (onPick: (codigo: string) => void) => setPick(() => onPick)
  const lista = (texto: string | null, onPick: (codigo: string) => void) => {
    if (b?.lista)
      ordenada.abrir(b.lista, {
        texto,
        onPick: (f) => onPick(String(f[b.clave] ?? f._k ?? '')),
      })
    else abrir(onPick)
  }
  const dialogo = (
    <>
      {ordenada.dialogo}
      {pick && b && (
        <GwLookupDialog<Record<string, unknown>>
          title={b.titulo}
          table={b.tabla}
          columns={b.columnas}
          searchColumns={b.busca}
          orderBy={b.orden}
          keyColumn={b.clave}
          onClose={() => setPick(null)}
          onPick={(r) => {
            const f = pick
            setPick(null)
            f(String(r[b.clave] ?? ''))
          }}
        />
      )}
    </>
  )
  return { abrir, lista, dialogo }
}

/** Nombre/descripción de un código (para los diálogos pequeños: «008 ROBERTO …»). */
export function useNombreDe(nombre: NombreBuscador, codigo: string) {
  const [txt, setTxt] = useState('')
  useEffect(() => {
    const b: Buscador = BUSCADORES[nombre]
    const c = codigo.trim()
    if (!c || !b.nombre) {
      setTxt('')
      return
    }
    let vivo = true
    const t = setTimeout(async () => {
      const { data } = await supabase.from(b.tabla).select(b.nombre!).eq(b.clave, c).limit(1)
      const fila = (data?.[0] ?? null) as Record<string, unknown> | null
      if (vivo) setTxt(fila ? String(fila[b.nombre!] ?? '') : '')
    }, 200)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [nombre, codigo])
  return txt
}

/* =====================================================================
 * Controles de la ventana de filtros (aspecto de las capturas)
 * ===================================================================== */

/** Tamaños de la ventana grande de listados (letra grande de GeminisWin). */
export const LST_INPUT = 'gw-input h-[26px]! text-[16px]!'
const LST_BTN = 'gw-btn h-[26px]! w-[46px] flex-none px-0! text-[17px] font-bold tracking-[2px] leading-none'

function Radio({ nombre, label, on, set, disabled }: { nombre: string; label: ReactNode; on: boolean; set: () => void; disabled?: boolean }) {
  return (
    <label className={`flex h-[26px] select-none items-center gap-1.5 whitespace-nowrap text-[16px] ${disabled ? 'text-[#8a8a8a]' : ''}`}>
      <input type="radio" name={nombre} className="m-0 h-[11px] w-[11px] accent-[#0078d7]" checked={on} disabled={disabled} onChange={set} />
      {label}
    </label>
  )
}
export { Radio as LstRadio }

export function LstCheck({
  label,
  on,
  set,
  disabled,
  className = '',
  title,
}: {
  label: ReactNode
  on: boolean
  set: (v: boolean) => void
  disabled?: boolean
  className?: string
  title?: string
}) {
  return (
    <label title={title} className={`flex select-none items-center gap-1.5 whitespace-nowrap ${disabled ? 'text-[#8a8a8a]' : ''} ${className}`}>
      <input type="checkbox" className="m-0 h-[11px] w-[11px] accent-[#0078d7]" checked={on} disabled={disabled} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  )
}

/** Campo de código con «···» (búsqueda) y Ctrl+Intro (lista ordenada). */
export function CampoCodigo({
  valor,
  onChange,
  buscador,
  disabled,
  className = '',
  ancho,
  title,
  numerico,
  inputClass = LST_INPUT,
  botonClass = LST_BTN,
  multiple,
}: {
  valor: string
  onChange: (v: string) => void
  buscador?: NombreBuscador
  disabled?: boolean
  className?: string
  ancho?: number
  title?: string
  numerico?: boolean
  inputClass?: string
  botonClass?: string
  /** El código elegido se añade a la lista (campo «Seleccionar»). */
  multiple?: boolean
}) {
  const bus = useBuscador(buscador)
  const poner = (c: string) => {
    if (!multiple) return onChange(c)
    const actuales = valor
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    onChange([...actuales.filter((x) => x !== c), c].join(', '))
  }
  return (
    <div className={`flex min-w-0 ${className}`} style={ancho ? { width: ancho, flex: 'none' } : undefined}>
      <input
        className={`${inputClass} min-w-0 ${numerico ? 'text-right' : ''}`}
        value={valor}
        disabled={disabled}
        title={[title, buscador && !disabled ? 'Ctrl+Intro: lista ordenada' : ''].filter(Boolean).join(' · ') || undefined}
        data-gw-ayuda={buscador && !disabled ? 'Ctrl+Intro: lista ordenada · ···: buscar' : undefined}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (buscador && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            bus.lista(multiple ? null : valor.trim() || null, poner)
          }
        }}
      />
      {buscador && (
        <button type="button" className={botonClass} disabled={disabled} title={`Buscar en ${BUSCADORES[buscador].titulo}`} onClick={() => bus.abrir(poner)}>
          ···
        </button>
      )}
      {bus.dialogo}
    </div>
  )
}

/** Fecha y hora «01/10/2026 0:00:00» con su botón de calendario. */
export function CampoFechaHora({
  valor,
  onChange,
  disabled,
  soloFecha,
  finDeDia,
  className = '',
  alto = 26,
}: {
  valor: string
  onChange: (v: string) => void
  disabled?: boolean
  soloFecha?: boolean
  /** Al poner fecha sin hora, 23:59:59 (campo «hasta»). */
  finDeDia?: boolean
  className?: string
  alto?: number
}) {
  const [cal, setCal] = useState<{ x: number; y: number } | null>(null)
  const [f, h = ''] = valor ? valor.split('T') : ['', '']
  const horaDef = finDeDia ? '23:59:59' : '00:00:00'
  const [horaTxt, setHoraTxt] = useState<string | null>(null)
  const horaVista = horaTxt ?? (h ? `${Number(h.slice(0, 2))}:${h.slice(3, 5)}:${h.slice(6, 8) || '00'}` : '')
  const fijar = (fecha: string | null, hora: string) => onChange(fecha ? `${fecha}T${soloFecha ? horaDef : hora || horaDef}` : '')
  const fs = alto >= 26 ? 'text-[16px]!' : 'text-[12px]!'
  return (
    <div
      className={`flex min-w-0 items-stretch border border-[var(--gw-border)] bg-white ${disabled ? 'opacity-90' : ''} ${className}`}
      style={{ height: alto }}
    >
      <GwDate
        className={`gw-input h-full! min-w-0 flex-none border-0! ${fs} ${alto >= 26 ? 'w-[118px]!' : 'w-[86px]!'}`}
        value={f || null}
        disabled={disabled}
        onChange={(v) => fijar(v, h)}
      />
      {!soloFecha && (
        <input
          className={`gw-input h-full! flex-none border-0! px-1! ${fs} ${alto >= 26 ? 'w-[80px]!' : 'w-[60px]!'}`}
          value={f ? horaVista : ' :  :'}
          disabled={disabled || !f}
          title="Hora (h:mm:ss)"
          onChange={(e) => setHoraTxt(e.target.value)}
          onBlur={() => {
            if (horaTxt == null) return
            const m = /^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?$/.exec(horaTxt.trim())
            setHoraTxt(null)
            if (m && Number(m[1]) < 24) fijar(f, `${pad2(Number(m[1]))}:${pad2(Number(m[2] ?? 0))}:${pad2(Number(m[3] ?? 0))}`)
          }}
        />
      )}
      <span className="flex-1" />
      <button
        type="button"
        className="gw-btn h-full! w-[44px]! flex-none border-0! border-l! px-0!"
        disabled={disabled}
        title="Calendario"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setCal({
            x: Math.min(r.left - 150, window.innerWidth - 200),
            y: r.bottom + 2,
          })
        }}
      >
        <CalendarDays size={14} className="text-[#3a5f9c]" />
      </button>
      {cal &&
        createPortal(
          <Calendario
            x={cal.x}
            y={cal.y}
            valor={f || null}
            onElegir={(iso) => {
              setCal(null)
              fijar(iso, h)
            }}
            onCerrar={() => setCal(null)}
          />,
          document.body,
        )}
    </div>
  )
}

/** Marco con título de GeminisWin (fieldset), letra grande. */
export function LstGrupo({ titulo, children, className = '', disabled }: { titulo?: ReactNode; children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <fieldset className={`min-w-0 border border-[var(--gw-border-light)] px-2 pb-1.5 pt-0 ${disabled ? 'text-[#8a8a8a]' : ''} ${className}`}>
      {titulo != null && <legend className="flex items-center gap-5 px-1 text-[18px] leading-[22px]">{titulo}</legend>}
      {children}
    </fieldset>
  )
}

/**
 * Grupo «Desde/Hasta · Cualquiera · Seleccionar» de GeminisWin con dos códigos (desde/hasta)
 * con «···» y la lista de seleccionados con «···» y el botón de lista.
 */
export function GrupoRango({
  titulo,
  valor,
  onChange,
  buscador,
  anchoCodigo,
  sinSeleccionar,
  className = '',
  disabled,
  nombre,
}: {
  titulo: ReactNode
  valor: Rango
  onChange: (r: Rango) => void
  buscador?: NombreBuscador
  /** Ancho de cada campo desde/hasta (con su «···»); por defecto reparten el hueco. */
  anchoCodigo?: number
  sinSeleccionar?: boolean
  className?: string
  disabled?: boolean
  /** Nombre único del grupo de radios. */
  nombre: string
}) {
  const set = (p: Partial<Rango>) => onChange({ ...valor, ...p })
  return (
    <LstGrupo titulo={titulo} className={className} disabled={disabled}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-[2px]">
        <div className="flex flex-col gap-[2px]">
          <Radio nombre={nombre} label="Desde/Hasta" on={valor.modo === 'desdeHasta'} set={() => set({ modo: 'desdeHasta' })} disabled={disabled} />
          <Radio nombre={nombre} label="Cualquiera" on={valor.modo === 'cualquiera'} set={() => set({ modo: 'cualquiera' })} disabled={disabled} />
          {!sinSeleccionar && (
            <Radio nombre={nombre} label="Seleccionar" on={valor.modo === 'seleccionar'} set={() => set({ modo: 'seleccionar' })} disabled={disabled} />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-[2px]">
          <div className="flex min-w-0 gap-2">
            <CampoCodigo
              valor={valor.desde}
              onChange={(v) => set({ desde: v })}
              buscador={buscador}
              disabled={disabled || valor.modo !== 'desdeHasta'}
              ancho={anchoCodigo}
              className={anchoCodigo ? '' : 'flex-1'}
              title="Desde"
            />
            <CampoCodigo
              valor={valor.hasta}
              onChange={(v) => set({ hasta: v })}
              buscador={buscador}
              disabled={disabled || valor.modo !== 'desdeHasta'}
              ancho={anchoCodigo}
              className={anchoCodigo ? '' : 'flex-1'}
              title="Hasta"
            />
          </div>
          <div className="h-[26px]" />
          {!sinSeleccionar && (
            <div className="flex min-w-0">
              <CampoCodigo
                valor={valor.lista}
                onChange={(v) => set({ lista: v })}
                buscador={buscador}
                disabled={disabled || valor.modo !== 'seleccionar'}
                className="flex-1"
                title="Seleccionados, separados por comas"
                multiple
              />
              <button
                type="button"
                className="gw-btn h-[26px]! w-[46px] flex-none px-0!"
                disabled={disabled || valor.modo !== 'seleccionar' || !valor.lista}
                title="Vaciar la selección"
                onClick={() => set({ lista: '' })}
              >
                <ListPlus size={14} className="text-[#2a7d2a]" />
              </button>
            </div>
          )}
        </div>
      </div>
    </LstGrupo>
  )
}

/** «Fecha y Hora de»: campos de fecha en la leyenda, Desde/Hasta · Cualquiera y dos fechas. */
export function GrupoFecha({
  titulo = 'Fecha y Hora de',
  campos,
  campo,
  onCampo,
  valor,
  onChange,
  soloFecha,
  nombre,
  className = '',
  extra,
}: {
  titulo?: string
  campos?: { value: string; label: string }[]
  campo?: string
  onCampo?: (c: string) => void
  valor: RangoFecha
  onChange: (r: RangoFecha) => void
  soloFecha?: boolean
  nombre: string
  className?: string
  /** Algo más a la derecha (p. ej. «Eliminar todos los Filtros…»). */
  extra?: ReactNode
}) {
  const set = (p: Partial<RangoFecha>) => onChange({ ...valor, ...p })
  const off = valor.modo !== 'desdeHasta'
  return (
    <LstGrupo
      className={className}
      titulo={
        <>
          <span>{titulo}</span>
          {campos?.map((c) => (
            <Radio key={c.value} nombre={`${nombre}-campo`} label={c.label} on={campo === c.value} set={() => onCampo?.(c.value)} />
          ))}
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-[2px]">
          <Radio nombre={nombre} label="Desde/Hasta" on={valor.modo === 'desdeHasta'} set={() => set({ modo: 'desdeHasta' })} />
          <Radio nombre={nombre} label="Cualquiera" on={valor.modo === 'cualquiera'} set={() => set({ modo: 'cualquiera' })} />
        </div>
        <div className="flex min-w-0 flex-1 gap-2 pt-[2px]">
          <CampoFechaHora className="flex-1" valor={valor.desde} onChange={(v) => set({ desde: v })} disabled={off} soloFecha={soloFecha} />
          <CampoFechaHora className="flex-1" valor={valor.hasta} onChange={(v) => set({ hasta: v })} disabled={off} soloFecha={soloFecha} finDeDia />
        </div>
        {extra}
      </div>
    </LstGrupo>
  )
}

/** Botón-casilla de GeminisWin: × roja (no filtra) / ✓ verde (filtra por eso). */
export function BotonOpcion({
  label,
  on,
  set,
  disabled,
  className = '',
  title,
}: {
  label: string
  on: boolean
  set?: (v: boolean) => void
  disabled?: boolean
  className?: string
  title?: string
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={() => set?.(!on)}
      className={`flex h-[32px] min-w-0 items-center justify-center gap-0.5 border border-[var(--gw-border)] bg-[#f3f3f3] px-1.5 text-[17px] hover:bg-[#e5f1fb] disabled:text-[#9a9a9a] disabled:hover:bg-[#f3f3f3] ${className}`}
    >
      {on ? (
        <Check size={14} strokeWidth={3} className={disabled ? 'text-[#9a9a9a]' : 'text-[#2a9d2a]'} />
      ) : (
        <X size={14} strokeWidth={3} className={disabled ? 'text-[#9a9a9a]' : 'text-[#c42b1c]'} />
      )}
      <span className="truncate">{label}</span>
    </button>
  )
}

/** Botón de estado sin icono que queda «hundido» al activarlo (Estado de Reparaciones). */
export function BotonPulsado({
  label,
  on,
  set,
  className = '',
  title,
}: {
  label: string
  on: boolean
  set: (v: boolean) => void
  className?: string
  title?: string
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={() => set(!on)}
      className={`flex h-[34px] min-w-0 items-center justify-center border px-2 text-[17px] ${
        on
          ? 'border-[#5a5a5a] border-b-white border-r-white bg-[#dcdcdc] font-bold shadow-[inset_1px_1px_2px_rgba(0,0,0,0.35)]'
          : 'border-[var(--gw-border)] bg-[#f3f3f3] hover:bg-[#e5f1fb]'
      } ${className}`}
    >
      <span className="truncate">{label}</span>
    </button>
  )
}

/* =====================================================================
 * Ventana grande de filtros
 * ===================================================================== */

export type Destino = 'pantalla' | 'impresora' | 'examinar' | 'pdf'

const DESTINOS: { k: Destino; label: string; icono: ReactNode }[] = [
  { k: 'pantalla', label: 'Pantalla', icono: <Monitor size={14} /> },
  { k: 'impresora', label: 'Impresora', icono: <Printer size={14} /> },
  { k: 'examinar', label: 'Examinar', icono: <Search size={14} /> },
  {
    k: 'pdf',
    label: 'Doc. PDF',
    icono: <FileText size={14} className="text-[#c42b1c]" />,
  },
]

export function ListadoVentana({
  informes,
  informe,
  onInforme,
  cabeceraExtra,
  cabeceraDebajo,
  ordenes,
  orden,
  onOrden,
  destino,
  onDestino,
  onProcesar,
  procesando,
  children,
}: {
  informes: { value: string; label: string }[]
  informe: string
  onInforme: (v: string) => void
  /** Casillas junto al título «Informe a procesar» («Listar sin Igics»…). */
  cabeceraExtra?: ReactNode
  /** Fila bajo el combo de informe («Agrupar Artículos por…», «Emitir informe simple»). */
  cabeceraDebajo?: ReactNode
  ordenes: { value: string; label: string }[]
  orden: string
  onOrden: (v: string) => void
  destino: Destino
  onDestino: (d: Destino) => void
  onProcesar: () => void
  procesando?: boolean
  children: ReactNode
}) {
  const navigate = useNavigate()
  const cerrar = () => navigate('/')
  return (
    <div
      className="flex h-full min-h-[600px] min-w-[1180px] flex-col gap-1"
      onKeyDown={(e) => {
        if (e.key === 'F4' && !e.defaultPrevented && !e.altKey) {
          e.preventDefault()
          cerrar()
        }
      }}
    >
      <div className="flex flex-none gap-2">
        <fieldset className="min-w-0 flex-[1.45] border border-[var(--gw-border-light)] px-2 pb-1.5 pt-0">
          <legend className="flex items-end gap-10 px-1 text-[19px] font-bold leading-[22px]">
            <span>Informe a procesar</span>
            {cabeceraExtra && <span className="flex items-center gap-10 text-[18px]">{cabeceraExtra}</span>}
          </legend>
          <select className={`${LST_INPUT} h-[30px]! text-[18px]!`} value={informe} onChange={(e) => onInforme(e.target.value)}>
            {informes.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
          {cabeceraDebajo && <div className="mt-1 flex items-center gap-8 text-[17px]">{cabeceraDebajo}</div>}
        </fieldset>
        <fieldset className="min-w-0 flex-1 border border-[var(--gw-border-light)] px-2 pb-1.5 pt-0">
          <legend className="px-1 text-[19px] font-bold leading-[22px]">Orden de salida</legend>
          <div className="flex gap-1">
            <select className={`${LST_INPUT} h-[30px]! text-[18px]!`} value={orden} onChange={(e) => onOrden(e.target.value)}>
              {ordenes.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`${LST_BTN} h-[30px]! w-[56px]!`}
              disabled
              title="Orden personalizado (expresión de FoxPro): no disponible en el ERP"
            >
              ···
            </button>
          </div>
        </fieldset>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border border-[var(--gw-border)] px-1.5 py-1">
        <div className="flex flex-col gap-1">{children}</div>
      </div>
      <div className="flex flex-none items-stretch gap-2 border border-[var(--gw-border-light)] p-1">
        <div className="flex w-[220px] flex-none items-center px-1 text-[17px] leading-[20px]">Pulse F4 para cerrar la ventana</div>
        <div className="flex flex-1 border border-[var(--gw-border-light)] p-[3px]">
          {DESTINOS.map((d) => (
            <button
              key={d.k}
              type="button"
              onClick={() => onDestino(d.k)}
              className={`flex h-[42px] flex-1 items-center justify-center gap-1.5 border text-[18px] ${
                destino === d.k
                  ? 'border-[#8a8a8a] border-b-white border-r-white bg-[#f7f7f7] shadow-[inset_1px_1px_2px_rgba(0,0,0,0.3)]'
                  : 'border-[var(--gw-border)] bg-[#ececec] hover:bg-[#e5f1fb]'
              }`}
            >
              {d.icono}
              {d.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onProcesar}
          disabled={procesando}
          className="flex h-[50px] w-[180px] flex-none items-center justify-center gap-1.5 border border-[var(--gw-border)] bg-[#f3f3f3] text-[19px] hover:bg-[#e5f1fb] disabled:text-[#8a8a8a]"
        >
          <Check size={15} strokeWidth={3} className="text-[#2a9d2a]" />
          {procesando ? 'Procesando…' : 'Procesar'}
        </button>
        <button
          type="button"
          onClick={cerrar}
          className="flex h-[50px] w-[180px] flex-none items-center justify-center gap-1.5 border border-[var(--gw-border)] bg-[#f3f3f3] text-[19px] hover:bg-[#e5f1fb]"
        >
          <DoorOpen size={15} className="text-[#7a5a1a]" />
          Cerrar
        </button>
      </div>
    </div>
  )
}

/* =====================================================================
 * Diálogo pequeño (listados antiguos: Presupuestos, Tarjetas, Divisas, Cajón)
 * ===================================================================== */

/** Pinta `children` sobre el escritorio gris (tapa la ventana MDI), centrado, como en GeminisWin. */
function SobreEscritorio({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  useLayoutEffect(() => {
    const medir = () => {
      const win = ref.current?.closest('.inset-1') as HTMLElement | null
      const mdi = (win?.parentElement ?? null) as HTMLElement | null
      const r = (mdi ?? document.body).getBoundingClientRect()
      setRect({ left: r.left, top: r.top, width: r.width, height: r.height })
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])
  return (
    <div ref={ref}>
      {rect &&
        createPortal(
          <div className="fixed z-30 flex items-center justify-center bg-[var(--gw-mdi)]" style={rect}>
            <img
              src={`${import.meta.env.BASE_URL}marca/logo-ofipapel.png`}
              alt=""
              className="pointer-events-none absolute bottom-4 right-4 w-[260px] select-none opacity-90"
              draggable={false}
            />
            <div className="relative">{children}</div>
          </div>,
          document.body,
        )}
    </div>
  )
}

/** Clases de los diálogos pequeños grises (Windows clásico, texto azul en los campos). */
export const DLG = {
  input:
    'h-[17px] border border-[#7f7f7f] border-b-white border-r-white bg-white px-[2px] text-[12px] font-bold text-[#0000e0] outline-none focus:bg-[#0078d7] focus:text-white disabled:text-[#0000e0]',
  marco: 'border border-[#ffffff] border-b-[#808080] border-r-[#808080] bg-[#ece9d8] px-1.5 py-1',
  etiqueta: 'text-[12px] font-bold text-black',
  /** Para GwDate dentro de un diálogo pequeño. */
  fecha: 'h-[17px]! w-[72px]! flex-none border-[#7f7f7f]! px-[2px]! text-[12px]! font-bold text-[#0000e0]!',
  boton:
    'h-[22px] min-w-[44px] border border-[#ffffff] border-b-[#404040] border-r-[#404040] bg-[#ece9d8] px-1.5 text-[12px] font-bold underline-offset-1 active:border-[#404040] active:border-b-white active:border-r-white',
}

export function DialogoListado({
  titulo,
  ancho,
  children,
  onAceptar,
  textoCancelar = 'Cancelar',
  procesando,
}: {
  titulo: string
  ancho: number
  children: ReactNode
  onAceptar: () => void
  textoCancelar?: string
  procesando?: boolean
}) {
  const navigate = useNavigate()
  const cerrar = () => navigate('/')
  return (
    <SobreEscritorio>
      <div
        className="flex flex-col border border-[#404040] bg-[#d4d0c8] shadow-[2px_2px_6px_rgba(0,0,0,0.4)]"
        style={{ width: ancho }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cerrar()
          else if (e.altKey && e.key.toLowerCase() === 'a') {
            e.preventDefault()
            onAceptar()
          } else if (e.altKey && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 's')) {
            e.preventDefault()
            cerrar()
          }
        }}
      >
        <div className="flex h-[20px] select-none items-center gap-1 bg-gradient-to-b from-[#e3e9f3] to-[#c6d3e6] px-1 text-[12px]">
          <img src={`${import.meta.env.BASE_URL}marca/icono-32.png`} alt="" width={14} height={14} draggable={false} />
          <span className="flex-1 truncate">{titulo}</span>
          <span className="flex h-[14px] w-[20px] items-center justify-center border border-[#9aa8bb] bg-[#e9eef6] text-[9px]">_</span>
          <span className="flex h-[14px] w-[20px] items-center justify-center border border-[#9aa8bb] bg-[#e9eef6] text-[9px]">□</span>
          <button
            type="button"
            onClick={cerrar}
            title="Cerrar"
            className="flex h-[14px] w-[20px] items-center justify-center border border-[#9aa8bb] bg-[#e9eef6]"
          >
            <X size={9} strokeWidth={3} />
          </button>
        </div>
        <div className="flex flex-col gap-1.5 p-1.5 pb-2 text-[12px]">
          {children}
          <div className="flex justify-center gap-1.5 pt-1">
            <button type="button" className={DLG.boton} onClick={onAceptar} disabled={procesando}>
              <u>A</u>ceptar
            </button>
            <button type="button" className={DLG.boton} onClick={cerrar}>
              <u>{textoCancelar[0]}</u>
              {textoCancelar.slice(1)}
            </button>
          </div>
        </div>
      </div>
    </SobreEscritorio>
  )
}

/** Código + nombre de los diálogos pequeños («008 ROBERTO …»): F2/Ctrl+Intro o doble clic buscan. */
export function DlgCodigoNombre({
  valor,
  onChange,
  buscador,
  anchoCodigo = 30,
  anchoNombre = 160,
  title,
}: {
  valor: string
  onChange: (v: string) => void
  buscador: NombreBuscador
  anchoCodigo?: number
  anchoNombre?: number
  title?: string
}) {
  const bus = useBuscador(buscador)
  const nombre = useNombreDe(buscador, valor)
  return (
    <div className="flex gap-[3px]">
      <input
        className={DLG.input}
        style={{ width: anchoCodigo }}
        value={valor}
        title={`${title ?? ''} · Ctrl+Intro o doble clic: buscar`}
        data-gw-ayuda="Ctrl+Intro o doble clic: buscar"
        onChange={(e) => onChange(e.target.value)}
        onDoubleClick={() => bus.abrir(onChange)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) || e.key === 'F2') {
            e.preventDefault()
            bus.lista(valor.trim() || null, onChange)
          }
        }}
      />
      <input className={DLG.input} style={{ width: anchoNombre }} value={nombre} readOnly tabIndex={-1} title={title} />
      {bus.dialogo}
    </div>
  )
}

export function DlgRadio({ nombre, label, on, set }: { nombre: string; label: ReactNode; on: boolean; set: () => void }) {
  return (
    <label className="flex select-none items-center gap-1.5 whitespace-nowrap text-[12px] font-bold">
      <input type="radio" name={nombre} className="m-0 h-[11px] w-[11px] accent-[#0078d7]" checked={on} onChange={set} />
      <span>{label}</span>
    </label>
  )
}

/** Pantalla / Impresora de los diálogos pequeños. */
export function DlgDestino({ valor, onChange, nombre }: { valor: 'pantalla' | 'impresora'; onChange: (v: 'pantalla' | 'impresora') => void; nombre: string }) {
  return (
    <div className={`${DLG.marco} flex flex-col gap-1`}>
      <DlgRadio
        nombre={nombre}
        label={
          <>
            <u>P</u>antalla
          </>
        }
        on={valor === 'pantalla'}
        set={() => onChange('pantalla')}
      />
      <DlgRadio
        nombre={nombre}
        label={
          <>
            <u>I</u>mpresora
          </>
        }
        on={valor === 'impresora'}
        set={() => onChange('impresora')}
      />
    </div>
  )
}

/* =====================================================================
 * Resultado: vista preliminar, impresión y CSV
 * ===================================================================== */

export type TipoColumna = 'texto' | 'num' | 'entero' | 'fecha'

export interface ColumnaInforme {
  key: string
  titulo: string
  tipo?: TipoColumna
  /** Decimales de las columnas numéricas (por defecto 2). */
  dec?: number
  /** Ancho relativo en la hoja (px a 100%). */
  ancho?: number
  /** Sale en las filas de subtotal/total (por defecto, todas las numéricas). */
  suma?: boolean
}

export type FilaInforme = Record<string, unknown> & {
  nivel: number
  grupo: string | null
  grupo_desc: string | null
}

export interface DefInforme {
  titulo: string
  /** Líneas de «filtros aplicados». */
  filtros: (string | null | undefined | false)[]
  columnas: ColumnaInforme[]
  cargar: () => PromiseLike<{
    data: unknown
    error: { message: string } | null
  }>
  /** Sin captura del informe impreso de GeminisWin: se avisa en la vista preliminar. */
  sinCaptura?: boolean
  /** Aviso fijo (p. ej. «el ERP no registra cobros en divisas»). */
  aviso?: string
  soloTotales?: boolean
  apaisado?: boolean
}

interface Resultado extends DefInforme {
  filas: FilaInforme[]
  destino: Destino
  generado: Date
}

function celda(v: unknown, c: ColumnaInforme): string {
  if (v == null || v === '') return ''
  const t = c.tipo ?? 'texto'
  if (t === 'num') return formatGw(Number(v), c.dec ?? 2)
  if (t === 'entero') return formatGw(Number(v), 0)
  if (t === 'fecha') return fechaEs(String(v))
  return String(v)
}

function celdaCsv(v: unknown, c: ColumnaInforme): string {
  if (v == null || v === '') return ''
  const t = c.tipo ?? 'texto'
  if (t === 'num')
    return Number(v)
      .toFixed(c.dec ?? 2)
      .replace('.', ',')
  if (t === 'entero') return String(Math.round(Number(v)))
  if (t === 'fecha') return fechaEs(String(v))
  return String(v)
}

const esNum = (c: ColumnaInforme) => c.tipo === 'num' || c.tipo === 'entero'
const sumable = (c: ColumnaInforme) => c.suma ?? esNum(c)

/** Filas tal como se pintan: cabecera de grupo, detalle, subtotal y total general. */
type Linea =
  | { tipo: 'grupo'; texto: string }
  | { tipo: 'detalle'; fila: FilaInforme }
  | { tipo: 'subtotal'; texto: string; fila: FilaInforme }
  | { tipo: 'total'; fila: FilaInforme }

function lineasDe(filas: FilaInforme[], soloTotales: boolean): Linea[] {
  const out: Linea[] = []
  const conGrupos = filas.some((f) => f.nivel === 0 && (f.grupo ?? '') !== '')
  let actual: string | null = null
  for (const f of filas) {
    if (f.nivel === 0) {
      if (soloTotales) continue
      if (conGrupos && f.grupo !== actual) {
        actual = f.grupo
        out.push({ tipo: 'grupo', texto: f.grupo_desc || f.grupo || '' })
      }
      out.push({ tipo: 'detalle', fila: f })
    } else if (f.nivel === 1) {
      if (conGrupos)
        out.push({
          tipo: 'subtotal',
          texto: `Total ${f.grupo_desc || f.grupo || ''}`,
          fila: f,
        })
    } else out.push({ tipo: 'total', fila: f })
  }
  return out
}

export function exportarCsv(r: { titulo: string; filtros: DefInforme['filtros']; columnas: ColumnaInforme[]; filas: FilaInforme[]; soloTotales?: boolean }) {
  const esc = (s: string) => (/[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const filas: string[][] = []
  filas.push([r.titulo])
  for (const f of r.filtros) if (f) filas.push([f])
  filas.push([])
  filas.push(r.columnas.map((c) => c.titulo))
  for (const l of lineasDe(r.filas, !!r.soloTotales)) {
    if (l.tipo === 'grupo') filas.push([l.texto])
    else if (l.tipo === 'detalle') filas.push(r.columnas.map((c) => celdaCsv(l.fila[c.key], c)))
    else {
      const texto = l.tipo === 'total' ? 'TOTAL GENERAL' : l.texto
      filas.push(r.columnas.map((c, i) => (i === 0 ? texto : sumable(c) ? celdaCsv(l.fila[c.key], c) : '')))
    }
  }
  const csv = '﻿' + filas.map((f) => f.map(esc).join(';')).join('\r\n') + '\r\n'
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  const slug = r.titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  a.href = URL.createObjectURL(blob)
  a.download = `${slug}_${hoyIso()}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

let empresaCache: string | null = null
function useEmpresa() {
  const [nombre, setNombre] = useState(empresaCache ?? '')
  useEffect(() => {
    if (empresaCache != null) return
    supabase
      .from('empresa')
      .select('nombre')
      .order('codigo')
      .limit(1)
      .then(({ data }) => {
        empresaCache = (data?.[0]?.nombre as string | undefined) ?? ''
        setNombre(empresaCache)
      })
  }, [])
  return nombre
}

/** La hoja del informe (pantalla e impresión). */
function HojaInforme({ r, empresa }: { r: Resultado; empresa: string }) {
  const lineas = lineasDe(r.filas, !!r.soloTotales)
  const hayDatos = r.filas.some((f) => f.nivel === 0)
  const filtros = r.filtros.filter(Boolean) as string[]
  const n = r.columnas.length
  return (
    <div className="gw-hoja-informe text-[11px] leading-[14px] text-black">
      <div className="flex items-end justify-between border-b-2 border-black pb-1">
        <div className="font-bold">{empresa}</div>
        <div className="text-right text-[10px]">
          Fecha: {r.generado.toLocaleDateString('es-ES')} {r.generado.toLocaleTimeString('es-ES')}
        </div>
      </div>
      <div className="py-1.5 text-center text-[15px] font-bold">{r.titulo}</div>
      {filtros.length > 0 && (
        <div className="mb-1.5 border border-[#999] px-1.5 py-1 text-[10px]">
          {filtros.map((f, i) => (
            <div key={i}>{f}</div>
          ))}
        </div>
      )}
      {r.aviso && <div className="mb-1.5 border border-[#c42b1c] px-1.5 py-1 text-[11px] font-bold text-[#c42b1c]">{r.aviso}</div>}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {r.columnas.map((c) => (
              <th
                key={c.key}
                className={`border-b border-black px-1 py-[2px] font-bold ${esNum(c) ? 'text-right' : 'text-left'}`}
                style={c.ancho ? { width: c.ancho } : undefined}
              >
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!hayDatos && (
            <tr>
              <td colSpan={n} className="py-3 text-center italic">
                No hay datos que cumplan los filtros.
              </td>
            </tr>
          )}
          {hayDatos &&
            lineas.map((l, i) => {
              if (l.tipo === 'grupo')
                return (
                  <tr key={i} className="gw-informe-grupo">
                    <td colSpan={n} className="px-1 pt-2 font-bold underline">
                      {l.texto}
                    </td>
                  </tr>
                )
              if (l.tipo === 'detalle')
                return (
                  <tr key={i}>
                    {r.columnas.map((c) => (
                      <td key={c.key} className={`px-1 py-[1px] align-top ${esNum(c) ? 'text-right tabular-nums' : ''}`}>
                        {celda(l.fila[c.key], c)}
                      </td>
                    ))}
                  </tr>
                )
              const total = l.tipo === 'total'
              // El texto del total ocupa la primera columna y las siguientes que no suman (así no
              // ensancha la primera columna con «Total Cliente …»).
              let ocupa = 1
              while (ocupa < n - 1 && !sumable(r.columnas[ocupa])) ocupa++
              return (
                <tr key={i} className={total ? 'border-t-2 border-black font-bold' : 'border-t border-[#666] font-bold'}>
                  <td colSpan={ocupa} className="px-1 py-[2px]">
                    {total ? 'TOTAL GENERAL' : l.texto}
                  </td>
                  {r.columnas.slice(ocupa).map((c) => (
                    <td key={c.key} className={`px-1 py-[2px] ${esNum(c) ? 'text-right tabular-nums' : ''}`}>
                      {sumable(c) ? celda(l.fila[c.key], c) : ''}
                    </td>
                  ))}
                </tr>
              )
            })}
        </tbody>
      </table>
    </div>
  )
}

/** Rejilla plana («Examinar» de GeminisWin: el cursor del informe sin formato). */
function RejillaInforme({ r }: { r: Resultado }) {
  const det = r.filas.filter((f) => f.nivel === 0)
  return (
    <table className="gw-grid">
      <thead className="sticky top-0">
        <tr>
          {(det.some((f) => f.grupo) ? [{ key: 'grupo_desc', titulo: 'Grupo' } as ColumnaInforme] : []).concat(r.columnas).map((c) => (
            <th key={c.key} className={esNum(c) ? 'text-right!' : ''}>
              {c.titulo}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {det.map((f, i) => (
          <tr key={i}>
            {(det.some((x) => x.grupo) ? [{ key: 'grupo_desc', titulo: 'Grupo' } as ColumnaInforme] : []).concat(r.columnas).map((c) => (
              <td key={c.key} className={esNum(c) ? 'text-right tabular-nums' : 'whitespace-nowrap'}>
                {celda(f[c.key], c)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function VistaInforme({ r, onCerrar }: { r: Resultado; onCerrar: () => void }) {
  const empresa = useEmpresa()
  const [zoom, setZoom] = useState(100)
  const imprimir = () => window.print()
  useEffect(() => {
    if (r.destino !== 'impresora' && r.destino !== 'pdf') return
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [r])
  const examinar = r.destino === 'examinar'
  const detalle = r.filas.filter((f) => f.nivel === 0).length
  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-[60] flex bg-black/25 p-3" onKeyDown={(e) => e.key === 'Escape' && onCerrar()}>
          <GwWindow
            title={`${examinar ? 'Examinar' : 'Vista preliminar'} - ${r.titulo}`}
            onClose={onCerrar}
            className="h-full w-full [&>div:last-child]:min-h-0"
          >
            <div className="flex h-full min-h-0 flex-col gap-1">
              <div className="flex flex-none flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  className="gw-btn h-[30px]! text-[14px]!"
                  onClick={imprimir}
                  title="Imprimir en A4 (o Guardar como PDF en el diálogo de impresión)"
                >
                  <Printer size={15} /> Imprimir
                </button>
                <button
                  type="button"
                  className="gw-btn h-[30px]! text-[14px]!"
                  onClick={() => exportarCsv(r)}
                  title="CSV con «;» y coma decimal, se abre directamente en Excel"
                >
                  <FileDown size={15} className="text-[#1d6f42]" /> Exportar a Excel (CSV)
                </button>
                {!examinar && (
                  <select className="gw-input h-[30px]! w-[90px]! text-[14px]!" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} title="Zoom">
                    {[75, 100, 125, 150].map((z) => (
                      <option key={z} value={z}>
                        {z}%
                      </option>
                    ))}
                  </select>
                )}
                <span className="gw-label px-2 text-[13px]!">
                  {detalle} {detalle === 1 ? 'línea' : 'líneas'}
                  {r.destino === 'pdf' && ' · En el diálogo de impresión elija «Guardar como PDF»'}
                </span>
                <span className="flex-1" />
                {r.sinCaptura && (
                  <span
                    className="border border-[#d6a400] bg-[#fff6d5] px-2 py-[3px] text-[12px] text-[#6b5200]"
                    title="Las capturas de GeminisWin solo muestran la ventana de filtros"
                  >
                    Sin captura del informe impreso de GeminisWin: columnas a confirmar con Luis
                  </span>
                )}
                <button type="button" className="gw-btn h-[30px]! text-[14px]!" onClick={onCerrar}>
                  <DoorOpen size={15} /> Cerrar
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto border border-[var(--gw-border)] bg-[#8c8c8c] p-3">
                {examinar ? (
                  <div className="bg-white">
                    <RejillaInforme r={r} />
                  </div>
                ) : (
                  <div
                    className="mx-auto bg-white p-[10mm] shadow-[2px_2px_8px_rgba(0,0,0,0.5)]"
                    style={{
                      width: r.apaisado ? '297mm' : '210mm',
                      minHeight: r.apaisado ? '210mm' : '297mm',
                      zoom: zoom / 100,
                    }}
                  >
                    <HojaInforme r={r} empresa={empresa} />
                  </div>
                )}
              </div>
            </div>
          </GwWindow>
        </div>,
        document.body,
      )}
      {createPortal(
        <div className="gw-listado-impresion">
          <style>{`@page { size: A4 ${r.apaisado ? 'landscape' : 'portrait'}; margin: 10mm; }`}</style>
          <HojaInforme r={r} empresa={empresa} />
        </div>,
        document.body,
      )}
    </>
  )
}

/**
 * Estado del resultado de un listado: `procesar(def, destino)` llama a la función SQL y abre la
 * vista preliminar (o la imprime, o la rejilla de Examinar). Pintar `vista` y `error`.
 */
export function useInforme() {
  const [res, setRes] = useState<Resultado | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function procesar(def: DefInforme, destino: Destino) {
    setError(null)
    setCargando(true)
    try {
      const { data, error: e } = await def.cargar()
      if (e) throw new Error(e.message)
      setRes({
        ...def,
        filas: (data ?? []) as FilaInforme[],
        destino,
        generado: new Date(),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }
  const vista = res ? <VistaInforme r={res} onCerrar={() => setRes(null)} /> : null
  return { procesar, cargando, error, vista, resultado: res }
}
