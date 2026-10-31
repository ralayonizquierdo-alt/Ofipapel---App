// Resultado de un listado del Generador fuera de su pantalla (lo usa NEXA, el centro de listados):
// nombres de columna, formato de los valores, Excel, impresión / PDF y el enlace para abrirlo en el
// Generador de listados. La pantalla del Generador (Luis) no se toca: sigue con lo suyo; aquí se
// repiten sus reglas (etiquetas de fuentes.ts, columnas que no se suman, fechas dd/mm/aaaa).

import { formatGw } from '../../components/gw'
import { crearXlsx, descargar } from '../hojaCalculo'
import { FUENTE_POR_CLAVE, OPERADORES } from './fuentes'

export interface FiltroResultado {
  col: string
  op: string
  valor?: string
  valor2?: string
}

export interface DefinicionResultado {
  columnas: string[]
  filtros: FiltroResultado[]
  agrupar: string[]
  sumar: string[]
  orden: { col: string; desc: boolean }[]
}

export interface ColumnaResultado {
  clave: string
  tipo: 'texto' | 'num' | 'fecha' | 'bool' | string
  /** Columna sumada al agrupar (sale como «Σ …»). */
  suma?: boolean
}

/** Listado ya sacado (lo devuelve la Edge Function «nexa»). */
export interface ResultadoListado {
  titulo: string
  /** Código del listado guardado (CLI-0001…) o null si se ha montado al vuelo. */
  codigo: string | null
  id: number | null
  fuente: string
  definicion: DefinicionResultado
  columnas: ColumnaResultado[]
  filas: Record<string, unknown>[]
  /** Filas que hay de verdad (puede ser más que las que se traen). */
  total: number
  /** Más de 50.000: el total no es exacto. */
  total_mas?: boolean
  truncado: boolean
}

/** Columnas numéricas que son identificadores: no se suman. */
const NO_SUMAR = ['numero', 'n_factura', 'anio', 'tarifa']

