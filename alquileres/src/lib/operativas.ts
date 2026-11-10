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

/**
 * Va al final de la Operativa de todas las pantallas: el botón está en todas.
 * components/BotonVolver.tsx, lib/volver.ts
 */
export const VOLVER: ReglaOperativa = {
  que: '← Volver',
  nota: 'Abajo en el centro, en cuanto se ha pasado de una pantalla a otra. **Deshace el camino paso a paso** y '
    + 'cada pantalla vuelve **como se dejó**: los mismos filtros y, si había una ficha abierta, abierta otra vez.',
}

/** También en todas: las ventanas (fichas, formularios) se amplían. components/ui/Modal.tsx */
export const VENTANAS: ReglaOperativa = {
  que: 'Ventanas',
  nota: 'Se mueven **arrastrando el título**. Se **redimensionan tirando de la esquina** de abajo a la derecha '
    + '(las rayitas). El botón **⤢** de arriba la **amplía** a casi toda la pantalla; otra vez, y vuelve a su tamaño.',
}

// components/PegarWhatsApp.tsx — cargado, yaCargadas, cobroExistente
const ENTRADA_RAPIDA: ReglaOperativa = {
  que: 'Entrada rápida',
  formula: 'OK. RESERVA (verde) · OK. COBRO (azul) · OK. ANULADA (rojo)',
  nota: 'Al cargar algo bien, lo dice **dentro de la caja** hasta lo siguiente. Si lo pegado **ya estaba cargado** '
    + '(misma reserva: piso, entrada y salida; mismo cobro: importe y fecha), sale **«¡¡¡YA EXISTE ESTE '
    + 'REGISTRO!!!»** con el que ya hay, y **no se carga dos veces**.',
}

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

