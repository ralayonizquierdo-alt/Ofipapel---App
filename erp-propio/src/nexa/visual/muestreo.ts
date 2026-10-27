// Convierte la imagen de referencia de NEXA en una nube de partículas.
//
// La imagen NO se dibuja nunca: solo se lee. Se recorre con una trama regular al tresbolillo
// (como la de la propia referencia) y cada celda da una partícula con:
//   · el COLOR real de esa zona (cian brillante en ojos y luces, azul profundo en las sombras),
//   · un TAMAÑO según cuánto «azul» hay (semitono: más tinta = punto mayor).
// Así el rostro se lee igual que en la imagen, pero solo existen puntos: ninguna superficie debajo.

export interface MapaDensidad {
  img: HTMLImageElement
}

/** Nube lista para subir a la GPU. */
export interface Nube {
  cantidad: number
  /** x, y del destino (espacio normalizado -1..1, y hacia arriba). */
  posiciones: Float32Array
  /** tamaño relativo (1 = celda completa), semilla 0..1, profundidad 0..1, tono 0..1 (0 brillo · 1 sombra). */
  propiedades: Float32Array
  /** color r, g, b, alfa (0..1) del punto según la referencia. */
  colores: Float32Array
  /** celdas por lado de la trama: el motor lo usa para el tamaño en píxeles. */
  celdas: number
}

export async function cargarMapaDensidad(url: string): Promise<MapaDensidad> {
  const img = new Image()
  img.decoding = 'async'
  img.src = url
  await img.decode()
  return { img }
}

/** Generador pseudoaleatorio con semilla: la misma nube en cada carga. */
function aleatorio(semilla: number) {
  let s = semilla >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Fracción aproximada de la referencia ocupada por el rostro (para calcular la trama).
const COBERTURA = 0.38

/** Unas `objetivo` partículas en trama regular sobre la referencia. */
export function generarNube(mapa: MapaDensidad, objetivo: number, semilla = 7): Nube {
  const rnd = aleatorio(semilla)
  const M = Math.max(30, Math.round(Math.sqrt(objetivo / COBERTURA)))
  // Al reducir la imagen a M×M cada píxel es el color medio de su celda.
  const lienzo = document.createElement('canvas')
  lienzo.width = M
  lienzo.height = M
  const ctx = lienzo.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('NEXA: no se puede leer la imagen de referencia.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(mapa.img, 0, 0, M, M)
  const original = ctx.getImageData(0, 0, M, M).data
  // Realce de bordes (máscara de desenfoque): devuelve la nitidez a ojos, labios y nariz que el
  // promedio por celda suaviza. nítido = media + K · (media − desenfoque 5×5)
  const K = 1.6
  const data = new Float32Array(M * M * 4)
  for (let y = 0; y < M; y++) {
    for (let x = 0; x < M; x++) {
      for (let canal = 0; canal < 3; canal++) {
        let suma = 0
        let n = 0
        for (let dy = -2; dy <= 2; dy++) {
          const yy = y + dy
          if (yy < 0 || yy >= M) continue
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx
            if (xx < 0 || xx >= M) continue
            suma += original[(yy * M + xx) * 4 + canal]
            n++
          }
        }
        const k = (y * M + x) * 4 + canal
        data[k] = Math.min(255, Math.max(0, original[k] + K * (original[k] - suma / n)))
      }
    }
  }

  const pos: number[] = []
  const props: number[] = []
  const cols: number[] = []
  for (let y = 0; y < M; y++) {
    const desfase = (y % 2) * 0.5 // filas al tresbolillo
    for (let x = 0; x < M; x++) {
      const k = (y * M + x) * 4
      const r = data[k] / 255
      const g = data[k + 1] / 255
      const b = data[k + 2] / 255
      // «Tinta»: cuánto se aleja del blanco (el rojo es el canal que más baja con el azul).
      const tinta = Math.min(1, Math.max(0, (1 - r) * 1.05))
      if (tinta < 0.05 || b < r) continue
      // Color del punto = color medio de su zona, algo más saturado; las zonas casi blancas se
      // vuelven transparentes (alfa), nunca blancas.
      // Se lleva el azul al máximo conservando las proporciones: color vivo como en la referencia.
      const escalaAzul = 1 / Math.max(0.35, b)
      const pr = Math.min(1, r * escalaAzul)
      const pg = Math.min(1, g * escalaAzul)
      const pb = 1
      const alfa = Math.min(1, tinta * 4)
      const nx = ((x + 0.5 + desfase) / M) * 2 - 1
      const ny = 1 - ((y + 0.5) / M) * 2
      // Profundidad aproximada: el rostro como un elipsoide (centro algo por encima del medio).
      const ex = nx / 0.62
      const ey = (ny - 0.02) / 0.85
      const profundidad = Math.sqrt(Math.max(0, 1 - ex * ex - ey * ey))
      // Luminosidad del punto: 0 = brillo (cian/blanco), 1 = sombra (azul profundo)
      const luz = 0.3 * pr + 0.6 * pg + 0.1 * pb
      const tono = Math.min(1, Math.max(0, 1 - luz * 1.6))
      pos.push(nx, ny)
      props.push(0.4 + 0.6 * Math.sqrt(tinta), rnd(), profundidad, tono)
      cols.push(pr, pg, pb, alfa)
    }
  }
  return {
    cantidad: pos.length / 2,
    posiciones: new Float32Array(pos),
    propiedades: new Float32Array(props),
    colores: new Float32Array(cols),
    celdas: M,
  }
}

/** Nº de partículas razonable para un tamaño en píxeles CSS (lado del avatar). */
export function particulasParaTamano(lado: number) {
  if (lado <= 96) return 900
  if (lado <= 180) return 1600
  if (lado <= 320) return 2600
  if (lado <= 520) return 3600
  return 4400
}
