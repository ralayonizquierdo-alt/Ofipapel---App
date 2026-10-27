import { supabase } from '../../lib/supabase'

// «Actualizado» de Modificación de Precios: vuelca el lote en artículos (articulo_precio_nivel,
// articulo.pvp y fecha_ultima_modificacion_pvp), en las ofertas por cantidades y en los
// precios pactados de clientes, según las pestañas «Actualización en …».

export interface NivelMod {
  pvp: number
  pct: number | null
  modo: string | null
}

export interface LineaMod {
  id?: number
  articulo_codigo: string
  cantidad: number
  niveles: NivelMod[]
}

export interface CabeceraMod {
  codigo: string
  concepto: string
  son_precios_oferta: boolean
  fecha_desde: string | null
  fecha_hasta: string | null
  actualizar_articulos: boolean
  actualizar_ofertas_cantidad: boolean
  cant_min_menor2_en_principales: boolean
  /** 0 solo coincidentes · 1 coincidentes y nuevas · 2 borrar viejas y añadir · 3 añadir todas como nuevas */
  tipo_actualizacion_articulos: number
  actualizar_clientes: boolean
  /** 0 solo coincidentes · 1 coincidentes y nuevos · 2 borrar viejos y añadir */
  tipo_actualizacion_clientes: number
  clientes_segun_tarifa_cliente: boolean
  clientes_tarifa_nivel: number | null
  es_pacto_tarifas: boolean
  pacto_tienda_codigo: string | null
  pacto_pedido_numero: number | null
}

async function preciosPrincipales(l: LineaMod, ahora: string) {
  const { error } = await supabase.from('articulo_precio_nivel').upsert(
    l.niveles.map((n, i) => ({ articulo_codigo: l.articulo_codigo, nivel_tarifa: i, pvp: n.pvp, incremento_pct: n.pct, modo_calculo: n.modo })),
    { onConflict: 'articulo_codigo,nivel_tarifa' },
  )
  if (error) return error.message
  const { error: e2 } = await supabase.from('articulo').update({ pvp: l.niveles[0]?.pvp ?? 0, fecha_ultima_modificacion_pvp: ahora }).eq('codigo_interno', l.articulo_codigo)
  return e2?.message ?? null
}

async function nivelesOferta(id: number, l: LineaMod) {
  await supabase.from('articulo_tarifa_cantidad_nivel').delete().eq('articulo_tarifa_cantidad_id', id)
  const { error } = await supabase
    .from('articulo_tarifa_cantidad_nivel')
    .insert(l.niveles.map((n, i) => ({ articulo_tarifa_cantidad_id: id, nivel_tarifa: i, pvp: n.pvp, incremento_pct: n.pct, modo_calculo: n.modo })))
  return error?.message ?? null
}

async function ofertaCantidad(cab: CabeceraMod, l: LineaMod) {
  // Solo las ofertas por cantidades del propio artículo (las de una Tarifa de Oferta llevan oferta_codigo).
  const { data } = await supabase.from('articulo_tarifa_cantidad').select('id, cantidad_desde').eq('articulo_codigo', l.articulo_codigo).is('oferta_codigo', null)
  const viejas = (data ?? []) as { id: number; cantidad_desde: number }[]
  const coinciden = viejas.filter((v) => Number(v.cantidad_desde) === l.cantidad)
  const tipo = cab.tipo_actualizacion_articulos
  if (tipo === 2 && viejas.length) {
    const ids = viejas.map((v) => v.id)
    await supabase.from('articulo_tarifa_cantidad_nivel').delete().in('articulo_tarifa_cantidad_id', ids)
    await supabase.from('articulo_tarifa_cantidad').delete().in('id', ids)
  }
  if (tipo <= 1)
    for (const v of coinciden) {
      await supabase.from('articulo_tarifa_cantidad').update({ fecha_desde: cab.fecha_desde, fecha_hasta: cab.fecha_hasta }).eq('id', v.id)
      const e = await nivelesOferta(v.id, l)
      if (e) return e
    }
  if (tipo === 2 || tipo === 3 || (tipo === 1 && !coinciden.length)) {
    const { data: nueva, error } = await supabase
      .from('articulo_tarifa_cantidad')
      .insert({ articulo_codigo: l.articulo_codigo, cantidad_desde: l.cantidad, descripcion_oferta: cab.concepto.slice(0, 20), fecha_desde: cab.fecha_desde, fecha_hasta: cab.fecha_hasta })
      .select('id')
      .single()
    if (error) return error.message
    return nivelesOferta((nueva as { id: number }).id, l)
  }
  return null
}

