import { supabase } from '../../../lib/supabase'
import { recalcularTotalesPedido } from '../pedidos/totales'

// Peticiones de Artículos (Compras → Peticiones de Artículos / Generar Petición, CTRL+P).
// SIN CAPTURA de GeminisWin: la ficha y el alta rápida se han hecho a partir de las tablas
// migradas (PETICION → peticion, PETIDETA → peticion_tramitacion), el Gestor de pedidos a
// proveedores (pestaña Peticiones) y los estados confirmados por Luis vía Cowork.
//
// Una petición es un encargo interno de un artículo (de una tienda o empleado, o para un
// cliente) que después se tramita como línea de un pedido a proveedor.

export const COLS_PETICION =
  'tienda_terminal_codigo, numero, tipo, estado, fecha_hora, articulo_codigo, descripcion, cantidad, cantidad_tramitada, empleado_peticion_codigo, vendedor_codigo, empleado_atencion_codigo, concepto, origen_tipo, origen_tienda_terminal_codigo, origen_movimiento_numero, origen_almacen_codigo, origen_cliente_codigo, origen_nombre, proveedor_codigo, fecha_prevista_entrega, observaciones'

export interface Peticion {
  tienda_terminal_codigo: string
  numero: number | null
  tipo: number | null
  estado: string
  fecha_hora: string | null
  articulo_codigo: string
  descripcion: string | null
  cantidad: number
  cantidad_tramitada: number | null
  empleado_peticion_codigo: string | null
  vendedor_codigo: string | null
  empleado_atencion_codigo: string | null
  concepto: string | null
  origen_tipo: string | null
  origen_tienda_terminal_codigo: string | null
  origen_movimiento_numero: number | null
  origen_almacen_codigo: string | null
  origen_cliente_codigo: string | null
  origen_nombre: string | null
  proveedor_codigo: string | null
  fecha_prevista_entrega: string | null
  observaciones: string | null
}

/** Estados que todavía se pueden tramitar a un pedido (lo que queda por pedir). */
export const ESTADOS_TRAMITABLES = ['pendiente', 'atendida']

/** Tienda por defecto de las peticiones nuevas (el empleado no lleva tienda asignada). */
export const TIENDA_PETICION = '01'

/** Código de empleado del usuario conectado, o null. */
export async function empleadoActual(): Promise<string | null> {
  const { data: s } = await supabase.auth.getSession()
  const uid = s.session?.user.id
  if (!uid) return null
  const { data } = await supabase.from('empleado').select('codigo').eq('auth_user_id', uid).maybeSingle()
  return (data?.codigo as string | undefined) ?? null
}

/** Da de alta una petición con el siguiente número de la tienda. Devuelve el número. */
export async function crearPeticion(p: Omit<Peticion, 'numero' | 'fecha_hora'> & { fecha_hora?: string | null }) {
  const { data: numero, error: eNum } = await supabase.rpc('fn_siguiente_numero', {
    p_tienda: p.tienda_terminal_codigo,
    p_tipo_documento: 'peticion',
    p_serie: '',
  })
  if (eNum) throw new Error(eNum.message)
  const { error } = await supabase.from('peticion').insert({ ...p, numero, fecha_hora: p.fecha_hora ?? new Date().toISOString() })
  if (error) throw new Error(error.message)
  return Number(numero)
}

export interface PeticionATramitar {
  tienda: string
  numero: number
  articulo: string
  descripcion: string | null
  /** Lo que falta por tramitar (cantidad − cantidad tramitada). */
  falta: number
  /** Proveedor de la petición; si no tiene, el habitual del artículo. */
  proveedor: string | null
  almacen: string | null
}

/** Peticiones tramitables con lo que les falta y el proveedor con el que se pedirían. */
export async function cargarTramitables(filtro?: { claves?: { t: string; n: number }[] }): Promise<PeticionATramitar[]> {
  let q = supabase
    .from('peticion')
    .select('tienda_terminal_codigo, numero, articulo_codigo, descripcion, cantidad, cantidad_tramitada, proveedor_codigo, origen_almacen_codigo, fecha_hora')
    .in('estado', ESTADOS_TRAMITABLES)
    .order('fecha_hora')
    .limit(2000)
  if (filtro?.claves?.length === 1) q = q.eq('tienda_terminal_codigo', filtro.claves[0].t).eq('numero', filtro.claves[0].n)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  let lista = data ?? []
  if (filtro?.claves && filtro.claves.length > 1) {
    const set = new Set(filtro.claves.map((k) => `${k.t}/${k.n}`))
    lista = lista.filter((r) => set.has(`${r.tienda_terminal_codigo}/${r.numero}`))
  }
  const arts = [...new Set(lista.map((r) => r.articulo_codigo as string))]
  const habitual = new Map<string, string | null>()
  if (arts.length) {
    const { data: a } = await supabase.from('articulo').select('codigo_interno, proveedor_habitual_codigo').in('codigo_interno', arts)
    for (const r of a ?? []) habitual.set(r.codigo_interno as string, r.proveedor_habitual_codigo as string | null)
  }
  return lista
    .map((r) => ({
      tienda: r.tienda_terminal_codigo as string,
      numero: Number(r.numero),
      articulo: r.articulo_codigo as string,
      descripcion: r.descripcion as string | null,
      falta: Math.max(0, Number(r.cantidad ?? 0) - Number(r.cantidad_tramitada ?? 0)),
      proveedor: (r.proveedor_codigo as string | null) || habitual.get(r.articulo_codigo as string) || null,
      almacen: r.origen_almacen_codigo as string | null,
    }))
    .filter((r) => r.falta > 0)
}

