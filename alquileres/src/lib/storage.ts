import type { Apartment, PriceEntry, Reservation, Payment, Repair, Expense, OfferPrice } from '../types'
import { DEFAULT_PRICES_2026 } from './priceCalc'
import { nanoid } from './nanoid'

const KEYS = {
  apartments: 'aq_apartments',
  prices: 'aq_prices',
  reservations: 'aq_reservations',
  payments: 'aq_payments',
  repairs: 'aq_repairs',
  expenses: 'aq_expenses',
  offerPrices: 'aq_offer_prices',
}

function load<T>(key: string, defaults: T[]): T[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return defaults
    return JSON.parse(raw) as T[]
  } catch {
    return defaults
  }
}

function save<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data))
}

// ─── Apartments ───────────────────────────────────────────────────────────────

const DEFAULT_APARTMENTS: Apartment[] = [
  { id: '104', name: 'Apartamento 104', bedrooms: 1, type: '1BR', active: true },
  { id: '105', name: 'Apartamento 105', bedrooms: 1, type: '1BR', active: true },
  { id: '106', name: 'Apartamento 106', bedrooms: 2, type: '2BR', active: true },
  { id: '203', name: 'Apartamento 203', bedrooms: 2, type: '2BR', active: true },
  { id: '204', name: 'Apartamento 204', bedrooms: 2, type: '2BR', active: true },
  { id: '402', name: 'Ático 402', bedrooms: 2, type: '2BR_ATICO', active: true },
  { id: 'P3', name: 'Piso 3', bedrooms: 3, type: '3BR', active: true },
  { id: 'AP2B', name: 'Arenal 2B', bedrooms: 1, type: '1BR', active: true },
  { id: 'JXXIII', name: 'Juan XXIII', bedrooms: 2, type: '2BR', active: true },
]

export const apartmentStorage = {
  getAll: (): Apartment[] => load<Apartment>(KEYS.apartments, DEFAULT_APARTMENTS),
  save: (apartments: Apartment[]) => save(KEYS.apartments, apartments),
  add: (apt: Omit<Apartment, 'id'> & { id?: string }): Apartment => {
    const all = apartmentStorage.getAll()
    const item = { ...apt, id: apt.id || nanoid() }
    save(KEYS.apartments, [...all, item])
    return item
  },
  update: (id: string, data: Partial<Apartment>): void => {
    const all = apartmentStorage.getAll().map(a => a.id === id ? { ...a, ...data } : a)
    save(KEYS.apartments, all)
  },
  delete: (id: string): void => {
    save(KEYS.apartments, apartmentStorage.getAll().filter(a => a.id !== id))
  },
}

// ─── Prices ───────────────────────────────────────────────────────────────────

const SEED_PRICES: PriceEntry[] = DEFAULT_PRICES_2026.map((p, i) => ({ ...p, id: `price_${i}` }))

export const priceStorage = {
  getAll: (): PriceEntry[] => load<PriceEntry>(KEYS.prices, SEED_PRICES),
  save: (prices: PriceEntry[]) => save(KEYS.prices, prices),
  add: (entry: Omit<PriceEntry, 'id'>): PriceEntry => {
    const all = priceStorage.getAll()
    const item = { ...entry, id: nanoid() }
    save(KEYS.prices, [...all, item])
    return item
  },
  update: (id: string, data: Partial<PriceEntry>): void => {
    const all = priceStorage.getAll().map(p => p.id === id ? { ...p, ...data } : p)
    save(KEYS.prices, all)
  },
  delete: (id: string): void => {
    save(KEYS.prices, priceStorage.getAll().filter(p => p.id !== id))
  },
}

// ─── Reservations ─────────────────────────────────────────────────────────────

