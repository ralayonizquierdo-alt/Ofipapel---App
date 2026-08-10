import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, getDoc, writeBatch } from 'firebase/firestore'
import { db, stripUndef, ensureAnonSession } from '../lib/firebase'
import { nanoid } from '../lib/nanoid'
import { DEFAULT_PRICES_2026 } from '../lib/priceCalc'
import type { Apartment, PriceEntry, Reservation, Payment, Repair, Expense, OfferPrice, DeletedRepair } from '../types'

// ─── Default seed data ────────────────────────────────────────────────────────

const DEFAULT_APARTMENTS: Apartment[] = [
  { id: '104',   name: 'Apartamento 104', bedrooms: 1, type: '1BR',       active: true },
  { id: '105',   name: 'Apartamento 105', bedrooms: 1, type: '1BR',       active: true },
  { id: '106',   name: 'Apartamento 106', bedrooms: 2, type: '2BR',       active: true },
  { id: '203',   name: 'Apartamento 203', bedrooms: 2, type: '2BR',       active: true },
  { id: '204',   name: 'Apartamento 204', bedrooms: 2, type: '2BR',       active: true },
  { id: '402',   name: 'Ático 402',       bedrooms: 2, type: '2BR_ATICO', active: true },
  { id: 'P3',    name: 'Piso 3',          bedrooms: 3, type: '3BR',       active: true },
  { id: 'AP2B',  name: 'Arenal 2B',       bedrooms: 1, type: '1BR',       active: true },
  { id: 'JXXIII',name: 'Juan XXIII',      bedrooms: 2, type: '2BR',       active: true },
]

const DEFAULT_PRICE_ENTRIES: PriceEntry[] = DEFAULT_PRICES_2026.map((p, i) => ({ ...p, id: `price_${i}` }))

// ─── Context types ────────────────────────────────────────────────────────────

interface DataContextValue {
  loading: boolean
  apartments: Apartment[]
  prices: PriceEntry[]
  reservations: Reservation[]
  payments: Payment[]
  repairs: Repair[]
  expenses: Expense[]
  offerPrices: OfferPrice[]

  addApartment:    (data: Omit<Apartment, 'id'> & { id?: string }) => Apartment
  updateApartment: (id: string, data: Partial<Apartment>) => void
  deleteApartment: (id: string) => void

  addPrice:    (data: Omit<PriceEntry, 'id'>) => PriceEntry
  updatePrice: (id: string, data: Partial<PriceEntry>) => void
  deletePrice: (id: string) => void

  addReservation:    (data: Omit<Reservation, 'id' | 'createdAt'>) => Reservation
  updateReservation: (id: string, data: Partial<Reservation>) => void
  deleteReservation: (id: string, currentPayments: Payment[]) => void

  addPayment:    (data: Omit<Payment, 'id' | 'createdAt'>) => Payment
  updatePayment: (id: string, data: Partial<Payment>) => void
  deletePayment: (id: string) => void

  addRepair:    (data: Omit<Repair, 'id' | 'createdAt'>) => Repair
  updateRepair: (id: string, data: Partial<Repair>) => void
  deleteRepair: (id: string) => void
  deleteRepairWithAudit: (repair: Repair, reason: string, deletedBy: string) => void

  deletedRepairs: DeletedRepair[]

  addExpense:    (data: Omit<Expense, 'id' | 'createdAt'>) => Expense
  updateExpense: (id: string, data: Partial<Expense>) => void
  deleteExpense: (id: string) => void

  addOfferPrice:    (data: Omit<OfferPrice, 'id'>) => OfferPrice
  updateOfferPrice: (id: string, data: Partial<OfferPrice>) => void
  deleteOfferPrice: (id: string) => void
}

