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
 *
 * Norma del propietario (05/11/2026): cada pantalla lleva su Operativa, escueta,
 * con lo importante resaltado (`**así**`), para que cualquier operario sepa qué
 * reglas sigue sin preguntar. Solo las reglas que tocan a esa pantalla.
 */

// ─── Las que comparten varias pantallas ───────────────────────────────────────

// lib/priceCalc.ts — precioPorNoches()
const PRECIO: ReglaOperativa = {
  que: 'Precio de una estancia',
  formula: 'tarifa del tramo ÷ días del tramo × noches',
  nota: 'La tarifa **nunca se cobra tal cual**. 10 noches con tarifa de 1 semana de 495 € = 495 / 7 × 10 = 707,14 €.',
}

// lib/priceCalc.ts — tramoPorNoches()
const TRAMO: ReglaOperativa = {
  que: 'Qué tramo se aplica',
  formula: '7–13 noches → 1 semana · 14–20 → 2 semanas · 21–29 → 3 semanas · 30 o más → 1 mes',
  nota: 'Siempre se **baja al tramo más cercano**. Por debajo de 7 noches, el de 1 semana.',
}

// lib/priceCalc.ts — buscaTarifa(), decisión del propietario del 14/10/2026
const OFERTA: ReglaOperativa = {
  que: 'Tarifas de oferta',
  formula: 'si hay oferta para el mes de ENTRADA y ese apartamento, manda la oferta',
  nota: 'Una reserva ya guardada **no cambia sola**: se lleva con «Aplicar a las reservas», en Precios.',
}

// lib/limpieza.ts
const LIMPIEZA: ReglaOperativa = {
  que: 'Limpieza',
  formula: 'la de la tarifa (40 € normalmente) · el Arenal 2B va SIN limpieza',
  nota: 'Va **incluida en el importe** de la reserva. Se cobra una vez, en el mes de entrada. La del '
    + 'Arenal la cobra Airbnb y se la queda la gestora.',
}

// lib/dateUtils.ts — getSeason()
const TEMPORADA: ReglaOperativa = {
  que: 'Temporada',
  formula: 'la de la fecha de ENTRADA, igual que el tramo y la oferta',
}

// lib/cuentas.ts — comisionDe()
const COMISIONES: ReglaOperativa = {
  que: 'Comisiones',
  formula: 'precio base × 15 % · inmobiliaria y Booking · desde 2026',
  nota: 'Salen solas del canal de la reserva, **no se teclean**, y se deducen enteras. Sin limpieza. '
    + 'Airbnb no lleva: su ingreso ya llega neto.',
}

// lib/deducible.ts — ocupacionMes()
const OCUPACION_MES: ReglaOperativa = {
  que: 'Ocupación del mes',
  formula: 'noches alquiladas de ese inmueble ÷ días del mes',
  nota: 'Si el Excel declara la ocupación de ese mes, **manda el Excel**; si da más del 100 %, se calcula aquí.',
}

// ─── Una por pantalla ─────────────────────────────────────────────────────────

export const OPERATIVA_DASHBOARD: ReglaOperativa[] = [
  {
    // pages/Dashboard.tsx — monthIncome
    que: 'Cobrado este mes',
    formula: 'cobros recibidos con FECHA de pago en este mes',
    nota: 'Aquí cuenta la fecha del pago, **no el mes contable** que usa Cobros, así que pueden no coincidir.',
  },
  {
    // pages/Dashboard.tsx — netYear
    que: 'Neto del año',
    formula: 'cobrado del año − reparaciones del año',
    nota: '**Solo resta reparaciones**. El resultado con todos los gastos está en Analítica.',
  },
  {
    // pages/Dashboard.tsx — vencidas
    que: 'Cobros vencidos',
    formula: 'estancia TERMINADA, sin cobrar del todo, desde 2026',
    nota: 'Lo que aún no ha terminado no es un aviso: es lo normal.',
  },
  {
    // components/AvisoSolapes.tsx
    que: 'Reservas que se pisan',
    nota: 'El aviso **vuelve a salir cada vez** hasta que no quede ninguna. Se arregla anulando la que sobra.',
  },
  {
    // components/AlertasDescuadre.tsx
    que: 'Descuadres con el Excel',
    nota: 'Solo avisan: **no cambian ninguna cifra** de la aplicación.',
  },
  {
    // lib/copia.ts — DIAS_ENTRE_COPIAS
    que: 'Copia de seguridad',
    formula: 'avisa a los 15 días de la última',
    nota: 'Se descarga en Apartamentos. Lo que se borra por error **no se puede recuperar** sin ella.',
  },
  {
    // pages/Dashboard.tsx — isPriceRenewalMonth
    que: 'Renovación de precios',
    nota: 'Cada **enero** se avisa de que toca revisar la lista de Precios.',
  },
]

