// Cuando el cliente está enfadado.
//
// Un cliente que insulta, acusa de estafa o amenaza con el abogado NO quiere
// que le conteste un bot. Quiere una persona, y cada respuesta automática más
// que reciba empeora la situación — sobre todo si es alegre, con emoji, o le
// pide que repita algo que ya ha dicho.
//
// Por eso esto NO se le pregunta a la IA: se detecta con reglas fijas. Tres
// razones, y las tres pesan:
//   1. Certeza. Aquí no vale un "casi siempre acierta": el coste de tratar a un
//      cliente furioso como si preguntara por un bolígrafo es perderlo.
//   2. Velocidad. Se resuelve antes de gastar un solo segundo del presupuesto.
//   3. Coherencia. La IA es justamente lo que le está molestando en la mitad de
//      los casos ("el robot este es imbécil"); no tiene sentido que sea ella
//      quien decida si eso es un insulto.
//
// Las seis familias son las que se ven de verdad en atención al cliente, en
// orden de lo explícito a lo camuflado. La última (sarcasmo) es la más difícil
// y la que menos cubre a propósito: ver el comentario de ahí abajo.

// El precio de equivocarse NO es simétrico:
//
//   - No detectar un insulto: el cliente recibe una respuesta de bot de más y
//     se enfada un poco más. Malo, pero recuperable — y el aviso por insistencia
//     que ya existe suele acabar cogiéndolo.
//   - Detectar un insulto donde no lo hay: a un cliente contento se le corta la
//     conversación, se le dice que "una persona revisará su caso", se para el
//     bot 24 horas y se avisa al dueño por email y WhatsApp. Para alguien que
//     solo preguntaba por unas bolsas de basura, es un despropósito.
//
// Así que ante la duda, NO se marca. Todas las expresiones de aquí abajo van
// dirigidas a nosotros de forma inequívoca; ninguna es una palabra suelta que
// pueda aparecer por casualidad. Esto vale sobre todo en una papelería, donde
// media lista de insultos posibles son nombres de productos reales: "bolsas de
// BASURA", "PAPELERA de rejilla", "LADRÓN de tres enchufes".
const FAMILIAS = [
  {
    nombre: 'incompetencia',
    // Ataques a la capacidad del equipo o del sistema para resolver la duda.
    // Incluye la sensación de estar siendo ignorado o mareado de uno a otro, que
    // en la práctica llega con el mismo enfado que un insulto.
    frases: [
      'sois unos inutiles', 'sois inutiles', 'que inutiles sois', 'eres un inutil',
      'panda de inutiles', 'sois un desastre', 'que desastre de atencion',
      'hablo con la pared', 'hablando con la pared', 'como hablar con la pared',
      'nadie sabe hacer su trabajo', 'no sabeis hacer vuestro trabajo',
      'no saben hacer su trabajo', 'no teneis ni idea', 'no tienes ni idea',
      'no os enterais de nada', 'no te enteras de nada', 'no dais una',
      'ya te lo he dicho', 'ya os lo he dicho', 'te lo he dicho tres veces',
      'preguntando lo mismo', 'repitiendo lo mismo', 'llevo tres dias preguntando',
      'es imposible que me entiendan', 'no hay manera de que me entendais',
      // Ni caso: se siente ignorado.
      'no me hacéis ni caso', 'no me haceis ni caso', 'no me hacen ni caso',
      'nadie me contesta', 'nadie me responde', 'nadie contesta',
      'pasais de mi', 'estais pasando de mi', 'me estais ignorando', 'me ignorais',
      'me teneis abandonado', 'me habeis dejado tirado', 'me dejasteis tirado',
      // Mareado de uno a otro.
      'me estais mareando', 'me teneis mareado', 'me teneis mareada',
      'me pasais de uno a otro', 'cada uno me dice una cosa',
      // No se resuelve nada.
      'no resolveis nada', 'no solucionais nada', 'no me habeis resuelto nada',
      'no habeis hecho nada', 'sigo igual que al principio', 'seguimos igual',
      'no me escuchais', 'no me estais escuchando', 'no lees lo que te escribo',
      'no me habeis ayudado en nada', 'no me ayudais',
      'esto no hay quien lo entienda', 'no hay derecho',
      // inglés
      'you are useless', 'youre useless', 'nobody answers', 'no one answers',
      'you never answer', 'you are not listening', 'worst service',
    ],
  },
  {
    nombre: 'fraude',
    // El cliente siente que le han engañado o que le han cobrado sin darle nada.
    // Ojo con "ladrón": en singular es un producto de papelería (el enchufe
    // múltiple), así que solo se acepta en las formas que van claramente
    // dirigidas a nosotros.
    frases: [
      'sois unos ladrones', 'sois ladrones', 'que ladrones', 'unos ladrones',
      'sois unos estafadores', 'estafadores',
      'esto es una estafa', 'es una estafa', 'menuda estafa', 'vaya estafa',
      'me habeis estafado', 'nos habeis estafado', 'me estafaron',
      'esto es un timo', 'es un timo', 'menudo timo', 'vaya timo',
      'publicidad enganosa', 'me habeis enganado', 'nos habeis enganado',
      'esto es un engano', 'es un engano',
      'me habeis cobrado y no', 'habeis cobrado y no', 'me cobrasteis y no',
      'quiero mi dinero', 'devolvedme el dinero', 'devuelvanme mi dinero',
      'donde esta mi dinero', 'quiero que me devolvais el dinero',
      // Tomadura de pelo: la forma más común de decir "me estáis engañando".
      'tomadura de pelo', 'me estais tomando el pelo', 'nos toman el pelo',
      'me habeis tomado el pelo', 'me toman por tonto', 'me toman por tonta',
      // Caradura / vergüenza: acusación moral, no solo económica.
      'sois unos caraduras', 'que cara dura', 'sois unos frescos',
      'es una verguenza', 'que verguenza', 'esto es vergonzoso',
      'es de verguenza', 'verguenza ajena', 'una falta de respeto',
      'esto es de juzgado de guardia', 'esto es ilegal', 'es un fraude',
      'esto es un abuso', 'menudo abuso', 'os aprovechais',
      'timadores', 'sois unos timadores', 'engañabobos',
      // inglés
      'you are thieves', 'this is fraud', 'false advertising', 'i want a refund',
      'you stole my money', 'you charged me and',
    ],
  },
  {
    nombre: 'plataforma',
    // La frustración va contra la herramienta: la web, el formulario, el bot.
    // Muy habitual justo cuando alguien se queda atrapado con un asistente
    // virtual — o sea, exactamente aquí.
    frases: [
      'es una basura', 'menuda basura', 'vaya basura', 'que basura de',
      'es una porqueria', 'menuda porqueria', 'vaya porqueria',
      'la web no funciona', 'vuestra web no funciona', 'la pagina no funciona',
      'no funciona nada', 'no va nada',
      'el robot este', 'este robot', 'puto bot', 'puto robot',
      'el bot es', 'robot imbecil', 'bot imbecil', 'robot inutil', 'bot inutil',
      'contestador automatico', 'maquina de respuestas',
      'no quiero hablar con un robot', 'no quiero hablar con una maquina',
      'estoy harto del bot', 'harta del bot',
      // La web / el formulario.
      // Ojo: nada de "vuestra web es" a secas — encajaría con "vuestra web es
      // muy buena". Todas estas llevan ya la queja dentro.
      'la web es un desastre', 'pagina web horrible', 'web horrible',
      'la web da error', 'vuestra web da error', 'el formulario no funciona',
      'no me deja hacer el pedido', 'no me deja pagar', 'no funciona el formulario',
      'la web va fatal', 'la web va muy mal', 'la web no carga',
      // El bot en concreto.
      'el chat este', 'este chat no', 'el bot no sirve', 'no sirve para nada',
      'esto no sirve para nada', 'menudo bot', 'vaya bot', 'el bot es inutil',
      'asistente virtual de las narices', 'este cacharro',
      'respuestas automaticas', 'respuesta enlatada', 'copia y pega',
      'siempre me dices lo mismo', 'siempre lo mismo', 'estoy en un bucle',
      'esto es un bucle', 'me manda siempre lo mismo',
      'quiero una persona no un robot', 'no eres una persona',
      // inglés
      'stupid bot', 'useless bot', 'your website is broken', 'your website doesnt work',
      'i dont want a robot', 'i want a human not a bot',
    ],
  },
  {
    nombre: 'insulto',
    // Descalificativos directos. Aquí no hay ambigüedad que valga.
    frases: [
      'sois unos payasos', 'sois payasos', 'que payasos',
      'sois unos sinverguenzas', 'sinverguenzas',
      'menuda mierda', 'que mierda de', 'es una mierda', 'de mierda',
      'vete a la mierda', 'iros a la mierda', 'idos a la mierda',
      'que os den', 'que te den',
      'idiotas', 'imbeciles', 'gilipollas', 'subnormales', 'estupidos',
      'cabrones', 'mamones', 'pringados', 'cretinos', 'malnacidos', 'desgraciados',
      'hijos de puta', 'hijos de perra', 'malditos',
      'sois unos capullos', 'que capullos', 'tontos del culo', 'sois tontos',
      'panda de', 'hatajo de', 'atajo de', 'sois lo peor',
      'tocar las narices', 'tocando las narices', 'me teneis harto', 'me teneis harta',
      'no me toques los', 'hasta los cojones', 'hasta las narices', 'hasta el gorro',
      // "Me cago en...": la fórmula más común del enfado en español.
      'me cago en', 'cagüen', 'caguen',
      // Asco / pena.
      'que asco de', 'da asco', 'asqueroso', 'de puta pena', 'puta mierda',
      'lamentable', 'penoso', 'deplorable', 'patetico', 'tercermundista',
      'menuda chapuza', 'que chapuza', 'esto es una chapuza',
      'os odio', 'manda huevos', 'manda narices',
      // inglés
      'you are idiots', 'you idiots', 'fuck you', 'this is bullshit',
      'you are a joke', 'pathetic',
    ],
  },
  {
    nombre: 'amenaza',
    // Amenazas de represalia: redes, consumo, abogado, reseña. Casi nunca llevan
    // palabrota, y son la máxima expresión de hostilidad — el cliente ya ha
    // dado la conversación por perdida.
    frases: [
      'poner a parir', 'poneros a parir', 'os voy a poner a parir',
      'lo voy a poner en redes', 'voy a poner en redes', 'lo contare en redes',
      'lo voy a contar en redes', 'os voy a sacar en redes',
      'oficina del consumidor', 'oficina municipal de informacion al consumidor',
      'hoja de reclamaciones', 'libro de reclamaciones',
      'mi abogado', 'con un abogado', 'acciones legales', 'via judicial',
      'os denuncio', 'voy a denunciar', 'os voy a denunciar', 'demanda judicial',
      'resena de una estrella', 'una estrella en google', 'mala resena',
      'os voy a valorar', 'os pondre una resena',
      'no vuelvo a comprar', 'no compro mas aqui', 'no volvere a comprar',
      'perdeis un cliente', 'habeis perdido un cliente', 'habeis perdido una venta',
      // Consumo / vía legal.
      'oficina de consumo', 'denunciar a consumo', 'reclamacion a consumo',
      'inspeccion de consumo', 'servicio de consumo', 'juzgado', 'demandar',
      'os llevo a juicio', 'tomare medidas legales', 'medidas legales',
      'derechos del consumidor', 'ley de consumidores',
      // Reseñas y redes.
      'resena negativa', 'os voy a poner una resena', 'os pondre una mala',
      // "una estrella" a secas NO: hay cuadernos y pegatinas que se llaman así
      // ("un cuaderno de una estrella para mi hija" saltaba como amenaza).
      'una estrella en google', 'os pongo una estrella', 'valoracion de una estrella',
      'una sola estrella', 'os voy a puntuar', 'lo pongo en google',
      'lo voy a poner en google', 'en google reviews', 'en trustpilot',
      'lo voy a contar en facebook', 'lo pongo en instagram',
      'voy a avisar a todo el mundo', 'se lo voy a decir a todo el mundo',
      'no os recomiendo', 'no os voy a recomendar', 'no lo recomiendo a nadie',
      'os voy a hacer publicidad de la mala',
      // Se va a la competencia.
      'me voy a la competencia', 'compro en otro sitio', 'comprare en otro sitio',
      'me lo compro en amazon', 'lo pido en amazon', 'mejor en amazon',
      'hay mas tiendas', 'no sois los unicos',
      'es la ultima vez que', 'no me vereis mas',
      // inglés
      'i will leave a bad review', 'one star', 'my lawyer', 'legal action',
      'consumer rights', 'never buying again', 'i will report you',
    ],
  },
  {
    nombre: 'sarcasmo',
    // La familia más difícil, y la que menos se cubre A PROPÓSITO.
    //
    // El sarcasmo se construye con palabras amables ("gracias", "menos mal",
    // "qué rápido"), así que cualquier regla suelta sobre ellas convertiría a
    // todos los clientes educados en clientes hostiles. Solo entran frases
    // hechas completas que NADIE dice en serio.
    //
    // Se queda fuera lo que no se puede distinguir sin entender el tono ("muchas
    // gracias por la ayuda, se nota"). Preferimos que se escape un sarcasmo a
    // cortarle la conversación a quien de verdad está dando las gracias.
    frases: [
      'gracias por nada',
      'menos mal que sois los expertos', 'menos mal que sois expertos',
      'menos mal que sois profesionales',
      'vaya servicio', 'menudo servicio', 'valiente servicio',
      'que servicio tan rapido', 'que servicio mas rapido',
      'muy profesional todo', 'muy profesionales si señor',
      'enhorabuena por el servicio', 'os felicito por el servicio',
      'seguid asi', 'sigue asi campeon',
      'gracias por la nada', 'muchas gracias por nada',
      'menos mal que estais ahi', 'menos mal que os tengo',
      'que eficiencia', 'que rapidez la vuestra', 'menudo nivel', 'vaya nivel',
      'esto es de traca', 'de traca', 'tiene delito', 'tiene guasa',
      'es de risa', 'esto es de risa', 'para nota', 'lo que faltaba',
      'ole vosotros', 'ole con vosotros', 'toma ya',
      'no teneis precio', 'sois unos cracks si',
      // inglés
      'thanks for nothing', 'great service indeed', 'what a service',
    ],
  },
];

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// ¿Está el cliente enfadado, y de qué manera?
//
// Devuelve la familia y la frase concreta que ha saltado (para poder decírselo
// al dueño en el aviso: "cliente molesto — amenaza: 'mi abogado'"), o null si
// el mensaje no tiene nada de hostil.
//
// Se queda con la coincidencia MÁS LARGA de todas las familias, igual que
// matchFaqRule: si un mensaje trae "es una estafa" y "gilipollas", manda la más
// específica, y en el aviso al dueño sale la frase que mejor describe el caso.
function detectarHostilidad(text) {
  const plano = normalizar(text);
  if (!plano) return null;

  let mejor = null;
  for (const familia of FAMILIAS) {
    for (const frase of familia.frases) {
      if (!plano.includes(frase)) continue;
      if (!mejor || frase.length > mejor.frase.length) {
        mejor = { familia: familia.nombre, frase };
      }
    }
  }
  return mejor;
}

