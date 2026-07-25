// El resultado de este agente se guarda en job.state['director-creativo']
// con esta forma. Reexporta OUTPUT_SHAPE de interface.js — no la redeclara
// (una sola fuente de verdad del contrato) — este fichero documenta
// específicamente DÓNDE vive dentro del Job compartido.

const { OUTPUT_SHAPE } = require('./interface.js');

module.exports = { STATE_KEY: 'director-creativo', SHAPE: OUTPUT_SHAPE };
