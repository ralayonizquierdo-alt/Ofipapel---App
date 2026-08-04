// Registro central de proveedores de IA. Único punto del sistema que conoce
// la lista concreta de proveedores — ni el orquestador ni ningún agente
// importan un provider.js directamente, siempre pasan por aquí.
//
// Añadir un proveedor nuevo el día de mañana: crear
// providers/mi-proveedor.provider.js cumpliendo provider.interface.js, y
// añadir UNA línea al mapa de abajo. Nada más cambia.

const { assertProviderShape } = require('./provider.interface.js');

const PROVIDERS = {
  simulated: require('./providers/simulated.provider.js'),
  'openai-images': require('./providers/openai-images.provider.js'),
  'google-images': require('./providers/google-images.provider.js'),
  ideogram: require('./providers/ideogram.provider.js'),
  'adobe-firefly': require('./providers/adobe-firefly.provider.js'),
  flux: require('./providers/flux.provider.js'),
  runway: require('./providers/runway.provider.js'),
  veo: require('./providers/veo.provider.js'),
};

// Valida la forma de todos los proveedores al cargar el módulo, no en cada
// llamada — si alguien rompe el contrato de un provider.js, el fallo es
// inmediato y claro al arrancar el pipeline, no a mitad de una ejecución.
for (const [id, providerModule] of Object.entries(PROVIDERS)) {
  assertProviderShape(providerModule);
  if (providerModule.PROVIDER_META.id !== id) {
    throw new Error(
      `Proveedor mal registrado: la clave en registry.js es "${id}" pero PROVIDER_META.id declara "${providerModule.PROVIDER_META.id}"`
    );
  }
}

/**
 * @param {string} id
 * @returns {{PROVIDER_META: object, generate: Function}}
 */
function getProvider(id) {
  const provider = PROVIDERS[id];
  if (!provider) {
    const disponibles = Object.keys(PROVIDERS).join(', ');
    throw new Error(`Proveedor desconocido: "${id}". Disponibles: ${disponibles}`);
  }
  return provider;
}

/**
 * @returns {object[]} metadatos de todos los proveedores registrados
 */
function listProviders() {
  return Object.values(PROVIDERS).map((p) => p.PROVIDER_META);
}

module.exports = { getProvider, listProviders };
