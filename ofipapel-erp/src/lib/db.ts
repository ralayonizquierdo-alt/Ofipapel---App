import type { Database } from '../types'
import { generateDatabase } from './seed'

const STORAGE_KEY = 'ofipapel-erp-db-v4'

/**
 * Rellena cualquier colección que falte en un snapshot guardado por una versión
 * anterior de la app (p. ej. abierta antes de añadir un módulo nuevo), en vez de
 * romper la pantalla que la usa.
 */
function withMissingCollections(parsed: Partial<Database>): Database {
  const fresh = generateDatabase()
  const merged: Record<string, unknown> = { ...fresh, ...parsed }
  for (const key of Object.keys(fresh)) {
    if (!Array.isArray(merged[key])) {
      merged[key] = fresh[key as keyof Database]
    }
  }
  return merged as unknown as Database
}

export function loadDatabase(): Database {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<Database>
      const complete = withMissingCollections(parsed)
      saveDatabase(complete)
      return complete
    } catch {
      // fall through to regeneration if the stored payload is corrupted
    }
  }
  const fresh = generateDatabase()
  saveDatabase(fresh)
  return fresh
}

export function saveDatabase(db: Database): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

export function resetDatabase(): Database {
  const fresh = generateDatabase()
  saveDatabase(fresh)
  return fresh
}
