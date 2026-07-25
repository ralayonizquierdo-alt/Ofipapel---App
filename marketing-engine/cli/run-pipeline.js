#!/usr/bin/env node
// CLI del motor de marketing — ejecuta el pipeline completo de 8 agentes
// sobre un brief de producto en JSON.
//
// Uso:
//   node marketing-engine/cli/run-pipeline.js marketing-engine/campaigns-input/ejemplo-producto-generico.json
//
// El brief debe cumplir JOB_INPUT_SHAPE (ver
// marketing-engine/core/contracts/job.contract.js): productName, category,
// brand (ofipapel|canarias-ink|falcontrol), description, channel (opcional),
// images (array, puede ir vacío).
//
// No requiere ninguna variable de entorno hoy — el único proveedor activo
// es "simulated" (sin red, sin credenciales). Ver
// marketing-engine/core/providers/README.md para activar un proveedor real.

const fs = require('node:fs');
const path = require('node:path');
const { createJob } = require('../core/contracts/job.contract.js');
const { runPipeline } = require('../core/orchestrator.js');
const { eventLogPath } = require('../core/event-log.js');
const { jobFilePath } = require('../core/job-store.js');

async function main() {
  const briefArg = process.argv[2];
  if (!briefArg) {
    console.error('Uso: node marketing-engine/cli/run-pipeline.js <brief.json>');
    process.exit(1);
  }

  const briefPath = path.resolve(briefArg);
  if (!fs.existsSync(briefPath)) {
    console.error(`No existe el fichero de brief: ${briefPath}`);
    process.exit(1);
  }

  let input;
  try {
    input = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
  } catch (err) {
    console.error(`El brief no es JSON válido: ${err.message}`);
    process.exit(1);
  }

  let job;
  try {
    job = createJob(input);
  } catch (err) {
    console.error(`Brief inválido: ${err.message}`);
    process.exit(1);
  }

  console.log(`Job creado: ${job.id}`);
  console.log(`Producto: ${job.input.productName} (${job.input.brand})`);
  console.log('Ejecutando pipeline...\n');

  const finalJob = await runPipeline(job);

  console.log(`\nEstado final: ${finalJob.status}`);
  console.log(`Job guardado en: ${jobFilePath(finalJob.id)}`);
  console.log(`Traza completa en: ${eventLogPath(finalJob.id)}`);

  if (finalJob.status === 'completed') {
    const pieza = finalJob.state.maquetador && finalJob.state.maquetador.renderedAssetPath;
    console.log(`Pieza generada: ${pieza}`);
    process.exit(0);
  } else {
    console.error('El pipeline no completó — revisa la traza para ver en qué agente se quedó y por qué.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fallo inesperado ejecutando el pipeline:', err);
  process.exit(1);
});
