import { supabase } from '../../../lib/supabase'

// Inventarios (Almacén → Inventarios en GeminisWin): ARTINVEN + ARTINVDT, con puntos de
// restauración (STKPTRT + STKPTRTD). El stock solo cambia con movimiento_stock: el
// trigger trg_movimiento_stock_actualiza_saldo mantiene articulo_almacen_stock.

export interface Cabecera {
  tienda_terminal_codigo: string
  numero: number | null
  nombre: string | null
  fecha: string
  almacen_codigo: string
  documento_externo: string | null
  observaciones: string | null
  estado: 'pendiente' | 'inventariado'
  fecha_hora_actualizacion: string | null
  creado_en: string | null
  tipo_inventario: number
  tipo_actualizacion: number
  tipo_punto_restauracion: number
  tipo_stock_a_cero: number
  tipo_deshacer: number
  opcion_al_error: number
  stock_a_cero_al_iniciar: boolean
  permite_codigo_barras: boolean
  filtro_linea_inventario: number
}

export interface Linea {
  numero_linea: number
  articulo_codigo: string
  descripcion: string | null
  almacen_codigo: string | null
  stock_anterior: number | null
  stock_al_inventariar: number | null
  cantidad_contada: number | null
  stock_actual: number | null
  estado: number
  inventariada: boolean
}

export interface Clave {
  tienda_terminal_codigo: string
  numero: number
}

export const CAMPOS_CAB =
  'tienda_terminal_codigo, numero, nombre, fecha, almacen_codigo, documento_externo, observaciones, estado, fecha_hora_actualizacion, creado_en, tipo_inventario, tipo_actualizacion, tipo_punto_restauracion, tipo_stock_a_cero, tipo_deshacer, opcion_al_error, stock_a_cero_al_iniciar, permite_codigo_barras, filtro_linea_inventario'

export const hoy = () => new Date().toISOString().slice(0, 10)

export function vacia(tienda: string, almacen: string): Cabecera {
  return {
    tienda_terminal_codigo: tienda,
    numero: null,
    nombre: null,
    fecha: hoy(),
    almacen_codigo: almacen,
    documento_externo: 'USR_INV',
    observaciones: null,
    estado: 'pendiente',
    fecha_hora_actualizacion: null,
    creado_en: null,
    tipo_inventario: 0,
    tipo_actualizacion: 0,
    tipo_punto_restauracion: 1,
    tipo_stock_a_cero: 0,
    tipo_deshacer: 0,
    opcion_al_error: 0,
    stock_a_cero_al_iniciar: false,
    permite_codigo_barras: true,
    filtro_linea_inventario: 0,
  }
}

const n = (v: unknown) => (v == null ? null : Number(v))

export function normalizarCab(r: Record<string, unknown>): Cabecera {
  return {
    ...(r as unknown as Cabecera),
    numero: n(r.numero),
    tipo_inventario: Number(r.tipo_inventario ?? 0),
    tipo_actualizacion: Number(r.tipo_actualizacion ?? 0),
    tipo_punto_restauracion: Number(r.tipo_punto_restauracion ?? 0),
    tipo_stock_a_cero: Number(r.tipo_stock_a_cero ?? 0),
    tipo_deshacer: Number(r.tipo_deshacer ?? 0),
    opcion_al_error: Number(r.opcion_al_error ?? 0),
    filtro_linea_inventario: Number(r.filtro_linea_inventario ?? 0),
    stock_a_cero_al_iniciar: Boolean(r.stock_a_cero_al_iniciar),
    permite_codigo_barras: r.permite_codigo_barras == null ? true : Boolean(r.permite_codigo_barras),
  }
}

