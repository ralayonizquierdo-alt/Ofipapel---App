// Menú de conteos válido (pedido explícitamente así por el propietario) y
// la tabla de ángulos visuales — el eje de variación de este componente.
//
// Importante: esto es un eje ORTOGONAL al de
// marketing-engine/intelligence/variant-engine/. Aquel varía QUÉ campaña
// (estrategia: Lifestyle vs Black Friday vs Corporate — devuelve overrides
// de job.input). Este varía CÓMO se fotografía una campaña YA elegida
// (ejecución visual: encuadre, luz, composición de UNA estrategia fija).
// Componen multiplicativamente (3 campañas × 5 ángulos = 15 piezas), no
// se consolidan — ver creative-engine/ARCHITECTURE.md.

const VARIANT_COUNTS = [1, 3, 5, 10];

// Cada ángulo es un delta de encuadre/luz/composición que se fusiona
// sobre brief.photography/artDirection antes de componer el prompt de esa
// variante — nunca reemplaza la estrategia, solo cómo se ejecuta
// visualmente. Orden declarado = orden de selección (determinista: pedir
// N variantes toma los primeros N).
const VISUAL_ANGLES = [
  { id: 'frontal-limpio', label: 'Frontal limpio', framing: 'plano frontal centrado, producto de cara a cámara', lighting: 'luz uniforme y suave', composition: 'simétrica, producto como protagonista único' },
  { id: 'detalle-macro', label: 'Detalle macro', framing: 'primer plano macro de un detalle característico del producto', lighting: 'luz direccional que resalta la textura', composition: 'muy cerca, fondo desenfocado' },
  { id: 'angulo-dinamico', label: 'Ángulo dinámico', framing: 'ángulo de 45 grados en diagonal, ligera perspectiva', lighting: 'contraluz suave con reflejo', composition: 'asimétrica, línea de fuerza diagonal' },
  { id: 'contexto-lifestyle', label: 'Contexto lifestyle', framing: 'producto en uso dentro de un entorno real reconocible', lighting: 'luz natural de ventana', composition: 'regla de tercios, entorno visible alrededor' },
  { id: 'plano-cenital', label: 'Plano cenital', framing: 'vista cenital (desde arriba), producto centrado', lighting: 'luz difusa uniforme desde arriba', composition: 'plana y ordenada, tipo flat-lay' },
  { id: 'luz-dramatica', label: 'Luz dramática', framing: 'plano frontal con foco en el volumen del producto', lighting: 'iluminación dramática de alto contraste, una sola fuente lateral', composition: 'centrada, con sombras marcadas' },
  { id: 'fondo-solido', label: 'Fondo sólido', framing: 'producto aislado sobre fondo de color sólido de marca', lighting: 'luz de estudio pareja, sin sombras duras', composition: 'centrado, máximo espacio negativo alrededor' },
  { id: 'composicion-asimetrica', label: 'Composición asimétrica', framing: 'producto desplazado hacia un lateral del encuadre', lighting: 'luz suave direccional', composition: 'asimétrica deliberada, espacio negativo en el lado opuesto' },
  { id: 'primer-plano-textura', label: 'Primer plano de textura', framing: 'primer plano que muestra el material y acabado del producto', lighting: 'luz rasante que resalta la textura superficial', composition: 'muy cerca, detalle a pantalla completa' },
  { id: 'vista-en-uso', label: 'Vista en uso', framing: 'producto siendo usado, en su contexto real de uso', lighting: 'luz ambiente natural', composition: 'dinámica, ligera profundidad de campo' },
];

module.exports = { VARIANT_COUNTS, VISUAL_ANGLES };
