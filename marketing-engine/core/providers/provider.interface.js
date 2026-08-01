// Contrato común que debe cumplir CUALQUIER proveedor de generación de
// imágenes/vídeo por IA — presente (simulated) o futuro (OpenAI Images,
// Google, Ideogram, Adobe Firefly, Flux, Runway, Veo).
//
// Añadir un proveedor nuevo el día de mañana = un fichero nuevo en
// providers/ que cumpla este contrato + una línea en registry.js. Cero
// cambios en core/orchestrator.js ni en ningún agents/*/service.js.

const { assertShape, enumOf } = require('../contracts/shapes.js');

/**
 * @typedef {Object} GenerationRequest
 * @property {string} prompt
 * @property {number} width
 * @property {number} height
 * @property {'photo'|'art'|'video'} contentClass
 * @property {Object} [metadata] - referencia a job/agente que originó la petición, para trazabilidad
 */
const GENERATION_REQUEST_SHAPE = {
  prompt: 'string',
  width: 'number',
  height: 'number',
  contentClass: enumOf('photo', 'art', 'video'),
};

/**
 * @typedef {Object} GenerationResult
 * @property {string} assetPath - ruta local al archivo generado
 * @property {string} providerId
 * @property {number} width - dimensiones reales del asset generado (el proveedor puede no respetar exactamente lo pedido)
 * @property {number} height
 * @property {Object} rawResponse
 */
const GENERATION_RESULT_SHAPE = {
  assetPath: 'string',
  providerId: 'string',
  width: 'number',
  height: 'number',
  rawResponse: 'object',
};

const PROVIDER_META_SHAPE = {
  id: 'string',
  status: enumOf('active', 'planned'),
  kind: enumOf('image', 'video'),
};

/**
 * Valida que un módulo de proveedor cumple el contrato mínimo: expone
 * PROVIDER_META con la forma correcta y una función `generate`. No valida
 * el COMPORTAMIENTO de generate (eso lo prueba cada proveedor por separado
 * cuando se active de verdad) — solo la forma, igual que el resto de
 * contratos de este sistema.
 *
 * @param {object} providerModule
 */
function assertProviderShape(providerModule) {
  if (!providerModule || typeof providerModule !== 'object') {
    throw new Error('Proveedor inválido: se esperaba un módulo con PROVIDER_META y generate()');
  }
  assertShape(providerModule.PROVIDER_META, PROVIDER_META_SHAPE, 'PROVIDER_META');
  if (typeof providerModule.generate !== 'function') {
    throw new Error(`Proveedor "${providerModule.PROVIDER_META.id}" no expone una función generate()`);
  }
}

module.exports = {
  GENERATION_REQUEST_SHAPE,
  GENERATION_RESULT_SHAPE,
  PROVIDER_META_SHAPE,
  assertProviderShape,
};
