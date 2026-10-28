import { supabase } from '../../../lib/supabase'
import { fechaTrabajo, horaTrabajo } from '../../../lib/sesionTrabajo'
import type { RegistroFacturacion } from '../../../lib/verifactu'

// Ficha Ventas / Facturas de GeminisWin (VENTAS + VENTDETA). El TPV usa el mismo documento.

export interface LineaVenta {
  key: string
  articulo_codigo: string | null // null = línea de solo texto
  codigo_venta: string
  descripcion: string
  cantidad: number
  precio: number
  descuento_pct: number
  igic_pct: number
  impuesto2_pct: number // canon
  tarifa_nivel: number
  // Datos informativos del artículo para el aviso al situarse en la línea
  codigo_compra: string | null
  stock: number | null
  sin_control_stock: boolean
  unidades_pendientes: number
}

export interface CabeceraVenta {
  tienda: string
  numero: number | null // null hasta guardar: el número se asigna al guardar, no al abrir
  fecha: string
  hora: string
  cliente_codigo: string
  cliente_nombre: string
  cliente_nif: string | null
  sucursal: string | null
  tarifa_nivel: number
  empleado_codigo: string | null
  descuento_pie_pct: number
  igic_pie_pct: number
  factura_tienda: string | null
  factura_numero: number | null
  total_pagado: number
  total_pendiente: number
  total_efectivo: number
  total_tarjeta: number
  tipo_credito: string | null
  aplazada: boolean
  observaciones: string | null
  // Rectificativa: venta original que corrige (abono). VeriFactu la registra como R5 (simplificada) o R1.
  rectifica_tienda: string | null
  rectifica_numero: number | null
  anulada: boolean
}

/** Registros VeriFactu de una venta: alta (al emitirse) y, si se anuló, anulación. */
export interface VerifactuVenta {
  alta: RegistroFacturacion | null
  anulacion: RegistroFacturacion | null
}

export const NIVELES = ['General', 'MAYOR M-1', 'MAYOR M-2', 'MAYOR M-3', 'Tarifa Dto-4', 'Tarifa Dto-5', 'Tarifa Dto-6']

export const r3 = (n: number) => Math.round(n * 1000) / 1000
export const r2 = (n: number) => Math.round(n * 100) / 100

let seq = 0
export const nuevaClave = () => `l${Date.now()}_${seq++}`

/** Fecha de trabajo (Utilidades → Cambio de Fecha), por defecto hoy. */
export function hoyISO() {
  return fechaTrabajo()
}

export function horaActual() {
  return horaTrabajo()
}

export function lineaVacia(tarifa: number): LineaVenta {
  return {
    key: nuevaClave(),
    articulo_codigo: null,
    codigo_venta: '',
    descripcion: '',
    cantidad: 1,
    precio: 0,
    descuento_pct: 0,
    igic_pct: 7,
    impuesto2_pct: 0,
    tarifa_nivel: tarifa,
    codigo_compra: null,
    stock: null,
    sin_control_stock: false,
    unidades_pendientes: 0,
  }
}

export function baseLinea(l: LineaVenta) {
  return r3(l.cantidad * l.precio * (1 - (l.descuento_pct || 0) / 100))
}

export function canonLinea(l: LineaVenta) {
  return r3((baseLinea(l) * (l.impuesto2_pct || 0)) / 100)
}

export function subtotalLinea(l: LineaVenta) {
  return r3(baseLinea(l) + canonLinea(l))
}

/** Totales del pie: suma de líneas, dto. de pie, IGIC (por línea más el de pie) y total. */
export function calcularPie(lineas: LineaVenta[], cab: Pick<CabeceraVenta, 'descuento_pie_pct' | 'igic_pie_pct'>) {
  const suma = r3(lineas.reduce((a, l) => a + subtotalLinea(l), 0))
  const factorPie = 1 - (cab.descuento_pie_pct || 0) / 100
  const descuento = r3(suma - suma * factorPie)
  const base = r3(suma - descuento)
  const igicLineas = lineas.reduce((a, l) => a + subtotalLinea(l) * factorPie * ((l.igic_pct || 0) / 100), 0)
  const igic = r3(igicLineas + (base * (cab.igic_pie_pct || 0)) / 100)
  const total = r2(base + igic)
  return { suma, descuento, base, igic, total }
}

