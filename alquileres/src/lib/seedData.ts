import type { Reservation, Payment, Repair } from '../types'
import { nanoid } from './nanoid'
import { getNights } from './dateUtils'

function mkRes(
  apartmentId: string,
  checkIn: string,
  checkOut: string,
  basePrice: number,
  stayType: Reservation['stayType'],
  channel: Reservation['channel'] = 'inmobiliaria',
  notes?: string
): Reservation {
  const nights = getNights(checkIn, checkOut)
  const cleaningFee = 40
  return {
    id: nanoid(),
    apartmentId,
    checkIn,
    checkOut,
    nights,
    stayType,
    channel,
    basePrice,
    cleaningFee,
    discountPct: 0,
    total: basePrice + cleaningFee,
    status: 'completada',
    notes,
    createdAt: new Date(checkIn).toISOString(),
  }
}

function mkPay(reservationId: string, amount: number, paymentDate?: string, entryNumber?: string): Payment {
  return {
    id: nanoid(),
    reservationId,
    amount,
    paymentDate,
    entryNumber,
    received: !!paymentDate,
    createdAt: new Date().toISOString(),
  }
}

function mkRepair(
  apartmentId: string,
  item: string,
  supplier: string,
  document: string | undefined,
  amount: number,
  repairDate?: string,
  entryNumber?: string
): Repair {
  return {
    id: nanoid(),
    apartmentId,
    repairDate,
    item,
    supplier,
    document,
    amount,
    entryNumber,
    createdAt: new Date().toISOString(),
  }
}

