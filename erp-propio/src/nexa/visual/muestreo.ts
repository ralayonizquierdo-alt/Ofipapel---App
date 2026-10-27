// Convierte la imagen de referencia de NEXA en una nube de partículas.
//
// La imagen NO se dibuja nunca: solo se lee para saber dónde hay «azul» (los puntos del rostro
// original). Con ese mapa de densidad se reparten partículas en una rejilla con desorden
// (jittered grid): más probables donde la referencia es más intensa. El resultado son solo
// posiciones y propiedades; no queda ninguna superficie ni imagen debajo.

export interface MapaDensidad {
  ancho: number
  alto: number
  /** Presencia del rostro 0..1 por píxel (0 = fondo). */
  valores: Float32Array
  /** Tono 0..1 de la referencia (0 = azul claro/brillo, 1 = azul profundo/sombra). */
  tono: Float32Array
  /** Puntos reales detectados en la referencia: x, y (-1..1), tamaño relativo, tono. */
  puntos: Float32Array
}

/** Nube lista para subir a la GPU. */
export interface Nube {
  cantidad: number
  /** x, y del destino (espacio normalizado -1..1, y hacia arriba). */
  posiciones: Float32Array
  /** tamaño relativo, semilla 0..1, profundidad 0..1, tono 0..1 (0 brillo · 1 sombra). */
  propiedades: Float32Array
}

const RESOLUCION_MAPA = 480

export async function cargarMapaDensidad(url: string): Promise<MapaDensidad> {
  const img = new Image()
  img.decoding = 'async'
  img.src = url
  await img.decode()
  const lienzo = document.createElement('canvas')
  lienzo.width = RESOLUCION_MAPA
  lienzo.height = RESOLUCION_MAPA
  const ctx = lienzo.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('NEXA: no se puede leer la imagen de referencia.')
  ctx.drawImage(img, 0, 0, RESOLUCION_MAPA, RESOLUCION_MAPA)
  const { data } = ctx.getImageData(0, 0, RESOLUCION_MAPA, RESOLUCION_MAPA)
  const n = RESOLUCION_MAPA * RESOLUCION_MAPA
  const bruto = new Float32Array(n)
  const oscuridad = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const r = data[i * 4]
    const b = data[i * 4 + 2]
    // Sobre fondo blanco, los puntos azules bajan sobre todo el rojo; se exige que haya más azul
    // que rojo para no recoger grises.
    const caida = (255 - r) / 255
    const esAzul = b > r + 8 ? 1 : 0
    bruto[i] = esAzul * Math.min(1, Math.max(0, (caida - 0.03) / 0.2))
    oscuridad[i] = esAzul * Math.min(1, caida / 0.88)
  }
  // Suavizado 3×3: rellena los huecos blancos entre los puntos originales para que la presencia
  // del rostro sea continua (las partículas nuevas ya forman su propia trama).
  const valores = new Float32Array(n)
  const tono = new Float32Array(n)
  const R = 1
  for (let y = 0; y < RESOLUCION_MAPA; y++) {
    for (let x = 0; x < RESOLUCION_MAPA; x++) {
      let sp = 0
      let so = 0
      let c = 0
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= RESOLUCION_MAPA) continue
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= RESOLUCION_MAPA) continue
          const k = yy * RESOLUCION_MAPA + xx
          sp += bruto[k]
          so += oscuridad[k]
          c++
        }
      }
      const i = y * RESOLUCION_MAPA + x
      valores[i] = Math.min(1, (sp / c) * 1.6)
      // Tono = oscuridad media de la zona, contando los huecos blancos: así se conservan las
      // luces (nariz, frente, pómulos) y las sombras (ojos, contorno) de la referencia.
      tono[i] = sp > 0 ? Math.min(1, Math.max(0, (so / sp - 0.5) / 0.42)) : 0
    }
  }
  return { ancho: RESOLUCION_MAPA, alto: RESOLUCION_MAPA, valores, tono, puntos: detectarPuntos(img) }
}

