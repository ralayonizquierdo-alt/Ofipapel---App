import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from './firebase'
import { borraJustificante, leeJustificante, subeJustificante } from './justificantes'
import { usuarioActual } from './auth'

/**
 * Los ficheros de fuera que se comparan en Asesoría, guardados para no tener
 * que ir a buscarlos cada vez (Luis, 11/11/2026: «así no tengo que ir a
 * buscarlos, descargarlos, etc.»): la hoja del gestor («ALQUILER MAURIZ…») y
 * el informe anual de SOC del Arenal.
 *
 * El fichero va troceado en la colección de justificantes (mismo mecanismo,
 * sin Firebase Storage); aquí solo la ficha. **Uno por clase y año**: la hoja
 * del gestor llega cada trimestre más completa, así que la nueva sustituye a
 * la anterior y no se acumulan versiones que confundan.
 *
 * Guardar el fichero no toca ninguna cifra de la app.
 */
export type ClaseDocumento = 'gestor' | 'soc'

export interface DocumentoAsesoria {
  /** `${clase}-${anio}`: así el nuevo sustituye al anterior del mismo año. */
  id: string
  clase: ClaseDocumento
  anio: number
  nombre: string
  /** Dónde está el fichero: `firestore:<id>` (ver lib/justificantes.ts). */
  fichero: string
  tamano: number
  subido: string
  por?: string
}

export const COLECCION_DOCUMENTOS = 'documentosAsesoria'

export const NOMBRE_CLASE: Record<ClaseDocumento, string> = {
  gestor: 'Hoja del gestor (Mauriz)',
  soc: 'Informe de SOC · Arenal 2B',
}

/** La lista, al día, de la más nueva a la más antigua por año. */
export function useDocumentosAsesoria(): DocumentoAsesoria[] {
  const [lista, setLista] = useState<DocumentoAsesoria[]>([])
  useEffect(() => onSnapshot(collection(db, COLECCION_DOCUMENTOS), s => {
    setLista(s.docs.map(d => d.data() as DocumentoAsesoria)
      .sort((a, b) => b.anio - a.anio || a.clase.localeCompare(b.clase)))
  }, () => setLista([])), [])
  return lista
}

/**
 * Guarda el fichero y su ficha. Si ya había uno de esa clase y año, lo
 * sustituye y borra el fichero viejo.
 */
export async function guardaDocumento(
  f: File, clase: ClaseDocumento, anio: number, anterior?: DocumentoAsesoria,
): Promise<DocumentoAsesoria> {
  const j = await subeJustificante(f, `${anio}-01-01`)
  const ficha: DocumentoAsesoria = {
    id: `${clase}-${anio}`, clase, anio, nombre: f.name, fichero: j.url, tamano: j.tamano,
    subido: new Date().toISOString(), por: usuarioActual() ?? undefined,
  }
  await setDoc(doc(db, COLECCION_DOCUMENTOS, ficha.id), JSON.parse(JSON.stringify(ficha)))
  if (anterior && anterior.fichero !== ficha.fichero) await borraJustificante(anterior.fichero)
  return ficha
}

/** El fichero guardado, como si se acabara de soltar. */
export async function recuperaDocumento(d: DocumentoAsesoria): Promise<File | null> {
  const leido = await leeJustificante(d.fichero)
  return leido ? new File([leido.blob], d.nombre, { type: leido.blob.type }) : null
}

export async function quitaDocumento(d: DocumentoAsesoria): Promise<void> {
  await deleteDoc(doc(db, COLECCION_DOCUMENTOS, d.id))
  await borraJustificante(d.fichero)
}
