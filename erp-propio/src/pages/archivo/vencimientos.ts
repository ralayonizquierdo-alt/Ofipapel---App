// Generador de pagos de una forma de pago (GeminisWin: Formas de Pago → Generador de Pagos).
// Dada la fecha y el importe de un documento, calcula sus vencimientos: % de entrada a la fecha
// del documento, el resto repartido en «Nº Pagos» con las cadencias (días desde el vencimiento
// anterior: Primera…Sexta y Resto) y el ajuste a días de pago.

export interface GeneradorPagos {
  generar_pagos_automaticos: boolean
  generador_num_pagos: number | null
  generador_pct_entrada: number | null
  /** Cadencias: nivel1..6 = Primera..Sexta, nivel0 = Resto. */
  cadencia_nivel0: number | null
  cadencia_nivel1: number | null
  cadencia_nivel2: number | null
  cadencia_nivel3: number | null
  cadencia_nivel4: number | null
  cadencia_nivel5: number | null
  cadencia_nivel6: number | null
  /** 1 Sin ajuste, 2 Día fijo del mes, 3 Fin de mes (primer pago / resto de pagos). */
  ajuste_vencimiento_tipo0: number | null
  dia_mes_ajuste0: number | null
  ajuste_vencimiento_tipo1: number | null
  dia_mes_ajuste1: number | null
  vencimientos_como_pagados: boolean
}

export const AJUSTES = [
  { valor: 1, label: 'Sin Ajuste' },
  { valor: 2, label: 'Día fijo del mes' },
  { valor: 3, label: 'Fin de mes' },
]

export interface Vencimiento {
  n: number
  fecha: string
  dias: number
  importe: number
  pagado: boolean
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function ajustar(d: Date, tipo: number | null, dia: number | null): Date {
  const r = new Date(d)
  if (tipo === 3) return new Date(r.getFullYear(), r.getMonth() + 1, 0)
  if (tipo === 2) {
    const dd = Math.min(Math.max(dia ?? 1, 1), 31)
    const ultimo = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
    let y = r.getFullYear()
    let m = r.getMonth()
    if (r.getDate() > Math.min(dd, ultimo(y, m))) {
      m += 1
      if (m > 11) {
        m = 0
        y += 1
      }
    }
    return new Date(y, m, Math.min(dd, ultimo(y, m)))
  }
  return r
}

export function generarVencimientos(g: GeneradorPagos, fechaDoc: string, importe: number): Vencimiento[] {
  const base = new Date(`${fechaDoc}T00:00:00`)
  if (Number.isNaN(base.getTime())) return []
  const total = Math.round(importe * 100)
  const entradaPct = Math.min(Math.max(g.generador_pct_entrada ?? 0, 0), 100)
  const n = Math.max(g.generador_num_pagos ?? 0, 0)
  const out: Vencimiento[] = []
  const dias = (a: Date) => Math.round((a.getTime() - base.getTime()) / 86400000)

  if (!g.generar_pagos_automaticos || n === 0) {
    return [{ n: 1, fecha: fechaDoc, dias: 0, importe: total / 100, pagado: g.vencimientos_como_pagados }]
  }

  let restante = total
  if (entradaPct > 0) {
    const e = Math.round((total * entradaPct) / 100)
    out.push({ n: 1, fecha: fechaDoc, dias: 0, importe: e / 100, pagado: g.vencimientos_como_pagados })
    restante -= e
  }
  const cad = [g.cadencia_nivel1, g.cadencia_nivel2, g.cadencia_nivel3, g.cadencia_nivel4, g.cadencia_nivel5, g.cadencia_nivel6]
  const cuota = Math.floor(restante / n)
  let fecha = new Date(base)
  for (let i = 0; i < n; i++) {
    const c = (i < 6 ? cad[i] : null) ?? g.cadencia_nivel0 ?? 0
    fecha = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + c)
    const primero = i === 0
    const f = ajustar(fecha, primero ? g.ajuste_vencimiento_tipo0 : g.ajuste_vencimiento_tipo1, primero ? g.dia_mes_ajuste0 : g.dia_mes_ajuste1)
    const imp = i === n - 1 ? restante - cuota * (n - 1) : cuota
    out.push({ n: out.length + 1, fecha: iso(f), dias: dias(f), importe: imp / 100, pagado: g.vencimientos_como_pagados })
  }
  return out
}
