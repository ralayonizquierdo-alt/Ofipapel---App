// «Cómo funciona» de la app de repartidores: el botón «?» de la cabecera. Texto corto y llano.
// Si cambia cómo funciona la app, se cambia aquí.
export type Apartado = { icono: string; titulo: string; pasos: string[] }

export const OPERATIVA_REPARTIDOR: Apartado[] = [
  {
    icono: '🔑',
    titulo: 'Entrar',
    pasos: [
      'Toca tu nombre, pon tu PIN y pulsa «Entrar».',
      'La primera vez te pedirá un PIN tuyo (4, 6 u 8 cifras). No se lo digas a nadie.',
      'Para cambiarlo más adelante: «Cambiar mi PIN», debajo del teclado.',
    ],
  },
  {
    icono: '📲',
    titulo: 'Tenerla como una app',
    pasos: ['Pulsa el botón 📲 de arriba para guardar Reparto en la pantalla de inicio del móvil. Así entras con un toque, sin buscar el enlace.'],
  },
  {
    icono: '🚚',
    titulo: 'Tu ruta',
    pasos: [
      'Elige tu ruta. Si pone «Mañana», es la del día siguiente: puedes mirarla, pero aún no toca.',
      'Toca la ruta que vas a repartir: al cogerla es tuya y los demás dejan de verla.',
      'Si te equivocas de ruta, ábrela y pulsa abajo «No es mi ruta: soltarla» (solo antes de empezar a marcar).',
      'Las rutas salen solas cuando la oficina las prepara. Si no ves la tuya, avisa en la oficina.',
    ],
  },
  {
    icono: '🕒',
    titulo: 'Fichar',
    pasos: [
      'Se ficha aquí mismo, sin ir a otra app: «Fichar entrada» al empezar.',
      'Durante el día: «Pausa» y «Terminar pausa». En pausa no se puede entregar.',
      'Al acabar, con la furgoneta ya guardada en la nave: «Fichar salida».',
    ],
  },
  {
    icono: '①',
    titulo: 'Antes de salir: comprobar',
    pasos: [
      'Marca la casilla de cada pedido cuyo albarán llevas en la furgoneta.',
      'Puedes ordenar los pedidos arrastrándolos por los puntitos de la izquierda.',
    ],
  },
  {
    icono: '②',
    titulo: 'En la calle: repartir',
    pasos: [
      'Toca un pedido para ver la dirección, llamar al cliente, escribirle por WhatsApp (si tiene móvil) o abrir el mapa.',
      'Si el teléfono no es el bueno, pulsa «No es este: poner otro» y escribe el correcto. La app lo recordará para las próximas entregas a ese cliente.',
      '✅ Entregado: todo bien.',
      '⚠️ Incidencia: lo entregas, pero falta algo, devuelven algo o no corresponde.',
      '❌ No entregado: eliges el motivo. Si vuelves más tarde, apunta el 2.º intento.',
      '¿Te has equivocado? Abre el pedido y pulsa «Deshacer».',
      'Para entregar tienes que haber fichado la entrada.',
    ],
  },
  {
    icono: '💶',
    titulo: 'Cobrar o solo firmar',
    pasos: [
      '«Crédito: solo firmar»: el cliente firma el albarán y no se cobra nada.',
      '«CONTADO: por cobrar» en rojo: hay que cobrar ese importe.',
      '«Pagado»: ya está cobrado, no hay que cobrar.',
      'Junto a la indicación sale la forma de pago de la factura.',
      'Remesa o transferencia: el cliente paga por el banco. No se cobra: solo revisar y firmar.',
      'Bizum: ya está pagada. Solo revisar.',
      'Contado o contra reembolso con importe pendiente: hay que cobrar.',
      'Al pulsar «Entregado» en una de esas, la app pregunta si cobraste. Si no, elige por qué: la factura pasa a administración para el cobro.',
      '«Liquidada» en azul: ya entregaste el dinero de esa factura en administración y allí la han dado por liquidada. No queda nada que hacer con ella.',
    ],
  },
  {
    icono: '🔀',
    titulo: 'Pasar un pedido a un compañero',
    pasos: [
      'Abre el pedido y pulsa «Pasar a otro». Elige su ruta.',
      'A tu compañero le sale un aviso y lo acepta o lo rechaza. Avísale de palabra: tarda hasta medio minuto en salirle.',
      'Si acepta, el pedido desaparece de tu lista, pasa a la suya y lo entrega él. Si rechaza, sigue siendo tuyo.',
      'Mientras no conteste puedes retirar la oferta.',
    ],
  },
  {
    icono: '📶',
    titulo: 'Sin cobertura',
    pasos: ['Sigue marcando con normalidad: se guarda en el móvil y se envía solo cuando vuelve la señal.'],
  },
  {
    icono: '📍',
    titulo: 'Tu ubicación',
    pasos: ['Solo se recoge con una ruta abierta y dentro de tu jornada. Se borra a los 30 días.'],
  },
]

