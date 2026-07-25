// OpenAI Images (gpt-image-1 / DALL·E) — no implementado todavía. Solo
// arquitectura: registrado, con capacidades declaradas, listo para que
// activarlo sea escribir el cuerpo de generate() y cambiar `status` a
// 'active'. Ver README.md de esta carpeta para el procedimiento completo.

const PROVIDER_META = {
  id: 'openai-images',
  label: 'OpenAI Images',
  status: 'planned',
  kind: 'image',
  capabilities: {
    contentClasses: ['photo', 'art'],
    // La API de imágenes de OpenAI no admite negative prompt nativo —
    // se modela como "no soportado" en vez de simularlo mal en el prompt.
    supportsNegativePrompt: false,
    supportsReferenceImages: true, // endpoint de edits/variaciones
    maxVariantsPerCall: 10,
    outputFormats: ['png'],
  },
};

async function generate() {
  const err = new Error(
    'Proveedor "openai-images" no implementado todavía (status: planned). Ver creative-engine/provider-manager/README.md para activarlo.'
  );
  err.code = 'PROVIDER_NOT_IMPLEMENTED';
  throw err;
}

module.exports = { PROVIDER_META, generate };
