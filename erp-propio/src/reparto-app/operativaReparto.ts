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
      'Toca una ruta para ver el detalle factura por factura: entregada, no entregada y por qué, y la hora.',
      '«Liquidada» en azul: el repartidor ya pagó esa factura en administración y en GeminisWin está liquidada.',
      'Al lado va la forma de pago de la factura (remesa, transferencia, contado…): así se ve por qué una factura no se cobró en la entrega.',
      'Se actualiza sola cada medio minuto.',
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
