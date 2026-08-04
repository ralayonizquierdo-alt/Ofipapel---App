# Motor de Marketing — Hoja de ruta V2 (12 meses)

**Fecha de creación**: 2026-07-25. **Estado**: Fase 0 completada (ver
abajo) — `marketing-engine/intelligence/` activa en modo `shadow` por
defecto en cada ejecución del pipeline.

## Por qué existe este documento

El sprint que dio origen a este documento partió de un objetivo explícito
del propietario: que el Motor de Marketing genere campañas mejores que las
de un community manager medio, y que ese valor **no dependa únicamente de
la calidad del modelo de IA de turno**. El conocimiento del sistema —
`knowledge/` (criterio) + `intelligence/` (cálculo) — es el activo que se
queda con el proyecto aunque cambie el proveedor de imagen o de texto que
haya detrás en un momento dado.

Este documento traduce ese objetivo en algo verificable: qué existe hoy,
qué falta, y — sobre todo — **el criterio concreto para dar cada paso**,
no solo una lista de features.

## Principios que no cambian en 12 meses

1. **Determinista y explicable.** Cada recomendación lleva su razón. Nunca
   una caja negra, ni siquiera cuando algún día haya aprendizaje real
   (Fase 3: agregación con conteos y medias visibles, no un modelo opaco).
2. **Independiente de proveedor.** Cero acoplamiento a OpenAI, Canva,
   Runway o cualquier otro — `intelligence/` sigue funcionando igual el
   día que se conecte un proveedor de imagen real, y sigue funcionando
   igual si se desconecta.
3. **Asesora hasta que se demuestre mejor, nunca antes.** Shadow Mode no es
   una fase transitoria por pereza — es la forma en que este proyecto
   gana el derecho a decidir: comparar antes de tener autoridad.
4. **`knowledge/` es criterio, `intelligence/` es cálculo.** Nunca se
   duplican. Si algún día divergen, gana `knowledge/` y `intelligence/` se
   corrige.
5. **Cero dependencias npm hasta que exista una señal concreta** — mismo
   criterio que el resto de `marketing-engine/` desde su primera versión.

## Fase 0 — Lo que entrega este sprint (2026-07-25)

| Componente | Qué hace hoy | Qué es proxy o está inerte |
|---|---|---|
| Product Intelligence | Analiza 7 categorías + fallback por palabras clave, estacionalidad real por fecha | Ticket en bandas cualitativas, no importes reales (sin datos de precio en el repo) |
| Campaign Recommender | Recomienda los 8 campos pedidos, cada uno con su razón, para cualquier brief | `POSTING_WINDOWS` es heurística genérica, sin datos propios todavía |
| Variant Engine | Genera hasta 8 arquetipos de variante, elegibles y puntuados por señal real del producto | — |
| Creative Score | Puntúa 0-100 con 8 dimensiones, 55 puntos medidos de verdad | 4 dimensiones (45 puntos) son proxy — impacto visual, atención, conversión, encaje de audiencia |
| Learning Engine | Estructura de almacenamiento real, se registra automáticamente cada campaña | `getRecommendationBias()` siempre neutro — sin aprendizaje implementado; almacén efímero en producción (`/tmp`) |
| **Shadow Mode** | Activo por defecto — compara cada recomendación con la decisión real, explica las discrepancias, registra todo | El modo `decision` existe como interruptor pero nadie lo ha activado nunca en producción |

Verificado en este sprint: determinismo (misma entrada + misma fecha =
misma salida byte a byte), razonamiento estacional (misma ficha, tres
fechas, tres campañas distintas), regresión completa del pipeline (con y
sin la capa de inteligencia funcionando), y resiliencia (un almacén de
aprendizaje no escribible no rompe el pipeline).

## Fase 1 — Meses 1-3: «Acumular evidencia»

**Objetivo**: que Shadow Mode deje de ser una demo y empiece a comparar
campañas reales, en volumen suficiente para que la decisión de activar
`decision` mode se apoye en datos, no en intuición.

**Entregables**:
- Exponer `job.intelligence` (recomendación, variantes, `shadowComparison`,
  `creativeScore`) en la respuesta de
  `netlify/functions/marketing-engine-run.js` — hoy deliberadamente no
  expuesto (ver `INTEGRATION.md`). Cambio de una línea en la función, cero
  cambios en `intelligence/`.
- El Almacén de `app.html` muestra la recomendación junto al resultado real
  y el Creative Score — sin que esto implique todavía elegir una variante
  ni cambiar ninguna decisión del pipeline.
- Panel simple (puede ser un script, no hace falta UI todavía) que resuma
  `agreementRate` por categoría a partir de
  `learning-engine/store.js#listRecords()`.

**Criterio de "hecho"**: al menos 30 campañas reales pasadas por el
pipeline con `shadowComparison` registrado, y un `agreementRate` medio
conocido por categoría (aunque sea bajo — el objetivo de esta fase es
*medir*, no mejorar todavía).

**Qué NO se hace en esta fase**: no se activa `decision` mode. No se
cambia ninguna tabla de `campaign-recommender/config.js` en base a
intuición — solo en base a lo que el propio Shadow Mode muestre.

## Fase 2 — Meses 4-6: «Cerrar el bucle de datos»

