import { useState, type ReactNode } from 'react'
import { Check, ListPlus, Pencil, Printer, Search, X } from 'lucide-react'
import { GwDate, GwInput, GwLookupButton, GwRadio, GwSelect } from './index'
import { GwLookupDialog, type GwLookupColumn } from './GwLookupDialog'

// Piezas de los informes de artículos de GeminisWin (capturas 06-20 Listados de Artículos,
// 06-23 Listados de Movimientos de los Artículos, 06-24 Listados de Etiquetas): grupos
// «Desde/Hasta · Cualquiera · Seleccionar», «Elegir y/o Filtrar Según …» (campo + condición +
// dos valores), «Elegir Almacén y/o Filtrar por el Stock», «Art. Anulados», «Características del
// Artículo» y la barra Pantalla · Impresora · Examinar · Doc. PDF · Procesar · Cerrar.
// El estado se manda tal cual (aJson) a las funciones fn_informe_* de la base de datos.

export const L = 'text-[15px] leading-[18px]'
export const IN = '!h-[26px] !text-[15px]'

export type ModoRango = 'rango' | 'cualquiera' | 'seleccionar'
export interface Rango {
  modo: ModoRango
  desde: string
  hasta: string
  /** Códigos separados por comas (Seleccionar). */
  lista: string
}
export interface CampoOp {
  campo: string
  op: string
  v1: string
  v2: string
}
export interface FiltroArticulos {
  por: 'articulo' | 'familia'
  nivel: 1 | 2 | 3
  articulos: Rango
  alm_stock: { almacen: string; op: string; v1: string; v2: string }
  texto: CampoOp
  pvp: { nivel: number; op: string; v1: string; v2: string }
  coste: CampoOp
  campo: CampoOp
  fecha1: CampoOp
  fecha2: CampoOp
  almacenes: Rango
  proveedor: Rango & { tipo: 'principal' | 'articulo' | 'codigo' }
  anulados: { no: boolean; si: boolean }
  caract: Record<string, boolean>
}

export const rangoVacio = (modo: ModoRango = 'cualquiera'): Rango => ({ modo, desde: '', hasta: '', lista: '' })
const op = (campo: string): CampoOp => ({ campo, op: 'no', v1: '', v2: '' })

export function filtroInicial(p: Partial<FiltroArticulos> = {}): FiltroArticulos {
  return {
    por: 'articulo',
    nivel: 1,
    articulos: rangoVacio('rango'),
    alm_stock: { almacen: '', op: 'no', v1: '', v2: '' },
    texto: op('codigo_interno'),
    pvp: { nivel: 0, op: 'no', v1: '', v2: '' },
    coste: op('precio_liquidado'),
    campo: op('marca_codigo'),
    fecha1: op('ultima_compra_fecha'),
    fecha2: op('ultima_venta_fecha'),
    almacenes: rangoVacio(),
    proveedor: { ...rangoVacio(), tipo: 'principal' },
    anulados: { no: true, si: false },
    caract: {},
    ...p,
  }
}

const lista = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
const rangoJson = (r: Rango) => ({ modo: r.modo, desde: r.desde.trim(), hasta: r.hasta.trim(), lista: lista(r.lista) })

/** Estado de pantalla → jsonb de fn_informe_* (las listas como arrays). */
export function aJson(f: FiltroArticulos): Record<string, unknown> {
  return {
    ...f,
    articulos: rangoJson(f.articulos),
    almacenes: rangoJson(f.almacenes),
    proveedor: { ...rangoJson(f.proveedor), tipo: f.proveedor.tipo },
  }
}
export { rangoJson }

// ───────────── Condiciones («No Filtrar», «Igual a»…) ─────────────
export const OPERADORES: { v: string; l: string; tipos?: string[] }[] = [
  { v: 'no', l: 'No Filtrar' },
  { v: 'igual', l: 'Igual a' },
  { v: 'distinto', l: 'Distinto de' },
  { v: 'mayor', l: 'Mayor que' },
  { v: 'mayor_igual', l: 'Mayor o Igual que' },
  { v: 'menor', l: 'Menor que' },
  { v: 'menor_igual', l: 'Menor o Igual que' },
  { v: 'entre', l: 'Entre' },
  { v: 'empieza', l: 'Empieza por', tipos: ['texto'] },
  { v: 'contiene', l: 'Contiene', tipos: ['texto'] },
  { v: 'no_contiene', l: 'No Contiene', tipos: ['texto'] },
  { v: 'vacio', l: 'Vacío' },
  { v: 'no_vacio', l: 'No Vacío' },
  { v: 'lista', l: 'Múltiple (lista)' },
]

