import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from './firebase'
import { usuarioActual } from './auth'

/**
 * Notas de la comparación con el gestor y con SOC, por año (Luis, 12/11/2026:
 * «ábrete una nota en Asesoría, abajo al final de comparar con el gestor, con
 * todo lo que me pones muy resumidamente, para que no ocupe mucho, e incluso
 * eliminar lo resuelto e incluir notas según el año»).
 *
 * Cada nota es una línea corta: el porqué de una diferencia o lo que queda
 * por mirar. Lo resuelto se quita.
 */
export interface NotaAsesoria {
  id: string
  anio: number
  texto: string
  creado: string
  por?: string
}

export const COLECCION_NOTAS = 'notasAsesoria'

export function useNotasAsesoria(): NotaAsesoria[] {
  const [lista, setLista] = useState<NotaAsesoria[]>([])
  useEffect(() => onSnapshot(collection(db, COLECCION_NOTAS), s => {
    setLista(s.docs.map(d => d.data() as NotaAsesoria)
      .sort((a, b) => b.anio - a.anio || a.creado.localeCompare(b.creado)))
  }, () => setLista([])), [])
  return lista
}

export async function anotaAsesoria(anio: number, texto: string): Promise<void> {
  const id = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const nota: NotaAsesoria = {
    id, anio, texto: texto.trim(), creado: new Date().toISOString(), por: usuarioActual() ?? undefined,
  }
  await setDoc(doc(db, COLECCION_NOTAS, id), JSON.parse(JSON.stringify(nota)))
}

export async function quitaNotaAsesoria(id: string): Promise<void> {
  await deleteDoc(doc(db, COLECCION_NOTAS, id))
}