**Objetivo**: que las campañas registradas tengan resultado real, no solo
la comparación de la decisión.

**Entregables**:
- El Almacén permite registrar a mano alcance/clics/ventas/engagement de
  una campaña ya publicada — llama a
  `learning-engine/store.js#recordOutcome()`, que ya existe y ya está
  probado, solo sin ningún llamador todavía.
- Sustituir el almacén de ficheros (`learning-engine/store.js`) por
  persistencia real — Supabase, ya en la pila del proyecto (`joe-app`) —
  resolviendo la limitación de `/tmp` efímero en Lambda documentada desde
  el día 0.
- `COMPARABILITY_KEYS` (`learning-engine/config.js`) ya definidas hoy se
  usan de verdad para poder consultar por categoría/campaña/plataforma/
  formato.

**Criterio de "hecho"**: ≥ `MIN_SAMPLE_SIZE` (20, ver
`learning-engine/config.js`) campañas con outcome real registrado en al
menos una categoría.

## Fase 3 — Meses 7-9: «Aprender de verdad, y decidir si dar autoridad»

**Objetivo**: dos cosas separadas, en este orden.

**3a — Aprendizaje real** (sustituye el punto de enganche ya documentado en
`learning-engine/service.js`):
- `getRecommendationBias()` deja de ser no-op: agrega `listRecords()` por
  `COMPARABILITY_KEYS`, calcula medias de engagement/conversión por
  variante usada, aplica un ajuste **solo** cuando el grupo alcanza
  `MIN_SAMPLE_SIZE` — sigue siendo determinista y auditable (conteos y
  medias visibles, nunca una puntuación opaca).
- Recalibrar los pesos proxy del Creative Score (`creative-score/config.js`)
  contra resultados reales, si los datos lo justifican.
- `knowledge/*.md` → sección "Aprendizajes" (vacía desde su creación) se
  alimenta por primera vez con hallazgos reales.

**3b — Decisión sobre `decision` mode** (el criterio que pidió el
propietario, literal): revisar `agreementRate` acumulado en Shadow Mode. Si
las recomendaciones de `intelligence/` son mejores o equivalentes a las
decisiones manuales, activar
`MARKETING_ENGINE_INTELLIGENCE_MODE=decision` — una variable de entorno,
cero cambios de código (ver `intelligence/mode.js`). Si no lo son todavía,
se queda en `shadow` y esta sub-fase se repite el trimestre siguiente. No
hay compromiso de fecha para el cambio de modo — hay compromiso de
criterio.

**Criterio de "hecho"**: una recomendación que se apoya en evidencia propia
("porque N campañas comparables de esta categoría rindieron mejor con este
enfoque" — la frase completa que hoy `explain()` no puede decir todavía
por falta de datos) y una decisión explícita, documentada en
`.claude/rax/DECISIONES.md`, sobre si se activa `decision` mode.

## Fase 4 — Meses 10-12: «Ventaja acumulada»

**Objetivo**: cerrar las dimensiones proxy que quedaron pendientes desde el
día 0, y dar el primer paso hacia una capa proactiva.

**Entregables**:
- Visión por IA sobre el PNG generado para las dimensiones proxy visuales
  del Creative Score (impacto visual, en parte atención) — único punto de
  todo este roadmap donde entra un proveedor de IA, y aun así aislado
  detrás del contrato de una dimensión (`creative-score/contracts`, sin
  tocar el resto de la capa).
- Calendario proactivo: el motor propone campañas por estacionalidad +
  categorías sin cobertura reciente, sin que nadie las pida — construido
  sobre `COMMERCIAL_CALENDAR` (`product-intelligence/config.js`), que ya
  existe desde el día 0.

**Criterio de "hecho"**: el motor propone una campaña que el propietario no
había pensado, y la publica.

## Señales concretas para reconsiderar una decisión

| Señal observable | Decisión a revisar | Dónde está documentada |
|---|---|---|
| `listRecords()` supera ~1000 registros | Migrar de almacén de ficheros a datastore real | `learning-engine/store.js` |
| `agreementRate` medio por categoría ≥ 0.8 sostenido varios meses | Activar `decision` mode para esa categoría | Fase 3b, `intelligence/mode.js` |
| Un proveedor de imagen real queda activo (`status:'active'`) | Reevaluar los pesos de `impactoVisual` en Creative Score | `creative-score/config.js` |
| `app.html` añade categorías nuevas al `<select>` | Extender `PRODUCT_CATEGORY_PROFILES` con esas claves | `product-intelligence/config.js` |
| Una recomendación y la decisión real difieren sistemáticamente en un campo concreto (no solo puntualmente) | Revisar la tabla de ese campo en `campaign-recommender/config.js` — puede que la tabla esté mal, no que el pipeline esté mal | Fase 1 |

## Qué queda fuera de los 12 meses, deliberadamente

- Cualquier modelo de aprendizaje no explicable (red neuronal, "score" sin
  desglose visible). El compromiso de "criterio, no caja negra" no tiene
  fecha de caducidad.
- Automatizar la publicación sin revisión humana — el Almacén sigue siendo
  el punto donde el propietario aprueba, incluso en Fase 4.
- Predicción de ventas o forecasting financiero — fuera del alcance de un
  motor de marketing, y una responsabilidad demasiado grande para basarla
  en datos todavía escasos.