export async function cargarLineas(c: Clave): Promise<Linea[]> {
  const { data, error } = await supabase
    .from('inventario_linea')
    .select('numero_linea, articulo_codigo, descripcion, almacen_codigo, stock_anterior, stock_al_inventariar, cantidad_contada, stock_actual, estado, inventariada')
    .eq('tienda_terminal_codigo', c.tienda_terminal_codigo)
    .eq('numero', c.numero)
    .order('numero_linea')
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    numero_linea: Number(r.numero_linea),
    articulo_codigo: String(r.articulo_codigo),
    descripcion: (r.descripcion as string) ?? null,
    almacen_codigo: (r.almacen_codigo as string) ?? null,
    stock_anterior: n(r.stock_anterior),
    stock_al_inventariar: n(r.stock_al_inventariar),
    cantidad_contada: n(r.cantidad_contada),
    stock_actual: n(r.stock_actual),
    estado: Number(r.estado ?? (r.cantidad_contada != null ? 1 : 0)),
    inventariada: Boolean(r.inventariada),
  }))
}

export async function stockDe(almacen: string, articulo: string): Promise<number> {
  const { data } = await supabase
    .from('articulo_almacen_stock')
    .select('cantidad_actual')
    .eq('almacen_codigo', almacen)
    .eq('articulo_codigo', articulo)
    .maybeSingle()
  return Number((data as { cantidad_actual: number } | null)?.cantidad_actual ?? 0)
}

async function stockAlmacen(almacen: string): Promise<Map<string, number>> {
  const m = new Map<string, number>()
  let desde = 0
  for (;;) {
    const { data, error } = await supabase
      .from('articulo_almacen_stock')
      .select('articulo_codigo, cantidad_actual')
      .eq('almacen_codigo', almacen)
      .order('articulo_codigo')
      .range(desde, desde + 999)
    if (error) throw new Error(error.message)
    const filas = (data ?? []) as { articulo_codigo: string; cantidad_actual: number }[]
    for (const f of filas) m.set(f.articulo_codigo, Number(f.cantidad_actual))
    if (filas.length < 1000) break
    desde += 1000
  }
  return m
}

async function siguienteNumero(tienda: string, tipo: 'inventario' | 'punto_restauracion_stock') {
  const { data, error } = await supabase.rpc('fn_siguiente_numero', { p_tienda: tienda, p_tipo_documento: tipo, p_serie: '' })
  if (error) throw new Error(error.message)
  return Number(data)
}

/** Resuelve el código tecleado: código interno, código de barras principal o adicional. */
export async function resolverArticulo(texto: string, porBarras: boolean): Promise<{ codigo_interno: string; descripcion: string } | null> {
  const t = texto.trim()
  if (!t) return null
  const { data } = await supabase.from('articulo').select('codigo_interno, descripcion').eq('codigo_interno', t).maybeSingle()
  if (data) return data as { codigo_interno: string; descripcion: string }
  if (!porBarras) return null
  const { data: p } = await supabase.from('articulo').select('codigo_interno, descripcion').eq('codigo_barras_principal', t).limit(1)
  if (p?.length) return p[0] as { codigo_interno: string; descripcion: string }
  const { data: b } = await supabase.from('articulo_codigo_barras').select('articulo_codigo').eq('codigo_barras', t).maybeSingle()
  if (!b) return null
  const { data: a } = await supabase
    .from('articulo')
    .select('codigo_interno, descripcion')
    .eq('codigo_interno', (b as { articulo_codigo: string }).articulo_codigo)
    .maybeSingle()
  return (a as { codigo_interno: string; descripcion: string } | null) ?? null
}

