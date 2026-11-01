// Lectura de fechas e importes tal como vienen en los extractos de los bancos en Excel o CSV
// (Conciliación → importar Excel/CSV).

/** Fecha de banco: dd/mm/aaaa, dd-mm-aa, aaaa-mm-dd o nº de serie de Excel → ISO. */
export function fechaBanco(t: string): string | null {
  const s = (t ?? '').trim()
  if (!s) return null
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000)
    return d.toISOString().slice(0, 10)
  }
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

/** Importe de banco: «1.234,56», «-12,50», «1234.56», «12,50 €», «(12,50)» → número. */
export function importeBanco(t: string): number | null {
  let s = (t ?? '').trim().replace(/[€\s]/g, '')
  if (!s) return null
  let neg = false
  if (/^\(.*\)$/.test(s)) {
    neg = true
    s = s.slice(1, -1)
  }
  if (s.endsWith('-')) {
    neg = true
    s = s.slice(0, -1)
  }
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (s.includes(',')) s = s.replace(',', '.')
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return Math.round((neg ? -n : n) * 100) / 100
}
