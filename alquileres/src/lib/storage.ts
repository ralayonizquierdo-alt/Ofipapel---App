import type {
  Apartment, PriceEntry, Reservation, Payment, Repair, Expense, OfferPrice,
  ApartmentType, Season, StayType, Channel, ReservationStatus, PaymentMethod, ExpenseType,
} from '../types'
import { DEFAULT_PRICES_2026 } from './priceCalc'
import { nanoid } from './nanoid'
import { buildSeedReservations, buildSeedRepairs, buildSeed2026 } from './seedData'
import { supabase } from './supabase'

// Antes esta app guardaba todo en localStorage del navegador (ver
// supabase-schema.sql para el porqué del cambio). Las claves de abajo son
// las que usaba esa versión antigua: se leen una sola vez para migrar los
// datos ya existentes a Supabase la primera vez que corre esta versión, y
// no se vuelven a escribir.
const LEGACY_KEYS = {
  apartments: 'aq_apartments',
  prices: 'aq_prices',
  reservations: 'aq_reservations',
  payments: 'aq_payments',
  repairs: 'aq_repairs',
  expenses: 'aq_expenses',
  offerPrices: 'aq_offer_prices',
}

// Forma de las filas tal como las devuelve Supabase (snake_case), antes de
// mapearlas a los tipos de la app (camelCase, en '../types').
interface ApartmentRow { id: string; name: string; bedrooms: number; type: ApartmentType; active: boolean; notes: string | null }
interface PriceRow {
  id: string; year: number; season: Season; apartment_type: ApartmentType
  price_1week: number; price_2weeks: number; price_3weeks: number; price_1month: number; cleaning_fee: number
}
interface ReservationRow {
  id: string; apartment_id: string; guest_name: string | null; check_in: string; check_out: string
  nights: number; stay_type: StayType; channel: Channel; base_price: number; cleaning_fee: number
  discount_pct: number; total: number; status: ReservationStatus; notes: string | null; created_at: string
}
interface PaymentRow {
  id: string; reservation_id: string; amount: number; payment_date: string | null
  entry_number: string | null; received: boolean; payment_method: PaymentMethod | null; created_at: string
}
interface RepairRow {
  id: string; apartment_id: string; repair_date: string | null; item: string; supplier: string | null
  document: string | null; amount: number | null; entry_number: string | null; created_at: string
}
interface ExpenseRow {
  id: string; apartment_id: string; expense_date: string | null; expense_type: ExpenseType; description: string
  supplier: string | null; amount: number; entry_number: string | null; created_at: string
}
interface OfferPriceRow {
  id: string; year: number; month: number; apartment_type: ApartmentType
  price_1week: number; price_2weeks: number; price_3weeks: number; price_1month: number
  cleaning_fee: number; label: string
}

function loadLegacy<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
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

function apartmentFromRow(r: ApartmentRow): Apartment {
  return { id: r.id, name: r.name, bedrooms: r.bedrooms, type: r.type, active: r.active, notes: r.notes ?? undefined }
}

export const apartmentStorage = {
  getAll: async (): Promise<Apartment[]> => {
    const { data, error } = await supabase.from('apartments').select('*').order('id')
    if (error || !data) return []
    return data.map(apartmentFromRow)
  },
  add: async (apt: Omit<Apartment, 'id'> & { id?: string }): Promise<Apartment> => {
    const row = { id: apt.id || nanoid(), name: apt.name, bedrooms: apt.bedrooms, type: apt.type, active: apt.active, notes: apt.notes ?? null }
    const { data, error } = await supabase.from('apartments').insert(row).select().single()
    if (error || !data) throw error || new Error('No se pudo crear el apartamento')
    return apartmentFromRow(data)
  },
  update: async (id: string, data: Partial<Apartment>): Promise<void> => {
    const row: Record<string, unknown> = {}
    if (data.name !== undefined) row.name = data.name
    if (data.bedrooms !== undefined) row.bedrooms = data.bedrooms
    if (data.type !== undefined) row.type = data.type
    if (data.active !== undefined) row.active = data.active
    if (data.notes !== undefined) row.notes = data.notes
    await supabase.from('apartments').update(row).eq('id', id)
  },
  delete: async (id: string): Promise<void> => {
    await supabase.from('apartments').delete().eq('id', id)
  },
}

