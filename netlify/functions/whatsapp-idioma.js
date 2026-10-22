// En qué idioma escribe el cliente.
//
// El bot promete "We also speak English" y luego le contestaba en español a
// quien escribía en inglés. Visto en real (10/9/2026): un cliente preguntó "i
// would like to know when to expect my order", recibió la presentación en
// español, dio su número de pedido y se llevó "Tu pedido #643539 está pagado y
// en preparación". Solo la IA cambiaba de idioma; los textos fijos, nunca.
//
// SE RECUERDA, no se decide mensaje a mensaje. Esa es la parte que importa: en
// esa misma conversación, los mensajes siguientes fueron "643539" y "yes", que
// no tienen idioma suficiente para decidir nada. Si se mirara solo el mensaje
// actual, un número de pedido volvería a caer en español a mitad de
// conversación — que es exactamente lo que pasó.

// Palabras que casi solo aparecen en uno de los dos idiomas. Se eligen por ser
// FRECUENTES y poco ambiguas: artículos, pronombres y verbos de andar por casa,
// que es lo que sale en cualquier frase por corta que sea.
//
// Fuera quedan a propósito las que se parecen en los dos ("no", "me", "e") y
// las que un hispanohablante usa en español ("ok", "hi" como saludo suelto).
const INGLES = [
  'the', 'is', 'are', 'was', 'you', 'your', 'yours', 'my', 'mine', 'me', 'we',
  'they', 'this', 'that', 'these', 'those', 'and', 'or', 'but', 'with', 'for',
  'from', 'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'would',
  'should', 'will', 'want', 'need', 'know', 'like', 'please', 'thanks',
  'thank you', 'hello', 'good morning', 'good afternoon', 'when', 'where',
  'what', 'which', 'who', 'why', 'how', 'how much', 'how many', 'order',
  'delivery', 'shipping', 'price', 'available', 'yes', 'sorry', 'about',
];

const ESPANOL = [
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'que', 'qué', 'de',
  'del', 'para', 'con', 'por', 'mi', 'mis', 'tu', 'tus', 'su', 'sus', 'es',
  'son', 'está', 'esta', 'están', 'hay', 'tengo', 'tiene', 'tienen', 'tenéis',
  'teneis', 'quiero', 'necesito', 'puedo', 'podéis', 'podeis', 'hola',
  'buenos días', 'buenas', 'gracias', 'dónde', 'donde', 'cuándo', 'cuando',
  'cuánto', 'cuanto', 'cómo', 'como', 'pedido', 'precio', 'envío', 'envio',
  'sí', 'perdón', 'perdon', 'y', 'o', 'pero', 'me', 'te', 'se', 'lo', 'le',
];

// Cuántas palabras de ventaja hacen falta para dar el idioma por bueno. Con 2
// se evita que una palabra suelta ("order", "no") decida por sí sola; por
// debajo de eso se prefiere NO saber y quedarse con lo que ya se recordaba.
const VENTAJA_MINIMA = 2;

function palabras(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z]+/)
    .filter(Boolean);
}

function cuenta(lista, ps, plano) {
  let n = 0;
  for (const termino of lista) {
    const t = termino.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (t.includes(' ')) {
      if (plano.includes(t)) n += 2; // una expresión de dos palabras vale doble
    } else if (ps.includes(t)) {
      n++;
    }
  }
  return n;
}

// Devuelve 'en', 'es' o null. null significa "este mensaje no dice nada del
// idioma" — un número de pedido, un "ok", un emoji —, y en ese caso quien
// llama debe quedarse con el idioma que ya tuviera recordado.
function detectarIdioma(texto) {
  const ps = palabras(texto);
  if (ps.length === 0) return null;
  const plano = ps.join(' ');

  const en = cuenta(INGLES, ps, plano);
  const es = cuenta(ESPANOL, ps, plano);

  if (en - es >= VENTAJA_MINIMA) return 'en';
  if (es - en >= VENTAJA_MINIMA) return 'es';
  return null;
}

// El idioma con el que hay que contestar: lo que diga este mensaje si dice algo,
// y si no, lo que se recordaba de la conversación. Por defecto, español.
function idiomaDeRespuesta(texto, idiomaRecordado) {
  return detectarIdioma(texto) || idiomaRecordado || 'es';
}

module.exports = { detectarIdioma, idiomaDeRespuesta };