async function clientes(cab: CabeceraMod, lineas: LineaMod[]) {
  const arts = [...new Set(lineas.map((l) => l.articulo_codigo))]
  let codigos: string[]
  if (cab.es_pacto_tarifas) {
    const { data } = await supabase
      .from('pedido_cliente')
      .select('cliente_codigo')
      .eq('tienda_terminal_codigo', cab.pacto_tienda_codigo ?? '')
      .eq('numero', cab.pacto_pedido_numero ?? -1)
      .maybeSingle()
    const c = (data as { cliente_codigo: string | null } | null)?.cliente_codigo
    if (!c) return { error: 'No se encuentra el pedido del pacto de tarifas.', n: 0 }
    codigos = [c]
  } else {
    // «Coincidentes»: clientes que ya tienen precio pactado de esos artículos; con «y los nuevos»
    // o «eliminar y añadir», cualquier cliente que tenga precios pactados.
    // De 1000 en 1000: PostgREST corta cada respuesta en 1000 filas (un limit(10000) se quedaba
    // a medias sin avisar con los precios pactados reales).
    const vistos = new Set<string>()
    for (let desde = 0; ; desde += 1000) {
      let q = supabase.from('cliente_articulo_precio').select('cliente_codigo')
      if (cab.tipo_actualizacion_clientes === 0) q = q.in('articulo_codigo', arts)
      const { data } = await q.order('cliente_codigo').order('articulo_codigo').range(desde, desde + 999)
      for (const r of (data ?? []) as { cliente_codigo: string }[]) vistos.add(r.cliente_codigo)
      if (!data || data.length < 1000) break
    }
    codigos = [...vistos]
  }
  if (!codigos.length) return { error: null, n: 0 }
  const { data: cls } = await supabase.from('cliente').select('codigo, tarifa_nivel_defecto').in('codigo', codigos)
  const nivelDe = new Map(((cls ?? []) as { codigo: string; tarifa_nivel_defecto: number | null }[]).map((c) => [c.codigo, c.tarifa_nivel_defecto ?? 0]))
  const { data: ex } = await supabase.from('cliente_articulo_precio').select('cliente_codigo, articulo_codigo').in('cliente_codigo', codigos).in('articulo_codigo', arts)
  const existe = new Set(((ex ?? []) as { cliente_codigo: string; articulo_codigo: string }[]).map((r) => `${r.cliente_codigo}|${r.articulo_codigo}`))
  if (cab.tipo_actualizacion_clientes === 2) {
    const { error } = await supabase.from('cliente_articulo_precio').delete().in('cliente_codigo', codigos).in('articulo_codigo', arts)
    if (error) return { error: error.message, n: 0 }
  }
  const filas = codigos.flatMap((c) =>
    lineas
      .filter((l) => cab.tipo_actualizacion_clientes !== 0 || existe.has(`${c}|${l.articulo_codigo}`))
      .map((l) => {
        const nivel = cab.clientes_segun_tarifa_cliente ? (nivelDe.get(c) ?? 0) : (cab.clientes_tarifa_nivel ?? 0)
        return {
          cliente_codigo: c,
          articulo_codigo: l.articulo_codigo,
          pvp: l.niveles[nivel]?.pvp ?? l.niveles[0]?.pvp ?? 0,
          cantidad_minima: l.cantidad || null,
          fecha_inicio: cab.fecha_desde,
          fecha_fin: cab.fecha_hasta,
        }
      }),
  )
  if (!filas.length) return { error: null, n: 0 }
  const { error } = await supabase.from('cliente_articulo_precio').upsert(filas, { onConflict: 'cliente_codigo,articulo_codigo' })
  return { error: error?.message ?? null, n: filas.length }
}

/** Aplica el lote. Devuelve un resumen o lanza el primer error. */
export async function aplicarModificacionPrecios(cab: CabeceraMod, lineas: LineaMod[]): Promise<string> {
  const ahora = new Date().toISOString()
  let nArt = 0
  let nOfe = 0
  if (cab.actualizar_articulos)
    for (const l of lineas) {
      const principal = !cab.son_precios_oferta || (l.cantidad < 2 && cab.cant_min_menor2_en_principales)
      if (principal) {
        const e = await preciosPrincipales(l, ahora)
        if (e) throw new Error(`${l.articulo_codigo}: ${e}`)
        nArt++
      } else if (cab.actualizar_ofertas_cantidad) {
        const e = await ofertaCantidad(cab, l)
        if (e) throw new Error(`${l.articulo_codigo}: ${e}`)
        nOfe++
      }
    }
  let nCli = 0
  if (cab.actualizar_clientes) {
    const r = await clientes(cab, lineas)
    if (r.error) throw new Error(r.error)
    nCli = r.n
  }
  const ids = lineas.map((l) => l.id).filter(Boolean) as number[]
  if (ids.length) await supabase.from('modificacion_precio_linea').update({ fecha_modificacion_pvp: ahora }).in('id', ids)
  const { error } = await supabase.from('modificacion_precio').update({ actualizado: true }).eq('codigo', cab.codigo)
  if (error) throw new Error(error.message)
  return `Actualizados ${nArt} artículos, ${nOfe} ofertas por cantidades y ${nCli} precios de clientes.`
}
