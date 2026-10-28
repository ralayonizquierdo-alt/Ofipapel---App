// Lectura y escritura mínima de hojas de cálculo sin dependencias (Archivo → Importar): CSV
// (separador «;», «,» o tabulador, detectado solo) y XLSX (la primera hoja; el XLSX es un ZIP de
// XML y el ZIP ya lo sabe leer y escribir la Copia de Seguridad). Las celdas salen como texto:
// los números de Excel se pasan con punto decimal y las fechas como número de serie de Excel.

import { crearZip, leerZip } from '../pages/utilidades/zip'

export type Tabla = string[][]

/** CSV → filas (respeta comillas dobles y saltos de línea dentro de comillas). */
export function leerCsv(texto: string): Tabla {
  const t = texto.replace(/^﻿/, '')
  const primera = t.split(/\r?\n/, 1)[0] ?? ''
  const sep = [';', '\t', ','].map((s) => ({ s, n: primera.split(s).length })).sort((a, b) => b.n - a.n)[0].s
  const filas: Tabla = []
  let fila: string[] = []
  let celda = ''
  let comillas = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (comillas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          celda += '"'
          i++
        } else comillas = false
      } else celda += c
    } else if (c === '"') comillas = true
    else if (c === sep) {
      fila.push(celda)
      celda = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ''
    } else celda += c
  }
  if (celda !== '' || fila.length) {
    fila.push(celda)
    filas.push(fila)
  }
  return filas.filter((f) => f.some((c) => c.trim() !== ''))
}

const dec = new TextDecoder()

function xml(texto: string): Document {
  return new DOMParser().parseFromString(texto, 'application/xml')
}

/** Índice de columna de una referencia «AB12» → 27. */
function columnaDe(ref: string): number {
  let n = 0
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** XLSX → filas de la primera hoja. */
export async function leerXlsx(buf: ArrayBuffer): Promise<Tabla> {
  const entradas = leerZip(buf)
  const buscar = (re: RegExp) => entradas.find((e) => re.test(e.nombre))
  const texto = async (re: RegExp) => {
    const e = buscar(re)
    return e ? dec.decode(await e.leer()) : null
  }
  const compartidas: string[] = []
  const ss = await texto(/^xl\/sharedStrings\.xml$/i)
  if (ss) {
    for (const si of Array.from(xml(ss).getElementsByTagName('si'))) {
      compartidas.push(Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join(''))
    }
  }
  // La primera hoja según workbook.xml (normalmente sheet1.xml).
  let hojaRe = /^xl\/worksheets\/sheet1\.xml$/i
  const wb = await texto(/^xl\/workbook\.xml$/i)
  const rels = await texto(/^xl\/_rels\/workbook\.xml\.rels$/i)
  if (wb && rels) {
    const primera = xml(wb).getElementsByTagName('sheet')[0]
    const rid = primera?.getAttribute('r:id') ?? primera?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
    const rel = Array.from(xml(rels).getElementsByTagName('Relationship')).find((r) => r.getAttribute('Id') === rid)
    const destino = rel?.getAttribute('Target')?.replace(/^\/?xl\//, '').replace(/^\//, '')
    if (destino) hojaRe = new RegExp(`^xl/${destino.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
  }
  const hoja = (await texto(hojaRe)) ?? (await texto(/^xl\/worksheets\/sheet\d+\.xml$/i))
  if (!hoja) throw new Error('El fichero XLSX no tiene ninguna hoja')
  const filas: Tabla = []
  for (const row of Array.from(xml(hoja).getElementsByTagName('row'))) {
    const fila: string[] = []
    let pos = 0
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const ref = c.getAttribute('r')
      const col = ref ? columnaDe(ref) : pos
      const tipo = c.getAttribute('t')
      const v = c.getElementsByTagName('v')[0]?.textContent ?? ''
      let valor: string
      if (tipo === 's') valor = compartidas[Number(v)] ?? ''
      else if (tipo === 'inlineStr') valor = Array.from(c.getElementsByTagName('t')).map((t) => t.textContent ?? '').join('')
      else if (tipo === 'b') valor = v === '1' ? 'SI' : 'NO'
      else valor = v
      while (fila.length < col) fila.push('')
      fila[col] = valor
      pos = col + 1
    }
    filas.push(fila)
  }
  return filas.filter((f) => f.some((c) => (c ?? '').trim() !== ''))
}

/** Lee un fichero .xlsx, .csv o .txt. */
export async function leerHoja(f: File): Promise<Tabla> {
  if (/\.xlsx$/i.test(f.name)) return leerXlsx(await f.arrayBuffer())
  if (/\.xls$/i.test(f.name)) throw new Error('El formato .xls antiguo no se puede leer: guárdelo como .xlsx o .csv desde Excel')
  const buf = await f.arrayBuffer()
  // Excel guarda los CSV en Windows-1252 si no se elige UTF-8.
  let texto = new TextDecoder('utf-8').decode(buf)
  if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(buf)
  return leerCsv(texto)
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function refCol(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/** XLSX de una hoja con las filas dadas (todo como texto; la primera fila en negrita). */
export async function crearXlsx(nombreHoja: string, filas: Tabla, anchos: number[] = []): Promise<Blob> {
  const filasXml = filas
    .map(
      (f, r) =>
        `<row r="${r + 1}">${f
          .map((v, c) => `<c r="${refCol(c)}${r + 1}" t="inlineStr"${r === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(v ?? '')}</t></is></c>`)
          .join('')}</row>`,
    )
    .join('')
  const cols = anchos.length ? `<cols>${anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
  const nsr = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  return crearZip([
    {
      nombre: '[Content_Types].xml',
      contenido:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    },
    {
      nombre: '_rels/.rels',
      contenido:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
    {
      nombre: 'xl/workbook.xml',
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${ns}" xmlns:r="${nsr}"><sheets><sheet name="${esc(nombreHoja.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      contenido:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    },
    {
      nombre: 'xl/styles.xml',
      contenido:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders>' +
        '<cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>',
    },
    {
      nombre: 'xl/worksheets/sheet1.xml',
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${ns}">${cols}<sheetData>${filasXml}</sheetData></worksheet>`,
    },
  ])
}

/** Descarga un Blob con el nombre dado. */
export function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
