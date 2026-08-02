// Punto de entrada único de Creative Lab — mismo principio que
// creative-engine/index.js: la superficie pública, nada más.
//
// runCreativeLab() encadena el flujo completo aprobado por el
// propietario: Producto → Análisis → Concepto creativo (8-12, mezclando
// referencias + variación propia del director) → Moodboard → Prompt
// maestro → Concept Score capa 1 (plan, gratis, las 8-12) → shortlist de
// 3-4 → Proveedor de IA real solo sobre el shortlist → Concept Score
// capa 2 (real, definitiva) → si el mejor no supera QUALITY_THRESHOLD,
// reintenta un lote nuevo (hasta MAX_RETRIES) → needsHumanReview si tras
// los reintentos sigue sin superarlo. Nunca un bucle infinito.

const { prepareAssets } = require('../asset-pipeline/service.js');
const { getProvider } = require('../provider-manager/registry.js');
const { assertSupports, adaptToCapabilities } = require('../provider-manager/provider.interface.js');
const store = require('../creative-assets/store.js');
const { newCreativeId } = require('../shared/ids.js');

const { analyzeBrief } = require('./analysis/service.js');
const { generateConcepts } = require('./concept-generator/service.js');
const { filterProfessionalConcepts } = require('./concept-generator/self-critique.js');
const { CONCEPT_COUNT_DEFAULT } = require('./concept-generator/config.js');
const { buildMoodboard } = require('./moodboard/service.js');
const { composeMasterPrompt } = require('./master-prompt-composer/service.js');
const { scoreConceptPlan, scoreConceptPixel, buildShortlist } = require('./concept-score/service.js');
const { composeLayout } = require('./layout-composer/service.js');
const { selectPattern } = require('./art-direction-engine/service.js');
const { resolveTemplateId } = require('../provider-manager/providers/canva.provider.js');
const { QUALITY_THRESHOLD, MAX_RETRIES, SHORTLIST_SIZE } = require('./config.js');

/** Genera de verdad con el proveedor para un concepto del shortlist — mismo patrón de captura de error que creative-engine/index.js#runCreativePipeline: PROVIDER_NOT_IMPLEMENTED/PROVIDER_NOT_CONFIGURED se marcan y no rompen el lote; cualquier otro error se propaga. */
async function generateForConcept(item, providerId, preparedAssets, versionDir) {
  const provider = getProvider(providerId);
  const request = {
    prompt: item.prompt.fullPrompt,
    negativePrompt: item.prompt.negativePrompt,
    width: preparedAssets.dimensions.width,
    height: preparedAssets.dimensions.height,
    contentClass: 'photo',
    referenceImages: preparedAssets.product.photoPath ? [preparedAssets.product.photoPath] : [],
    metadata: { outputDir: versionDir },
  };

  assertSupports(provider, request);
  const { request: adaptedRequest, warnings } = adaptToCapabilities(provider, request);

  try {
    const result = await provider.generate(adaptedRequest);
    return { status: 'ok', result, error: null, warnings };
  } catch (err) {
    if (err.code === 'PROVIDER_NOT_IMPLEMENTED' || err.code === 'PROVIDER_NOT_CONFIGURED') {
      return { status: 'pending-provider', result: null, error: err.message, warnings };
    }
    throw err;
  }
}

/**
 * FASE CANVA (2026-08-02, DT-19): compone la pieza final vía Canva
 * Connect (Autofill + Export) en vez de layout-composer/ (HTML +
 * Chromium) — ver provider-manager/CANVA_CONNECT_ARCHITECTURE.md. Usa
 * selectPattern() para decidir la familia oficial, la MISMA función que
 * ya usa layout-composer/service.js#reviewLoop — qué familia encaja no
 * cambia, solo cambia quién compone encima de la fotografía. Sin
 * plantilla configurada para esa familia (resolveTemplateId() devuelve
 * null — ver TEMPLATE_ID_BY_FAMILY en canva.provider.js), devuelve null
 * y composeFinalLayout cae al layout-composer de siempre.
 * @returns {Promise<object|null>}
 */