// ─── Prices ───────────────────────────────────────────────────────────────────

const SEED_PRICES: PriceEntry[] = DEFAULT_PRICES_2026.map((p, i) => ({ ...p, id: `price_${i}` }))

function priceFromRow(r: PriceRow): PriceEntry {
  return {
    id: r.id, year: r.year, season: r.season, apartmentType: r.apartment_type,
    price1week: Number(r.price_1week), price2weeks: Number(r.price_2weeks),
    price3weeks: Number(r.price_3weeks), price1month: Number(r.price_1month),
    cleaningFee: Number(r.cleaning_fee),
  }
}

function priceToRow(p: Omit<PriceEntry, 'id'>) {
  return {
    year: p.year, season: p.season, apartment_type: p.apartmentType,
    price_1week: p.price1week, price_2weeks: p.price2weeks,
    price_3weeks: p.price3weeks, price_1month: p.price1month,
    cleaning_fee: p.cleaningFee,
  }
}

export const priceStorage = {
  getAll: async (): Promise<PriceEntry[]> => {
    const { data, error } = await supabase.from('prices').select('*').order('year')
    if (error || !data) return []
    return data.map(priceFromRow)
  },
  add: async (entry: Omit<PriceEntry, 'id'>): Promise<PriceEntry> => {
    const { data, error } = await supabase.from('prices').insert(priceToRow(entry)).select().single()
    if (error || !data) throw error || new Error('No se pudo crear el precio')
    return priceFromRow(data)
  },
  update: async (id: string, data: Partial<PriceEntry>): Promise<void> => {
    const row: Record<string, unknown> = {}
    if (data.year !== undefined) row.year = data.year
    if (data.season !== undefined) row.season = data.season
    if (data.apartmentType !== undefined) row.apartment_type = data.apartmentType
    if (data.price1week !== undefined) row.price_1week = data.price1week
    if (data.price2weeks !== undefined) row.price_2weeks = data.price2weeks
    if (data.price3weeks !== undefined) row.price_3weeks = data.price3weeks
    if (data.price1month !== undefined) row.price_1month = data.price1month
    if (data.cleaningFee !== undefined) row.cleaning_fee = data.cleaningFee
    await supabase.from('prices').update(row).eq('id', id)
  },
  delete: async (id: string): Promise<void> => {
    await supabase.from('prices').delete().eq('id', id)
  },
}

// ─── Reservations ─────────────────────────────────────────────────────────────

function reservationFromRow(r: ReservationRow): Reservation {
  return {
    id: r.id, apartmentId: r.apartment_id, guestName: r.guest_name ?? undefined,
    checkIn: r.check_in, checkOut: r.check_out, nights: r.nights, stayType: r.stay_type,
    channel: r.channel, basePrice: Number(r.base_price), cleaningFee: Number(r.cleaning_fee),
    discountPct: Number(r.discount_pct), total: Number(r.total), status: r.status,
    notes: r.notes ?? undefined, createdAt: r.created_at,
  }
}

function reservationToRow(r: Omit<Reservation, 'id' | 'createdAt'>) {
  return {
    apartment_id: r.apartmentId, guest_name: r.guestName ?? null, check_in: r.checkIn,
    check_out: r.checkOut, nights: r.nights, stay_type: r.stayType, channel: r.channel,
    base_price: r.basePrice, cleaning_fee: r.cleaningFee, discount_pct: r.discountPct,
    total: r.total, status: r.status, notes: r.notes ?? null,
  }
}

