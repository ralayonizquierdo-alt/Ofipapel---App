// «🧠 Revisar con IA» de control-pedidos.html: razona las faltas y sobras que
// las reglas de la app no han sabido explicar, como lo haría una persona
// (la misma mercancía con otro código, colores en otro idioma, un expositor
// servido por piezas, lo que es de otro pedido de la campaña).
//
// Solo PROPONE. La página comprueba que cada referencia que devuelve exista de
// verdad en el pedido y no aplica nada hasta que el usuario pulsa el botón;
// todo lo aplicado se puede deshacer desde la página.
//
// Va en segundo plano (como leer-pedido-manuscrito-background.js) porque una
// función normal de Netlify corta a los 10 s. El resultado se deja en el mismo
// almacén de Blobs y se recoge con leer-pedido-manuscrito-estado.js por jobId.
// El cuerpo es texto (unas decenas de líneas), muy por debajo de los 256 KB
// que admite una Background Function.
//
// Variables de entorno: ANTHROPIC_API_KEY y, opcional, OCR_TOKEN.
const { connectLambda, getStore } = require('@netlify/blobs');

const STORE_NAME = 'pedidos-manuscritos';
const JOB_ID_OK = /^[A-Za-z0-9-]{8,64}$/;
const CLAUDE_MODEL = 'claude-opus-5-5';
const MAX_TOKENS = 8000;
const MAX_LINEAS = 400;

const INSTRUCCIONES = `Eres el encargado de compras de una papelería y revisas un pedido contra lo que propone o factura el proveedor.
La aplicación ya ha emparejado sola lo evidente. Te pasa SOLO lo que no ha sabido explicar:
- "faltan": lo que pedimos y no aparece en el documento del proveedor (con nuestra referencia, descripción, cantidad y precio).
- "sobran": lo que el proveedor trae y no casa con nada pedido (con su referencia, descripción, cantidad y precio).
- "otros": las faltas y sobras de los demás pedidos de la misma campaña (cada uno con su "id").

Razona como una persona con oficio: la misma mercancía puede venir con otro código (códigos antiguos o con prefijo, una cifra mal tecleada), con la descripción en otro idioma (giallo = amarillo, nero = negro, avorio = marfil, banana = amarillo claro…), en cajas en vez de unidades, o un expositor pedido puede llegar desglosado en sus piezas. Mira cantidades, precios, medidas, gramajes y colores.

Devuelve SOLO propuestas de las que estés razonablemente seguro. Nada de pegas ni avisos de relleno: si algo simplemente no viene o viene de más sin explicación, no lo menciones. Cada referencia como mucho en una propuesta.
Tipos:
- "emparejar": "nuestra" (una ref de faltan) y "delProveedor" (una ref de sobran) son el mismo artículo.
- "expositor": "nuestra" es un expositor de faltan y "piezas" son refs de sobran que lo componen.
- "otroPedido": "delProveedor" (una ref de sobran de este pedido) es lo que le falta al pedido "pedidoId" (de otros).
Usa las referencias EXACTAMENTE como vienen en las listas; no inventes ninguna. "motivo": una frase corta en español que lo justifique (cantidades, precios, color…). "confianza": "alta" o "media".`;

const ESQUEMA = {
  type: 'object',
  properties: {
    propuestas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['emparejar', 'expositor', 'otroPedido'] },
          nuestra: { type: 'string' },
          delProveedor: { type: 'string' },
          piezas: { type: 'array', items: { type: 'string' } },
          pedidoId: { type: 'string' },
          motivo: { type: 'string' },
          confianza: { type: 'string', enum: ['alta', 'media'] },
        },
        required: ['tipo', 'nuestra', 'delProveedor', 'piezas', 'pedidoId', 'motivo', 'confianza'],
        additionalProperties: false,
      },
    },
  },
  required: ['propuestas'],
  additionalProperties: false,
};

async function revisar(apiKey, datos) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{ role: 'user', content: [{ type: 'text', text: INSTRUCCIONES + '\n\nDATOS:\n' + JSON.stringify(datos) }] }],
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error((data.error && data.error.message) || `Claude respondió ${resp.status}`);
  if (data.stop_reason === 'refusal') throw new Error('El modelo no ha querido revisarlo');
  if (data.stop_reason === 'max_tokens') throw new Error('La respuesta se cortó: hay demasiadas diferencias de una vez.');
  const texto = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error('La revisión no ha devuelto un resultado válido');
  }
}

exports.handler = async (event) => {
  const esperado = process.env.OCR_TOKEN || 'ofipapel-ocr-2026';
  const token = event.headers['x-ocr-token'] || event.headers['X-Ocr-Token'];
  if (token !== esperado) return { statusCode: 401 };

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400 };
  }
  const { jobId, datos } = payload;
  if (typeof jobId !== 'string' || !JOB_ID_OK.test(jobId) || !datos) return { statusCode: 400 };

  connectLambda(event);
  const store = getStore(STORE_NAME);
  const fallo = (error) => store.setJSON(jobId, { status: 'error', error, terminado: new Date().toISOString() });
  try {
    await store.setJSON(jobId, { status: 'running', inicio: new Date().toISOString() });
    const n = (datos.faltan || []).length + (datos.sobran || []).length
      + (datos.otros || []).reduce((t, o) => t + (o.faltan || []).length + (o.sobran || []).length, 0);
    if (n > MAX_LINEAS) return fallo('Hay demasiadas diferencias para revisarlas de una vez.');
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return fallo('Revisión no configurada (falta ANTHROPIC_API_KEY en Netlify)');
    const resultado = await revisar(apiKey, datos);
    await store.setJSON(jobId, { status: 'done', resultado, terminado: new Date().toISOString() });
  } catch (err) {
    await fallo(err.message || String(err)).catch(() => {});
  }
  return { statusCode: 202 };
};
