// Layouts predefinidos que el Director de Arte puede elegir en modo
// simulado, según la familia gráfica decidida por el Director Creativo.
// Añadir un layout nuevo aquí no requiere tocar service.js.

const LAYOUTS_BY_GRAPHIC_FAMILY = {
  'producto-sobre-fondo-marca': {
    layoutId: 'layout-centrado',
    composition: 'Producto centrado sobre placa clara con sombra, fondo de marca de fondo, texto en franja inferior reservada.',
    // 6 → 4 elementos (era el motivo real detrás de los rechazos por
    // "jerarquía sobrecargada" que veníamos arrastrando desde la primera
    // demo): se fusiona "eyebrow"+"badges" en un único nivel intermedio.
    hierarchy: ['logo', 'producto', 'titular', 'eslogan'],
    structure: 'vertical-1080x1920',
  },
  'oferta-destacada': {
    layoutId: 'layout-diagonal',
    composition: 'Franja diagonal de color de acento con el precio/oferta, producto desplazado a un lado.',
    // 5 → 4: "oferta" se fusiona con "logo" (misma franja superior en la
    // plantilla, ver templates/layout-diagonal.js) — mismo motivo que el
    // ajuste de producto-sobre-fondo-marca.
    hierarchy: ['logo+oferta', 'producto', 'titular', 'cta'],
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