/** Guarda un punto de restauración con el stock actual de los artículos indicados. */
async function crearPunto(cab: Clave & { almacen_codigo: string; tipo: number }, articulos: string[], stock: Map<string, number>) {
  if (articulos.length === 0) return null
  const numero = await siguienteNumero(cab.tienda_terminal_codigo, 'punto_restauracion_stock')
  const { error } = await supabase.from('punto_restauracion_stock').insert({
    tienda_terminal_codigo: cab.tienda_terminal_codigo,
    numero,
    concepto: `Inventario ${cab.tienda_terminal_codigo}-${cab.numero}`,
    fecha: hoy(),
    almacen_desde_codigo: cab.almacen_codigo,
    almacen_hasta_codigo: cab.almacen_codigo,
    documento_externo: 'USR_INV',
    origen_tipo: 'inventario',
    origen_tienda_terminal_codigo: cab.tienda_terminal_codigo,
    origen_numero: cab.numero,
    tipo_punto_restauracion: cab.tipo,
  })
  if (error) throw new Error(error.message)
  const ahora = new Date().toISOString()
  const filas = articulos.map((a, i) => ({
    tienda_terminal_codigo: cab.tienda_terminal_codigo,
    numero,
    numero_linea: i + 1,
    articulo_codigo: a,
    almacen_codigo: cab.almacen_codigo,
    cantidad_antes_de_restaurar: stock.get(a) ?? 0,
    cantidad_inicial: stock.get(a) ?? 0,
    fecha_stock_inicial: ahora,
  }))
  for (let i = 0; i < filas.length; i += 500) {
    const { error: e } = await supabase.from('punto_restauracion_stock_linea').insert(filas.slice(i, i + 500))
    if (e) throw new Error(e.message)
  }
  return numero
}

/** Lleva el stock de cada artículo al valor objetivo generando movimientos de inventario. */
async function aplicarObjetivos(c: Clave, almacen: string, objetivos: Map<string, number>, stock: Map<string, number>, lineaDe: Map<string, number>, observaciones: string) {
  const movs = []
  for (const [articulo, objetivo] of objetivos) {
    const diff = Math.round((objetivo - (stock.get(articulo) ?? 0)) * 1000) / 1000
    if (diff === 0) continue
    movs.push({
      tipo_movimiento: 'inventario',
      sentido: diff > 0 ? 1 : -1,
      almacen_codigo: almacen,
      articulo_codigo: articulo,
      cantidad: Math.abs(diff),
      documento_origen_tipo: 'inventario',
      documento_origen_tienda_codigo: c.tienda_terminal_codigo,
      documento_origen_numero: c.numero,
      documento_origen_linea: lineaDe.get(articulo) ?? null,
      tienda_terminal_codigo: c.tienda_terminal_codigo,
      observaciones,
    })
  }
  for (let i = 0; i < movs.length; i += 500) {
    const { error } = await supabase.from('movimiento_stock').insert(movs.slice(i, i + 500))
    if (error) throw new Error(error.message)
  }
  return movs.length
}

const sello = (prefijo: string) => {
  const d = new Date()
  return `${prefijo} el ${d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} a las ${d.toLocaleTimeString('es-ES')}`
}

/**
 * Alta: asigna el número al guardar. Con «Crear el Punto de Restauración y Poner el Stock
 * a 0, sólo al Agregar un Registro Nuevo» hace ambas cosas sobre el almacén al crear.
 */
export async function crearInventario(cab: Cabecera): Promise<Clave> {
  const numero = await siguienteNumero(cab.tienda_terminal_codigo, 'inventario')
  const { error } = await supabase.from('inventario').insert({ ...datosCab(cab), tienda_terminal_codigo: cab.tienda_terminal_codigo, numero, estado: 'pendiente' })
  if (error) throw new Error(error.message)
  const clave = { tienda_terminal_codigo: cab.tienda_terminal_codigo, numero }
  if (cab.stock_a_cero_al_iniciar) {
    const stock = await stockAlmacen(cab.almacen_codigo)
    const conStock = [...stock.entries()].filter(([, v]) => v !== 0).map(([a]) => a)
    if (cab.tipo_punto_restauracion > 0) await crearPunto({ ...clave, almacen_codigo: cab.almacen_codigo, tipo: cab.tipo_punto_restauracion }, conStock, stock)
    if (cab.tipo_stock_a_cero === 2)
      await aplicarObjetivos(clave, cab.almacen_codigo, new Map(conStock.map((a) => [a, 0])), stock, new Map(), 'Stock a 0 al crear el inventario')
  }
  return clave
}

