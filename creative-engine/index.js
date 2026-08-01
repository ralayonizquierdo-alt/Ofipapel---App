// Punto de entrada único de creative-engine/ — mismo principio que
// marketing-engine/intelligence/index.js: la superficie pública, nada
// más. Quien consuma este motor (una función Netlify futura, un CLI, un
// test) solo necesita este fichero.

const { createBrief } = require('./brief/contracts.js');
const { fromMarketingEngine } = require('./brief/from-marketing-engine.js');
const { prepareAssets } = require('./asset-pipeline/service.js');
const { generateVariants } = require('./variant-generator/service.js');
const { validateCreative } = require('./creative-validator/service.js');
const { getProvider, listProviders, listByKind } = require('./provider-manager/registry.js');
const { assertSupports, adaptToCapabilities } = require('./provider-manager/provider.interface.js');
const store = require('./creative-assets/store.js');
const { newCreativeId } = require('./shared/ids.js');

/**
 * Encadena todo el motor sobre un CreativeBrief ya validado: prepara
 * recursos, genera N variantes (con su prompt compuesto), intenta
 * generar cada una con el proveedor pedido, valida el resultado (o el
 * plan, si el proveedor todavía no está implementado) y guarda cada
 * versión en creative-assets/.
 *
 * Un proveedor "planned" (no implementado) NUNCA rompe el pipeline: se
 * distingue por `err.code === 'PROVIDER_NOT_IMPLEMENTED'` y la variante
 * queda marcada `pending-provider` — prompt.json y metadata.json se
 * guardan igual. Cualquier OTRO error (un bug real dentro de un
 * proveedor activo) SÍ se propaga — no hay que esconder un fallo real
 * detrás de la máscara de "no implementado todavía".
 *
 * @param {object} brief - CreativeBrief (ver brief/contracts.js)
 * @param {object} [options]
 * @param {string} [options.providerId='simulated']
 * @param {number} [options.variantCount=1] - uno de variant-generator/config.js#VARIANT_COUNTS
 * @param {string} [options.productPhotoPath] - foto real del producto, si existe
 * @returns {Promise<{creativeId: string, preparedAssets: object, variants: object[]}>}
 */
async function runCreativePipeline(brief, options = {}) {
  const providerId = options.providerId || 'simulated';
  const variantCount = options.variantCount || 1;

  const preparedAssets = prepareAssets(brief, { productPhotoPath: options.productPhotoPath });
  const variants = generateVariants(brief, preparedAssets, variantCount);

  const creativeId = newCreativeId(brief);
  store.createCreative(creativeId, {
    brand: brief.brand.id,
    product: brief.product.name,
    format: brief.format,
  });

  const provider = getProvider(providerId);
  const results = [];

  for (const variant of variants) {
    const { versionNumber, dir } = store.beginVersion(creativeId);

    assertSupports(provider, variant.generationRequest); // requisito duro: contentClass
    const { request: adaptedRequest, warnings: capabilityWarnings } = adaptToCapabilities(provider, variant.generationRequest);

    const request = {
      ...adaptedRequest,
      metadata: { ...(adaptedRequest.metadata || {}), outputDir: dir, creativeId, variantId: variant.variantId },
    };

    let generationResult = null;
    let providerStatus = 'ok';
    let providerError = null;

    try {
      generationResult = await provider.generate(request);
    } catch (err) {
      if (err.code === 'PROVIDER_NOT_IMPLEMENTED') {
        providerStatus = 'pending-provider';
        providerError = err.message;
      } else {
        throw err;
      }
    }

    const validation = validateCreative(variant.brief, preparedAssets, variant.composedPrompt, generationResult);

    store.saveVersion(creativeId, versionNumber, {
      prompt: variant.composedPrompt,
      metadata: {
        variantId: variant.variantId,
        angleId: variant.angleId,
        label: variant.label,
        providerId,
        providerStatus,
        providerError,
        capabilityWarnings,
        generationRequest: request,
        generationResult,
        validation,
      },
    });

    results.push({
      variantId: variant.variantId,
      label: variant.label,
      versionNumber,
      providerId,
      providerStatus,
      providerError,
      assetPath: generationResult ? generationResult.assetPath : null,
      composedPrompt: variant.composedPrompt,
      validation,
    });
  }

  return { creativeId, preparedAssets, variants: results };
}

module.exports = {
  createBrief,
  fromMarketingEngine,
  prepareAssets,
  generateVariants,
  validateCreative,
  getProvider,
  listProviders,
  listByKind,
  assets: store,
  runCreativePipeline,
};