/** Marca las peticiones como tramitadas en la línea del pedido y deja el rastro en peticion_tramitacion. */
async function anotarTramitacion(
  pets: PeticionATramitar[],
  pedido: { tienda: string; numero: number; linea: number; proveedor: string; almacen: string },
  empleado: string | null,
) {
  for (const p of pets) {
    const { data: actual } = await supabase.from('peticion').select('cantidad').eq('tienda_terminal_codigo', p.tienda).eq('numero', p.numero).single()
    const { error: e1 } = await supabase
      .from('peticion')
      .update({
        estado: 'tramitada',
        cantidad_tramitada: Number(actual?.cantidad ?? p.falta),
        proveedor_codigo: pedido.proveedor,
        empleado_atencion_codigo: empleado,
        actualizado_en: new Date().toISOString(),
      })
      .eq('tienda_terminal_codigo', p.tienda)
      .eq('numero', p.numero)
    if (e1) throw new Error(e1.message)
    // PETIDETA.ESTADO es un código numérico de GeminisWin sin documentar: se deja vacío.
    const { error: e2 } = await supabase.from('peticion_tramitacion').upsert(
      {
        tienda_terminal_codigo: p.tienda,
        numero: p.numero,
        pedido_proveedor_tienda_codigo: pedido.tienda,
        pedido_proveedor_numero: pedido.numero,
        pedido_proveedor_linea: pedido.linea,
        fecha_hora: new Date().toISOString(),
        cantidad: p.falta,
        proveedor_codigo: pedido.proveedor,
        almacen_codigo: pedido.almacen,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: 'tienda_terminal_codigo,numero' },
    )
    if (e2) throw new Error(e2.message)
  }
}

/**
 * Tramita peticiones: un pedido a proveedor por proveedor (el de la petición o el habitual del
 * artículo), una línea por artículo con la suma de lo que falta, precios y códigos de compra del
 * proveedor (como la ficha de pedido al meter un artículo) y totales con recalcularTotalesPedido.
 * Las peticiones sin proveedor se devuelven sin tocar.
 */
