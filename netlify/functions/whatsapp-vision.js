// LEER LA FOTO QUE MANDA EL CLIENTE.
//
// "¿Tenéis este?" con la foto de la caja del cartucho es de las formas más
// comunes de preguntar que hay, y hasta hoy era la única a la que el bot no
// sabía contestar: decía "no puedo leer una foto por aquí" y ofrecía una
// persona. De madrugada, eso es un cliente esperando hasta las nueve.
//
// CÓMO FUNCIONA, Y POR QUÉ ASÍ: la foto NO se le pasa a la IA que contesta. Se
// lee aparte, en una llamada propia cuyo único trabajo es DESCRIBIRLA, y lo que
// sale de ahí son palabras que entran por el mismo camino que un mensaje de
// texto: búsqueda en el catálogo, y las mismas redes de seguridad que ya
// impiden confirmar un producto o soltar un precio sin respaldo.
//
// Esa separación es el cuidado importante del fichero. Una lectura de imagen se
// equivoca —lee "305XL" donde dice "305", o se inventa la marca porque "pega"
// con lo que ve—, y si la respuesta saliera directamente de la foto, el error
// se le daría al cliente como un hecho. Convertida en términos de búsqueda, un
// error de lectura acaba en "no encuentro eso", que es recuperable: el catálogo
// es el que manda, igual que con el texto.
//
// Lo que se lee queda ADEMÁS escrito en el panel, debajo de la foto. Si el bot
// contesta algo raro, se ve de un vistazo si fue porque leyó mal la foto o
// porque buscó mal, en vez de adivinarlo.

const MODELO = 'claude-haiku-4-5-20251001';

// Solo imágenes. Un PDF (catálogo de proveedor, factura) también llega como
// adjunto y whatsapp-media.js lo guarda, pero leerlo es otro problema: son
// muchas páginas, no cabe en el tiempo del webhook y casi nunca es una consulta
// de producto. Esos siguen yendo a una persona, como hasta ahora.
const TIPOS_QUE_SE_LEEN = ['image/jpeg', 'image/png', 'image/webp'];

// Tope propio, por debajo del de whatsapp-media.js (5 MB). En base64 un fichero
// crece un tercio, así que 5 MB de foto son ~6,7 MB de petición y la API los
// rechaza. WhatsApp comprime las fotos muy por debajo de esto, así que el tope
// no se toca en la práctica; está para que una imagen enorme no se convierta en
// un error en vez de en la respuesta de siempre.
const MAXIMO_PARA_LEER = 3.5 * 1024 * 1024;

// Corto a propósito: el webhook entero tiene ~10 segundos antes de que Meta dé
// la respuesta por perdida. Si la lectura no cabe, se prefiere el camino de
// siempre (ofrecer una persona) a dejar al cliente esperando.
const TIMEOUT_MS = 6000;

// Describir, no contestar. La llamada que contesta es otra, y lleva el catálogo
// delante; esta solo tiene la foto, así que cualquier cosa que afirme sobre
// precios o existencias sería inventada.
const PROMPT_LECTURA = `Trabajas para Ofipapel, una papelería de Tenerife. Un cliente acaba de mandar esta foto por WhatsApp.

Tu ÚNICO trabajo es DESCRIBIR la foto, para que otra parte del sistema busque después en el catálogo. No le contestes al cliente, no saludes, no ofrezcas nada, no digas precios y no digas si lo tenemos o no: eso no lo sabes.

Contesta EXACTAMENTE con estas tres líneas y nada más:
SE VE: <qué objeto es, en pocas palabras y con las palabras que usaría una papelería: "cartucho de tinta negro", "tóner", "caja registradora", "archivador de palanca", "mochila escolar", "rotuladores de pizarra"...>
TEXTO: <toda marca, modelo o referencia que se LEA en la foto, tal cual está escrita, separado por comas; o "nada" si no se lee nada>
BUSCAR: <si|no> — "no" cuando en la foto no hay ningún artículo que una papelería pueda vender

Reglas:
- NO ADIVINES. Si la marca o el modelo no se leen con claridad, no los pongas. Es mejor "cartucho de tinta negro" que inventarse "HP 305XL".
- Copia las referencias LETRA POR LETRA, tal como se ven, aunque no te suenen y aunque parezcan tener una errata.
- Si la foto es de una persona, un sitio, un documento, una factura o una captura de pantalla, dilo en SE VE con esas mismas palabras y pon BUSCAR: no.`;

function sePuedeLeer(tipo, bytes = 0) {
  return TIPOS_QUE_SE_LEEN.includes(String(tipo || '')) && bytes <= MAXIMO_PARA_LEER;
}