export const OPERATIVA_PLANNING: ReglaOperativa[] = [
  {
    que: 'Qué día ocupa una estancia',
    formula: 'desde la entrada hasta la noche anterior a la salida',
    nota: 'El **día de salida queda libre**: puede entrar otro ese mismo día.',
  },
  {
    que: 'La marca 🏷️',
    nota: 'La estancia va a precio de una tarifa de oferta. En **ámbar**, hay oferta para ese mes pero el '
      + 'importe no sale de ella (se pactó a mano o la reserva es anterior).',
  },
]

export const OPERATIVA_EDIFICIOS: ReglaOperativa[] = [
  {
    // pages/Edificios.tsx — estadoDe()
    que: 'Las ventanas',
    formula: 'encendida: ocupado · ▲ entra ese día · ▼ sale ese día',
    nota: 'El día de salida el piso ya no cuenta como ocupado.',
  },
  {
    // pages/Edificios.tsx — estadoDe(), debe
    que: 'La marca €',
    formula: 'estancias TERMINADAS desde 2026 y sin cobrar del todo',
  },
  {
    que: 'La furgoneta de limpieza',
    nota: 'Sale los días con salidas. Al pincharla se ven las de ese día y las de los 7 siguientes.',
  },
  {
    que: 'De dónde sale',
    nota: '**No calcula ni guarda nada**: lo dibuja de Reservas y Cobros. Si algo no cuadra aquí, no cuadra allí.',
  },
]

export const OPERATIVA_RESERVAS: ReglaOperativa[] = [
  PRECIO,
  TRAMO,
  OFERTA,
  LIMPIEZA,
  TEMPORADA,
  {
    // lib/priceCalc.ts — calcTotal()
    que: 'Total de la reserva',
    formula: 'base × (1 − descuento %) + limpieza',
  },
  {
    // pages/Reservations.tsx — pactado; components/AplicarOferta.tsx
    que: 'Precio pactado',
    nota: 'El importe lo pone la persona y **no se recalcula solo**. Al editar una reserva guardada se '
      + 'entra siempre así. Solo lo cambia una oferta si se marca en «Aplicar a las reservas».',
  },
  {
    // lib/solapes.ts
    que: 'Reservas que se pisan',
    formula: 'mismo apartamento y al menos una noche en común, de hoy en adelante',
    nota: 'Una salida y una entrada **el mismo día NO se pisan**. Lo de años pasados no se avisa.',
  },
  {
    // components/PegarWhatsApp.tsx — anular
    que: 'Anulaciones',
    nota: 'Anular **no borra nada**: la reserva se queda con sus cobros y su historial, y sale del planning.',
  },
  {
    // components/PegarWhatsApp.tsx
    que: 'Pegar desde WhatsApp',
    nota: '**Nada se guarda sin enseñarlo antes.** Entiende avisos de reserva, anulaciones y justificantes de cobro.',
  },
  {
    // components/ImportarReservas.tsx
    que: 'Cargar calendario',
    nota: '**Sustituye** las reservas de los años que trae el fichero, y las pone a precio de tarifa.',
  },
  {
    // lib/importarAirbnb.ts — ver CLAUDE.md
    que: 'Informe de Airbnb (Arenal)',
    nota: 'Se guarda **el neto**, que es lo que llega al banco. No inventa cobros: una estancia terminada '
      + 'sin transferencia queda pendiente, para reclamarla a la gestora.',
  },
]

export const OPERATIVA_PRECIOS: ReglaOperativa[] = [
  PRECIO,
  TRAMO,
  OFERTA,
  LIMPIEZA,
  TEMPORADA,
  {
    // lib/priceCalc.ts — calcPrices()
    que: 'Precios de los canales',
    formula: 'comisión = base × 15 % · web (publicar) = base + comisión × 2',
    nota: 'La comisión es **solo sobre la base**, nunca sobre la limpieza. La web lleva las dos: inmobiliaria y reserva.',
  },
  {
    que: 'Directo / VIP-B',
    formula: 'precio de 1 mes − 10 %',
    nota: 'El descuento es **con pago al contado** (desde el 14/04/26). **No se publican en la web.**',
  },
  {
    // lib/priceCalc.ts — calcExtension()
    que: 'Prolongaciones',
    formula: 'precio contratado ÷ días × días extra',
  },
  {
    // lib/priceCalc.ts — getApartmentType()
    que: 'Tipo de cada apartamento',
    formula: '402: ático · P3: 3 dormitorios · 106, 203, 204: 2 dormitorios · el resto: 1 dormitorio',
  },
  {
    // pages/Prices.tsx — creaTarifa()
    que: 'Un año nuevo',
    nota: '**Nunca arranca en blanco**: se copia la tarifa del año anterior.',
  },
]

