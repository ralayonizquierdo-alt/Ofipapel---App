// Registro central de proveedores creativos. Único punto del sistema que
// conoce la lista concreta de proveedores — ningún otro componente de
// creative-engine importa un *.provider.js directamente, todos pasan por
// aquí (mismo patrón que marketing-engine/core/providers/registry.js).
//
// Ver creative-engine/ARCHITECTURE.md, sección "Convivencia con
// marketing-engine" — ESTE registro es el canónico para generación
// creativa real desde ahora. El de marketing-engine/core/providers/ queda
// legado (no se toca, sigue usando "simulated" para el pipeline actual,
// pero no debe recibir proveedores nuevos).
//
// Añadir un proveedor nuevo el día de mañana: crear
// providers/mi-proveedor.provider.js cumpliendo provider.interface.js, y
// añadir UNA línea al mapa de abajo. Nada más cambia.

const { assertProviderShape } = require('./provider.interface.js');

const PROVIDERS = {
  simulated: require('./providers/simulated.provider.js'),
  'openai-images': require('./providers/openai-images.provider.js'),
  canva: require('./providers/canva.provider.js'),
  'adobe-firefly': require('./providers/adobe-firefly.provider.js'),
  ideogram: require('./providers/ideogram.provider.js'),
  flux: require('./providers/flux.provider.js'),
  runway: require('./providers/runway.provider.js'),
  veo: require('./providers/veo.provider.js'),
  kling: require('./providers/kling.provider.js'),
};

// Valida la forma de todos los proveedores al cargar el módulo, no en cada
// llamada — si alguien rompe el contrato de un provider.js, el fallo es
// inmediato y claro al arrancar, no a mitad de una generación.
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

/** @returns {object[]} metadatos de todos los proveedores registrados */
function listProviders() {
  return Object.values(PROVIDERS).map((p) => p.PROVIDER_META);
}

/** @param {'image'|'video'|'template'} kind @returns {object[]} */
function listByKind(kind) {
  return listProviders().filter((meta) => meta.kind === kind);
}

module.exports = { getProvider, listProviders, listByKind };
