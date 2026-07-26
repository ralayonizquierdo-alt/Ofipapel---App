#!/usr/bin/env node
// CLI de demostración de Creative Lab — corre el flujo completo (Análisis
// → Concepto creativo ×8-12 → Moodboard → Prompt maestro → Concept Score
// capa 1 → shortlist → proveedor real → Concept Score capa 2 → umbral +
// reintentos) sobre un brief JSON.
//
// Uso:
//   node creative-engine/creative-lab/cli/run-creative-lab-demo.js <brief.json> [--provider id] [--concepts N] [--from-marketing-engine] [--json]
//
// --from-marketing-engine: igual que en creative-engine/cli/run-creative-demo.js.
// --provider: id de provider-manager/registry.js (por defecto "simulated").
// --concepts: 8-12 (por defecto 10).
// --json: vuelca el resultado completo.

const fs = require('node:fs');
const path = require('node:path');
const { createBrief, fromMarketingEngine } = require('../../index.js');
const { runCreativeLab } = require('../index.js');

function parseArgs(argv) {
  const args = { brief: null, provider: 'simulated', concepts: 10, fromMarketingEngine: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--provider') args.provider = argv[++i];
    else if (argv[i] === '--concepts') args.concepts = Number(argv[++i]);
    else if (argv[i] === '--from-marketing-engine') args.fromMarketingEngine = true;
    else if (argv[i] === '--json') args.json = true;
    else if (!args.brief) args.brief = argv[i];
  }
  return args;
}

async function main() {
  const { brief: briefArg, provider, concepts, fromMarketingEngine: useMapper, json } = parseArgs(process.argv.slice(2));

  if (!briefArg) {
    console.error('Uso: node creative-engine/creative-lab/cli/run-creative-lab-demo.js <brief.json> [--provider id] [--concepts N] [--from-marketing-engine] [--json]');
    process.exit(1);
  }

  const briefPath = path.resolve(briefArg);
  if (!fs.existsSync(briefPath)) {
    console.error(`No existe el fichero de brief: ${briefPath}`);
    process.exit(1);
  }

  let rawInput;
  try {
    rawInput = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
  } catch (err) {
    console.error(`El brief no es JSON válido: ${err.message}`);
    process.exit(1);
  }

  let brief;
  try {
    brief = useMapper ? fromMarketingEngine(rawInput) : createBrief(rawInput);
  } catch (err) {
    console.error(`Brief inválido: ${err.message}`);
    process.exit(1);
  }

  const result = await runCreativeLab(brief, { providerId: provider, conceptCount: concepts });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Producto: ${brief.product.name} (${brief.brand.id})`);
  console.log(`Creative ID: ${result.creativeId}`);
  console.log(`Proveedor: ${provider} | Conceptos por intento: ${concepts}\n`);

  result.attempts.forEach((a) => {
    console.log(`== INTENTO ${a.attemptNumber} ==`);
    console.log(`Conceptos generados: ${a.conceptsGenerated} | Shortlist: ${a.shortlist.join(', ')}`);
    console.log(`Mejor de este intento: ${a.bestConceptId} (${a.bestScore}/100)\n`);
  });

  const { winner } = result;
  console.log(`== RESULTADO: ${result.status === 'approved' ? 'APROBADO' : 'NECESITA REVISIÓN HUMANA'} ==`);
  console.log(`Concepto ganador: ${winner.conceptId} — ${winner.label}`);
  console.log(`Referencias mezcladas: ${winner.sourceReferenceIds.join(', ')}`);
  console.log(`Variación propia del director: [${winner.directorVariation.dimension}] ${winner.directorVariation.value}`);
  console.log(`Score de plan (capa 1): ${winner.planScore.total}/100 (${winner.planScore.band})`);
  console.log(`Score real (capa 2): ${winner.pixelScore.total}/100 (${winner.pixelScore.band})`);
  console.log(`Proveedor: ${winner.providerStatus}${winner.assetPath ? ' — ' + winner.assetPath : ''}`);
  console.log(`\nPrompt maestro (${winner.composedPrompt.wordCount} palabras): ${winner.composedPrompt.fullPrompt.slice(0, 200)}...`);
  console.log(`\nGuardado en: creative-engine/creative-assets/assets/${result.creativeId}/ (o CREATIVE_ENGINE_ASSETS_DIR si está definida)`);
}

main().catch((err) => {
  console.error('Fallo inesperado ejecutando la demo:', err);
  process.exit(1);
});
