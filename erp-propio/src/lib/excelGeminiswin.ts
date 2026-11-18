// Excel para importar un pedido a proveedor del ERP en GeminisWin (Gestor de Pedidos 2.0, 18/11/2026).
//
// Mismo fichero que genera la app de Importación de Pedidos (importacion-pedidos-proveedores.html), que GeminisWin
// ya acepta: Excel 5.0/95 (.xls, BIFF5), una hoja llamada «fichero», la cabecera en las mismas celdas que la
// plantilla oficial (Almacén, Proveedor, Nº Pedido, Fecha y el recordatorio de familias), las líneas desde la fila
// 13 y el total al final. Un solo descuento por línea y sin tildes ni Ñ (ese formato no las admite).
//
// Se usa la MISMA librería y versión que esa app (SheetJS 0.18.5) para que el fichero sea idéntico; se carga solo
// cuando se pulsa el botón, desde cdnjs y con huella de integridad (si el fichero cambiara, el navegador no lo usa).

import { supabase } from './supabase'

const LIBRERIA = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
const HUELLA = 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw'

type Celda = string | number
interface SheetJS {
  utils: {
    aoa_to_sheet(aoa: Celda[][]): Record<string, unknown>
    book_new(): unknown
    book_append_sheet(wb: unknown, ws: unknown, nombre: string): void
    sheet_to_json(ws: unknown, op: { header: 1; raw: boolean; defval: string }): unknown[][]
  }
  writeFile(wb: unknown, nombre: string, op: { bookType: string }): void
  read(datos: ArrayBuffer, op: { type: 'array' }): { SheetNames: string[]; Sheets: Record<string, unknown> }
}

let cargando: Promise<SheetJS> | null = null

function cargarLibreria(): Promise<SheetJS> {
  const ya = (window as unknown as { XLSX?: SheetJS }).XLSX
  if (ya) return Promise.resolve(ya)
  if (cargando) return cargando
  cargando = new Promise<SheetJS>((ok, mal) => {
    const s = document.createElement('script')
    s.src = LIBRERIA
    s.integrity = HUELLA
    s.crossOrigin = 'anonymous'
    s.async = true
    s.onload = () => {
      const x = (window as unknown as { XLSX?: SheetJS }).XLSX
      if (x) ok(x)
      else mal(new Error('No se pudo preparar el Excel.'))
    }
    s.onerror = () => {
      cargando = null
      mal(new Error('No se pudo preparar el Excel (sin conexión con el servidor de la librería). Inténtalo de nuevo.'))
    }
    document.head.appendChild(s)
  })
  return cargando
}

export interface LineaExcelGw {
  ean: string
  marca: string
  ref: string
  descripcion: string
  cajas: number | null
  uds_caja: number | null
  unidades: number
  precio: number
  descuento: number
  igic: number
  importe: number
  familia: string
}

export interface PedidoExcelGw {
  numero: number
  fecha: string
  proveedor: string
  proveedor_nombre: string | null
  almacen: string | null
  lineas: LineaExcelGw[]
}

/** El formato Excel 5.0/95 no admite tildes ni Ñ: se cambian por la letra sin tilde. */
export function quitarAcentos(v: Celda): Celda {
  if (typeof v !== 'string') return v
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[Ññ]/g, (m) => (m === 'Ñ' ? 'N' : 'n'))
}

const n2 = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100

