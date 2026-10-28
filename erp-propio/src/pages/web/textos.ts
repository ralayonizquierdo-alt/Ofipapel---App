import type { WcMeta, WcPedido } from '../../lib/woocommerce'

// Utilidades de las ventanas Web de solo lectura (textos, SEO, seguimiento de envíos).

/** Texto plano de un HTML de WooCommerce (descripciones, notas), sin etiquetas ni entidades. */
export function quitarHtml(html: string | null | undefined): string {
  if (!html) return ''
  const sinEtiquetas = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  const t = document.createElement('textarea')
  t.innerHTML = sinEtiquetas
  return t.value
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

function meta(m: WcMeta[] | undefined, claves: string[]): string {
  for (const k of claves) {
    const v = m?.find((x) => x.key === k)?.value
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/** Título y meta descripción SEO del producto, de los plugins habituales (Yoast, Rank Math, AIOSEO, SEOPress). */
export function seoDe(m: WcMeta[] | undefined): { titulo: string; descripcion: string; plugin: string } {
  const pares: [string, string, string][] = [
    ['Yoast', '_yoast_wpseo_title', '_yoast_wpseo_metadesc'],
    ['Rank Math', 'rank_math_title', 'rank_math_description'],
    ['AIOSEO', '_aioseo_title', '_aioseo_description'],
    ['SEOPress', '_seopress_titles_title', '_seopress_titles_desc'],
  ]
  for (const [plugin, t, d] of pares) {
    const titulo = meta(m, [t])
    const descripcion = meta(m, [d])
    if (titulo || descripcion) return { titulo, descripcion, plugin }
  }
  return { titulo: '', descripcion: '', plugin: '' }
}

export interface Seguimiento {
  empresa: string
  numero: string
  fecha: string
}

/**
 * Números de seguimiento guardados en el pedido por los plugins de envío más comunes
 * (WooCommerce Shipment Tracking, Advanced Shipment Tracking y similares: meta
 * «_wc_shipment_tracking_items»), o cualquier meta cuyo nombre contenga «tracking».
 */
export function seguimientosDe(p: WcPedido): Seguimiento[] {
  const out: Seguimiento[] = []
  for (const m of p.meta_data ?? []) {
    if (m.key === '_wc_shipment_tracking_items' && Array.isArray(m.value)) {
      for (const it of m.value as Record<string, unknown>[]) {
        const fecha = it.date_shipped ? new Date(Number(it.date_shipped) * 1000).toISOString().slice(0, 10) : ''
        out.push({
          empresa: String(it.custom_tracking_provider || it.tracking_provider || it.formatted_tracking_provider || ''),
          numero: String(it.tracking_number ?? ''),
          fecha,
        })
      }
    } else if (/tracking/i.test(m.key) && (typeof m.value === 'string' || typeof m.value === 'number') && String(m.value).trim()) {
      out.push({ empresa: m.key.replace(/^_+/, ''), numero: String(m.value).trim(), fecha: '' })
    }
  }
  return out.filter((s) => s.numero)
}
