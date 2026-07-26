# Layout Intelligence

Calcula y puntúa la composición completa de una pieza — grid, jerarquía
visual, tamaños relativos, márgenes, espacios en blanco y reglas de
equilibrio — **antes de que exista ningún HTML que renderizar**. Ningún
elemento se posiciona por coordenadas fijas: todo sale de reglas
computadas sobre un grid. Ver la sección "Sprint Layout Intelligence" en
[`../ARCHITECTURE.md`](../ARCHITECTURE.md) para el diseño completo,
incluidos los bugs reales encontrados y corregidos con un test sintético
antes de tocar el renderer.

## Flujo

```
grid.js            → matemática pura (columnas/filas, cajas en px, solapes, espacio en blanco)
hierarchy.js        → tier de tamaño + orden de apilado por elemento
strategies/          → 6 reglas de equilibrio, cada una computePlan(grid, tiers, elementos, orden) → cajas
balance-score.js    → puntúa el plan (0-100, 5 componentes que suman 100)
service.js#planLayout → orquesta: si no supera el umbral, prueba otra estrategia (acotado, determinista)
```

`../layout-composer/service.js` es el único consumidor: llama a
`planLayout()`, pasa el resultado a `render-plan.js#buildHtmlFromPlan()`,
y renderiza. Este módulo no sabe nada de HTML ni de Playwright.

## Umbral y reintentos

```bash
CREATIVE_LAB_LAYOUT_QUALITY_THRESHOLD=70   # por defecto
CREATIVE_LAB_LAYOUT_MAX_RETRIES=4          # por defecto
```

Mismo patrón que `creative-lab/config.js#QUALITY_THRESHOLD`/`MAX_RETRIES`.
Si ninguna estrategia probada supera el umbral, se devuelve la mejor vista
con `passed:false` — nunca lanza, nunca bucle infinito.

## Añadir una estrategia nueva

Un fichero en `strategies/` con `computePlan(grid, tierByElement,
elementIds, stackOrder) -> {elements, decorations}` (ver cualquiera de
los 6 existentes) + una entrada en `strategies/index.js` y en
`config.js#STRATEGY_ROTATION`/`STRATEGY_BY_COMPOSITION`. Los helpers de
`strategies/_shared.js` (`spanForTier`, `centerColStart`, `stackVertically`,
`footerBleedBox`, `topRightCorner`, `insetGrid`) cubren la mayoría de
necesidades sin repetir aritmética de grid.
