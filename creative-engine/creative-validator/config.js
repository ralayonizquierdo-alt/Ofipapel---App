// Las 6 comprobaciones exactas pedidas por el propietario. Cada una
// evalúa el PLAN (brief + prompt compuesto), no píxeles — hoy no existe
// ningún proveedor real que produzca una imagen que inspeccionar
// (`simulated` es un placeholder SVG, no algo sobre lo que evaluar
// composición/legibilidad real). Cada check lleva `evaluatedOn:'plan'`
// en el resultado; `'pixel'` queda declarado para cuando exista una
// imagen real generada — ver ARCHITECTURE.md, hoja de ruta plan→pixel.

const CHECKS = [
  {
    id: 'branding',
    label: 'Branding',
    fix: 'Añadir el nombre de la marca o su paleta de colores al prompt (ver prompt-composer/sections/brand.js).',
    evaluate: (ctx) => {
      const brand = ctx.preparedAssets.brand;
      const text = ctx.composedPrompt.fullPrompt;
      const mentionsLabel = Boolean(brand.label) && text.toLowerCase().includes(brand.label.toLowerCase());
      const mentionsHex = Boolean(brand.palette && brand.palette.primary) && text.includes(brand.palette.primary);
      const passed = mentionsLabel || mentionsHex;
      return {
        passed,
        detail: passed
          ? `El prompt menciona la marca o su paleta ("${brand.label}").`
          : `El prompt no menciona ni la marca "${brand.label}" ni su color primario.`,
      };
    },
  },
  {
    id: 'legibilidad',
    label: 'Legibilidad',
    fix: 'Acortar el titular/CTA, o confirmar que el Prompt Composer reserva espacio de texto (sections/copy.js).',
    evaluate: (ctx) => {
      const { title, cta } = ctx.brief.copy;
      if (!title && !cta) {
        return { passed: true, detail: 'Esta pieza no lleva copy — no hay nada que evaluar en legibilidad.' };
      }
      const hasCopySection = ctx.composedPrompt.sections.some((s) => s.id === 'copy');
      const shortTitle = !title || title.length <= 60;
      const passed = hasCopySection && shortTitle;
      return {
        passed,
        detail: passed
          ? 'Hay copy, el prompt reserva espacio para él, y el titular tiene una longitud razonable.'
          : `Falta reservar espacio de texto en el prompt, o el titular es demasiado largo (${(title || '').length} caracteres, máximo recomendado 60).`,
      };
    },
  },
  {
    id: 'presenciaProducto',
    label: 'Presencia del producto',
    fix: 'Añadir reglas de fidelidad en brief.photography.fidelityRules, o adjuntar una foto real del producto.',
    evaluate: (ctx) => {
      const rules = ctx.brief.photography.fidelityRules || [];
      const hasRefImage = ctx.preparedAssets.product.photoPath !== null;
      if (hasRefImage) {
        return { passed: true, detail: 'Hay una foto real del producto como referencia — la evidencia más fuerte posible hoy.' };
      }
      if (rules.length > 0) {
        return { passed: true, detail: `Sin foto real, pero hay ${rules.length} regla(s) de fidelidad al producto en el prompt.` };
      }
      return { passed: false, detail: 'Ni foto real de referencia ni reglas de fidelidad al producto — riesgo real de que el resultado no se parezca al producto real.' };
    },
  },
  {
    id: 'espacioLogo',
    label: 'Espacio para el logo',
    fix: 'Confirmar que el Prompt Composer reserva espacio (sections/copy.js), o declarar el logo de esta marca en brand-kit.json.',
    evaluate: (ctx) => {
      const hasLogoAsset = ctx.preparedAssets.brand.logoPath !== null;
      if (!hasLogoAsset) {
        // No es un fallo del prompt — es que esta marca no tiene logo
        // declarado en brand-kit.json todavía (normal hoy para
        // canarias-ink y falcontrol). Aviso, no fallo.
        return {
          passed: true,
          detail: `La marca "${ctx.preparedAssets.brand.id}" no tiene logo declarado en brand-kit.json todavía — no aplica reservar espacio para algo que no existe.`,
        };
      }
      const reservesSpace = ctx.composedPrompt.sections.some((s) => s.id === 'copy');
      return {
        passed: reservesSpace,
        detail: reservesSpace ? 'El prompt reserva espacio negativo para el logo.' : 'La marca tiene logo declarado, pero el prompt no reserva espacio para superponerlo.',
      };
    },
  },
  {
    id: 'espacioTextos',
    label: 'Espacio para textos',
    fix: 'Reducir la jerarquía visual a 4 elementos como máximo (brief.artDirection.hierarchy), o confirmar sections/copy.js.',
    evaluate: (ctx) => {
      const hierarchy = ctx.brief.artDirection.hierarchy || [];
      const notSaturated = hierarchy.length <= 4;
      const hasCopy = Boolean(ctx.brief.copy.title || ctx.brief.copy.cta);
      const reservesSpace = ctx.composedPrompt.sections.some((s) => s.id === 'copy');
      const passed = notSaturated && (!hasCopy || reservesSpace);
      return {
        passed,
        detail: passed
          ? `Jerarquía con ${hierarchy.length} elemento(s), espacio de texto reservado cuando hace falta.`
          : `Jerarquía con ${hierarchy.length} elemento(s) (máximo recomendado: 4), o falta reservar espacio de texto.`,
      };
    },
  },
  {
    id: 'composicion',
    label: 'Composición',
    fix: 'Completar brief.artDirection.composition y structure — hoy están vacíos.',
    evaluate: (ctx) => {
      const { composition, structure } = ctx.brief.artDirection;
      const passed = Boolean(composition && structure);
      return {
        passed,
        detail: passed ? `Composición: "${composition}". Estructura: "${structure}".` : 'Falta composición y/o estructura declaradas en artDirection.',
      };
    },
  },
];

module.exports = { CHECKS };
