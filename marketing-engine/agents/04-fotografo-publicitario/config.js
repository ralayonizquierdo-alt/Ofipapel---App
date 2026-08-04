// Reglas de fidelidad — se aplican SIEMPRE, sin excepción, a cualquier
// ficha técnica de foto que produzca este agente. No son sugerencias: son
// las restricciones que 05-especialista-prompts debe trasladar tal cual al
// prompt final del proveedor de IA.
const FIDELITY_RULES = [
  'No modificar el producto real: mismas proporciones, mismos materiales.',
  'No inventar piezas, botones, etiquetas ni accesorios que el producto no tiene.',
  'No alterar los colores reales del producto.',
  'Máxima fidelidad fotográfica — esto es publicidad de producto real, no arte conceptual.',
];

// Especificación de foto por defecto según el layout elegido por el
// Director de Arte. Editar aquí para afinar sin tocar service.js.
const PHOTO_SPEC_BY_LAYOUT = {
  'layout-centrado': {
    angle: 'frontal, ligeramente en picado (15°)',
    background: 'fondo blanco de estudio, sin distracciones',
    lighting: 'luz suave difusa, sin sombras duras, resalta el producto',
  },
  'layout-diagonal': {
    angle: 'tres cuartos, producto ligeramente girado',
    background: 'fondo blanco de estudio con sombra de contacto sutil',
    lighting: 'luz direccional suave desde la izquierda',
  },
  default: {
    angle: 'frontal',
    background: 'fondo blanco de estudio',
    lighting: 'luz suave difusa',
  },
};

module.exports = { FIDELITY_RULES, PHOTO_SPEC_BY_LAYOUT };