export const OPERATIVA_COBROS: ReglaOperativa[] = [
  {
    // Payment.mes — ver CLAUDE.md
    que: 'Mes contable',
    formula: 'manda el mes contable del cobro, no la fecha en que se pagó',
    nota: 'El alquiler de enero del 106 se pagó el 31 de diciembre y **cuenta en enero**. Sin mes contable, se usa la fecha.',
  },
  {
    // pages/Collections.tsx — CobrosPorReserva
    que: 'Resto pendiente',
    formula: 'importe de la reserva − lo cobrado hasta el final de ese mes',
    nota: 'Es lo que **quedaba a final de cada mes**, así que baja según se cobra. Cuenta también lo cobrado en años anteriores.',
  },
  LIMPIEZA,
  {
    // lib/devengo.ts — partesDeAlojamiento(), devengoDelMes()
    que: 'La cifra «mes»',
    formula: 'alojamiento ÷ noches totales × noches del mes (+ limpieza si es el mes de entrada)',
    nota: 'Lo que le toca a cada mes por sus noches. Las de todos los meses **suman el importe** de la reserva.',
  },
  {
    // pages/Collections.tsx — Estado
    que: 'Las señales del estado',
    formula: '✓ cubierto · ◆ prepago · — en curso o sin entrar · cifra: lo que falta',
    nota: 'Se compara lo cobrado con lo que toca **acumulado hasta ese mes**, no mes contra mes. Pagada entera siempre es ✓.',
  },
  {
    // pages/Collections.tsx — vencidas / porVenir
    que: 'Qué es un descubierto',
    formula: 'estancia TERMINADA y sin cobrar del todo',
    nota: 'Lo que está en marcha o por venir no lo es: va aparte y plegado.',
  },
  {
    // pages/Collections.tsx — esEfectivo()
    que: 'Transferencia o efectivo',
    formula: 'lo que diga la forma de pago del cobro; si no la trae, efectivo cuando la reserva es directa',
  },
  {
    // lib/priceCalc.ts — calcIGIC(); pages/Collections.tsx
    que: 'IGIC',
    formula: 'IGIC = importe × 7 % · Total con IGIC = importe + IGIC',
  },
  {
    // components/CeldaDesglose.tsx, components/FichaCuadre.tsx
    que: 'Ver el cuadre de una estancia',
    nota: '**Pasa el ratón** por las noches o el importe para verlo; **pincha** en la cifra o en el recuadro para '
      + 'abrir la ficha, imprimirla o enviarla a la agencia. **La tarifa en azul lleva a Precios**.',
  },
]

export const OPERATIVA_GASTOS: ReglaOperativa[] = [
  {
    // lib/deducible.ts — EXPENSE_DEDUCIBILIDAD
    que: 'Se deducen enteros',
    formula: 'comisiones · comisión de agencia · limpieza · lavandería',
    nota: 'Son gastos ligados al propio alquiler.',
  },
  {
    // lib/deducible.ts — EXPENSE_DEDUCIBILIDAD
    que: 'Se deducen por ocupación',
    formula: 'importe × ocupación del mes',
    nota: 'Luz, agua, internet, comunidad, IBI, basura, profesionales y otros: **solo la parte de los días alquilados**.',
  },
  OCUPACION_MES,
  COMISIONES,
  {
    que: 'Comisiones de Airbnb del Arenal',
    nota: '**No se dan de alta como gasto**: el ingreso ya es el neto, y apuntarlas las descontaría dos veces.',
  },
  {
    // components/ImportarExcel.tsx
    que: 'Importar Excel',
    nota: 'Siempre enseña antes **lo que va a entrar y lo que se va a retirar**.',
  },
]

export const OPERATIVA_REPARACIONES: ReglaOperativa[] = [
  {
    // lib/deducible.ts — deducibleReparacion()
    que: 'Lo que se deduce',
    formula: 'importe × ocupación del mes de la reparación',
    nota: 'Es gasto de conservación de la vivienda: **solo la parte de los días alquilados**.',
  },
  OCUPACION_MES,
  {
    // pages/Repairs.tsx — borrado con auditoría
    que: 'Eliminar una reparación',
    nota: 'Pide **motivo y contraseña**, y queda apuntado quién la eliminó y por qué.',
  },
]