export function buildSeedReservations(): { reservations: Reservation[]; payments: Payment[] } {
  const reservations: Reservation[] = []
  const payments: Payment[] = []

  function addRes(r: Reservation, pays: Omit<Payment, 'id' | 'reservationId' | 'createdAt'>[] = []) {
    reservations.push(r)
    pays.forEach(p => payments.push(mkPay(r.id, p.amount, p.paymentDate, p.entryNumber)))
  }

  // ── Apartamento 104 ──────────────────────────────────────────────────────────
  const r104_1 = mkRes('104', '2024-10-05', '2024-10-12', 590, '1semana', 'inmobiliaria', 'del 05/10 al 12/10/24=7-N')
  addRes(r104_1, [{ amount: 590, paymentDate: '2024-10-05', received: true }])

  const r104_2 = mkRes('104', '2024-11-02', '2024-11-16', 760, '2semanas', 'inmobiliaria', 'del 02/11 al 16/11/24=14-N')
  addRes(r104_2, [{ amount: 760, paymentDate: '2024-11-02', received: true }])

  const r104_3 = mkRes('104', '2024-11-17', '2024-12-01', 595, '2semanas', 'inmobiliaria', 'entra 17/11 sale 01/12/2024')
  addRes(r104_3, [{ amount: 595, paymentDate: '2024-11-17', received: true }])

  const r104_4 = mkRes('104', '2024-12-20', '2025-01-06', 800, '2semanas', 'inmobiliaria', '104: entra 20/12/2024 y sale 06/01/2025')
  addRes(r104_4, [{ amount: 800, paymentDate: '2024-12-20', received: true }])

  const r104_5 = mkRes('104', '2025-01-07', '2025-01-14', 590, '1semana', 'inmobiliaria', '104: 07/01 AL 14/01= 7-N')
  addRes(r104_5, [{ amount: 590, paymentDate: '2025-01-07', received: true }])

  const r104_6 = mkRes('104', '2025-01-16', '2025-03-11', 1628, '1mes', 'inmobiliaria', 'del 16/01/2025 al 11/03/2025. pago todo el 17/01/25')
  addRes(r104_6, [{ amount: 1628, paymentDate: '2025-01-17', received: true }])

  const r104_7 = mkRes('104', '2025-03-13', '2025-03-22', 480, '1semana', 'inmobiliaria', '13/03 al 22/03/25= 9-N')
  addRes(r104_7, [{ amount: 480, paymentDate: '2025-03-13', received: true }])

  const r104_8 = mkRes('104', '2025-03-24', '2025-04-01', 380, '1semana', 'inmobiliaria', 'del 24/03 al 01/04/2025')
  addRes(r104_8, [{ amount: 380, paymentDate: '2025-03-24', received: true }])

  const r104_9 = mkRes('104', '2025-04-06', '2025-04-30', 714, '3semanas', 'inmobiliaria', '104: entra 06/04/2025 y sale 30/04/2025. 24N=625/21=714,28+40=754')
  addRes(r104_9, [{ amount: 754, paymentDate: '2025-04-06', received: true }])

  const r104_10 = mkRes('104', '2025-05-04', '2025-05-15', 471, '1semana', 'inmobiliaria', 'del 04/05 al 15/05/25=11-N=471,40+40=511,40')
  addRes(r104_10, [{ amount: 511, paymentDate: '2025-05-04', received: true }])

  const r104_11 = mkRes('104', '2025-06-04', '2025-06-11', 300, '1semana', 'inmobiliaria', 'del 04/06 al 11/06=7-N=300+40')
  addRes(r104_11, [{ amount: 340, paymentDate: '2025-06-04', received: true }])

  const r104_12 = mkRes('104', '2025-06-30', '2025-07-07', 340, '1semana', 'inmobiliaria', 'Del 30/06/25 al 07/07/25')
  addRes(r104_12, [{ amount: 380, paymentDate: '2025-06-30', received: true }])

  const r104_13 = mkRes('104', '2025-07-21', '2025-07-28', 340, '1semana', 'inmobiliaria', 'del 21/07/25 al 28/07/25')
  addRes(r104_13, [{ amount: 380, paymentDate: '2025-07-21', received: true }])

  // ── Apartamento 105 ──────────────────────────────────────────────────────────
  const r105_1 = mkRes('105', '2024-10-10', '2024-10-24', 425, '2semanas', 'inmobiliaria', 'del 10/10 al 24/10/24=425 oferta octb')
  addRes(r105_1, [{ amount: 425, paymentDate: '2024-10-10', received: true }])

  const r105_2 = mkRes('105', '2024-10-28', '2024-11-14', 760, '2semanas', 'inmobiliaria', '28/10 AL 14/11/24')
  addRes(r105_2, [{ amount: 760, paymentDate: '2024-10-28', received: true }])

  const r105_3 = mkRes('105', '2024-11-16', '2024-11-23', 550, '1semana', 'inmobiliaria', 'entra 16/11 sale 23/11/2024')
  addRes(r105_3, [{ amount: 590, paymentDate: '2024-11-16', received: true }])

  const r105_4 = mkRes('105', '2024-11-24', '2024-12-22', 1265, '1mes', 'inmobiliaria', '24/11 al 22/12/24')
  addRes(r105_4, [{ amount: 1265, paymentDate: '2024-11-24', received: true }])

  const r105_5 = mkRes('105', '2024-12-24', '2024-12-31', 550, '1semana', 'inmobiliaria', '105: del 24/12 al 31/12/2024')
  addRes(r105_5, [{ amount: 590, paymentDate: '2024-12-24', received: true }])

  const r105_6 = mkRes('105', '2025-01-03', '2025-04-07', 3446, 'directo', 'inmobiliaria', '105: del 03/01 al 07/04/2025.=94-N 1.100/30=36,66x94=3.446+40=3.486.-€')
  addRes(r105_6, [
    { amount: 1140, paymentDate: '2025-01-03', received: true },
    { amount: 1000, paymentDate: '2025-02-01', received: true },
    { amount: 1346, paymentDate: '2025-03-01', received: true },
  ])

  const r105_7 = mkRes('105', '2025-04-10', '2025-04-17', 300, '1semana', 'inmobiliaria', 'del 10/04 al 17/04/25=7-N=300+40=340')
  addRes(r105_7, [{ amount: 340, paymentDate: '2025-04-10', received: true }])

  // ── Apartamento 106 ──────────────────────────────────────────────────────────
  const r106_1 = mkRes('106', '2024-10-31', '2024-12-12', 1500, '1mes', 'inmobiliaria', 'del 31/010 al 10/12/24=12-N (amplia al 12/12)')
  addRes(r106_1, [{ amount: 723, paymentDate: '2024-10-31', received: true }])

  const r106_2 = mkRes('106', '2024-12-20', '2024-12-29', 650, '1semana', 'inmobiliaria', '106: entra 20/12/2024 y sale 29/12/2024')
  addRes(r106_2, [{ amount: 690, paymentDate: '2024-12-20', received: true }])

  const r106_3 = mkRes('106', '2024-12-29', '2025-01-07', 650, '1semana', 'inmobiliaria', '106: del 29/12 al 07/01/2025')
  addRes(r106_3, [{ amount: 690, paymentDate: '2024-12-29', received: true }])

  const r106_4 = mkRes('106', '2025-01-09', '2025-03-15', 2470, 'directo', 'inmobiliaria', '106: ENTRA 09/01/25 AL 15/03/25= 65 noches 2.470.-€. Paga 1305+1433=2.738.-€')
  addRes(r106_4, [
    { amount: 1305, paymentDate: '2025-01-09', received: true },
    { amount: 1433, paymentDate: '2025-02-09', received: true },
  ])

  const r106_5 = mkRes('106', '2025-03-15', '2025-04-19', 1475, 'directo', 'inmobiliaria', '15/03/2025 y sale 19/04/2025 =35-N 1265/30x35=1515.-€')
  addRes(r106_5, [{ amount: 1515, paymentDate: '2025-03-15', received: true }])

  const r106_6 = mkRes('106', '2025-05-12', '2025-05-26', 800, '1semana', 'inmobiliaria', '12/05/25 al 22/05/25=10-N, ampliación 4-N al 26/05/25')
  addRes(r106_6, [{ amount: 840, paymentDate: '2025-05-12', received: true }])

  const r106_7 = mkRes('106', '2025-07-21', '2025-07-28', 380, '1semana', 'inmobiliaria', 'del 21/07/25 al 28/07/25')
  addRes(r106_7, [{ amount: 420, paymentDate: '2025-07-21', received: true }])

  // ── Apartamento 203 ──────────────────────────────────────────────────────────
  const r203_1 = mkRes('203', '2024-11-07', '2024-11-16', 650, '1semana', 'inmobiliaria', 'del 07/11 sale 16/11/24=9-N')
  addRes(r203_1, [{ amount: 690, paymentDate: '2024-11-07', received: true }])

  const r203_2 = mkRes('203', '2024-11-16', '2024-11-24', 650, '1semana', 'inmobiliaria', '16/11 al 24/11/24')
  addRes(r203_2, [{ amount: 690, paymentDate: '2024-11-16', received: true }])

  const r203_3 = mkRes('203', '2024-11-30', '2025-03-29', 5059, 'directo', 'inmobiliaria', '203: entra 30/11/24 al 29/03/25.=120-N 1.265/30=42,16x120=5.049+40=5.099.-€')
  addRes(r203_3, [
    { amount: 1048, paymentDate: '2024-11-30', received: true },
    { amount: 1500, paymentDate: '2025-01-01', received: true },
    { amount: 1423, paymentDate: '2025-07-01', received: true },
    { amount: 1188, paymentDate: '2025-03-01', received: true },
  ])

  const r203_4 = mkRes('203', '2025-04-11', '2025-04-18', 380, '1semana', 'inmobiliaria', 'del 11/04 al 18/04/25=7-N-380+40=420')
  addRes(r203_4, [{ amount: 420, paymentDate: '2025-04-11', received: true }])

  const r203_5 = mkRes('203', '2025-05-13', '2025-05-23', 540, '1semana', 'inmobiliaria', 'de 13/05/25 al 22/05/25=-9-N, ampliación 1-N al 23/05/25')
  addRes(r203_5, [{ amount: 582, paymentDate: '2025-05-13', received: true }])

  const r203_6 = mkRes('203', '2025-07-01', '2025-07-08', 380, '1semana', 'inmobiliaria', '203: entra 01/07, sale 08/07/25')
  addRes(r203_6, [{ amount: 420, paymentDate: '2025-07-01', received: true }])

  const r203_7 = mkRes('203', '2025-07-13', '2025-07-22', 380, '1semana', 'inmobiliaria', '13/07/2025 y sale 22/07/2025')
  addRes(r203_7, [{ amount: 420, paymentDate: '2025-07-13', received: true }])

  const r203_8 = mkRes('203', '2025-07-23', '2025-07-31', 380, '1semana', 'inmobiliaria', 'del 23/07/25 al 31/07/25')
  addRes(r203_8, [{ amount: 420, paymentDate: '2025-07-23', received: true }])

  // ── Apartamento 204 ──────────────────────────────────────────────────────────
  const r204_1 = mkRes('204', '2024-11-10', '2024-11-25', 760, '2semanas', 'inmobiliaria', 'de 10/11 sale 25/11/24=15-N')
  addRes(r204_1, [{ amount: 800, paymentDate: '2024-11-10', received: true }])

  const r204_2 = mkRes('204', '2024-11-30', '2024-12-11', 650, '1semana', 'inmobiliaria', '204: entra 30/11/2024 sale 11/12/2024')
  addRes(r204_2, [{ amount: 690, paymentDate: '2024-11-30', received: true }])

  const r204_3 = mkRes('204', '2024-12-21', '2025-01-12', 938, '2semanas', 'inmobiliaria', '204: entra 21/12/2024 y sale 12/01/2025')
  addRes(r204_3, [{ amount: 978, paymentDate: '2024-12-21', received: true }])

  const r204_4 = mkRes('204', '2025-01-14', '2025-02-25', 1500, '1mes', 'inmobiliaria', 'del 14/01/2025 al 25/02/2025')
  addRes(r204_4, [{ amount: 1500, paymentDate: '2025-01-14', received: true }])

  const r204_5 = mkRes('204', '2025-03-01', '2025-03-11', 688, '1semana', 'inmobiliaria', '01/03/ al 11/03/25=10 dias 728,50+40=768,50')
  addRes(r204_5, [{ amount: 769, paymentDate: '2025-03-01', received: true }])

  const r204_6 = mkRes('204', '2025-03-11', '2025-03-18', 495, '1semana', 'inmobiliaria', 'del 11/03 al 18/03/2025')
  addRes(r204_6, [{ amount: 535, paymentDate: '2025-03-11', received: true }])

  const r204_7 = mkRes('204', '2025-03-18', '2025-03-29', 761, '1semana', 'inmobiliaria', 'del 18/03 al 29/03/25=11-N= 801,42+40')
  addRes(r204_7, [{ amount: 801, paymentDate: '2025-03-18', received: true }])

  const r204_8 = mkRes('204', '2025-04-09', '2025-04-25', 526, '2semanas', 'inmobiliaria', 'del 09/04 al 25/04/25=16-N. =495/14x16=565,71+40=606')
  addRes(r204_8, [{ amount: 606, paymentDate: '2025-04-09', received: true }])

  const r204_9 = mkRes('204', '2025-05-13', '2025-05-25', 495, '1semana', 'inmobiliaria', '13/05/25 al 22/05/25=9-N, ampliación 3-N al 25/05/25')
  addRes(r204_9, [{ amount: 535, paymentDate: '2025-05-13', received: true }])

  const r204_10 = mkRes('204', '2025-07-17', '2025-07-29', 495, '2semanas', 'inmobiliaria', 'entra 17/07/2025 y sale 29/07/2025')
  addRes(r204_10, [{ amount: 535, paymentDate: '2025-07-17', received: true }])

  // ── Apartamento 402 ──────────────────────────────────────────────────────────
  const r402_1 = mkRes('402', '2024-10-01', '2025-04-01', 6500, 'directo', 'directo', '01/10/2024 sale 01/04/2025= 5-Meses= 1,300.-€/mes (Invierno)')
  addRes(r402_1, [
    { amount: 1350, paymentDate: '2024-10-01', received: true },
    { amount: 1350, paymentDate: '2024-11-01', received: true },
    { amount: 1575, paymentDate: '2024-12-01', received: true },
    { amount: 1485, paymentDate: '2025-01-01', received: true },
    { amount: 1485, paymentDate: '2025-03-01', received: true },
  ])

  const r402_2 = mkRes('402', '2025-04-10', '2025-04-17', 550, '1semana', 'inmobiliaria', '10/04 al 17/04=7-N 550+40=590')
  addRes(r402_2, [{ amount: 590, paymentDate: '2025-04-10', received: true }])

  const r402_3 = mkRes('402', '2025-04-18', '2025-04-25', 550, '1semana', 'inmobiliaria', '18/04 Al 25/04/25=7-N=550+40=590')
  addRes(r402_3, [{ amount: 590, paymentDate: '2025-04-18', received: true }])

  // ── PISO-3 ───────────────────────────────────────────────────────────────────
  const rP3_1 = mkRes('P3', '2024-11-08', '2024-11-22', 915, '2semanas', 'inmobiliaria', 'del 08/11 sale 22/11/24=14-N')
  addRes(rP3_1, [{ amount: 955, paymentDate: '2024-11-08', received: true }])

  const rP3_2 = mkRes('P3', '2024-11-22', '2024-11-30', 725, '1semana', 'inmobiliaria', 'Piso 3. Entra 22/11 sale 30/11/2024')
  addRes(rP3_2, [{ amount: 765, paymentDate: '2024-11-22', received: true }])

  const rP3_3 = mkRes('P3', '2024-12-06', '2025-01-05', 1800, '1mes', 'inmobiliaria', 'Piso 3: entra 06/12/2024 y sale 05/01/2025')
  addRes(rP3_3, [{ amount: 1800, paymentDate: '2024-12-06', received: true }])

  const rP3_4 = mkRes('P3', '2025-01-05', '2025-03-31', 3240, 'directo', 'inmobiliaria', 'PISO 3: entra 05/01/2025 y sale 31/03/2025')
  addRes(rP3_4, [
    { amount: 1625, paymentDate: '2025-01-05', received: true },
    { amount: 1625, paymentDate: '2025-02-05', received: true },
    { amount: 1408, paymentDate: '2025-03-05', received: true },
  ])

  const rP3_5 = mkRes('P3', '2025-04-15', '2025-05-01', 1040, '2semanas', 'inmobiliaria', 'del 15/04/2025 al 01/05=16-N=910/14x16=1,040 (no lleva limpieza)')
  addRes(rP3_5, [{ amount: 1040, paymentDate: '2025-04-15', received: true }])

  // ── Arenal 2B ────────────────────────────────────────────────────────────────
  const rAP2B_1 = mkRes('AP2B', '2024-10-08', '2024-10-14', 550, '1semana', 'inmobiliaria', '08/10/24 AL 14/10/24')
  addRes(rAP2B_1)

  const rAP2B_2 = mkRes('AP2B', '2024-10-17', '2024-10-25', 550, '1semana', 'inmobiliaria', '17/10 al 25/10/24')
  addRes(rAP2B_2)

  const rAP2B_3 = mkRes('AP2B', '2024-10-30', '2024-11-10', 760, '1semana', 'inmobiliaria', 'del 30/10 al 10/11/24=11-noches')
  addRes(rAP2B_3)

  const rAP2B_4 = mkRes('AP2B', '2024-12-12', '2025-02-14', 3000, 'directo', 'directo', 'del 12/12 al 14/02/2025 pagan semanal')
  addRes(rAP2B_4)

  const rAP2B_5 = mkRes('AP2B', '2025-02-17', '2025-02-24', 550, '1semana', 'inmobiliaria', 'del 17/02 a 24/02/25= 7-N')
  addRes(rAP2B_5)

  const rAP2B_6 = mkRes('AP2B', '2025-04-08', '2025-04-29', 1800, '3semanas', 'inmobiliaria', 'Semanas de abril 25')
  addRes(rAP2B_6)

  const rAP2B_7 = mkRes('AP2B', '2025-04-30', '2025-05-12', 760, '2semanas', 'inmobiliaria', 'del 30 Abr. Al 12 may-25')
  addRes(rAP2B_7)

  return { reservations, payments }
}