// Cuando la línea TEXTO viene vacía, el modelo escribe cosas distintas cada vez
// ("nada", "ninguno", "no se lee nada", "-"). Todas significan lo mismo.
const SIN_TEXTO = /^(nada|ninguno|ninguna|no se lee|no se lee nada|no hay|sin texto|n\/a|-+|\.*)$/i;

// Saca las tres líneas de lo que ha contestado el modelo. Tolerante a propósito:
// el formato se pide pero no se puede exigir, y una lectura buena con la
// etiqueta mal escrita sigue siendo una lectura buena. Si no hay forma de
// entenderla, devuelve null y el cliente recibe la respuesta de siempre.
function interpretarLectura(bruto) {
  const texto = String(bruto || '').trim();
  if (!texto) return null;

  const linea = (etiquetas) => {
    for (const etiqueta of etiquetas) {
      const re = new RegExp(`^\\s*${etiqueta}\\s*:\\s*(.+)$`, 'im');
      const m = re.exec(texto);
      if (m) return m[1].trim();
    }
    return '';
  };

  // Sin etiqueta SE VE se usa la primera línea con contenido: el modelo ha
  // descrito la foto, solo que a su manera.
  const seVe = linea(['SE VE', 'SE_VE', 'SEVE']) ||
    texto.split('\n').map((l) => l.trim()).find((l) => l && !/^[A-Z_ ]+:/.test(l)) || '';
  if (!seVe) return null;

  const leido = linea(['TEXTO', 'TEXTO LEIDO', 'TEXTO LEÍDO']);
  const buscarDicho = linea(['BUSCAR']).toLowerCase();

  return {
    seVe: seVe.replace(/\s+/g, ' ').slice(0, 200),
    textoLeido: SIN_TEXTO.test(leido) ? '' : leido.replace(/\s+/g, ' ').slice(0, 200),
    // Ante la duda, se busca: equivocarse hacia "buscar" solo cuesta una
    // consulta al catálogo que no encuentra nada, y de ahí se sale solo.
    // Equivocarse hacia "no" deja sin contestar una consulta de producto que
    // sí lo era, que es el fallo que vinimos a arreglar.
    buscar: !/^no\b/.test(buscarDicho),
  };
}

// CON QUÉ PALABRAS SE BUSCA EN EL CATÁLOGO.
//
// La referencia primero: es con diferencia el mejor término de búsqueda, y es
// justo lo que la foto aporta y el cliente no suele escribir. Después la
// descripción, y el pie de foto al final porque casi siempre es la pregunta
// ("¿tenéis este?") y no el artículo — pero a veces trae el dato que a la foto
// le falta ("en A4", "de 100 hojas"), así que no se tira.
function textoParaBuscar({ seVe, textoLeido } = {}, pieDeFoto = '') {
  return [textoLeido, seVe, pieDeFoto]
    .map((t) => String(t || '').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 300);
}

// Esta marca la lee el prompt de la IA (ver whatsapp-agent-config.js) para
// saber que lo que viene detrás NO son las palabras del cliente, sino una
// lectura automática de su foto que puede estar mal. Vive aquí, en un solo
// sitio, para que las dos mitades no se desincronicen.
const MARCA_FOTO = '[FOTO DEL CLIENTE]';

// Cómo se le cuenta la foto a la IA que contesta. Va como mensaje del cliente
// (la API solo admite user/assistant), pero diciendo claramente qué parte es
// suya y qué parte es nuestra lectura.
function comoSeLeDiceALaIA(lectura, pieDeFoto = '', idioma = 'es') {
  const partes = [`${MARCA_FOTO} El cliente ha mandado una foto.`];
  partes.push(`Lectura automática de la foto (puede estar mal): se ve ${lectura.seVe}.`);
  if (lectura.textoLeido) partes.push(`Texto que se lee en la foto: ${lectura.textoLeido}.`);
  const pie = String(pieDeFoto || '').trim();
  partes.push(pie ? `Con la foto escribe: "${pie}"` : 'No escribe nada más: la foto es toda la pregunta.');
  // El idioma se dice aparte porque este texto lo escribimos NOSOTROS, siempre
  // en español, y la IA contesta en el idioma del mensaje que recibe. Sin esto,
  // a un cliente inglés que manda una foto se le contestaría en español —
  // exactamente el fallo que ya se vio con los números de pedido (10/9/2026).
  if (idioma === 'en') partes.push('Este cliente escribe en inglés: contéstale en inglés.');
  return partes.join(' ');
}

