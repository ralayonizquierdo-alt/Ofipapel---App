// Canva Connect — FASE CANVA (2026-08-02, `.claude/rax/DEUDA_TECNICA.md`
// DT-19). Sustituye a `layout-composer/` (HTML + Chromium) como paso de
// composición final cuando hay credenciales y una plantilla de marca
// configuradas — ver `provider-manager/CANVA_CONNECT_ARCHITECTURE.md`
// para el diseño completo (10 preguntas respondidas) ya aprobado antes de
// escribir este fichero.
//
// Estructuralmente distinto del resto de proveedores: no genera píxeles
// desde un prompt, rellena una plantilla ya diseñada (Autofill) y la
// exporta (Export). `req.metadata.templateId` + `req.metadata.fields`
// sustituyen a `req.prompt`; `req.referenceImages[0]` es la fotografía ya
// limpia que generó `openai-images.provider.js`, que aquí se sube como
// asset y se inserta en el campo de imagen de la plantilla.
//
// El OAuth (obtener un access_token válido, incluido el refresco del
// refresh_token rotativo de Canva) vive fuera de este fichero, en
// `netlify/functions/canva-auth.js` — creative-engine/ debe seguir siendo
// Node.js puro sin dependencias npm (ver README.md de este directorio), y
// el refresco necesita `@netlify/blobs` para persistir el nuevo
// refresh_token en cada uso (Canva lo rota: de un solo uso, no una clave
// estática como OPENAI_API_KEY). Este proveedor solo consume
// `req.metadata.accessToken`, ya resuelto por quien construye la
// petición (`creative-lab/index.js#composeWithCanva`).

const fs = require('node:fs');
const path = require('node:path');

const PROVIDER_META = {
  id: 'canva',
  label: 'Canva (relleno de plantilla de marca)',
  status: 'active',
  kind: 'template',
  capabilities: {
    contentClasses: ['template'],
    supportsNegativePrompt: false,
    supportsReferenceImages: true, // la foto de producto como campo de imagen de la plantilla
    maxVariantsPerCall: 1,
    outputFormats: ['png'],
  },
};

const CANVA_API_BASE = 'https://api.canva.com/rest/v1';

// Una Brand Template por familia oficial (mismas 4 de
// art-direction-engine/patterns.js#OFFICIAL_FAMILIES) — IDs reales
// pendientes de que las 4 plantillas se diseñen y publiquen en Canva
// (trabajo manual, ver CANVA_CONNECT_ARCHITECTURE.md). Sin la env var
// correspondiente, resolveTemplateId() devuelve null y
// creative-lab/index.js#composeFinalLayout cae al layout-composer de
// siempre — activar Canva familia por familia es tan simple como rellenar
// estas variables de entorno en Netlify, sin tocar código.
const TEMPLATE_ID_BY_FAMILY = {
  Lifestyle: process.env.CANVA_TEMPLATE_ID_LIFESTYLE || null,
  'Premium Editorial': process.env.CANVA_TEMPLATE_ID_PREMIUM_EDITORIAL || null,
  Comercial: process.env.CANVA_TEMPLATE_ID_COMERCIAL || null,
  'Problema-Solución': process.env.CANVA_TEMPLATE_ID_PROBLEMA_SOLUCION || null,
};

/** @param {string} officialFamily @returns {string|null} */
function resolveTemplateId(officialFamily) {
  return TEMPLATE_ID_BY_FAMILY[officialFamily] || null;
}

// Timeout por petición individual — cada paso (subida/autofill/export) es
// su propia llamada corta; el sondeo (pollJob) hace muchas de estas en
// vez de una sola larga, así un fallo real de red no se confunde con
// "todavía procesando".
async function fetchWithTimeout(url, options, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Canva no respondió en ${Math.round(timeoutMs / 1000)}s — abortado.`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// Autofill y Export son asíncronos de verdad en la API de Canva (crean un
// job, no devuelven el resultado en la misma respuesta) — a diferencia de
// OpenAI Images, que sí es síncrona. 2s × 60 intentos = 2 min de margen
// por paso, sobra dentro del límite de 15 min de la Background Function
// (DT-17) incluso sumando los 3 pasos (subida + autofill + export).
async function pollJob(url, accessToken, { intervalMs = 2000, maxAttempts = 60 } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Canva respondió ${res.status} consultando el job: ${body}`);
    }
    const json = await res.json();
    const status = json.job && json.job.status;
    if (status === 'success') return json.job;
    if (status === 'failed') {
      const reason = (json.job.error && json.job.error.message) || 'motivo no especificado por Canva';
      throw new Error(`Canva: el job falló — ${reason}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Canva: el job no terminó tras ${maxAttempts} intentos de sondeo.`);
}

