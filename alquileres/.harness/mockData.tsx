const noop = () => {}
const datos: Record<string, unknown> = {
  apartments: [
    { id:'104', name:'Apart. 104', bedrooms:1, type:'1BR', active:true },
    { id:'105', name:'Apart. 105', bedrooms:1, type:'1BR', active:true },
    { id:'402', name:'Ático 402',  bedrooms:2, type:'2BR_ATICO', active:true },
  ],
  prices: [{ id:'p1', year:2026, season:'VERANO', apartmentType:'1BR', price1week:330, price2weeks:545, price3weeks:685, price1month:970, cleaningFee:40 }],
  reservations: [
    { id:'r1', apartmentId:'104', checkIn:'2026-08-18', checkOut:'2026-08-30', nights:12, stayType:'1semana',
      channel:'inmobiliaria', basePrice:565, cleaningFee:40, discountPct:0, total:605, status:'confirmada', createdAt:'' },
    { id:'r2', apartmentId:'402', checkIn:'2026-09-05', checkOut:'2026-09-19', nights:14, stayType:'2semanas',
      channel:'directo', basePrice:995, cleaningFee:40, discountPct:0, total:1035, status:'confirmada', createdAt:'' },
  ],
  payments: [{ id:'pg1', reservationId:'r2', amount:1035, received:false, createdAt:'' }],
  repairs: [], incomes: [], occupancies: [], repairTotals: [], importLogs: [], expenses: [],
  addReservation: () => ({ id:'x' }), addPayment: noop, updatePayment: noop,
}
export function useData() { return datos }
