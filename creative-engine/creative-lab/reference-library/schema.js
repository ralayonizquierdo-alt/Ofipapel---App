// Contrato de una entrada de la Biblioteca de Referencias — la capa de
// "recetas" que combina ids de las 9 bibliotecas atómicas + los campos
// curatoriales que solo tienen sentido aquí. NO copia texto de las
// bibliotecas atómicas: cada campo *Id apunta a una entrada existente por
// id (verificado en tiempo de carga por reference-library/service.js
// contra creative-lab/libraries/index.js#getEntry — falla rápido si
// alguien referencia un id que no existe).
//
// 12 campos obligatorios pedidos explícitamente por el propietario +
// 2 heredados de su primera propuesta (quéHaceEspecial, porQuéFunciona)
// que sí aportan valor real ("estudiar por qué funcionan") sin coste de
// complejidad estructural — son texto libre, no bibliotecas nuevas.

const { assertShape, maybe, arrayOf } = require('../../shared/shapes.js');

const REFERENCE_ENTRY_SHAPE = {
  id: 'string',
  label: 'string',

  // Las 12 dimensiones pedidas — ids que referencian las bibliotecas
  // atómicas (excepto emotion/whenToUse/whenToAvoid, que son texto libre).
  styleId: 'string',
  compositionId: 'string',
  artDirectionId: 'string',
  lightingId: 'string',
  scenarioId: 'string',
  paletteHarmonyId: 'string',
  angleLensId: 'string',
  emotion: 'string',
  textSpaceId: 'string',
  idealProducts: arrayOf('string'),
  whenToUse: 'string',
  whenToAvoid: 'string',

  // Heredados de la propuesta original — por qué funciona, no solo qué es.
  whatMakesItSpecial: 'string',
  whyItWorksOnSocial: 'string',

  // Opcionales — puntos de extensión futuros, documentados en
  // ARCHITECTURE.md, sin forzar a las ~15 entradas semilla a rellenarlos.
  visualImpactLevel: maybe('number'), // 1-100, prioriza el shortlist si está presente
  sourceType: maybe('string'), // 'seed-textual' | 'campana-propia' | 'stock-licenciado' — nunca una copia de una imagen con derechos de terceros
  sourceRef: maybe('string'), // referencia (no la imagen en sí) — ver ARCHITECTURE.md
  performanceSignals: maybe('object'), // futuro enganche con marketing-engine/intelligence/learning-engine
  curatedAt: 'string',
};

function createReferenceEntry(input) {
  assertShape(input, REFERENCE_ENTRY_SHAPE, 'CreativeLabReferenceEntry');
  return input;
}

module.exports = { REFERENCE_ENTRY_SHAPE, createReferenceEntry };
