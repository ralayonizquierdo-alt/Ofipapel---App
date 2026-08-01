// Creative Validator — antes de devolver una pieza, comprueba branding,
// legibilidad, presencia del producto, espacio para logo, espacio para
// textos y composición. Si falla cualquiera, marca la pieza para
// regeneración con `regenerationHints` concretos (los `fix` de cada check
// fallido) — pensados para alimentar una sección adicional del Prompt
// Composer en la siguiente versión, de forma que "regenerar" produzca de
// verdad un prompt distinto (mecanismo documentado aquí; el bucle real de
// regeneración se activa cuando exista un proveedor real con el que
// regenerar, ver ARCHITECTURE.md).
//
// Nunca es una puerta que bloquee la pieza por sí sola — igual que
// marketing-engine/intelligence/creative-score no bloquea nada: informa,
// quien decide sigue siendo el propietario en el Almacén.

const { CHECKS } = require('./config.js');

/**
 * @param {object} brief - CreativeBrief
 * @param {object} preparedAssets - salida de asset-pipeline/service.js
 * @param {object} composedPrompt - salida de prompt-composer/service.js
 * @param {object|null} [generationResult] - GENERATION_RESULT_SHAPE si ya existe una pieza generada (hoy siempre null o `simulated`)
 * @returns {{checks: object[], passed: boolean, needsRegeneration: boolean, regenerationHints: string[]}}
 */
function validateCreative(brief, preparedAssets, composedPrompt, generationResult = null) {
  const ctx = { brief, preparedAssets, composedPrompt, generationResult };

  const checks = CHECKS.map((check) => {
    const { passed, detail } = check.evaluate(ctx);
    return {
      id: check.id,
      label: check.label,
      passed,
      evaluatedOn: 'plan', // 'pixel' es el valor futuro, cuando haya una imagen real que inspeccionar
      detail,
      fix: passed ? null : check.fix,
    };
  });

  const failedChecks = checks.filter((c) => !c.passed);
  const needsRegeneration = failedChecks.length > 0;

  return {
    checks,
    passed: !needsRegeneration,
    needsRegeneration,
    regenerationHints: failedChecks.map((c) => c.fix),
  };
}

module.exports = { validateCreative };
