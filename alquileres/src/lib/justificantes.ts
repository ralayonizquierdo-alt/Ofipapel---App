import { doc, getDoc, deleteDoc, writeBatch } from 'firebase/firestore'
import { db } from './firebase'

/**
 * Guarda el papel, no solo la cifra.
 *
 * Hasta ahora la aplicación leía el PDF o la foto de un justificante, sacaba el
 * importe y la fecha, y descartaba el fichero. La cifra quedaba anotada y el
 * documento no quedaba en ninguna parte, así que el día que la asesoría o
 * Hacienda pidan el respaldo de un cobro no había nada que enseñar.
 *
 * ─── Por qué en Firestore y no en Firebase Storage ──────────────────────────
 * Storage sería lo natural, pero Google dejó de darlo en el plan gratuito: al
 * activarlo pide tarjeta. Firestore, que es donde ya viven las reservas y los
 * cobros, sí entra en el plan de siempre, así que el justificante se guarda
 * ahí mismo. No hace falta activar nada, ni desplegar reglas nuevas, ni pagar.
 *
 * ─── Cómo ───────────────────────────────────────────────────────────────────
 * Un documento de Firestore admite 1 MB, y una foto de móvil pesa más, así que:
 *
 *   · Las fotos se encogen antes de guardarlas (1.600 px de lado y JPEG). Una
 *     foto de 4 MB se queda en 150-300 KB y el recibo se sigue leyendo.
 *   · El fichero se parte en trozos de 700.000 caracteres, cada uno en su
 *     propio documento. Los trozos van en la MISMA colección, no en una
 *     subcolección: las reglas de Firestore ya cubren las colecciones de
 *     primer nivel y así no hay que volver a desplegarlas.
 *
 * Lo que se guarda junto al cobro es `firestore:<id>`, no una URL: el fichero
 * se arma al vuelo cuando alguien lo pide, con `abreJustificante`.
 */

/** Lo que se guarda del justificante, tanto en el cobro como en el registro. */
export interface Justificante {
  /** Dónde está: `firestore:<id>`. No es una URL, se abre con abreJustificante. */
  url: string
  /** El id, para poder borrarlo si hiciera falta. */
  ruta: string
  /** Nombre original, que es como lo reconoce quien lo subió. */
  nombre: string
  /** Bytes que ocupa ya guardado (después de encoger, si era una foto). */
  tamano: number
  tipo: string
}

/** Más de esto, ya guardado, no es un justificante de una transferencia. */
export const TAMANO_MAXIMO = 8 * 1024 * 1024

/**
 * Tope de lo que se acepta leer de disco.
 *
 * Una foto se mide DESPUÉS de encogerla, no antes: los móviles sacan fotos de
 * 9 o 12 MB y encogidas se quedan en unos cientos de KB. Medir antes rechazaba
 * justo el caso más común.
 */
const TAMANO_MAXIMO_ORIGEN = 40 * 1024 * 1024

/** Trozo de texto que cabe de sobra en un documento de Firestore (límite: 1 MB). */
const TROZO = 700_000

/** A partir de aquí una foto se encoge antes de guardarla. */
const LADO_MAXIMO = 1600
const CALIDAD = 0.72

export const COLECCION = 'justificantes'

export class ErrorJustificante extends Error {}

/**
 * Encoge una foto hasta que quepa sin dejar de leerse.
 *
 * Solo toca imágenes; un PDF se guarda tal cual, que ya viene ligero y
 * recomprimirlo no se puede hacer en el navegador sin estropearlo.
 */
export async function encogeFoto(fichero: File): Promise<Blob> {
  if (!fichero.type.startsWith('image/')) return fichero
  try {
    const bitmap = await createImageBitmap(fichero)
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height))
    const ancho = Math.round(bitmap.width * escala)
    const alto = Math.round(bitmap.height * escala)
    const lienzo = document.createElement('canvas')
    lienzo.width = ancho
    lienzo.height = alto
    lienzo.getContext('2d')!.drawImage(bitmap, 0, 0, ancho, alto)
    const jpeg = await new Promise<Blob | null>(r => lienzo.toBlob(r, 'image/jpeg', CALIDAD))
    bitmap.close()
    // Si encoger no mejora nada (un JPEG ya pequeño), se deja el original.
    return jpeg && jpeg.size < fichero.size ? jpeg : fichero
  } catch {
    return fichero
  }
}

/** El contenido en base64, que es como viaja dentro de un documento. */
function aBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onerror = () => reject(new ErrorJustificante('No se ha podido leer el fichero.'))
    lector.onload = () => {
      const s = String(lector.result)
      resolve(s.slice(s.indexOf(',') + 1))
    }
    lector.readAsDataURL(blob)
  })
}