async function composeWithCanva(item, brief, preparedAssets, canvaAccessToken) {
  const generationResult = item.generation.result;
  const hasRealPhoto = Boolean(generationResult.format && generationResult.format !== 'svg');
  const pattern = selectPattern(item.concept, brief, hasRealPhoto, []);
  const templateId = resolveTemplateId(pattern.officialFamily);
  if (!templateId) return null;

  const fields = {};
  if (brief.copy.title) fields.titulo = { type: 'text', text: brief.copy.title };
  if (brief.copy.cta) fields.cta = { type: 'text', text: brief.copy.cta };
  if (brief.copy.price) fields.precio = { type: 'text', text: brief.copy.price };
  if (preparedAssets.brand.contact) {
    const contact = preparedAssets.brand.contact;
    fields.direccion = { type: 'text', text: [contact.phoneDisplay, contact.address].filter(Boolean).join(' · ') };
  }

  const provider = getProvider('canva');
  const request = {
    prompt: '',
    width: preparedAssets.dimensions.width,
    height: preparedAssets.dimensions.height,
    contentClass: 'template',
    referenceImages: [generationResult.assetPath],
    metadata: {
      outputDir: item.dir,
      accessToken: canvaAccessToken,
      templateId,
      fields,
      title: `${brief.product.name} — HELIX`,
    },
  };
  assertSupports(provider, request);

  const result = await provider.generate(request);
  return {
    strategyId: 'canva',
    patternId: pattern.id,
    patternLabel: pattern.label,
    outputPath: result.assetPath,
  };
}

/**
 * Convierte el resultado del proveedor (foto real o placeholder) en la
 * pieza final compuesta — el paso que faltaba entre "Creative Lab
 * decide" y "se ve en la imagen": antes de layout-composer/, el
 * concepto ganador nunca influía en el maquetado real. Nunca rompe el
 * pipeline: si falla, se registra el error y se devuelve el asset del
 * proveedor tal cual (mismo criterio que el resto del sistema).
 *
 * FASE CANVA: si hay canvaAccessToken, intenta componer con Canva
 * primero (composeWithCanva) — si falla o no hay plantilla configurada
 * para la familia elegida, cae al layout-composer de siempre sin dejar
 * al usuario sin ninguna pieza (mismo criterio de resiliencia que el
 * resto del pipeline, p.ej. la limpieza de texto de openai-images.provider.js).
 */
async function composeFinalLayout(item, brief, preparedAssets, canvaAccessToken) {
  const emptyLayout = () => ({
    finalRenderedAssetPath: null, strategyId: null, patternId: null, patternLabel: null,
    droppedElementIds: null, layoutScore: null, layoutAttempts: null, layoutPassed: null,
    designReview: null, textEmphasis: null, layoutError: null, canvaError: null,
  });

  if (!item.generation || !item.generation.result || !item.generation.result.assetPath) {
    return { ...emptyLayout(), layoutError: 'Sin asset generado por el proveedor — nada que componer.' };
  }

  let canvaError = null;
  if (canvaAccessToken) {
    try {
      const canvaLayout = await composeWithCanva(item, brief, preparedAssets, canvaAccessToken);
      if (canvaLayout) {
        return {
          ...emptyLayout(),
          finalRenderedAssetPath: canvaLayout.outputPath,
          strategyId: canvaLayout.strategyId,
          patternId: canvaLayout.patternId,
          patternLabel: canvaLayout.patternLabel,
        };
      }
    } catch (err) {
      canvaError = err.message;
    }
  }

  try {
    const layout = composeLayout(item.concept, brief, preparedAssets, item.generation.result, item.dir);
    return {
      finalRenderedAssetPath: layout.outputPath,
      strategyId: layout.strategyId,
      patternId: layout.patternId,
      patternLabel: layout.patternLabel,
      droppedElementIds: layout.droppedElementIds,
      layoutScore: layout.layoutScore,
      layoutAttempts: layout.layoutAttempts,
      layoutPassed: layout.layoutPassed,
      designReview: layout.designReview,
      textEmphasis: layout.textEmphasis,
      layoutError: null,
      canvaError,
    };
  } catch (err) {
    return { ...emptyLayout(), layoutError: err.message, canvaError };
  }
}

