// Biblioteca atómica: TENDENCIAS en redes sociales — a propósito
// ESTÁTICA y fechada (curatedAt), sin conexión a ninguna fuente en vivo.
// Coherente con "cero dependencias, sin llamadas de red" de todo el
// repo. Necesita refresco MANUAL periódico — ver
// creative-lab/ARCHITECTURE.md, sección "Mantenimiento de bibliotecas".

const CURATED_AT = '2026-07';

module.exports = [
  { id: 'grano-analogico-autentico', label: 'Grano analógico auténtico', text: 'textura de grano fotográfico sutil, sensación auténtica y no sobre-producida', tags: ['general', 'moda'], curatedAt: CURATED_AT },
  { id: 'color-blocking-atrevido', label: 'Color-blocking atrevido', text: 'bloques de color atrevidos y contrastados, muy compartible en feed', tags: ['moda', 'general'], curatedAt: CURATED_AT },
  { id: 'hibrido-3d-fotografia', label: 'Híbrido render 3D + fotografía real', text: 'elementos de render 3D combinados con la fotografía real del producto', tags: ['tecnologia', 'general'], curatedAt: CURATED_AT },
  { id: 'texturas-collage-papel', label: 'Texturas de collage y papel', text: 'texturas de recorte de papel y collage como fondo, sensación hecha a mano', tags: ['general', 'oficina-papeleria'], curatedAt: CURATED_AT },
  { id: 'maximalismo-surreal-ia-nativo', label: 'Maximalismo surreal "nativo de IA"', text: 'composición maximalista y ligeramente surreal, estética que abraza lo generado por IA', tags: ['general', 'moda'], curatedAt: CURATED_AT },
  { id: 'nostalgia-y2k', label: 'Nostalgia Y2K', text: 'referencias visuales de finales de los 90 / principios de los 2000', tags: ['moda', 'general'], curatedAt: CURATED_AT },
  { id: 'minimalismo-calmado-quiet', label: 'Minimalismo calmado ("quiet")', text: 'minimalismo calmado, colores apagados, sensación de pausa frente al ruido del feed', tags: ['general', 'belleza'], curatedAt: CURATED_AT },
  { id: 'texturas-organicas-crudas', label: 'Texturas orgánicas crudas', text: 'texturas orgánicas muy presentes (tierra, agua, fibra natural), tendencia de autenticidad', tags: ['alimentacion', 'hogar-decoracion'], curatedAt: CURATED_AT },
  { id: 'contenido-vertical-nativo', label: 'Contenido vertical nativo', text: 'composición pensada nativamente para formato vertical de móvil, no un recorte de horizontal', tags: ['general'], curatedAt: CURATED_AT },
  { id: 'gradientes-holograficos', label: 'Gradientes holográficos', text: 'gradientes de color tipo holográfico/iridiscente', tags: ['tecnologia', 'belleza'], curatedAt: CURATED_AT },
  { id: 'realismo-imperfecto', label: 'Realismo imperfecto', text: 'estética deliberadamente imperfecta frente a la sobre-producción, sensación de contenido real', tags: ['general', 'alimentacion'], curatedAt: CURATED_AT },
  { id: 'monocromo-editorial-redes', label: 'Monocromo editorial para redes', text: 'paleta casi monocroma que destaca fuerte en un feed lleno de color', tags: ['general', 'moda'], curatedAt: CURATED_AT },
];
