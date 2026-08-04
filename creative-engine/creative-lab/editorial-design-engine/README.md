# Editorial Design Engine

Decide recursos expresivos de dirección de arte que Art Direction Engine
(`../art-direction-engine/`) todavía no cubría: dónde crear tensión
visual, cuándo romper la simetría, cuándo superponer elementos a
propósito, cuándo dejar que el producto invada el lienzo, cuándo usar una
banda de color. **No renderiza, no genera imágenes, no calcula
geometría** — eso lo siguen haciendo `layout-composer/`, los proveedores
de imagen y Composition Engine (`../layout-intelligence/`)
respectivamente. Ver la sección "Sprint Design Evolution v2" en
[`../ARCHITECTURE.md`](../ARCHITECTURE.md) para el diseño completo.

## Orden real del pipeline

```
Creative Brief → Creative Lab → Art Direction Engine → Editorial Design Engine (este módulo)
  → Composition Engine (layout-intelligence/, obedece esta decisión) → Design Director Engine → render
```

## Qué decide

`service.js#directEditorial(concept, artDirection) -> EditorialDecision`:

```
breakSymmetry   → true si el patrón ya eligió una alineación asimétrica (art-direction-engine/patterns.js#alignment)
tensionZone     → hacia qué esquina se desplaza el peso visual ('top-left'|'top-right'|'center')
allowOverlap    → pares de elementos que pueden superponerse a propósito (solo título↔hero, solo en patrones de alto impacto — config.js#OVERLAP_ALLOWANCE_PATTERNS)
canvasBleed     → si el producto puede desbordar el margen estructural por un lado
colorBand       → si la pieza lleva una banda de color de acento y en qué borde
```

Todo determinista a partir de datos que Art Direction Engine ya calculó
(`patternId`, `alignment`) — nunca vuelve a decidir el patrón, nunca
inventa una fuente de verdad nueva.

## Por qué las excepciones de solape no rompen "cero solapes"

`layout-intelligence/balance-score.js` y `design-director/criteria.js`
penalizan solapes por defecto (una campaña real no los tiene por
accidente). `allowOverlap` es una lista corta y explícita de
excepciones DELIBERADAS — ambos scorers la reciben y dejan de contar como
colisión exactamente esos pares, dentro de un `maxOverlapRatio` acotado.
Cualquier otro solape sigue penalizándose igual que siempre.
