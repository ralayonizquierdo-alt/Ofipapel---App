// Flux — no implementado todavía. Solo arquitectura, registrado con sus
// capacidades declaradas.

const PROVIDER_META = {
  id: 'flux',
  label: 'Flux',
  status: 'planned',
  kind: 'image',
  capabilities: {
    contentClasses: ['photo', 'art'],
    supportsNegativePrompt: true,
    supportsReferenceImages: true,
    maxVariantsPerCall: 4,
    outputFormats: ['png', 'jpg'],
  },
};

async function generate() {
  const err = new Error(
    'Proveedor "flux" no implementado todavía (status: planned). Ver creative-engine/provider-manager/README.md.'
  );
  err.code = 'PROVIDER_NOT_IMPLEMENTED';
  throw err;
}

module.exports = { PROVIDER_META, generate };
