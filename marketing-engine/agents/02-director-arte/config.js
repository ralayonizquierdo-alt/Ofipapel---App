// Layouts predefinidos que el Director de Arte puede elegir en modo
// simulado, según la familia gráfica decidida por el Director Creativo.
// Añadir un layout nuevo aquí no requiere tocar service.js.

const LAYOUTS_BY_GRAPHIC_FAMILY = {
  'producto-sobre-fondo-marca': {
    layoutId: 'layout-centrado',
    composition: 'Producto centrado sobre placa clara con sombra, fondo de marca de fondo, texto en franja inferior reservada.',
    hierarchy: ['logo', 'eyebrow', 'producto', 'badges de características', 'titular', 'eslogan'],
    structure: 'vertical-1080x1920',
  },
  'oferta-destacada': {
    layoutId: 'layout-diagonal',
    composition: 'Franja diagonal de color de acento con el precio/oferta, producto desplazado a un lado.',
    hierarchy: ['logo', 'oferta', 'producto', 'titular', 'cta'],
    structure: 'vertical-1080x1920',
  },
  default: {
    layoutId: 'layout-centrado',
    composition: 'Producto centrado sobre placa clara con sombra, fondo de marca de fondo, texto en franja inferior reservada.',
    hierarchy: ['logo', 'producto', 'titular'],
    structure: 'vertical-1080x1920',
  },
};

module.exports = { LAYOUTS_BY_GRAPHIC_FAMILY };