function troceado(texto: string): string[] {
  const trozos: string[] = []
  for (let i = 0; i < texto.length; i += TROZO) trozos.push(texto.slice(i, i + TROZO))
  return trozos
}

/**
 * Guarda un justificante y devuelve dónde ha quedado.
 *
 * Se escribe todo de una vez: si algo falla a mitad no queda un justificante
 * cojo, con la ficha guardada y los trozos a medias.
 */
export async function subeJustificante(fichero: File, fecha?: string): Promise<Justificante> {
  const esFoto = fichero.type.startsWith('image/')
  const tope = esFoto ? TAMANO_MAXIMO_ORIGEN : TAMANO_MAXIMO
  if (fichero.size > tope) {
    throw new ErrorJustificante(
      `«${fichero.name}» ocupa ${tamanoLegible(fichero.size)} y el máximo son ${tamanoLegible(tope)}.`)
  }

  const contenido = await encogeFoto(fichero)
  if (contenido.size > TAMANO_MAXIMO) {
    throw new ErrorJustificante(
      `«${fichero.name}» sigue ocupando ${tamanoLegible(contenido.size)} después de encogerlo `
      + `y el máximo son ${tamanoLegible(TAMANO_MAXIMO)}.`)
  }
  const tipo = contenido === (fichero as Blob) ? (fichero.type || 'application/octet-stream') : 'image/jpeg'
  const datos = await aBase64(contenido)
  const trozos = troceado(datos)

  const id = `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  const anio = (fecha || new Date().toISOString()).slice(0, 4)

  try {
    const lote = writeBatch(db)
    lote.set(doc(db, COLECCION, id), {
      id, nombre: fichero.name, tipo, anio,
      tamano: contenido.size, partes: trozos.length,
      creado: new Date().toISOString(),
    })
    trozos.forEach((t, i) => lote.set(doc(db, COLECCION, `${id}__p${i}`), { datos: t }))
    await lote.commit()
  } catch {
    throw new ErrorJustificante(
      'No se ha podido guardar el justificante. El cobro sí se ha anotado; el documento no.')
  }

  return { url: `firestore:${id}`, ruta: id, nombre: fichero.name, tamano: contenido.size, tipo }
}

/** Rearma el fichero guardado. Devuelve null si ya no está. */
export async function leeJustificante(idOUrl: string): Promise<{ blob: Blob; nombre: string } | null> {
  const id = idOUrl.replace(/^firestore:/, '')
  const ficha = await getDoc(doc(db, COLECCION, id))
  if (!ficha.exists()) return null
  const { nombre, tipo, partes } = ficha.data() as { nombre: string; tipo: string; partes: number }

  const trozos = await Promise.all(
    Array.from({ length: partes }, (_, i) => getDoc(doc(db, COLECCION, `${id}__p${i}`))))
  if (trozos.some(t => !t.exists())) return null

  const base64 = trozos.map(t => (t.data() as { datos: string }).datos).join('')
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return { blob: new Blob([bytes], { type: tipo }), nombre }
}

/**
 * Abre el justificante en otra pestaña; si el navegador lo bloquea, lo descarga.
 *
 * Es lo que hay detrás del enlace del registro: el fichero no vive en una URL,
 * se arma aquí con los trozos guardados.
 */
export async function abreJustificante(idOUrl: string): Promise<void> {
  const doc_ = await leeJustificante(idOUrl)
  if (!doc_) throw new ErrorJustificante('Ese justificante ya no está guardado.')
  const url = URL.createObjectURL(doc_.blob)
  const ventana = window.open(url, '_blank', 'noopener')
  if (!ventana) {
    const a = document.createElement('a')
    a.href = url
    a.download = doc_.nombre
    a.click()
  }
  // Se suelta tarde a propósito: si se revoca al momento, la pestaña recién
  // abierta se queda sin nada que enseñar.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Borra un justificante y sus trozos. Solo se usa al deshacer una subida. */
export async function borraJustificante(idOUrl: string): Promise<void> {
  const id = idOUrl.replace(/^firestore:/, '')
  try {
    const ficha = await getDoc(doc(db, COLECCION, id))
    const partes = ficha.exists() ? (ficha.data() as { partes?: number }).partes ?? 0 : 0
    const lote = writeBatch(db)
    lote.delete(doc(db, COLECCION, id))
    for (let i = 0; i < partes; i++) lote.delete(doc(db, COLECCION, `${id}__p${i}`))
    await lote.commit()
  } catch {
    // Que no esté ya es el resultado que se buscaba.
    await deleteDoc(doc(db, COLECCION, id)).catch(() => {})
  }
}

/** «2,3 MB» / «812 KB», para enseñarlo al lado del enlace. */
export function tamanoLegible(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`
  return `${Math.round(bytes / 1024)} KB`
}
