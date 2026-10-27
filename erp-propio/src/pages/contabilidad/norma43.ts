// Lector de extractos bancarios Norma 43 (AEB/CSB 43): texto de 80 posiciones por registro.
//   11 cabecera de cuenta · 22 movimiento · 23 conceptos complementarios · 33 final de cuenta · 88 fin de fichero
// Un fichero puede traer varias cuentas (un bloque 11…33 por cuenta).

export interface MovimientoN43 {
  linea: number
  oficinaOrigen: string
  fechaOperacion: string // ISO
  fechaValor: string
  conceptoComun: string
  conceptoPropio: string
  importe: number // + abono / - cargo
  documento: string
  referencia1: string
  referencia2: string
  conceptos: string[]
}

export interface CuentaN43 {
  entidad: string
  oficina: string
  cuenta: string
  fechaDesde: string
  fechaHasta: string
  saldoInicial: number
  divisa: string
  titular: string
  movimientos: MovimientoN43[]
  totalDebe: number | null
  totalHaber: number | null
  saldoFinal: number | null
  numDebe: number | null
  numHaber: number | null
}

/** Concepto común AEB (2 dígitos). */
export const CONCEPTOS_COMUNES: Record<string, string> = {
  '01': 'Talones - reintegros',
  '02': 'Abonarés - entregas - ingresos',
  '03': 'Domiciliados - recibos - letras - pagos por su cta.',
  '04': 'Giros - transferencias - traspasos - cheques',
  '05': 'Amortizaciones préstamos, créditos, etc.',
  '06': 'Remesas efectos',
  '07': 'Suscripciones - div. pasivos - canjes',
  '08': 'Div. cupones - prima junta - amortizaciones',
  '09': 'Operaciones de bolsa y/o compra/venta valores',
  '10': 'Cheques gasolina',
  '11': 'Cajero automático',
  '12': 'Tarjetas de crédito - tarjetas débito',
  '13': 'Operaciones extranjero',
  '14': 'Devoluciones e impagados',
  '15': 'Nóminas - seguros sociales',
  '16': 'Timbres - corretaje - póliza',
  '17': 'Intereses - comisiones - custodia - gastos e impuestos',
  '98': 'Anulaciones - correcciones asiento',
  '99': 'Varios',
}

const fecha = (aammdd: string) => {
  const s = aammdd.trim()
  if (!/^\d{6}$/.test(s)) return ''
  return `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`
}
const importe = (txt: string) => Number(txt.trim() || '0') / 100

export function parseNorma43(texto: string): CuentaN43[] {
  const cuentas: CuentaN43[] = []
  let actual: CuentaN43 | null = null
  let n = 0
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== '')
  for (const [i, raw] of lineas.entries()) {
    const r = raw.padEnd(80, ' ')
    const tipo = r.slice(0, 2)
    if (tipo === '11') {
      actual = {
        entidad: r.slice(2, 6),
        oficina: r.slice(6, 10),
        cuenta: r.slice(10, 20),
        fechaDesde: fecha(r.slice(20, 26)),
        fechaHasta: fecha(r.slice(26, 32)),
        saldoInicial: importe(r.slice(33, 47)) * (r[32] === '1' ? -1 : 1),
        divisa: r.slice(47, 50),
        titular: r.slice(51, 77).trim(),
        movimientos: [],
        totalDebe: null,
        totalHaber: null,
        saldoFinal: null,
        numDebe: null,
        numHaber: null,
      }
      cuentas.push(actual)
    } else if (tipo === '22') {
      if (!actual) throw new Error(`Línea ${i + 1}: movimiento (22) sin cabecera de cuenta (11).`)
      n += 1
      actual.movimientos.push({
        linea: n,
        oficinaOrigen: r.slice(6, 10),
        fechaOperacion: fecha(r.slice(10, 16)),
        fechaValor: fecha(r.slice(16, 22)),
        conceptoComun: r.slice(22, 24),
        conceptoPropio: r.slice(24, 27),
        importe: importe(r.slice(28, 42)) * (r[27] === '1' ? -1 : 1),
        documento: r.slice(42, 52).trim(),
        referencia1: r.slice(52, 64).trim(),
        referencia2: r.slice(64, 80).trim(),
        conceptos: [],
      })
      if (!actual.movimientos[actual.movimientos.length - 1].fechaOperacion) throw new Error(`Línea ${i + 1}: fecha de operación no válida.`)
    } else if (tipo === '23') {
      const m = actual?.movimientos[actual.movimientos.length - 1]
      if (m) m.conceptos.push(`${r.slice(4, 42).trim()} ${r.slice(42, 80).trim()}`.trim())
    } else if (tipo === '33') {
      if (!actual) continue
      actual.numDebe = Number(r.slice(20, 25))
      actual.totalDebe = importe(r.slice(25, 39))
      actual.numHaber = Number(r.slice(39, 44))
      actual.totalHaber = importe(r.slice(44, 58))
      actual.saldoFinal = importe(r.slice(59, 73)) * (r[58] === '1' ? -1 : 1)
      actual = null
    } else if (tipo === '88') {
      break
    } else {
      throw new Error(`Línea ${i + 1}: tipo de registro «${tipo}» desconocido. ¿Es un fichero Norma 43?`)
    }
  }
  if (!cuentas.length) throw new Error('El fichero no tiene ninguna cuenta (registro 11).')
  // Comprobación de totales con el registro 33
  for (const c of cuentas) {
    const d = c.movimientos.filter((m) => m.importe < 0).reduce((s, m) => s - m.importe, 0)
    const h = c.movimientos.filter((m) => m.importe > 0).reduce((s, m) => s + m.importe, 0)
    if (c.totalDebe != null && Math.abs(d - c.totalDebe) > 0.005) throw new Error(`Cuenta ${c.cuenta}: los cargos no suman lo que dice el registro 33.`)
    if (c.totalHaber != null && Math.abs(h - c.totalHaber) > 0.005) throw new Error(`Cuenta ${c.cuenta}: los abonos no suman lo que dice el registro 33.`)
  }
  return cuentas
}
