import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Database } from '../types'
import { loadDatabase, saveDatabase, resetDatabase } from './db'

interface DatabaseContextValue {
  db: Database
  setDb: (updater: (prev: Database) => Database) => void
  reset: () => void
}

const DatabaseContext = createContext<DatabaseContextValue | null>(null)

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [db, setDbState] = useState<Database>(() => loadDatabase())

  useEffect(() => {
    saveDatabase(db)
  }, [db])

  const value = useMemo<DatabaseContextValue>(
    () => ({
      db,
      setDb: (updater) => setDbState((prev) => updater(prev)),
      reset: () => setDbState(resetDatabase()),
    }),
    [db],
  )

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>
}

export function useDatabase(): DatabaseContextValue {
  const ctx = useContext(DatabaseContext)
  if (!ctx) throw new Error('useDatabase debe usarse dentro de <DatabaseProvider>')
  return ctx
}

/** Acceso genérico de lectura/escritura a una colección de la base de datos. */
export function useCollection<K extends keyof Database>(key: K) {
  const { db, setDb } = useDatabase()
  const items = db[key]

  function add(item: Database[K][number]) {
    setDb((prev) => ({ ...prev, [key]: [item, ...prev[key]] }) as Database)
  }
  function update(id: string, patch: Partial<Database[K][number]>) {
    setDb((prev) => ({
      ...prev,
      [key]: (prev[key] as Array<{ id: string }>).map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }) as Database)
  }
  function remove(id: string) {
    setDb((prev) => ({
      ...prev,
      [key]: (prev[key] as Array<{ id: string }>).filter((it) => it.id !== id),
    }) as Database)
  }

  return { items, add, update, remove }
}