export type TipoCampo = 'texto' | 'num' | 'fecha'
export interface CampoDef {
  v: string
  l: string
  tipo: TipoCampo
  lookup?: string
}

export const CAMPOS_CODIGO: CampoDef[] = [
  { v: 'codigo_interno', l: 'Cod. Interno', tipo: 'texto', lookup: 'articulo' },
  { v: 'descripcion', l: 'Descripción', tipo: 'texto' },
  { v: 'codigo_venta', l: 'Cod. Venta', tipo: 'texto' },
  { v: 'codigo_compra_habitual', l: 'Cod. Compra', tipo: 'texto' },
  { v: 'codigo_barras_principal', l: 'Cod. Barras', tipo: 'texto' },
  { v: 'descripcion_corta', l: 'Descripción Corta', tipo: 'texto' },
  { v: 'campo_libre', l: 'Campo Libre', tipo: 'texto' },
  { v: 'talla', l: 'Talla', tipo: 'texto' },
  { v: 'color', l: 'Color', tipo: 'texto' },
  { v: 'ubicacion_1', l: 'Ubicación 1', tipo: 'texto' },
  { v: 'ubicacion_2', l: 'Ubicación 2', tipo: 'texto' },
]

export const CAMPOS_COSTE: CampoDef[] = [
  { v: 'precio_liquidado', l: 'Coste Líquido', tipo: 'num' },
  { v: 'coste_neto', l: 'Coste Neto', tipo: 'num' },
  { v: 'coste_bruto', l: 'Coste Bruto', tipo: 'num' },
  { v: 'coste_puro', l: 'Coste Puro Prov.', tipo: 'num' },
  { v: 'precio_medio_compra', l: 'Precio Liq. Medio', tipo: 'num' },
  { v: 'coste_local', l: 'Proveedor Local', tipo: 'num' },
]

export const CAMPOS_VARIOS: CampoDef[] = [
  { v: 'marca_codigo', l: 'Marca', tipo: 'texto', lookup: 'marca' },
  { v: 'familia_codigo', l: 'Familia', tipo: 'texto', lookup: 'familia' },
  { v: 'plantilla_tarifa_codigo', l: 'Plantilla de Tarifas', tipo: 'texto', lookup: 'plantilla_tarifa' },
  { v: 'proveedor_habitual_codigo', l: 'Proveedor', tipo: 'texto', lookup: 'proveedor' },
  { v: 'igic_pct', l: '% IGIC', tipo: 'num' },
  { v: 'unidad_medida', l: 'Unidad de Medida', tipo: 'texto' },
  { v: 'unidades_por_caja', l: 'Und. Caja', tipo: 'num' },
  { v: 'cajas_por_bulto', l: 'Caj. Bulto', tipo: 'num' },
  { v: 'stock_minimo', l: 'Stock Mínimo', tipo: 'num' },
  { v: 'stock_maximo', l: 'Stock Máximo', tipo: 'num' },
  { v: 'pedido_recomendado', l: 'Pedido Recomendado', tipo: 'num' },
  { v: 'control_lotes', l: 'Control Lotes', tipo: 'num' },
  { v: 'tipo_articulo', l: 'Tipo de Artículo', tipo: 'num' },
  { v: 'garantia_meses', l: 'Garantía (meses)', tipo: 'num' },
  { v: 'descuento_maximo_cliente_pct', l: 'Dto. Máximo', tipo: 'num' },
  { v: 'web_categoria', l: 'Categoría Web', tipo: 'texto' },
  { v: 'web_fabricante', l: 'Fabricante Web', tipo: 'texto' },
]

export const CAMPOS_FECHA: CampoDef[] = [
  { v: 'ultima_compra_fecha', l: 'Fecha Última Compra', tipo: 'fecha' },
  { v: 'ultima_venta_fecha', l: 'Fecha Última Venta', tipo: 'fecha' },
  { v: 'fecha_ultima_modificacion_pvp', l: 'F. Últ. Mod. de precios', tipo: 'fecha' },
  { v: 'fecha_alta', l: 'Fecha de Alta', tipo: 'fecha' },
  { v: 'fecha_baja', l: 'Fecha de Baja', tipo: 'fecha' },
  { v: 'fecha_prevista_venta', l: 'Fecha Prevista Venta', tipo: 'fecha' },
  { v: 'web_fecha_baja', l: 'Fecha Baja Web', tipo: 'fecha' },
]