export const reservationStorage = {
  getAll: (): Reservation[] => load<Reservation>(KEYS.reservations, []),
  save: (reservations: Reservation[]) => save(KEYS.reservations, reservations),
  add: (r: Omit<Reservation, 'id' | 'createdAt'>): Reservation => {
    const all = reservationStorage.getAll()
    const item: Reservation = { ...r, id: nanoid(), createdAt: new Date().toISOString() }
    save(KEYS.reservations, [...all, item])
    return item
  },
  update: (id: string, data: Partial<Reservation>): void => {
    const all = reservationStorage.getAll().map(r => r.id === id ? { ...r, ...data } : r)
    save(KEYS.reservations, all)
  },
  delete: (id: string): void => {
    save(KEYS.reservations, reservationStorage.getAll().filter(r => r.id !== id))
    paymentStorage.deleteByReservation(id)
  },
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export const paymentStorage = {
  getAll: (): Payment[] => load<Payment>(KEYS.payments, []),
  save: (payments: Payment[]) => save(KEYS.payments, payments),
  getByReservation: (reservationId: string): Payment[] =>
    paymentStorage.getAll().filter(p => p.reservationId === reservationId),
  add: (p: Omit<Payment, 'id' | 'createdAt'>): Payment => {
    const all = paymentStorage.getAll()
    const item: Payment = { ...p, id: nanoid(), createdAt: new Date().toISOString() }
    save(KEYS.payments, [...all, item])
    return item
  },
  update: (id: string, data: Partial<Payment>): void => {
    const all = paymentStorage.getAll().map(p => p.id === id ? { ...p, ...data } : p)
    save(KEYS.payments, all)
  },
  delete: (id: string): void => {
    save(KEYS.payments, paymentStorage.getAll().filter(p => p.id !== id))
  },
  deleteByReservation: (reservationId: string): void => {
    save(KEYS.payments, paymentStorage.getAll().filter(p => p.reservationId !== reservationId))
  },
}

// ─── Repairs ──────────────────────────────────────────────────────────────────

export const repairStorage = {
  getAll: (): Repair[] => load<Repair>(KEYS.repairs, []),
  save: (repairs: Repair[]) => save(KEYS.repairs, repairs),
  add: (r: Omit<Repair, 'id' | 'createdAt'>): Repair => {
    const all = repairStorage.getAll()
    const item: Repair = { ...r, id: nanoid(), createdAt: new Date().toISOString() }
    save(KEYS.repairs, [...all, item])
    return item
  },
  update: (id: string, data: Partial<Repair>): void => {
    const all = repairStorage.getAll().map(r => r.id === id ? { ...r, ...data } : r)
    save(KEYS.repairs, all)
  },
  delete: (id: string): void => {
    save(KEYS.repairs, repairStorage.getAll().filter(r => r.id !== id))
  },
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export const expenseStorage = {
  getAll: (): Expense[] => load<Expense>(KEYS.expenses, []),
  save: (expenses: Expense[]) => save(KEYS.expenses, expenses),
  add: (e: Omit<Expense, 'id' | 'createdAt'>): Expense => {
    const all = expenseStorage.getAll()
    const item: Expense = { ...e, id: nanoid(), createdAt: new Date().toISOString() }
    save(KEYS.expenses, [...all, item])
    return item
  },
  update: (id: string, data: Partial<Expense>): void => {
    const all = expenseStorage.getAll().map(e => e.id === id ? { ...e, ...data } : e)
    save(KEYS.expenses, all)
  },
  delete: (id: string): void => {
    save(KEYS.expenses, expenseStorage.getAll().filter(e => e.id !== id))
  },
}

export const offerPriceStorage = {
  getAll: (): OfferPrice[] => load<OfferPrice>(KEYS.offerPrices, []),
  add: (entry: Omit<OfferPrice, 'id'>): OfferPrice => {
    const all = offerPriceStorage.getAll()
    const item = { ...entry, id: nanoid() }
    save(KEYS.offerPrices, [...all, item])
    return item
  },
  update: (id: string, data: Partial<OfferPrice>): void => {
    const all = offerPriceStorage.getAll().map(p => p.id === id ? { ...p, ...data } : p)
    save(KEYS.offerPrices, all)
  },
  delete: (id: string): void => {
    save(KEYS.offerPrices, offerPriceStorage.getAll().filter(p => p.id !== id))
  },
}

// ─── Seed historical data ─────────────────────────────────────────────────────

export function isSeeded(): boolean {
  return localStorage.getItem('aq_seeded') === '1'
}

export function markSeeded(): void {
  localStorage.setItem('aq_seeded', '1')
}

export function isSeededV2(): boolean {
  return localStorage.getItem('aq_seeded_v2') === '1'
}

export function markSeededV2(): void {
  localStorage.setItem('aq_seeded_v2', '1')
}
