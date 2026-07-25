// Checklist determinista y a qué agente devolver el job si un check
// concreto falla. Añadir un check nuevo aquí no requiere tocar service.js
// más que el bucle que ya los recorre.

const CHECKS = [
  {
    name: 'marca-aprobada',
    returnTo: 'director-arte',
    evaluate: (job) => Boolean(job.state['guardian-marca'] && job.state['guardian-marca'].approved),
  },
  {
    name: 'copy-tiene-cta',
    returnTo: 'copywriter',
    evaluate: (job) => Boolean(job.state.copywriter && job.state.copywriter.cta && job.state.copywriter.cta.trim().length > 0),
  },
  {
    name: 'copy-tiene-hashtags',
    returnTo: 'copywriter',
    evaluate: (job) => Boolean(job.state.copywriter && Array.isArray(job.state.copywriter.hashtags) && job.state.copywriter.hashtags.length > 0),
  },
  {
    name: 'pieza-renderizada-existe',
    returnTo: 'maquetador',
    evaluate: (job) => {
      const fs = require('node:fs');
      const p = job.state.maquetador && job.state.maquetador.renderedAssetPath;
      return Boolean(p && fs.existsSync(p));
    },
  },
];

module.exports = { CHECKS };