export const reservationStorage = {
  getAll: async (): Promise<Reservation[]> => {
    const { data, error } = await supabase.from('reservations').select('*').order('check_in')
    if (error || !data) return []
    return data.map(reservationFromRow)
  },
  add: async (r: Omit<Reservation, 'id' | 'createdAt'>): Promise<Reservation> => {
    const { data, error } = await supabase.from('reservations').insert(reservationToRow(r)).select().single()
    if (error || !data) throw error || new Error('No se pudo crear la reserva')
    return reservationFromRow(data)
  },
  update: async (id: string, data: Partial<Reservation>): Promise<void> => {
    const row: Record<string, unknown> = {}
    if (data.apartmentId !== undefined) row.apartment_id = data.apartmentId
    if (data.guestName !== undefined) row.guest_name = data.guestName
    if (data.checkIn !== undefined) row.check_in = data.checkIn
    if (data.checkOut !== undefined) row.check_out = data.checkOut
    if (data.nights !== undefined) row.nights = data.nights
    if (data.stayType !== undefined) row.stay_type = data.stayType
    if (data.channel !== undefined) row.channel = data.channel
    if (data.basePrice !== undefined) row.base_price = data.basePrice
    if (data.cleaningFee !== undefined) row.cleaning_fee = data.cleaningFee
    if (data.discountPct !== undefined) row.discount_pct = data.discountPct
    if (data.total !== undefined) row.total = data.total
    if (data.status !== undefined) row.status = data.status
    if (data.notes !== undefined) row.notes = data.notes
    await supabase.from('reservations').update(row).eq('id', id)
  },
  // Los pagos de la reserva se borran solos: la tabla payments tiene
  // "on delete cascade" sobre reservation_id (ver supabase-schema.sql).
  delete: async (id: string): Promise<void> => {
    await supabase.from('reservations').delete().eq('id', id)
  },
}

// ─── Payments ─────────────────────────────────────────────────────────────────

function paymentFromRow(r: PaymentRow): Payment {
  return {
    id: r.id, reservationId: r.reservation_id, amount: Number(r.amount),
    paymentDate: r.payment_date ?? undefined, entryNumber: r.entry_number ?? undefined,
    received: r.received, paymentMethod: r.payment_method ?? undefined, createdAt: r.created_at,
  }
}

function paymentToRow(p: Omit<Payment, 'id' | 'createdAt'>) {
  return {
    reservation_id: p.reservationId, amount: p.amount, payment_date: p.paymentDate ?? null,
    entry_number: p.entryNumber ?? null, received: p.received, payment_method: p.paymentMethod ?? null,
  }
}

export const paymentStorage = {
  getAll: async (): Promise<Payment[]> => {
    const { data, error } = await supabase.from('payments').select('*').order('created_at')
    if (error || !data) return []
    return data.map(paymentFromRow)
  },
  getByReservation: async (reservationId: string): Promise<Payment[]> => {
    const { data, error } = await supabase.from('payments').select('*').eq('reservation_id', reservationId)
    if (error || !data) return []
    return data.map(paymentFromRow)
  },
  add: async (p: Omit<Payment, 'id' | 'createdAt'>): Promise<Payment> => {
    const { data, error } = await supabase.from('payments').insert(paymentToRow(p)).select().single()
    if (error || !data) throw error || new Error('No se pudo crear el pago')
    return paymentFromRow(data)
  },
  update: async (id: string, data: Partial<Payment>): Promise<void> => {
    const row: Record<string, unknown> = {}
    if (data.amount !== undefined) row.amount = data.amount
    if (data.paymentDate !== undefined) row.payment_date = data.paymentDate
    if (data.entryNumber !== undefined) row.entry_number = data.entryNumber
    if (data.received !== undefined) row.received = data.received
    if (data.paymentMethod !== undefined) row.payment_method = data.paymentMethod
    await supabase.from('payments').update(row).eq('id', id)
  },
  delete: async (id: string): Promise<void> => {
    await supabase.from('payments').delete().eq('id', id)
  },
}

// ─── Repairs ──────────────────────────────────────────────────────────────────