export const OPERATIVA_ANALITICA: ReglaOperativa[] = [
  {
    // lib/cuentas.ts — cuentasDe()
    que: 'Ingresos',
    formula: 'si el año tiene Excel de ingresos, el Excel · si no, lo cobrado en la aplicación',
    nota: 'Lo cobrado se cuenta aquí por **fecha de pago**, no por mes contable.',
  },
  {
    // lib/cuentas.ts — EJERCICIO_APP
    que: 'Años anteriores a 2026',
    nota: 'Sin su Excel **no tienen cuentas**: de esos años solo se cargó el histórico de estancias.',
  },
  {
    // lib/cuentas.ts — resultado
    que: 'Resultado',
    formula: 'ingresos − gasto deducible',
    nota: 'Se resta **lo deducible**, no todo el gasto.',
  },
  {
    que: 'Ocupación',
    formula: 'noches ocupadas ÷ días del periodo',
  },
  COMISIONES,
  {
    que: 'Lo que se compara',
    nota: 'Es **el mismo cálculo** que la hoja de Asesoría: las dos tienen que decir lo mismo.',
  },
]

export const OPERATIVA_ASESORIA: ReglaOperativa[] = [
  {
    // lib/cuentas.ts — igic
    que: 'IGIC',
    formula: 'ingresos × 7 %',
  },
  {
    // lib/cuentas.ts — cuentasDe()
    que: 'De dónde salen las cifras',
    nota: 'Del **mismo cálculo** que Analítica. Con Excel de ingresos del año, manda el Excel.',
  },
  {
    // lib/compararGestor.ts
    que: 'Comparar con el gestor',
    formula: 'trimestre × inmueble: lo que dice su hoja contra lo cobrado aquí por mes contable',
    nota: '**Solo enseña las diferencias y no guarda nada.** Se marcan las que pasan de un céntimo.',
  },
  {
    que: 'El Arenal',
    nota: 'Lo gestiona SOC Properties por Airbnb: sus importes entran por el informe anual y se guarda '
      + '**el neto**, que es lo que llega al banco.',
  },
]

export const OPERATIVA_REGISTRO: ReglaOperativa[] = [
  {
    // pages/Registro.tsx
    que: 'Qué se apunta',
    nota: 'Todo lo que entra en la aplicación: **quién, cuándo, por dónde y qué**.',
  },
  {
    que: 'No se toca',
    nota: 'Es un histórico: **no se edita ni se borra** desde la aplicación.',
  },
  {
    // pages/Registro.tsx — resumenDe()
    que: 'Quien solo sube documentos',
    nota: 'Ve el registro entero, salvo el resumen de las subidas de otros, que puede llevar importes.',
  },
]

export const OPERATIVA_APARTAMENTOS: ReglaOperativa[] = [
  {
    // lib/priceCalc.ts — getApartmentType()
    que: 'Tipo y tarifa',
    formula: '402: ático · P3: 3 dormitorios · 106, 203, 204: 2 dormitorios · el resto: 1 dormitorio',
    nota: 'La tarifa se elige **por el ID del apartamento**, no por el tipo que ponga en su ficha.',
  },
  {
    // pages/Collections.tsx — apartments
    que: 'Desactivar',
    nota: 'Deja de salir en las listas, pero **su dinero sigue viéndose** en Cobros si tiene movimientos ese año.',
  },
  {
    // lib/copia.ts
    que: 'Copia de seguridad',
    nota: 'Hazla cada **15 días**. Lo que se borra por error desaparece y no hay papelera.',
  },
]

export const OPERATIVA_SUBIR: ReglaOperativa[] = [
  {
    // components/PegarWhatsApp.tsx, components/SoltarGastos.tsx
    que: 'Qué se puede subir',
    formula: 'aviso de reserva o de anulación · PDF de un cobro · Excel de gastos',
  },
  {
    que: 'Antes de guardar',
    nota: '**Nada se guarda hasta que lo confirmas**: primero se enseña lo que ha entendido.',
  },
  {
    que: 'Queda apuntado',
    nota: 'Todo lo que subas queda en el Registro **con tu nombre y la fecha**.',
  },
]

export const OPERATIVA_SUBIR_LIMPIEZA: ReglaOperativa[] = [
  {
    // pages/SubirLimpieza.tsx
    que: 'Añade, no reemplaza',
    nota: 'Subir el mismo fichero dos veces **no duplica nada**: lo que ya está se reconoce y se queda igual.',
  },
  {
    que: 'Antes de guardar',
    nota: '**Nada se guarda hasta que pulsas el botón**: primero se enseña lo que va a entrar.',
  },
  {
    // pages/SubirLimpieza.tsx — DESDE
    que: 'Qué años entran',
    formula: 'de 2026 en adelante, salvo que se pidan todos',
    nota: 'Los años anteriores ya están cerrados.',
  },
  {
    // pages/SubirLimpieza.tsx — sinAsignar
    que: 'Líneas sin apartamento',
    nota: 'Las que no dicen a qué piso van **no entran**: se enseñan aparte para revisarlas.',
  },
]
