import type { ReglaOperativa } from '../components/Operativa'

/**
 * Lo que aplica cada pantalla, escrito en cristiano.
 *
 * Vive junto, y no repartido por las pantallas, para que se lea de corrido el
 * día que haya que repasarlo o explicárselo a alguien — y para que se note
 * enseguida si dos pantallas dicen cosas distintas de lo mismo.
 *
 * **Esto tiene que decir lo que hace el código.** Cada regla lleva al lado, en
 * un comentario, de dónde sale; si se cambia la regla, se cambia aquí.
 */

/** Las que valen en toda la aplicación. */
const COMUNES: ReglaOperativa[] = [
  {
    // lib/priceCalc.ts — precioPorNoches()
    que: 'Precio de una estancia',
    formula: 'tarifa del tramo ÷ días del tramo × noches',
    nota: 'La tarifa nunca se cobra tal cual: se parte por días y se multiplica por las noches '
      + 'reales. 10 noches con tarifa de 1 semana de 495 € = 495 / 7 × 10 = 707,14 €.',
  },
  {
    // lib/priceCalc.ts — tramoPorNoches()
    que: 'Qué tramo se aplica',
    formula: '7–13 noches → 1 semana · 14–20 → 2 semanas · 21–29 → 3 semanas · 30 o más → 1 mes',
    nota: 'Siempre se baja al tramo más cercano por debajo. Por debajo de 7 noches, el de 1 semana.',
  },
  {
    // lib/priceCalc.ts — buscaTarifa(), decisión del propietario del 14/10/2026
    que: 'Tarifas de oferta',
    formula: 'si hay oferta para el mes de ENTRADA y ese apartamento, manda la oferta',
    nota: 'Manda sobre la tarifa general: para eso se crea. Se aplica al calcular el precio, así '
      + 'que una reserva ya guardada no cambia sola — se lleva con «Aplicar a las reservas», en Precios.',
  },
  {
    // lib/limpieza.ts
    que: 'Limpieza',
    formula: 'la de la tarifa (40 € normalmente) · el Arenal (AP-2-B) va sin limpieza',
    nota: 'Se cobra una vez, en el mes de entrada, y no se parte entre meses. La del Arenal la cobra '
      + 'Airbnb y se la queda la gestora, así que cobrarla otra vez sería cobrarla dos veces.',
  },
  {
    // lib/dateUtils.ts — getSeason()
    que: 'Temporada',
    formula: 'la de la fecha de ENTRADA, igual que el tramo y la oferta',
  },
]

export const OPERATIVA_COBROS: ReglaOperativa[] = [
  {
    // Payment.mes — ver CLAUDE.md
    que: 'Mes contable',
    formula: 'manda el mes contable del cobro, no la fecha en que se pagó',
    nota: 'El alquiler de enero del 106 se pagó el 31 de diciembre y en el Excel cuenta en enero. '
      + 'Cuando un cobro no trae mes contable, se usa su fecha.',
  },
  {
    // lib/devengo.ts — partesDeAlojamiento()
    que: 'Devengo de cada mes',
    formula: 'alojamiento ÷ noches totales × noches de ese mes',
    nota: 'Cada mes se queda con su parte de la estancia. El redondeo que sobra va al último mes, '
      + 'así que las partes suman siempre el alojamiento completo. La limpieza no se parte.',
  },
  {
    // pages/Collections.tsx — Estado
    que: 'Las señales del estado',
    formula: '✓ cubierto · ◆ prepago · — en curso o sin entrar · cifra: lo que falta',
    nota: 'Se compara lo cobrado con lo devengado ACUMULADO hasta ese mes, no mes contra mes: '
      + 'los cobros reales no siguen el prorrateo exacto. Una estancia pagada entera es ✓ aunque '
      + 'se pagara por delante; el rombo es solo para lo que va adelantado y aún no está pagado del todo.',
  },
  {
    // pages/Collections.tsx — vencidas / porVenir
    que: 'Qué es un descubierto',
    formula: 'estancia TERMINADA y sin cobrar del todo',
    nota: 'Lo que está en marcha o por venir no es un descubierto: lo normal es cobrarlo durante la '
      + 'estancia o a la salida, y por eso va aparte y plegado.',
  },
  {
    // pages/Collections.tsx — esEfectivo()
    que: 'Transferencia o efectivo',
    formula: 'lo que diga la forma de pago del cobro; si no la trae, efectivo cuando la reserva es directa',
  },
  { que: 'IGIC', formula: 'los importes van con el 7 % incluido' },
  ...COMUNES,
]