interface ArticuloVenta {
  codigo_interno: string
  descripcion: string
  codigo_venta: string | null
  codigo_compra_habitual: string | null
  igic_pct: number | null
  impuesto2_pct: number | null
  pvp: number | null
  sin_control_stock: boolean
  unidades_pedidas: number | null
  activo: boolean
  no_ver_en_venta: boolean
}

const COLS_ARTICULO =
  'codigo_interno, descripcion, codigo_venta, codigo_compra_habitual, igic_pct, impuesto2_pct, pvp, sin_control_stock, unidades_pedidas, activo, no_ver_en_venta'

/** Busca el artículo por código de venta, código interno o código de barras (como el campo «Cod. Venta»). */
export async function buscarArticulo(codigo: string): Promise<ArticuloVenta | null> {
  const c = codigo.trim()
  if (!c) return null
  for (const col of ['codigo_venta', 'codigo_interno', 'codigo_barras_principal']) {
    const { data } = await supabase.from('articulo').select(COLS_ARTICULO).eq(col, c).limit(1).maybeSingle()
    if (data) return data as ArticuloVenta
  }
  const { data: barra } = await supabase.from('articulo_codigo_barras').select('articulo_codigo').eq('codigo_barras', c).limit(1).maybeSingle()
  if (barra) {
    const { data } = await supabase.from('articulo').select(COLS_ARTICULO).eq('codigo_interno', barra.articulo_codigo).maybeSingle()
    return (data as ArticuloVenta) ?? null
  }
  return null
}

/** Precio por orden de prioridad: precio fijo del cliente vigente → tarifa del nivel → PVP general. */
export async function precioArticulo(articulo: string, cliente: string, nivel: number, cantidad: number, pvpGeneral: number | null) {
  const hoy = hoyISO()
  if (cliente) {
    const { data: fijos } = await supabase
      .from('cliente_articulo_precio')
      .select('pvp, cantidad_minima, fecha_inicio, fecha_fin')
      .eq('cliente_codigo', cliente)
      .eq('articulo_codigo', articulo)
    const vigente = (fijos ?? [])
      .filter((f) => (!f.fecha_inicio || f.fecha_inicio <= hoy) && (!f.fecha_fin || f.fecha_fin >= hoy))
      .filter((f) => f.cantidad_minima == null || Number(f.cantidad_minima) <= Math.abs(cantidad))
      .sort((a, b) => Number(b.cantidad_minima ?? 0) - Number(a.cantidad_minima ?? 0))[0]
    if (vigente) return { precio: Number(vigente.pvp), fijo: true }
  }
  const { data: nivelRow } = await supabase
    .from('articulo_precio_nivel')
    .select('pvp')
    .eq('articulo_codigo', articulo)
    .eq('nivel_tarifa', nivel)
    .maybeSingle()
  if (nivelRow && Number(nivelRow.pvp) > 0) return { precio: Number(nivelRow.pvp), fijo: false }
  return { precio: Number(pvpGeneral ?? 0), fijo: false }
}

