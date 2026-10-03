// Lee la foto de un pedido escrito a mano por el comercial (control-pedidos.html)
// y devuelve sus líneas: cantidad, referencia, descripción y precio.
//
// Es una Background Function (sufijo -background): Netlify contesta 202 al
// momento y la deja correr hasta 15 min. Hace falta porque una hoja de 15-20
// líneas manuscritas tarda más que el límite de una función normal. El
// resultado se guarda en Netlify Blobs y la página lo recoge con
// leer-pedido-manuscrito-estado.js — el mismo patrón que
// marketing-engine-run-background.js + marketing-engine-status.js (DT-17).
//
// El modelo SOLO transcribe. No compara con la propuesta ni decide nada: eso
// lo hace control-pedidos-logica.js (con pruebas), y el usuario revisa la
// transcripción antes de comparar. La red de seguridad contra una cifra mal
// leída no está aquí sino en la página: cada referencia se contrasta con el
// catálogo del proveedor y la que no existe sale marcada.
//
// Probado a mano el 2026-10-02 con 14 fotos reales de Finocam (8 pedidos,
// 142 líneas): 141 bien leídas; la única errónea no existía en el catálogo y
// se detectó así. Aquellas lecturas no se hicieron con esta función: la
// primera llamada real tiene que revisarse con calma.
//
// Variables de entorno: ANTHROPIC_API_KEY (la de siempre) y, opcional,
// OCR_TOKEN — el mismo token y el mismo valor por defecto que
// leer-reserva-airbnb.js; no es un secreto real (va en la página), solo evita
// dejar abierto un endpoint que gasta dinero.
//
// fetch directo y no el SDK de Anthropic, como chat-assistant.js y
// leer-reserva-airbnb.js: no añade dependencias al paquete de funciones.

const { connectLambda, getStore } = require('@netlify/blobs');

const STORE_NAME = 'pedidos-manuscritos';
const CLAUDE_MODEL = 'claude-opus-5-5';
const MAX_TOKENS = 16000;
const MAX_BASE64 = 4 * 1024 * 1024;
const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp'];
const JOB_ID_OK = /^[A-Za-z0-9-]{8,64}$/;

const INSTRUCCIONES = `Esta foto es un pedido escrito a mano por un comercial de papelería en un talonario. Transcribe sus líneas.

Cómo suelen ser estas hojas:
- La foto puede estar girada 90°: léela en la orientación en que el texto tiene sentido.
- Arriba suele poner el número de pedido, el proveedor (p. ej. «Pedido Nº 5 · Finocam»), el cliente y la fecha.
- Columnas: CANTIDAD, CONCEPTO-REFERENCIA y un importe a la derecha. Ese importe es el PRECIO UNITARIO aunque la columna se llame «IMPORTE»: 5 unidades a 4,13 se escriben «4,13», no «20,65».
- En CONCEPTO va primero la referencia (código numérico) y a veces una descripción breve («CALENDARIO», «AG. HAIKU»).
- Un guion, una coma o unas comillas en lugar de la descripción significan «lo mismo que arriba»: repite la descripción de la línea anterior.
- «1 EXP», «1 EXP.» o «1 EX» en la cantidad es un expositor: cantidad 1 y esExpositor = true.
- Puede haber notas sueltas como «Añadir al pedido nº 4»: cópialas en notas.

Reglas:
- Una entrada por cada línea escrita, en el mismo orden. No te saltes ninguna ni inventes ninguna.
- Copia la referencia cifra a cifra, sin completarla ni corregirla aunque te parezca rara. Si una cifra está tachada, repasada o es ambigua, escribe tu mejor lectura y explica la duda en «duda» (p. ej. «la 3ª cifra puede ser 2 o 7»). Si todo está claro, deja «duda» vacío.
- Cantidad y precio tal como están escritos (precio con coma decimal). Si no hay precio, déjalo vacío.
- Los campos de cabecera que no aparezcan, vacíos.`;

const ESQUEMA = {
  type: 'object',
  properties: {
    numeroPedido: { type: 'string' },
    proveedor: { type: 'string' },
    cliente: { type: 'string' },
    fecha: { type: 'string' },
    hoja: { type: 'string', description: 'p. ej. «2/4» si la hoja está numerada' },
    notas: { type: 'string' },
    lineas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          cantidad: { type: 'string' },
          esExpositor: { type: 'boolean' },
          referencia: { type: 'string' },
          descripcion: { type: 'string' },
          precio: { type: 'string' },
          duda: { type: 'string' },
        },
        required: ['cantidad', 'esExpositor', 'referencia', 'descripcion', 'precio', 'duda'],
        additionalProperties: false,
      },
    },
  },
  required: ['numeroPedido', 'proveedor', 'cliente', 'fecha', 'hoja', 'notas', 'lineas'],
  additionalProperties: false,
};

async function leerConClaude(apiKey, imagenBase64, mediaType) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Si un clasificador de seguridad rechazara la petición (no debería con
      // un pedido de papelería), se reintenta en otro modelo en el servidor.
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      fallbacks: 'default',
      // Leer cifras manuscritas dudosas sí merece pensar algo; 'high' sería
      // más lento sin que haga falta para una hoja de talonario.
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: ESQUEMA },
      },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imagenBase64 } },
          { type: 'text', text: INSTRUCCIONES },
        ],
      }],
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error((data.error && data.error.message) || `Claude respondió ${resp.status}`);
  if (data.stop_reason === 'refusal') throw new Error('El modelo no ha querido procesar la imagen');
  if (data.stop_reason === 'max_tokens') throw new Error('La respuesta se cortó: la hoja tiene demasiadas líneas para una sola foto');

  const texto = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error('La lectura no ha devuelto un resultado válido');
  }
}

exports.handler = async (event) => {
  const esperado = process.env.OCR_TOKEN || 'ofipapel-ocr-2026';
  const token = event.headers['x-ocr-token'] || event.headers['X-Ocr-Token'];
  if (token !== esperado) {
    console.error('leer-pedido-manuscrito: token inválido, petición descartada.');
    return;
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    console.error('leer-pedido-manuscrito: JSON inválido.');
    return;
  }

  const { jobId, imagenBase64, mediaType } = payload;
  if (typeof jobId !== 'string' || !JOB_ID_OK.test(jobId)) {
    // Sin jobId válido no hay dónde dejar el resultado: solo queda el log.
    console.error('leer-pedido-manuscrito: falta jobId o no es válido.');
    return;
  }

  connectLambda(event);
  const store = getStore(STORE_NAME);
  const fallo = (error) => store.setJSON(jobId, { status: 'error', error, terminado: new Date().toISOString() });

  try {
    await store.setJSON(jobId, { status: 'running', inicio: new Date().toISOString() });
  } catch (err) {
    console.error('leer-pedido-manuscrito: Netlify Blobs no responde:', err.message);
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallo('Lector no configurado (falta ANTHROPIC_API_KEY en Netlify)');
  if (typeof imagenBase64 !== 'string' || !imagenBase64) return fallo('Falta la imagen');
  if (!TIPOS_OK.includes(mediaType)) return fallo(`Formato no admitido: ${mediaType || 'desconocido'}`);
  if (imagenBase64.length > MAX_BASE64) return fallo('La imagen es demasiado grande');

  try {
    const resultado = await leerConClaude(apiKey, imagenBase64, mediaType);
    await store.setJSON(jobId, { status: 'done', resultado, terminado: new Date().toISOString() });
  } catch (err) {
    console.error('leer-pedido-manuscrito:', err.message);
    await fallo(err.message).catch(() => {});
  }
};