export const NIVELES_PVP = ['General', 'MAYOR  M-1', 'MAYOR  M-2', 'MAYOR  M-3', 'Tarifa Dcto -4', 'Tarifa Dcto -5', 'Tarifa Dcto -6']

// ───────────── Buscadores «···» ─────────────
interface LookupDef {
  title: string
  table: string
  columns: GwLookupColumn[]
  search: string[]
  order: string
  key: string
}
export const LOOKUPS: Record<string, LookupDef> = {
  articulo: {
    title: 'Artículos',
    table: 'articulo',
    columns: [
      { key: 'codigo_interno', label: 'Código', width: 130 },
      { key: 'descripcion', label: 'Descripción' },
    ],
    search: ['codigo_interno', 'descripcion', 'codigo_barras_principal'],
    order: 'codigo_interno',
    key: 'codigo_interno',
  },
  familia: {
    title: 'Familias',
    table: 'familia',
    columns: [
      { key: 'codigo', label: 'Código', width: 100 },
      { key: 'descripcion', label: 'Descripción' },
    ],
    search: ['codigo', 'descripcion'],
    order: 'codigo',
    key: 'codigo',
  },
  marca: { title: 'Marcas', table: 'marca', columns: [{ key: 'codigo', label: 'Marca' }], search: ['codigo'], order: 'codigo', key: 'codigo' },
  plantilla_tarifa: {
    title: 'Plantillas de Tarifas',
    table: 'plantilla_tarifa',
    columns: [
      { key: 'codigo', label: 'Código', width: 100 },
      { key: 'descripcion', label: 'Descripción' },
    ],
    search: ['codigo', 'descripcion'],
    order: 'codigo',
    key: 'codigo',
  },
  proveedor: {
    title: 'Proveedores',
    table: 'proveedor',
    columns: [
      { key: 'codigo', label: 'Código', width: 90 },
      { key: 'nombre', label: 'Nombre' },
    ],
    search: ['codigo', 'nombre'],
    order: 'codigo',
    key: 'codigo',
  },
  cliente: {
    title: 'Clientes',
    table: 'cliente',
    columns: [
      { key: 'codigo', label: 'Código', width: 90 },
      { key: 'nombre', label: 'Nombre' },
    ],
    search: ['codigo', 'nombre'],
    order: 'codigo',
    key: 'codigo',
  },
  vendedor: {
    title: 'Vendedores',
    table: 'vendedor',
    columns: [
      { key: 'codigo', label: 'Código', width: 90 },
      { key: 'nombre', label: 'Nombre' },
    ],
    search: ['codigo', 'nombre'],
    order: 'codigo',
    key: 'codigo',
  },
  empleado: {
    title: 'Empleados',
    table: 'empleado',
    columns: [
      { key: 'codigo', label: 'Código', width: 90 },
      { key: 'nombre', label: 'Nombre' },
    ],
    search: ['codigo', 'nombre'],
    order: 'codigo',
    key: 'codigo',
  },
  almacen: {
    title: 'Almacenes',
    table: 'almacen',
    columns: [
      { key: 'codigo', label: 'Código', width: 80 },
      { key: 'nombre', label: 'Nombre' },
    ],
    search: ['codigo', 'nombre'],
    order: 'codigo',
    key: 'codigo',
  },
  tienda: {
    title: 'Tiendas',
    table: 'tienda_terminal',
    columns: [
      { key: 'codigo', label: 'Código', width: 80 },
      { key: 'descripcion', label: 'Descripción' },
    ],
    search: ['codigo', 'descripcion'],
    order: 'codigo',
    key: 'codigo',
  },
}

