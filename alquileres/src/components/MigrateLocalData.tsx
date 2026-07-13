import { useState, useEffect } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db, stripUndef } from '../lib/firebase'

const LS_COLS: Record<string, string> = {
  reservations: 'aq_reservations',
  payments: 'aq_payments',
  repairs: 'aq_repairs',
  expenses: 'aq_expenses',
  offerPrices: 'aq_offer_prices',
}

function hasLocalData(): boolean {
  return Object.values(LS_COLS).some(key => {
    const raw = localStorage.getItem(key)
    if (!raw) return false
    try { return JSON.parse(raw).length > 0 } catch { return false }
  })
}

export default function MigrateLocalData() {
  const [show, setShow] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [progress, setProgress] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('aq_migration_done')) return
    if (hasLocalData()) setShow(true)
  }, [])

  async function migrate() {
    setMigrating(true)
    for (const [col, key] of Object.entries(LS_COLS)) {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const items: Array<{ id: string }> = JSON.parse(raw).filter((i: { id?: string }) => i.id)
      setProgress(`Subiendo ${col} (${items.length})...`)
      for (const item of items) {
        await setDoc(doc(db, col, item.id), stripUndef(item))
      }
    }
    localStorage.setItem('aq_migration_done', '1')
    setMigrating(false)
    setDone(true)
    setTimeout(() => setShow(false), 3000)
  }

  function dismiss() {
    localStorage.setItem('aq_migration_done', '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 bg-amber-500 text-white rounded-xl p-4 shadow-xl">
      {done ? (
        <p className="font-bold text-center text-sm">✅ Datos migrados correctamente</p>
      ) : migrating ? (
        <p className="font-semibold text-center text-sm">{progress || 'Migrando...'}</p>
      ) : (
        <>
          <p className="font-bold text-sm mb-1">Datos locales detectados</p>
          <p className="text-xs mb-3 opacity-90">Hay datos guardados en este dispositivo. ¿Subirlos a Firestore?</p>
          <div className="flex gap-2">
            <button
              onClick={migrate}
              className="flex-1 bg-white text-amber-700 font-bold py-2 rounded-lg text-sm">
              Sí, migrar ahora
            </button>
            <button
              onClick={dismiss}
              className="px-4 py-2 bg-amber-600 rounded-lg text-sm font-medium">
              Ignorar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
