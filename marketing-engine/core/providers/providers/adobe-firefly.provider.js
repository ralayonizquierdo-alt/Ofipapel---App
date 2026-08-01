// Proveedor de IA: Adobe Firefly Services API. ESTADO: planned.
//
// IMPORTANTE al activar este proveedor: NO reimplementar la llamada OAuth
// Server-to-Server ni la petición a POST /v3/images/generate desde cero.
// Ese flujo completo YA EXISTE, escrito y documentado (aunque sin probar
// con credenciales reales todavía) en:
//
//   design-studio/scripts/firefly-generate.js
//
// generate() debe DELEGAR en ese script (p.ej. invocándolo con
// child_process.execFile, o extrayendo su lógica a una función exportable
// si se prefiere llamarlo in-process) en vez de duplicar la lógica de
// autenticación aquí — ver design-studio/README.md sección 1C para el flujo
// completo y las variables de entorno necesarias (FIREFLY_CLIENT_ID,
// FIREFLY_CLIENT_SECRET).

const PROVIDER_META = { id: 'adobe-firefly', status: 'planned', kind: 'image' };

/**
 * @param {import('../provider.interface.js').GenerationRequest} req
 * @returns {Promise<import('../provider.interface.js').GenerationResult>}
 */
async function generate(req) {
  throw new Error(
    'Proveedor "adobe-firefly" no implementado todavía (status: planned). ' +
    'Al activarlo, delegar en design-studio/scripts/firefly-generate.js (ya escrito) ' +
    'en vez de reimplementar el flujo OAuth — ver design-studio/README.md sección 1C.'
  );
}

module.exports = { PROVIDER_META, generate };
