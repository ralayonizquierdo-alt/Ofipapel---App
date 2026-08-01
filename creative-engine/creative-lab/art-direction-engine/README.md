# Art Direction Engine

Piensa como un director de arte profesional ANTES de que Composition
Engine (`../layout-intelligence/`) calcule un solo grid. Ver la sección
"Sprint Art Direction Engine" en [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
para el diseño completo, incluidos los bugs reales encontrados y
corregidos al conectar este módulo por primera vez.

## Orden real del pipeline

```
Creative Brief → Creative Lab (concepto ganador) → Art Direction Engine (este módulo) → Composition Engine (layout-intelligence/) → render (layout-composer/)
```

## Qué decide

```
patterns.js   → 15 patrones editoriales (reglas, nunca coordenadas): tratamiento del hero,
                cuánto puede crecer la fotografía, cuánto aire necesita, cuántos elementos
                tolera, si admite iconos, qué estrategias de Composition Engine prefiere.
icons.js       → ~14 iconos de línea consistentes (mismo trazo, mismo viewBox) + palabras
                clave reales para seleccionarlos — nunca relleno, solo si hay señal real.
service.js    → selectPattern() + decideElements() ("todo elemento debe justificar su
                existencia") + selectIcons() + directArt() (punto de entrada único).
```

`directArt(concept, brief, candidateElementIds, hasRealPhoto)` devuelve
una `ArtDirectionDecision`: qué patrón, qué elementos sobreviven, qué
iconos (si acaso), y las reglas (margen, espacio en blanco, tamaño de
foto, estrategias preferidas) que `layout-intelligence/service.js#planLayout()`
debe respetar.

## Regla de negocio protegida

`hero`, `price` y `contactFooter` **nunca** se eliminan — son contenido
de negocio ya exigido explícitamente por el propietario en un sprint
anterior (ver `.claude/rax/DECISIONES.md`, precio/contacto/redes). La
"eliminación agresiva" de este sprint se aplica al CHROME visual (cta,
logo, título, iconos), nunca a esos tres.

## Añadir un patrón nuevo

Una entrada más en `patterns.js#PATTERNS` (id, tratamiento de hero,
tamaño, rango de espacio en blanco, margen, máximo de elementos, si
admite iconos, alineación, estrategias preferidas) — cero cambios en
`service.js` ni en `layout-intelligence/`.

## Añadir un icono nuevo

Una entrada más en `icons.js#ICONS` (id, etiqueta, palabras clave reales,
`markup` SVG sin `stroke`/`fill` propios — el grosor/color los aplica
`layout-composer/render-helpers.js#iconRowMarkup` una sola vez para
todos, así que es estructuralmente imposible que un icono nuevo rompa la
consistencia visual del set).