/** Rellena una línea a partir del código tecleado. Devuelve null si el artículo no existe. */
export async function lineaDesdeArticulo(
  base: LineaVenta,
  codigo: string,
  cliente: string,
  almacen: string | null,
): Promise<LineaVenta | null> {
  const art = await buscarArticulo(codigo)
  if (!art) return null
  const { precio } = await precioArticulo(art.codigo_interno, cliente, base.tarifa_nivel, base.cantidad, art.pvp)
  let stock: number | null = null
  if (almacen) {
    const { data } = await supabase
      .from('articulo_almacen_stock')
      .select('cantidad_actual')
      .eq('articulo_codigo', art.codigo_interno)
      .eq('almacen_codigo', almacen)
      .maybeSingle()
    stock = data ? Number(data.cantidad_actual) : null
  }
  return {
    ...base,
    articulo_codigo: art.codigo_interno,
    codigo_venta: art.codigo_venta || art.codigo_interno,
    descripcion: art.descripcion,
    precio,
    igic_pct: art.igic_pct == null ? 7 : Number(art.igic_pct),
    impuesto2_pct: Number(art.impuesto2_pct ?? 0),
    codigo_compra: art.codigo_compra_habitual,
    stock,
    sin_control_stock: art.sin_control_stock,
    unidades_pendientes: Number(art.unidades_pedidas ?? 0),
  }
}

export async function cargarVenta(tienda: string, numero: number, almacen: string | null) {
  const { data: v } = await supabase.from('venta').select('*').eq('tienda_terminal_codigo', tienda).eq('numero', numero).maybeSingle()
  if (!v) return null
  const { data: ls } = await supabase
    .from('venta_linea')
    .select('*')
    .eq('tienda_terminal_codigo', tienda)
    .eq('numero', numero)
    .order('numero_linea')
  const codigos = [...new Set((ls ?? []).map((l) => l.articulo_codigo).filter(Boolean))] as string[]
  const infoArt = new Map<string, { codigo_compra_habitual: string | null; sin_control_stock: boolean; unidades_pedidas: number | null }>()
  const stocks = new Map<string, number>()
  if (codigos.length) {
    const { data: arts } = await supabase
      .from('articulo')
      .select('codigo_interno, codigo_compra_habitual, sin_control_stock, unidades_pedidas')
      .in('codigo_interno', codigos)
    for (const a of arts ?? []) infoArt.set(a.codigo_interno, a)
    if (almacen) {
      const { data: st } = await supabase
        .from('articulo_almacen_stock')
        .select('articulo_codigo, cantidad_actual')
        .eq('almacen_codigo', almacen)
        .in('articulo_codigo', codigos)
      for (const s of st ?? []) stocks.set(s.articulo_codigo, Number(s.cantidad_actual))
    }
  }
  const cab: CabeceraVenta = {
    tienda: v.tienda_terminal_codigo,
    numero: Number(v.numero),
    fecha: v.fecha ?? hoyISO(),
    hora: v.hora ?? '',
    cliente_codigo: v.cliente_codigo,
    cliente_nombre: v.nombre_cliente ?? '',
    cliente_nif: v.nif_cliente,
    sucursal: v.cliente_sucursal_codigo,
    tarifa_nivel: v.tarifa_nivel ?? 0,
    empleado_codigo: v.empleado_codigo,
    descuento_pie_pct: Number(v.descuento_pie_pct ?? 0),
    igic_pie_pct: Number(v.igic_pie_pct ?? 0),
    factura_tienda: v.factura_tienda_codigo,
    factura_numero: v.factura_numero,
    total_pagado: Number(v.total_pagado ?? 0),
    total_pendiente: Number(v.total_pendiente ?? 0),
    total_efectivo: Number(v.total_efectivo ?? 0),
    total_tarjeta: Number(v.total_tarjeta ?? 0),
    tipo_credito: v.tipo_credito,
    aplazada: Boolean(v.aplazada),
    observaciones: v.observaciones,
    rectifica_tienda: v.venta_rectificada_tienda_codigo ?? null,
    rectifica_numero: v.venta_rectificada_numero == null ? null : Number(v.venta_rectificada_numero),
    anulada: v.anulada_en != null,
  }
  const lineas: LineaVenta[] = (ls ?? []).map((l) => {
    const info = l.articulo_codigo ? infoArt.get(l.articulo_codigo) : undefined
    return {
      key: nuevaClave(),
      articulo_codigo: l.articulo_codigo,
      codigo_venta: l.codigo_venta ?? l.articulo_codigo ?? '',
      descripcion: l.descripcion ?? '',
      cantidad: Number(l.cantidad),
      precio: Number(l.precio ?? 0),
      descuento_pct: Number(l.descuento_pct ?? 0),
      igic_pct: Number(l.igic_pct ?? 0),
      impuesto2_pct: Number(l.impuesto2_pct ?? 0),
      tarifa_nivel: l.tarifa_modo != null && /^\d$/.test(l.tarifa_modo) ? Number(l.tarifa_modo) : cab.tarifa_nivel,
      codigo_compra: info?.codigo_compra_habitual ?? null,
      stock: l.articulo_codigo && stocks.has(l.articulo_codigo) ? stocks.get(l.articulo_codigo)! : null,
      sin_control_stock: info?.sin_control_stock ?? false,
      unidades_pendientes: Number(info?.unidades_pedidas ?? 0),
    }
  })
  return { cab, lineas, verifactu: await cargarVerifactuVenta(tienda, numero) }
}

