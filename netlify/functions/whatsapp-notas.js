// LO QUE SE LE ENSEÑA AL BOT.
//
// Por qué existe esto, y por qué no valía lo que había:
//
// Hasta ahora "enseñarle algo al bot" era una sola cosa: un ALIAS de búsqueda
// ("folios" -> "papel fotocopia"). Eso arregla una búsqueda que no encuentra
// nada, y nada más. No sirve para enseñarle un HECHO, que es lo que de verdad
// hace falta la mayoría de las veces:
//
//   "Las cajas registradoras de siempre ya no son legales: con Verifactu tienen
//    que estar conectadas con Hacienda, así que vendemos las homologadas."
//   "Cuando alguien pide papel A4 normal, el que lleva es el Mattio de oferta."
//
// Un alias no puede decir eso. Y meterlo a mano en el prompt significa tocar
// código y desplegar cada vez que el negocio cambia — que es justo lo que hace
// que al final no se actualice nunca.
//
// Así que una nota es texto libre con unas palabras que dicen CUÁNDO viene a
// cuento. Va al prompt de la IA, y manda sobre lo que la IA crea saber.
//
// Hay dos orígenes, y los dos se comportan igual:
//   - NOTAS_DE_CASA: escritas aquí. Son las que no deben depender de que la
//     base de datos esté viva ni de que nadie las vuelva a escribir.
//   - Las del panel: las añade una persona desde "Aprendizaje del bot" y viven
//     en Upstash. Son las que puede cambiar quien atiende, sin tocar código.

// Cuántas caben y cuánto ocupan. El prompt entero se manda en CADA mensaje, así
// que esto no es decoración: son euros por mensaje y segundos de respuesta.
const MAX_NOTAS = 40;
const MAX_LARGO_NOTA = 700;

// Palabras demasiado cortas para servir de pista ("de", "a4" sí vale, "el" no).
const MIN_LARGO_PALABRA = 3;

const NOTAS_DE_CASA = [
  {
    id: 'casa:registradoras-verifactu',
    tema: 'caja registradora, cajas registradoras, registradora, registradoras, verifactu, tpv',
    texto:
      'Las cajas registradoras de toda la vida YA NO SON LEGALES. Con la nueva normativa (Verifactu), que entra en vigor en enero, el equipo tiene que estar preparado para Verifactu y conectado con Hacienda, así que los modelos antiguos están descatalogados y no los vendemos. Si alguien pregunta por una caja registradora, explícale eso y ofrécele los modelos homologados por Hacienda, por ejemplo la SAM4S ZETA A50 con cajón: https://ofipapel.net/producto/caja-registradora-sam4s-zeta-a50-cajon/ . Nunca le ofrezcas ni le des por buena una registradora antigua, aunque te aparezca en el catálogo.',
  },
  {
    id: 'casa:papel-a4-de-batalla',
    tema: 'papel, folios, folio, a4, din a4, fotocopia',
    texto:
      'El papel A4 "normal", "corriente", "económico", "de oficina", "de batalla" o "del de todos los días" es el PAPEL Fotocopia A-4 80gr MATTIO, el de la oferta (paquete de 500 hojas): https://ofipapel.net/producto/papel-fotocopia-a-4-80gr-mattio-oferta-pv-500-h/ . Ése es el que hay que ofrecer por defecto cuando no piden nada especial: dile el precio que veas en los resultados del catálogo y pásale el enlace directamente, sin marearle preguntando entre marcas. Tiene descuento por cantidad, así que ese precio es por paquete y baja al llevar más. El otro papel con oferta por cantidad es el Paperline. Solo ofrece otros papeles si el cliente pide otro gramaje, otro tamaño o una marca concreta.',
  },
];

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Las palabras de "tema" van separadas por comas, pero la gente también las
// separa con saltos de línea o punto y coma. Se admiten las tres.
function palabrasDelTema(tema) {
  return normalizar(tema)
    .split(/[,;\n]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= MIN_LARGO_PALABRA);
}

