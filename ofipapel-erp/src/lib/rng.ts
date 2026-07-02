/** PRNG determinista (mulberry32) para que la base de datos de ejemplo sea reproducible. */
export function createRng(seed: number) {
  let a = seed
  return function random() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

export function intBetween(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}

export function daysAgo(rng: () => number, maxDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() - intBetween(rng, 0, maxDays))
  return d.toISOString().slice(0, 10)
}

export function daysAhead(rng: () => number, maxDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + intBetween(rng, 1, maxDays))
  return d.toISOString().slice(0, 10)
}
