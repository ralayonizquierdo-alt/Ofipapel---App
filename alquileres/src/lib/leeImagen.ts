/**
 * Saca el texto de una captura de pantalla, para poder dar de alta una reserva
 * de Airbnb desde la foto en vez de teniendo que copiar el texto a mano.
 *
 * El reconocimiento lo hace `netlify/functions/leer-reserva-airbnb.js`, que solo
 * transcribe: quien entiende las fechas, el huésped y las noches sigue siendo
 * `analizaAirbnb` en pegarReservas.ts. Desde aquí sale el mismo texto que
 * saldría de copiar y pegar, así que todo lo que viene después no se entera de
 * si vino de una foto o del portapapeles.
 */

/** Lo que el lector admite. El móvil también hace fotos en HEIC, que no vale. */
const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

/**
 * Dónde vive la función que lee las fotos.
 *
 * La app se publica en dos sitios a la vez: Netlify, que sí ejecuta funciones,
 * y GitHub Pages, que solo sirve ficheros. La gente entra por el enlace de
 * Pages y no se va a cambiar en todos los móviles, así que desde ahí hay que
 * llamar a Netlify por su dirección completa. La función permite el acceso
 * desde cualquier origen, de modo que funciona igual.
 *
 * Desde el propio Netlify se usa la ruta relativa: ni sale a otro dominio ni
 * paga la petición previa de permiso que exige el navegador al cruzarlo.
 *
 * Es el mismo apaño que ya usa inicio.html para el bot de WhatsApp.
 */
const NETLIFY = 'https://spontaneous-lebkuchen-60fa41.netlify.app'

export function urlDeLaFuncion(nombre: string): string {
  const enNetlify = typeof location !== 'undefined' && /(^|\.)netlify\.app$/i.test(location.hostname)
  const base = import.meta.env?.VITE_FUNCIONES_URL ?? (enNetlify ? '' : NETLIFY)
  return `${base}/.netlify/functions/${nombre}`
}

/**
 * Lado mayor al que se reduce la captura antes de mandarla. Con esto el texto
 * de un móvil se sigue leyendo perfectamente y la petición baja de varios
 * megas a unos pocos cientos de kilobytes, que es la diferencia entre que
 * funcione con datos móviles y que no.
 */
const LADO_MAXIMO = 1568

export function esImagen(f: File): boolean {
  return f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name)
}

/** Un error que ya viene explicado para enseñárselo a quien lo esté usando. */
export class ErrorImagen extends Error {}

function cargaImagen(f: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new ErrorImagen('No se ha podido abrir la imagen')) }
    img.src = url
  })
}

/** Reduce la captura y la devuelve como JPEG en base64, sin la cabecera «data:». */
async function preparaImagen(f: File): Promise<{ base64: string; mediaType: string }> {
  const img = await cargaImagen(f)
  const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height))
  const ancho = Math.round(img.width * escala)
  const alto = Math.round(img.height * escala)

  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new ErrorImagen('Este navegador no puede procesar la imagen')
  // Fondo blanco: los PNG con transparencia quedarían negros al pasar a JPEG.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, ancho, alto)
  ctx.drawImage(img, 0, 0, ancho, alto)

  const dataUrl = lienzo.toDataURL('image/jpeg', 0.85)
  const base64 = dataUrl.split(',')[1]
  if (!base64) throw new ErrorImagen('No se ha podido preparar la imagen')
  return { base64, mediaType: 'image/jpeg' }
}

/**
 * Manda la captura al lector y devuelve el texto que ha sacado.
 *
 * El canvas convierte a JPEG cualquier formato que el navegador sepa abrir,
 * así que en la práctica también valen las fotos HEIC del iPhone: si Safari la
 * pinta, esto la lee.
 */
export async function textoDeImagen(f: File): Promise<string> {
  if (!esImagen(f)) throw new ErrorImagen(`«${f.name}» no es una imagen`)

  const { base64, mediaType } = await preparaImagen(f)
  if (!TIPOS_OK.includes(mediaType)) throw new ErrorImagen('Formato de imagen no admitido')

  const token = import.meta.env.VITE_OCR_TOKEN
  let resp: Response
  try {
    resp = await fetch(urlDeLaFuncion('leer-reserva-airbnb'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { 'x-ocr-token': token } : {}) },
      body: JSON.stringify({ imagenBase64: base64, mediaType }),
    })
  } catch {
    throw new ErrorImagen('Sin conexión con el lector de imágenes')
  }

  if (!resp.ok) {
    // 404 o 405 significan que en esa dirección no hay funciones de servidor:
    // el sitio contesta con su página de error, que no es JSON. No debería
    // pasar —siempre se llama a Netlify—, pero si pasa conviene decirlo tal
    // cual en vez de soltar un «no se ha podido leer» que no explica nada.
    if (resp.status === 404 || resp.status === 405) {
      throw new ErrorImagen(
        'El lector de fotos no responde. Usa «Pegar lo copiado» mientras tanto.')
    }
    const { error } = await resp.json().catch(() => ({ error: '' }))
    throw new ErrorImagen(error || `No se ha podido leer la imagen (error ${resp.status})`)
  }

  const { texto } = await resp.json()
  if (!texto?.trim()) throw new ErrorImagen('No se ha leído nada en la imagen')
  return texto
}
