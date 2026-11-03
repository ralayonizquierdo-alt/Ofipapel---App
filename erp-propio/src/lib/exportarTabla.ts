// Exportar una tabla a Excel, Word o PDF (Luis, 03/11/2026: «incluir botones de exportar en Excel o Word o PDF»).
// Sin librerías nuevas:
//  · Excel: CSV con «;» y BOM, que Excel abre directamente con tildes y columnas.
//  · Word: documento HTML con extensión .doc, que Word abre como documento (tabla con formato).
//  · PDF: ventana de impresión del navegador, donde se elige «Guardar como PDF».
// Reutilizable en cualquier pantalla con lista.

import { supabase } from './supabase'

export interface TablaExportar {
  titulo: string
  columnas: string[]
  filas: (string | number | null | undefined)[][]
  /** Nombre del fichero sin extensión. */
  fichero?: string
  /** Hoja apaisada en Word y PDF (por defecto sí). */
  apaisado?: boolean
}

const texto = (v: string | number | null | undefined) => (v == null ? '' : String(v))
const html = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
const nombre = (t: TablaExportar) =>
  (t.fichero ?? t.titulo)
    .replace(/[^\p{L}\p{N} _-]+/gu, '')
    .trim()
    .replace(/\s+/g, '_') || 'listado'

function descargar(contenido: BlobPart, tipo: string, fichero: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = fichero
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

function tablaHtml(t: TablaExportar) {
  const cab = t.columnas.map((c) => `<th>${html(c)}</th>`).join('')
  const cuerpo = t.filas.map((f) => `<tr>${f.map((c) => `<td>${html(texto(c)).replace(/\n/g, '<br>')}</td>`).join('')}</tr>`).join('')
  return `<table><thead><tr>${cab}</tr></thead><tbody>${cuerpo}</tbody></table>`
}

const estilos = (apaisado: boolean) =>
  `@page{size:A4 ${apaisado ? 'landscape' : 'portrait'};margin:12mm}body{font:10pt Calibri,Arial,sans-serif}h2{color:#1d3a8a;margin:0 0 4px}` +
  `p{color:#555;margin:0 0 10px;font-size:9pt}table{border-collapse:collapse;width:100%}th{background:#1d3a8a;color:#fff;text-align:left}` +
  `th,td{border:1px solid #bbb;padding:3px 5px;vertical-align:top}thead{display:table-header-group}`

export function exportarExcel(t: TablaExportar) {
  const esc = (s: string) => (/[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const csv = [t.columnas, ...t.filas.map((f) => f.map(texto))].map((r) => r.map(esc).join(';')).join('\r\n')
  descargar('﻿' + csv, 'text/csv;charset=utf-8', `${nombre(t)}.csv`)
}

export function exportarWord(t: TablaExportar) {
  const doc =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">` +
    `<title>${html(t.titulo)}</title><style>${estilos(t.apaisado !== false)}</style></head><body>` +
    `<h2>${html(t.titulo)}</h2><p>${new Date().toLocaleString('es-ES')} · ${t.filas.length} fila(s)</p>${tablaHtml(t)}</body></html>`
  descargar('﻿' + doc, 'application/msword', `${nombre(t)}.doc`)
}

export function exportarPdf(t: TablaExportar) {
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${html(t.titulo)}</title><style>${estilos(t.apaisado !== false)}</style></head><body>` +
      `<h2>${html(t.titulo)}</h2><p>${new Date().toLocaleString('es-ES')} · ${t.filas.length} fila(s)</p>${tablaHtml(t)}</body></html>`,
  )
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}

/** Envía el listado por correo desde el correo de la empresa (cola del servidor). Devuelve un error legible o null. */
export async function enviarPorCorreo(t: TablaExportar, para: string): Promise<string | null> {
  const cuerpo =
    `<div style="font:10pt Calibri,Arial,sans-serif"><h2 style="color:#1d3a8a;margin:0 0 4px">${html(t.titulo)}</h2>` +
    `<p style="color:#555;font-size:9pt">${new Date().toLocaleString('es-ES')} · ${t.filas.length} fila(s)</p>` +
    tablaHtml(t)
      .replace('<table>', '<table style="border-collapse:collapse;width:100%">')
      .replace(/<th>/g, '<th style="background:#1d3a8a;color:#fff;text-align:left;border:1px solid #bbb;padding:3px 5px">')
      .replace(/<td>/g, '<td style="border:1px solid #bbb;padding:3px 5px;vertical-align:top">') +
    `</div>`
  const { error } = await supabase.rpc('fn_correo_listado', {
    p_para: para,
    p_asunto: t.titulo,
    p_html: cuerpo,
  })
  return error ? error.message : null
}

/** Abre el programa de correo del ordenador con el listado en texto (resumido si es largo). */
export function abrirEnMiCorreo(t: TablaExportar, para = '') {
  const lineas = t.filas.map((f) => f.map(texto).filter(Boolean).join(' · '))
  let cuerpo = `${t.titulo} (${new Date().toLocaleString('es-ES')}, ${t.filas.length} fila(s))\n\n`
  for (const l of lineas) {
    if (cuerpo.length + l.length > 1800) {
      cuerpo += '\n… (listado completo: descárgalo en Excel o PDF y adjúntalo)'
      break
    }
    cuerpo += l + '\n'
  }
  window.location.href = `mailto:${encodeURIComponent(para)}?subject=${encodeURIComponent(t.titulo)}&body=${encodeURIComponent(cuerpo)}`
}
