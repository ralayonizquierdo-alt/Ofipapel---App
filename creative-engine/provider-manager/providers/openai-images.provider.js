// OpenAI Images (gpt-image-1) — proveedor REAL, primer proveedor activado
// (ver FIRST_REAL_GENERATION.md). Punto de sustitución: activo si existe
// OPENAI_API_KEY en el entorno; si no, generate() falla rápido con
// err.code = 'PROVIDER_NOT_CONFIGURED' sin llamar a la red — quien lo
// invoque (hoy, netlify/functions/marketing-engine-run.js) decide caer a
// "simulated" mirando esa misma variable, sin tocar ningún otro fichero.

const fs = require('node:fs');
const path = require('node:path');

const PROVIDER_META = {
  id: 'openai-images',
  label: 'OpenAI Images',
  status: 'active',
  kind: 'image',
  capabilities: {
    contentClasses: ['photo', 'art'],
    // La API de imágenes de OpenAI no admite negative prompt nativo —
    // se modela como "no soportado" en vez de simularlo mal en el prompt.
    supportsNegativePrompt: false,
    // v1: solo generación desde texto (endpoint /images/generations). El
    // endpoint de edits/variaciones (referencia real de imagen) queda
    // fuera de este sprint — se activa cambiando esto a true + añadiendo
    // esa llamada en generate().
    supportsReferenceImages: false,
    maxVariantsPerCall: 1,
    outputFormats: ['png'],
  },
};

const OPENAI_IMAGES_ENDPOINT = 'https://api.openai.com/v1/images/generations';
const MODEL = 'gpt-image-1';

// gpt-image-1 solo admite tamaños fijos (1024x1024, 1024x1536, 1536x1024,
// 'auto') — se elige el más cercano a lo pedido por relación de aspecto,
// no el tamaño exacto de FORMAT_DIMENSIONS.
function nearestSupportedSize(width, height) {
  if (width === height) return { size: '1024x1024', width: 1024, height: 1024 };
  if (height > width) return { size: '1024x1536', width: 1024, height: 1536 };
  return { size: '1536x1024', width: 1536, height: 1024 };
}

async function generate(req) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error(
      'Proveedor "openai-images" activo pero sin OPENAI_API_KEY configurada en el entorno.'
    );
    err.code = 'PROVIDER_NOT_CONFIGURED';
    throw err;
  }

  const { size, width, height } = nearestSupportedSize(req.width, req.height);

  const apiResponse = await fetch(OPENAI_IMAGES_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, prompt: req.prompt, size, n: 1 }),
  });

  if (!apiResponse.ok) {
    const errorBody = await apiResponse.text();
    throw new Error(`OpenAI Images respondió ${apiResponse.status}: ${errorBody}`);
  }

  const json = await apiResponse.json();
  const b64 = json.data && json.data[0] && json.data[0].b64_json;
  if (!b64) {
    throw new Error('OpenAI Images no devolvió b64_json en la respuesta.');
  }

  const outputDir = (req.metadata && req.metadata.outputDir) || process.cwd();
  fs.mkdirSync(outputDir, { recursive: true });
  const assetPath = path.join(outputDir, `openai-${Date.now()}.png`);
  fs.writeFileSync(assetPath, Buffer.from(b64, 'base64'));

  return {
    assetPath,
    providerId: PROVIDER_META.id,
    width,
    height,
    format: 'png',
    rawResponse: { model: MODEL, requestedSize: `${req.width}x${req.height}`, usedSize: size },
  };
}

module.exports = { PROVIDER_META, generate };