export async function tramitarPeticiones(
  pets: PeticionATramitar[],
  opts: { tienda: string; almacen?: string | null; observaciones?: string | null },
): Promise<{ pedidos: { tienda: string; numero: number; proveedor: string; lineas: number }[]; sinProveedor: PeticionATramitar[] }> {
  const empleado = await empleadoActual()
  const sinProveedor = pets.filter((p) => !p.proveedor)
  const porProv = new Map<string, PeticionATramitar[]>()
  for (const p of pets) if (p.proveedor) porProv.set(p.proveedor, [...(porProv.get(p.proveedor) ?? []), p])
  if (!porProv.size) return { pedidos: [], sinProveedor }

  const { data: tienda } = await supabase.from('tienda_terminal').select('almacen_codigo').eq('codigo', opts.tienda).maybeSingle()
  const arts = [...new Set(pets.map((p) => p.articulo))]
  const { data: artData, error: eArt } = await supabase
    .from('articulo')
    .select('codigo_interno, descripcion, codigo_compra_habitual, coste_puro, coste_neto, ultimo_descuento_compra_pct, igic_pct, impuesto2_pct, unidades_por_caja, cajas_por_bulto')
    .in('codigo_interno', arts)
  if (eArt) throw new Error(eArt.message)
  const artDe = new Map((artData ?? []).map((a) => [a.codigo_interno as string, a]))

  const pedidos: { tienda: string; numero: number; proveedor: string; lineas: number }[] = []
  for (const [proveedor, grupo] of porProv) {
    const [{ data: prov }, { data: aps }] = await Promise.all([
      supabase.from('proveedor').select('forma_pago_codigo, descuento_pie_pct, no_aplica_impuesto2, almacen_defecto_codigo').eq('codigo', proveedor).maybeSingle(),
      supabase
        .from('articulo_proveedor')
        .select('articulo_codigo, codigo_compra, coste_puro, coste_neto, ultimo_descuento_pct')
        .eq('proveedor_codigo', proveedor)
        .in('articulo_codigo', [...new Set(grupo.map((g) => g.articulo))]),
    ])
    const apDe = new Map((aps ?? []).map((a) => [a.articulo_codigo as string, a]))
    const almacen = opts.almacen || (prov?.almacen_defecto_codigo as string | null) || tienda?.almacen_codigo || '01'

    const { data: numero, error: eNum } = await supabase.rpc('fn_siguiente_numero', { p_tienda: opts.tienda, p_tipo_documento: 'pedido_proveedor', p_serie: '' })
    if (eNum) throw new Error(eNum.message)
    const { error: eCab } = await supabase.from('pedido_proveedor').insert({
      tienda_terminal_codigo: opts.tienda,
      numero,
      proveedor_codigo: proveedor,
      almacen_codigo: almacen,
      estado: 'pendiente',
      fecha_solicitud: new Date().toISOString().slice(0, 10),
      forma_pago_codigo: prov?.forma_pago_codigo ?? null,
      descuento_pie_pct: Number(prov?.descuento_pie_pct ?? 0),
      observaciones: opts.observaciones || 'Generado desde Peticiones de Artículos',
    })
    if (eCab) throw new Error(eCab.message)

    // Una línea por artículo (las peticiones del mismo artículo se suman).
    const porArt = new Map<string, PeticionATramitar[]>()
    for (const g of grupo) porArt.set(g.articulo, [...(porArt.get(g.articulo) ?? []), g])
    const lineas = [...porArt.entries()].map(([codigo, ps], i) => {
      const a = artDe.get(codigo)
      const ap = apDe.get(codigo)
      const puro = Number(ap?.coste_puro ?? 0) || Number(a?.coste_puro ?? 0)
      const anterior = Number(ap?.coste_neto ?? 0) || (a?.coste_neto != null ? Number(a.coste_neto) : null)
      return {
        tienda_terminal_codigo: opts.tienda,
        numero,
        linea: i + 1,
        articulo_codigo: codigo,
        codigo_compra: (ap?.codigo_compra as string | null) || (a?.codigo_compra_habitual as string | null) || codigo,
        descripcion: (a?.descripcion as string | null) ?? ps[0].descripcion,
        cantidad: ps.reduce((s, p) => s + p.falta, 0),
        unidades_por_caja: Number(a?.unidades_por_caja ?? 0),
        cajas_por_bulto: Number(a?.cajas_por_bulto ?? 0),
        coste_anterior: anterior,
        precio_compra: puro,
        descuento_pct: Number(ap?.ultimo_descuento_pct ?? a?.ultimo_descuento_compra_pct ?? 0),
        igic_pct: Number(a?.igic_pct ?? 0),
        canon: prov?.no_aplica_impuesto2 ? 0 : Number(a?.impuesto2_pct ?? 0),
      }
    })
    const { error: eLin } = await supabase.from('pedido_proveedor_linea').insert(lineas)
    if (eLin) throw new Error(`Pedido ${opts.tienda}/${numero}: ${eLin.message}`)
    await recalcularTotalesPedido(opts.tienda, Number(numero))
    for (const l of lineas)
      await anotarTramitacion(porArt.get(l.articulo_codigo) ?? [], { tienda: opts.tienda, numero: Number(numero), linea: l.linea, proveedor, almacen }, empleado)
    pedidos.push({ tienda: opts.tienda, numero: Number(numero), proveedor, lineas: lineas.length })
  }
  return { pedidos, sinProveedor }
}

/**
 * Propuestas de pedido del Gestor: el pedido creado ya incluye lo que faltaba de las peticiones
 * abiertas de esos artículos, así que se dan por tramitadas en su línea (por orden de fecha,
 * mientras la cantidad de la línea las cubra).
 */
export async function vincularPeticionesAPedido(
  pedido: { tienda: string; numero: number; proveedor: string; almacen: string },
  lineas: { articulo: string; linea: number; cantidad: number }[],
  almacenFiltro?: string | null,
) {
  if (!lineas.length) return 0
  const todas = await cargarTramitables()
  const empleado = await empleadoActual()
  let n = 0
  for (const l of lineas) {
    let queda = l.cantidad
    const pets = todas.filter((p) => p.articulo === l.articulo && (!almacenFiltro || !p.almacen || p.almacen === almacenFiltro))
    const cubiertas: PeticionATramitar[] = []
    for (const p of pets) {
      if (p.falta > queda) break
      queda -= p.falta
      cubiertas.push(p)
    }
    if (cubiertas.length) {
      await anotarTramitacion(cubiertas, { ...pedido, linea: l.linea }, empleado)
      n += cubiertas.length
    }
  }
  return n
}
