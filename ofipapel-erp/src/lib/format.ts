export function formatEUR(value: number): string {
  return value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