export const OPERATIVA_OFICINA: Apartado[] = [
  {
    icono: '👀',
    titulo: 'Para qué sirve',
    pasos: ['Para ver cómo van todas las rutas sin entrar en el ERP. Solo se mira: aquí no se marca ni se cierra nada.'],
  },
  {
    icono: '🚚',
    titulo: 'Las rutas',
    pasos: [
      '«Preparado, sin salir»: el reparto está generado y nadie ha marcado nada todavía.',
      '«En reparto · quedan 3»: el repartidor va marcando; faltan esos pedidos.',
      '«✔ Listo para cerrar»: no queda ningún pedido pendiente. Ya se puede cerrar en GeminisWin.',
      '«Cerrado»: ya se cerró en GeminisWin. Las rutas cerradas de hoy bajan al final de la lista y desaparecen al día siguiente.',
      'Toca una ruta para ver el detalle factura por factura: entregada, no entregada y por qué, y la hora.',
      '«Liquidada» en azul: el repartidor ya pagó esa factura en administración y en GeminisWin está liquidada.',
      'Al lado va la forma de pago de la factura (remesa, transferencia, contado…): así se ve por qué una factura no se cobró en la entrega.',
      '«Entregado SIN COBRAR» en naranja: el repartidor la entregó y no la cobró; debajo sale el motivo que dio. Sale del reparto y queda para cobrarla desde administración.',
      'Debajo de las rutas, en azul, «POR COBRAR»: tócala y se despliega la lista de facturas ya entregadas que siguen con importe pendiente, con cliente, número de factura e importe.',
      'Van agrupadas: las de contado que el repartidor no cobró (con su motivo), las de contado entregadas y aún sin liquidar, las de transferencia y las de remesa. Cada grupo lleva su total.',
      'Solo salen facturas. Los albaranes a crédito (transferencia o remesa a 30, 60 días…) no aparecen: se facturan después y se cobran a su vencimiento.',
      'Es solo para mirar: el cobro se apunta en GeminisWin y la factura sale de la lista cuando allí queda pagada o liquidada.',
      'Se actualiza sola cada medio minuto.',
    ],
  },
  {
    icono: '💶',
    titulo: 'Caja: cobrar a los repartidores',
    pasos: [
      'Quien entra por «PAGOS» va directo a la Caja y solo ve la Caja. Quien entra por «OFICINA» tiene arriba dos botones, «Rutas» y «Caja»; el móvil recuerda en cuál se quedó.',
      'En un ordenador: abajo del todo está «Abrir WhatsApp Web». Se vincula una vez con el móvil de administración (WhatsApp → Dispositivos vinculados) y los justificantes salen de ese número.',
      'En «Caja» sale cada ruta con el total que ese repartidor tiene que entregar: las facturas de contado que entregó y dice que cobró.',
      'Toca una ruta: verás el total en grande y, debajo, cada factura con cliente, número e importe. Ve tocándolas según las cuentas.',
      'Escribe lo que te entrega y la app te dice si cuadra, falta o sobra.',
      'Justificante, para que el repartidor deje el dinero y se vaya. «WhatsApp»: escribe antes lo que te entrega; se abre WhatsApp con el recibo ya escrito y tú eliges a quién enviarlo. No gasta papel.',
      '«Imprimir»: saca dos copias en una hoja con las facturas, el total y lo entregado. Una se la lleva el repartidor con tu firma y sello; la otra te la quedas con la suya.',
      'Las que el repartidor NO cobró no salen aquí: están en «Rutas», en la tarjeta azul «Por cobrar».',
      'No guarda nada: liquida en GeminisWin como siempre. Al liquidarlas, las facturas salen de la lista.',
    ],
  },
  {
    icono: '🔁',
    titulo: 'De dónde salen los datos',
    pasos: [
      'Los repartos vienen de GeminisWin: un programa los trae cada 5 minutos, de 8:00 a 19:00.',
      'Un reparto aparece aquí cuando se genera en GeminisWin y desaparece cuando se cierra allí.',
      'Si un repartidor pasa un pedido a un compañero, el pedido sigue saliendo en su ruta de origen.',
    ],
  },
  {
    icono: '🔑',
    titulo: 'El PIN de la oficina',
    pasos: ['Se cambia en la pantalla del PIN: «Cambiar mi PIN». Con esta entrada se ven todos los clientes: que lo tengan solo quienes deban.'],
  },
]