export function datosCab(c: Cabecera) {
  return {
    nombre: c.nombre,
    fecha: c.fecha,
    almacen_codigo: c.almacen_codigo,
    documento_externo: c.documento_externo,
    observaciones: c.observaciones,
    tipo_inventario: c.tipo_inventario,
    tipo_actualizacion: c.tipo_actualizacion,
    tipo_punto_restauracion: c.tipo_punto_restauracion,
    tipo_stock_a_cero: c.tipo_stock_a_cero,
    tipo_deshacer: c.tipo_deshacer,
    opcion_al_error: c.opcion_al_error,
    stock_a_cero_al_iniciar: c.stock_a_cero_al_iniciar,
    permite_codigo_barras: c.permite_codigo_barras,
    filtro_linea_inventario: c.filtro_linea_inventario,
  }
}

export async function anadirLinea(c: Clave, almacen: string, articulo: { codigo_interno: string; descripcion: string }, cantidad: number | null, siguiente: number) {
  const stock = await stockDe(almacen, articulo.codigo_interno)
  const { error } = await supabase.from('inventario_linea').insert({
    tienda_terminal_codigo: c.tienda_terminal_codigo,
    numero: c.numero,
    numero_linea: siguiente,
    articulo_codigo: articulo.codigo_interno,
    descripcion: articulo.descripcion,
    almacen_codigo: almacen,
    stock_anterior: stock,
    stock_al_inventariar: cantidad != null ? stock : null,
    stock_actual: null,
    cantidad_contada: cantidad,
    estado: cantidad != null ? 1 : 0,
    inventariada: false,
  })
  if (error) throw new Error(error.code === '23505' ? 'Esa línea ya existe.' : error.message)
}

/**
 * Toma de una línea. Si el stock ha variado desde la toma anterior, aplica la opción
 * «Que hacer al producirse una variación de stock entre tomas».
 */
export async function tomarLinea(
  c: Clave,
  cab: Cabecera,
  l: Linea,
  cantidad: number | null,
  preguntar: (msg: string) => boolean,
): Promise<'ok' | 'descartada'> {
  const actual = await stockDe(cab.almacen_codigo, l.articulo_codigo)
  if (l.stock_al_inventariar != null && actual !== l.stock_al_inventariar && cantidad != null) {
    const msg = `El stock de ${l.articulo_codigo} ha variado entre tomas: era ${l.stock_al_inventariar} y ahora es ${actual}.`
    const aceptar = cab.opcion_al_error === 1 ? true : cab.opcion_al_error === 2 ? false : preguntar(`${msg}\n\n¿Aceptar la toma?`)
    if (!aceptar) return 'descartada'
  }
  const { error } = await supabase
    .from('inventario_linea')
    .update({ cantidad_contada: cantidad, stock_al_inventariar: cantidad != null ? actual : null, estado: cantidad != null ? 1 : 0 })
    .eq('tienda_terminal_codigo', c.tienda_terminal_codigo)
    .eq('numero', c.numero)
    .eq('numero_linea', l.numero_linea)
  if (error) throw new Error(error.message)
  return 'ok'
}

