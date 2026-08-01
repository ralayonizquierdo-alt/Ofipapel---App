// Biblioteca atómica: JERARQUÍAS TIPOGRÁFICAS — NUNCA pide renderizar
// texto (mismo principio de "composición posterior" que
// creative-engine/prompt-composer/sections/copy.js). Define cuánto
// espacio negativo reservar y con qué peso relativo, para que texto y
// logo se compongan después.

module.exports = [
  { id: 'titular-dominante', label: 'Titular dominante', text: 'reservar una zona amplia y limpia para un titular protagonista, mayor peso que el logo', tags: ['general'] },
  { id: 'logo-dominante', label: 'Logo dominante', text: 'reservar espacio para que el logo tenga más protagonismo que cualquier texto', tags: ['general', 'lujo', 'joyeria'] },
  { id: 'minimo-texto-hero', label: 'Mínimo texto, foto héroe', text: 'reservar solo una franja mínima para texto — la fotografía del producto es la protagonista casi absoluta', tags: ['general', 'belleza', 'joyeria'] },
  { id: 'texto-superior-cta-inferior', label: 'Texto arriba, CTA abajo', text: 'reservar zona limpia en la parte superior para el titular y otra en la parte inferior para el botón de llamada a la acción', tags: ['general'] },
  { id: 'texto-lateral', label: 'Texto lateral (formato horizontal)', text: 'reservar una franja lateral completa limpia para el bloque de texto', tags: ['general'] },
  { id: 'texto-centrado-sobre-fondo', label: 'Texto centrado sobre fondo', text: 'reservar una zona central limpia sobre el fondo, texto centrado sobre la composición', tags: ['general'] },
  { id: 'sin-texto-solo-marca', label: 'Sin texto, solo marca', text: 'no reservar espacio de titular — solo un área pequeña y discreta para el logo de marca', tags: ['lujo', 'moda'] },
];
