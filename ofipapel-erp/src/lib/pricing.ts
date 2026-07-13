/** Precio resultante de aplicar un margen de beneficio (%) sobre el coste. */
export function priceForMargin(coste: number, margenPct: number): number {
  return Number((coste * (1 + margenPct / 100)).toFixed(2))
}
