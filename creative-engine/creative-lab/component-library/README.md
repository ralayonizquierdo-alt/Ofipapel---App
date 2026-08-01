# Component Library

Biblioteca de componentes visuales premium con variantes reales,
seleccionadas de forma determinista — sprint "Design Evolution v2"
(2026-07-26), instrucción explícita del propietario: *"Eliminar
definitivamente el aspecto de 'plantilla automática' [...] cada
componente deberá tener múltiples variantes. Nunca repetir siempre la
misma."*

## Qué NO hace

- No decide posición (`layout-intelligence/` sigue siendo el único que
  calcula cajas en píxeles).
- No decide contenido (texto/precio/CTA siguen viniendo del
  `CreativeBrief`, nunca se fabrica copy nuevo).
- No escapa HTML ni compone el documento final
  (`layout-composer/render-helpers.js` sigue siendo el único que llama a
  `escapeHtml` y posiciona con `positionedDiv`).

Solo decide **tratamiento visual**: de las N variantes reales de un
componente, cuál usar esta vez.

## Estructura

- `config.js` — `COMPONENT_TYPES`: los 9 tipos de componente.
- `variants.js` — `VARIANT_IDS`: 2 a 4 variantes reales por tipo (el
  primer id de cada lista es siempre el tratamiento anterior a este
  sprint — nunca se pierde la opción "clásica", solo deja de ser la
  única).
- `service.js` — `selectVariant(componentType, seed)`: hash determinista
  de `seed` (normalmente `${conceptId}::${patternId}`, ver
  `layout-composer/service.js#composeLayout`) — misma campaña siempre
  produce la misma variante (reproducible), campañas distintas casi
  nunca coinciden. Mismo patrón `hashString` ya usado en
  `art-direction-engine/service.js` y `concept-generator/service.js`
  (duplicado deliberado, 3 líneas, documentado en cada sitio).
- `renderers.js` — un generador de estilo/markup por tipo, recibiendo
  datos ya resueltos (texto ya escapado, caja ya calculada, colores de
  marca) y devolviendo el fragmento visual concreto.

## Los 9 tipos y sus variantes

| Tipo | Variantes | Cubre del encargo original |
|---|---|---|
| `priceBadge` | pill-solid, ribbon-corner, outline-tag, stacked-mini | badges de precio, **cintas** (ribbon-corner), **etiquetas** (outline-tag) |
| `ctaButton` | pill-solid, underline-arrow, boxed-outline, split-accent | CTA |
| `logoChip` | plain, circle-badge, underline-mark | — |
| `contactFooter` | gradient-band, solid-bar, glass-panel | fondos, overlays |
| `frameDecoration` | thin-line, corner-brackets, double-line | marcos |
| `heroCard` | thin-line-frame, soft-shadow, inset-panel | **tarjetas** (solo cuando el patrón ya permitía `allowCard`, nunca una tarjeta nueva sin ese permiso) |
| `divider` | none, thin-line, dotted | divisores (`none` es una variante real: ausencia deliberada) |
| `iconSystem` | outline-thin, filled-soft | sistemas de iconos, **cajas de beneficios** (cada icono+etiqueta ya es una caja de beneficio real, ver `layout-composer/render-helpers.js#iconRowMarkup`) |
| `titleAccent` | plain, accent-bar | **bloques editoriales**, sin fabricar texto nuevo — el acento es puramente gráfico (una barra de color), nunca copy inventado |

`priceBadge`/`iconSystem` cubren de forma honesta "cintas", "etiquetas" y
"cajas de beneficios" del encargo original **como variantes de un
elemento que ya existe con dato real detrás**, en vez de crear elementos
nuevos sin contenido que fabricar — mismo criterio que el resto del
repo ("nunca fabricar datos de negocio").

## Integración en el pipeline

`layout-composer/service.js#composeLayout` calcula
`variantSeed = \`${concept.conceptId}::${artDirection.patternId}\`` y lo
pasa a `render-plan.js#buildHtmlFromPlan`, que lo reenvía a cada función
de `render-helpers.js` (`heroMarkup`, `logoMarkup`, `titleMarkup`,
`ctaMarkup`, `priceMarkup`, `contactFooterMarkup`, `iconRowMarkup`,
`decorationMarkup`, `footerDividerMarkup`). Cada una pide su variante a
`selectVariant()` y delega el fragmento visual en `renderers.js`.

Orden real del pipeline (`creative-lab/ARCHITECTURE.md`): Creative Brief
→ Creative Lab → Art Direction Engine → Editorial Design Engine →
Composition Engine (`layout-intelligence/`) → Design Director Engine →
Layout Composer (aquí es donde entra Component Library, solo en el paso
de render, nunca antes).