/** Botón «···» que abre el buscador de `lookup` y devuelve el código elegido. */
export function BotonBuscar({ lookup, onPick, disabled }: { lookup?: string; onPick: (codigo: string) => void; disabled?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const def = lookup ? LOOKUPS[lookup] : undefined
  return (
    <>
      <GwLookupButton disabled={disabled || !def} onClick={() => setAbierto(true)} title={def ? `Buscar en ${def.title}` : 'Sin lista para este campo'} />
      {abierto && def && (
        <GwLookupDialog<Record<string, unknown>>
          title={def.title}
          table={def.table}
          columns={def.columns}
          searchColumns={def.search}
          orderBy={def.order}
          keyColumn={def.key}
          onPick={(r) => {
            setAbierto(false)
            onPick(String(r[def.key] ?? ''))
          }}
          onClose={() => setAbierto(false)}
        />
      )}
    </>
  )
}

// ───────────── Grupos de filtro ─────────────
export function Grupo({ titulo, children, className = '', derecha }: { titulo: ReactNode; children: ReactNode; className?: string; derecha?: ReactNode }) {
  return (
    <fieldset className={`gw-group !px-1.5 !pb-1 !pt-0.5 ${className}`}>
      <legend className="flex w-[calc(100%-8px)] items-center gap-3 !px-1 text-[16px] leading-[18px]">
        <span className="whitespace-nowrap">{titulo}</span>
        {derecha}
      </legend>
      {children}
    </fieldset>
  )
}

function Radios({ value, onChange, name, opciones }: { value: ModoRango; onChange: (m: ModoRango) => void; name: string; opciones: ModoRango[] }) {
  const et: Record<ModoRango, string> = { rango: 'Desde/Hasta', cualquiera: 'Cualquiera', seleccionar: 'Seleccionar' }
  return (
    <div className={`flex w-[118px] flex-none flex-col justify-around ${L}`}>
      {opciones.map((o) => (
        <GwRadio key={o} name={name} label={<span className={L}>{et[o]}</span>} checked={value === o} onChange={() => onChange(o)} />
      ))}
    </div>
  )
}

/** Campo de código con «···» (y Ctrl+Intro = mismo buscador). */
export function CodigoBuscar({
  value,
  onChange,
  lookup,
  disabled,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  lookup?: string
  disabled?: boolean
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const def = lookup ? LOOKUPS[lookup] : undefined
  return (
    <span className={`flex min-w-0 ${className}`}>
      <GwInput
        className={IN}
        value={value}
        disabled={disabled}
        data-gw-ayuda={def ? `Ctrl+Intro: lista de ${def.title.toLowerCase()}` : undefined}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.ctrlKey && def) {
            e.preventDefault()
            setAbierto(true)
          }
        }}
      />
      <GwLookupButton disabled={disabled || !def} onClick={() => setAbierto(true)} title={def ? `Buscar en ${def.title} (Ctrl+Intro)` : undefined} />
      {abierto && def && (
        <GwLookupDialog<Record<string, unknown>>
          title={def.title}
          table={def.table}
          columns={def.columns}
          searchColumns={def.search}
          orderBy={def.order}
          keyColumn={def.key}
          onPick={(r) => {
            setAbierto(false)
            onChange(String(r[def.key] ?? ''))
          }}
          onClose={() => setAbierto(false)}
        />
      )}
    </span>
  )
}

/**
 * «Desde/Hasta · Cualquiera · Seleccionar»: dos códigos con «···» y, debajo, la lista de
 * seleccionados (separados por comas) con «···» para añadir y el botón de vaciar.
 */
export function RangoCodigos({
  value,
  onChange,
  lookup,
  name,
  anchoCodigo,
  opciones = ['rango', 'cualquiera', 'seleccionar'],
}: {
  value: Rango
  onChange: (r: Rango) => void
  lookup?: string
  name: string
  /** Ancho de cada código (p. ej. 110 para almacenes); por defecto se reparten el espacio. */
  anchoCodigo?: number
  opciones?: ModoRango[]
}) {
  const p = (x: Partial<Rango>) => onChange({ ...value, ...x })
  const est = anchoCodigo ? { width: anchoCodigo } : undefined
  return (
    <div className="flex gap-2">
      <Radios value={value.modo} onChange={(m) => p({ modo: m })} name={name} opciones={opciones} />
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-[3px]">
        <div className="flex gap-2">
          <span className={anchoCodigo ? 'flex-none' : 'min-w-0 flex-1'} style={est}>
            <CodigoBuscar value={value.desde} lookup={lookup} disabled={value.modo !== 'rango'} onChange={(v) => p({ desde: v })} />
          </span>
          <span className={anchoCodigo ? 'flex-none' : 'min-w-0 flex-1'} style={est}>
            <CodigoBuscar value={value.hasta} lookup={lookup} disabled={value.modo !== 'rango'} onChange={(v) => p({ hasta: v })} />
          </span>
        </div>
        {opciones.includes('seleccionar') && (
          <span className="flex">
            <GwInput
              className={IN}
              value={value.lista}
              disabled={value.modo !== 'seleccionar'}
              title="Códigos separados por comas"
              onChange={(e) => p({ lista: e.target.value })}
            />
            <BotonBuscar
              lookup={lookup}
              disabled={value.modo !== 'seleccionar'}
              onPick={(c) => p({ lista: [...lista(value.lista), c].join(', ') })}
            />
            <button type="button" className="gw-btn h-[26px] w-[34px] flex-none px-0" title="Vaciar la selección" disabled={value.modo !== 'seleccionar'} onClick={() => p({ lista: '' })}>
              <ListPlus size={14} />
            </button>
          </span>
        )}
      </div>
    </div>
  )
}