// Lee req.referenceImages[0] (ruta de fichero o data-URL, mismo formato
// que ya usa openai-images.provider.js#loadReferenceImageBlob) como bytes
// crudos — aquí no hace falta un Blob con mime-type, la subida de Canva
// va como application/octet-stream.
function loadPhotoBytes(refImage) {
  if (refImage.startsWith('data:')) {
    const match = refImage.match(/^data:([^;]+);base64,(.*)$/s);
    if (!match) throw new Error(`Fotografía de referencia con data-URL mal formada: ${refImage.slice(0, 40)}...`);
    return Buffer.from(match[2], 'base64');
  }
  return fs.readFileSync(refImage);
}

async function uploadAsset(accessToken, bytes, name) {
  const assetMetadata = JSON.stringify({ name_base64: Buffer.from(name).toString('base64') });
  const createRes = await fetchWithTimeout(
    `${CANVA_API_BASE}/asset-uploads`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
        'Asset-Upload-Metadata': assetMetadata,
      },
      body: bytes,
    },
    50_000
  );
  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(`Canva: subida de fotografía respondió ${createRes.status}: ${body}`);
  }
  const created = await createRes.json();
  const jobId = created.job && created.job.id;
  if (!jobId) throw new Error('Canva: la subida de fotografía no devolvió un job id.');

  const job = await pollJob(`${CANVA_API_BASE}/asset-uploads/${jobId}`, accessToken);
  const assetId = job.asset && job.asset.id;
  if (!assetId) throw new Error('Canva: el job de subida terminó en éxito pero sin asset.id.');
  return assetId;
}

async function createAutofillDesign(accessToken, templateId, dataset, title) {
  const res = await fetchWithTimeout(
    `${CANVA_API_BASE}/autofills`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand_template_id: templateId, title, data: dataset }),
    },
    20_000
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Canva: autofill respondió ${res.status}: ${body}`);
  }
  const created = await res.json();
  const jobId = created.job && created.job.id;
  if (!jobId) throw new Error('Canva: autofill no devolvió un job id.');

  const job = await pollJob(`${CANVA_API_BASE}/autofills/${jobId}`, accessToken);
  const designId = job.result && job.result.design && job.result.design.id;
  if (!designId) throw new Error('Canva: el job de autofill terminó en éxito pero sin result.design.id.');
  return designId;
}

async function exportDesignToPng(accessToken, designId) {
  const res = await fetchWithTimeout(
    `${CANVA_API_BASE}/exports`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ design_id: designId, format: { type: 'png' } }),
    },
    20_000
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Canva: exportación respondió ${res.status}: ${body}`);
  }
  const created = await res.json();
  const jobId = created.job && created.job.id;
  if (!jobId) throw new Error('Canva: exportación no devolvió un job id.');

  const job = await pollJob(`${CANVA_API_BASE}/exports/${jobId}`, accessToken);
  const url = job.urls && job.urls[0];
  if (!url) throw new Error('Canva: el job de exportación terminó en éxito pero sin urls.');
  return url;
}

async function downloadPng(url, outputPath) {
  const res = await fetchWithTimeout(url, {}, 30_000);
  if (!res.ok) throw new Error(`Canva: descarga del PNG exportado respondió ${res.status}.`);
  fs.writeFileSync(outputPath, Buffer.from(await res.arrayBuffer()));
}

async function generate(req) {
  const accessToken = req.metadata && req.metadata.accessToken;
  const templateId = req.metadata && req.metadata.templateId;
  if (!accessToken || !templateId) {
    const err = new Error(
      'Proveedor "canva" activo pero sin accessToken/templateId en metadata — construidos por creative-lab/index.js#composeWithCanva, no se llama a este proveedor directamente.'
    );
    err.code = 'PROVIDER_NOT_CONFIGURED';
    throw err;
  }
  if (!Array.isArray(req.referenceImages) || req.referenceImages.length === 0) {
    throw new Error('Canva: falta la fotografía de producto en referenceImages[0] — Canva compone sobre una foto ya generada, no genera una desde cero.');
  }

  const photoBytes = loadPhotoBytes(req.referenceImages[0]);
  const assetId = await uploadAsset(accessToken, photoBytes, `helix-${Date.now()}.png`);

  const dataset = { ...(req.metadata.fields || {}) };
  dataset.foto_producto = { type: 'image', asset_id: assetId };

  const designId = await createAutofillDesign(accessToken, templateId, dataset, req.metadata.title || 'HELIX');
  const downloadUrl = await exportDesignToPng(accessToken, designId);

  const outputDir = (req.metadata && req.metadata.outputDir) || process.cwd();
  fs.mkdirSync(outputDir, { recursive: true });
  const assetPath = path.join(outputDir, `canva-${Date.now()}.png`);
  await downloadPng(downloadUrl, assetPath);

  return {
    assetPath,
    providerId: PROVIDER_META.id,
    width: req.width,
    height: req.height,
    format: 'png',
    rawResponse: { templateId, designId, assetId, fieldsUsed: Object.keys(dataset) },
  };
}

module.exports = { PROVIDER_META, generate, resolveTemplateId, TEMPLATE_ID_BY_FAMILY };
