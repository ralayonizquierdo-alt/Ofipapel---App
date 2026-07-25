// Guardián de Marca — controla toda la identidad visual: valida colores,
// logotipo, tipografía, composición y calidad. PUEDE BLOQUEAR cualquier
// publicación (único agente, junto a 08-control-calidad, con permiso para
// hacerlo).
//
// A DIFERENCIA de los demás agentes, este NO es una simulación: ejecuta
// comprobaciones deterministas reales contra design-studio/brand-kit.json
// (la única fuente de verdad de marca — nunca copiada aquí, ver config.js
// y .claude/rax/DECISIONES.md 2026-07-10 sobre por qué esto importa).
//
// Lo que valida hoy es objetivo (¿existe la marca?, ¿existen sus assets en
// disco?, ¿tiene eslogan si es obligatorio?). El juicio más subjetivo de
// composición/calidad sobre una imagen ya generada queda documentado como
// capa futura en prompts/brand-review.prompt.md — no bloquea nada todavía
// porque en este punto del pipeline aún no existe ninguna imagen real.

const fs = require('node:fs');
const path = require('node:path');
const { INPUT_SHAPE, OUTPUT_SHAPE } = require('./interface.js');
const { assertShape } = require('../../core/contracts/shapes.js');
const { REPO_ROOT, BRAND_KIT_PATH, REQUIRE_SLOGAN_FOR } = require('./config.js');

const AGENT_ID = 'guardian-marca';

async function run(job) {
  assertShape(job, INPUT_SHAPE, 'job');

  const { checks, approved, brandKey } = validateBrand(job.input.brand);

  const output = { approved, brandKey, checks };
  assertShape(output, OUTPUT_SHAPE, 'output');

  if (!approved) {
    const failedNames = checks.filter((c) => !c.passed).map((c) => c.name).join(', ');
    return {
      status: 'blocked',
      agentId: AGENT_ID,
      output,
      returnTo: 'director-arte',
      reason: `Comprobaciones de marca no superadas: ${failedNames}`,
    };
  }

  return { status: 'ok', agentId: AGENT_ID, output, returnTo: null, reason: null };
}

function validateBrand(brandKey) {
  const checks = [];

  let brandKit;
  try {
    delete require.cache[require.resolve(BRAND_KIT_PATH)];
    brandKit = require(BRAND_KIT_PATH);
  } catch (err) {
    checks.push({ name: 'brand-kit-legible', passed: false, detail: `No se pudo leer ${BRAND_KIT_PATH}: ${err.message}` });
    return { checks, approved: false, brandKey };
  }
  checks.push({ name: 'brand-kit-legible', passed: true, detail: BRAND_KIT_PATH });

  const brand = brandKit[brandKey];
  checks.push({
    name: 'marca-existe-en-brand-kit',
    passed: Boolean(brand),
    detail: brand ? `"${brandKey}" encontrada` : `"${brandKey}" no existe en brand-kit.json`,
  });
  if (!brand) return { checks, approved: false, brandKey };

  const colorsOk = Boolean(brand.colors) && Object.keys(brand.colors).length > 0;
  checks.push({
    name: 'colores-declarados',
    passed: colorsOk,
    detail: colorsOk ? `${Object.keys(brand.colors).length} colores declarados` : 'sin colores declarados',
  });

  const fontsOk = Boolean(brand.fonts) && Boolean(brand.fonts.body);
  checks.push({
    name: 'tipografia-declarada',
    passed: fontsOk,
    detail: fontsOk ? brand.fonts.body : 'sin fuente body declarada',
  });

  if (REQUIRE_SLOGAN_FOR.includes(brandKey)) {
    const sloganOk = typeof brand.slogan === 'string' && brand.slogan.length > 0;
    checks.push({
      name: 'eslogan-obligatorio',
      passed: sloganOk,
      detail: sloganOk ? brand.slogan : `"${brandKey}" exige eslogan y no está declarado`,
    });
  }

  if (brand.assets) {
    for (const [assetName, relativePath] of Object.entries(brand.assets)) {
      const absolutePath = path.join(REPO_ROOT, relativePath);
      const exists = fs.existsSync(absolutePath);
      checks.push({
        name: `asset-en-disco:${assetName}`,
        passed: exists,
        detail: exists ? relativePath : `no encontrado: ${relativePath}`,
      });
    }
  }

  const approved = checks.every((c) => c.passed);
  return { checks, approved, brandKey };
}

module.exports = { run };
