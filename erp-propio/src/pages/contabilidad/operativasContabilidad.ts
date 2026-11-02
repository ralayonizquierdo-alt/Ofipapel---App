// Operativa de cada pantalla de Contabilidad que no tiene la suya propia (Luis: «toda pantalla con su
// Operativa»). La enseña el botón Operativa de la barra de Empresa / Ejercicio, junto a la del
// ejercicio. Se busca por la ruta (/contabilidad/<clave>). Las pantallas con Operativa propia
// (Conciliación, Remesas, Balance de Situación, Empresas) no están aquí.

import type { BloqueOperativa } from '../../components/gw/GwOperativa'

export const OPERATIVAS_CONTABILIDAD: Record<string, BloqueOperativa[]> = {
  diario: [
    {
      titulo: 'Diario de Asientos',
      pasos: [
        'Elige las fechas y el estado (Correctos, Con errores, Todos) y pulsa Actualizar. Puedes buscar por nº de asiento, cuenta, concepto o documento.',
        '«Nuevo»: asiento manual. Escribe la fecha, la tienda (si es de una tienda concreta) y el concepto y añade apuntes (cuenta, Debe o Haber). No se guarda si no cuadra.',
        'Para cambiar un asiento: selecciónalo y «Modificar» (o doble clic). Se guarda como asiento nuevo y el anterior queda anulado, para que quede rastro.',
        '«Anular»: lo deja anulado (no se borra). «Renumerar»: vuelve a numerar por fecha los asientos correctos del ejercicio.',
        '«Excel (CSV)»: el diario de las fechas elegidas.',
      ],
    },
    {
      titulo: 'Bueno es saber',
      notas: [
        'Los asientos automáticos (ventas, facturas, cobros, pagos, caja) se crean en «Generar Asientos Automáticos».',
        'En un ejercicio cerrado (🔒) solo se puede consultar.',
      ],
    },
    {
      titulo: 'Lo que el programa no deja hacer (y cómo hacerlo bien)',
      notas: [
        'Modificar a mano un asiento automático (de una venta, factura, cobro…): corrige el documento de origen y el asiento se rehace solo; o anúlalo para que se vuelva a generar; o haz un asiento manual de ajuste con la diferencia.',
        'Grabar o anular con fecha de un mes cerrado: pon la fecha de hoy y en el concepto a qué mes corresponde; si tiene que ir en ese mes, un super administrador lo reabre (Control y Firmas → Meses) con el motivo.',
        'Cambiar o anular un asiento conciliado con el banco: primero deshaz la conciliación en Conciliación Bancaria.',
        'Asiento manual de 3.000 € o más: no se graba en el momento; queda «pendiente de segunda firma» hasta que lo aprueba otro super administrador (Control y Firmas). Vale para todos, también los super administradores.',
        'Todo queda en la auditoría: los asientos con fecha atrasada, los manuales en caja, bancos o clientes y las anulaciones avisan a los super administradores (globo 🛡️).',
      ],
    },
  ],
  control: [
    {
      titulo: 'Asientos por firmar',
      pasos: [
        'Aquí salen los asientos manuales de 3.000 € o más que esperan la segunda firma. Pulsa uno para ver sus apuntes.',
        '«Aprobar» lo graba en el Diario. «Rechazar» pide el motivo, que verá quien lo hizo.',
        'Quien lo hizo puede «Retirar» el suyo mientras esté pendiente.',
      ],
      notas: [
        'Nadie puede aprobar un asiento suyo, tampoco los super administradores: lo aprueba otro.',
        'El importe se cambia en Archivo → Parámetros → Contabilidad (cambiarlo avisa a los super administradores).',
      ],
    },
    {
      titulo: 'Meses',
      pasos: [
        'Cuando un mes esté revisado (IGIC presentado, banco cuadrado), pulsa «Cerrar».',
        'Si hay que tocarlo, «Reabrir…» pide el motivo. Ciérralo otra vez al terminar.',
      ],
      notas: ['Los asientos automáticos de un mes cerrado se siguen generando, pero salen en el globo 🛡️ para revisarlos.'],
    },
    {
      titulo: 'Integridad',
      pasos: ['Pulsa «Comprobar integridad» de vez en cuando (por ejemplo, cada mes al cerrar).'],
      notas: [
        'Cada asiento lleva una huella encadenada con la del anterior, como VeriFactu. Si alguien toca la base de datos por fuera del programa, aquí sale el asiento afectado.',
      ],
    },
  ],
  pendientes: [
    {
      titulo: 'Asientos pendientes / con errores',
      pasos: [
        'Aquí salen los asientos automáticos que no se pudieron hacer bien: no cuadran, falta la cuenta de un cliente o proveedor, la cuenta no existe en el Plan…',
        'Lee el error de cada uno, corrige la causa (p. ej. da de alta la cuenta en el Plan de Cuentas o pon la cuenta en la ficha del cliente) y pulsa «Rehacer los que tienen errores».',
        'Si es un asiento manual, ábrelo con doble clic, corrígelo y guárdalo.',
      ],
    },
    { titulo: 'Bueno es saber', notas: ['Un ejercicio no se puede cerrar mientras tenga asientos con error.'] },
  ],
  generar: [
    {
      titulo: 'Generar asientos automáticos',
      pasos: [
        'Elige el periodo y los documentos a contabilizar (ventas/tickets, facturas, facturas de proveedor, cobros, pagos, caja).',
        'Tickets de contado: un asiento por día y tienda o uno por ticket.',
        '«Si ya hay asientos del periodo»: dejar los que hay, rehacer solo los que tienen errores o rehacer todos (se anulan y se vuelven a crear).',
        'Pulsa «Generar asientos». Abajo ves cuántos salieron correctos y cuántos con errores; estos últimos se arreglan en «Asientos Pendientes / con Errores».',
      ],
    },
    {
      titulo: 'Bueno es saber',
      notas: [
        'Solo se hace en la empresa principal (Ofipapel): las demás empresas del grupo llevan asientos manuales.',
        'Un documento nunca se contabiliza dos veces: lo ya contabilizado se salta.',
        'Las cuentas que se usan se configuran en «Configuración Contable».',
      ],
    },
  ],
  'plan-cuentas': [
    {
      titulo: 'Plan de Cuentas',
      pasos: [
        'Busca por código, descripción o NIF y filtra por grupo o nivel. Doble clic en una cuenta abre su Mayor.',
        '«Nueva cuenta»: escribe el código (las subcuentas con la longitud configurada, p. ej. 8 dígitos), la descripción y el tipo, y guarda.',
        'Para dar de baja una cuenta, desmarca «Cuenta activa» (no se borra). «Ver bajas» las enseña.',
      ],
    },
    {
      titulo: 'Bueno es saber',
      notas: [
        'Las subcuentas de clientes (430…) y proveedores (400…/410…) se crean solas al contabilizar sus documentos.',
        'Pon el NIF en las cuentas de terceros: lo usan el modelo 347 y la exportación a la gestoría.',
      ],
    },
  ],
  mayor: [
    {
      titulo: 'Mayor / Extracto de cuenta',
      pasos: [
        'Escribe la cuenta (o el principio, p. ej. 430 para todos los clientes) y las fechas.',
        'Sale el saldo anterior y cada apunte con su contrapartida y el saldo acumulado.',
      ],
    },
  ],
  'sumas-saldos': [
    {
      titulo: 'Sumas y Saldos',
      pasos: [
        'Elige las fechas y el nivel (dígitos): 3 para cuentas, 8 para subcuentas.',
        'Arriba a la derecha comprueba que el total Debe = total Haber. Doble clic en una cuenta abre su Mayor.',
      ],
    },
  ],
  'perdidas-ganancias': [
    {
      titulo: 'Pérdidas y Ganancias',
      pasos: ['Elige las fechas: gastos (grupo 6) e ingresos (grupo 7) con su total y el resultado (beneficio o pérdida).'],
    },
  ],
  'resultados-tiendas': [
    {
      titulo: 'Resultados por Tienda',
      pasos: [
        'Elige las fechas: por columnas cada tienda, por filas las cuentas de ingresos (7) y gastos (6), y abajo el resultado de cada tienda.',
        'La tienda es la del ticket, factura o cobro que hizo el asiento. En los asientos manuales se elige en el campo «Tienda» del asiento.',
        'Lo que no tiene tienda (gastos generales: alquiler de oficinas, asesoría…) sale en «Sin tienda».',
      ],
    },
  ],
  'libros-igic': [
    {
      titulo: 'Libros registro de IGIC',
      pasos: [
        'Elige libro (facturas emitidas o recibidas) y periodo. Sale cada factura con su base, tipo y cuota de IGIC.',
        'Al final, el resumen por tipo de IGIC. Se saca a Excel para la asesoría.',
      ],
    },
  ],
  'modelo-420': [
    {
      titulo: 'Modelo 420 (IGIC trimestral)',
      pasos: [
        'Elige ejercicio y trimestre: IGIC devengado (ventas) por tipo, IGIC deducible (compras) y el resultado a ingresar o a compensar.',
        'Son los datos para que la asesoría presente el modelo; compruébalos con los libros de IGIC.',
      ],
    },
  ],
  'modelo-425': [
    {
      titulo: 'Modelo 425 (resumen anual de IGIC)',
      pasos: ['Elige el ejercicio: resumen anual por tipo y el resultado de cada trimestre (debe coincidir con los 420 presentados).'],
    },
  ],
  'modelo-347': [
    {
      titulo: 'Modelo 347',
      pasos: [
        'Elige el ejercicio: clientes y proveedores con operaciones de más de 3.005,06 € en el año, por trimestres.',
        'Revisa que todos tienen NIF (en rojo los que no). Se saca a Excel para la asesoría.',
      ],
    },
  ],
  tesoreria: [
    {
      titulo: 'Previsión de Tesorería',
      pasos: [
        'Cobros de clientes y pagos a proveedores pendientes, ordenados por vencimiento, con el saldo previsto día a día.',
        'El saldo inicial es el de caja y bancos (570 + 572). «Incluir vencidos» añade lo que ya debió cobrarse o pagarse.',
      ],
    },
  ],
  exportar: [
    {
      titulo: 'Exportar a la Gestoría',
      pasos: [
        'Elige el periodo y descarga los ficheros (CSV que abre Excel): Diario, Subcuentas y libros de IGIC.',
        'Antes avisa si hay asientos con error en el periodo: corrígelos primero.',
      ],
    },
    { titulo: 'Bueno es saber', notas: ['Falta confirmar con la gestoría su programa y su plantilla de importación para dejar el formato exacto.'] },
  ],
  configuracion: [
    {
      titulo: 'Configuración Contable',
      pasos: [
        'Cuentas por defecto que usan los asientos automáticos: ventas (700), compras (600), caja (570), bancos (572), tarjetas, transportes, redondeo…',
        'Subcuentas de clientes y proveedores: raíz (430, 400, 410) y longitud (normalmente 8 dígitos).',
        'IGIC por tipo: la cuenta de IGIC repercutido (477) y soportado (472) de cada tipo.',
        'Generación automática: tickets de contado por día y tienda o uno por ticket, tolerancia de redondeo y «No contabilizar antes de».',
        'Pulsa Guardar. Si cambias cuentas, puedes rehacer los asientos del periodo en «Generar Asientos Automáticos».',
      ],
    },
  ],
}

/** Clave de la pantalla a partir de la ruta (/contabilidad/plan-cuentas → plan-cuentas). */
export const claveContabilidad = (pathname: string) => pathname.split('/')[2] ?? ''
