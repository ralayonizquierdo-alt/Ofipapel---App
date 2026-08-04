// Canva — no implementado todavía. Estructuralmente distinto del resto:
// no es "prompt in, píxeles out", es "rellena esta plantilla de marca ya
// diseñada con estos campos". Se registra con `kind:'template'` y
// `contentClasses:['template']` en vez de forzarlo al molde de los
// proveedores generativos — así una petición con contentClass:'photo'
// nunca llega aquí por error (provider.interface.js#assertSupports la
// rechaza antes de intentarlo).
//
// Cuando se active: generate(req) leerá req.metadata.templateId +
// req.metadata.fields (texto/imagen/color por campo de la plantilla) en
// vez de construir nada a partir de req.prompt — el campo `prompt` queda
// vacío o descriptivo únicamente, no se envía a Canva.

const PROVIDER_META = {
  id: 'canva',
  label: 'Canva (relleno de plantilla de marca)',
  status: 'planned',
  kind: 'template',
  capabilities: {
    contentClasses: ['template'],
    supportsNegativePrompt: false,
    supportsReferenceImages: true, // la foto de producto como campo de la plantilla
    maxVariantsPerCall: 1,
    outputFormats: ['png'],
  },
};

async function generate() {
  const err = new Error(
    'Proveedor "canva" no implementado todavía (status: planned, kind: template — requiere metadata.templateId + metadata.fields). Ver creative-engine/provider-manager/README.md.'
  );
  err.code = 'PROVIDER_NOT_IMPLEMENTED';
  throw err;
}

module.exports = { PROVIDER_META, generate };
