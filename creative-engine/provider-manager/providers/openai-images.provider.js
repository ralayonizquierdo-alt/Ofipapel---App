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

  // 'auto' (comportamiento por defecto de gpt-image-1 sin este parámetro)
  // puede elegir calidad alta y tardar 30-60s+ — suficiente para agotar el
  // límite de ejecución de una función síncrona de Netlify. Configurable
  // sin tocar código (mismo patrón que CREATIVE_LAB_*): por defecto no se
  // envía el parámetro (se mantiene el comportamiento ya verificado).
  const quality = process.env.OPENAI_IMAGES_QUALITY;
  const body = { model: MODEL, prompt: req.prompt, size, n: 1 };
  if (quality) body.quality = quality;

  // Sin límite de tiempo propio, un fetch lento se queda con el tiempo de
  // ejecución completo de la función sin dar ninguna pista de qué ha
  // pasado. 50s dejan margen para que la función responda con un error
  // claro antes de que la propia plataforma corte a los 60s sin explicar
  // nada (mismo caso observado en el sprint "Fase 7 — Conexión OpenAI").
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);

  let apiResponse;
  try {
    apiResponse = await fetch(OPENAI_IMAGES_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('OpenAI Images no respondió en 50s — abortado para no agotar el tiempo de ejecución de la función.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

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