function repairFromRow(r: RepairRow): Repair {
  return {
    id: r.id, apartmentId: r.apartment_id, repairDate: r.repair_date ?? undefined, item: r.item,
    supplier: r.supplier ?? undefined, document: r.document ?? undefined,
    amount: r.amount !== null ? Number(r.amount) : undefined,
    entryNumber: r.entry_number ?? undefined, createdAt: r.created_at,
  }
}

function repairToRow(r: Omit<Repair, 'id' | 'createdAt'>) {
  return {
    apartment_id: r.apartmentId, repair_date: r.repairDate ?? null, item: r.item,
    supplier: r.supplier ?? null, document: r.document ?? null, amount: r.amount ?? null,
    entry_number: r.entryNumber ?? null,
  }
}

export const repairStorage = {
  getAll: async (): Promise<Repair[]> => {
    const { data, error } = await supabase.from('repairs').select('*').order('created_at')
    if (error || !data) return []
    return data.map(repairFromRow)
  },
  add: async (r: Omit<Repair, 'id' | 'createdAt'>): Promise<Repair> => {
    const { data, error } = await supabase.from('repairs').insert(repairToRow(r)).select().single()
    if (error || !data) throw error || new Error('No se pudo crear la reparación')
    return repairFromRow(data)
  },
  update: async (id: string, data: Partial<Repair>): Promise<void> => {
    const row: Record<string, unknown> = {}
    if (data.repairDate !== undefined) row.repair_date = data.repairDate
    if (data.item !== undefined) row.item = data.item
    if (data.supplier !== undefined) row.supplier = data.supplier
    if (data.document !== undefined) row.document = data.document
    if (data.amount !== undefined) row.amount = data.amount
    if (data.entryNumber !== undefined) row.entry_number = data.entryNumber
    await supabase.from('repairs').update(row).eq('id', id)
  },
  delete: async (id: string): Promise<void> => {
    await supabase.from('repairs').delete().eq('id', id)
  },
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

function expenseFromRow(r: ExpenseRow): Expense {
  return {
    id: r.id, apartmentId: r.apartment_id, expenseDate: r.expense_date ?? undefined,
    expenseType: r.expense_type, description: r.description, supplier: r.supplier ?? undefined,
    amount: Number(r.amount), entryNumber: r.entry_number ?? undefined, createdAt: r.created_at,
  }
}

function expenseToRow(e: Omit<Expense, 'id' | 'createdAt'>) {
  return {
    apartment_id: e.apartmentId, expense_date: e.expenseDate ?? null, expense_type: e.expenseType,
    description: e.description, supplier: e.supplier ?? null, amount: e.amount,
    entry_number: e.entryNumber ?? null,
  }
}

export const expenseStorage = {
  getAll: async (): Promise<Expense[]> => {
    const { data, error } = await supabase.from('expenses').select('*').order('created_at')
    if (error || !data) return []
    return data.map(expenseFromRow)
  },
  add: async (e: Omit<Expense, 'id' | 'createdAt'>): Promise<Expense> => {
    const { data, error } = await supabase.from('expenses').insert(expenseToRow(e)).select().single()
    if (error || !data) throw error || new Error('No se pudo crear el gasto')
    return expenseFromRow(data)
  },
  update: async (id: string, data: Partial<Expense>): Promise<void> => {
    const row: Record<string, unknown> = {}
    if (data.expenseDate !== undefined) row.expense_date = data.expenseDate
    if (data.expenseType !== undefined) row.expense_type = data.expenseType
    if (data.description !== undefined) row.description = data.description
    if (data.supplier !== undefined) row.supplier = data.supplier
    if (data.amount !== undefined) row.amount = data.amount
    if (data.entryNumber !== undefined) row.entry_number = data.entryNumber
    await supabase.from('expenses').update(row).eq('id', id)
  },
  delete: async (id: string): Promise<void> => {
    await supabase.from('expenses').delete().eq('id', id)
  },
}

// ─── Offer prices ───────────────────────────────────────────────────────────────

function offerPriceFromRow(r: OfferPriceRow): OfferPrice {
  return {
    id: r.id, year: r.year, month: r.month, apartmentType: r.apartment_type,
    price1week: Number(r.price_1week), price2weeks: Number(r.price_2weeks),
    price3weeks: Number(r.price_3weeks), price1month: Number(r.price_1month),
    cleaningFee: Number(r.cleaning_fee), label: r.label,
  }
}

function offerPriceToRow(p: Omit<OfferPrice, 'id'>) {
  return {
    year: p.year, month: p.month, apartment_type: p.apartmentType,
    price_1week: p.price1week, price_2weeks: p.price2weeks, price_3weeks: p.price3weeks,
    price_1month: p.price1month, cleaning_fee: p.cleaningFee, label: p.label,
  }
}

export const offerPriceStorage = {
  getAll: async (): Promise<OfferPrice[]> => {
    const { data, error } = await supabase.from('offer_prices').select('*').order('year')
    if (error || !data) return []
    return data.map(offerPriceFromRow)
  },
  add: async (entry: Omit<OfferPrice, 'id'>): Promise<OfferPrice> => {
    const { data, error } = await supabase.from('offer_prices').insert(offerPriceToRow(entry)).select().single()
    if (error || !data) throw error || new Error('No se pudo crear la oferta')
    return offerPriceFromRow(data)
  },
  update: async (id: string, data: Partial<OfferPrice>): Promise<void> => {
    const row: Record<string, unknown> = {}
    if (data.year !== undefined) row.year = data.year
    if (data.month !== undefined) row.month = data.month
    if (data.apartmentType !== undefined) row.apartment_type = data.apartmentType
    if (data.price1week !== undefined) row.price_1week = data.price1week
    if (data.price2weeks !== undefined) row.price_2weeks = data.price2weeks
    if (data.price3weeks !== undefined) row.price_3weeks = data.price3weeks
    if (data.price1month !== undefined) row.price_1month = data.price1month
    if (data.cleaningFee !== undefined) row.cleaning_fee = data.cleaningFee
    if (data.label !== undefined) row.label = data.label
    await supabase.from('offer_prices').update(row).eq('id', id)
  },
  delete: async (id: string): Promise<void> => {
    await supabase.from('offer_prices').delete().eq('id', id)
  },
}

// ─── Arranque: migración desde localStorage + datos históricos de ejemplo ──────

async function isFlagSet(key: string): Promise<boolean> {
  const { data } = await supabase.from('seed_flags').select('key').eq('key', key).maybeSingle()
  return !!data
}

async function setFlag(key: string): Promise<void> {
  await supabase.from('seed_flags').insert({ key }).select()
}

// Si este navegador tiene datos de la versión antigua (solo localStorage) y
// Supabase todavía no tiene nada, sube esos datos una sola vez. Si ya hay
// datos en Supabase (los subió otro dispositivo primero), no se tocan.
async function migrateLegacyLocalData(): Promise<void> {
  if (await isFlagSet('legacy_migrated')) return

  const legacyApartments = loadLegacy<Apartment>(LEGACY_KEYS.apartments)
  const legacyReservations = loadLegacy<Reservation>(LEGACY_KEYS.reservations)
  if (!legacyReservations.length && !legacyApartments.length) {
    await setFlag('legacy_migrated')
    return
  }

  const { count } = await supabase.from('reservations').select('id', { count: 'exact', head: true })
  if ((count ?? 0) > 0) {
    // Ya hay datos reales en Supabase (subidos desde otro dispositivo antes) — no pisarlos.
    await setFlag('legacy_migrated')
    return
  }

  if (legacyApartments.length) {
    await supabase.from('apartments').upsert(legacyApartments.map(a => ({
      id: a.id, name: a.name, bedrooms: a.bedrooms, type: a.type, active: a.active, notes: a.notes ?? null,
    })))
  }
  const legacyPrices = loadLegacy<PriceEntry>(LEGACY_KEYS.prices)
  if (legacyPrices.length) await supabase.from('prices').insert(legacyPrices.map(priceToRow))

  if (legacyReservations.length) {
    // Los pagos referencian el id de la reserva: hay que insertar las
    // reservas una a una para saber qué id nuevo les asignó Supabase y
    // poder remapear los pagos correctamente.
    const legacyPayments = loadLegacy<Payment>(LEGACY_KEYS.payments)
    for (const r of legacyReservations) {
      const { data: newRes } = await supabase.from('reservations').insert(reservationToRow(r)).select().single()
      if (!newRes) continue
      const ownPayments = legacyPayments.filter(p => p.reservationId === r.id)
      if (ownPayments.length) {
        await supabase.from('payments').insert(ownPayments.map(p => ({ ...paymentToRow(p), reservation_id: newRes.id })))
      }
    }
  }

  const legacyRepairs = loadLegacy<Repair>(LEGACY_KEYS.repairs)
  if (legacyRepairs.length) await supabase.from('repairs').insert(legacyRepairs.map(repairToRow))

  const legacyExpenses = loadLegacy<Expense>(LEGACY_KEYS.expenses)
  if (legacyExpenses.length) await supabase.from('expenses').insert(legacyExpenses.map(expenseToRow))

  const legacyOfferPrices = loadLegacy<OfferPrice>(LEGACY_KEYS.offerPrices)
  if (legacyOfferPrices.length) await supabase.from('offer_prices').insert(legacyOfferPrices.map(offerPriceToRow))

  await setFlag('legacy_migrated')
}

async function seedIfEmpty(): Promise<void> {
  if (!(await isFlagSet('seed_v1'))) {
    const { count } = await supabase.from('reservations').select('id', { count: 'exact', head: true })
    if ((count ?? 0) === 0) {
      const { reservations, payments } = buildSeedReservations()
      for (const r of reservations) {
        const { data: newRes } = await supabase.from('reservations').insert(reservationToRow(r)).select().single()
        if (!newRes) continue
        const ownPayments = payments.filter(p => p.reservationId === r.id)
        if (ownPayments.length) {
          await supabase.from('payments').insert(ownPayments.map(p => ({ ...paymentToRow(p), reservation_id: newRes.id })))
        }
      }
      await supabase.from('repairs').insert(buildSeedRepairs().map(repairToRow))
    }
    await setFlag('seed_v1')
  }

  if (!(await isFlagSet('seed_v2'))) {
    const { reservations, payments } = buildSeed2026()
    for (const r of reservations) {
      const { data: newRes } = await supabase.from('reservations').insert(reservationToRow(r)).select().single()
      if (!newRes) continue
      const ownPayments = payments.filter(p => p.reservationId === r.id)
      if (ownPayments.length) {
        await supabase.from('payments').insert(ownPayments.map(p => ({ ...paymentToRow(p), reservation_id: newRes.id })))
      }
    }
    await setFlag('seed_v2')
  }
}

async function seedApartmentsAndPricesIfEmpty(): Promise<void> {
  const { count: aptCount } = await supabase.from('apartments').select('id', { count: 'exact', head: true })
  if ((aptCount ?? 0) === 0) {
    await supabase.from('apartments').insert(DEFAULT_APARTMENTS)
  }
  const { count: priceCount } = await supabase.from('prices').select('id', { count: 'exact', head: true })
  if ((priceCount ?? 0) === 0) {
    await supabase.from('prices').insert(SEED_PRICES.map(priceToRow))
  }
}

// Se llama una vez al arrancar la app (ver main.tsx). Ya no es síncrona:
// hasta que resuelve, la app puede mostrar listas vacías un instante.
export async function initStorage(): Promise<void> {
  await migrateLegacyLocalData()
  await seedApartmentsAndPricesIfEmpty()
  await seedIfEmpty()
}