// ¿Esta nota viene a cuento de lo que acaba de escribir el cliente?
//
// Se compara sobre el texto normalizado y por PALABRA COMPLETA. Sin eso,
// "papel" encajaría dentro de "papelería" y "tpv" dentro de cualquier
// referencia con esas tres letras seguidas.
function notaAplica(texto, nota) {
  const t = normalizar(texto);
  if (!t) return false;
  return palabrasDelTema(nota?.tema).some((palabra) => {
    const escapada = palabra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escapada}([^a-z0-9]|$)`).test(t);
  });
}

function notasQueAplican(texto, notas = []) {
  return notas.filter((n) => notaAplica(texto, n));
}

// LA NOTA QUE EL EQUIPO ESCRIBE SOBRE UN CLIENTE CONCRETO, tratada como una nota
// más — no para meterla otra vez en el prompt (ya va en la ficha del cliente),
// sino para lo otro que hacen las notas: apartar la respuesta fija.
//
// Ése fue el fallo real, dos veces con el mismo cliente (23/9/2026). Alguien
// había apuntado en su ficha "ha pedido una plastificadora y está esperando a
// que llegue". El cliente preguntó si se la llevaban hoy o mañana... y se llevó
// el precio de los plastificados y el teléfono de Reprografía, porque una
// respuesta fija contesta y corta el turno: la IA, que sí tenía la nota delante,
// no llegó a mirarla siquiera. Escribir una nota y que el bot la ignore es peor
// que no tener notas.
//
// Las palabras clave salen de la propia nota: si el cliente repite algo que
// alguien se molestó en apuntar sobre él, esa conversación no la arregla un
// texto escrito de antemano.
const PALABRAS_VACIAS_FICHA = new Set([
  'siempre', 'tambien', 'cuando', 'porque', 'entonces', 'aunque', 'cliente',
  'clientes', 'pedido', 'pedidos', 'nuestro', 'nuestra', 'mientras', 'todavia',
]);
const MIN_LARGO_PALABRA_FICHA = 6;

function notaDeFicha(ficha) {
  const texto = String(ficha?.notas || '').trim();
  if (!texto) return null;
  const tema = [
    ...new Set(
      normalizar(texto)
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((p) => p.length >= MIN_LARGO_PALABRA_FICHA && !PALABRAS_VACIAS_FICHA.has(p))
    ),
  ].join(', ');
  return tema ? { id: 'ficha', tema, texto } : null;
}

// Una nota sin tema no se descarta: se entiende como "esto vale siempre". Pero
// tampoco se marca como que aplique a un mensaje concreto, que sería mentira.
function todasLasNotas(notasDelPanel = []) {
  return [...NOTAS_DE_CASA, ...notasDelPanel].slice(0, MAX_NOTAS);
}

// El trozo que se le mete al prompt. Devuelve cadena vacía si no hay nada que
// contar, para no ensuciar el prompt con un apartado vacío.
//
// Las que vienen a cuento del mensaje de ahora se marcan, pero se mandan TODAS.
// Marcar no es filtrar a propósito: las palabras del tema son una pista, no una
// garantía, y un cliente puede preguntar por "la máquina de los tickets" sin
// decir "caja registradora" ni una vez.
function bloqueDeNotas(notas = [], textoDelCliente = '') {
  if (!notas.length) return '';
  const lineas = notas
    .map((n) => {
      const texto = String(n?.texto || '').trim().slice(0, MAX_LARGO_NOTA);
      if (!texto) return null;
      const marca = notaAplica(textoDelCliente, n) ? '[VIENE A CUENTO AHORA] ' : '';
      return `- ${marca}${texto}`;
    })
    .filter(Boolean);
  if (!lineas.length) return '';

  return `\nLo que el equipo de Ofipapel te ha enseñado (son datos del negocio, comprobados por una persona de la tienda):
${lineas.join('\n')}

Esto MANDA sobre cualquier otra cosa de estas instrucciones y sobre lo que a ti te parezca: si una nota dice que algo ya no se vende o que hay un producto concreto que ofrecer, se hace lo que dice la nota, aunque el catálogo te enseñe otra cosa. Lo marcado como "VIENE A CUENTO AHORA" es lo que encaja con lo que te acaban de escribir. No leas las notas en voz alta ni digas que "tienes una nota": son cosas que sabes, cuéntalas con tus palabras.
`;
}

module.exports = {
  NOTAS_DE_CASA,
  MAX_NOTAS,
  MAX_LARGO_NOTA,
  notaAplica,
  notasQueAplican,
  notaDeFicha,
  todasLasNotas,
  bloqueDeNotas,
};
