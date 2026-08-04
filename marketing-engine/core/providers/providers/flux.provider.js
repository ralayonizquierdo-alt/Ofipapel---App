// Proveedor de IA: Flux (Black Forest Labs, vía API propia o un gateway como
// Replicate/fal.ai). ESTADO: planned — sin API key integrada todavía.
// Activar: decidir el gateway concreto, leer la key de process.env e
// implementar generate() aquí. No requiere tocar core/orchestrator.js ni
// ningún agents/*/service.js.

const PROVIDER_META = { id: 'flux', status: 'planned', kind: 'image' };

/**
 * @param {import('../provider.interface.js').GenerationRequest} req
 * @returns {Promise<import('../provider.interface.js').GenerationResult>}
 */
async function generate(req) {
  throw new Error(
    'Proveedor "flux" no implementado todavía (status: planned). ' +
    'Ver marketing-engine/core/providers/README.md para activarlo.'
  );
}

module.exports = { PROVIDER_META, generate };