// Cómo se le contesta a alguien que acaba de llamarnos inútiles.
//
// Cuidado con cada palabra de aquí, porque se lee en el peor momento posible:
//   - Sin "¡Hola!" ni emoji. Un saludo alegre delante de un insulto suena a
//     burla, y es justo lo que enciende más al cliente.
//   - Sin discutir ni justificarse. No es el trabajo del bot defender a la
//     tienda; es apartarse y dejar paso a una persona.
//   - Sin pedirle que repita nada. La mitad de estos mensajes vienen de haber
//     tenido que repetir las cosas ya.
//   - Sin prometer plazos que no controlamos.
//
// Y se dice EXPRESAMENTE que deja de contestar el bot: es lo que el cliente
// está pidiendo a gritos, y saberlo le baja el enfado aunque la persona tarde
// un rato en llegar.
const MOLESTO_ABIERTO = (telefono, horario) =>
  `Siento que hayamos llegado a esto. Dejo de contestarte yo: aviso ahora mismo a una persona del equipo para que revise tu caso y te conteste personalmente. Si prefieres resolverlo por teléfono, llámanos al ${telefono} (${horario}).`;

const MOLESTO_CERRADO = (telefono, horario) =>
  `Siento que hayamos llegado a esto. Dejo de contestarte yo y le paso tu conversación a una persona del equipo. Ahora mismo estamos cerrados (${horario}), así que te contestará en cuanto abramos. Si lo prefieres, también puedes llamarnos al ${telefono} en ese horario.`;

function mensajeClienteMolesto() {
  const { STORES, isWithinBusinessHours } = require('./whatsapp-agent-config');
  const telefono = STORES[0].phone;
  const horario = STORES[0].hours;
  return isWithinBusinessHours()
    ? MOLESTO_ABIERTO(telefono, horario)
    : MOLESTO_CERRADO(telefono, horario);
}

// Con qué se marca en el historial, para que el panel pueda reconocerlas después.
//
// Se compara por esta marca y no por el texto de la respuesta porque en el
// historial la respuesta va precedida de la familia ("[Cliente molesto —
// amenaza] Siento que..."), así que una comparación por igualdad nunca casaría.
// Además así el panel sigue reconociéndolas aunque algún día se reescriba el
// mensaje que se le manda al cliente.
const MARCA_MOLESTO = '[Cliente molesto';

// Para que el panel marque estas conversaciones como "requiere atención" igual
// que las de escalado normal.
function esHistorialMolesto(contenido) {
  return String(contenido || '').startsWith(MARCA_MOLESTO);
}

module.exports = {
  detectarHostilidad,
  mensajeClienteMolesto,
  esHistorialMolesto,
  MARCA_MOLESTO,
  FAMILIAS,
};