/** Valor de una condición: número «0,000», fecha o texto, con «···» cuando hay lista. */
function Valor({ tipo, value, onChange, disabled, lookup }: { tipo: TipoCampo; value: string; onChange: (v: string) => void; disabled: boolean; lookup?: string }) {
  if (tipo === 'fecha')
    return (
      <span className="min-w-0 flex-1">
        <GwDate className={IN} value={value || null} disabled={disabled} onChange={(v) => onChange(v ?? '')} />
      </span>
    )
  return (
    <span className="flex min-w-0 flex-1">
      <GwInput
        className={`${IN} ${tipo === 'num' ? 'text-right' : ''}`}
        value={value}
        disabled={disabled}
        placeholder={tipo === 'num' && disabled ? '0,000' : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <BotonBuscar lookup={lookup} disabled={disabled} onPick={(c) => onChange(value && !disabled ? `${value}, ${c}` : c)} />
    </span>
  )
}

/** «Elegir y/o Filtrar Según …»: campo + condición arriba y los dos valores debajo. */
export function CondicionCampo({
  value,
  onChange,
  campos,
  tipoFijo,
  sinCampo,
  campoLabel,
}: {
  value: CampoOp
  onChange: (c: CampoOp) => void
  campos?: CampoDef[]
  tipoFijo?: TipoCampo
  /** Desplegable propio en lugar de la lista de campos (p. ej. niveles de PVP). */
  sinCampo?: ReactNode
  campoLabel?: string
}) {
  const def = campos?.find((c) => c.v === value.campo)
  const tipo = tipoFijo ?? def?.tipo ?? 'texto'
  const ops = OPERADORES.filter((o) => !o.tipos || o.tipos.includes(tipo))
  const p = (x: Partial<CampoOp>) => onChange({ ...value, ...x })
  const activo = value.op !== 'no'
  const sinValor = value.op === 'vacio' || value.op === 'no_vacio'
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-[3px]">
      {sinCampo ?? (
        <GwSelect className={IN} value={value.campo} title={campoLabel} onChange={(e) => p({ campo: e.target.value, v1: '', v2: '' })}>
          {campos?.map((c) => (
            <option key={c.v} value={c.v}>
              {c.l}
            </option>
          ))}
        </GwSelect>
      )}
      <GwSelect className={IN} value={value.op} onChange={(e) => p({ op: e.target.value })}>
        {ops.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </GwSelect>
      <Valor tipo={value.op === 'lista' ? 'texto' : tipo} value={value.v1} disabled={!activo || sinValor} lookup={def?.lookup} onChange={(v) => p({ v1: v })} />
      <Valor tipo={tipo} value={value.v2} disabled={value.op !== 'entre'} lookup={def?.lookup} onChange={(v) => p({ v2: v })} />
    </div>
  )
}

/** «Elegir Almacén y/o Filtrar por el Stock del Artículo». */
export function AlmacenStock({
  value,
  onChange,
  almacenes,
}: {
  value: FiltroArticulos['alm_stock']
  onChange: (v: FiltroArticulos['alm_stock']) => void
  almacenes: { codigo: string; nombre: string }[]
}) {
  const sin = value.almacen === ''
  return (
    <CondicionCampo
      value={{ campo: value.almacen, op: sin ? 'no' : value.op, v1: value.v1, v2: value.v2 }}
      tipoFijo="num"
      onChange={(c) => onChange({ almacen: value.almacen, op: c.op, v1: c.v1, v2: c.v2 })}
      sinCampo={
        <GwSelect className={IN} value={value.almacen} onChange={(e) => onChange({ ...value, almacen: e.target.value, op: e.target.value === '' ? 'no' : value.op })}>
          <option value="">Sin Almacenes</option>
          <option value="*">Todos los Almacenes</option>
          {almacenes.map((a) => (
            <option key={a.codigo} value={a.codigo}>
              {a.codigo} {a.nombre}
            </option>
          ))}
        </GwSelect>
      }
    />
  )
}

/** Fila «Filtrar por: ● Artículo ○ Familia, Nivel: ○1º ○2º ○3º» encima del rango. */
export function FiltrarPor({ f, set, name }: { f: FiltroArticulos; set: (p: Partial<FiltroArticulos>) => void; name: string }) {
  return (
    <div className={`flex items-center gap-4 ${L}`}>
      <span className="text-[16px]">Filtrar por:</span>
      <GwRadio name={`${name}-por`} label={<span className={L}>Artículo</span>} checked={f.por === 'articulo'} onChange={() => set({ por: 'articulo' })} />
      <GwRadio name={`${name}-por`} label={<span className={L}>Familia, Nivel:</span>} checked={f.por === 'familia'} onChange={() => set({ por: 'familia' })} />
      <span className="ml-auto flex gap-3">
        {([1, 2, 3] as const).map((n) => (
          <GwRadio key={n} name={`${name}-nivel`} disabled={f.por !== 'familia'} label={<span className={L}>{n}º</span>} checked={f.nivel === n} onChange={() => set({ nivel: n })} />
        ))}
      </span>
    </div>
  )
}

function MarcaX({ on }: { on: boolean }) {
  return on ? <Check size={15} strokeWidth={3} className="flex-none text-[#127a12]" /> : <X size={15} strokeWidth={3} className="flex-none text-[#c42b1c]" />
}

/** Botón conmutador ✓/× (Art. Anulados, Características…). */
export function Conmutador({ on, onChange, children, className = '' }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" className={`gw-btn h-[28px] gap-1 px-1 text-[15px] ${className}`} aria-pressed={on} onClick={() => onChange(!on)}>
      <MarcaX on={on} />
      <span className="truncate">{children}</span>
    </button>
  )
}

