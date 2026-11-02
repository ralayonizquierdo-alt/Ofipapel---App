// ESCUCHAR LA NOTA DE VOZ DEL CLIENTE.
//
// «El robot tampoco» (propietario, 2/11/2026), cuando se le dijo que las notas
// de voz ya se podían escuchar en el panel. Y tenía razón: que las oiga una
// persona arregla la mitad del problema. De madrugada sigue siendo un cliente
// esperando a las nueve.
//
// POR QUÉ HACE FALTA OTRO SERVICIO: Claude no oye. No es que no esté conectado
// — la API de Anthropic no admite audio, ni en este modelo ni en ninguno. Así
// que la nota de voz se convierte en TEXTO con un transcriptor (Whisper, de
// OpenAI) y a partir de ahí ya no hay audio en ninguna parte: hay un mensaje
// escrito como cualquier otro.
//
// Y ESO ES JUSTO LO BUENO DEL DISEÑO. La transcripción no se le da a la IA como
// un hecho ni se contesta desde ella: entra por el MISMO camino que si el
// cliente lo hubiera escrito — las respuestas fijas, el estado del pedido, la
// búsqueda en el catálogo y todas las redes de seguridad que ya impiden
// confirmar un producto o soltar un precio sin respaldo. Es la misma separación
// que con las fotos (whatsapp-vision.js): una transcripción equivocada acaba en
// «no encuentro eso», que es recuperable, y nunca en un precio inventado.
//
// Lo transcrito queda ADEMÁS escrito en el panel, debajo del audio. Si el bot
// contesta algo raro, se ve de un vistazo si fue porque oyó mal o porque buscó
// mal, en vez de adivinarlo.
//
// SIN LA CLAVE NO PASA NADA. Si `OPENAI_API_KEY` no está puesta en el sitio del
// bot, esto no hace nada y el audio sigue el camino de siempre: se guarda para
// que se pueda escuchar en el panel y se le ofrece una persona al cliente.

const MODELO = 'whisper-1';

// Los tipos que manda WhatsApp. Una nota de voz es siempre `audio/ogg` con
// codec opus; el resto son audios reenviados desde otra aplicación.
const TIPOS_QUE_SE_ESCUCHAN = ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr', 'audio/wav', 'audio/webm'];

// La extensión importa: el transcriptor decide el formato por el nombre del
// fichero, no por la cabecera.
const EXTENSIONES = {
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
};

// Tope propio, por debajo del de whatsapp-media.js (5 MB). Una nota de voz de
// un minuto son unos 100 KB, así que esto no se toca en la práctica; está para
// que un audio largo reenviado no se coma el tiempo del webhook.
const MAXIMO_PARA_ESCUCHAR = 4 * 1024 * 1024;

// Corto a propósito: el webhook entero tiene ~10 segundos antes de que Meta dé
// la respuesta por perdida. Si la transcripción no cabe, se prefiere el camino
// de siempre (ofrecer una persona) a dejar al cliente esperando.
const TIMEOUT_MS = 6000;

// Una transcripción más larga que esto no es una pregunta de papelería: es
// alguien contando algo. Se corta para no mandarle a la IA media conversación.
const MAXIMO_CARACTERES = 600;

function isConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function sePuedeEscuchar(tipo, bytes) {
  return (
    isConfigured() &&
    TIPOS_QUE_SE_ESCUCHAN.includes(String(tipo || '').split(';')[0].trim()) &&
    Number(bytes) > 0 &&
    Number(bytes) <= MAXIMO_PARA_ESCUCHAR
  );
}

// Devuelve el texto de la nota de voz, o null. Nunca lanza: que no se pueda
// transcribir no es un error que deba quitarle la respuesta al cliente.
async function transcribir({ buffer, tipo }) {
  if (!isConfigured() || !buffer?.length) return null;

  const limpio = String(tipo || '').split(';')[0].trim();
  const extension = EXTENSIONES[limpio] || 'ogg';

  try {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: limpio }), `nota.${extension}`);
    form.append('model', MODELO);
    // Sin `language`: el bot atiende en español y en inglés, y forzar el idioma
    // haría que una nota en inglés saliera transcrita como un disparate.

    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!r.ok) {
      const detalle = await r.text().catch(() => '');
      console.error(`whatsapp-voz: el transcriptor devolvió ${r.status}: ${detalle.slice(0, 200)}`);
      return null;
    }

    const datos = await r.json().catch(() => null);
    return limpiar(datos?.text);
  } catch (err) {
    const motivo = err.name === 'TimeoutError' ? `tardó más de ${TIMEOUT_MS} ms` : err.message;
    console.error('whatsapp-voz: no se pudo transcribir:', motivo);
    return null;
  }
}

// Whisper, ante un silencio o un ruido, devuelve cosas como «.», «Subtítulos
// realizados por la comunidad de Amara.org» o «Gracias por ver el vídeo» —
// basura aprendida de los vídeos con los que se entrenó. Eso no es una
// pregunta de un cliente y no debe entrar en el flujo como si lo fuera.
const RUIDO = [
  /^[\s.,!¡?¿·—-]*$/,
  /amara\.org/i,
  /subt[íi]tulos? (realizados|por)/i,
  /gracias por ver/i,
  /^\s*(you|thanks? for watching|thank you)\s*[.!]?\s*$/i,
];

function limpiar(texto) {
  const t = String(texto || '').trim();
  if (!t || RUIDO.some((re) => re.test(t))) return null;
  return t.length > MAXIMO_CARACTERES ? `${t.slice(0, MAXIMO_CARACTERES).trim()}…` : t;
}

// Cómo queda escrito en el panel, debajo del audio. Mismo papel que la lectura
// de una foto: distinguir «oyó mal» de «buscó mal».
function paraElPanel(texto) {
  return `🎙️ el bot oye: "${texto}"`;
}

module.exports = {
  isConfigured,
  sePuedeEscuchar,
  transcribir,
  limpiar,
  paraElPanel,
  TIPOS_QUE_SE_ESCUCHAN,
  MAXIMO_PARA_ESCUCHAR,
  MAXIMO_CARACTERES,
};
