// Veo (Google) — generación de vídeo, no implementado todavía.

const PROVIDER_META = {
  id: 'veo',
  label: 'Veo',
  status: 'planned',
  kind: 'video',
  capabilities: {
    contentClasses: ['video'],
    supportsNegativePrompt: true,
    supportsReferenceImages: true,
    maxVariantsPerCall: 1,
    outputFormats: ['mp4'],
  },
};

async function generate() {
  const err = new Error(
    'Proveedor "veo" no implementado todavía (status: planned, kind: video). Ver creative-engine/provider-manager/README.md.'
  );
  err.code = 'PROVIDER_NOT_IMPLEMENTED';
  throw err;
}

module.exports = { PROVIDER_META, generate };