/** «Inventariar Artículos»: aplica el inventario al stock según las opciones de la ficha. */
export async function actualizarInventario(c: Clave, cab: Cabecera): Promise<string> {
  let lineas = await cargarLineas(c)
  let stock = await stockAlmacen(cab.almacen_codigo)

  if (cab.tipo_actualizacion === 2) {
    const ya = new Set(lineas.map((l) => l.articulo_codigo))
    const faltan = [...stock.keys()].filter((a) => !ya.has(a))
    if (faltan.length) {
      const { data: arts } = await supabase.from('articulo').select('codigo_interno, descripcion').in('codigo_interno', faltan)
      const desc = new Map(((arts ?? []) as { codigo_interno: string; descripcion: string }[]).map((a) => [a.codigo_interno, a.descripcion]))
      let sig = lineas.reduce((m, l) => Math.max(m, l.numero_linea), 0)
      const filas = faltan.map((a) => ({
        tienda_terminal_codigo: c.tienda_terminal_codigo,
        numero: c.numero,
        numero_linea: ++sig,
        articulo_codigo: a,
        descripcion: desc.get(a) ?? null,
        almacen_codigo: cab.almacen_codigo,
        stock_anterior: stock.get(a) ?? 0,
        estado: 0,
        inventariada: false,
      }))
      for (let i = 0; i < filas.length; i += 500) {
        const { error } = await supabase.from('inventario_linea').insert(filas.slice(i, i + 500))
        if (error) throw new Error(error.message)
      }
      lineas = await cargarLineas(c)
    }
  }

  const seleccion = cab.tipo_actualizacion === 0 ? lineas.filter((l) => l.estado === 1) : lineas
  if (seleccion.length === 0) throw new Error('No hay ningún artículo inventariado que actualizar.')

  const objetivos = new Map<string, number>()
  for (const l of seleccion) objetivos.set(l.articulo_codigo, l.cantidad_contada ?? 0)
  const aCero = new Set<string>()
  if (!cab.stock_a_cero_al_iniciar && cab.tipo_stock_a_cero === 1)
    for (const l of lineas) if (!objetivos.has(l.articulo_codigo)) aCero.add(l.articulo_codigo)
  if (!cab.stock_a_cero_al_iniciar && cab.tipo_stock_a_cero === 2)
    for (const [a, v] of stock) if (!objetivos.has(a) && v !== 0) aCero.add(a)
  for (const a of aCero) objetivos.set(a, 0)

  let punto: number | null = null
  if (!cab.stock_a_cero_al_iniciar && cab.tipo_punto_restauracion > 0) {
    const arts = cab.tipo_punto_restauracion === 2 ? [...new Set([...stock.keys(), ...objetivos.keys()])] : [...objetivos.keys()]
    punto = await crearPunto({ ...c, almacen_codigo: cab.almacen_codigo, tipo: cab.tipo_punto_restauracion }, arts, stock)
  }

  stock = await stockAlmacen(cab.almacen_codigo)
  const lineaDe = new Map(lineas.map((l) => [l.articulo_codigo, l.numero_linea]))
  const nMovs = await aplicarObjetivos(c, cab.almacen_codigo, objetivos, stock, lineaDe, `Inventario ${c.tienda_terminal_codigo}-${c.numero}`)

  const ahora = new Date().toISOString()
  for (const l of lineas) {
    if (!objetivos.has(l.articulo_codigo)) continue
    const objetivo = objetivos.get(l.articulo_codigo) ?? 0
    const cambia = Math.round((objetivo - (stock.get(l.articulo_codigo) ?? 0)) * 1000) !== 0
    const { error } = await supabase
      .from('inventario_linea')
      .update({ inventariada: true, stock_actual: cambia ? objetivo : 0, fecha_hora_actualizacion: ahora })
      .eq('tienda_terminal_codigo', c.tienda_terminal_codigo)
      .eq('numero', c.numero)
      .eq('numero_linea', l.numero_linea)
    if (error) throw new Error(error.message)
  }

  const obs = [sello('Actualizado'), cab.observaciones].filter(Boolean).join('\n')
  const { error } = await supabase
    .from('inventario')
    .update({ estado: 'inventariado', fecha_hora_actualizacion: ahora, observaciones: obs })
    .eq('tienda_terminal_codigo', c.tienda_terminal_codigo)
    .eq('numero', c.numero)
  if (error) throw new Error(error.message)
  return `Inventario actualizado: ${nMovs} artículo(s) con stock corregido${punto ? `; punto de restauración ${c.tienda_terminal_codigo}-${punto}` : ''}.`
}

export interface Punto {
  tienda_terminal_codigo: string
  numero: number
  fecha: string
  concepto: string | null
  fecha_hora_restaurado: string | null
  lineas: number
}

export async function puntosDe(c: Clave): Promise<Punto[]> {
  const { data, error } = await supabase
    .from('punto_restauracion_stock')
    .select('tienda_terminal_codigo, numero, fecha, concepto, fecha_hora_restaurado, punto_restauracion_stock_linea(count)')
    .eq('origen_tipo', 'inventario')
    .eq('origen_tienda_terminal_codigo', c.tienda_terminal_codigo)
    .eq('origen_numero', c.numero)
    .order('numero', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    tienda_terminal_codigo: String(r.tienda_terminal_codigo),
    numero: Number(r.numero),
    fecha: String(r.fecha),
    concepto: (r.concepto as string) ?? null,
    fecha_hora_restaurado: (r.fecha_hora_restaurado as string) ?? null,
    lineas: Number(((r.punto_restauracion_stock_linea as { count: number }[] | undefined) ?? [])[0]?.count ?? 0),
  }))
}