const DataContext = createContext<DataContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components -- patrón estándar de Context: hook + Provider en el mismo fichero
export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DataProvider({ children }: { children: ReactNode }) {
  const [apartments,  setApartments]  = useState<Apartment[]>([])
  const [prices,      setPrices]      = useState<PriceEntry[]>([])
  const [reservations,setReservations]= useState<Reservation[]>([])
  const [payments,    setPayments]    = useState<Payment[]>([])
  const [repairs,     setRepairs]     = useState<Repair[]>([])
  const [expenses,    setExpenses]    = useState<Expense[]>([])
  const [offerPrices, setOfferPrices] = useState<OfferPrice[]>([])
  const [deletedRepairs, setDeletedRepairs] = useState<DeletedRepair[]>([])
  const [ready, setReady] = useState({ apartments:false, prices:false, reservations:false, payments:false, repairs:false, expenses:false, offerPrices:false, deletedRepairs:false })

  const loading = !Object.values(ready).every(Boolean)

  // ── Sesión anónima (ver firestore.rules) ─────────────────────────────────────
  // No bloquea las suscripciones de abajo: mientras las reglas sigan en modo
  // abierto o el proveedor Anonymous no esté activado, esto falla en
  // silencio y la app sigue leyendo/escribiendo igual que hoy.
  useEffect(() => {
    ensureAnonSession().catch((err) => console.error('No se pudo abrir sesión anónima de Firebase:', err))
  }, [])

  // ── Real-time subscriptions ──────────────────────────────────────────────────
  useEffect(() => {
    const mark = (k: keyof typeof ready) => setReady(r => ({ ...r, [k]: true }))

    const subs = [
      onSnapshot(collection(db, 'apartments'),   s => { setApartments(s.docs.map(d => d.data() as Apartment));    mark('apartments') }),
      onSnapshot(collection(db, 'prices'),       s => { setPrices(s.docs.map(d => d.data() as PriceEntry));       mark('prices') }),
      onSnapshot(collection(db, 'reservations'), s => { setReservations(s.docs.map(d => d.data() as Reservation));mark('reservations') }),
      onSnapshot(collection(db, 'payments'),     s => { setPayments(s.docs.map(d => d.data() as Payment));        mark('payments') }),
      onSnapshot(collection(db, 'repairs'),      s => { setRepairs(s.docs.map(d => d.data() as Repair));          mark('repairs') }),
      onSnapshot(collection(db, 'expenses'),     s => { setExpenses(s.docs.map(d => d.data() as Expense));        mark('expenses') }),
      onSnapshot(collection(db, 'offerPrices'),  s => { setOfferPrices(s.docs.map(d => d.data() as OfferPrice));  mark('offerPrices') }),
      onSnapshot(collection(db, 'deletedRepairs'), s => { setDeletedRepairs(s.docs.map(d => d.data() as DeletedRepair)); mark('deletedRepairs') }),
    ]

    return () => subs.forEach(u => u())
  }, [])

  // ── Seed defaults on first run ───────────────────────────────────────────────
  useEffect(() => {
    async function seed() {
      const metaRef = doc(db, 'meta', 'config')
      const snap = await getDoc(metaRef)
      if (snap.exists() && snap.data().seeded) return

      const batch = writeBatch(db)
      DEFAULT_APARTMENTS.forEach(a => batch.set(doc(db, 'apartments', a.id), stripUndef(a)))
      DEFAULT_PRICE_ENTRIES.forEach(p => batch.set(doc(db, 'prices', p.id), stripUndef(p)))
      batch.set(metaRef, { seeded: true, seededAt: new Date().toISOString() })
      await batch.commit()
    }
    seed()
  }, [])

  // ── Apartments ───────────────────────────────────────────────────────────────
  function addApartment(data: Omit<Apartment, 'id'> & { id?: string }): Apartment {
    const id = data.id || nanoid()
    const item: Apartment = { ...data, id }
    setDoc(doc(db, 'apartments', id), stripUndef(item))
    return item
  }
  function updateApartment(id: string, data: Partial<Apartment>) {
    updateDoc(doc(db, 'apartments', id), stripUndef(data))
  }
  function deleteApartment(id: string) {
    deleteDoc(doc(db, 'apartments', id))
  }

  // ── Prices ───────────────────────────────────────────────────────────────────
  function addPrice(data: Omit<PriceEntry, 'id'>): PriceEntry {
    const id = nanoid()
    const item: PriceEntry = { ...data, id }
    setDoc(doc(db, 'prices', id), stripUndef(item))
    return item
  }
  function updatePrice(id: string, data: Partial<PriceEntry>) {
    updateDoc(doc(db, 'prices', id), stripUndef(data))
  }
  function deletePrice(id: string) {
    deleteDoc(doc(db, 'prices', id))
  }

  // ── Reservations ─────────────────────────────────────────────────────────────
  function addReservation(data: Omit<Reservation, 'id' | 'createdAt'>): Reservation {
    const id = nanoid()
    const item: Reservation = { ...data, id, createdAt: new Date().toISOString() }
    setDoc(doc(db, 'reservations', id), stripUndef(item))
    return item
  }
  function updateReservation(id: string, data: Partial<Reservation>) {
    updateDoc(doc(db, 'reservations', id), stripUndef(data))
  }
  function deleteReservation(id: string, currentPayments: Payment[]) {
    deleteDoc(doc(db, 'reservations', id))
    currentPayments
      .filter(p => p.reservationId === id)
      .forEach(p => deleteDoc(doc(db, 'payments', p.id)))
  }

  // ── Payments ─────────────────────────────────────────────────────────────────
  function addPayment(data: Omit<Payment, 'id' | 'createdAt'>): Payment {
    const id = nanoid()
    const item: Payment = { ...data, id, createdAt: new Date().toISOString() }
    setDoc(doc(db, 'payments', id), stripUndef(item))
    return item
  }
  function updatePayment(id: string, data: Partial<Payment>) {
    updateDoc(doc(db, 'payments', id), stripUndef(data))
  }
  function deletePayment(id: string) {
    deleteDoc(doc(db, 'payments', id))
  }

  // ── Repairs ──────────────────────────────────────────────────────────────────
  function addRepair(data: Omit<Repair, 'id' | 'createdAt'>): Repair {
    const id = nanoid()
    const item: Repair = { ...data, id, createdAt: new Date().toISOString() }
    setDoc(doc(db, 'repairs', id), stripUndef(item))
    return item
  }
  function updateRepair(id: string, data: Partial<Repair>) {
    updateDoc(doc(db, 'repairs', id), stripUndef(data))
  }
  function deleteRepair(id: string) {
    deleteDoc(doc(db, 'repairs', id))
  }
  function deleteRepairWithAudit(repair: Repair, reason: string, deletedBy: string) {
    const entry: DeletedRepair = {
      id: nanoid(),
      originalId: repair.id,
      reason,
      deletedAt: new Date().toISOString(),
      deletedBy,
      apartmentId: repair.apartmentId,
      repairDate: repair.repairDate,
      item: repair.item,
      supplier: repair.supplier,
      document: repair.document,
      amount: repair.amount,
      entryNumber: repair.entryNumber,
    }
    const batch = writeBatch(db)
    batch.set(doc(db, 'deletedRepairs', entry.id), stripUndef(entry))
    batch.delete(doc(db, 'repairs', repair.id))
    batch.commit()
  }

  // ── Expenses ─────────────────────────────────────────────────────────────────
  function addExpense(data: Omit<Expense, 'id' | 'createdAt'>): Expense {
    const id = nanoid()
    const item: Expense = { ...data, id, createdAt: new Date().toISOString() }
    setDoc(doc(db, 'expenses', id), stripUndef(item))
    return item
  }
  function updateExpense(id: string, data: Partial<Expense>) {
    updateDoc(doc(db, 'expenses', id), stripUndef(data))
  }
  function deleteExpense(id: string) {
    deleteDoc(doc(db, 'expenses', id))
  }

  // ── Offer prices ─────────────────────────────────────────────────────────────
  function addOfferPrice(data: Omit<OfferPrice, 'id'>): OfferPrice {
    const id = nanoid()
    const item: OfferPrice = { ...data, id }
    setDoc(doc(db, 'offerPrices', id), stripUndef(item))
    return item
  }
  function updateOfferPrice(id: string, data: Partial<OfferPrice>) {
    updateDoc(doc(db, 'offerPrices', id), stripUndef(data))
  }
  function deleteOfferPrice(id: string) {
    deleteDoc(doc(db, 'offerPrices', id))
  }

  return (
    <DataContext.Provider value={{
      loading, apartments, prices, reservations, payments, repairs, expenses, offerPrices,
      deletedRepairs,
      addApartment, updateApartment, deleteApartment,
      addPrice, updatePrice, deletePrice,
      addReservation, updateReservation, deleteReservation,
      addPayment, updatePayment, deletePayment,
      addRepair, updateRepair, deleteRepair, deleteRepairWithAudit,
      addExpense, updateExpense, deleteExpense,
      addOfferPrice, updateOfferPrice, deleteOfferPrice,
    }}>
      {children}
    </DataContext.Provider>
  )
}
