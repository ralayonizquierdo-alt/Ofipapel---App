/**
 * Cómo se escriben los números en la aplicación.
 *
 * El español no pone separador de miles en las cifras de cuatro dígitos —9135,
 * no 9.135—, y eso es justo lo que no se quiere en unas cuentas: en una columna
 * de importes, los de cuatro cifras se leen distinto que los de cinco y el ojo
 * se pierde. Aquí se fuerza el punto siempre (`useGrouping: 'always'`), que es
 * lo que pidió el propietario para toda la aplicación, totales incluidos.
 *
 * Se usa en todas partes en vez de llamar a `toLocaleString` suelto: así el
 * criterio vive en un sitio y no en setenta.
 */
const formateadores = new Map<string, Intl.NumberFormat>()

function formateador(min: number, max: number): Intl.NumberFormat {
  const clave = `${min}-${max}`
  let f = formateadores.get(clave)
  if (!f) {
    f = new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
      useGrouping: 'always',
    })
    formateadores.set(clave, f)
  }
  return f
}

/** Un número con punto de miles. Por defecto, como lo escribe la asesoría. */
export function num(n: number, decimales = 2): string {
  return formateador(decimales, decimales).format(n ?? 0)
}

/** Un número sin decimales forzados: 1.250 y 1.250,5 se escriben tal cual. */
export function numSuelto(n: number): string {
  return formateador(0, 2).format(n ?? 0)
}

/** «1.250,00 €». */
export function eur(n: number, decimales = 2): string {
  return `${num(n, decimales)} €`
}

/** «1.250 €», sin céntimos cuando no hacen falta. */
export function eurSuelto(n: number): string {
  return `${numSuelto(n)} €`
}