export const OPERATIVA_RESERVAS: ReglaOperativa[] = [
  {
    // pages/Reservations.tsx — total
    que: 'Total de la reserva',
    formula: 'base × (1 − descuento %) + limpieza',
  },
  {
    // pages/Reservations.tsx — pactado
    que: 'Precio pactado',
    nota: 'Con «Precio pactado» el importe lo pone la persona y la aplicación no vuelve a tocarlo: '
      + 'ni la tarifa ni una oferta posterior lo cambian.',
  },
  {
    // lib/solapes.ts
    que: 'Reservas que se pisan',
    formula: 'mismo apartamento y al menos una noche en común, de hoy en adelante',
    nota: 'Una salida y una entrada el mismo día NO se pisan: esa noche ya no duerme nadie. Lo de '
      + 'ejercicios cerrados no se avisa.',
  },
  {
    que: 'Anulaciones',
    nota: 'Se marcan como anuladas, nunca se borran: la reserva se queda con sus cobros y su historial.',
  },
  ...COMUNES,
]

export const OPERATIVA_PRECIOS: ReglaOperativa[] = [
  {
    // lib/priceCalc.ts — calcPrices()
    que: 'Precios de los canales',
    formula: 'comisión = base × 15 % · web (publicar) = base + comisión × 2',
    nota: 'La comisión se calcula solo sobre la base, nunca sobre la limpieza. La web lleva las dos '
      + 'comisiones: la de la inmobiliaria y la de la reserva.',
  },
  {
    que: 'Directo / VIP-B',
    formula: 'precio de 1 mes − 10 %',
  },
  {
    // pages/Prices.tsx — creaTarifa()
    que: 'Un año nuevo',
    nota: 'Nunca arranca en blanco: se copia la tarifa del año anterior para no teclear lo que no cambia.',
  },
  ...COMUNES,
]

export const OPERATIVA_GASTOS: ReglaOperativa[] = [
  {
    // lib/deducible.ts
    que: 'Gastos deducibles',
    formula: 'los ligados al alquiler van enteros · los de la vivienda, en proporción a los días alquilados',
    nota: 'Comisiones, comisión de agencia, limpieza y lavandería son del alquiler. Luz, agua, '
      + 'internet, comunidad, IBI y basura son de la vivienda y solo se deducen en proporción.',
  },
  {
    que: 'Comisiones de Airbnb del Arenal',
    nota: 'No se dan de alta como gasto: el ingreso que se guarda ya es el neto que llega al banco, '
      + 'así que apuntarlas las descontaría dos veces.',
  },
]

export const OPERATIVA_ANALITICA: ReglaOperativa[] = [
  {
    que: 'Ocupación',
    formula: 'noches ocupadas ÷ noches del periodo',
  },
  {
    que: 'Lo que se compara',
    nota: 'Las cifras salen de las reservas y los cobros de la propia aplicación, no de un cálculo '
      + 'aparte: lo que se vea aquí tiene que cuadrar con Cobros y con Reservas.',
  },
  ...COMUNES,
]

export const OPERATIVA_ASESORIA: ReglaOperativa[] = [
  { que: 'IGIC', formula: 'base × 7 %', nota: 'Los importes de la aplicación ya lo llevan incluido.' },
  {
    // lib/compararGestor.ts
    que: 'Comparar con el gestor',
    formula: 'trimestre × inmueble: lo que dice su hoja contra lo cobrado aquí por mes contable',
    nota: 'Solo enseña las diferencias y no guarda nada. Las que pasen de un céntimo se marcan.',
  },
  {
    que: 'El Arenal',
    nota: 'Lo gestiona SOC Properties por Airbnb: sus importes entran por el informe anual de la '
      + 'gestora y se guarda el NETO, que es lo que llega al banco.',
  },
]

export const OPERATIVA_PLANNING: ReglaOperativa[] = [
  {
    que: 'Qué día ocupa una estancia',
    formula: 'desde la entrada hasta la noche anterior a la salida',
    nota: 'El día de salida queda libre: esa noche ya no duerme nadie, y por eso puede entrar otro '
      + 'ese mismo día.',
  },
  {
    que: 'La marca 🏷️',
    nota: 'La estancia va a precio de una tarifa de oferta. En ámbar, hay oferta para ese mes pero el '
      + 'importe no sale de ella (se pactó a mano o la reserva es anterior a la oferta).',
  },
  ...COMUNES,
]
