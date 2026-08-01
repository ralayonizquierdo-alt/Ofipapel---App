// Arquetipos de variante. Cada uno es un DELTA (unos pocos campos, listos
// para usarse como overrides de JOB_INPUT_SHAPE) más una referencia al
// documento de knowledge/ donde vive el criterio completo — nunca una
// redescripción de ese criterio. Es la respuesta concreta a "sin duplicar
// lógica": si quien lea esto quiere el razonamiento completo de por qué
// "Lifestyle" se compone así, va a knowledgeRef, no a este fichero.
//
// 6 de los 8 arquetipos pedidos tienen entrada exacta en
// knowledge/campaign-strategies.md. Los otros 2:
//  - "Minimalista" no es una ESTRATEGIA de ese documento, es un MODO de
//    knowledge/creative-playbook.md §2 ("Minimalismo / informar") — se
//    referencia igual, solo que a otro documento.
//  - "Premium" no tiene entrada propia en ningún sitio — se modela como
//    "Producto Hero" (campaign-strategies.md §3) con un delta de
//    composición más generoso en espacio negativo (art-direction-rules.md
//    §"Espacio negativo"), y se documenta así explícitamente para que
//    quede claro que es una composición derivada, no un patrón nuevo
//    inventado aquí.

const VARIANT_ARCHETYPES = [
  {
    id: 'lifestyle',
    label: 'Lifestyle',
    knowledgeRef: { doc: 'knowledge/campaign-strategies.md', section: '2', name: 'Lifestyle' },
    delta: { format: 'foto', objective: 'emocionar', creativeStyle: 'Lifestyle: producto en una escena de vida real, tono natural, CTA suave — vende marca antes que producto.' },
    eligibility: { requiresEvent: null, allowIfCategory: [] },
  },
  {
    id: 'minimalista',
    label: 'Minimalista',
    knowledgeRef: { doc: 'knowledge/creative-playbook.md', section: '2', name: 'Minimalismo / informar' },
    delta: { format: 'foto', objective: 'minimalista', creativeStyle: 'Minimalismo/informar: fondo limpio, tipografía técnica, solo 2-3 datos clave, sin adjetivos vacíos.' },
    eligibility: { requiresEvent: null, allowIfCategory: [] },
  },
  {
    id: 'premium',
    label: 'Premium',
    knowledgeRef: { doc: 'knowledge/campaign-strategies.md', section: '3', name: 'Producto Hero (delta premium)' },
    delta: { format: 'foto', objective: 'minimalista', creativeStyle: 'Producto Hero con tratamiento premium: espacio negativo generoso, luz cuidada, cero distracciones, tono directo y seguro.' },
    eligibility: { requiresEvent: null, allowIfCategory: [], minTicketBand: 'medio' },
  },
  {
    id: 'oferta',
    label: 'Oferta',
    knowledgeRef: { doc: 'knowledge/campaign-strategies.md', section: '7', name: 'Oferta Flash' },
    delta: { format: 'foto', objective: 'vender', creativeStyle: 'Oferta Flash: precio/descuento visible sin dominar el encuadre, urgencia con límite de tiempo explícito.' },
    eligibility: { requiresEvent: null, allowIfCategory: [] },
  },
  {
    id: 'black-friday',
    label: 'Black Friday',
    knowledgeRef: { doc: 'knowledge/campaign-strategies.md', section: '4', name: 'Black Friday' },
    delta: { format: 'foto', objective: 'vender', creativeStyle: 'Black Friday: el descuento es el elemento más grande de la pieza, contraste alto, CTA con fecha/hora explícita.' },
    eligibility: { requiresEvent: 'black-friday', allowIfCategory: ['oferta'] },
  },
  {
    id: 'problema-solucion',
    label: 'Problema → Solución',
    knowledgeRef: { doc: 'knowledge/campaign-strategies.md', section: '1', name: 'Problema → Solución' },
    delta: { format: 'carrusel', objective: 'emocionar', creativeStyle: 'Problema → Solución: dos tiempos claros, el "antes" (tensión) y el "después" (calma), tono cercano y conversacional.' },
    eligibility: { requiresEvent: null, allowIfCategory: [] },
  },
  {
    id: 'comparativa',
    label: 'Comparativa',
    knowledgeRef: { doc: 'knowledge/campaign-strategies.md', section: '9', name: 'Comparativa' },
    delta: { format: 'carrusel', objective: 'minimalista', creativeStyle: 'Comparativa: estructura de dos columnas, 2-4 puntos como máximo, tono objetivo y casi neutro.' },
    eligibility: { requiresEvent: null, allowIfCategory: [] },
  },
  {
    id: 'corporate',
    label: 'Corporate',
    knowledgeRef: { doc: 'knowledge/campaign-strategies.md', section: '11', name: 'Empresas (B2B)' },
    delta: { format: 'foto', objective: 'minimalista', creativeStyle: 'Empresas (B2B): sobria, foco en el argumento práctico (ahorro de tiempo, precio por volumen, servicio), tono profesional.' },
    eligibility: { requiresEvent: null, allowIfCategory: [] },
  },
];

module.exports = { VARIANT_ARCHETYPES };
