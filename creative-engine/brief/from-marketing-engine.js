// Mapper puro: un objeto con forma de job de marketing-engine → CreativeBrief.
//
// ESTE FICHERO NO IMPORTA NADA DE marketing-engine/ — recibe un objeto
// plano y lo traduce. El conocimiento va en un solo sentido:
// creative-engine conoce (por convención documentada aquí, no por código
// compartido) la FORMA de la salida de marketing-engine; marketing-engine
// no sabe que creative-engine existe. Si esa forma cambia algún día, este
// fichero es el único que hay que tocar — ni contracts.js ni ningún otro
// componente de creative-engine sabe de dónde vino el brief.
//
// Forma esperada de `marketingEngineJob` (documentada, no validada por un
// import — quien la construya es responsable de que coincida con lo real):
//   {
//     input: { productName, category, brand, description, channel, images },
//     state: {
//       'director-creativo': { strategy, postType, tone, channel, graphicFamily },
//       'director-arte': { composition, hierarchy, structure, layoutId },
//       'fotografo-publicitario': { photoSpec: {angle,background,lighting,notes}, fidelityRules },
//       copywriter: { title, body, cta, hashtags },
//     },
//     intelligence: {                                   // opcional — marketing-engine/intelligence/
//       productProfile: { benefits, emotions, salesArguments, audience:{segment}, ticket:{band} },
//       recommendation: { objective, campaignType, creativeStyle, postingWindow },
//     },
//   }
//
// No usado por ningún componente interno de creative-engine — solo por
// quien integre los dos motores (hoy, únicamente cli/run-creative-demo.js
// con el flag --from-marketing-engine, para probar que la costura es
// real, no solo prosa en ARCHITECTURE.md).

const { createBrief } = require('./contracts.js');

/**
 * @param {object} marketingEngineJob - ver forma documentada arriba
 * @param {object} [overrides] - format.contentClass/postType/platform si el
 *   llamador quiere forzar algo distinto de lo que trae el job (p. ej.
 *   pedir un vídeo aunque marketing-engine solo pensó en foto/carrusel/reel)
 * @returns {object} CreativeBrief
 */
function fromMarketingEngine(marketingEngineJob, overrides = {}) {
  const input = marketingEngineJob.input || {};
  const state = marketingEngineJob.state || {};
  const directorCreativo = state['director-creativo'] || {};
  const directorArte = state['director-arte'] || {};
  const fotografo = state['fotografo-publicitario'] || {};
  const copywriter = state.copywriter || {};
  const intelligence = marketingEngineJob.intelligence || null;
  const productProfile = intelligence && intelligence.productProfile;
  const recommendation = intelligence && intelligence.recommendation;

  const brief = {
    product: {
      name: input.productName || '',
      description: input.description || '',
      category: input.category || '',
    },
    brand: {
      id: input.brand || 'ofipapel',
    },
    creativeDirection: {
      strategy: directorCreativo.strategy || '',
      tone: directorCreativo.tone || '',
      graphicFamily: directorCreativo.graphicFamily || '',
    },
    artDirection: {
      composition: directorArte.composition || '',
      hierarchy: directorArte.hierarchy || [],
      structure: directorArte.structure || '',
      layoutId: directorArte.layoutId || '',
    },
    photography: {
      angle: (fotografo.photoSpec && fotografo.photoSpec.angle) || '',
      background: (fotografo.photoSpec && fotografo.photoSpec.background) || '',
      lighting: (fotografo.photoSpec && fotografo.photoSpec.lighting) || '',
      notes: (fotografo.photoSpec && fotografo.photoSpec.notes) || '',
      fidelityRules: fotografo.fidelityRules || [],
    },
    productIntelligence: productProfile
      ? {
          benefits: productProfile.benefits || [],
          emotions: productProfile.emotions || [],
          salesArguments: productProfile.salesArguments || [],
          audienceSegment: (productProfile.audience && productProfile.audience.segment) || '',
          ticketBand: (productProfile.ticket && productProfile.ticket.band) || '',
        }
      : null,
    campaign: recommendation
      ? {
          objective: recommendation.objective || '',
          campaignType: recommendation.campaignType || '',
          creativeStyle: recommendation.creativeStyle || '',
          postingWindow: recommendation.postingWindow || null,
        }
      : null,
    copy: {
      title: copywriter.title || '',
      body: copywriter.body || '',
      cta: copywriter.cta || '',
      hashtags: copywriter.hashtags || [],
    },
    format: {
      contentClass: overrides.contentClass || 'photo',
      postType: overrides.postType || directorCreativo.postType || 'foto',
      platform: overrides.platform || directorCreativo.channel || input.channel || 'ambas',
    },
  };

  return createBrief(brief);
}

module.exports = { fromMarketingEngine };