/** Filas de la hoja «fichero», celda a celda como la plantilla de GeminisWin (14 columnas, A..N). */
export function filasExcelGw(p: PedidoExcelGw): Celda[][] {
  const fila = (): Celda[] => new Array<Celda>(14).fill('')
  const aoa: Celda[][] = []
  let r: Celda[]
  r = fila(); r[7] = 'RECORDATORIO DE FAMILIAS '; aoa.push(r)
  r = fila(); r[4] = 'ALMACEN'; r[5] = p.almacen ?? ''; r[6] = 1001; r[7] = 'L} LIBROS DE TEXTOS'
  r[11] = 20; r[12] = '-} ARTICULOS de DISENO (Escolar)'; aoa.push(r)
  r = fila(); r[6] = 100100; r[7] = 'Libros de Textos Pvp Fijo'; aoa.push(r)
  r = fila(); r[2] = 'PROVEEDOR;'; r[3] = p.proveedor; r[6] = 100125; r[7] = 'Libros de Textos L} (-25%) '; aoa.push(r)
  r = fila(); r[6] = 100130; r[7] = 'Libros de Textos L} (-30%) '
  r[11] = 209102; r[12] = 'ARTICULOS DISENO (Varios)     '; r[13] = 'NO WEB'; aoa.push(r)
  r = fila(); r[2] = 'N_ Pedido'; r[3] = String(p.numero); r[4] = 'FECHA'; r[5] = p.fecha; r[6] = 1002; r[7] = 'Libros SINLI'
  r[11] = 209162; r[12] = 'MOCHILAS (Diseno)                            '; r[13] = 'NO WEB'; aoa.push(r)
  r = fila(); r[6] = 100200; r[7] = 'Libros SINLI Pvp Fijo'
  r[11] = 209155; r[12] = 'Artículos Diseño (SUBEN A Web)               '; r[13] = 'SUBE A WEB'; aoa.push(r)
  r = fila(); r[6] = 100225; r[7] = 'Libros SINLI  (-25%) '
  r[11] = 209162; r[12] = 'MOCHILAS (Diseño) SOLO  ALTA EN WEB                           '; r[13] = 'SUBE A WEB'; aoa.push(r)
  r = fila(); r[6] = 100230; r[7] = 'Libros SINLI  (-30%) '; aoa.push(r)
  r = fila(); r[6] = 100235; r[7] = 'Libros SINLI  (-35%) '; aoa.push(r)
  r = fila(); r[2] = 'Rfecia. Compra'; aoa.push(r)
  aoa.push(['Codigo I.S.B.N.', 'MARCA/EDITORIAL', 'Rfcia. Proveedor', 'DESCRIPCION', 'Caja', 'Ud./Caja', 'Udes', 'Precio U.', 'Dcto', 'Igic', 'IMPORTE', '', 'COD. FAMILIA', ''])
  for (const l of p.lineas) {
    aoa.push([
      l.ean ?? '', l.marca ?? '', l.ref ?? '', l.descripcion ?? '',
      l.cajas ?? '', l.uds_caja ?? '', Number(l.unidades) || 0, Number(l.precio) || 0,
      n2(l.descuento), Number(l.igic) || 0, n2(l.importe), '', l.familia ?? '', '',
    ])
  }
  const total = p.lineas.reduce((s, l) => s + (Number(l.importe) || 0), 0)
  r = fila(); r[9] = 'TOTAL'; r[10] = n2(total); aoa.push(r)
  return aoa.map((f) => f.map(quitarAcentos))
}

export function nombreExcelGw(p: Pick<PedidoExcelGw, 'numero' | 'proveedor' | 'proveedor_nombre'>): string {
  const prov = String(quitarAcentos(p.proveedor_nombre || p.proveedor || 'PROVEEDOR')).replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '')
  return `PEDIDO_${p.numero}_${prov || 'PROVEEDOR'}_${new Date().toISOString().slice(0, 10)}.xls`
}

/** Lee el pedido, monta el Excel y lo descarga. Devuelve un texto de error para enseñar, o null si fue bien. */
export async function descargarExcelGw(tienda: string, numero: number): Promise<string | null> {
  const { data, error } = await supabase.rpc('fn_compras_pedido_excel_gw', { p_tienda: tienda, p_numero: numero })
  if (error) return error.message
  const p = data as PedidoExcelGw | null
  if (!p) return `No encuentro el pedido ${numero}.`
  if (!p.lineas?.length) return `El pedido ${numero} no tiene líneas.`
  try {
    const X = await cargarLibreria()
    const ws = X.utils.aoa_to_sheet(filasExcelGw(p))
    ws['!cols'] = [14, 16, 16, 40, 7, 9, 8, 10, 8, 8, 12, 2, 12, 10].map((wch) => ({ wch }))
    const wb = X.utils.book_new()
    X.utils.book_append_sheet(wb, ws, 'fichero')
    X.writeFile(wb, nombreExcelGw(p), { bookType: 'biff5' })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'No se pudo preparar el Excel.'
  }
}

/**
 * Lee la primera hoja de un Excel con la misma librería (sirve también para el .xls antiguo, que la lectura propia
 * del ERP no entiende). Las celdas salen como texto; los números con punto decimal.
 */
export async function leerExcelConLibreria(f: File): Promise<string[][]> {
  const X = await cargarLibreria()
  const wb = X.read(await f.arrayBuffer(), { type: 'array' })
  const hoja = wb.Sheets[wb.SheetNames[0]]
  if (!hoja) return []
  return X.utils
    .sheet_to_json(hoja, { header: 1, raw: true, defval: '' })
    .map((fila) => fila.map((c) => (c == null ? '' : String(c))))
    .filter((fila) => fila.some((c) => c.trim() !== ''))
}
