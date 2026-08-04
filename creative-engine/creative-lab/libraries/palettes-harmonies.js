// Biblioteca atómica: PALETAS Y ARMONÍAS — reglas de armonía que se
// APLICAN sobre la paleta real de la marca (design-studio/brand-kit.json,
// fuente de verdad ya decidida). Esta biblioteca son las REGLAS, no
// colores fijos — evita duplicar brand-kit.json.

module.exports = [
  { id: 'monocroma-marca', label: 'Monocroma sobre la marca', text: 'paleta monocroma construida a partir del color principal de marca, variando solo luminosidad', tags: ['general'] },
  { id: 'complementaria', label: 'Complementaria', text: 'paleta complementaria: color de marca + su opuesto en el círculo cromático como acento puntual', tags: ['general'] },
  { id: 'analoga', label: 'Análoga', text: 'paleta análoga: colores vecinos al color de marca en el círculo cromático, armonía suave', tags: ['general', 'hogar-decoracion'] },
  { id: 'triadica', label: 'Triádica', text: 'paleta triádica: tres colores equidistantes en el círculo cromático, uno de ellos el de marca', tags: ['moda', 'general'] },
  { id: 'neutra-con-acento-marca', label: 'Neutra con acento de marca', text: 'paleta prácticamente neutra (blancos, grises, beige) con el color de marca como único acento', tags: ['general', 'oficina-papeleria', 'tecnologia'] },
  { id: 'calida-marca', label: 'Cálida sobre la marca', text: 'paleta de tonos cálidos que incorpora el color de marca de forma coherente', tags: ['alimentacion', 'hogar-decoracion'] },
  { id: 'fria-marca', label: 'Fría sobre la marca', text: 'paleta de tonos fríos que incorpora el color de marca de forma coherente', tags: ['tecnologia', 'general'] },
  { id: 'alto-contraste-marca', label: 'Alto contraste con la marca', text: 'paleta de alto contraste, el color de marca resaltado frente a un fondo muy distinto', tags: ['general', 'deporte'] },
];
