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
    // Modo calidad absoluta (2026-08-02): activado — cuando hay una foto
    // real de producto (req.referenceImages[0]), generate() usa
    // /v1/images/edits (multipart, imagen real como entrada) en vez de
    // /v1/images/generations (solo texto). Sin foto de referencia, cae
    // al mismo flujo de siempre — ningún comportamiento previo cambia.
    supportsReferenceImages: true,
    maxVariantsPerCall: 1,
    outputFormats: ['png'],
  },
};

const OPENAI_IMAGES_ENDPOINT = 'https://api.openai.com/v1/images/generations';
const OPENAI_IMAGES_EDIT_ENDPOINT = 'https://api.openai.com/v1/images/edits';
const MODEL = 'gpt-image-1';

// gpt-image-1 solo admite tamaños fijos (1024x1024, 1024x1536, 1536x1024,
// 'auto') — se elige el más cercano a lo pedido por relación de aspecto,
// no el tamaño exacto de FORMAT_DIMENSIONS.
function nearestSupportedSize(width, height) {
  if (width === height) return { size: '1024x1024', width: 1024, height: 1024 };
  if (height > width) return { size: '1024x1536', width: 1024, height: 1536 };
  return { size: '1536x1024', width: 1536, height: 1024 };
}

// Lee req.referenceImages[0] (ruta de fichero o data-URL, ver
// asset-pipeline/service.js#prepareAssets) y lo convierte en un Blob
// para el multipart de /v1/images/edits.
function loadReferenceImageBlob(refImage) {
  if (refImage.startsWith('data:')) {
    const [, meta, b64] = refImage.match(/^data:([^;]+);base64,(.*)$/s) || [];
    if (!b64) throw new Error(`Imagen de referencia con data-URL mal formada: ${refImage.slice(0, 40)}...`);
    return new Blob([Buffer.from(b64, 'base64')], { type: meta || 'image/png' });
  }
  const buffer = fs.readFileSync(refImage);
  const ext = path.extname(refImage).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return new Blob([buffer], { type: mime });
}

// Timeout de 50s compartido por ambas rutas (generations/edits) — ver
// comentario extenso en la versión anterior de esta función: sin esto,
// un fetch lento agota el tiempo de ejecución de la función sin dar
// ninguna pista de qué ha pasado.
async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('OpenAI Images no respondió en 50s — abortado para no agotar el tiempo de ejecución de la función.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
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
  const hasReferenceImage = Array.isArray(req.referenceImages) && req.referenceImages.length > 0;

  let apiResponse;
  if (hasReferenceImage) {
    // Modo calidad absoluta: /v1/images/edits con la foto real como
    // entrada, para máxima fidelidad al producto real — en vez de
    // describirlo solo con texto (/v1/images/generations).
    const form = new FormData();
    form.append('model', MODEL);
    form.append('image', loadReferenceImageBlob(req.referenceImages[0]), 'reference.png');
    form.append('prompt', req.prompt);
    form.append('size', size);
    form.append('n', '1');
    if (quality) form.append('quality', quality);

    apiResponse = await fetchWithTimeout(OPENAI_IMAGES_EDIT_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } else {
    const body = { model: MODEL, prompt: req.prompt, size, n: 1 };
    if (quality) body.quality = quality;

    apiResponse = await fetchWithTimeout(OPENAI_IMAGES_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
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
    rawResponse: {
      model: MODEL,
      requestedSize: `${req.width}x${req.height}`,
      usedSize: size,
      usedReferenceImage: hasReferenceImage,
    },
  };
}

module.exports = { PROVIDER_META, generate };
