import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, getDoc, writeBatch } from 'firebase/firestore'
import { db, stripUndef } from '../lib/firebase'
import { esSesionReal, observarSesion, usuarioActual } from '../lib/auth'
import { nanoid } from '../lib/nanoid'
import { DEFAULT_PRICES_2026 } from '../lib/priceCalc'
import type { Apartment, PriceEntry, Reservation, Payment, Repair, Expense, OfferPrice, DeletedRepair, IngresoMensual, OcupacionMensual, ReparacionMensual, ImportLog } from '../types'

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
  /** Ingresos brutos declarados (del Excel), por inmueble y mes. */
  incomes: IngresoMensual[]
  /** Ocupación declarada (del Excel), por inmueble y mes. */
  occupancies: OcupacionMensual[]
  /** Reparaciones declaradas en el Excel. Solo para comparar; el gasto real
   *  está en `repairs`, con proveedor y factura. */
  repairTotals: ReparacionMensual[]
  /** Registro de volcados de Excel: qué fichero, cuándo y quién lo subió. */
  importLogs: ImportLog[]

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
  importExpenses: (items: Expense[]) => Promise<number>
  importIncomes: (items: IngresoMensual[]) => Promise<number>
  importOccupancies: (items: OcupacionMensual[]) => Promise<number>
  importRepairTotals: (items: ReparacionMensual[]) => Promise<number>
  /** Borra lo importado de un Excel anterior de ese año que ya no está en el nuevo. */
  purgeImported: (year: number, conservar: {
    expenses: string[]; incomes: string[]; occupancies: string[]; repairTotals: string[]
  }) => Promise<number>
  /** Deja constancia de un volcado de Excel. */
  anotaVolcado: (datos: Omit<ImportLog, 'id' | 'at' | 'by'>) => void
  /** Sustituye las reservas de esos años (y sus cobros) por las nuevas. */
  reemplazaReservas: (
    nuevas: Omit<Reservation, 'id' | 'createdAt'>[], anios: string[],
  ) => Promise<{ borradas: number; creadas: number }>

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
  const [incomes, setIncomes] = useState<IngresoMensual[]>([])
  const [occupancies, setOccupancies] = useState<OcupacionMensual[]>([])
  const [repairTotals, setRepairTotals] = useState<ReparacionMensual[]>([])
  const [importLogs, setImportLogs] = useState<ImportLog[]>([])
  const [ready, setReady] = useState({ apartments:false, prices:false, reservations:false, payments:false, repairs:false, expenses:false, offerPrices:false, deletedRepairs:false, incomes:false, occupancies:false, repairTotals:false, importLogs:false })

  const loading = !Object.values(ready).every(Boolean)

  // ── Sesión ───────────────────────────────────────────────────────────────────
  // Los datos solo se piden con una sesión de persona. Sin ella no se abre
  // ninguna suscripción: ni siquiera se intenta leer.
  const [autenticado, setAutenticado] = useState(false)
  useEffect(() => observarSesion(u => setAutenticado(esSesionReal(u))), [])

  // ── Real-time subscriptions ──────────────────────────────────────────────────
  useEffect(() => {
    if (!autenticado) return
    const mark = (k: keyof typeof ready) => setReady(r => ({ ...r, [k]: true }))

    const subs = [
      onSnapshot(collection(db, 'apartments'),     s => { setApartments(s.docs.map(d => d.data() as Apartment));       mark('apartments') },    () => mark('apartments')),
      onSnapshot(collection(db, 'prices'),         s => { setPrices(s.docs.map(d => d.data() as PriceEntry));          mark('prices') },         () => mark('prices')),
      onSnapshot(collection(db, 'reservations'),   s => { setReservations(s.docs.map(d => d.data() as Reservation));   mark('reservations') },   () => mark('reservations')),
      onSnapshot(collection(db, 'payments'),       s => { setPayments(s.docs.map(d => d.data() as Payment));           mark('payments') },       () => mark('payments')),
      onSnapshot(collection(db, 'repairs'),        s => { setRepairs(s.docs.map(d => d.data() as Repair));             mark('repairs') },        () => mark('repairs')),
      onSnapshot(collection(db, 'expenses'),       s => { setExpenses(s.docs.map(d => d.data() as Expense));           mark('expenses') },       () => mark('expenses')),
      onSnapshot(collection(db, 'offerPrices'),    s => { setOfferPrices(s.docs.map(d => d.data() as OfferPrice));     mark('offerPrices') },    () => mark('offerPrices')),
      onSnapshot(collection(db, 'deletedRepairs'), s => { setDeletedRepairs(s.docs.map(d => d.data() as DeletedRepair)); mark('deletedRepairs') }, () => mark('deletedRepairs')),
      onSnapshot(collection(db, 'incomes'),        s => { setIncomes(s.docs.map(d => d.data() as IngresoMensual));      mark('incomes') },        () => mark('incomes')),
      onSnapshot(collection(db, 'occupancies'),    s => { setOccupancies(s.docs.map(d => d.data() as OcupacionMensual)); mark('occupancies') },   () => mark('occupancies')),
      onSnapshot(collection(db, 'repairTotals'),   s => { setRepairTotals(s.docs.map(d => d.data() as ReparacionMensual)); mark('repairTotals') },  () => mark('repairTotals')),
      onSnapshot(collection(db, 'importLogs'),     s => { setImportLogs(s.docs.map(d => d.data() as ImportLog));           mark('importLogs') },    () => mark('importLogs')),
    ]

    return () => subs.forEach(u => u())
  }, [autenticado])

  // ── Seed defaults on first run ───────────────────────────────────────────────
  useEffect(() => {
    if (!autenticado) return
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
  }, [autenticado])

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
  /**
   * Alta masiva desde el Excel. Cada apunte trae un id estable
   * (inmueble+mes+concepto), así que reimportar el mismo fichero actualiza los
   * apuntes en lugar de duplicarlos. Firestore limita el lote a 500 escrituras.
   */
  async function importOccupancies(items: OcupacionMensual[]): Promise<number> {
    for (let i = 0; i < items.length; i += 400) {
      const batch = writeBatch(db)
      for (const item of items.slice(i, i + 400)) {
        batch.set(doc(db, 'occupancies', item.id), stripUndef(item))
      }
      await batch.commit()
    }
    return items.length
  }
  /** Mismo criterio que los gastos: id estable, reimportar actualiza. */
  async function importIncomes(items: IngresoMensual[]): Promise<number> {
    for (let i = 0; i < items.length; i += 400) {
      const batch = writeBatch(db)
      for (const item of items.slice(i, i + 400)) {
        batch.set(doc(db, 'incomes', item.id), stripUndef(item))
      }
      await batch.commit()
    }
    return items.length
  }
  /**
   * Reparaciones declaradas en el Excel. No se dan de alta como gasto: solo se
   * guardan para poder compararlas con las de la pantalla de Reparaciones.
   */
  async function importRepairTotals(items: ReparacionMensual[]): Promise<number> {
    for (let i = 0; i < items.length; i += 400) {
      const batch = writeBatch(db)
      for (const item of items.slice(i, i + 400)) {
        batch.set(doc(db, 'repairTotals', item.id), stripUndef(item))
      }
      await batch.commit()
    }
    return items.length
  }
  /**
   * Borra lo que vino de un Excel anterior de ese mismo ejercicio y ya no está
   * en el fichero nuevo.
   *
   * Sin esto, reimportar solo añade y actualiza: una línea que el propietario
   * quite del Excel seguiría viva en la app para siempre, y la app dejaría de
   * decir lo mismo que el fichero que manda.
   *
   * Solo toca documentos cuyo id empieza por `xls-<año>`, que es el que pone el
   * importador. Lo dado de alta a mano lleva un id aleatorio y no se toca nunca.
   */
  async function purgeImported(year: number, conservar: {
    expenses: string[]; incomes: string[]; occupancies: string[]; repairTotals: string[]
  }): Promise<number> {
    const prefijo = `xls-${year}`
    const objetivos: [string, { id: string }[], string[]][] = [
      ['expenses',     expenses,     conservar.expenses],
      ['incomes',      incomes,      conservar.incomes],
      ['occupancies',  occupancies,  conservar.occupancies],
      ['repairTotals', repairTotals, conservar.repairTotals],
    ]
    let borrados = 0
    for (const [nombre, actuales, mantener] of objetivos) {
      const vivos = new Set(mantener)
      const sobran = actuales.filter(d => d.id.startsWith(prefijo) && !vivos.has(d.id))
      for (let i = 0; i < sobran.length; i += 400) {
        const batch = writeBatch(db)
        for (const d of sobran.slice(i, i + 400)) batch.delete(doc(db, nombre, d.id))
        await batch.commit()
      }
      borrados += sobran.length
    }
    return borrados
  }
  /**
   * Deja constancia de cada volcado de Excel. No participa en ningún cálculo:
   * es el histórico que permite saber, meses después, qué fichero trajo cada
   * cifra, cuándo entró y quién lo subió.
   */
  function anotaVolcado(datos: Omit<ImportLog, 'id' | 'at' | 'by'>) {
    const id = nanoid()
    const item: ImportLog = {
      ...datos,
      id,
      at: new Date().toISOString(),
      by: usuarioActual() ?? '—',
    }
    setDoc(doc(db, 'importLogs', id), stripUndef(item))
  }
  /**
   * Cambia el juego de reservas de unos años concretos: borra las de esos años
   * con sus cobros y mete las nuevas, cada una con su cobro pendiente.
   *
   * Va por años y no de golpe porque los calendarios se suben de uno en uno:
   * subir el de 2026 no puede llevarse por delante lo de 2022 a 2025.
   *
   * Es la operación más destructiva de la app, así que va toda en lotes y en
   * un orden claro: primero se borra, luego se escribe. Quien la llama tiene
   * que haber avisado antes; aquí ya no se pregunta.
   */
  async function reemplazaReservas(
    nuevas: Omit<Reservation, 'id' | 'createdAt'>[], anios: string[],
  ): Promise<{ borradas: number; creadas: number }> {
    const afectados = new Set(anios)
    const viejas = reservations.filter(r => afectados.has(r.checkIn.slice(0, 4))).map(r => r.id)
    const cobrosViejos = payments.filter(p => viejas.includes(p.reservationId)).map(p => p.id)

    const enLotes = async (trabajo: ((b: ReturnType<typeof writeBatch>) => void)[]) => {
      for (let i = 0; i < trabajo.length; i += 400) {
        const batch = writeBatch(db)
        for (const t of trabajo.slice(i, i + 400)) t(batch)
        await batch.commit()
      }
    }

    await enLotes([
      ...cobrosViejos.map(id => (b: ReturnType<typeof writeBatch>) => b.delete(doc(db, 'payments', id))),
      ...viejas.map(id => (b: ReturnType<typeof writeBatch>) => b.delete(doc(db, 'reservations', id))),
    ])

    const ahora = new Date().toISOString()
    await enLotes(nuevas.flatMap(datos => {
      const id = nanoid()
      const reserva: Reservation = { ...datos, id, createdAt: ahora }
      const pago: Payment = {
        id: nanoid(), reservationId: id, amount: datos.total, received: false, createdAt: ahora,
      }
      return [
        (b: ReturnType<typeof writeBatch>) => b.set(doc(db, 'reservations', id), stripUndef(reserva)),
        (b: ReturnType<typeof writeBatch>) => b.set(doc(db, 'payments', pago.id), stripUndef(pago)),
      ]
    }))

    return { borradas: viejas.length, creadas: nuevas.length }
  }
  async function importExpenses(items: Expense[]): Promise<number> {
    for (let i = 0; i < items.length; i += 400) {
      const batch = writeBatch(db)
      for (const item of items.slice(i, i + 400)) {
        batch.set(doc(db, 'expenses', item.id), stripUndef(item))
      }
      await batch.commit()
    }
    return items.length
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
      loading, apartments, prices, reservations, payments, repairs, expenses, offerPrices, incomes, occupancies, repairTotals, importLogs,
      deletedRepairs,
      addApartment, updateApartment, deleteApartment,
      addPrice, updatePrice, deletePrice,
      addReservation, updateReservation, deleteReservation,
      addPayment, updatePayment, deletePayment,
      addRepair, updateRepair, deleteRepair, deleteRepairWithAudit,
      addExpense, updateExpense, deleteExpense, importExpenses, importIncomes, importOccupancies, importRepairTotals, purgeImported, anotaVolcado, reemplazaReservas,
      addOfferPrice, updateOfferPrice, deleteOfferPrice,
    }}>
      {children}
    </DataContext.Provider>
  )
}
