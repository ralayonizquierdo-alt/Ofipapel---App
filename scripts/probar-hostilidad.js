// Prueba del detector de clientes enfadados (netlify/functions/whatsapp-hostilidad.js).
//
//   node scripts/probar-hostilidad.js
//
// Dos listas, y la segunda importa MÁS que la primera:
//   - HOSTILES : mensajes que tienen que saltar.
//   - INOCENTES: clientes contentos y productos de papelería cuyo nombre se
//                parece a un insulto (bolsas de BASURA, LADRÓN de enchufes,
//                cuaderno de UNA ESTRELLA). Ninguno puede saltar.
//
// Cada vez que se añada una expresión al detector, pasar esto ANTES de subirlo:
// el coste de marcar como hostil a un cliente contento es mucho mayor que el de
// que se escape un insulto (se le corta la conversación y se para el bot 24 h).
const { detectarHostilidad, FAMILIAS } = require('../netlify/functions/whatsapp-hostilidad.js');

const HOSTILES = [
  'Sois unos inútiles', 'Parece que hablo con la pared', 'Nadie sabe hacer su trabajo',
  'No tenéis ni idea', 'No dais una', 'Nadie me contesta nunca', 'Pasáis de mí',
  'Me estáis mareando de uno a otro', 'Cada uno me dice una cosa', 'No me escucháis',
  'Me habéis dejado tirado', 'Sigo igual que al principio', 'No hay derecho',
  'Sois unos ladrones', 'Esto es una estafa', 'Publicidad engañosa', 'Esto es un timo',
  'Me habéis cobrado y no ha llegado nada', 'Quiero mi dinero', 'Esto es una tomadura de pelo',
  'Me estáis tomando el pelo', 'Sois unos caraduras', 'Es una vergüenza', 'Esto es un abuso',
  'Sois unos timadores', 'Esto es de juzgado de guardia',
  'Vuestra web es una basura', 'El robot este es imbécil', 'La web da error',
  'El formulario no funciona', 'No me deja pagar', 'El bot no sirve para nada',
  'Estoy en un bucle', 'Siempre me dices lo mismo', 'Quiero una persona no un robot',
  'Menudo bot', 'Este cacharro no entiende nada',
  'Sois unos payasos', 'Menuda mierda de servicio', 'Idiotas', 'Que os den',
  'Sois unos cabrones', 'Tontos del culo', 'Me cago en todo', 'Qué asco de atención',
  'Es lamentable', 'Menuda chapuza', 'Estoy hasta las narices', 'Sois lo peor',
  'De puta pena', 'Manda huevos',
  'Gracias por nada', 'Menos mal que sois los expertos', 'Qué servicio tan rápido',
  'Vaya servicio', 'Enhorabuena por el servicio', 'Esto es de traca', 'Tiene delito',
  'Es de risa', 'Menudo nivel', 'Olé vosotros', 'Lo que faltaba',
  'Os voy a poner a parir en redes sociales', 'Me voy a la Oficina del Consumidor',
  'Pienso hablar con mi abogado', 'Os voy a dejar una reseña de una estrella',
  'Quiero la hoja de reclamaciones', 'No vuelvo a comprar aquí', 'Voy a tomar medidas legales',
  'Lo voy a poner en Google', 'Me lo compro en Amazon', 'No os recomiendo a nadie',
  'Habéis perdido un cliente', 'Es la última vez que os compro', 'Os voy a denunciar',
];

// LO CARO. Clientes normales, contentos, o preguntando por productos cuyo nombre
// se parece a un insulto. Ninguno puede saltar.
const INOCENTES = [
  // Productos de papelería que suenan a insulto
  '¿Tenéis bolsas de basura?', '¿Cuánto cuestan las bolsas de basura industriales?',
  '¿Vendéis papeleras de rejilla?', 'Necesito un cubo de basura para la oficina',
  '¿Tenéis ladrones de enchufe?', 'Busco un ladrón de tres tomas',
  '¿Tenéis papel higiénico?', '¿Vendéis cinta americana?',
  '¿Tenéis tijeras de punta roma?', 'Quiero un cuaderno de una estrella para mi hija',
  '¿Tenéis pegamento en barra?', '¿Vendéis fundas para plastificar?',
  // Clientes contentos (¡el peor falso positivo posible!)
  'Gracias', 'Muchas gracias', 'Muchas gracias, muy amables', 'Gracias por la ayuda',
  'Muchas gracias por atenderme tan rápido', 'Qué rápido, gracias',
  'Sois muy amables', 'Sois la leche, gracias', 'Genial, muchas gracias',
  'Perfecto, gracias', 'Un servicio estupendo', 'Me habéis ayudado mucho',
  'Así da gusto', 'Vuestra web es muy buena', 'Todo correcto, gracias',
  'Qué bien atendéis', 'Sois unos cracks', 'Buenísimo el servicio',
  'Os recomiendo a todo el mundo', 'Siempre compro aquí',
  // Consultas normales, incluidas quejas legítimas de producto
  'El cartucho no funciona, ¿lo puedo cambiar?', 'Quiero devolver un producto defectuoso',
  'La impresora no funciona bien con este tóner', 'Se me ha estropeado la grapadora',
  'Quiero cancelar el pedido', '¿Tenéis tinta para la Epson XP-4200?',
  '¿A qué hora abrís?', 'Quiero hablar con una persona', 'Necesito la factura de mi pedido',
  '¿Me podéis hacer un presupuesto para el colegio?', 'Mi pedido es el 637636, ¿dónde está?',
  '¿Hacéis fotocopias en color?', '¿Cuánto tarda el envío?',
  'Los precios están de risa de baratos', '¿Tenéis algo más barato?',
  'Mi pedido llega tarde, ¿sabéis algo?', 'No me ha llegado el pedido todavía',
];

let fallos = 0;
const noDetectados = [];
for (const m of HOSTILES) {
  const r = detectarHostilidad(m);
  if (!r) { noDetectados.push(m); fallos++; }
}

const falsosPositivos = [];
for (const m of INOCENTES) {
  const r = detectarHostilidad(m);
  if (r) { falsosPositivos.push(`${m}   →  ${r.familia}: "${r.frase}"`); fallos++; }
}

console.log(`Hostiles detectados : ${HOSTILES.length - noDetectados.length}/${HOSTILES.length}`);
if (noDetectados.length) { console.log('  NO detectados:'); noDetectados.forEach((m) => console.log('   ·', m)); }
console.log(`Inocentes limpios   : ${INOCENTES.length - falsosPositivos.length}/${INOCENTES.length}`);
if (falsosPositivos.length) { console.log('  FALSOS POSITIVOS:'); falsosPositivos.forEach((m) => console.log('   ·', m)); }
console.log(`\nExpresiones en total: ${FAMILIAS.reduce((n, f) => n + f.frases.length, 0)} en ${FAMILIAS.length} familias`);
console.log(fallos === 0 ? '\n✔ Sin fallos' : `\n✗ ${fallos} fallos`);
