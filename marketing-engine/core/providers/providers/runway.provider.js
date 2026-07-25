// Proveedor de IA: Runway (generación/edición de vídeo). ESTADO: planned —
// sin API key integrada todavía. `kind: 'video'`, no 'image' — pensado para
// cuando el pipeline soporte Reels generados por IA, no solo posts estáticos.
// Activar: leer RUNWAY_API_KEY de process.env e implementar generate() aquí.
// No requiere tocar core/orchestrator.js ni ningún agents/*/service.js.

const PROVIDER_META = { id: 'runway', status: 'planned', kind: 'video' };

/**
 * @param {import('../provider.interface.js').GenerationRequest} req
 * @returns {Promise<import('../provider.interface.js').GenerationResult>}
 */
async function generate(req) {
  throw new Error(
    'Proveedor "runway" no implementado todavía (status: planned). ' +
    'Ver marketing-engine/core/providers/README.md para activarlo.'
  );
}

module.exports = { PROVIDER_META, generate };
