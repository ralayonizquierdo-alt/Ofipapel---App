import type { Database } from '../types'
import { generateDatabase } from './seed'

const STORAGE_KEY = 'ofipapel-erp-db-v1'

export function loadDatabase(): Database {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      return JSON.parse(raw) as Database
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
