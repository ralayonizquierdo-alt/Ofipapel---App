// Tabla de reglas: categoría de producto → decisiones por defecto del
// Director Creativo en modo simulado. Editar esta tabla para afinar el
// comportamiento sin tocar service.js.

const CATEGORY_RULES = {
  electrodomesticos: { postType: 'reel', tone: 'cercano y práctico', graphicFamily: 'producto-sobre-fondo-marca' },
  papeleria: { postType: 'carrusel', tone: 'cercano y familiar', graphicFamily: 'producto-sobre-fondo-marca' },
  oferta: { postType: 'foto', tone: 'urgente y directo', graphicFamily: 'oferta-destacada' },
  default: { postType: 'foto', tone: 'cercano', graphicFamily: 'producto-sobre-fondo-marca' },
};

const DEFAULT_CHANNEL = 'ambas';

// Mapeo de job.input.objective (si el usuario lo elige explícitamente en
// la app) a un tono — mismos 4 modos de comunicación que
// marketing-engine/knowledge/creative-playbook.md. Cuando está presente,
// prima sobre el tono por defecto de CATEGORY_RULES (ver service.js).
const OBJECTIVE_TONE_MAP = {
  vender: 'directo y persuasivo, con urgencia clara',
  emocionar: 'cálido y cercano, construye relación antes que vender',
  sorprender: 'rompe el patrón habitual del feed, con energía',
  minimalista: 'sobrio, preciso, sin adjetivos vacíos',
};

module.exports = { CATEGORY_RULES, DEFAULT_CHANNEL, OBJECTIVE_TONE_MAP };
