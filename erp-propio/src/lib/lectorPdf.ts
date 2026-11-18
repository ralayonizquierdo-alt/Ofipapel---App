// Lector de PDF de proveedores en el ERP (18/11/2026): el MISMO que usa la app de Importación de Pedidos
// («PDF a Excel», importacion-pedidos-proveedores.html), con sus perfiles de proveedores homologados. El código de los
// perfiles no se copia a mano: lo genera scripts/generar-lector-pdf.mjs en lectorPdfProveedores.generado.js.
//
// Se carga solo al usarlo: pdf.js desde cdnjs con huella de integridad (la misma versión que la app) y el lector
// generado como trozo aparte del programa.

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
const PDFJS_HUELLA = 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e'

let cargando: Promise<void> | null = null
function cargarPdfjs(): Promise<void> {
  if ((globalThis as { pdfjsLib?: unknown }).pdfjsLib) return Promise.resolve()
  if (cargando) return cargando
  cargando = new Promise<void>((ok, mal) => {
    const s = document.createElement('script')
    s.src = PDFJS
    s.integrity = PDFJS_HUELLA
    s.crossOrigin = 'anonymous'
    s.async = true
    s.onload = () => ok()
    s.onerror = () => {
      cargando = null
      mal(new Error('No se pudo cargar el lector de PDF (sin conexión). Inténtalo de nuevo.'))
    }
    document.head.appendChild(s)
  })
  return cargando
}

/** Línea tal como la devuelven los perfiles de la app de Importación. */
export interface FilaLector {
  codigo: string
  descripcion: string
  cantidad: number
  precioUnitario: number
  dto1: number
  dto2: number
  dto3: number
  dto4: number
  importe: number
  ean: string
}
interface Perfil {
  id: string
  nombre: string
  bajaConfianza?: boolean
  parser: (lineas: string[]) => FilaLector[]
  total?: (texto: string) => number | null
  extraccion?: (f: File) => Promise<string[]>
}
interface Modulo {
  extraerLineasPDF: (f: File) => Promise<string[]>
  PERFILES_PROVEEDOR: Perfil[]
  detectarProveedor: (lineas: string[]) => Perfil | null
}

export interface LecturaLector {
  perfil: { id: string; nombre: string; baja_confianza: boolean } | null
  filas: FilaLector[]
  total: number | null
  hay_texto: boolean
}

/**
 * Lee el PDF con el lector de la app de Importación. Si reconoce al proveedor (perfil homologado) devuelve sus líneas;
 * si no, perfil null y sin líneas (el genérico se equivoca de columnas demasiado para comparar con un pedido).
 */
export async function leerConLector(f: File): Promise<LecturaLector> {
  await cargarPdfjs()
  const m = (await import('./lectorPdfProveedores.generado.js')) as unknown as Modulo
  const lineas = await m.extraerLineasPDF(f)
  const perfil = m.detectarProveedor(lineas)
  if (!perfil) return { perfil: null, filas: [], total: null, hay_texto: lineas.some((l) => /\d/.test(l)) }
  const paraParsear = perfil.extraccion ? await perfil.extraccion(f) : lineas
  const filas = perfil.parser(paraParsear).filter((x) => x && (x.codigo || x.descripcion))
  let total: number | null = null
  try {
    total = perfil.total ? perfil.total(paraParsear.join('\n')) : null
  } catch {
    total = null
  }
  return { perfil: { id: perfil.id, nombre: perfil.nombre, baja_confianza: !!perfil.bajaConfianza }, filas, total: Number.isFinite(total) ? total : null, hay_texto: true }
}
