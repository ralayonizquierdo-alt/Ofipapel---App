import type { MenuEntry } from './menus'

// Letras subrayadas de los menús (Alt+letra abre el menú superior; con un menú abierto, la letra
// elige la opción), como en Windows. No se conocen las de GeminisWin (confirmar con Luis): las del
// menú superior se han elegido sin colisiones y las de cada opción salen solas: la primera letra
// libre al principio de una palabra y, si no hay, la primera letra libre de la etiqueta. Una opción
// puede fijar la suya con `letra` (p. ej. Edición → Cortar = T, como en Windows).

/** Letra de cada menú superior. Sin colisiones; Alt+F/Alt+E/Alt+V… ya no abren los menús del navegador. */
export const LETRA_MENU: Record<string, string> = {
  Archivo: 'a',
  Edición: 'e',
  Clientes: 'c',
  Ventas: 'v',
  Caja: 'j',
  Facturación: 'f',
  Contabilidad: 't',
  Compras: 'o',
  Almacén: 'l',
  Web: 'w',
  Utilidades: 'u',
  Ventana: 'n',
  '?': '?',
}

const sinAcento = (c: string) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const esLetra = (c: string) => /^[a-z0-9]$/.test(sinAcento(c))

/** Posición de `letra` en `label` (sin distinguir acentos ni mayúsculas), prefiriendo inicio de palabra. */
export function posicionLetra(label: string, letra: string) {
  const l = sinAcento(letra)
  const chars = [...label]
  const inicio = chars.findIndex((c, i) => sinAcento(c) === l && (i === 0 || !esLetra(chars[i - 1])))
  return inicio >= 0 ? inicio : chars.findIndex((c) => sinAcento(c) === l)
}

/**
 * Letra (minúscula sin acento) y posición subrayada de cada entrada de una lista de menú.
 * Los separadores dan null.
 */
export function mnemonicos(items: MenuEntry[]): ({ letra: string; pos: number } | null)[] {
  const usadas = new Set<string>()
  const res: ({ letra: string; pos: number } | null)[] = items.map(() => null)
  // Primero las fijadas a mano.
  items.forEach((it, i) => {
    if (it === 'sep' || !it.letra) return
    const pos = posicionLetra(it.label, it.letra)
    if (pos < 0) return
    usadas.add(sinAcento(it.letra))
    res[i] = { letra: sinAcento(it.letra), pos }
  })
  items.forEach((it, i) => {
    if (it === 'sep' || res[i]) return
    const chars = [...it.label]
    const libre = (j: number) => esLetra(chars[j]) && !usadas.has(sinAcento(chars[j]))
    let pos = chars.findIndex((_, j) => libre(j) && (j === 0 || !esLetra(chars[j - 1])))
    if (pos < 0) pos = chars.findIndex((_, j) => libre(j))
    if (pos < 0) return
    const letra = sinAcento(chars[pos])
    usadas.add(letra)
    res[i] = { letra, pos }
  })
  return res
}

/** Letra de una pulsación (por posición física: Alt+V en cualquier teclado; «?» tal cual). */
export function letraDeEvento(e: KeyboardEvent) {
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(e.code)) return e.code.slice(5)
  return sinAcento(e.key)
}