function summarizeAttemptConcept(item) {
  return {
    conceptId: item.concept.conceptId,
    label: item.concept.label,
    sourceReferenceIds: item.concept.sourceReferenceIds,
    directorVariation: item.concept.directorVariation,
    planScore: item.planScore.total,
    veredictoPremiumOFicha: item.selfCritique.answers.veredictoPremiumOFicha,
  };
}

/**
 * @param {object} brief - CreativeBrief
 * @param {object} [options]
 * @param {string} [options.providerId='simulated']
 * @param {number} [options.conceptCount=10] - entre 8 y 12
 * @param {string} [options.productPhotoPath]
 * @param {string} [options.testMode] - 'fotografia-base' pasa directo a
 *   master-prompt-composer/base-photography.js (experimento del
 *   propietario, ver esa cabecera) — no cambia nada más de este
 *   orquestador: mismo número de agentes/etapas, mismo Design Director,
 *   mismo Layout Composer. Ausente por defecto: cero cambio de
 *   comportamiento para cualquier llamada existente.
 * @param {string} [options.canvaAccessToken] - FASE CANVA (DT-19): access
 *   token de Canva Connect ya resuelto (ver netlify/functions/canva-auth.js)
 *   — si está presente, composeFinalLayout intenta componer con Canva
 *   antes que con layout-composer/. Ausente por defecto: cero cambio de
 *   comportamiento para cualquier llamada existente.
 * @returns {Promise<object>} { status: 'approved'|'needsHumanReview', creativeId, attempts, winner }
 */
