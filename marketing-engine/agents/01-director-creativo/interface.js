// Contrato de entrada/salida del Director Creativo — ver README.md de este
// agente para la responsabilidad completa y los límites.

const { JOB_INPUT_SHAPE } = require('../../core/contracts/job.contract.js');
const { enumOf } = require('../../core/contracts/shapes.js');

// Lo único que este agente necesita del Job es el brief de entrada — es el
// primer agente del pipeline, no depende de ningún otro.
const INPUT_SHAPE = {
  input: JOB_INPUT_SHAPE,
};

const OUTPUT_SHAPE = {
  strategy: 'string',
  postType: enumOf('foto', 'carrusel', 'reel'),
  tone: 'string',
  channel: enumOf('instagram', 'facebook', 'whatsapp', 'ambas'),
  graphicFamily: 'string',
};

module.exports = { INPUT_SHAPE, OUTPUT_SHAPE };
