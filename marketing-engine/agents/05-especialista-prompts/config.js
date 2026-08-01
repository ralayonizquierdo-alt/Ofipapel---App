// Qué proveedor usar por defecto y qué dimensiones pedir según la
// estructura decidida por el Director de Arte. Cambiar DEFAULT_PROVIDER_ID
// a un id "planned" (ver core/providers/registry.js) es lo único que hace
// falta el día que se active un proveedor real — no requiere tocar
// service.js ni el orquestador.

const DEFAULT_PROVIDER_ID = 'simulated';

const DIMENSIONS_BY_STRUCTURE = {
  'vertical-1080x1920': { width: 1080, height: 1920 },
  default: { width: 1080, height: 1350 },
};

module.exports = { DEFAULT_PROVIDER_ID, DIMENSIONS_BY_STRUCTURE };
