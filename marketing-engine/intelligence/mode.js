// El único interruptor entre los dos modos de la capa de inteligencia.
//
// 'shadow' (por defecto): analiza cada campaña, genera su propia
// recomendación, la compara con la decisión real que tomó el pipeline, y
// registra la comparación — pero NUNCA cambia una decisión real. El
// pipeline se comporta exactamente igual que si intelligence/ no
// existiera.
//
// 'decision': la recomendación pasa a ser un override de
// job.input ANTES de que 01-director-creativo decida — pero solo para los
// campos que el usuario no haya fijado ya explícitamente en el formulario
// de "Nueva Campaña" (un override del usuario siempre gana). Ver
// index.js → applyAsOverrides().
//
// Cambiar de 'shadow' a 'decision' es SOLO esto — una variable de entorno.
// Ningún otro cambio de código es necesario, y volver a 'shadow' es
// igual de inmediato. Criterio de cuándo activarlo: ver ROADMAP_V2.md,
// Fase 1 ("cuando se hayan comparado suficientes campañas en shadow mode
// y las recomendaciones sean mejores o equivalentes a las decisiones
// manuales").
//
// Se lee del entorno en cada llamada (nunca cacheada al cargar el
// módulo) — mismo criterio que MARKETING_ENGINE_JOBS_DIR en
// core/job-store.js, para que un test o una invocación puedan cambiarla
// en caliente.

const MODES = ['shadow', 'decision'];
const DEFAULT_MODE = 'shadow';

function currentMode() {
  const raw = (process.env.MARKETING_ENGINE_INTELLIGENCE_MODE || DEFAULT_MODE).toLowerCase();
  return MODES.includes(raw) ? raw : DEFAULT_MODE;
}

module.exports = { currentMode, MODES, DEFAULT_MODE };
