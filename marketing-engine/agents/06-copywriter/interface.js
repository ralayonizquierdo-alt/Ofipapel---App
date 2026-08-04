// Contrato de entrada/salida del Copywriter.
//
// NOTA DE DISEÑO: el diagrama de flujo que dio el propietario no menciona
// explícitamente dónde encaja el Copywriter (solo enumera 8 agentes en la
// lista de responsabilidades, pero el diagrama de flujo salta de
// "Proveedor de IA" a "Maquetador" a "Control de Calidad"). Se decidió
// colocarlo justo ANTES de 07-maquetador porque el propio Maquetador se
// define como "recibe imágenes, fondos, ELEMENTOS" — el copy es uno de
// esos elementos que necesita ya existir para poder maquetar el titular
// sobre la pieza (igual que en la campaña real de vídeo de producto: el
// titular se compone en la pieza final, no se añade después). No depende
// de nada que produzca el Maquetador, así que no hay ciclo. Ver
// ARCHITECTURE.md para el razonamiento completo.

const { JOB_INPUT_SHAPE } = require('../../core/contracts/job.contract.js');
const { OUTPUT_SHAPE: DIRECTOR_CREATIVO_OUTPUT } = require('../01-director-creativo/interface.js');
const { arrayOf } = require('../../core/contracts/shapes.js');

const INPUT_SHAPE = {
  input: JOB_INPUT_SHAPE,
  state: {
    'director-creativo': DIRECTOR_CREATIVO_OUTPUT,
  },
};

const OUTPUT_SHAPE = {
  title: 'string',
  body: 'string',
  cta: 'string',
  hashtags: arrayOf('string'),
  description: 'string',
};

module.exports = { INPUT_SHAPE, OUTPUT_SHAPE };
