// Reloj inyectable para toda la capa de inteligencia. Dos motivos, no uno:
// (1) la estacionalidad (product-intelligence/) necesita una fecha "de
// verdad" para decidir qué está activo, y (2) sin esto no habría forma de
// verificar el módulo de forma determinista sin un framework de tests —
// fijar MARKETING_ENGINE_NOW permite comprobar que la misma entrada
// produce siempre la misma salida, y que fechas distintas producen
// recomendaciones distintas. Mismo criterio que
// core/job-store.js → jobsBaseDir() (leer la env var en cada llamada, no
// cachearla al cargar el módulo).

function effectiveNow() {
  const override = process.env.MARKETING_ENGINE_NOW;
  if (override) {
    const parsed = new Date(override);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function toMonthDay(date) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

module.exports = { effectiveNow, toMonthDay };
