// Semilla textual inicial de la Biblioteca de Referencias — 15 entradas
// basadas en principios generales de fotografía publicitaria/dirección
// de arte, NO en ninguna campaña real con derechos de terceros (decisión
// del propietario: "semilla textual, sin imágenes"). `sourceType:
// 'seed-textual'` en todas — documentado en ARCHITECTURE.md.
//
// Se ejecuta UNA VEZ para poblar entries/ + manifest.json (idempotente:
// registerEntry sobreescribe por id, se puede re-ejecutar sin duplicar).
// Sirve también de referencia de formato para quien añada entradas nuevas
// a mano, y es la base del futuro importador automático (mismo
// registerEntry(), ver ARCHITECTURE.md).

const { registerEntry } = require('./service.js');

const CURATED_AT = '2026-07-25';
const SOURCE_TYPE = 'seed-textual';

const SEED = [
  {
    id: 'producto-heroe-estudio-clasico', label: 'Producto héroe de estudio clásico',
    styleId: 'producto-flotante-estudio', compositionId: 'simetria-centrada', artDirectionId: 'minimalismo',
    lightingId: 'softbox-estudio', scenarioId: 'estudio-fondo-blanco', paletteHarmonyId: 'neutra-con-acento-marca',
    angleLensId: 'frontal-centrado', emotion: 'confianza y claridad', textSpaceId: 'titular-dominante',
    idealProducts: ['electrodomesticos', 'tecnologia', 'general'],
    whenToUse: 'Cuando el producto necesita presentarse con máxima claridad — catálogo o primera campaña de lanzamiento.',
    whenToAvoid: 'Evitar en campañas que buscan cercanía emocional o contexto de uso real.',
    whatMakesItSpecial: 'La ausencia total de distracción hace que toda la atención recaiga en la forma del producto — funciona porque elimina el ruido, no porque añada nada.',
    whyItWorksOnSocial: 'Se lee perfectamente incluso en miniatura de feed — alto contraste con fondo blanco puro.',
    visualImpactLevel: 78,
  },
  {
    id: 'lifestyle-cocina-calida', label: 'Lifestyle de cocina cálida',
    styleId: 'lifestyle-documental', compositionId: 'encuadre-abierto-contexto', artDirectionId: 'organico',
    lightingId: 'ventana-natural', scenarioId: 'cocina-domestica', paletteHarmonyId: 'calida-marca',
    angleLensId: 'tres-cuartos', emotion: 'cercanía y confianza doméstica', textSpaceId: 'texto-superior-cta-inferior',
    idealProducts: ['electrodomesticos', 'alimentacion', 'hogar-decoracion', 'general'],
    whenToUse: 'Cuando se quiere mostrar el producto integrado en la vida real, no como objeto aislado.',
    whenToAvoid: 'Evitar si el objetivo es urgencia de venta (Black Friday) — el tono es demasiado calmado.',
    whatMakesItSpecial: 'La luz de ventana natural hace que la escena se sienta encontrada, no construida — el espectador confía más en lo que parece real.',
    whyItWorksOnSocial: 'El contexto reconocible (una cocina real) genera identificación inmediata al hacer scroll.',
    visualImpactLevel: 71,
  },
  {
    id: 'black-friday-urgencia', label: 'Black Friday / urgencia',
    styleId: 'alto-contraste-drama', compositionId: 'diagonal-dinamica', artDirectionId: 'maximalismo',
    lightingId: 'dura-direccional', scenarioId: 'estudio-fondo-color-marca', paletteHarmonyId: 'alto-contraste-marca',
    angleLensId: 'contrapicado-heroico', emotion: 'urgencia y energía', textSpaceId: 'titular-dominante',
    idealProducts: ['general', 'electrodomesticos', 'tecnologia'],
    whenToUse: 'Campañas de oferta flash o urgencia de precio (rebajas, Black Friday).',
    whenToAvoid: 'Nunca en piezas de marca puras sin oferta real detrás — la urgencia sin motivo real rompe la confianza.',
    whatMakesItSpecial: 'El contraste y la diagonal generan tensión visual que el ojo lee como "algo está pasando ahora".',
    whyItWorksOnSocial: 'Detiene el scroll por energía visual, no por belleza — la pieza correcta cuando hay 48 horas de oferta.',
    visualImpactLevel: 84,
  },
  {
    id: 'producto-flotante-sombra-premium', label: 'Producto flotante con sombra premium',
    styleId: 'producto-heroe-flotante-sombra', compositionId: 'espacio-negativo-dominante', artDirectionId: 'lujo-discreto',
    lightingId: 'low-key-dramatica', scenarioId: 'flotando-sin-escenario', paletteHarmonyId: 'monocroma-marca',
    angleLensId: 'altura-producto', emotion: 'deseo y aspiración', textSpaceId: 'logo-dominante',
    idealProducts: ['joyeria', 'belleza', 'tecnologia', 'general'],
    whenToUse: 'Producto premium/ticket alto, donde el precio se justifica por percepción de calidad.',
    whenToAvoid: 'Evitar en productos de consumo básico — el tono de lujo se sentiría falso.',
    whatMakesItSpecial: 'La sombra dramática y el espacio negativo comunican valor sin decirlo con palabras.',
    whyItWorksOnSocial: 'El vacío alrededor del producto hace que destaque incluso entre publicaciones muy cargadas.',
    visualImpactLevel: 80,
  },
  {
    id: 'producto-en-uso-manos-reales', label: 'Producto en uso, manos reales',
    styleId: 'lifestyle-documental', compositionId: 'encuadre-cerrado-detalle', artDirectionId: 'artesanal-honesto',
    lightingId: 'ventana-natural', scenarioId: 'en-uso-manos', paletteHarmonyId: 'analoga',
    angleLensId: 'tres-cuartos', emotion: 'confianza por demostración', textSpaceId: 'texto-lateral',
    idealProducts: ['electrodomesticos', 'belleza', 'general'],
    whenToUse: 'Cuando el beneficio del producto se entiende mejor viéndolo en uso que describiéndolo.',
    whenToAvoid: 'Evitar si el producto es puramente decorativo/estático — no hay "uso" que mostrar.',
    whatMakesItSpecial: 'Ver una mano real interactuando reduce la fricción de compra — el espectador se imagina usándolo.',
    whyItWorksOnSocial: 'El formato "mira cómo funciona" es de los que más retención genera en redes.',
    visualImpactLevel: 74,
  },
  {
    id: 'flat-lay-desayuno-editorial', label: 'Flat lay editorial',
    styleId: 'flat-lay-cenital', compositionId: 'flat-lay', artDirectionId: 'minimalismo',
    lightingId: 'luz-cenital-suave', scenarioId: 'superficie-textil', paletteHarmonyId: 'neutra-con-acento-marca',
    angleLensId: 'cenital-flat-lay', emotion: 'calma y orden', textSpaceId: 'sin-texto-solo-marca',
    idealProducts: ['alimentacion', 'oficina-papeleria', 'general'],
    whenToUse: 'Contenido de estilo de vida donde varios elementos pequeños se presentan juntos de forma ordenada.',
    whenToAvoid: 'Evitar con un solo producto grande — el flat-lay pierde sentido sin varios elementos que ordenar.',
    whatMakesItSpecial: 'El orden geométrico desde arriba transmite cuidado y curaduría, no venta directa.',
    whyItWorksOnSocial: 'Uno de los formatos más guardados/compartidos en Instagram por su valor estético autónomo.',
    visualImpactLevel: 68,
  },
  {
    id: 'tecnologia-neon-futurista', label: 'Tecnología neón futurista',
    styleId: 'tecnologico-futurista', compositionId: 'composicion-en-l', artDirectionId: 'futurista',
    lightingId: 'neon-color', scenarioId: 'estudio-fondo-blanco', paletteHarmonyId: 'fria-marca',
    angleLensId: 'dutch-angle-editorial', emotion: 'sorpresa e innovación', textSpaceId: 'minimo-texto-hero',
    idealProducts: ['tecnologia', 'general'],
    whenToUse: 'Lanzamiento de producto tecnológico o feature nueva, campañas que buscan sensación de novedad.',
    whenToAvoid: 'Evitar en categorías tradicionales (alimentación, hogar clásico) — rompe la coherencia de marca.',
    whatMakesItSpecial: 'El color neón sobre fondo neutro crea una tensión visual que se lee como "tecnología de verdad".',
    whyItWorksOnSocial: 'Estética muy compartida en nichos de tecnología — genera comentarios sobre el propio look.',
    visualImpactLevel: 76,
  },
  {
    id: 'belleza-reflejo-elegante', label: 'Belleza con reflejo elegante',
    styleId: 'monocromo-elegante', compositionId: 'marco-dentro-del-marco', artDirectionId: 'lujo-discreto',
    lightingId: 'contraluz-rim-light', scenarioId: 'superficie-piedra-marmol', paletteHarmonyId: 'monocroma-marca',
    angleLensId: 'macro-detalle', emotion: 'elegancia serena', textSpaceId: 'minimo-texto-hero',
    idealProducts: ['belleza', 'joyeria', 'general'],
    whenToUse: 'Producto de belleza o cuidado personal donde la textura y el material importan más que el contexto.',
    whenToAvoid: 'Evitar en productos funcionales/técnicos donde la elegancia no es el argumento de venta.',
    whatMakesItSpecial: 'El reflejo en mármol duplica el producto sin añadir ruido — sofisticación por repetición controlada.',
    whyItWorksOnSocial: 'La textura de mármol es reconocible incluso a baja resolución, genera parada visual inmediata.',
    visualImpactLevel: 73,
  },
  {
    id: 'oficina-corporativa-limpia', label: 'Oficina corporativa limpia',
    styleId: 'corporativo-limpio', compositionId: 'regla-tercios', artDirectionId: 'corporativo-clasico',
    lightingId: 'high-key-luminosa', scenarioId: 'escritorio-oficina', paletteHarmonyId: 'neutra-con-acento-marca',
    angleLensId: 'tres-cuartos', emotion: 'confianza profesional', textSpaceId: 'texto-superior-cta-inferior',
    idealProducts: ['oficina-papeleria', 'general'],
    whenToUse: 'Comunicación B2B o de producto de oficina donde la seriedad importa más que la emoción.',
    whenToAvoid: 'Evitar en campañas dirigidas a público muy joven o de tono desenfadado.',
    whatMakesItSpecial: 'La limpieza y el orden comunican fiabilidad — el lenguaje visual que un comprador profesional espera.',
    whyItWorksOnSocial: 'Funciona bien en contextos profesionales, menos viral pero más creíble para ese público.',
    visualImpactLevel: 62,
  },
  {
    id: 'exterior-veraniego-canario', label: 'Exterior veraniego canario',
    styleId: 'mediterraneo-canario', compositionId: 'encuadre-abierto-contexto', artDirectionId: 'organico',
    lightingId: 'golden-hour', scenarioId: 'exterior-canario-mediterraneo', paletteHarmonyId: 'calida-marca',
    angleLensId: 'gran-angular', emotion: 'frescor y disfrute', textSpaceId: 'texto-superior-cta-inferior',
    idealProducts: ['electrodomesticos', 'alimentacion', 'general'],
    whenToUse: 'Campañas de temporada (verano) con anclaje local — refuerza la conexión con el público canario.',
    whenToAvoid: 'Evitar fuera de temporada de verano — el anclaje estacional es explícito y perdería sentido.',
    whatMakesItSpecial: 'La luz dorada de exterior real ancla el producto en un momento y lugar reconocible para el público local.',
    whyItWorksOnSocial: 'El anclaje geográfico/estacional genera identificación inmediata con la audiencia canaria.',
    visualImpactLevel: 75,
  },
  {
    id: 'moda-urbana-street', label: 'Moda urbana street',
    styleId: 'street-style-urbano', compositionId: 'asimetria-equilibrada', artDirectionId: 'experimental-conceptual',
    lightingId: 'difusa-nublada', scenarioId: 'contexto-urbano', paletteHarmonyId: 'complementaria',
    angleLensId: 'perfil-lateral', emotion: 'actitud y personalidad', textSpaceId: 'texto-lateral',
    idealProducts: ['moda', 'general'],
    whenToUse: 'Producto con componente de estilo/identidad, público joven urbano.',
    whenToAvoid: 'Evitar en productos funcionales de hogar/oficina — el tono urbano no encaja.',
    whatMakesItSpecial: 'El fondo urbano desenfocado da contexto de vida real sin robar protagonismo al producto.',
    whyItWorksOnSocial: 'Estética coherente con el feed de moda/lifestyle, genera afinidad de identidad más que de producto.',
    visualImpactLevel: 70,
  },
  {
    id: 'infantil-pastel-amable', label: 'Infantil pastel amable',
    styleId: 'pastel-soft', compositionId: 'triangular-estable', artDirectionId: 'minimalismo',
    lightingId: 'high-key-luminosa', scenarioId: 'estudio-fondo-color-marca', paletteHarmonyId: 'analoga',
    angleLensId: 'altura-producto', emotion: 'ternura y seguridad', textSpaceId: 'titular-dominante',
    idealProducts: ['infantil', 'general'],
    whenToUse: 'Producto dirigido a familias con niños pequeños, donde la seguridad/amabilidad es el argumento.',
    whenToAvoid: 'Evitar en categorías técnicas o de alto ticket — el tono pastel infantiliza el producto.',
    whatMakesItSpecial: 'Los colores pastel y la luz alta comunican seguridad sin necesidad de texto explicativo.',
    whyItWorksOnSocial: 'Alta capacidad de generar "ternura" que impulsa guardados y compartidos entre padres.',
    visualImpactLevel: 65,
  },
  {
    id: 'gastronomia-rustica-calida', label: 'Gastronomía rústica cálida',
    styleId: 'rustico-campestre', compositionId: 'capas-primer-segundo-plano', artDirectionId: 'artesanal-honesto',
    lightingId: 'golden-hour', scenarioId: 'superficie-textil', paletteHarmonyId: 'calida-marca',
    angleLensId: 'tres-cuartos', emotion: 'apetito y calidez', textSpaceId: 'sin-texto-solo-marca',
    idealProducts: ['alimentacion', 'general'],
    whenToUse: 'Producto alimentario donde se busca sensación de tradición/hecho en casa.',
    whenToAvoid: 'Evitar en producto alimentario industrial/procesado — la estética rústica generaría disonancia con el producto real.',
    whatMakesItSpecial: 'La luz cálida y la textura de tela envejecen visualmente la escena de forma deliberada y apetecible.',
    whyItWorksOnSocial: 'El género "comida casera" es de los que más engagement genera de forma constante.',
    visualImpactLevel: 72,
  },
  {
    id: 'despiece-tecnico-caracteristicas', label: 'Despiece técnico de características',
    styleId: 'despiece-tecnico', compositionId: 'radial-desde-producto', artDirectionId: 'corporativo-clasico',
    lightingId: 'softbox-estudio', scenarioId: 'estudio-fondo-blanco', paletteHarmonyId: 'neutra-con-acento-marca',
    angleLensId: 'frontal-centrado', emotion: 'confianza informada', textSpaceId: 'texto-lateral',
    idealProducts: ['electrodomesticos', 'tecnologia', 'general'],
    whenToUse: 'Cuando las características técnicas son el argumento de venta principal (potencia, capacidad, prestaciones).',
    whenToAvoid: 'Evitar en campañas puramente emocionales/de marca — satura de información un formato que pide sencillez.',
    whatMakesItSpecial: 'La composición radial permite señalar varias características sin perder al producto como centro.',
    whyItWorksOnSocial: 'Funciona mejor como pieza informativa (carrusel/story) que como imagen única de feed.',
    visualImpactLevel: 69,
  },
  {
    id: 'unboxing-descubrimiento', label: 'Unboxing / descubrimiento',
    styleId: 'unboxing-experiencial', compositionId: 'encuadre-cerrado-detalle', artDirectionId: 'experimental-conceptual',
    lightingId: 'dura-direccional', scenarioId: 'punto-de-venta', paletteHarmonyId: 'alto-contraste-marca',
    angleLensId: 'tres-cuartos', emotion: 'anticipación y sorpresa', textSpaceId: 'minimo-texto-hero',
    idealProducts: ['tecnologia', 'general'],
    whenToUse: 'Lanzamiento de producto nuevo — busca sensación de "momento especial de apertura".',
    whenToAvoid: 'Evitar en productos de reposición/consumibles sin momento de "primera vez".',
    whatMakesItSpecial: 'Captura el instante de descubrimiento, un gancho narrativo más que una simple foto de producto.',
    whyItWorksOnSocial: 'El formato unboxing tiene demanda propia y alta tasa de reproducción completa en vídeo/carrusel.',
    visualImpactLevel: 77,
  },
];

function seed() {
  for (const entry of SEED) {
    registerEntry({ ...entry, sourceType: SOURCE_TYPE, curatedAt: CURATED_AT });
  }
  console.log(`Sembradas ${SEED.length} referencias.`);
}

if (require.main === module) seed();

module.exports = { seed, SEED };
