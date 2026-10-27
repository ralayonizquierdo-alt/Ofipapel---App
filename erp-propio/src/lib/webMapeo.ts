import type { WcPedido, WcProducto } from './woocommerce'

// Funciones puras del menú «Web»: convierten un pedido de WooCommerce en un pedido de
// cliente del ERP (sin escribir nada) y cruzan el catálogo de la web con los artículos.
// Sin acceso a red ni a la base de datos: se pueden probar con datos simulados.

export const r2 = (n: number) => Math.round(n * 100) / 100
export const r3 = (n: number) => Math.round(n * 1000) / 1000
const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function normalizar(s: string | null | undefined) {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export const soloDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')
/** Últimos 9 dígitos (teléfono español sin prefijo). */
export const telefono9 = (s: string | null | undefined) => soloDigitos(s).slice(-9)

/* ---------- Artículos y clientes del ERP (lo justo para cruzar) ---------- */

export interface ArticuloCruce {
  codigo_interno: string
  codigo_venta: string | null
  codigo_compra_habitual?: string | null
  codigo_barras_principal: string | null
  descripcion: string
  pvp: number | null
  igic_pct: number | null
  impuesto2_pct?: number | null
  web_id_link?: number | null
  web_publicado?: boolean | null
  web_descripcion?: string | null
  web_categoria?: string | null
  imagen_url?: string | null
  familia_codigo?: string | null
  observaciones?: string | null
  web_observaciones?: string | null
  garantia_meses?: number | null
}

export interface IndiceArticulos {
  porCodigo: Map<string, ArticuloCruce>
  porWebId: Map<number, ArticuloCruce>
}

/** Índice por código interno, código de venta, código de barras (principal y extra) y id web. */
export function indexarArticulos(arts: ArticuloCruce[], barrasExtra: { articulo_codigo: string; codigo_barras: string }[] = []): IndiceArticulos {
  const porCodigo = new Map<string, ArticuloCruce>()
  const porWebId = new Map<number, ArticuloCruce>()
  const poner = (k: string | null | undefined, a: ArticuloCruce) => {
    const c = (k ?? '').trim().toUpperCase()
    if (c && !porCodigo.has(c)) porCodigo.set(c, a)
  }
  // Orden de prioridad: código interno > código de venta > código de barras
  for (const a of arts) poner(a.codigo_interno, a)
  for (const a of arts) poner(a.codigo_venta, a)
  for (const a of arts) poner(a.codigo_barras_principal, a)
  const porInterno = new Map(arts.map((a) => [a.codigo_interno, a]))
  for (const b of barrasExtra) {
    const a = porInterno.get(b.articulo_codigo)
    if (a) poner(b.codigo_barras, a)
  }
  for (const a of arts) if (a.web_id_link) porWebId.set(Number(a.web_id_link), a)
  return { porCodigo, porWebId }
}

export function buscarPorSku(ix: IndiceArticulos, sku: string | null | undefined, productId?: number, variationId?: number) {
  const c = (sku ?? '').trim().toUpperCase()
  if (c && ix.porCodigo.has(c)) return { articulo: ix.porCodigo.get(c)!, via: 'SKU' }
  if (variationId && ix.porWebId.has(variationId)) return { articulo: ix.porWebId.get(variationId)!, via: 'código web' }
  if (productId && ix.porWebId.has(productId)) return { articulo: ix.porWebId.get(productId)!, via: 'código web' }
  return null
}

export interface ClienteCruce {
  codigo: string
  nombre: string
  nif: string | null
  email: string | null
  telefono_movil: string | null
  telefono_fijo: string | null
  web_id_cliente: number | null
  vendedor_codigo?: string | null
  forma_pago_codigo?: string | null
  tipo_credito?: string | null
  ruta_codigo?: string | null
  tarifa_nivel_defecto?: number | null
}

/** NIF del pedido: metadatos habituales de los plugins de facturación (billing_nif, _billing_vat…). */
export function nifDePedido(p: WcPedido): string | null {
  for (const m of p.meta_data ?? []) {
    if (/(^|_)(nif|dni|cif|vat|vat_number|nif_cif)$/i.test(m.key) && typeof m.value === 'string' && m.value.trim()) return m.value.trim().toUpperCase()
  }
  return null
}

export function nombreDePedido(p: WcPedido) {
  const b = p.billing ?? {}
  return (b.company?.trim() || `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim() || b.email || `Cliente web ${p.customer_id ?? ''}`).trim()
}

/** Cliente del ERP para un pedido: id web, email, NIF y teléfono, por ese orden. */
export function elegirCliente(p: WcPedido, clientes: ClienteCruce[]): { cliente: ClienteCruce; via: string } | null {
  const email = (p.billing?.email ?? '').trim().toLowerCase()
  const nif = (nifDePedido(p) ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
  const tel = telefono9(p.billing?.phone)
  if (p.customer_id) {
    const c = clientes.find((c) => c.web_id_cliente === p.customer_id)
    if (c) return { cliente: c, via: 'id web' }
  }
  if (email) {
    const c = clientes.find((c) => (c.email ?? '').trim().toLowerCase() === email)
    if (c) return { cliente: c, via: 'email' }
  }
  if (nif) {
    const c = clientes.find((c) => (c.nif ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === nif)
    if (c) return { cliente: c, via: 'NIF' }
  }
  if (tel.length === 9) {
    const c = clientes.find((c) => telefono9(c.telefono_movil) === tel || telefono9(c.telefono_fijo) === tel)
    if (c) return { cliente: c, via: 'teléfono' }
  }
  return null
}

/* ---------- Pedido web → pedido de cliente del ERP ---------- */

export interface ConfigImportacion {
  cliente_generico_codigo: string | null
  tienda_terminal_codigo: string | null
  almacen_codigo: string | null
  articulo_portes_codigo: string | null
  articulo_generico_codigo: string | null
  estados_importables: string[]
}

export interface LineaPropuesta {
  sku: string
  nombreWeb: string
  articulo_codigo: string | null
  codigo_venta: string | null
  codigo_compra: string | null
  descripcion: string
  cantidad: number
  precio: number
  descuento_pct: number
  igic_pct: number
  impuesto2_pct: number
  garantia_meses: number | null
  encontrado: boolean
  via: string
  tipo: 'articulo' | 'portes' | 'cargo'
}

export interface PedidoPropuesto {
  webId: number
  numeroWeb: string
  estadoWeb: string
  fecha: string
  hora: string
  cliente: ClienteCruce | null
  clienteVia: string
  nombre_cliente: string
  nif_cliente: string | null
  lineas: LineaPropuesta[]
  totalWeb: number
  totalErp: number
  observaciones: string
  avisos: string[]
  bloqueos: string[]
}

/** Importes como la ficha de pedidos (sin descuento ni IGIC de pie). */
export function totalesErp(lineas: Pick<LineaPropuesta, 'cantidad' | 'precio' | 'descuento_pct' | 'igic_pct' | 'impuesto2_pct'>[]) {
  let subtotal = 0
  let canon = 0
  let igic = 0
  const porLinea = lineas.map((l) => {
    const sub = r3(l.cantidad * l.precio * (1 - (l.descuento_pct || 0) / 100))
    const canonLinea = r3((l.impuesto2_pct || 0) * l.cantidad)
    const base = r3(sub + canonLinea)
    const igicLinea = r3((base * (l.igic_pct || 0)) / 100)
    subtotal += sub
    canon += canonLinea
    igic += igicLinea
    return { sub, canonLinea, base, igicLinea }
  })
  subtotal = r3(subtotal)
  igic = r3(igic)
  canon = r3(canon)
  return { porLinea, subtotal, canon, igic, total: r3(subtotal + canon + igic) }
}

function pctImpuesto(base: number, impuesto: number) {
  if (!(base > 0) || !(impuesto > 0)) return 0
  const p = (impuesto / base) * 100
  // Tipos de IGIC: 0, 3, 5, 7, 9,5, 15, 20 — se redondea al más cercano.
  const tipos = [0, 3, 5, 7, 9.5, 15, 20]
  return tipos.reduce((m, t) => (Math.abs(t - p) < Math.abs(m - p) ? t : m), 0)
}

export function proponerPedido(
  p: WcPedido,
  ix: IndiceArticulos,
  clientes: ClienteCruce[],
  cfg: ConfigImportacion,
  generico: ClienteCruce | null,
): PedidoPropuesto {
  const avisos: string[] = []
  const bloqueos: string[] = []
  const elegido = elegirCliente(p, clientes)
  let cliente = elegido?.cliente ?? null
  let clienteVia = elegido?.via ?? ''
  if (!cliente) {
    if (generico) {
      cliente = generico
      clienteVia = 'genérico'
      avisos.push('Cliente no encontrado en el ERP: se usa el cliente web genérico.')
    } else bloqueos.push('Cliente no encontrado y no hay cliente web genérico configurado.')
  }

  const genArt = cfg.articulo_generico_codigo ? ix.porCodigo.get(cfg.articulo_generico_codigo.toUpperCase()) ?? null : null
  const lineas: LineaPropuesta[] = []
  for (const li of p.line_items ?? []) {
    const cantidad = num(li.quantity)
    const sub = num(li.subtotal)
    const tot = num(li.total)
    const precio = cantidad ? r3(sub / cantidad) : 0
    const dto = sub > 0 ? r3((1 - tot / sub) * 100) : 0
    const hallado = buscarPorSku(ix, li.sku, li.product_id, li.variation_id)
    const a = hallado?.articulo ?? null
    const igicWeb = pctImpuesto(tot, num(li.total_tax))
    if (!a && !genArt) bloqueos.push(`Línea «${li.name}» (SKU ${li.sku || 'vacío'}) sin artículo en el ERP.`)
    else if (!a) avisos.push(`Línea «${li.name}» (SKU ${li.sku || 'vacío'}) sin artículo: va con el artículo genérico.`)
    const igic = a?.igic_pct != null ? Number(a.igic_pct) : igicWeb
    if (a && a.igic_pct != null && num(li.total_tax) > 0 && Math.abs(igic - igicWeb) > 0.01)
      avisos.push(`«${li.name}»: IGIC del artículo ${igic} % y en la web ${igicWeb} %.`)
    const usado = a ?? genArt
    lineas.push({
      sku: li.sku ?? '',
      nombreWeb: li.name,
      articulo_codigo: usado?.codigo_interno ?? null,
      codigo_venta: usado?.codigo_venta ?? null,
      codigo_compra: usado?.codigo_compra_habitual ?? null,
      descripcion: a ? a.descripcion : li.name,
      cantidad,
      precio,
      descuento_pct: dto,
      igic_pct: igic,
      impuesto2_pct: Number(usado?.impuesto2_pct ?? 0),
      garantia_meses: usado?.garantia_meses ?? null,
      encontrado: !!a,
      via: hallado?.via ?? (genArt ? 'genérico' : ''),
      tipo: 'articulo',
    })
  }

  const portes = (p.shipping_lines ?? []).filter((s) => num(s.total) > 0)
  const portesArt = cfg.articulo_portes_codigo ? ix.porCodigo.get(cfg.articulo_portes_codigo.toUpperCase()) ?? null : null
  for (const s of portes) {
    if (portesArt)
      lineas.push({
        sku: portesArt.codigo_interno,
        nombreWeb: s.method_title,
        articulo_codigo: portesArt.codigo_interno,
        codigo_venta: portesArt.codigo_venta,
        codigo_compra: null,
        descripcion: `Portes: ${s.method_title}`,
        cantidad: 1,
        precio: r3(num(s.total)),
        descuento_pct: 0,
        igic_pct: pctImpuesto(num(s.total), num(s.total_tax)) || Number(portesArt.igic_pct ?? 0),
        impuesto2_pct: 0,
        garantia_meses: null,
        encontrado: true,
        via: 'portes',
        tipo: 'portes',
      })
    else avisos.push(`Portes «${s.method_title}» (${r2(num(s.total))} €) sin artículo de portes configurado: solo quedan en la observación.`)
  }
  for (const f of p.fee_lines ?? []) {
    if (num(f.total) !== 0) avisos.push(`Cargo «${f.name}» (${r2(num(f.total))} €) solo queda en la observación.`)
  }

  const cupones = (p.coupon_lines ?? []).map((c) => `${c.code} (−${r2(num(c.discount)).toFixed(2)} €)`)
  const b = p.billing ?? {}
  const env = p.shipping ?? {}
  const obs = [
    `Pedido web nº ${p.number ?? p.id} (WooCommerce id ${p.id}), estado en la web: ${p.status}.`,
    p.payment_method_title ? `Pago: ${p.payment_method_title}.` : '',
    cupones.length ? `Cupones aplicados como descuento en línea: ${cupones.join(', ')}.` : '',
    portes.length ? `Portes: ${portes.map((s) => `${s.method_title} ${r2(num(s.total)).toFixed(2)} €`).join(', ')}.` : '',
    (p.fee_lines ?? []).length ? `Cargos: ${(p.fee_lines ?? []).map((f) => `${f.name} ${r2(num(f.total)).toFixed(2)} €`).join(', ')}.` : '',
    clienteVia === 'genérico' ? `Cliente web: ${nombreDePedido(p)} · ${b.email ?? ''} · ${b.phone ?? ''}.` : '',
    env.address_1 ? `Envío a: ${[env.first_name, env.last_name].filter(Boolean).join(' ')}, ${env.address_1} ${env.address_2 ?? ''}, ${env.postcode ?? ''} ${env.city ?? ''} (${env.state ?? ''}).` : '',
    lineas.some((l) => !l.encontrado && l.tipo === 'articulo')
      ? `Líneas sin artículo en el ERP: ${lineas.filter((l) => !l.encontrado && l.tipo === 'articulo').map((l) => `${l.sku || '(sin SKU)'} ${l.nombreWeb}`).join('; ')}.`
      : '',
    p.customer_note ? `Nota del cliente: ${p.customer_note}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const totalErp = totalesErp(lineas).total
  const totalWeb = num(p.total)
  if (Math.abs(totalErp - totalWeb) > 0.05) avisos.push(`El total en el ERP (${totalErp.toFixed(2)} €) no coincide con el de la web (${totalWeb.toFixed(2)} €).`)
  if (!(p.line_items ?? []).length) bloqueos.push('El pedido no tiene líneas.')
  if (!cfg.estados_importables.includes(p.status)) bloqueos.push(`Estado en la web «${p.status}»: no está entre los estados importables (Configuración de la Conexión).`)

  const fecha = (p.date_created ?? '').slice(0, 10)
  return {
    webId: p.id,
    numeroWeb: String(p.number ?? p.id),
    estadoWeb: p.status,
    fecha,
    hora: (p.date_created ?? '').slice(11, 16),
    cliente,
    clienteVia,
    nombre_cliente: clienteVia === 'genérico' || !cliente ? nombreDePedido(p) : cliente.nombre,
    nif_cliente: nifDePedido(p) ?? cliente?.nif ?? null,
    lineas,
    totalWeb,
    totalErp,
    observaciones: obs,
    avisos,
    bloqueos,
  }
}

/* ---------- Catálogo: web ↔ ERP ---------- */

export interface DiferenciaCatalogo {
  clave: string
  tipo: 'ambos' | 'solo_erp' | 'solo_web'
  sku: string
  webId: number | null
  articulo: string | null
  nombreWeb: string
  nombreErp: string
  precioWeb: number | null
  pvpErp: number | null
  pvpErpIgic: number | null
  stockWeb: number | null
  stockErp: number | null
  imagenWeb: boolean
  imagenErp: boolean
  categoriaWeb: string
  familiaErp: string
  difPrecio: boolean
  difStock: boolean
  difDescripcion: boolean
  difImagen: boolean
  difCategoria: boolean
  estadoWeb: string
}

export interface FamiliaCruce {
  codigo: string
  descripcion: string | null
  web_descripcion: string | null
  web_codigo?: string | null
}

export function compararCatalogo(
  productos: WcProducto[],
  arts: ArticuloCruce[],
  ix: IndiceArticulos,
  stockErp: Map<string, number>,
  familias: Map<string, FamiliaCruce>,
): DiferenciaCatalogo[] {
  const out: DiferenciaCatalogo[] = []
  const vistos = new Set<string>()
  for (const p of productos) {
    if (p.type === 'variable') continue // el padre no tiene SKU propio vendible; se comparan sus variaciones si vienen
    const h = buscarPorSku(ix, p.sku, p.id)
    const a = h?.articulo ?? null
    const precioWeb = p.regular_price ? num(p.regular_price) : p.price ? num(p.price) : null
    const categoriaWeb = (p.categories ?? []).map((c) => c.name).join(', ')
    const stockWeb = p.manage_stock ? num(p.stock_quantity) : null
    if (!a) {
      out.push({
        clave: `w${p.id}`,
        tipo: 'solo_web',
        sku: p.sku ?? '',
        webId: p.id,
        articulo: null,
        nombreWeb: p.name,
        nombreErp: '',
        precioWeb,
        pvpErp: null,
        pvpErpIgic: null,
        stockWeb,
        stockErp: null,
        imagenWeb: !!p.images?.length,
        imagenErp: false,
        categoriaWeb,
        familiaErp: '',
        difPrecio: false,
        difStock: false,
        difDescripcion: false,
        difImagen: false,
        difCategoria: false,
        estadoWeb: p.status ?? '',
      })
      continue
    }
    vistos.add(a.codigo_interno)
    const pvp = a.pvp == null ? null : Number(a.pvp)
    const pvpIgic = pvp == null ? null : r2(pvp * (1 + Number(a.igic_pct ?? 0) / 100))
    const fam = a.familia_codigo ? familias.get(a.familia_codigo) : undefined
    const familiaErp = a.web_categoria || fam?.web_descripcion || fam?.descripcion || ''
    const sErp = stockErp.get(a.codigo_interno) ?? 0
    const nombreErp = a.web_descripcion || a.descripcion
    const catsNorm = (p.categories ?? []).map((c) => normalizar(c.name))
    out.push({
      clave: `a${a.codigo_interno}|${p.id}`,
      tipo: 'ambos',
      sku: p.sku ?? '',
      webId: p.id,
      articulo: a.codigo_interno,
      nombreWeb: p.name,
      nombreErp,
      precioWeb,
      pvpErp: pvp,
      pvpErpIgic: pvpIgic,
      stockWeb,
      stockErp: sErp,
      imagenWeb: !!p.images?.length,
      imagenErp: !!a.imagen_url,
      categoriaWeb,
      familiaErp,
      difPrecio: precioWeb != null && pvp != null && Math.abs(precioWeb - pvp) > 0.009 && Math.abs(precioWeb - (pvpIgic ?? 0)) > 0.009,
      difStock: stockWeb != null && stockWeb !== sErp,
      difDescripcion: normalizar(p.name) !== normalizar(nombreErp),
      difImagen: !!p.images?.length !== !!a.imagen_url,
      difCategoria: !!familiaErp && !catsNorm.includes(normalizar(familiaErp)),
      estadoWeb: p.status ?? '',
    })
  }
  for (const a of arts) {
    if (!a.web_publicado || vistos.has(a.codigo_interno)) continue
    const fam = a.familia_codigo ? familias.get(a.familia_codigo) : undefined
    const pvp = a.pvp == null ? null : Number(a.pvp)
    out.push({
      clave: `e${a.codigo_interno}`,
      tipo: 'solo_erp',
      sku: a.codigo_venta || a.codigo_interno,
      webId: a.web_id_link ?? null,
      articulo: a.codigo_interno,
      nombreWeb: '',
      nombreErp: a.web_descripcion || a.descripcion,
      precioWeb: null,
      pvpErp: pvp,
      pvpErpIgic: pvp == null ? null : r2(pvp * (1 + Number(a.igic_pct ?? 0) / 100)),
      stockWeb: null,
      stockErp: stockErp.get(a.codigo_interno) ?? 0,
      imagenWeb: false,
      imagenErp: !!a.imagen_url,
      categoriaWeb: '',
      familiaErp: a.web_categoria || fam?.web_descripcion || fam?.descripcion || '',
      difPrecio: false,
      difStock: false,
      difDescripcion: false,
      difImagen: false,
      difCategoria: false,
      estadoWeb: '',
    })
  }
  return out
}

/* ---------- CSV ---------- */

export function aCsv(cabeceras: string[], filas: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    if (v == null) return ''
    const s = typeof v === 'number' ? String(v).replace('.', ',') : v
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [cabeceras, ...filas].map((f) => f.map(esc).join(';')).join('\r\n')
}

export function descargarCsv(nombre: string, cabeceras: string[], filas: (string | number | null | undefined)[][]) {
  const blob = new Blob([aCsv(cabeceras, filas)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
