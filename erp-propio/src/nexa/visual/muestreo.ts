// Convierte la imagen de referencia de NEXA en una nube de partículas.
//
// La imagen NO se dibuja nunca: solo se lee. Se recorre con una trama regular al tresbolillo
// (como la de la propia referencia) y cada celda da una partícula con:
//   · el COLOR real de esa zona (cian brillante en ojos y luces, azul profundo en las sombras),
//   · un TAMAÑO según cuánto «azul» hay (semitono: más tinta = punto mayor).
// Así el rostro se lee igual que en la imagen, pero solo existen puntos: ninguna superficie debajo.

export interface MapaDensidad {
  img: HTMLImageElement
  /** Puntos reales de la referencia: x, y (px de la imagen), diámetro (px), r, g, b (0..1). */
  puntos: Float32Array
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
  return { img, puntos: detectarPuntos(img) }
}

/**
 * Detecta cada punto azul de la referencia (máximos locales) con su diámetro y su color. Se usan
 * para el contorno: los puntos grandes y sueltos de la cabeza y alrededor, que una trama regular
 * no reproduce.
 */
function detectarPuntos(img: HTMLImageElement): Float32Array {
  const N = img.naturalWidth || 1254
  const lienzo = document.createElement('canvas')
  lienzo.width = N
  lienzo.height = N
  const ctx = lienzo.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, N, N)
  const { data } = ctx.getImageData(0, 0, N, N)
  const v = new Float32Array(N * N)
  for (let i = 0; i < N * N; i++) {
    const r = data[i * 4]
    const b = data[i * 4 + 2]
    v[i] = b > r + 8 ? (255 - r) / 255 : 0
  }
  const salida: number[] = []
  const R = 3
  for (let y = R; y < N - R; y++) {
    for (let x = R; x < N - R; x++) {
      const i = y * N + x
      const c = v[i]
      if (c < 0.3) continue
      let esMax = true
      for (let dy = -R; dy <= R && esMax; dy++)
        for (let dx = -R; dx <= R; dx++) {
          if (!dx && !dy) continue
          const o = v[i + dy * N + dx]
          if (o > c || (o === c && (dy < 0 || (dy === 0 && dx < 0)))) {
            esMax = false
            break
          }
        }
      if (!esMax) continue
      let area = 0
      let sr = 0
      let sg = 0
      let sb = 0
      for (let dy = -7; dy <= 7; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= N) continue
        for (let dx = -7; dx <= 7; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= N || dx * dx + dy * dy > 49) continue
          const k = yy * N + xx
          if (v[k] >= c * 0.45) {
            area++
            sr += data[k * 4]
            sg += data[k * 4 + 1]
            sb += data[k * 4 + 2]
          }
        }
      }
      if (area < 6) continue
      salida.push(x, y, 2 * Math.sqrt(area / Math.PI), sr / area / 255, sg / area / 255, sb / area / 255)
    }
  }
  return new Float32Array(salida)
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

  // Interior del rostro: zonas donde la media de «tinta» del entorno es alta. Ahí va la trama fina;
  // fuera, los puntos sueltos reales de la referencia.
  const interior = new Uint8Array(M * M)
  for (let y = 0; y < M; y++)
    for (let x = 0; x < M; x++) {
      let suma = 0
      let n = 0
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= M || yy >= M) continue
          suma += 1 - original[(yy * M + xx) * 4] / 255
          n++
        }
      interior[y * M + x] = suma / n > 0.4 ? 1 : 0
    }

  const pos: number[] = []
  const props: number[] = []
  const cols: number[] = []
  const profundidadDe = (nx: number, ny: number) => {
    // El rostro como un elipsoide (centro algo por encima del medio).
    const ex = nx / 0.62
    const ey = (ny - 0.02) / 0.85
    return Math.sqrt(Math.max(0, 1 - ex * ex - ey * ey))
  }
  for (let y = 0; y < M; y++) {
    const desfase = (y % 2) * 0.5 // filas al tresbolillo
    for (let x = 0; x < M; x++) {
      if (!interior[y * M + x]) continue
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
      const profundidad = profundidadDe(nx, ny)
      // Luminosidad del punto: 0 = brillo (cian/blanco), 1 = sombra (azul profundo)
      const luz = 0.3 * pr + 0.6 * pg + 0.1 * pb
      const tono = Math.min(1, Math.max(0, 1 - luz * 1.6))
      pos.push(nx, ny)
      props.push(0.4 + 0.6 * Math.sqrt(tinta), rnd(), profundidad, tono)
      cols.push(pr, pg, pb, alfa)
    }
  }

  // Contorno: puntos reales de la referencia fuera del interior, con su tamaño y su color.
  const N = mapa.img.naturalWidth || 1254
  const celdaRef = N / M
  const total = mapa.puntos.length / 6
  const maxContorno = Math.max(150, objetivo * 0.3)
  let fuera = 0
  for (let i = 0; i < total; i++) {
    const cx = Math.floor(mapa.puntos[i * 6] / celdaRef)
    const cy = Math.floor(mapa.puntos[i * 6 + 1] / celdaRef)
    if (cx >= 0 && cy >= 0 && cx < M && cy < M && interior[cy * M + cx]) continue
    fuera++
  }
  const prob = Math.min(1, maxContorno / Math.max(1, fuera))
  for (let i = 0; i < total; i++) {
    const px = mapa.puntos[i * 6]
    const py = mapa.puntos[i * 6 + 1]
    const cx = Math.floor(px / celdaRef)
    const cy = Math.floor(py / celdaRef)
    if (cx >= 0 && cy >= 0 && cx < M && cy < M && interior[cy * M + cx]) continue
    const diam = mapa.puntos[i * 6 + 2]
    if (prob < 1 && rnd() > prob * (0.5 + diam / 20)) continue
    const r = mapa.puntos[i * 6 + 3]
    const g = mapa.puntos[i * 6 + 4]
    const b = mapa.puntos[i * 6 + 5]
    const escalaAzul = 1 / Math.max(0.35, b)
    const pr = Math.min(1, r * escalaAzul)
    const pg = Math.min(1, g * escalaAzul)
    const nx = (px / N) * 2 - 1
    const ny = 1 - (py / N) * 2
    const luz = 0.3 * pr + 0.6 * pg + 0.1
    pos.push(nx, ny)
    // Tamaño en celdas de la trama; profundidad 0 = punto suelto (flota más)
    props.push(Math.max(0.35, (diam / celdaRef) * 0.95), rnd(), Math.min(0.12, profundidadDe(nx, ny)), Math.min(1, Math.max(0, 1 - luz * 1.6)))
    cols.push(pr, pg, 1, 1)
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
  if (lado <= 96) return 1100
  if (lado <= 180) return 2200
  if (lado <= 320) return 3800
  if (lado <= 520) return 5500
  return 7000
}