export async function cargarVerifactuVenta(tienda: string, numero: number): Promise<VerifactuVenta> {
  const { data } = await supabase
    .from('registro_facturacion')
    .select('*')
    .eq('origen_tipo', 'venta')
    .eq('origen_tienda_codigo', tienda)
    .eq('origen_numero', numero)
  const regs = (data ?? []) as RegistroFacturacion[]
  return { alta: regs.find((r) => r.tipo_registro === 'alta') ?? null, anulacion: regs.find((r) => r.tipo_registro === 'anulacion') ?? null }
}

/** Anula una venta emitida: registro VeriFactu de anulación + baja lógica + devolución de stock (en BD). */
export async function anularVenta(tienda: string, numero: number, motivo: string) {
  const { error } = await supabase.rpc('fn_verifactu_anular_venta', { p_tienda: tienda, p_numero: numero, p_motivo: motivo })
  if (error) throw new Error(error.message)
}

export interface Cobro {
  efectivo: number
  tarjeta: number
}

async function siguienteNumero(tienda: string, tipo: string) {
  const { data, error } = await supabase.rpc('fn_siguiente_numero', { p_tienda: tienda, p_tipo_documento: tipo, p_serie: '' })
  if (error) throw new Error(error.message)
  return Number(data)
}

/** Movimientos de stock de las líneas (venta resta; las cantidades negativas, devoluciones, suman). */
function movimientosStock(lineas: LineaVenta[], tienda: string, numero: number, almacen: string, empleado: string | null, signo: 1 | -1, tipoAnulacion = false) {
  return lineas
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.articulo_codigo && !l.sin_control_stock && l.cantidad !== 0)
    .map(({ l, i }) => {
      const devolucion = l.cantidad < 0
      const sentido = (devolucion ? -signo : signo) as 1 | -1
      return {
        tipo_movimiento: tipoAnulacion ? 'venta' : devolucion ? 'devolucion_cliente' : 'venta',
        sentido,
        almacen_codigo: almacen,
        articulo_codigo: l.articulo_codigo!,
        cantidad: Math.abs(l.cantidad),
        documento_origen_tipo: 'venta',
        documento_origen_tienda_codigo: tienda,
        documento_origen_numero: numero,
        documento_origen_linea: i + 1,
        tienda_terminal_codigo: tienda,
        empleado_codigo: empleado,
        observaciones: tipoAnulacion ? 'Anulación de línea al modificar la venta' : null,
      }
    })
}

/**
 * Guarda la venta. En alta asigna número aquí (nunca al abrir). Si se aplaza, guarda sin
 * mover stock ni caja; al completarla después se hacen los movimientos. Al modificar una
 * venta ya completada se deshace el stock de las líneas anteriores y se aplica el nuevo.
 */