/** «fecha_ultima_venta» → «Fecha ultima venta» (la misma regla que el Generador). */
export function etiquetaCampo(c: string) {
  const t = c.replace(/_codigo$/, '').replace(/_pct$/, ' %').replace(/_/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function etiquetaColumna(fuente: string, c: ColumnaResultado) {
  if (c.clave === 'registros') return 'Registros'
  const base = FUENTE_POR_CLAVE[fuente]?.columnas.find((x) => x.clave === c.clave)?.etiqueta ?? etiquetaCampo(c.clave)
  return c.suma ? `Σ ${base}` : base
}

function decimales(fuente: string, c: ColumnaResultado) {
  if (c.clave === 'registros') return 0
  return FUENTE_POR_CLAVE[fuente]?.columnas.find((x) => x.clave === c.clave)?.dec ?? 2
}

export function valorTexto(fuente: string, c: ColumnaResultado, v: unknown) {
  if (v == null || v === '') return ''
  if (c.tipo === 'num') return formatGw(Number(v), decimales(fuente, c))
  if (c.tipo === 'fecha') return String(v).slice(0, 10).split('-').reverse().join('/')
  if (c.tipo === 'bool') return v === true ? 'Sí' : 'No'
  return String(v)
}

export const esSumable = (c: ColumnaResultado) => c.tipo === 'num' && !NO_SUMAR.includes(c.clave)

export function totalesResultado(r: ResultadoListado) {
  const t: Record<string, number> = {}
  for (const c of r.columnas) if (esSumable(c)) t[c.clave] = r.filas.reduce((s, f) => s + (Number(f[c.clave]) || 0), 0)
  return t
}

/** «Clientes · 3 columnas · filtros: Zona igual a 1100 · agrupado por …». */
export function resumenResultado(r: ResultadoListado) {
  const fte = FUENTE_POR_CLAVE[r.fuente]
  const d = r.definicion
  const et = (c: string) => fte?.columnas.find((x) => x.clave === c)?.etiqueta ?? etiquetaCampo(c)
  const opTxt = (o: string) => OPERADORES.find((x) => x.op === o)?.texto ?? o
  return [
    fte?.titulo ?? r.fuente,
    d.agrupar.length ? '' : `${d.columnas.length} columnas`,
    d.filtros.length ? `filtros: ${d.filtros.map((f) => `${et(f.col)} ${opTxt(f.op)}${f.valor ? ` ${f.valor}` : ''}${f.valor2 ? ` y ${f.valor2}` : ''}`).join(', ')}` : 'sin filtros',
    d.agrupar.length ? `agrupado por ${d.agrupar.map(et).join(', ')}` : '',
    d.orden.length ? `orden: ${d.orden.map((o) => et(o.col) + (o.desc ? ' ↓' : '')).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

const textoFilas = (r: ResultadoListado) =>
  r.total > r.filas.length ? `${r.filas.length} de ${r.total_mas ? 'más de 50.000' : r.total} filas (afina los filtros o ábrelo en el Generador)` : `${r.filas.length} filas`

/** Identificación que sale arriba en lo impreso y al principio del Excel (como en el Generador). */
function identificacion(r: ResultadoListado, sacadoPor: string): [string, string][] {
  return [
    ['Listado', `${r.titulo}${r.codigo ? '' : ' (sin guardar)'}`],
    ['Qué incluye', resumenResultado(r)],
    ['Filas', textoFilas(r)],
    ['Sacado por', `${sacadoPor ? `${sacadoPor} · ` : ''}NEXA · ${new Date().toLocaleString('es-ES')}`],
  ]
}

const nombreFichero = (r: ResultadoListado) => r.titulo.replace(/[^\w\- áéíóúñÁÉÍÓÚÑ·]/g, '').replace(/·/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Listado'

/** Excel (.xlsx de verdad, con los números como números). */
export async function excelResultado(r: ResultadoListado, sacadoPor = '') {
  const id = identificacion(r, sacadoPor)
  const cabecera = r.columnas.map((c) => etiquetaColumna(r.fuente, c))
  const filas: (string | number | null)[][] = [
    ...id.map(([k, v]) => [k, v]),
    [],
    cabecera,
    ...r.filas.map((f) =>
      r.columnas.map((c) => {
        const v = f[c.clave]
        if (v == null || v === '') return null
        if (c.tipo === 'num' && Number.isFinite(Number(v))) return Number(v)
        return valorTexto(r.fuente, c, v)
      }),
    ),
  ]
  const tot = totalesResultado(r)
  if (r.filas.length && Object.keys(tot).length) filas.push(r.columnas.map((c, i) => (c.clave in tot ? Math.round(tot[c.clave] * 1000) / 1000 : i === 0 ? 'TOTAL' : null)))
  const anchos = r.columnas.map((c) => Math.min(50, Math.max(10, etiquetaColumna(r.fuente, c).length + 2, ...r.filas.slice(0, 200).map((f) => valorTexto(r.fuente, c, f[c.clave]).length + 1))))
  const blob = await crearXlsx(r.codigo ?? 'Listado', filas, anchos, id.length + 1)
  descargar(blob, `${nombreFichero(r)}.xlsx`)
}

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Imprimir / PDF: abre el listado en una ventana aparte con su identificación y la imprime. */
export function imprimirResultado(r: ResultadoListado, sacadoPor = '') {
  const tot = totalesResultado(r)
  const num = (c: ColumnaResultado) => (c.tipo === 'num' ? ' class="n"' : '')
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escHtml(r.titulo)}</title>
<style>
@page { size: A4 ${r.columnas.length > 6 ? 'landscape' : 'portrait'}; margin: 10mm; @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 9pt Arial; } @bottom-left { content: "${escHtml(r.titulo).replace(/"/g, '')}"; font: 9pt Arial; } }
body { font: 9pt Arial, sans-serif; color: #000; margin: 0; }
.id { border-bottom: 1px solid #999; padding-bottom: 4px; margin-bottom: 6px; font-size: 9pt; }
h1 { font-size: 12pt; margin: 0 0 4px; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #bbb; padding: 2px 4px; text-align: left; vertical-align: top; }
th { background: #eee; }
thead { display: table-header-group; }
.n { text-align: right; white-space: nowrap; }
tfoot td { font-weight: bold; background: #f3f3f3; }
</style></head><body>
<h1>${escHtml(r.titulo)}</h1>
<div class="id">${identificacion(r, sacadoPor)
    .map(([k, v]) => `<div><b>${escHtml(k)}:</b> ${escHtml(v)}</div>`)
    .join('')}</div>
<table><thead><tr>${r.columnas.map((c) => `<th${num(c)}>${escHtml(etiquetaColumna(r.fuente, c))}</th>`).join('')}</tr></thead>
<tbody>${r.filas.map((f) => `<tr>${r.columnas.map((c) => `<td${num(c)}>${escHtml(valorTexto(r.fuente, c, f[c.clave]))}</td>`).join('')}</tr>`).join('')}</tbody>
${
  r.filas.length && Object.keys(tot).length
    ? `<tfoot><tr>${r.columnas.map((c, i) => `<td${num(c)}>${c.clave in tot ? escHtml(formatGw(tot[c.clave], decimales(r.fuente, c))) : i === 0 ? 'TOTAL' : ''}</td>`).join('')}</tr></tfoot>`
    : ''
}
</table></body></html>`
  const w = window.open('', '_blank', 'width=1000,height=700')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 250)
  return true
}

/**
 * Ruta para abrirlo en el Generador de listados: el guardado por su id (?id=); uno montado al
 * vuelo, por su fuente con los filtros «igual a» (?fuente=…&filtro=col:valor, lo que ya admite la
 * pantalla del Generador; el resto de la definición se elige allí).
 */
export function rutaGenerador(r: ResultadoListado) {
  if (r.id) return `/listados?id=${r.id}`
  const p = new URLSearchParams({ fuente: r.fuente })
  for (const f of r.definicion.filtros) if (f.op === '=' && f.valor != null) p.append('filtro', `${f.col}:${f.valor}`)
  return `/listados?${p.toString()}`
}
