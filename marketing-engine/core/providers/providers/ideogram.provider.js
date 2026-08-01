// Proveedor de IA: Ideogram (fuerte en composición con texto/tipografía
// dentro de la imagen). ESTADO: planned — sin API key integrada todavía.
// Activar: leer IDEOGRAM_API_KEY de process.env e implementar generate()
// aquí. No requiere tocar core/orchestrator.js ni ningún agents/*/service.js.

const PROVIDER_META = { id: 'ideogram', status: 'planned', kind: 'image' };

/**
 * @param {import('../provider.interface.js').GenerationRequest} req
 * @returns {Promise<import('../provider.interface.js').GenerationResult>}
 */
async function generate(req) {
  throw new Error(
    'Proveedor "ideogram" no implementado todavía (status: planned). ' +
    'Ver marketing-engine/core/providers/README.md para activarlo.'
  );
}

module.exports = { PROVIDER_META, generate };
