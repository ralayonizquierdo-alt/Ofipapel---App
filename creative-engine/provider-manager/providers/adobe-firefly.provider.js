// Adobe Firefly — no implementado todavía. `design-studio/scripts/firefly-generate.js`
// ya tiene el flujo OAuth Server-to-Server + POST /v3/images/generate
// completo (sin probar, sin credenciales en este entorno — ver
// FIREFLY_CLIENT_ID/FIREFLY_CLIENT_SECRET documentadas en CLAUDE.md).
// Activar este proveedor es delegar generate() a ese script existente, no
// reimplementar el cliente HTTP desde cero.

const PROVIDER_META = {
  id: 'adobe-firefly',
  label: 'Adobe Firefly',
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
    'Proveedor "adobe-firefly" no implementado todavía (status: planned). Ver design-studio/scripts/firefly-generate.js y creative-engine/provider-manager/README.md.'
  );
  err.code = 'PROVIDER_NOT_IMPLEMENTED';
  throw err;
}

module.exports = { PROVIDER_META, generate };
