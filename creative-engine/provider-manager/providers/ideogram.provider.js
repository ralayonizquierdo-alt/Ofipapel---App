// Ideogram — no implementado todavía. Nota de diseño relevante si se
// activa: Ideogram es conocido por renderizar TEXTO legible dentro de la
// imagen mejor que la mayoría de modelos de difusión — lo que tensiona el
// principio de "composición posterior" de este motor (creative-engine
// genera imagen/fondo con espacio negativo; texto y logo se componen
// después, ver ARCHITECTURE.md). Si se activa Ideogram, decidir
// explícitamente si se le sigue pidiendo espacio vacío (consistente con
// el resto de proveedores) o si se le permite renderizar el titular/CTA
// directamente — no cambiarlo en silencio, afecta a qué mide
// creative-validator/ en "espacioTextos".

const PROVIDER_META = {
  id: 'ideogram',
  label: 'Ideogram',
  status: 'planned',
  kind: 'image',
  capabilities: {
    contentClasses: ['photo', 'art'],
    supportsNegativePrompt: true,
    supportsReferenceImages: true,
    maxVariantsPerCall: 8,
    outputFormats: ['png'],
  },
};

async function generate() {
  const err = new Error(
    'Proveedor "ideogram" no implementado todavía (status: planned). Ver creative-engine/provider-manager/README.md.'
  );
  err.code = 'PROVIDER_NOT_IMPLEMENTED';
  throw err;
}

module.exports = { PROVIDER_META, generate };
