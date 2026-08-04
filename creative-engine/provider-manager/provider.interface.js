// Contrato común que debe cumplir CUALQUIER proveedor creativo — presente
// (simulated) o futuro (OpenAI Images, Canva, Adobe Firefly, Ideogram,
// Flux, Runway, Veo, Kling). Añadir un proveedor nuevo el día de mañana =
// un fichero nuevo en providers/ que cumpla este contrato + una línea en
// registry.js. Cero cambios en asset-pipeline/, prompt-composer/,
// variant-generator/ ni index.js.
//
// Más amplio que el de marketing-engine/core/providers/provider.interface.js
// a propósito: creative-engine debe poder registrar proveedores de vídeo
// (durationSeconds) y de relleno de plantilla (contentClass:'template',
// como Canva — no es "prompt in, píxeles out"), no solo imagen estática.

const { assertShape, enumOf, arrayOf, maybe } = require('../shared/shapes.js');

const CONTENT_CLASS = enumOf('photo', 'art', 'video', 'template');
const OUTPUT_FORMAT = enumOf('png', 'jpg', 'mp4', 'webm', 'svg');

/**
 * @typedef {Object} GenerationRequest
 * @property {string} prompt
 * @property {string} [negativePrompt]
 * @property {number} width
 * @property {number} height
 * @property {number} [durationSeconds] - solo contentClass:'video'
 * @property {'photo'|'art'|'video'|'template'} contentClass
 * @property {string[]} referenceImages - rutas/data-URLs; [] si no hay ninguna
 * @property {Object} [metadata] - libre; p. ej. outputDir para dónde escribir, o templateId/fields para Canva
 */
const GENERATION_REQUEST_SHAPE = {
  prompt: 'string',
  negativePrompt: maybe('string'),
  width: 'number',
  height: 'number',
  durationSeconds: maybe('number'),
  contentClass: CONTENT_CLASS,
  referenceImages: arrayOf('string'),
  metadata: maybe('object'),
};

/**
 * @typedef {Object} GenerationResult
 * @property {string} assetPath - ruta local al archivo generado
 * @property {string} providerId
 * @property {number} width
 * @property {number} height
 * @property {number} [durationSeconds]
 * @property {'png'|'jpg'|'mp4'|'webm'|'svg'} format
 * @property {Object} rawResponse
 */
const GENERATION_RESULT_SHAPE = {
  assetPath: 'string',
  providerId: 'string',
  width: 'number',
  height: 'number',
  durationSeconds: maybe('number'),
  format: OUTPUT_FORMAT,
  rawResponse: 'object',
};

const CAPABILITIES_SHAPE = {
  contentClasses: arrayOf(CONTENT_CLASS),
  supportsNegativePrompt: 'boolean',
  supportsReferenceImages: 'boolean',
  maxVariantsPerCall: 'number',
  outputFormats: arrayOf(OUTPUT_FORMAT),
};

const PROVIDER_META_SHAPE = {
  id: 'string',
  label: 'string',
  status: enumOf('active', 'planned'),
  kind: enumOf('image', 'video', 'template'),
  capabilities: CAPABILITIES_SHAPE,
};

/**
 * Valida que un módulo de proveedor tiene la forma correcta (PROVIDER_META
 * + generate()). NO valida el comportamiento de generate() en tiempo de
 * ejecución — eso lo prueba cli/run-creative-demo.js.
 */
function assertProviderShape(providerModule) {
  if (!providerModule || typeof providerModule !== 'object') {
    throw new Error('Módulo de proveedor inválido: se esperaba un objeto con PROVIDER_META y generate()');
  }
  assertShape(providerModule.PROVIDER_META, PROVIDER_META_SHAPE, 'PROVIDER_META');
  if (typeof providerModule.generate !== 'function') {
    throw new Error(`Proveedor "${providerModule.PROVIDER_META.id}": falta generate() o no es una función`);
  }
}

/**
 * Rechaza ANTES de llamar a generate() si el proveedor no puede cumplir el
 * requisito DURO de la petición: el contentClass. Pedir vídeo a un
 * proveedor de solo imagen, o una foto a un proveedor de solo plantillas
 * (Canva), falla aquí con un mensaje claro — no dentro de generate() con
 * un error específico de un SDK. Es lo que hace que "cambiar de proveedor
 * sin modificar el resto del sistema" sea seguro de verdad.
 * @param {object} providerModule
 * @param {object} request - GenerationRequest
 */
function assertSupports(providerModule, request) {
  const { capabilities, id } = providerModule.PROVIDER_META;

  if (!capabilities.contentClasses.includes(request.contentClass)) {
    throw new Error(`Proveedor "${id}" no soporta contentClass "${request.contentClass}" — admite: ${capabilities.contentClasses.join(', ')}`);
  }
}

/**
 * Adapta una petición a las capacidades SUAVES del proveedor
 * (negativePrompt, imágenes de referencia) — las quita si no las soporta,
 * en vez de fallar. A diferencia de contentClass (requisito duro,
 * assertSupports), que un proveedor no soporte negativePrompt es normal
 * (la propia API de OpenAI Images no lo admite) y no debería impedir
 * generar con él — solo perder ese matiz. Devuelve la petición adaptada +
 * un aviso por cada campo eliminado, para que quede constancia en
 * metadata.json (ver creative-assets/store.js) de qué se perdió al
 * elegir ese proveedor.
 * @param {object} providerModule
 * @param {object} request - GenerationRequest
 * @returns {{request: object, warnings: string[]}}
 */
function adaptToCapabilities(providerModule, request) {
  const { capabilities, id } = providerModule.PROVIDER_META;
  const warnings = [];
  const adapted = { ...request };

  if (adapted.negativePrompt && !capabilities.supportsNegativePrompt) {
    warnings.push(`Proveedor "${id}" no soporta negativePrompt — se descarta para esta petición.`);
    adapted.negativePrompt = undefined;
  }
  if (adapted.referenceImages.length > 0 && !capabilities.supportsReferenceImages) {
    warnings.push(`Proveedor "${id}" no soporta imágenes de referencia — se descartan ${adapted.referenceImages.length} imagen(es) para esta petición.`);
    adapted.referenceImages = [];
  }

  return { request: adapted, warnings };
}

module.exports = {
  CONTENT_CLASS,
  OUTPUT_FORMAT,
  GENERATION_REQUEST_SHAPE,
  GENERATION_RESULT_SHAPE,
  CAPABILITIES_SHAPE,
  PROVIDER_META_SHAPE,
  assertProviderShape,
  assertSupports,
  adaptToCapabilities,
};
