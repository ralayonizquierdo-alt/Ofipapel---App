// Proveedor de IA: Google (Imagen / Gemini image generation). ESTADO:
// planned — sin SDK/credenciales integrados todavía. Activar: instalar el
// SDK de Google AI, leer GOOGLE_API_KEY de process.env, e implementar
// generate() aquí. No requiere tocar core/orchestrator.js ni ningún
// agents/*/service.js.

const PROVIDER_META = { id: 'google-images', status: 'planned', kind: 'image' };

/**
 * @param {import('../provider.interface.js').GenerationRequest} req
 * @returns {Promise<import('../provider.interface.js').GenerationResult>}
 */
async function generate(req) {
  throw new Error(
    'Proveedor "google-images" no implementado todavía (status: planned). ' +
    'Ver marketing-engine/core/providers/README.md para activarlo.'
  );
}

module.exports = { PROVIDER_META, generate };
