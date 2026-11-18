// Genera src/lib/lectorPdfProveedores.generado.js a partir del lector de PDF de la app de Importación de Pedidos
// (importacion-pedidos-proveedores.html, en la raíz del repositorio): el trozo entre «LECTOR-PDF: INICIO» y
// «LECTOR-PDF: FIN». Esa app es la ÚNICA fuente de los perfiles de proveedores homologados: si se arregla o se añade
// un perfil allí, este script lo trae al ERP (se ejecuta solo antes de cada build; también a mano con
// `node scripts/generar-lector-pdf.mjs`). Si la app no está (build fuera del repositorio), se deja el generado que
// ya hay versionado.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const origen = join(aqui, '..', '..', 'importacion-pedidos-proveedores.html')
const destino = join(aqui, '..', 'src', 'lib', 'lectorPdfProveedores.generado.js')

if (!existsSync(origen)) {
  console.log('generar-lector-pdf: no encuentro importacion-pedidos-proveedores.html; se usa el generado que ya hay.')
  process.exit(0)
}
const html = readFileSync(origen, 'utf8')
const ini = html.indexOf('// ==== LECTOR-PDF: INICIO ====')
const fin = html.indexOf('// ==== LECTOR-PDF: FIN ====')
if (ini < 0 || fin < 0 || fin < ini) {
  console.error('generar-lector-pdf: faltan las marcas LECTOR-PDF en importacion-pedidos-proveedores.html')
  process.exit(1)
}
const trozo = html.slice(html.indexOf('\n', ini) + 1, fin)
if (/\bdocument\.|\bwindow\./.test(trozo)) {
  console.error('generar-lector-pdf: el trozo compartido toca la pantalla (document/window); sácalo fuera de las marcas.')
  process.exit(1)
}
const salida = `// GENERADO por scripts/generar-lector-pdf.mjs desde importacion-pedidos-proveedores.html. NO EDITAR A MANO:
// cualquier cambio se hace en esa app (entre las marcas LECTOR-PDF) y se vuelve a generar.
/* eslint-disable */
// @ts-nocheck
// pdfjsLib es el global que deja pdf.js al cargarse (lo carga src/lib/lectorPdf.ts antes de usar esto).

${trozo}
export { extraerLineasPDF, extraerLineasPDFRotado, parserGenerico, PERFILES_PROVEEDOR, detectarProveedor }
`
const anterior = existsSync(destino) ? readFileSync(destino, 'utf8') : ''
if (anterior !== salida) {
  writeFileSync(destino, salida)
  console.log('generar-lector-pdf: actualizado src/lib/lectorPdfProveedores.generado.js')
}
