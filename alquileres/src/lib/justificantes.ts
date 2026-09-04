import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from './firebase'

/**
 * Guarda el papel, no solo la cifra.
 *
 * Hasta ahora la aplicación leía el PDF o la foto de un justificante, sacaba el
 * importe y la fecha, y descartaba el fichero. La cifra quedaba anotada y el
 * documento no quedaba en ninguna parte, así que el día que la asesoría o
 * Hacienda pidan el respaldo de un cobro no había nada que enseñar.
 *
 * Aquí el fichero se sube tal cual a Firebase Storage y se devuelve un enlace
 * permanente que se guarda junto al cobro y en el registro de subidas.
 */

/** Lo que se guarda del justificante, tanto en el cobro como en el registro. */
export interface Justificante {
  /** Enlace de descarga, permanente mientras el fichero exista. */
  url: string
  /** Ruta dentro del almacén, para poder borrarlo si hiciera falta. */
  ruta: string
  /** Nombre original, que es como lo reconoce quien lo subió. */
  nombre: string
  /** Bytes, para poder avisar si algo viene raro. */
  tamano: number
  tipo: string
}

/** Más de esto no es un justificante, es otra cosa. */
export const TAMANO_MAXIMO = 15 * 1024 * 1024

export class ErrorJustificante extends Error {}

/** Quita acentos, espacios y todo lo que dé guerra en una URL. */
function nombreLimpio(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-80)
}

/**
 * Sube un justificante y devuelve dónde ha quedado.
 *
 * La ruta lleva el año delante para que el almacén quede ordenado por
 * ejercicio, que es como se buscan estas cosas cuando las piden.
 */
export async function subeJustificante(fichero: File, fecha?: string): Promise<Justificante> {
  if (fichero.size > TAMANO_MAXIMO) {
    throw new ErrorJustificante(
      `«${fichero.name}» ocupa ${(fichero.size / 1024 / 1024).toFixed(1)} MB y el máximo son 15 MB.`)
  }
  const anio = (fecha || new Date().toISOString()).slice(0, 4)
  const sello = Date.now().toString(36)
  const ruta = `justificantes/${anio}/${sello}-${nombreLimpio(fichero.name)}`
  try {
    const destino = ref(storage, ruta)
    await uploadBytes(destino, fichero, { contentType: fichero.type || 'application/octet-stream' })
    return {
      url: await getDownloadURL(destino),
      ruta,
      nombre: fichero.name,
      tamano: fichero.size,
      tipo: fichero.type || '',
    }
  } catch (e) {
    // El caso más probable es que Storage no esté activado todavía en el
    // proyecto de Firebase. Se dice tal cual en vez de un error de librería.
    const codigo = (e as { code?: string })?.code ?? ''
    if (codigo.includes('unauthorized') || codigo.includes('unauthenticated')) {
      throw new ErrorJustificante(
        'El almacén de justificantes no acepta la subida. Hay que activar Storage en Firebase '
        + 'y desplegar storage.rules.')
    }
    throw new ErrorJustificante(
      'No se ha podido guardar el justificante. El cobro sí se ha anotado; el documento no.')
  }
}

/** Borra un justificante del almacén. Solo se usa al deshacer una subida. */
export async function borraJustificante(ruta: string): Promise<void> {
  try {
    await deleteObject(ref(storage, ruta))
  } catch {
    // Que no exista ya es el resultado que se buscaba.
  }
}

/** «2,3 MB» / «812 KB», para enseñarlo al lado del enlace. */
export function tamanoLegible(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`
  return `${Math.round(bytes / 1024)} KB`
}
