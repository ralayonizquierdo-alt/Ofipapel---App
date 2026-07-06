import { useEffect, useState } from 'react'
import { useDatabase } from './DatabaseContext'
import { buildVerifactuChain, type VerifactuChainEntry } from './verifactu'

/** Cadena de huellas Veri*Factu de todas las facturas, recalculada solo cuando cambian. */
export function useVerifactuChain() {
  const { db } = useDatabase()
  const [chain, setChain] = useState<Map<string, VerifactuChainEntry> | null>(null)

  useEffect(() => {
    let cancelled = false
    setChain(null)
    buildVerifactuChain(db.invoices).then((result) => {
      if (!cancelled) setChain(result)
    })
    return () => {
      cancelled = true
    }
  }, [db.invoices])

  return chain
}
