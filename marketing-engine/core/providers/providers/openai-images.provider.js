// Proveedor de IA: OpenAI Images. ESTADO: planned — sin SDK/credenciales
// integrados todavía. Activar: instalar el SDK oficial de OpenAI (primer
// proveedor real activado = señal para crear marketing-engine/package.json,
// ver README.md), leer OPENAI_API_KEY de process.env, e implementar
// generate() aquí. No requiere tocar core/orchestrator.js ni ningún
// agents/*/service.js — solo este fichero y una línea en registry.js si el
// id cambiara (no debería).

const PROVIDER_META = { id: 'openai-images', status: 'planned', kind: 'image' };

/**
 * @param {import('../provider.interface.js').GenerationRequest} req
 * @returns {Promise<import('../provider.interface.js').GenerationResult>}
 */
async function generate(req) {
  throw new Error(
    'Proveedor "openai-images" no implementado todavía (status: planned). ' +
    'Ver marketing-engine/core/providers/README.md para activarlo.'
  );
}

module.exports = { PROVIDER_META, generate };