/**
 * Deshacer el inventario. Opción 0: vuelve al stock guardado en el punto de restauración;
 * opción 1 (o si no hay punto): resta los movimientos que generó el inventario.
 */
export async function deshacerInventario(c: Clave, cab: Cabecera): Promise<string> {
  const stock = await stockAlmacen(cab.almacen_codigo)
  const puntos = (await puntosDe(c)).filter((p) => !p.fecha_hora_restaurado)
  const motivo = `Deshacer inventario ${c.tienda_terminal_codigo}-${c.numero}`
  let nMovs = 0
  let como = ''
  if (cab.tipo_deshacer === 0 && puntos.length) {
    const p = puntos[0]
    const { data, error } = await supabase
      .from('punto_restauracion_stock_linea')
      .select('articulo_codigo, cantidad_antes_de_restaurar')
      .eq('tienda_terminal_codigo', p.tienda_terminal_codigo)
      .eq('numero', p.numero)
    if (error) throw new Error(error.message)
    const objetivos = new Map(((data ?? []) as { articulo_codigo: string; cantidad_antes_de_restaurar: number }[]).map((r) => [r.articulo_codigo, Number(r.cantidad_antes_de_restaurar ?? 0)]))
    nMovs = await aplicarObjetivos(c, cab.almacen_codigo, objetivos, stock, new Map(), motivo)
    const { error: e2 } = await supabase
      .from('punto_restauracion_stock')
      .update({ fecha_hora_restaurado: new Date().toISOString() })
      .eq('tienda_terminal_codigo', p.tienda_terminal_codigo)
      .eq('numero', p.numero)
    if (e2) throw new Error(e2.message)
    como = `con el punto de restauración ${p.tienda_terminal_codigo}-${p.numero}`
  } else {
    const { data, error } = await supabase
      .from('movimiento_stock')
      .select('articulo_codigo, sentido, cantidad')
      .eq('documento_origen_tipo', 'inventario')
      .eq('documento_origen_tienda_codigo', c.tienda_terminal_codigo)
      .eq('documento_origen_numero', c.numero)
    if (error) throw new Error(error.message)
    const neto = new Map<string, number>()
    for (const m of (data ?? []) as { articulo_codigo: string; sentido: number; cantidad: number }[])
      neto.set(m.articulo_codigo, (neto.get(m.articulo_codigo) ?? 0) + Number(m.sentido) * Number(m.cantidad))
    const objetivos = new Map([...neto].filter(([, v]) => v !== 0).map(([a, v]) => [a, (stock.get(a) ?? 0) - v]))
    nMovs = await aplicarObjetivos(c, cab.almacen_codigo, objetivos, stock, new Map(), motivo)
    como = 'restando los movimientos del inventario'
    if (cab.tipo_deshacer === 0) como += ' (no había punto de restauración)'
  }
  const { error: e3 } = await supabase
    .from('inventario_linea')
    .update({ inventariada: false, stock_actual: null, fecha_hora_actualizacion: null })
    .eq('tienda_terminal_codigo', c.tienda_terminal_codigo)
    .eq('numero', c.numero)
  if (e3) throw new Error(e3.message)
  const obs = [sello('Deshecho'), cab.observaciones].filter(Boolean).join('\n')
  const { error: e4 } = await supabase
    .from('inventario')
    .update({ estado: 'pendiente', fecha_hora_actualizacion: null, observaciones: obs })
    .eq('tienda_terminal_codigo', c.tienda_terminal_codigo)
    .eq('numero', c.numero)
  if (e4) throw new Error(e4.message)
  return `Inventario deshecho ${como}: ${nMovs} artículo(s) restaurado(s).`
}
