// Las fotos que mandan los clientes: bajarlas de Meta y guardarlas.
//
// Hasta ahora una foto se perdía: el bot decía que no la podía leer y ahí
// acababa todo. Pero "¿tenéis este?" con la foto del cartucho es de las formas
// más comunes de preguntar, y quien la atiende necesita VERLA.
//
// Por qué hay que copiarlas y no basta con guardar el enlace: Meta no da una
// URL pública. Da un identificador con el que se pide una URL temporal, que
// caduca (unos minutos) y que además exige el token para descargarla. Un enlace
// guardado hoy no sirve mañana, así que la única forma de que la foto siga ahí
// cuando alguien abra el panel es traerse el fichero.
//
// Dónde se guardan: Netlify Blobs, no Upstash. Redis es para texto y se paga
// por comando y por ancho de banda; meter ahí fotos en base64 sería caro y
// tonto. Blobs ya se usa en este repo (marketing-engine) y está hecho para esto.

const { connectLambda, getStore } = require('@netlify/blobs');

const GRAPH_API_VERSION = 'v20.0';
const STORE_NAME = 'whatsapp-media';

// Tope de tamaño. WhatsApp ya limita las imágenes a 5 MB, pero un documento
// puede ser mucho mayor y no queremos que una descarga se coma el presupuesto
// de 10 segundos del webhook ni llenar el almacén.
const MAXIMO_BYTES = 5 * 1024 * 1024;

// Cuánto se espera a Meta. Corto a propósito: el webhook entero tiene ~10
// segundos antes de que Meta dé la respuesta por perdida y reenvíe el mensaje.
// Si la descarga no cabe, se prefiere contestar sin la foto a quedarse sin
// contestar — el aviso al equipo sale igual.
const TIMEOUT_MS = 4000;

const TIPOS_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

// Baja un adjunto de Meta. Son DOS pasos, y el segundo también necesita el
// token: la URL que devuelve el primero no es pública.
async function descargarDeMeta(mediaId) {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) return { ok: false, error: 'Falta WHATSAPP_TOKEN.' };

  try {
    const meta = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!meta.ok) return { ok: false, error: `Meta devolvió ${meta.status} al pedir la URL.` };

    const datos = await meta.json();
    if (!datos?.url) return { ok: false, error: 'Meta no devolvió URL de descarga.' };

    const tipo = String(datos.mime_type || '').split(';')[0].trim();
    if (!TIPOS_ACEPTADOS.includes(tipo)) {
      return { ok: false, error: `Tipo no admitido: ${tipo || 'desconocido'}.` };
    }
    if (Number(datos.file_size) > MAXIMO_BYTES) {
      return { ok: false, error: `Pesa ${Math.round(datos.file_size / 1024)} KB, más del máximo.` };
    }

    const bin = await fetch(datos.url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!bin.ok) return { ok: false, error: `Meta devolvió ${bin.status} al descargar.` };

    const buffer = Buffer.from(await bin.arrayBuffer());
    if (buffer.length > MAXIMO_BYTES) return { ok: false, error: 'El fichero pesa más del máximo.' };

    return { ok: true, buffer, tipo };
  } catch (err) {
    const motivo = err.name === 'TimeoutError' ? `tardó más de ${TIMEOUT_MS} ms` : err.message;
    console.error('whatsapp-media: no se pudo bajar el adjunto:', motivo);
    return { ok: false, error: motivo };
  }
}

// La clave con la que se guarda y con la que luego el panel lo pide. Lleva el
// teléfono dentro para poder comprobar, al servirlo, que quien lo pide está
// mirando esa conversación y no adivinando identificadores.
function claveDeMedia(phone, mediaId) {
  return `${String(phone).replace(/\D/g, '')}/${String(mediaId).replace(/[^A-Za-z0-9_-]/g, '')}`;
}

async function guardar(event, phone, mediaId, buffer, tipo) {
  connectLambda(event);
  const store = getStore(STORE_NAME);
  await store.set(claveDeMedia(phone, mediaId), buffer, { metadata: { tipo, phone: String(phone) } });
}

async function leer(event, phone, mediaId) {
  connectLambda(event);
  const store = getStore(STORE_NAME);
  const res = await store.getWithMetadata(claveDeMedia(phone, mediaId), { type: 'arrayBuffer' });
  if (!res) return null;
  return { buffer: Buffer.from(res.data), tipo: res.metadata?.tipo || 'application/octet-stream' };
}

// Baja y guarda de una vez. Devuelve el id con el que el panel podrá pedirlo, o
// null si algo falló — y que falle NO es grave: el mensaje se registra igual y
// el aviso al equipo sale igual, solo que sin la foto.
async function guardarAdjuntoDeCliente(event, phone, mediaId) {
  const bajado = await descargarDeMeta(mediaId);
  if (!bajado.ok) return null;
  try {
    await guardar(event, phone, mediaId, bajado.buffer, bajado.tipo);
    return { mediaId, tipo: bajado.tipo, bytes: bajado.buffer.length };
  } catch (err) {
    console.error('whatsapp-media: no se pudo guardar en Blobs:', err.message);
    return null;
  }
}

// Cómo queda marcado en el historial que un mensaje trae foto. El panel busca
// esta marca para pintar la imagen; el webhook la escribe. Vive aquí, en un solo
// sitio, para que los dos no se desincronicen.
const MARCA_ADJUNTO = '[ADJUNTO:';
const RE_ADJUNTO = /^\[ADJUNTO:([A-Za-z0-9_-]+)\]/;

// Devuelve { mediaId, texto } si el mensaje del historial trae foto, o null.
function adjuntoDelHistorial(contenido) {
  const m = RE_ADJUNTO.exec(String(contenido || ''));
  if (!m) return null;
  return { mediaId: m[1], texto: String(contenido).replace(RE_ADJUNTO, '').trim() };
}

module.exports = {
  guardarAdjuntoDeCliente,
  MARCA_ADJUNTO,
  adjuntoDelHistorial,
  leer,
  claveDeMedia,
  MAXIMO_BYTES,
  TIPOS_ACEPTADOS,
};