const RESOLUCION_PUNTOS = 1000

/**
 * Detecta cada punto azul de la referencia (máximos locales de «azul») con su tamaño y su tono.
 * Así la nube conserva el dibujo fino de la imagen (párpados, iris, cejas, labios), que se pierde
 * si solo se usa una densidad promediada.
 */
function detectarPuntos(img: HTMLImageElement): Float32Array {
  const N = RESOLUCION_PUNTOS
  const lienzo = document.createElement('canvas')
  lienzo.width = N
  lienzo.height = N
  const ctx = lienzo.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, N, N)
  const { data } = ctx.getImageData(0, 0, N, N)
  const v = new Float32Array(N * N)
  const rojo = new Float32Array(N * N)
  for (let i = 0; i < N * N; i++) {
    const r = data[i * 4]
    const b = data[i * 4 + 2]
    rojo[i] = r
    v[i] = b > r + 8 ? (255 - r) / 255 : 0
  }
  const salida: number[] = []
  const R = 2
  for (let y = R; y < N - R; y++) {
    for (let x = R; x < N - R; x++) {
      const i = y * N + x
      const c = v[i]
      if (c < 0.12) continue
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
      // Tamaño: píxeles del entorno con al menos la mitad de intensidad; tono: rojo medio del punto.
      let area = 0
      let sumaRojo = 0
      for (let dy = -4; dy <= 4; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= N) continue
        for (let dx = -4; dx <= 4; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= N) continue
          const k = yy * N + xx
          if (v[k] >= c * 0.5) {
            area++
            sumaRojo += rojo[k]
          }
        }
      }
      const tono = Math.min(1, Math.max(0, 1 - (sumaRojo / Math.max(1, area)) / 210))
      salida.push((x / N) * 2 - 1, 1 - (y / N) * 2, Math.sqrt(area), tono)
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

/**
 * Elige unas `objetivo` partículas entre los puntos detectados en la referencia (si hay más de los
 * necesarios se quitan al azar, conservando antes los grandes, que son los que dibujan la forma).
 */
export function generarNube(mapa: MapaDensidad, objetivo: number, semilla = 7): Nube {
  const rnd = aleatorio(semilla)
  const total = mapa.puntos.length / 4
  let maxTam = 1
  for (let i = 0; i < total; i++) maxTam = Math.max(maxTam, mapa.puntos[i * 4 + 2])
  const prob = Math.min(1, objetivo / Math.max(1, total))
  const pos: number[] = []
  const props: number[] = []
  for (let i = 0; i < total; i++) {
    const tam = mapa.puntos[i * 4 + 2] / maxTam
    // Con menos partículas que puntos, los puntos grandes tienen preferencia.
    if (prob < 1 && rnd() > Math.min(1, prob * (0.6 + 0.8 * tam))) continue
    const nx = mapa.puntos[i * 4]
    const ny = mapa.puntos[i * 4 + 1]
    const tono = mapa.puntos[i * 4 + 3]
    // Profundidad aproximada: el rostro como un elipsoide (centro algo por encima del medio).
    const ex = nx / 0.62
    const ey = (ny - 0.02) / 0.85
    const profundidad = Math.sqrt(Math.max(0, 1 - ex * ex - ey * ey))
    pos.push(nx, ny)
    // Con menos partículas, cada una algo mayor para mantener la forma.
    props.push((0.35 + 0.9 * tam) * (prob < 1 ? 1 / Math.sqrt(prob) : 1), rnd(), profundidad, tono)
  }
  return { cantidad: pos.length / 2, posiciones: new Float32Array(pos), propiedades: new Float32Array(props) }
}

/** Nº de partículas razonable para un tamaño en píxeles CSS (lado del avatar). */
export function particulasParaTamano(lado: number) {
  if (lado <= 96) return 900
  if (lado <= 180) return 1800
  if (lado <= 320) return 3500
  if (lado <= 520) return 8000
  return 14000
}
