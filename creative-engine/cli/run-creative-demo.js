#!/usr/bin/env node
// CLI de demostración de creative-engine/ — corre el pipeline completo
// (Asset Pipeline → Prompt Composer → Variant Generator → intento de
// Provider → Creative Validator → Creative Assets) sobre un brief JSON,
// sin conectar ningún proveedor real (solo "simulated").
//
// Uso:
//   node creative-engine/cli/run-creative-demo.js <brief.json> [--provider id] [--variants N] [--from-marketing-engine] [--json]
//
// --from-marketing-engine: el JSON de entrada tiene forma de job de
//   marketing-engine (input/state/intelligence), no de CreativeBrief — se
//   traduce con brief/from-marketing-engine.js. Sin este flag, el JSON
//   debe ser ya un CreativeBrief válido (ver brief/contracts.js).
// --provider: id de creative-engine/provider-manager/registry.js (por
//   defecto "simulated", el único activo).
// --variants: 1, 3, 5 o 10 (por defecto 1).
// --json: vuelca el resultado completo en JSON, útil para comprobar
//   determinismo (mismo brief + misma fecha = misma salida).

const fs = require('node:fs');
const path = require('node:path');
const { createBrief, fromMarketingEngine, runCreativePipeline } = require('../index.js');

function parseArgs(argv) {
  const args = { brief: null, provider: 'simulated', variants: 1, fromMarketingEngine: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--provider') args.provider = argv[++i];
    else if (argv[i] === '--variants') args.variants = Number(argv[++i]);
    else if (argv[i] === '--from-marketing-engine') args.fromMarketingEngine = true;
    else if (argv[i] === '--json') args.json = true;
    else if (!args.brief) args.brief = argv[i];
  }
  return args;
}

async function main() {
  const { brief: briefArg, provider, variants, fromMarketingEngine: useMapper, json } = parseArgs(process.argv.slice(2));

  if (!briefArg) {
    console.error('Uso: node creative-engine/cli/run-creative-demo.js <brief.json> [--provider id] [--variants N] [--from-marketing-engine] [--json]');
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

  const result = await runCreativePipeline(brief, { providerId: provider, variantCount: variants });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Producto: ${brief.product.name} (${brief.brand.id})`);
  console.log(`Creativity ID: ${result.creativeId}`);
  console.log(`Proveedor: ${provider} | Variantes pedidas: ${variants}\n`);

  console.log('== ASSET PIPELINE ==');
  console.log(`Dimensiones: ${result.preparedAssets.dimensions.width}×${result.preparedAssets.dimensions.height} (${result.preparedAssets.dimensions.format}, ${result.preparedAssets.dimensions.platform})`);
  console.log(`Paleta: ${JSON.stringify(result.preparedAssets.brand.palette)}`);
  if (result.preparedAssets.warnings.length > 0) {
    console.log('Avisos:', result.preparedAssets.warnings.join(' | '));
  }

  console.log('\n== VARIANTES ==');
  result.variants.forEach((v) => {
    console.log(`\n[${v.variantId}] ${v.label}`);
    console.log(`  Estado del proveedor: ${v.providerStatus}${v.providerError ? ' — ' + v.providerError : ''}`);
    console.log(`  Asset: ${v.assetPath || '(sin generar todavía)'}`);
    console.log(`  Validación: ${v.validation.passed ? 'APROBADA' : 'MARCADA PARA REGENERACIÓN'} (${v.validation.checks.filter((c) => c.passed).length}/${v.validation.checks.length} checks)`);
    if (!v.validation.passed) {
      v.validation.checks.filter((c) => !c.passed).forEach((c) => console.log(`    ✗ ${c.id}: ${c.detail}`));
    }
    console.log(`  Prompt (${v.composedPrompt.wordCount} palabras): ${v.composedPrompt.fullPrompt.slice(0, 140)}...`);
  });

  console.log(`\nGuardado en: creative-engine/creative-assets/assets/${result.creativeId}/ (o CREATIVE_ENGINE_ASSETS_DIR si está definida)`);
}

main().catch((err) => {
  console.error('Fallo inesperado ejecutando la demo:', err);
  process.exit(1);
});
