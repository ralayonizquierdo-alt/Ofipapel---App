// Runway — generación de vídeo, no implementado todavía. Primer proveedor
// de kind:'video' del registro: durationSeconds sí aplica,
// outputFormats es mp4 en vez de imagen estática.

const PROVIDER_META = {
  id: 'runway',
  label: 'Runway',
  status: 'planned',
  kind: 'video',
  capabilities: {
    contentClasses: ['video'],
    supportsNegativePrompt: false,
    supportsReferenceImages: true, // vídeo a partir de una imagen de referencia
    maxVariantsPerCall: 1,
    outputFormats: ['mp4'],
  },
};

async function generate() {
  const err = new Error(
    'Proveedor "runway" no implementado todavía (status: planned, kind: video). Ver creative-engine/provider-manager/README.md.'
  );
  err.code = 'PROVIDER_NOT_IMPLEMENTED';
  throw err;
}

module.exports = { PROVIDER_META, generate };