export async function guardarVenta(opts: {
  cab: CabeceraVenta
  lineas: LineaVenta[]
  almacen: string
  empleado: string | null
  aplazar: boolean
  cobro: Cobro
  lineasPrevias: LineaVenta[] | null // líneas guardadas antes (modificación)
  previaAplazada: boolean
}): Promise<number> {
  const { cab, lineas, almacen, empleado, aplazar, cobro, lineasPrevias, previaAplazada } = opts
  const pie = calcularPie(lineas, cab)
  const tienda = cab.tienda
  const esAlta = cab.numero == null
  const numero = esAlta ? await siguienteNumero(tienda, 'venta') : cab.numero!
  const cobrado = aplazar ? 0 : r2(cobro.efectivo + cobro.tarjeta)
  const pagadoTotal = r2(cab.total_pagado + cobrado)
  const pendiente = aplazar ? pie.total : Math.max(r2(pie.total - pagadoTotal), 0)

  const cabecera = {
    tienda_terminal_codigo: tienda,
    numero,
    fecha: cab.fecha,
    hora: cab.hora,
    almacen_codigo: almacen,
    cliente_codigo: cab.cliente_codigo,
    cliente_sucursal_codigo: cab.sucursal,
    nombre_cliente: cab.cliente_nombre,
    nif_cliente: cab.cliente_nif,
    tarifa_nivel: cab.tarifa_nivel,
    empleado_codigo: cab.empleado_codigo ?? empleado,
    tipo_credito: pendiente > 0 ? 'Crédito' : 'Contado',
    subtotal: pie.suma,
    descuento_pie_pct: cab.descuento_pie_pct,
    total_descuento_pie: pie.descuento,
    subtotal_2: pie.base,
    igic_pie_pct: cab.igic_pie_pct,
    total_igic_pie: pie.igic,
    total: pie.total,
    total_efectivo: r2(cab.total_efectivo + (aplazar ? 0 : cobro.efectivo)),
    total_tarjeta: r2(cab.total_tarjeta + (aplazar ? 0 : cobro.tarjeta)),
    total_pagado: aplazar ? cab.total_pagado : pagadoTotal,
    total_pendiente: pendiente,
    fecha_pago: !aplazar && cobrado > 0 ? hoyISO() : undefined,
    // Se graba siempre como aplazada y se completa al final (ver más abajo): ese paso emite el
    // registro VeriFactu en la misma transacción, ya con todas las líneas grabadas.
    aplazada: true,
    observaciones: cab.observaciones,
    venta_rectificada_tienda_codigo: cab.rectifica_tienda,
    venta_rectificada_numero: cab.rectifica_numero,
  }

  if (esAlta) {
    const { error } = await supabase.from('venta').insert(cabecera)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('venta').update(cabecera).eq('tienda_terminal_codigo', tienda).eq('numero', numero)
    if (error) throw new Error(error.message)
    // Deshacer el stock de las líneas anteriores si ya se había movido
    if (lineasPrevias && !previaAplazada) {
      const rev = movimientosStock(lineasPrevias, tienda, numero, almacen, empleado, 1, true)
      if (rev.length) {
        const { error: e } = await supabase.from('movimiento_stock').insert(rev)
        if (e) throw new Error(e.message)
      }
    }
    const { error: delErr } = await supabase.from('venta_linea').delete().eq('tienda_terminal_codigo', tienda).eq('numero', numero)
    if (delErr) throw new Error(delErr.message)
  }

  const filas = lineas.map((l, i) => {
    const b = baseLinea(l)
    return {
      tienda_terminal_codigo: tienda,
      numero,
      numero_linea: i + 1,
      almacen_codigo: almacen,
      fecha: cab.fecha,
      hora: cab.hora,
      articulo_codigo: l.articulo_codigo,
      codigo_venta: l.codigo_venta || null,
      codigo_compra: l.codigo_compra,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precio: l.precio,
      descuento_pct: l.descuento_pct,
      subtotal: subtotalLinea(l),
      igic_pct: l.igic_pct,
      total_igic: r3((subtotalLinea(l) * l.igic_pct) / 100),
      total_base: b,
      impuesto2_pct: l.impuesto2_pct,
      total_impuesto2: canonLinea(l),
      tarifa_modo: String(l.tarifa_nivel),
      empleado_codigo: cab.empleado_codigo ?? empleado,
    }
  })
  if (filas.length) {
    const { error } = await supabase.from('venta_linea').insert(filas)
    if (error) throw new Error(error.message)
  }

  if (!aplazar) {
    // Completar = emitir: el trigger de BD crea el registro VeriFactu (huella encadenada) y
    // desde ese momento la venta y sus líneas quedan bloqueadas.
    const { error: eEmitir } = await supabase.from('venta').update({ aplazada: false }).eq('tienda_terminal_codigo', tienda).eq('numero', numero)
    if (eEmitir) throw new Error(eEmitir.message)
  }

  if (!aplazar) {
    const movs = movimientosStock(lineas, tienda, numero, almacen, empleado, -1)
    if (movs.length) {
      const { error } = await supabase.from('movimiento_stock').insert(movs)
      if (error) throw new Error(error.message)
    }
    for (const [forma, importe] of [
      ['efectivo', cobro.efectivo],
      ['tarjeta', cobro.tarjeta],
    ] as const) {
      if (importe <= 0) continue
      const codigoPago = await siguienteNumero(tienda, 'pago')
      const { error: eCobro } = await supabase.from('cobro_cliente').insert({
        tienda_terminal_codigo: tienda,
        codigo_pago: codigoPago,
        cliente_codigo: cab.cliente_codigo,
        fecha_pago: hoyISO(),
        fecha: hoyISO(),
        importe_cobrado: importe,
        estado_cobro: 'cobrado',
        tipo_pago: forma,
        concepto: `Venta ${tienda}-${numero}`,
        venta_relacionada_tienda_codigo: tienda,
        venta_relacionada_numero: numero,
      })
      if (eCobro) throw new Error(eCobro.message)
      const numeroMov = await siguienteNumero(tienda, 'caja')
      const { error: eCaja } = await supabase.from('movimiento_caja').insert({
        tienda_terminal_codigo: tienda,
        numero: numeroMov,
        fecha: hoyISO(),
        hora: horaActual(),
        es_ingreso: true,
        ingreso: importe,
        concepto: `${esAlta || previaAplazada ? 'Venta' : 'Modif. Venta'} Nº ${numero} - Tienda ${tienda} - Cli. ${cab.cliente_codigo}`,
        documento: 'venta',
        tipo_movimiento: 'VTA',
        // Clase de forma de pago como en GeminisWin: 4 contado; tipo contado 1 efectivo · 2 tarjeta.
        tipo_forma_pago: 4,
        tipo_contado: forma === 'efectivo' ? 1 : 2,
        forma_pago_codigo: forma === 'efectivo' ? '01' : '02',
        ajeno_tienda_codigo: tienda,
        ajeno_codigo: numero,
        cliente_codigo: cab.cliente_codigo,
        empleado_codigo: cab.empleado_codigo ?? empleado,
      })
      if (eCaja) throw new Error(eCaja.message)
    }
    // Cobro en efectivo: se abre el cajón (y queda apuntado, como en GeminisWin).
    if (cobro.efectivo > 0) {
      const aviso = await apuntarAperturaCajon({ tienda, empleado: cab.empleado_codigo ?? empleado, motivo: esAlta || previaAplazada ? 'Venta' : 'Modif. venta', venta: { tienda, numero } })
      if (aviso) console.error(aviso)
    }
  }
  return numero
}

