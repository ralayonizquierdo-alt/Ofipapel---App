#!/usr/bin/env node
// CLI de demostración de marketing-engine/intelligence/ — analiza un
// brief y muestra lo que el motor RECOMENDARÍA, sin ejecutar el pipeline
// y sin escribir ningún registro de aprendizaje (no se ha producido
// ninguna campaña real, no hay nada que registrar todavía).
//
// Uso:
//   node marketing-engine/cli/run-intelligence.js <brief.json> [--date YYYY-MM-DD] [--json]
//
// --date fija la fecha efectiva para la estacionalidad (por defecto, hoy).
// --json vuelca el resultado completo en JSON, útil para comprobar que la
//   misma entrada + la misma fecha producen siempre la misma salida (ver
//   verificación de determinismo en marketing-engine/intelligence/README.md).
//
// El brief debe cumplir JOB_INPUT_SHAPE, igual que para run-pipeline.js.

const fs = require('node:fs');
const path = require('node:path');
const { createJob } = require('../core/contracts/job.contract.js');
const { analyzeProduct, recommend, explain, generateVariants } = require('../intelligence/index.js');

function parseArgs(argv) {
  const args = { brief: null, date: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--date') args.date = argv[++i];
    else if (argv[i] === '--json') args.json = true;
    else if (!args.brief) args.brief = argv[i];
  }
  return args;
}

function main() {
  const { brief: briefArg, date, json } = parseArgs(process.argv.slice(2));

  if (!briefArg) {
    console.error('Uso: node marketing-engine/cli/run-intelligence.js <brief.json> [--date YYYY-MM-DD] [--json]');
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

  if (date) {
    input = { ...input, targetDate: date };
  }

  let job;
  try {
    job = createJob(input);
  } catch (err) {
    console.error(`Brief inválido: ${err.message}`);
    process.exit(1);
  }

  const productProfile = analyzeProduct(job);
  const recommendation = recommend(productProfile, job);
  const variants = generateVariants(productProfile, recommendation, recommendation.variantCount);

  if (json) {
    console.log(JSON.stringify({ productProfile, recommendation, variants }, null, 2));
    return;
  }

  console.log(`Producto: ${job.input.productName} (${job.input.brand})`);
  console.log(`Fecha efectiva: ${date || 'hoy'}\n`);

  console.log('== PRODUCT INTELLIGENCE ==');
  console.log(`Categoría resuelta: ${productProfile.categoryKey} (${productProfile.resolvedVia}, confianza ${productProfile.confidence})`);
  console.log(`Beneficios: ${productProfile.benefits.join(' · ')}`);
  console.log(`Objeciones: ${productProfile.objections.map((o) => o.objection).join(' · ')}`);
  console.log(`Público: ${productProfile.audience.segment} — ${productProfile.audience.decisionDriver}`);
  console.log(`Estacionalidad: ${productProfile.seasonality.note}`);
  console.log(`Ticket: ${productProfile.ticket.band} (impulso: ${productProfile.ticket.impulseBuy ? 'sí' : 'no'})`);
  console.log(`Complementarios: ${productProfile.complementary.join(' · ') || '(ninguno)'}`);
  console.log(`Emociones: ${productProfile.emotions.join(' · ')}`);
  console.log(`Argumentos de venta: ${productProfile.salesArguments.join(' · ')}\n`);

  console.log('== CAMPAIGN RECOMMENDER ==');
  Object.entries(recommendation.reasons).forEach(([field, reason]) => {
    console.log(`${field}: ${recommendation[field]}`);
    console.log(`  porque ${reason}`);
  });
  console.log(`\nEvidencia: ${recommendation.evidence.note}\n`);

  console.log('== VARIANT ENGINE ==');
  variants.forEach((v) => {
    console.log(`- ${v.label} (${v.jobInputOverrides.postTypeOverride}/${v.jobInputOverrides.objective}) — ${v.reasoning}`);
    console.log(`  ref: ${v.knowledgeRef.doc} §${v.knowledgeRef.section} "${v.knowledgeRef.name}"`);
  });

  console.log('\n== LA FRASE ==');
  console.log(explain(recommendation, productProfile));
}

main();