export function ArtAnulados({ value, onChange }: { value: { no: boolean; si: boolean }; onChange: (v: { no: boolean; si: boolean }) => void }) {
  return (
    <Grupo titulo="Art. Anulados">
      <div className="flex flex-col gap-1 py-0.5">
        <Conmutador on={value.no} onChange={(v) => onChange({ ...value, no: v })}>
          No
        </Conmutador>
        <Conmutador on={value.si} onChange={(v) => onChange({ ...value, si: v })}>
          Si
        </Conmutador>
      </div>
    </Grupo>
  )
}

const CARACT: [string, string][][] = [
  [
    ['sin_stock', 'Sin Stock'],
    ['generico', 'Genérico'],
    ['compuesto', 'Compuesto'],
    ['web', 'Art. Web'],
    ['activados', 'Activados'],
    ['con_imagen', 'Con Imagen'],
    ['pvp_fijo', 'Pvp Fijo'],
  ],
  [
    ['con_stock', 'Con Stock'],
    ['no_generico', 'No Genérico'],
    ['no_compuesto', 'No Compuesto'],
    ['no_web', 'No Web'],
    ['anulados', 'Anulados'],
    ['sin_imagen', 'Sin Imagen'],
    ['pvp_variable', 'Pvp Variable'],
  ],
]

export function Caracteristicas({ value, onChange }: { value: Record<string, boolean>; onChange: (v: Record<string, boolean>) => void }) {
  return (
    <Grupo titulo="Características del Artículo">
      <div className="grid grid-cols-[1fr_1.15fr_1.3fr_0.9fr_0.95fr_1.1fr_1.1fr] gap-0">
        {[0, 1].map((fila) =>
          CARACT[fila].map(([k, l]) => (
            <Conmutador key={k} className="w-full" on={!!value[k]} onChange={(v) => onChange({ ...value, [k]: v })}>
              {l}
            </Conmutador>
          )),
        )}
      </div>
    </Grupo>
  )
}

// ───────────── Cabecera y barra de salida ─────────────
export type Salida = 'pantalla' | 'impresora' | 'examinar' | 'pdf'

