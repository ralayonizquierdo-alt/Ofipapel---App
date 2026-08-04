// Proveedor de IA: Google Veo (generación de vídeo). ESTADO: planned — sin
// API key integrada todavía. `kind: 'video'`, igual que runway.provider.js
// — alternativa/comparativa cuando se active generación de Reels por IA.
// Activar: leer la credencial correspondiente de process.env e implementar
// generate() aquí. No requiere tocar core/orchestrator.js ni ningún
// agents/*/service.js.

const PROVIDER_META = { id: 'veo', status: 'planned', kind: 'video' };

/**
 * @param {import('../provider.interface.js').GenerationRequest} req
 * @returns {Promise<import('../provider.interface.js').GenerationResult>}
 */
async function generate(req) {
  throw new Error(
    'Proveedor "veo" no implementado todavía (status: planned). ' +
    'Ver marketing-engine/core/providers/README.md para activarlo.'
  );
}

module.exports = { PROVIDER_META, generate };