/** Cobro posterior de una venta pendiente (botón Pagar en consulta). */
export async function cobrarVenta(cab: CabeceraVenta, total: number, cobro: Cobro, empleado: string | null) {
  const tienda = cab.tienda
  const numero = cab.numero!
  const importe = r2(cobro.efectivo + cobro.tarjeta)
  const pagado = r2(cab.total_pagado + importe)
  const pendiente = Math.max(r2(total - pagado), 0)
  const { error } = await supabase
    .from('venta')
    .update({
      total_efectivo: r2(cab.total_efectivo + cobro.efectivo),
      total_tarjeta: r2(cab.total_tarjeta + cobro.tarjeta),
      total_pagado: pagado,
      total_pendiente: pendiente,
      fecha_pago: hoyISO(),
    })
    .eq('tienda_terminal_codigo', tienda)
    .eq('numero', numero)
  if (error) throw new Error(error.message)
  for (const [forma, imp] of [
    ['efectivo', cobro.efectivo],
    ['tarjeta', cobro.tarjeta],
  ] as const) {
    if (imp <= 0) continue
    const codigoPago = await siguienteNumero(tienda, 'pago')
    const { error: e1 } = await supabase.from('cobro_cliente').insert({
      tienda_terminal_codigo: tienda,
      codigo_pago: codigoPago,
      cliente_codigo: cab.cliente_codigo,
      fecha_pago: hoyISO(),
      fecha: hoyISO(),
      importe_cobrado: imp,
      estado_cobro: 'cobrado',
      tipo_pago: forma,
      concepto: `Cobro venta ${tienda}-${numero}`,
      venta_relacionada_tienda_codigo: tienda,
      venta_relacionada_numero: numero,
    })
    if (e1) throw new Error(e1.message)
    const numeroMov = await siguienteNumero(tienda, 'caja')
    const { error: e2 } = await supabase.from('movimiento_caja').insert({
      tienda_terminal_codigo: tienda,
      numero: numeroMov,
      fecha: hoyISO(),
      hora: horaActual(),
      es_ingreso: true,
      ingreso: imp,
      concepto: `Cobro Venta Nº ${numero} - Tienda ${tienda} - Cli. ${cab.cliente_codigo}`,
      documento: 'cobro',
      tipo_movimiento: 'VTA',
      tipo_forma_pago: 4,
      tipo_contado: forma === 'efectivo' ? 1 : 2,
      forma_pago_codigo: forma === 'efectivo' ? '01' : '02',
      ajeno_tienda_codigo: tienda,
      ajeno_codigo: numero,
      cliente_codigo: cab.cliente_codigo,
      empleado_codigo: empleado,
    })
    if (e2) throw new Error(e2.message)
  }
  if (cobro.efectivo > 0) {
    const aviso = await apuntarAperturaCajon({ tienda, empleado, motivo: 'Cobro venta', venta: { tienda, numero } })
    if (aviso) console.error(aviso)
  }
}

/**
 * Apunta una apertura del cajón portamonedas en `apertura_cajon` (lo que lee Listados → List.
 * Apert. Cajón), como GeminisWin: cada cobro en efectivo y cada apertura a mano desde el TPV.
 * La fecha y la hora (de Canarias) las pone la base de datos. Si no se puede apuntar, no
 * deshace la venta ni el cobro: devuelve el error para avisar.
 */
export async function apuntarAperturaCajon(a: { tienda: string; empleado: string | null; motivo: string; venta?: { tienda: string; numero: number } | null }) {
  const { error } = await supabase.from('apertura_cajon').insert({
    tienda_terminal_codigo: a.tienda,
    empleado_codigo: a.empleado,
    motivo: a.motivo,
    venta_tienda_codigo: a.venta?.tienda ?? null,
    venta_numero: a.venta?.numero ?? null,
  })
  return error ? `No se pudo apuntar la apertura del cajón: ${error.message}` : null
}

export async function cajaAbierta(tienda: string) {
  const { data } = await supabase
    .from('caja_apertura_cierre')
    .select('ejercicio')
    .eq('tienda_terminal_codigo', tienda)
    .eq('cerrado', false)
    .limit(1)
    .maybeSingle()
  return Boolean(data)
}
