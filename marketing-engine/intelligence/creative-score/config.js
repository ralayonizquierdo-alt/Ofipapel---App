// Rúbrica del Creative Score: 8 dimensiones, cada una con una lista
// ordenada de criterios cuyos `points` suman exactamente 100. A diferencia
// de otros config.js de este proyecto (tablas de datos puras), aquí cada
// criterio lleva también su función `evaluate(ctx)` — la propia rúbrica
// ES el dato que hay que poder tocar sin tocar service.js, y separarla en
// dos ficheros habría sido indirección sin beneficio real.
//
// División honesta: 4 dimensiones son MEDIDAS de verdad (branding sobre
// guardian-marca, copy/claridad sobre texto real, jerarquía sobre el plan
// de composición real) — 55 puntos de peso. Las otras 4 son PROXY
// (impactoVisual, atención, conversión, encajeAudiencia): no hay visión
// por IA sobre el PNG generado ni resultados reales de campañas todavía,
// así que se calculan con señales indirectas — 45 puntos de peso, y cada
// una sale marcada confidence:'proxy' en el resultado para que nadie las
// lea como si fueran una medición real. Ver creative-score/service.js.
//
// `evaluate(ctx)` siempre debe devolver un número entre 0 y 1 (créditos
// parciales permitidos) y nunca lanzar — un job parcial o con estado
// incompleto (p. ej. un bucle de vuelta a mitad) no debe romper el
// puntuado, solo puntuar bajo con una `detail` honesta.

const VAGUE_CTAS = ['más información', 'descúbrelo en ofipapel', 'descúbrelo'];
const ACTION_VERBS = ['compra', 'cómpralo', 'descubre', 'pregúntanos', 'escríbenos', 'ven', 'mira', 'míralo', 'solicita', 'pide', 'reserva', 'aprovecha'];
const EMPTY_ADJECTIVES = ['increíble', 'el mejor', 'único', 'espectacular', 'revolucionario', 'excepcional', 'inigualable'];
const URGENCY_MARKERS = ['solo', 'hasta', 'últimas', 'ahora', 'hoy', 'agotar'];
const FORMAT_ATTENTION = { reel: 1, carrusel: 0.7, foto: 0.5 };

const BANDS = [
  { max: 49, band: 'insuficiente' },
  { max: 69, band: 'mejorable' },
  { max: 84, band: 'bueno' },
  { max: 100, band: 'excelente' },
];

function ratio(count, total) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, count / total));
}

function textIncludesAny(text, list) {
  const lower = (text || '').toLowerCase();
  return list.some((item) => lower.includes(item));
}