export function buildSeedRepairs(): Repair[] {
  return [
    mkRepair('104', 'HERVIDOR DE AGUA 1,8Lt. 2200W.', 'OFIPAPEL', '2368341-44', 15.50, '2025-06-05'),
    mkRepair('104', 'SANWICHERA INOX PLACA LISA 750W', 'OFIPAPEL', '2397801-48', 19.00, '2025-11-06', '61125104'),
    mkRepair('104', 'CALENTADOR IOSEN 15L SATURNIA', 'FERR. ALAYON', '1418583', 94.91, '2025-12-09', '130126104'),

    mkRepair('105', 'LAVADORA', '¿?', '6030', 521.55, '2024-02-22'),
    mkRepair('105', 'REFORMAS 105 MUEBLES DE COCINA', 'LAS CHAFIRAS', '17839', 3344.20, '2025-07-22'),
    mkRepair('105', 'REFORMAS 105 PISOS Y AZULEJOS BAÑO', 'LAS CHAFIRAS', '14221', 2025.84, '2025-06-28'),
    mkRepair('105', 'REFORMAS 105 VENTILADOR ASPAS TECHO', 'LAS CHAFIRAS', '61748', 187.59, '2025-08-12', '270825/10'),
    mkRepair('105', 'REFORMAS 105 PORTARROLLO PIE C/ESCOBILLA', 'LAS CHAFIRAS', '62810', 62.15, '2025-08-16', '270825/11'),
    mkRepair('105', 'REFORMAS 105 TOALLERO MURAL METALICO', 'LAS CHAFIRAS', '62810', 45.51, '2025-08-16', '270825/11'),
    mkRepair('105', 'REFORMAS 105 MUEBLE LAVABO BAÑO', 'LAS CHAFIRAS', '17878', 148.15, '2025-08-12', '270825/12'),
    mkRepair('105', 'REFORMAS 105 LAVABO BAÑO', 'LAS CHAFIRAS', '17878', 61.71, '2025-08-12', '270825/12'),
    mkRepair('105', 'REFORMAS 105 ESPEJO LAVABO BAÑO', 'LAS CHAFIRAS', '17878', 48.75, '2025-08-12', '270825/12'),
    mkRepair('105', 'REFORMAS 105 INODORO VICTORIA', 'LAS CHAFIRAS', '17878', 52.50, '2025-08-12', '270825/12'),
    mkRepair('105', 'REFORMAS 105 MONOMANDO LAVABO BAÑO', 'LAS CHAFIRAS', '17878', 44.02, '2025-08-12', '270825/12'),
    mkRepair('105', 'REFORMAS 105 APLIQUE LED MUEBLE BAÑO', 'LAS CHAFIRAS', '17878', 55.76, '2025-08-12', '270825/12'),
    mkRepair('105', 'CALENTADOR ELECTRICO 50L ONIX CONNECT', 'LAS CHAFIRAS', '66320', 377.90, '2025-08-28', '080925/13'),
    mkRepair('105', 'COLUMNA DUCHA VEGA PLUS ROUND CROMO', 'LAS CHAFIRAS', '62769', 219.98, '2025-08-16', '080925/13'),
    mkRepair('105', 'PINTURA TITANLUX 15L COBERTURA TOTAL', 'LAS CHAFIRAS', '66320', 69.79, '2025-08-28', '080925/13'),
    mkRepair('105', 'LOSETAS 30x90 ADAIR MIX RELIEVE', 'LAS CHAFIRAS', '72578', 31.15, '2025-09-18', '190825/14'),
    mkRepair('105', 'REFORMAS 105 ALBAÑIL - ANGEL MORALES', 'ANGEL MORALES', '242', 5885.20, undefined),
    mkRepair('105', 'REFORMAS 105 VENTANA COCINA', 'ALUMINIGLAS', '934426', 629.82, '2025-08-07'),
    mkRepair('105', 'ALUMINIGLAS MARCO FIJO 61X76', 'ALUMINIGLAS', '34493', 389.11, '2025-08-29', '011025/17'),
    mkRepair('105', 'TV 50" LG', 'MAKRO', '42593', 315.00, '2025-10-07', '071025105/18'),
    mkRepair('105', 'PINTOR - PAOLO', 'PAOLO', undefined, 820.00),
    mkRepair('105', 'SILLAS COMEDOR COCINA', 'IKEA', 'BBVA TARJETA SEPT-2025', 207.00, '2025-09-11', '091025105/26'),
    mkRepair('105', 'LACADO MUEBLES APTO. 105', 'Pilar Herminia Hdez', '2502', 428.00, '2025-09-22', '220925/15'),
    mkRepair('105', 'CARPINTERIA MORENO', 'Rafael Moreno Rodriguez', '59', 3147.51, '2025-09-18', '230925/16'),
    mkRepair('105', 'REFORMAS 105 PUERTAS CARPINTERÍA MORENO', 'CARPINT. MORENO', '918', 2247.00, '2025-08-14', '140825/9'),
    mkRepair('105', 'REFORMAS 105 CABECERO CARPINTERÍA MORENO', 'CARPINT. MORENO', '921', 877.40),
    mkRepair('105', 'COELCA CABLES, CAJAS, ETC', 'COELCA', '93826225', 86.71, '2025-09-30', '021025105/18'),
    mkRepair('105', 'CONFORAMA CUADRO HABITACIÓN', 'CONFORAMA', '691RV2A0018304', 107.99, '2025-10-02', '021025105/19'),
    mkRepair('105', 'REPARACIONES E INSTALACIONES', 'FERRETERIA ALAYON', '1437092', 228.12, '2025-09-30', '021025105/22'),
    mkRepair('105', 'MANO DE OBRA - TOMAS', 'TOMAS', '300925', 670.00, '2025-10-02', '021025105/23'),
    mkRepair('105', 'SIKA MONOTO 107 PLUS', 'IMPERMECA', '250593', 87.74, '2025-10-02', '021025105/20'),
    mkRepair('105', 'TUBO POLIETILENO TUYPER A/D 25-16AT', 'FONCAL', '25049916', 34.33, '2025-10-02', '021025105/21'),
    mkRepair('105', 'CORTINAS INSTALACIÓN', 'EL KILO', 'P25 000357', 77.26, '2025-09-03', '091025105/28'),
    mkRepair('105', 'COJINES SOFÁ CONFECCIÓN', 'EL KILO', 'P25 000357', 180.13, '2025-09-03', '091025105/28'),
    mkRepair('105', 'CONFORAMA CUADROS, ESPEJO', 'CONFORAMA', '17525', 198.95, '2025-09-25', '091025105/28'),
    mkRepair('105', 'PLANCHA VAPOR 1,600W. CERÁMICA', 'OFIPAPEL', '23923881-54', 15.42, '2025-10-09', '131025105/29'),
    mkRepair('105', 'HERVIDOR DE AGUA INOX 1L 2200W', 'OFIPAPEL', '23923881-54', 19.53, '2025-10-09', '131025105/29'),
    mkRepair('105', 'SANWICHERA INOX GRILL 750W', 'OFIPAPEL', '23923881-54', 14.49, '2025-10-09', '131025105/29'),
    mkRepair('105', 'TABLA PLANCHAR 33x109', 'FERRETERIA ALAYON', '1414301', 27.17, '2025-10-09', '091025105/30'),
    mkRepair('105', 'TENDEDERO C/ALAS ACERO PINTADO 18MT', 'FERRETERIA ALAYON', '1414301', 18.17, '2025-10-09', '091025105/30'),
    mkRepair('105', 'SARTÉN 20x4 ACERO VITRIFICADO', 'FERRETERIA ALAYON', '1414301', 18.17, '2025-10-09', '091025105/30'),
    mkRepair('105', 'SOPORTE TV LED 37"-70" COCINA', 'OFIPAPEL', '2391864-48', 12.06, '2025-10-08', '08102510/30'),
    mkRepair('105', 'SOPORTE TV PARED LCD 37" 70" HABITACIÓN', 'OFIPAPEL', '2391864-48', 16.73, '2025-10-08', '08102510/30'),

    mkRepair('106', 'HERVIDOR DE AGUA INOX 1L 2200W', 'MANDATELO', '2340030-47', 20.90, '2025-01-10'),
    mkRepair('106', '1 BASE TAPIZADA 90x190 + PATAS', 'BELLO', '9199', 109.25, '2025-06-13', '300625106'),
    mkRepair('106', 'LAVADORA LG C/FRONTAL 8KG.', 'BELLO', '10300', 360.00, '2025-12-20', '201225106'),
    mkRepair('106', 'SANWICHERA INOX PLACA LISA 750W', 'OFIPAPEL', '2397801-48', 19.00, '2025-11-06', '61125106'),

    mkRepair('203', 'HERVIDOR', '¿?', '¿?', 0, '2023-08-21'),
    mkRepair('203', 'MESA TERRAZA', '¿?', '¿?', 0, '2023-09-20'),
    mkRepair('203', 'CORTINA', '¿?', '¿?', 0, '2024-02-27'),
    mkRepair('203', '2 CUADROS (ROTO POR INQUILINO)', 'IKA', '202408130043', 34.00, '2024-08-13'),
    mkRepair('203', 'LAVADORA AEG C/S 7KG.', 'B.BELLO', '8176', 521.55, '2024-12-10'),
    mkRepair('203', 'SANWICHERA INOX PLACA LISA 750W', 'OFIPAPEL', '2397795-48', 19.00, '2025-11-06', '61125203'),

    mkRepair('204', 'HERVIDOR', '¿?', '¿?', 0, '2023-02-10'),
    mkRepair('204', '3 SILLAS COCINA', 'IKEA', 'JQXKZ', 0, '2024-05-28'),
    mkRepair('204', 'NEVERA TEGRAN 144x55', 'B.BELLO', '8845', 227.00, '2025-03-26'),
    mkRepair('204', '2 COLCHÓN BERLIN 90x190', 'BELLO', '9174', 570.00, '2025-06-10', '300625204'),
    mkRepair('204', '2 BASE TAPIZADA 90x190 + PATAS', 'BELLO', '9174', 230.00, '2025-06-10', '300625204'),
    mkRepair('204', 'SANWICHERA INOX PLACA LISA 750W MUVIP', 'OFIPAPEL', '2396349-48', 19.00, '2025-10-30', '301025204/01'),
    mkRepair('204', 'TOSTADORA DE PAN 750W MUVIP', 'OFIPAPEL', '2413790-48', 17.90, '2026-01-27', '270126204/01'),

    mkRepair('402', '4 SILLAS', '¿?', '¿?', 0, '2023-10-26'),
    mkRepair('402', 'MESA CENTRO', '¿?', '¿?', 0, '2023-10-26'),
    mkRepair('402', 'CALENTADOR 50L CADECA MODELO MC 50', '¿?', '¿?', 0, '2023-12-11'),
    mkRepair('402', 'LAVADORA BOSCH C/F 10KG. 1400', 'BELLO', '9491', 540.55, '2025-08-04', '40825402'),
    mkRepair('402', 'VENTILADOR PIE 40cm 45W', 'OFIPAPEL', '2377667-48', 19.70, '2025-07-29', '80825402'),
    mkRepair('402', 'SANWICHERA INOX PLACA LISA 750W', 'OFIPAPEL', '2397801-48', 19.00, '2025-11-06', '61125402'),
    mkRepair('402', 'MESA TERRAZA CURVER HARMONY 160X90', 'CRIS ABORA', '1369', 157.92, '2026-01-15', '150126402'),
    mkRepair('402', '4 SILLAS CURVER HARMONY', 'CRIS ABORA', '1369', 154.00, '2026-01-15', '150126402'),
    mkRepair('402', '2 TUMBONAS RESOL MARINA CLUB', 'CRIS ABORA', '1369', 312.66, '2026-01-15', '150126402'),
    mkRepair('402', 'LAVAVAJILLAS BOSCH 60BL', 'BELLO', '10804', 426.00, '2026-03-25', '250326402'),

    mkRepair('AP2B', 'TERMO ELÉCTRICO + MANO DE OBRA', 'SOC PROPERTIES', '170', 256.75, '2025-04-01'),
    mkRepair('AP2B', 'PLANCHA DE VAPOR', 'SOC PROPERTIES', '171', 43.50, '2025-04-01'),
    mkRepair('AP2B', 'SECADOR DE PELO', 'SOC PROPERTIES', '171', 34.34, '2025-04-01'),
    mkRepair('AP2B', 'LIMPIEZA Y MANTENIMIENTO AIRES ACOND.', 'SANCAR', '553', 64.20, '2025-06-30', '1408252B'),

    mkRepair('P3', 'CAFETERA', '¿?', '¿?', 0, '2022-12-30'),
    mkRepair('P3', 'MESA OFICINA', '¿?', '¿?', 0, '2023-02-09'),
    mkRepair('P3', 'TOSTADORA', '¿?', '¿?', 0, '2023-02-09'),
    mkRepair('P3', 'LÁMPARAS MESA NOCHE', '¿?', '¿?', 0, '2023-07-26'),
    mkRepair('P3', 'LAVADORA', '6419', '¿?', 455.05, '2024-01-19'),
    mkRepair('P3', '2 SOMIERES 1,90 HAB. 1º IZDA', 'B.BELLO', '7258', 760.00, '2024-07-25'),
    mkRepair('P3', '2 COLCHONES 1,90 HAB. 1º IZDA', 'B.BELLO', '7258', 760.00, '2024-07-25'),
    mkRepair('P3', 'CALENTADOR 30L CADECA MC30', 'FERRETERIA ALAYON', '1156054', 121.85, '2024-08-22'),
    mkRepair('P3', 'CAFETERA GOTEO 6 TAZAS 600W LARRYHOUSE', 'OFIPAPEL', '2.315.440-18', 17.90, '2024-09-12'),
  ]
}
