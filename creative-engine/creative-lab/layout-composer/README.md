# Layout Composer

La pieza que faltaba entre "Creative Lab decide" y "se ve en la imagen
final". Antes de este módulo, el concepto ganador (estilo, composición,
iluminación, escenario...) solo describía un prompt — el maquetado real
seguía siendo una única plantilla fija, sin relación con esa decisión.

Desde el sprint "Layout Intelligence" (2026-07-26), este módulo **solo
orquesta y renderiza**: la geometría (grid, jerarquía visual, tamaños
relativos, márgenes, espacios en blanco, reglas de equilibrio) se calcula
y se puntúa en [`../layout-intelligence/`](../layout-intelligence/) ANTES
de que exista ningún HTML — ver su `ARCHITECTURE.md`. Aquí ya no vive
ninguna coordenada escrita a mano; los antiguos 6 "arquetipos" con
posiciones fijas (`archetypes/*.js`) se retiraron.

## Qué hace

1. Decide qué elementos hay que colocar según qué datos existen de verdad
   (`service.js#resolveElementIds` — nunca se inventa un elemento sin
   dato detrás: sin logo declarado no hay chip de logo, sin precio no hay
   badge, etc.).
2. Llama a `layout-intelligence/service.js#planLayout()` — calcula y
   puntúa la composición, reintentando con otra estrategia si no supera
   el umbral (ver esa `ARCHITECTURE.md` para el detalle completo).
3. `render-plan.js#buildHtmlFromPlan()` traduce el `LayoutPlan` ya
   resuelto (cada elemento con su `{x,y,w,h}` en píxeles) al HTML/CSS
   final, usando `render-helpers.js` para el estilo visual de cada tipo
   de elemento (hero, logo, título, cta, precio, footer de contacto).
4. Renderiza a PNG vía `design-studio/scripts/render-html.js` (mismo
   motor que ya usa `marketing-engine/07-maquetador`, nunca
   reimplementado).

## Añadir un elemento nuevo (p.ej. un badge de descuento)

No se toca este módulo en el paso 1: se añade el elemento a
`layout-intelligence/hierarchy.js` (tier por defecto) y a la estrategia
que corresponda en `layout-intelligence/strategies/` (dónde va su caja).
Aquí solo hace falta un `render*Markup()` nuevo en `render-helpers.js` y
una línea en `render-plan.js` que lo invoque si el elemento está presente
en el plan — la posición ya viene resuelta, este módulo nunca decide
dónde.

## Fuera de alcance (por ahora)

- Reglas de armonía de paleta (`paletteHarmonyId`) — se sigue usando
  `preparedAssets.brand.palette` directamente, sin aplicar todavía la
  regla de armonía elegida por el concepto.
- Tendencias (`trendId`) — biblioteca validada pero no cableada en ningún
  punto de Creative Lab todavía (ver `creative-lab/ARCHITECTURE.md`).