export function CabeceraInforme({
  informes,
  informe,
  setInforme,
  soloTotales,
  setSoloTotales,
  ordenes,
  orden,
  setOrden,
  extraIzq,
  checkLabel = 'Sólo Ver los Totales del informe',
  derecha,
}: {
  informes: { v: string; l: string }[]
  informe: string
  setInforme: (v: string) => void
  soloTotales: boolean
  setSoloTotales: (v: boolean) => void
  ordenes: { v: string; l: string }[]
  orden: string
  setOrden: (v: string) => void
  extraIzq?: ReactNode
  checkLabel?: string
  derecha?: ReactNode
}) {
  return (
    <div className="flex items-stretch gap-2">
      <div className="flex min-w-0 flex-[1.55] flex-col border border-[var(--gw-border-light)] px-1.5 pb-1">
        <div className="flex items-end gap-8">
          <span className="text-[18px] font-bold leading-[22px]">Informe a procesar</span>
          <label className="flex items-center gap-1 text-[17px] font-bold leading-[20px]">
            <input type="checkbox" className="h-[12px] w-[12px]" checked={soloTotales} onChange={(e) => setSoloTotales(e.target.checked)} />
            {checkLabel}
          </label>
        </div>
        <GwSelect className="!h-[28px] !text-[17px]" value={informe} onChange={(e) => setInforme(e.target.value)}>
          {informes.map((i) => (
            <option key={i.v} value={i.v}>
              {i.l}
            </option>
          ))}
        </GwSelect>
        {extraIzq}
      </div>
      <div className="flex min-w-0 flex-1 flex-col border border-[var(--gw-border-light)] px-1.5 pb-1">
        <span className="text-[18px] font-bold leading-[22px]">Orden de salida</span>
        <span className="flex">
          <GwSelect className="!h-[28px] !text-[17px]" value={orden} onChange={(e) => setOrden(e.target.value)}>
            {ordenes.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </GwSelect>
          <button type="button" className="gw-btn gw-lookup !h-[28px] !w-[58px]" title="Orden de salida: elige en la lista" onClick={() => undefined} tabIndex={-1}>
            ···
          </button>
        </span>
      </div>
      {derecha}
    </div>
  )
}

/** Barra inferior: Pantalla · Impresora · Examinar · Doc. PDF (destino) · Procesar · Cerrar. */
export function BarraSalida({
  salida,
  setSalida,
  onProcesar,
  onCerrar,
  procesando,
}: {
  salida: Salida
  setSalida: (s: Salida) => void
  onProcesar: () => void
  onCerrar: () => void
  procesando: boolean
}) {
  const b = (s: Salida, icono: ReactNode, texto: string) => (
    <button
      type="button"
      className={`gw-btn h-[40px] flex-1 gap-1.5 text-[17px] ${salida === s ? '!border-[#7a7a7a] !bg-[#f7f7f7] shadow-[inset_1px_1px_2px_rgba(0,0,0,0.25)]' : ''}`}
      aria-pressed={salida === s}
      onClick={() => setSalida(s)}
    >
      {icono}
      {texto}
    </button>
  )
  return (
    <div className="flex flex-none items-stretch gap-2 border-t border-[var(--gw-border-light)] pr-[64px] pt-1" title="">
      <div className="flex w-[175px] flex-none items-center px-1 text-[16px] leading-[19px]">Pulse F4 para cerrar la ventana</div>
      <div className="flex flex-1 gap-0.5 border border-[var(--gw-border-light)] p-0.5">
        {b('pantalla', <Pencil size={14} />, 'Pantalla')}
        {b('impresora', <Printer size={15} />, 'Impresora')}
        {b('examinar', <Search size={15} />, 'Examinar')}
        {b('pdf', <span className="rounded-sm border border-[#c42b1c] px-0.5 text-[9px] font-bold text-[#c42b1c]">PDF</span>, 'Doc. PDF')}
      </div>
      <button type="button" className="gw-btn h-[46px] w-[150px] gap-1.5 text-[18px]" onClick={onProcesar} disabled={procesando}>
        <Check size={17} strokeWidth={3} className="text-[#127a12]" />
        {procesando ? 'Procesando…' : 'Procesar'}
      </button>
      <button type="button" className="gw-btn h-[46px] w-[150px] gap-1.5 text-[18px]" onClick={onCerrar}>
        <X size={17} strokeWidth={3} className="text-[#c42b1c]" />
        Cerrar
      </button>
    </div>
  )
}