async function runCreativeLab(brief, options = {}) {
  const conceptCount = options.conceptCount || CONCEPT_COUNT_DEFAULT;
  const providerId = options.providerId || 'simulated';

  const preparedAssets = prepareAssets(brief, { productPhotoPath: options.productPhotoPath });
  const creativeId = newCreativeId(brief);
  store.createCreative(creativeId, { brand: brief.brand.id, product: brief.product.name, format: brief.format });

  const attempts = [];
  let bestEver = null;

  for (let attemptNumber = 1; attemptNumber <= MAX_RETRIES; attemptNumber++) {
    const analysis = analyzeBrief(brief);
    const concepts = generateConcepts(analysis, { count: conceptCount });

    // Director de Arte Senior — autocrítica obligatoria ANTES de componer
    // ningún prompt: descarta automáticamente cualquier concepto que no
    // parezca una campaña profesional (self-critique.js). Solo los
    // supervivientes llegan a master-prompt-composer/.
    const { survivors, discarded } = filterProfessionalConcepts(concepts, brief);
    if (survivors.length === 0) {
      throw new Error(
        'Director de Arte Senior: los 10 conceptos generados parecen ficha de catálogo o tienen la jerarquía sobrecargada — ' +
        'ninguno supera el filtro de campaña profesional. Añade más variedad a la Biblioteca de Referencias (reference-library/).'
      );
    }

    // Capa 1 — plan, gratis, solo sobre los conceptos que superaron la autocrítica.
    const planned = survivors.map(({ concept, selfCritique }) => {
      const prompt = composeMasterPrompt(brief, preparedAssets, concept, { testMode: options.testMode });
      const moodboard = buildMoodboard(concept, preparedAssets);
      const planScore = scoreConceptPlan(concept, prompt, brief, preparedAssets);
      return { concept, prompt, moodboard, planScore, selfCritique };
    });

    const shortlist = buildShortlist(
      planned.map((p) => ({ concept: p.concept, prompt: p.prompt, moodboard: p.moodboard, planScore: p.planScore, selfCritique: p.selfCritique, score: p.planScore })),
      SHORTLIST_SIZE
    );

    // Capa 2 — real, con coste, solo sobre el shortlist.
    const evaluated = [];
    for (const item of shortlist) {
      const { versionNumber, dir } = store.beginVersion(creativeId);
      const generation = await generateForConcept(item, providerId, preparedAssets, dir);
      const pixelScore = scoreConceptPixel(item.concept, item.prompt, generation.result, brief, preparedAssets);

      store.saveVersion(creativeId, versionNumber, {
        prompt: item.prompt,
        metadata: {
          conceptId: item.concept.conceptId,
          concept: item.concept,
          moodboard: item.moodboard,
          providerId,
          providerStatus: generation.status,
          providerError: generation.error,
          capabilityWarnings: generation.warnings,
          generationResult: generation.result,
          planScore: item.planScore,
          pixelScore,
          selfCritique: item.selfCritique,
          attemptNumber,
        },
      });

      evaluated.push({ ...item, versionNumber, dir, generation, pixelScore });
    }

    const best = evaluated.reduce((a, b) => (b.pixelScore.total > a.pixelScore.total ? b : a));
    if (!bestEver || best.pixelScore.total > bestEver.pixelScore.total) bestEver = best;

    attempts.push({
      attemptNumber,
      conceptsGenerated: concepts.length,
      discardedByArtDirector: discarded.map((d) => ({ conceptId: d.concept.conceptId, reasons: d.selfCritique.discardReasons })),
      survivedArtDirector: planned.length,
      allConcepts: planned.map(summarizeAttemptConcept),
      shortlist: shortlist.map((s) => s.concept.conceptId),
      bestConceptId: best.concept.conceptId,
      bestScore: best.pixelScore.total,
    });

    if (bestEver.pixelScore.total >= QUALITY_THRESHOLD) {
      store.markApproved(creativeId, bestEver.versionNumber);
      return {
        status: 'approved',
        creativeId,
        attempts,
        winner: formatWinner(bestEver, await composeFinalLayout(bestEver, brief, preparedAssets, options.canvaAccessToken)),
      };
    }
  }

  // Se agotaron los MAX_RETRIES sin superar el umbral — nunca un bucle
  // infinito. Se devuelve el mejor resultado obtenido, marcado para
  // revisión humana, mismo patrón honesto que failed_needs_human de
  // marketing-engine.
  return {
    status: 'needsHumanReview',
    creativeId,
    attempts,
    winner: formatWinner(bestEver, await composeFinalLayout(bestEver, brief, preparedAssets, options.canvaAccessToken)),
  };
}

function formatWinner(item, layout) {
  return {
    conceptId: item.concept.conceptId,
    label: item.concept.label,
    sourceReferenceIds: item.concept.sourceReferenceIds,
    directorVariation: item.concept.directorVariation,
    selfCritique: item.selfCritique,
    moodboard: item.moodboard,
    composedPrompt: item.prompt,
    versionNumber: item.versionNumber,
    providerId: item.generation && item.generation.result ? item.generation.result.providerId : null,
    providerStatus: item.generation.status,
    assetPath: item.generation.result ? item.generation.result.assetPath : null,
    // Diagnóstico DT-18: expone tal cual lo que ya devuelve el proveedor
    // (p.ej. textCleanupApplied/textCleanupError de openai-images) — sin
    // esto no hay forma de saber si la limpieza de texto se aplicó de
    // verdad sin adivinarlo mirando los píxeles.
    providerRawResponse: item.generation.result ? item.generation.result.rawResponse : null,
    planScore: item.planScore,
    pixelScore: item.pixelScore,
    // layout-composer/ — la pieza final compuesta (arquetipo elegido según
    // la composición del concepto ganador), no solo el asset crudo del
    // proveedor. Ver layout-composer/ARCHITECTURE.md (sección en
    // creative-lab/ARCHITECTURE.md).
    layout,
  };
}

module.exports = { runCreativeLab };