const DIMENSIONS = [
  {
    id: 'branding',
    label: 'Branding',
    weight: 15,
    confidence: 'medida',
    criteria: [
      {
        id: 'checks-guardian-marca',
        points: 100,
        evaluate: (ctx) => ratio(ctx.guardianMarca.checks.filter((c) => c.passed).length, ctx.guardianMarca.checks.length),
        detail: (ctx) => `${ctx.guardianMarca.checks.filter((c) => c.passed).length}/${ctx.guardianMarca.checks.length} comprobaciones de marca superadas (03-guardian-marca, contra design-studio/brand-kit.json).`,
        fix: 'Revisar brand-kit.json y los assets de marca declarados para esta marca.',
      },
    ],
  },
  {
    id: 'claridad',
    label: 'Claridad del mensaje',
    weight: 15,
    confidence: 'medida',
    criteria: [
      {
        id: 'propuesta-unica-clara',
        points: 40,
        evaluate: (ctx) => {
          const strategy = ctx.directorCreativo.strategy || '';
          const sentences = (strategy.match(/\./g) || []).length;
          return strategy.length > 0 && strategy.length <= 220 && sentences <= 2 ? 1 : 0.3;
        },
        detail: () => 'Propuesta de venta única (director-creativo.strategy) — debería caber en una frase, knowledge/creative-playbook.md §1.',
        fix: 'Reducir la estrategia a una sola frase clara.',
      },
      {
        id: 'cuerpo-conciso',
        points: 30,
        evaluate: (ctx) => {
          const len = (ctx.copy.body || '').length;
          if (len === 0) return 0;
          if (len <= 220) return 1;
          return Math.max(0, 1 - (len - 220) / 280);
        },
        detail: (ctx) => `Cuerpo del copy: ${(ctx.copy.body || '').length} caracteres — knowledge/copywriting-playbook.md §3 recomienda 2-3 frases como máximo.`,
        fix: 'Acortar el cuerpo del texto o moverlo a un carrusel (una idea por slide).',
      },
      {
        id: 'titulo-no-repetido-en-cuerpo',
        points: 30,
        evaluate: (ctx) => {
          const title = (ctx.copy.title || '').toLowerCase().trim();
          const body = (ctx.copy.body || '').toLowerCase();
          if (title.length < 8) return 1;
          return body.includes(title) ? 0 : 1;
        },
        detail: () => 'El cuerpo no debe repetir el título con otras palabras — debe añadir algo nuevo (knowledge/copywriting-playbook.md §3).',
        fix: 'Reescribir el cuerpo para que aporte el "por qué" o el "cómo", no repita el título.',
      },
    ],
  },
  {
    id: 'jerarquia',
    label: 'Jerarquía visual declarada',
    weight: 10,
    confidence: 'medida',
    criteria: [
      {
        id: 'niveles-no-saturados',
        points: 60,
        evaluate: (ctx) => {
          const n = ctx.directorArte.hierarchy.length;
          if (n === 0) return 0;
          if (n <= 4) return 1;
          return Math.max(0, 1 - (n - 4) * 0.2);
        },
        detail: (ctx) => `${ctx.directorArte.hierarchy.length} niveles de jerarquía declarados por 02-director-arte — knowledge/art-direction-rules.md desaconseja saturar.`,
        fix: 'Reducir a 2-4 niveles de jerarquía como máximo.',
      },
      {
        id: 'composicion-declarada',
        points: 40,
        evaluate: (ctx) => (ctx.directorArte.composition && ctx.directorArte.structure ? 1 : 0),
        detail: () => 'composition y structure declarados por 02-director-arte (jerarquía "declarada", no medida sobre el píxel).',
        fix: 'Revisar que 02-director-arte produzca composition y structure no vacíos.',
      },
    ],
  },
  {
    id: 'copy',
    label: 'Calidad del copy',
    weight: 15,
    confidence: 'medida',
    criteria: [
      {
        id: 'cta-presente',
        points: 25,
        evaluate: (ctx) => ((ctx.copy.cta || '').trim().length > 0 ? 1 : 0),
        detail: (ctx) => `CTA: "${ctx.copy.cta || '(vacío)'}"`,
        fix: 'Añadir un CTA — knowledge/copywriting-playbook.md §4.',
      },
      {
        id: 'hashtags-mezcla-recomendada',
        points: 25,
        evaluate: (ctx) => {
          const n = (ctx.copy.hashtags || []).length;
          return n >= 3 && n <= 6 ? 1 : Math.max(0, 1 - Math.abs(n - 4.5) * 0.2);
        },
        detail: (ctx) => `${(ctx.copy.hashtags || []).length} hashtags — knowledge/copywriting-playbook.md §5 recomienda 3-6 (marca + categoría + local).`,
        fix: 'Ajustar la mezcla a 1-2 de marca, 1-2 de categoría y 1-2 locales.',
      },
      {
        id: 'sin-adjetivos-vacios',
        points: 25,
        evaluate: (ctx) => (textIncludesAny(`${ctx.copy.title} ${ctx.copy.body}`, EMPTY_ADJECTIVES) ? 0 : 1),
        detail: () => 'Ausencia de adjetivos vacíos ("increíble", "el mejor"...) — knowledge/copywriting-playbook.md §6.',
        fix: 'Sustituir adjetivos genéricos por un beneficio o dato concreto.',
      },
      {
        id: 'titulo-conciso',
        points: 25,
        evaluate: (ctx) => {
          const words = (ctx.copy.title || '').trim().split(/\s+/).filter(Boolean).length;
          return words > 0 && words <= 8 ? 1 : Math.max(0, 1 - (words - 8) * 0.1);
        },
        detail: (ctx) => `Título: "${ctx.copy.title || ''}" (${(ctx.copy.title || '').trim().split(/\s+/).filter(Boolean).length} palabras) — el gancho debe estar en las primeras 4-6 (knowledge/copywriting-playbook.md §2).`,
        fix: 'Acortar el título o adelantar el beneficio a las primeras palabras.',
      },
    ],
  },
  {
    id: 'conversion',
    label: 'Probabilidad de conversión',
    weight: 15,
    confidence: 'proxy',
    criteria: [
      {
        id: 'cta-con-verbo-de-accion',
        points: 40,
        evaluate: (ctx) => (textIncludesAny(ctx.copy.cta, ACTION_VERBS) ? 1 : 0),
        detail: (ctx) => `CTA "${ctx.copy.cta || ''}" — ¿contiene un verbo de acción claro?`,
        fix: 'Usar un verbo de acción directo en el CTA (knowledge/copywriting-playbook.md §4).',
      },
      {
        id: 'urgencia-coherente',
        points: 30,
        evaluate: (ctx) => {
          const expectsUrgency = ctx.recommendation && ctx.recommendation.objective === 'vender';
          const hasUrgency = textIncludesAny(`${ctx.copy.cta} ${ctx.copy.body}`, URGENCY_MARKERS);
          if (expectsUrgency === undefined) return 0.5;
          return expectsUrgency === hasUrgency ? 1 : 0.3;
        },
        detail: () => 'La urgencia del copy debe coincidir con el objetivo — urgencia falsa o ausente cuando tocaba son errores documentados (knowledge/copywriting-playbook.md §6).',
        fix: 'Añadir o quitar marcadores de urgencia según el objetivo real de la pieza.',
      },
      {
        id: 'cta-especifico',
        points: 30,
        evaluate: (ctx) => (VAGUE_CTAS.includes((ctx.copy.cta || '').toLowerCase().trim()) ? 0 : 1),
        detail: (ctx) => `"${ctx.copy.cta || ''}" — ¿es específico o un CTA genérico de bajo compromiso?`,
        fix: 'Sustituir por un CTA específico y accionable.',
      },
    ],
  },
  {
    id: 'atencion',
    label: 'Probabilidad de captar atención',
    weight: 10,
    confidence: 'proxy',
    criteria: [
      {
        id: 'formato-favorece-atencion',
        points: 50,
        evaluate: (ctx) => FORMAT_ATTENTION[ctx.directorCreativo.postType] ?? 0.5,
        detail: (ctx) => `Formato "${ctx.directorCreativo.postType}" — los reels tienen mayor potencial de descubrimiento (knowledge/social-media-playbook.md §2).`,
        fix: 'Considerar reel si el mensaje tiene un elemento de movimiento real que aportar.',
      },
      {
        id: 'titulo-no-es-solo-el-nombre-del-producto',
        points: 50,
        evaluate: (ctx) => ((ctx.copy.title || '').trim().toLowerCase() === (ctx.input.productName || '').trim().toLowerCase() ? 0 : 1),
        detail: () => 'Un título igual al nombre del producto no engancha por sí solo (knowledge/copywriting-playbook.md §2).',
        fix: 'Escribir un título-gancho (beneficio, pregunta o dato) en vez del nombre del producto tal cual.',
      },
    ],
  },
  {
    id: 'impactoVisual',
    label: 'Impacto visual',
    weight: 10,
    confidence: 'proxy',
    criteria: [
      {
        id: 'foto-real-de-producto',
        points: 50,
        evaluate: (ctx) => ((ctx.input.images || []).length > 0 ? 1 : 0.4),
        detail: (ctx) => ((ctx.input.images || []).length > 0 ? 'Se aportó una foto real del producto.' : 'Sin foto de producto — se usó un placeholder abstracto (proveedor simulated).'),
        fix: 'Subir una foto real del producto al crear la campaña.',
      },
      {
        id: 'proveedor-de-imagen-real',
        points: 50,
        evaluate: (ctx) => (ctx.providerResult.providerId && ctx.providerResult.providerId !== 'simulated' ? 1 : 0),
        detail: (ctx) => `Proveedor de imagen: "${ctx.providerResult.providerId || 'desconocido'}" — sin IA real conectada todavía, este criterio puntúa 0 en todos los jobs hoy, a propósito.`,
        fix: 'Conectar un proveedor de imagen real (ver core/providers/README.md).',
      },
    ],
  },
  {
    id: 'encajeAudiencia',
    label: 'Adecuación al público',
    weight: 10,
    confidence: 'proxy',
    criteria: [
      {
        id: 'objeciones-atendidas',
        points: 60,
        evaluate: (ctx) => {
          const objections = (ctx.productProfile && ctx.productProfile.objections) || [];
          if (objections.length === 0) return 0.5;
          const text = `${ctx.copy.title} ${ctx.copy.body} ${ctx.copy.description}`.toLowerCase();
          const answered = objections.filter((o) => o.answeredBy.some((kw) => text.includes(kw.toLowerCase())));
          return ratio(answered.length, objections.length);
        },
        detail: (ctx) => {
          const objections = (ctx.productProfile && ctx.productProfile.objections) || [];
          return `${objections.length} objeciones típicas de esta categoría (product-intelligence/) — ¿el copy responde a alguna?`;
        },
        fix: 'Incorporar en el copy una palabra clave que responda a una objeción típica de la categoría.',
      },
      {
        id: 'canal-coherente-con-recomendacion',
        points: 40,
        evaluate: (ctx) => {
          if (!ctx.recommendation) return 0.5;
          const actual = ctx.directorCreativo.channel;
          if (actual === 'ambas' || ctx.recommendation.platform === actual) return 1;
          return 0.3;
        },
        detail: (ctx) => `Canal real: "${ctx.directorCreativo.channel}" vs. recomendado por intelligence/: "${ctx.recommendation ? ctx.recommendation.platform : 'n/d'}".`,
        fix: 'Revisar si el canal elegido encaja con el público objetivo de esta categoría.',
      },
    ],
  },
];

module.exports = { DIMENSIONS, BANDS, VAGUE_CTAS, ACTION_VERBS, EMPTY_ADJECTIVES, URGENCY_MARKERS, FORMAT_ATTENTION };
