import { MONTH_NAMES_ES } from './dateUtils'
import {
  ETIQUETA_EXCEL, gastoMes, totalAnual, totalConcepto, type RejillaInmueble,
} from './cuentas'
import { redondea } from './deducible'

/**
 * La hoja de la asesoría, fila a fila.
 *
 * Es un paso intermedio a propósito: de aquí sale tanto la tabla que se ve y
 * se imprime como el .xlsx que se descarga, así que el papel y el Excel no
 * pueden salir distintos por mucho que se toque uno de los dos. La forma es la
 * del Excel de siempre —conceptos en vertical, los doce meses en horizontal,
 * TOTAL AÑO y TOTAL DEDUCIBLE al final— porque es la que la asesoría lleva
 * años leyendo.
 */

export type TipoFila =
  /** Nombre del inmueble, abre cada bloque. */
  | 'titulo'
  /** % de ocupación y días: van antes de la rejilla, como en el Excel. */
  | 'meta'
  /** CONCEPTO/MES · ENERO … · TOTAL AÑO · TOTAL DEDUCIBLE */
  | 'cabecera'
  /** Rótulo suelto («GASTOS»), sin cifras. */
  | 'seccion'
  | 'dato'
  | 'total'

export type Formato = 'euros' | 'porcentaje' | 'entero' | 'texto' | 'ninguno'

export interface FilaHoja {
  tipo: TipoFila
  etiqueta: string
  /** Los doce meses, de enero a diciembre. null = celda vacía. */
  meses: (number | string | null)[]
  anio: number | string | null
  deducible: number | string | null
  formato: Formato
}

const vacios = (): null[] => Array(12).fill(null)

const MESES_CORTOS = MONTH_NAMES_ES.map(m => m.toUpperCase())

/** Construye las filas de un ejercicio a partir de la rejilla ya calculada. */
export function hojaAsesoria(rejillas: RejillaInmueble[], year: number): FilaHoja[] {
  const filas: FilaHoja[] = []
  const conDatos = rejillas.filter(r =>
    r.meses.some(m => m.ingresos || m.gastos || m.diasAlquilados))

  for (const r of conDatos) {
    filas.push({ tipo: 'titulo', etiqueta: r.apt.name, meses: vacios(), anio: null, deducible: null, formato: 'ninguno' })

    const diasTotales = totalAnual(r, m => m.diasTotales)
    const diasAlq = totalAnual(r, m => m.diasAlquilados)
    filas.push({
      tipo: 'meta', etiqueta: '% DE OCUPACIÓN',
      meses: r.meses.map(m => m.ocupacion),
      anio: diasTotales ? diasAlq / diasTotales : 0, deducible: null, formato: 'porcentaje',
    })
    filas.push({
      tipo: 'meta', etiqueta: 'DIAS TOTALES',
      meses: r.meses.map(m => m.diasTotales), anio: diasTotales, deducible: null, formato: 'entero',
    })
    filas.push({
      tipo: 'meta', etiqueta: 'DIAS ALQUILADO',
      meses: r.meses.map(m => m.diasAlquilados), anio: diasAlq, deducible: null, formato: 'entero',
    })

    filas.push({
      tipo: 'cabecera', etiqueta: 'CONCEPTO/MES',
      meses: MESES_CORTOS, anio: 'TOTAL AÑO', deducible: 'TOTAL DEDUCIBLE', formato: 'texto',
    })

    const ingresos = totalAnual(r, m => m.ingresos)
    filas.push({
      tipo: 'dato', etiqueta: 'Ingresos brutos (NETO Propiedad)',
      meses: r.meses.map(m => m.ingresos), anio: ingresos, deducible: ingresos, formato: 'euros',
    })
    filas.push({
      tipo: 'dato', etiqueta: 'IGIC repercutido (7 %)',
      meses: r.meses.map(m => m.igic), anio: totalAnual(r, m => m.igic), deducible: null, formato: 'euros',
    })

    filas.push({ tipo: 'seccion', etiqueta: 'GASTOS', meses: vacios(), anio: null, deducible: null, formato: 'ninguno' })

    for (const c of r.conceptos) {
      const t = totalConcepto(r, c)
      filas.push({
        tipo: 'dato', etiqueta: ETIQUETA_EXCEL[c],
        meses: r.meses.map(m => gastoMes(m, c)),
        anio: t.gasto, deducible: t.deducible, formato: 'euros',
      })
    }

    filas.push({
      tipo: 'total', etiqueta: 'TOTAL GASTOS',
      meses: r.meses.map(m => m.gastos),
      anio: totalAnual(r, m => m.gastos), deducible: totalAnual(r, m => m.deducible), formato: 'euros',
    })
  }

  if (conDatos.length > 1) {
    filas.push({ tipo: 'titulo', etiqueta: `TOTAL ${year}`, meses: vacios(), anio: null, deducible: null, formato: 'ninguno' })
    filas.push({
      tipo: 'cabecera', etiqueta: 'CONCEPTO/MES',
      meses: MESES_CORTOS, anio: 'TOTAL AÑO', deducible: 'TOTAL DEDUCIBLE', formato: 'texto',
    })
    const porMes = (f: (r: RejillaInmueble, i: number) => number) =>
      Array.from({ length: 12 }, (_, i) => redondea(conDatos.reduce((s, r) => s + f(r, i), 0)))
    const suma = (xs: number[]) => redondea(xs.reduce((s, x) => s + x, 0))

    const ing = porMes((r, i) => r.meses[i].ingresos)
    filas.push({ tipo: 'dato', etiqueta: 'Ingresos brutos (NETO Propiedad)', meses: ing, anio: suma(ing), deducible: suma(ing), formato: 'euros' })
    const gas = porMes((r, i) => r.meses[i].gastos)
    const ded = suma(porMes((r, i) => r.meses[i].deducible))
    filas.push({ tipo: 'total', etiqueta: 'TOTAL GASTOS', meses: gas, anio: suma(gas), deducible: ded, formato: 'euros' })
    filas.push({
      tipo: 'total', etiqueta: 'RENDIMIENTO NETO',
      meses: vacios(), anio: redondea(suma(ing) - ded), deducible: null, formato: 'euros',
    })
  }

  return filas
}