// lib/dateUtils.ts — getSeason(); lib/priceCalc.ts — buscaTarifa()
const TEMPORADA: ReglaOperativa = {
  que: 'Temporada y año de la tarifa',
  formula: 'los de la fecha de ENTRADA, igual que el tramo y la oferta',
  nota: 'Se usa la tarifa **del año de entrada**; solo si ese año aún no tiene tarifa, la del año siguiente.',
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

// lib/precioReserva.ts — estadoPrecio()
const PRECIO_DE_LA_RESERVA: ReglaOperativa = {
  que: '¿De dónde sale el importe?',
  formula: '✅ de la tarifa · 🔵 precio pactado (con su motivo) · ⚠️ no cuadra con la tarifa',
  nota: 'Se rehace la cuenta con la tarifa y se compara con el importe guardado. **⚠️ quiere decir que no '
    + 'consta como pactado**: o se corrige la reserva o se anota el motivo. **Menos de 1 € de diferencia es '
    + 'redondeo** y no avisa. El ⚠️ **se pincha** y abre la ficha con la tarifa. En la **ventana de Pagos** de cada '
    + 'reserva están las dos cuentas y los botones para **ver la tarifa, anotar el pactado o corregir**. No se compara el Arenal (lo pone '
    + 'SOC) ni las estancias que **acabaron antes de 2026**; las que entran en 2025 y siguen en 2026, sí.',
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
  ENTRADA_RAPIDA,
  {
    // lib/conformidades.ts
    que: 'Conformidades por enviar',
    formula: 'reserva pegada en la Entrada rápida + 2 horas',
    nota: 'A las **2 horas** de entrar una reserva (salvo las de Airbnb) sale aquí y como **globo rojo en el icono '
      + 'de Alquileres del hub**. «Preparar correo» abre su conformidad: «Enviar por correo» y **se quita sola**. '
      + 'El globo del hub se pone al día al abrir Alquileres en ese ordenador.',
  },
  {
    // components/CorregirTarifaAno.tsx, lib/tarifaAnoSiguiente.ts
    que: 'Tarifa del año siguiente',
    nota: 'Hasta el 06/11/2026 algunas reservas se calcularon con la tabla de Precios del **año siguiente**. El aviso '
      + 'ámbar las enseña con su **importe correcto** y lo ya cobrado; se corrigen **solo las que dejes marcadas** '
      + '(el pendiente se ajusta y queda en el Registro). Las de precio pactado no salen.',
  },
  PRECIO_DE_LA_RESERVA,
  {
    // pages/Dashboard.tsx — AvisoRojo
    que: 'Avisos en rojo',
    formula: 'reservas anuladas con cobros · cobros vencidos · importes que no cuadran con la tarifa',
    nota: 'Van **por apartamento**, en el orden de la casa. **Se pinchan** y abren el cuadre de la estancia para '
      + 'corregirlo. **Se van solos** en cuanto queda corregido.',
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
  PRECIO_DE_LA_RESERVA,
  {
    // lib/solapes.ts
    que: 'Reservas que se pisan',
    formula: 'mismo apartamento y al menos una noche en común, de hoy en adelante',
    nota: 'Una salida y una entrada **el mismo día NO se pisan**. Lo de años pasados no se avisa.',
  },
  {
    // components/PegarWhatsApp.tsx — anular
    que: 'Anulaciones',
    nota: 'Anular **no borra nada**: la reserva se queda con sus cobros y su historial, y sale del planning. '
      + 'Si tenía dinero cobrado, **avisa en rojo en el Dashboard** hasta que se devuelve o se pasa a otra reserva '
      + 'y se pulsa **«Ya está resuelto»** en su ficha (desde 2026).',
  },
  {
    // components/PegarWhatsApp.tsx
    que: 'Pegar desde WhatsApp',
    nota: '**Nada se guarda sin enseñarlo antes.** Entiende avisos de reserva, anulaciones y justificantes de cobro.',
  },
  ENTRADA_RAPIDA,
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
    // lib/mesContable.ts
    que: 'Mes del cobro',
    formula: 'cada pago cuenta en el mes de la reserva que paga, no en el de la fecha del pago',
    nota: 'La reserva de diciembre pagada el 5 de enero **cuenta en diciembre**, como lo declara la asesoría. '
      + 'Los cobros del Excel, en su mes contable.',
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
      + 'abrir la ficha, imprimirla o enviarla a la agencia **por correo o por WhatsApp**. Por correo, **el cuadro va '
      + 'copiado**: en el correo, clic **en el cuerpo** (no en «Para») y **Ctrl+V**. **La tarifa en azul '
      + 'lleva a Precios**. Al imprimir sale **solo la ficha**, en una hoja. Si se abre la reserva desde la ficha, '
      + '**al cerrarla se vuelve a la ficha**.',
  },
  {
    // components/FichaCuadre.tsx — modelo 'conformidad'
    que: 'Conformidad de la reserva',
    nota: 'Segunda pestaña de la ficha, para mandar a la agencia **cuando envía una reserva**: precio, noches y '
      + 'desglose por mes, **sin cobros, resto ni diferencia** y sin la comparación con la tarifa. Si el precio es '
      + 'pactado, dice **el importe, la fecha y con quién** se pactó. Lleva un **mensaje para la agencia que se '
      + 'queda guardado** hasta que se cambie (en este ordenador) y, dos líneas más abajo, **NOTAS** de esa reserva, '
      + 'que **no se guardan**.',
  },
  PRECIO_DE_LA_RESERVA,
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
    // lib/mesContable.ts
    que: 'Mes de cada ingreso',
    formula: 'el mes de la reserva que paga, no el de la fecha del pago',
    nota: 'Así **el total del año cuadra con la asesoría**: la reserva de diciembre pagada en enero es de ese año.',
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
    // components/FichaCuadre.tsx, pages/Reservations.tsx — anotaVolcado
    que: 'También',
    formula: 'correo o WhatsApp a la agencia · precio pactado · anulación resuelta · reserva a mano',
    nota: 'Las reservas dadas de alta, cambiadas (**qué cambió y de qué a qué**) o borradas a mano. Del correo y el '
      + 'WhatsApp se apunta que **se preparó**: la aplicación no sabe si al final se le dio a Enviar.',
  },
  {
    // components/PegarWhatsApp.tsx — texto
    que: 'Lo pegado',
    nota: 'De lo pegado en la Entrada rápida se guarda **la línea de cada reserva o anulación**, tal cual '
      + '(«ALAYON 104: entra… y sale…»), **sin saludos**, debajo del resumen. Lo pegado antes del 08/11/2026 no la tiene.',
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
  ENTRADA_RAPIDA,
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