// Cómo queda en el panel, debajo de la foto. Es para el equipo, no para el
// cliente: con esto se ve si una respuesta rara vino de leer mal la foto.
//
// Y de paso es la MEMORIA de la foto: queda escrito en el historial, así que
// cuando el cliente escribe después "¿y este papel?" se puede recuperar lo que
// se vio sin volver a mirar la imagen (ver ultimaFotoDelHistorial).
const ENCABEZADO_PANEL = '   ↳ el bot ve en la foto: ';
const SEPARADOR_LEIDO = ' · se lee: ';

function paraElPanel(lectura) {
  const leido = lectura.textoLeido ? `${SEPARADOR_LEIDO}${lectura.textoLeido}` : '';
  return `${ENCABEZADO_PANEL}${lectura.seVe}${leido}`;
}

// Lo contrario de paraElPanel. Van juntas a propósito: si una cambia y la otra
// no, la memoria de las fotos se pierde en silencio y nadie se entera hasta que
// el bot vuelve a pedir una foto que ya tenía.
function lecturaDelHistorial(contenido) {
  const linea = new RegExp(`${ENCABEZADO_PANEL.trim()}(.+)$`, 'm').exec(String(contenido || ''));
  if (!linea) return null;
  const [seVe, textoLeido = ''] = linea[1].split(SEPARADOR_LEIDO.trim()).map((t) => t.trim());
  if (!seVe) return null;
  return { seVe, textoLeido, buscar: true };
}

// LA FOTO MÁS RECIENTE QUE EL CLIENTE HAYA MANDADO, Y QUE SE PUDO LEER.
//
// Hace falta porque en WhatsApp la foto y la pregunta llegan como DOS mensajes
// distintos: primero la imagen, y un segundo después "¿y este papel?". Para el
// webhook son dos turnos, y en el segundo ya no hay ninguna foto en la mano —
// solo lo que quedó apuntado del primero.
//
// Solo se mira lo reciente: una foto de hace media conversación no tiene nada
// que ver con lo que se pregunta ahora.
const MENSAJES_QUE_CUENTAN_COMO_LA_MISMA_FOTO = 4;

function ultimaFotoDelHistorial(history = []) {
  const recientes = history
    .filter((m) => m.role === 'user')
    .slice(-MENSAJES_QUE_CUENTAN_COMO_LA_MISMA_FOTO);
  for (let i = recientes.length - 1; i >= 0; i -= 1) {
    const lectura = lecturaDelHistorial(recientes[i].content);
    if (lectura) return lectura;
  }
  return null;
}

// Lee la foto. Devuelve null ante cualquier problema (sin clave, tipo que no se
// lee, Meta lento, respuesta ininteligible): quien llama se queda con el
// comportamiento de siempre, que es ofrecer una persona. Una foto sin leer es
// el estado anterior; una foto mal leída sería peor que no haberla mirado.
async function leerFoto({ buffer, tipo, pieDeFoto = '' } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !buffer?.length) return null;
  if (!sePuedeLeer(tipo, buffer.length)) return null;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 200,
        system: PROMPT_LECTURA,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: tipo, data: buffer.toString('base64') } },
              // El pie de foto se le da porque cambia lo que hay que mirar: con
              // "fíjate en la caja nada más" (dicho por un cliente real el
              // 19/10/2026), lo que importa de la foto es la caja y no lo que
              // haya dentro.
              {
                type: 'text',
                text: pieDeFoto
                  ? `El cliente escribe, junto con la foto: "${String(pieDeFoto).slice(0, 300)}"`
                  : 'El cliente manda la foto sin escribir nada más.',
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!resp.ok) {
      console.error('whatsapp-vision: la lectura de la foto falló:', resp.status, await resp.text());
      return null;
    }

    const data = await resp.json();
    const bruto = data?.content?.find((b) => b.type === 'text')?.text || '';
    const lectura = interpretarLectura(bruto);
    if (!lectura) console.error('whatsapp-vision: no se entendió la lectura:', bruto.slice(0, 200));
    return lectura;
  } catch (err) {
    const motivo = err.name === 'TimeoutError' ? `tardó más de ${TIMEOUT_MS} ms` : err.message;
    console.error('whatsapp-vision: no se pudo leer la foto:', motivo);
    return null;
  }
}

module.exports = {
  leerFoto,
  sePuedeLeer,
  interpretarLectura,
  textoParaBuscar,
  comoSeLeDiceALaIA,
  paraElPanel,
  lecturaDelHistorial,
  ultimaFotoDelHistorial,
  MARCA_FOTO,
  TIPOS_QUE_SE_LEEN,
  MAXIMO_PARA_LEER,
};
