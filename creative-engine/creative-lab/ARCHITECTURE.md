# Creative Lab — arquitectura

Tercer verbo del ecosistema: **Marketing Engine piensa. Creative Engine
crea. Creative Lab perfecciona.** Su única misión es investigar y elevar
la calidad visual — no añade agentes de negocio ni funcionalidades
nuevas. El objetivo declarado por el propietario:

> "Generar campañas que un diseñador profesional aprobaría sin necesidad
> de modificarlas."

No es "una IA que hace imágenes" — es un Director Creativo Digital: cada
resultado viene con su razonamiento (qué conceptos se descartaron, por
qué ganó el que ganó), mismo principio que ya usan Director Creativo y
Campaign Recommender de `marketing-engine/`.

## Ubicación: `creative-engine/creative-lab/`, no un módulo top-level

Creative Lab no tiene consumidor externo propio — su trabajo es mejorar
lo que ya produce `creative-engine/`. Vivir dentro de él permite
reutilizar sin fricción `provider-manager/`, `brief/contracts.js`,
`creative-assets/store.js`, `prompt-composer/` y `creative-validator/` —
cero duplicidades. `creative-lab/` no importa nada de `marketing-engine/`
(verificado por grep, mismo criterio que el resto de `creative-engine/`).

## El flujo, componente a componente

```
CreativeBrief (ya existe, sin cambios)
  → Análisis            analysis/service.js            — filtra Biblioteca de Referencias elegibles
  → Concepto creativo   concept-generator/service.js    — 8-12 conceptos, mezcla + variación propia
  → Moodboard           moodboard/service.js            — textual, NUNCA una imagen
  → Prompt maestro       master-prompt-composer/service.js — extiende prompt-composer/ existente
  → Concept Score capa 1 concept-score/service.js#scoreConceptPlan — las 8-12, gratis
  → Shortlist (3-4)      concept-score/service.js#buildShortlist
  → Proveedor de IA      provider-manager/ (el YA EXISTENTE, reutilizado tal cual)
  → Concept Score capa 2 concept-score/service.js#scoreConceptPixel — solo el shortlist, real
  → Umbral + reintento   index.js#runCreativeLab — QUALITY_THRESHOLD, MAX_RETRIES
```

## Las 9 bibliotecas atómicas (`libraries/`)

El "vocabulario": datos puros (`{id,label,text,tags}`), cero red, cero
dependencias — mismo criterio que `VISUAL_ANGLES` o `CATEGORY_RULES` ya
existentes en el repo.

| Biblioteca | Entradas | Nota |
|---|---|---|
| `styles.js` | 52 | supera el mínimo de 50 pedido |
| `compositions.js` | 15 | regla de encuadre |
| `art-directions.js` | 10 | filosofía visual — eje independiente de "estilo" (un mismo estilo se ejecuta con direcciones distintas) |
| `lighting.js` | 12 | |
| `scenarios.js` | 14 | |
| `typographic-hierarchies.js` | 7 | nunca pide renderizar texto — mismo principio de "composición posterior" que `prompt-composer/sections/copy.js` |
| `palettes-harmonies.js` | 8 | reglas de armonía SOBRE la paleta real de `brand-kit.json`, no colores propios |
| `angles-lenses.js` | 12 | 9ª biblioteca, añadida a petición explícita del propietario para la Biblioteca de Referencias |
| `trends.js` | 12 | estática y fechada (`curatedAt`) — necesita refresco manual, ver "Mantenimiento" más abajo |

`libraries/index.js` valida las 9 al cargar (ids únicos, campos
obligatorios) — un typo falla en `require()`, no en producción.

## La Biblioteca de Referencias (`reference-library/`) — el pilar

No es una colección de imágenes para copiar. Es un lenguaje visual: cada
entrada es una **receta curada** que combina, por `id`, una entrada de
cada una de las 8 bibliotecas de "ejecución visual" (todas menos
tendencias) + los campos que solo tienen sentido aquí:

- `emotion`, `whenToUse`, `whenToAvoid` (los 12 campos mínimos pedidos)
- `whatMakesItSpecial`, `whyItWorksOnSocial` (heredados de la propuesta
  original — "estudiar por qué funcionan", no solo qué son)
- `visualImpactLevel` (opcional), `sourceType`/`sourceRef` (opcional),
  `performanceSignals` (opcional, reservado)

Una entrada de referencia **no duplica** el texto de las bibliotecas
atómicas — solo referencia sus ids (verificado en `registerEntry()`
contra `libraries/index.js#getEntry`, falla rápido si un id no existe).

### Origen del contenido — decisión explícita del propietario

**Semilla textual, sin imágenes**: 15 entradas iniciales
(`reference-library/seed-inicial.js`) basadas en principios generales de
fotografía publicitaria/dirección de arte — `sourceType: 'seed-textual'`
en todas, ninguna ligada a una campaña real con derechos de terceros.
Cero riesgo de copyright.

### Escala a decenas de miles sin cambiar arquitectura

```
entries/<id>.json   un fichero por referencia — añadir la entrada 10.000
                     es añadir un fichero, cero cambios de código.
manifest.json        índice ligero (solo los campos de FILTRADO: ids de
                     biblioteca, idealProducts, visualImpactLevel) — se
                     lee entero en cada consulta, barato incluso con
                     miles de filas porque NO lleva los campos de texto
                     largo (whenToUse, whatMakesItSpecial...). Esos solo
                     se leen para las pocas referencias que hacen match.
```

### Importar referencias desde campañas propias (activo desde 2026-07-26)

`registerEntry()` es el único punto de entrada para dar de alta una
referencia — lo usó la semilla inicial, y ahora lo usa también
`reference-library/import-from-campaign.js#importFromCampaign(creativeId,
versionNumber, curation)`: lee `metadata.concept` de la versión ganadora
ya guardada por `creative-assets/store.js` (los 8 ids de biblioteca
atómica coinciden 1:1 con lo que `concept-generator/` produce, cero
mapeo), y exige que el llamador aporte explícitamente los campos
cualitativos (`idealProducts`, `whenToUse`, `whenToAvoid`,
`whatMakesItSpecial`, `whyItWorksOnSocial`, `visualImpactLevel`) — juicio
humano/de agente, nunca inferido solo. Primera entrada real
(`sourceType: 'campana-propia'`) registrada con la campaña "Ventilador
Nebulizador MUVIP" (foto lifestyle real del cliente, arquetipo
`diagonal-dinamico`, score 100/100) — `findRelevantReferences()` ya la
devuelve para briefs futuros de electrodomésticos/hogar, confirmado por
prueba directa. Cero cambios de arquitectura — es una llamada más a
`registerEntry()`.

`performanceSignals` (opcional, vacío hoy) es el enganche reservado con
`marketing-engine/intelligence/learning-engine/` (ya existente, no se
duplica) para cuando haya datos reales de rendimiento de campañas.

## Concepto creativo — "combinar, no copiar" como invariante forzado

Norma obligatoria del propietario, aplicada como código, no como
esperanza:

1. **Mezcla de 2-3 referencias**: cada una de las 8 dimensiones atómicas
   de un concepto se toma de una referencia distinta, elegida por
   `hash(dimensión, concepto, salt)` — no una ventana deslizante simple
   (ver "Corrección de diseño" más abajo).
2. **Variación propia obligatoria del director**: UNA dimensión por
   concepto (rotando entre las 6 permitidas: encuadre, emoción,
   narrativa, iluminación, composición, escenario) se sobreescribe con un
   valor que **ninguna** de las referencias mezcladas usó. Para
   emoción/narrativa es una frase original de `concept-generator/config.js`
   (`ORIGINAL_EMOTION_TWISTS`/`ORIGINAL_NARRATIVE_ANGLES`), nunca copiada
   de una referencia.
3. **`assertNoReferenceIsFullyCopied`**: si un concepto coincidiera con
   una de sus referencias fuente en las 8 dimensiones a la vez, lanza —
   la norma "ningún concepto podrá parecer una copia" es un invariante
   verificado, no una esperanza.
4. **`assertDistinctConcepts`**: dos conceptos no pueden compartir la
   combinación exacta de las 8 dimensiones — red de seguridad final.

### Corrección de diseño durante la implementación

La primera versión asignaba referencia-por-dimensión con módulos simples
(`(dimIndex + conceptIndex) % refsForConcept.length`). Con pocas
referencias elegibles (la biblioteca empieza con ~15), esa periodicidad
coincidía exactamente cada `references.length` conceptos y producía
conceptos IDÉNTICOS — el propio invariante `assertDistinctConcepts` lo
detectó al probarlo. Se sustituyó por selección por hash determinista
(`hash(dimensión/referencia, concepto, salt)`) + un reintento acotado por
concepto (hasta 25 salts) que solo cambia el barajado, nunca introduce
aleatoriedad real — mismo brief + misma biblioteca sigue produciendo
siempre el mismo resultado final (verificado). Documentado aquí porque es
exactamente el tipo de mejora que el propietario pidió priorizar y
documentar antes de implementar.

## Moodboard — textual, nunca una imagen

Aprendizaje directo de la demo de creative-engine sin proveedor real: un
moodboard-imagen sin proveedor sería el mismo "placeholder evidente" ya
rechazado. Se declara `evaluatedOn: 'plan'` — mismo eje que ya usa
`creative-validator/`.

## Prompt maestro — extiende, no sustituye

Dos mecanismos, en `master-prompt-composer/service.js`:

1. **`buildEffectiveBrief()`**: las elecciones del concepto para
   ángulo/lente, iluminación, escenario y composición sobreescriben
   `brief.photography.*`/`brief.artDirection.composition` ANTES de llamar
   al `composePrompt()` de `prompt-composer/` ya existente — así las 9
   secciones base reflejan el concepto sin reescribir su lógica, y sin
   que dos secciones contradigan el mismo aspecto (ej. "frontal centrado"
   en una y "dutch angle" en otra).
2. **6 secciones nuevas** que el compositor base no tiene: estilo,
   filosofía de dirección artística, armonía de paleta, emoción +
   narrativa, refinamiento de espacio de texto, y variación propia del
   director (esta última en fichero aparte — trazabilidad de qué es
   genuinamente original).

## Concept Score — dos capas, decisión definitiva del propietario

- **Capa 1 (`scoreConceptPlan`, gratis)**: reutiliza los 6 checks de
  `creative-validator/` (peso 60) + calidad media de las referencias
  mezcladas vía `visualImpactLevel` (peso 25) + originalidad, siempre al
  máximo porque ya es un invariante forzado por `concept-generator/`
  (peso 15, documentado explícitamente para que no parezca un valor
  arbitrario). Se aplica a los 8-12 conceptos.
- **Capa 2 (`scoreConceptPixel`, con coste)**: mismos 6 checks pero con
  el `generationResult` real — es la puntuación DEFINITIVA, la que se
  compara contra `QUALITY_THRESHOLD`. Solo se llama sobre el shortlist de
  3-4 (`SHORTLIST_SIZE`) — nunca se pagan 8-12 generaciones reales cuando
  bastan 3-4.

## Umbral y reintentos — `index.js#runCreativeLab`

`QUALITY_THRESHOLD=85`, `MAX_RETRIES=3`, `SHORTLIST_SIZE=4` —
configurables por variable de entorno
(`CREATIVE_LAB_QUALITY_THRESHOLD`/`CREATIVE_LAB_MAX_RETRIES`/`CREATIVE_LAB_SHORTLIST_SIZE`),
mismo patrón que `MARKETING_ENGINE_JOBS_DIR`. Si el mejor resultado de un
intento no alcanza el umbral, se genera un lote nuevo (hasta
`MAX_RETRIES`); agotados los intentos sin superarlo, se devuelve el mejor
obtenido con `status: 'needsHumanReview'` — nunca un bucle infinito,
mismo patrón honesto que `failed_needs_human` de `marketing-engine/`.

Cada versión evaluada en capa 2 se guarda en `creative-assets/store.js`
(reutilizado tal cual — un `creativeId` por ejecución de
`runCreativeLab`, una versión por elemento del shortlist), y la ganadora
se marca `markApproved()`.

## Independiente del proveedor de imágenes

Trivial por reutilización: Creative Lab llama a
`provider-manager/registry.js#getProvider` +
`provider.interface.js#assertSupports/adaptToCapabilities` — la misma
capa que ya soporta OpenAI Images, Canva, Adobe Firefly, Ideogram, Flux,
Runway, Veo, Kling. Cambiar de proveedor no toca ni una línea de
`creative-lab/`.

## Mantenimiento de bibliotecas

- `trends.js` necesita refresco manual periódico (no hay fuente en vivo,
  a propósito — cero dependencias de red en todo el repo). No está
  todavía cableada en `concept-generator/` ni en el prompt maestro —
  decisión deliberada de alcance: los 12 campos mínimos pedidos para la
  Biblioteca de Referencias no incluían tendencia, así que se deja
  validada y disponible pero sin integrar, mismo patrón "un fichero +
  una línea" que un proveedor nuevo, para cuando se decida activarla.
- La Biblioteca de Referencias crece con `registerEntry()` — a mano hoy,
  automatizable mañana (ver "Importar referencias" arriba).

## Sprint "Director de Arte Senior" (2026-07-26) — cambios realizados

Sin módulos nuevos, sin ampliar el flujo — solo calidad creativa, dentro
de `concept-generator/`:

- **`concept-generator/self-critique.js`** (nuevo fichero, mismo módulo
  existente): responde de forma determinista las 7 preguntas del
  propietario sobre cada concepto (emoción principal, qué detiene el
  scroll, protagonista absoluto, qué eliminar para simplificar, dónde
  vive el texto, qué historia cuenta, ¿campaña o ficha de producto?),
  usando datos que el concepto ya trae (`emotion`, `narrative`,
  `textSpaceId`, `directorVariation`) — cero llamada a IA, mismo criterio
  determinista de todo el repo. Dos de las 7 respuestas son el filtro de
  descarte real: jerarquía sobrecargada (>4 elementos, mismo umbral que
  `creative-validator/`) y "ficha de catálogo" (escenario + iluminación +
  composición simultáneamente neutros, sin ningún matiz de la variación
  propia del director).
- **`index.js#runCreativeLab`**: se inserta el filtro justo después de
  `generateConcepts()` y ANTES de `composeMasterPrompt()` — un concepto
  descartado nunca llega a tener un prompt compuesto. Si los 10 conceptos
  de un intento son descartados, lanza un error claro en vez de
  continuar con material de baja calidad. `attempts[]` ahora registra
  `discardedByArtDirector` (con sus motivos) y `survivedArtDirector`; el
  ganador final lleva su `selfCritique` completo para trazabilidad.
- **`config.js`**: `SHORTLIST_SIZE` 4 → 3 ("conserva solo los 3
  mejores"), configurable igual que antes por
  `CREATIVE_LAB_SHORTLIST_SIZE`. Efecto colateral positivo: un 25% menos
  de generaciones reales de pago por intento.

Verificado: con el brief real de Ventilador Muvip, 0/10 conceptos
descartados, shortlist de 3, mismo ganador que antes del sprint (el gate
no penaliza un brief ya sano). Con el brief deliberadamente incompleto
(jerarquía de 6 elementos), los 10 conceptos son descartados y
`runCreativeLab` lanza el error correspondiente en vez de generar una
pieza de baja calidad. Probado también con un concepto sintético
estudio-fondo-blanco + softbox + simetría-centrada → descartado por
"ficha de catálogo", confirmando que el filtro tiene efecto real, no solo
teórico.

## Sprint "Prompt Composer Cinematográfico" (2026-07-26) — cambios realizados

Solo `master-prompt-composer/` — ningún otro componente tocado. Objetivo
único: dejar de describir productos y empezar a describir campañas.

- **`master-prompt-composer/service.js`** (reescrito): ya NO llama a
  `creative-engine/prompt-composer/` (el compositor base de 9 secciones,
  "producto" primero) — compone su propio prompt de principio a fin.
  Sigue devolviendo exactamente la misma forma de siempre
  (`{conceptId, sections, fullPrompt, negativePrompt, wordCount,
  tokensApprox}`), así que `index.js`, `concept-score/` y el CLI no
  necesitaron ningún cambio.
- **`master-prompt-composer/sections/from-concept.js`** (reescrito): los
  12 bloques obligatorios pedidos, en el orden pedido — Historia visual,
  Emoción principal, Dirección de arte, Dirección de fotografía,
  Iluminación, Lente y ángulo, Composición, Profundidad de campo,
  Texturas, Materiales, Ambiente, Espacio reservado para textos (el 13º,
  Negative prompt, sigue siendo un campo aparte, no una sección). La
  ficha técnica del producto y sus reglas de fidelidad quedan dentro de
  "Dirección de fotografía" — 4º bloque, ya no el primero.
- **`master-prompt-composer/sections/director-variation.js`** (eliminado):
  su función se pliega como una anotación dentro del bloque que la
  variación propia del director realmente tocó (`annotateIfDirectorVariation`),
  en vez de ser un 13º bloque separado que el propietario no pidió.
- **`master-prompt-composer/config.js`** (nuevo, dentro del módulo ya
  existente): tablas deterministas para los dos bloques genuinamente
  nuevos — Profundidad de campo (12 entradas, una por ángulo/lente) y
  Texturas (10 entradas, una por dirección artística); Materiales deriva
  del escenario (14 entradas). Reutiliza por import de solo lectura
  `NEGATIVE_PROMPT_TERMS`/`SECTION_JOIN` del compositor base (no lo
  modifica) y añade 5 términos negativos propios de un briefing de
  agencia.
- **Restricción técnica respetada sin tocar el validador**: el bloque
  "Espacio reservado para textos" mantiene `id: 'copy'` a propósito — 3
  de los 6 checks de `creative-validator/` (legibilidad, espacioLogo,
  espacioTextos) buscan exactamente ese id para confirmar que se reservó
  espacio de texto; cambiarlo habría roto esos 3 checks sin tocar el
  fichero del validador.

Verificado: `creative-validator/` sigue dando 6/6 con la nueva
estructura (branding, legibilidad, presenciaProducto, espacioLogo,
espacioTextos, composición) · `creative-engine/prompt-composer/` y
`marketing-engine/` sin cambios de comportamiento (regresión ejecutada) ·
brief real de Ventilador Muvip → `approved`, capa 2 = 100/100.

## Sprint "Layout Composer" (2026-07-26) — la pieza que faltaba

Hasta este sprint, el concepto ganador de Creative Lab describía un
prompt cinematográfico, pero el maquetado real de la pieza final era
ajeno a esa decisión — o bien una plantilla fija de `marketing-engine/`,
o bien el asset crudo del proveedor sin componer. `layout-composer/`
(módulo nuevo, aprobado explícitamente por el propietario) cierra ese
hueco:

- **`config.js`**: `COMPOSITION_TO_ARCHETYPE` — las 15 composiciones de
  `libraries/compositions.js` agrupadas en 6 arquetipos de layout
  genuinamente distintos (no una plantilla por composición: agrupa por
  afinidad visual real). `TEXT_EMPHASIS_BY_TEXTSPACE` — las 7 entradas de
  `libraries/typographic-hierarchies.js` reducidas a 3 niveles de énfasis
  tipográfico, eje independiente del arquetipo.
- **`archetypes/`**: 6 ficheros `buildHtml(data) → string` (mismo patrón
  que `marketing-engine/07-maquetador/templates/`) — `centrado-clasico`,
  `diagonal-dinamico`, `flotante-minimalista`, `flat-lay-editorial`,
  `cinematico-fullbleed`, `dividido-lifestyle`. `archetypes/_shared.js`
  centraliza `escapeHtml`/tamaño de título/botón CTA (evita repetir CSS
  del botón 6 veces — se detectó como bug real durante la verificación
  visual y se corrigió centralizándolo).
- **`service.js#composeLayout`**: selecciona arquetipo + énfasis a partir
  del concepto, renderiza con `design-studio/scripts/render-html.js`
  (reutilizado, nunca reimplementado) y escribe `layout.html` +
  `layout-final.png` en el mismo directorio de versión de
  `creative-assets/store.js` — no una ubicación de almacenamiento nueva.
- **`index.js#runCreativeLab`**: tras decidir el ganador (`approved` o
  `needsHumanReview`), llama a `composeFinalLayout()` — nunca rompe el
  pipeline si falla (try/catch, igual que el resto del sistema); el
  resultado se añade a `winner.layout` sin tocar la forma de ningún otro
  campo ya existente.
- **`provider-manager/providers/simulated.provider.js`** (el único
  fichero fuera de `creative-lab/` tocado en este sprint): ahora usa la
  foto real del producto si `req.referenceImages[0]` es un data URL —
  antes solo generaba el placeholder abstracto, así que layout-composer/
  nunca tenía una foto real que componer aunque existiera. Mismo
  mecanismo que ya tenía `marketing-engine/core/providers/providers/simulated.provider.js`
  desde el sprint de integración app↔marketing-engine, ahora también en
  creative-engine/.

**Verificado**: los 6 arquetipos renderizan PNG real con la foto real del
Ventilador Muvip — 2 bugs visuales reales encontrados y corregidos
durante la verificación (botón CTA sin estilo, título solapando el
producto en 2 arquetipos). Extremo a extremo con `runCreativeLab`: el
concepto ganador real (`compositionId: diagonal-dinamica`) seleccionó
`diagonal-dinamico` automáticamente — no un arquetipo fijo. Funciona
igual con placeholder (sin foto real) sin lanzar excepción. Regresión de
`marketing-engine/` y del resto de `creative-engine/` sin cambios de
comportamiento; independencia `creative-lab/`↔`marketing-engine/` intacta.

### Precio y contacto de marca en la pieza final (2026-07-26)

El layout ya componía foto/título/CTA/logo, pero ningún arquetipo pintaba
precio ni datos de contacto reales — el propietario los pidió
explícitamente para la primera pieza terminada sin placeholder. Cambios
aditivos, mismo patrón de siempre (fuente única de verdad + helpers
compartidos):

- **`design-studio/brand-kit.json`**: nuevo bloque `ofipapel.contact`
  (`whatsapp`, `phoneDisplay`, `address` — ya existían hardcodeados en
  `design-studio/templates/ofipapel-vuelta-al-cole-*.html`, promovidos
  aquí para no quedar atados a una sola campaña; `website` y
  `socialIcons: ['facebook','instagram']` confirmados directamente por el
  propietario — sin handles reales todavía, solo iconos genéricos).
- **`asset-pipeline/service.js`**: `prepareAssets().brand.contact` lee ese
  bloque (recarga en caliente, mismo patrón que el resto de `brand-kit.json`).
- **`brief/contracts.js`**: `copy.price` (`maybe('string')`, aditivo) —
  ningún agente de `marketing-engine/` tiene noción de precio hoy, así que
  `brief/from-marketing-engine.js` lo acepta como `overrides.price`
  explícito (mismo mecanismo que `overrides.postType`/`platform`), nunca
  inventado.
- **`layout-composer/archetypes/_shared.js`**: `priceBadge()` (badge fijo
  esquina superior derecha) y `contactFooter()` (franja inferior con
  teléfono/web/dirección + iconos SVG inline de Facebook/Instagram —
  monocromos, sin red externa, coherente con el render `file://` de
  Playwright). Los 6 arquetipos los invocan igual; posición fija para no
  competir con el título/CTA del concepto ganador (footer ~5% del alto,
  verificado sin solape en los 6).
- **`layout-composer/service.js#composeLayout`**: pasa `brand.contact` y
  `copy.price` a `buildHtml()` — únicos dos campos nuevos en el objeto
  `data`, el resto sin cambios.

**Verificado end-to-end**: pipeline completo (marketing-engine →
`fromMarketingEngine(job, { price: '89,00 €' })` → `runCreativeLab` con la
foto lifestyle real subida por el propietario, sin placeholder) →
`diagonal-dinamico`, score 100/100, precio/teléfono/web/dirección/iconos
visibles y sin solapar con título/CTA/logo.

> **Importante — qué NO demuestra esta pieza (2026-07-26, aclaración
> explícita del propietario)**: la fotografía en sí (mujer, sofá,
> ventilador con niebla) fue **subida manualmente por el propietario**, no
> generada. `simulated.provider.js#useRealPhoto()` la usa tal cual — sin
> ningún modelo de IA de por medio (ver el sprint "Layout Composer" más
> arriba). Creative Lab decidió el concepto/arquetipo/layout y compuso
> precio+contacto alrededor de esa foto, pero **la capacidad de generar
> fotografía de ese nivel sin depender de una imagen del usuario sigue sin
> demostrarse** — ningún proveedor real (`openai-images` u otro) está
> conectado en este entorno. Ver `.claude/rax/ROADMAP_TECNICO.md` (RT-09)
> y `.claude/rax/DECISIONES.md` (entrada 2026-07-26): ese es el objetivo
> principal del proyecto y sigue abierto.

## Sprint "Layout Intelligence" (2026-07-26) — de plantillas fijas a composición calculada

Hasta este sprint, `layout-composer/archetypes/*.js` posicionaba cada
elemento con coordenadas escritas a mano (`top: 22%; left: 8%; width:
84%`...) — 6 plantillas fijas, no una composición calculada. El
propietario pidió invertir el orden causal: antes de generar un solo
píxel de HTML, el sistema debe calcular una composición completa (grid,
jerarquía visual, tamaños relativos, márgenes, espacios en blanco,
reglas de equilibrio), puntuarla, y descartar/recalcular si no supera un
umbral — mismo patrón "evaluar antes de comprometerse" que ya usa
`concept-score/` (capa de plan) y este propio `runCreativeLab` (umbral +
reintento acotado), aplicado ahora a la geometría.

Nuevo módulo **[`layout-intelligence/`](./layout-intelligence/README.md)**,
hermano de `layout-composer/` (que pasa a ser solo orquestación + render):

- **`grid.js`**: matemática pura — un grid de 12 columnas con
  `rows = round(columns × height/width)` (celdas ~cuadradas en
  cualquier formato real, 1080×1350 a 1080×1920), banda de margen
  estructural descontada ANTES de repartir celdas (no una comprobación a
  posteriori), más `overlaps`/`whitespaceRatio`/`weightedCentroid`.
- **`hierarchy.js`**: tier de tamaño (dominante/primario/secundario/mínimo)
  y orden de apilado por elemento, a partir de datos que YA existían
  (`brief.artDirection.hierarchy`, `concept.textSpaceId`) — nunca una
  fuente de verdad nueva. Ver bug corregido más abajo.
- **`strategies/`**: 6 estrategias (mismos ids que los antiguos
  arquetipos — `centrado-clasico`, `diagonal-dinamico`,
  `flotante-minimalista`, `flat-lay-editorial`, `cinematico-fullbleed`,
  `dividido-lifestyle` — mismo agrupamiento por `compositionId` ya
  curado, sin renombrar sin motivo), cada una `computePlan()` → geometría
  pura derivada de spans de grid, cero porcentajes tecleados.
- **`balance-score.js`**: 5 componentes que suman 100
  (`marginCompliance`, `whitespaceBalance`, `hierarchyContrast`,
  `visualBalance`, `overlapPenalty`) — todo evaluado sobre números
  (geometría de plan), nunca sobre píxeles renderizados, mismo criterio
  honesto que `evaluatedOn:'plan'` en `creative-validator/`.
- **`service.js#planLayout`**: si la estrategia primaria (por
  `compositionId`) no supera `LAYOUT_QUALITY_THRESHOLD` (70 por defecto),
  prueba la siguiente en rotación determinista hasta
  `LAYOUT_MAX_RETRIES` (4) intentos, quedándose con la mejor — igual que
  `bestEver`/`needsHumanReview` en `runCreativeLab`, nunca bucle
  infinito.

`layout-composer/` se reduce a: decidir qué elementos hay datos para
colocar (`resolveElementIds` — sin logo declarado no hay chip de logo,
sin precio no hay badge), llamar a `planLayout()`, y traducir el
`LayoutPlan` ya resuelto a HTML con `render-plan.js`/`render-helpers.js`
(sustituyen a `archetypes/*.js`, retirado por completo).

### 3 bugs reales encontrados con un test sintético — antes de tocar el renderer

Se escribió un test directo sobre `planLayout()` (15 `compositionId` × 4
formatos reales, más comprobación de determinismo y de que el fallback
por umbral imposible sí prueba otras estrategias) ANTES de conectar
`layout-composer/` — mismo criterio que "mirar el render real antes de
darlo por bueno" ya aplicado en sprints anteriores, aquí aplicado un paso
antes, a los números:

1. **`brief.artDirection.hierarchy` no es un ranking de tamaño, es orden
   de lectura de arriba a abajo.** Primera versión de `hierarchy.js`
   asumía índice 0 = elemento más grande → el logo salía más grande que
   el producto (con `['logo','producto','titular','cta']`, el logo se
   volvía "dominante"). Verificado contra los 2 presets reales de
   `agents/02-director-arte/config.js` (`layout-centrado`,
   `layout-diagonal`): el orden describe la composición de arriba a
   abajo, no importancia. Corregido: el tamaño usa defaults fijos y
   sensatos (`hero:dominante`, `logo:mínimo` — el producto es el
   protagonista de un anuncio, el logo es una marca de agua), y el array
   se reaprovecha correctamente como `stackOrder` (orden de apilado real)
   vía `strategies/_shared.js#stackVertically`.
2. **El badge de precio (esquina superior derecha) podía solaparse con el
   hero.** Con logo pequeño (1 fila) y precio con tier propio más alto (2
   filas), el hero — que arranca justo debajo del logo — invadía la
   franja que el precio todavía ocupaba. Corregido con
   `topRightCorner(grid, span, maxRowSpan)`: el precio nunca supera la
   altura de cabecera que reserva el primer elemento del apilado.
3. **`CONTRAST_TARGET` mal calibrado contra los propios
   `HIERARCHY_TIER_SPANS`.** Un contraste dominante/mínimo de 24-30x
   (logo minúsculo junto a un hero grande, correcto y deseable) se
   penalizaba como "desproporción excesiva" porque el rango sano
   declarado (`max:8`) no encajaba con la propia geometría del sistema.
   Corregido subiendo `max` a 40, documentado con el motivo.

Con los 3 fijos, las 60 combinaciones (15 composiciones × 4 formatos) del
test sintético superan el umbral (scores 73-95), el mecanismo de
descarte-y-reintento se ejerce de verdad cuando hace falta (verificado
forzando un umbral imposible), y el determinismo se mantiene (mismo
brief + mismo formato → mismo plan, sin excepción).

### Verificado end-to-end con la campaña real

Mismo brief (Ventilador Muvip, foto lifestyle real, 89,00€) del sprint
anterior, re-ejecutado de punta a punta: la estrategia primaria
(`dividido-lifestyle`, según `compositionId` del concepto ganador) anotó
57/100 (insuficiente) — se descartó automáticamente y `centrado-clasico`
anotó 81/100 (bueno), que es la que se renderizó. Se detectó y corrigió
además un bug de legibilidad real mirando el PNG resultante: el título
salía en blanco sobre el fondo claro de marca (ilegible) — el blanco solo
tiene sentido sobre una foto a sangre completa (`kind:'background-fill'`);
sobre el fondo sólido, el título usa ahora el color primario de marca.
Regresión completa sin cambios de comportamiento: `node --check` en todo
`creative-engine/`, demo CLI existente (`run-creative-lab-demo.js`),
pipeline de `marketing-engine/` por separado, e independencia
`creative-lab/`↔`marketing-engine/` (grep, cero `require()` cruzados).

## Sprint "Art Direction Engine" (2026-07-26) — de maquetador a criterio de diseño

**Contexto**: "Layout Intelligence" (sprint anterior) calculaba grid,
jerarquía, márgenes y equilibrio de verdad — pero seguía razonando como
un maquetador: colocaba todos los elementos disponibles dentro de una
tarjeta con placa y sombra. El propietario pidió explícitamente un
cambio de paradigma, no una mejora incremental: que el sistema piense
como un director de arte ANTES de tocar el grid — qué es el
protagonista, qué sobra, cuánto puede crecer una fotografía, cuándo
eliminar cajas y fondos, cuándo usar iconos y cuándo no.

Nuevo módulo **[`art-direction-engine/`](./art-direction-engine/README.md)**,
que se ejecuta ANTES de Composition Engine (`layout-intelligence/`, que
pasa a obedecer sus decisiones en vez de partir solo de
`concept.compositionId`):

- **`patterns.js`**: 15 patrones editoriales (Hero Product, Magazine
  Editorial, Luxury Minimal, Apple Style, Nike Style, Muji Style, IKEA
  Lifestyle, Product First, Negative Space, Swiss Grid, Asymmetric
  Editorial, Poster Design, Premium Retail, Luxury Catalogue, Lifestyle
  Premium) — cada uno son REGLAS (tratamiento del hero, cuánto puede
  crecer, rango de espacio en blanco, margen, máximo de elementos, si
  admite iconos, estrategias de `layout-intelligence/` que prefiere),
  nunca coordenadas. Analizan principios de publicidad premium real, no
  copian campañas concretas.
- **`service.js#selectPattern`**: determinista (hash de desempate, nunca
  `Math.random`) — puntúa los 15 por solape de tags con el brief
  (categoría, segmento, objetivo de campaña) y, con fotografía real,
  prima los patrones que le dejan protagonismo (`heroTreatment` distinto
  de `'framed-minimal'`, con un bonus extra si además son `'lifestyle'`).
- **`service.js#decideElements`**: "todo elemento debe justificar su
  existencia" aplicado como recorte real — si la pieza supera
  `pattern.maxElements`, se descartan primero `cta`, después `logo`,
  después `icons`, después `title` (nunca `hero`/`price`/`contactFooter`
  — contenido de negocio ya exigido explícitamente por el propietario en
  un sprint anterior, ver más abajo "regla protegida").
- **`icons.js` + `service.js#selectIcons`**: ~14 iconos de línea con el
  MISMO trazo/tamaño/espaciado (el estilo se aplica una sola vez en el
  renderer, nunca por icono — estructuralmente imposible que salgan
  inconsistentes, inspirado en documentación técnica de Apple/Bosch/
  Sony/JBL/Logitech/Brother). Solo se seleccionan si el patrón los admite
  Y hay palabras clave reales en la descripción/beneficios del producto
  — máximo 6, nunca relleno.

### Regla protegida: negocio nunca se recorta

`hero`, `price` y `contactFooter` están explícitamente excluidos del
recorte de `decideElements` — el propietario ya exigió en un sprint
anterior que precio/redes/contacto aparezcan siempre (ver
`.claude/rax/DECISIONES.md`, 2026-07-26 "precio y contacto reales"). La
eliminación agresiva de este sprint ("si un elemento no aporta valor, se
elimina") se aplica al CHROME visual — cta, logo, título, iconos —, nunca
a contenido de negocio ya decidido explícitamente. Documentado aquí para
que no se lea como una contradicción entre sprints.

### `layout-intelligence/` (Composition Engine) deja de decidir solo

- `service.js#planLayout` acepta ahora una `ArtDirectionDecision`:
  `marginRatio`/`whitespaceTarget` sustituyen a los valores globales de
  `config.js` para esa pieza concreta; el orden de estrategias a probar
  sale de `artDirection.preferredStrategies` (con fallback al criterio
  anterior por `compositionId` si no se pasa `artDirection` — no rompe
  quien todavía no lo use).
- `strategies/_shared.js#heroSpan()`: si el patrón fijó un tamaño de foto
  concreto (`artDirection.heroSize`), se usa tal cual — "cuánto puede
  crecer una fotografía" es una decisión de Art Direction, no de la
  estrategia de layout.
- Nuevo elemento `icons` (kind `'icon-row'`): añadido a
  `hierarchy.js#DEFAULT_STACK_ORDER` y colocado explícitamente en las 3
  estrategias que no apilan verticalmente (`diagonal-dinamico`,
  `cinematico-fullbleed`, `dividido-lifestyle`).

### `layout-composer/` (render): fuera las cajas

`render-helpers.js` se reescribe para cumplir la prohibición explícita
del propietario ("cajas blancas gigantes", "tarjetas enormes"):
`heroMarkup` ya no dibuja una placa con degradado y sombra pesada detrás
de la foto — la imagen se apoya directamente sobre el fondo, con un
`filter:drop-shadow` sutil sobre sí misma (`allowCard`, solo 2 de los 15
patrones, añade como mucho una línea de 1px, nunca una tarjeta).
`logoMarkup` pierde la tarjeta blanca con sombra — el logo se apoya en el
fondo igual que la foto. `priceMarkup`/`contactFooterMarkup` se aligeran
(badge más fino, footer como degradado en vez de bloque sólido). Nuevo
`iconRowMarkup`: aplica el trazo/tamaño/espaciado UNA vez para toda la
fila, con la etiqueta de cada icono perfectamente centrada debajo.

### 2 bugs reales encontrados conectando el módulo — antes de dar el sprint por bueno

1. **El check de espacio en blanco no tenía sentido con fondo a sangre
   completa.** `whitespaceRatio()` excluye `kind:'background-fill'` del
   cálculo (correcto: el fondo no es "clutter") — pero eso significaba
   que, con una foto full-bleed, el resto de elementos (logo, título,
   precio) parecían ocupar "solo" un 20% del canvas, y el check lo leía
   como "78% de espacio vacío, composición demasiado vacía" — un patrón
   `full-bleed` reprobaba SIEMPRE por definición, aunque la foto llenara
   el encuadre entero. Corregido: con fondo a sangre completa, el espacio
   en blanco es una propiedad de la fotografía (cielo, pared, aire
   alrededor del sujeto), no de las cajas superpuestas — no se puede
   medir geométricamente, así que se concede el máximo y se deja
   constancia explícita del motivo (mismo criterio honesto que el resto
   de checks de `evaluatedOn:'plan'`).
2. **La fila de iconos podía solaparse con el footer de contacto.** En
   `cinematico-fullbleed` (título + cta + iconos apilados desde abajo),
   el cálculo de la fila inicial no reservaba la altura del footer —
   detectado en la prueba sintética con iconos reales. Corregido con
   `strategies/_shared.js#footerReservedRows()`, reutilizable por
   cualquier estrategia con apilado anclado al fondo.

Con los 2 fijos, un barrido sintético de los 15 patrones × 3 formatos
reales (1080×1350, 1080×1920, 1080×1080) aprueba el umbral en el primer
intento en todos los casos, y — más importante — cada patrón termina
usando de verdad la familia de estrategias que declaró preferir
(`nike-style`/`poster-design`/`lifestyle-premium` → `cinematico-fullbleed`;
`luxury-minimal`/`apple-style`/`negative-space` → `flotante-minimalista`;
`muji-style`/`swiss-grid`/`premium-retail`/`luxury-catalogue` →
`flat-lay-editorial`; etc.) — la decisión de Art Direction Engine se
respeta en la pieza final, no se pierde por el camino.

### Verificado end-to-end con la campaña real — comparación visual directa

Mismo brief (Ventilador Muvip, foto lifestyle real, 89,00€) re-ejecutado
de punta a punta: Art Direction Engine eligió **Lifestyle Premium**
(fotografía real + `campaignType:'Lifestyle'` → máxima puntuación),
descartó `cta` por presupuesto de elementos, y seleccionó 3 iconos reales
(potencia, nebulización, mando a distancia) a partir del texto real del
producto. Composition Engine usó `cinematico-fullbleed` (full-bleed, tal
como pedía el patrón) al primer intento, 87/100 (excelente). El resultado
frente a la pieza del sprint anterior: la foto pasa de ocupar una placa
central a ocupar el 100% del encuadre, desaparecen la placa y la sombra
pesada del logo, aparece la fila de iconos técnicos, y el CTA — que no
aportaba nada en una pieza foto-dominante — se eliminó solo. Regresión
completa sin cambios de comportamiento: `node --check` en todo
`creative-engine/`, demo CLI existente, pipeline de `marketing-engine/`
por separado, independencia `creative-lab/`↔`marketing-engine/` intacta.

## Verificación realizada

Independencia por grep · las 9 bibliotecas validan al cargar · 15
referencias sembradas y validadas contra las bibliotecas atómicas ·
`runCreativeLab` extremo a extremo con brief real (Ventilador Muvip) →
`approved` en el primer intento, capa 2 = 100/100 · brief deliberadamente
incompleto → 3 intentos agotados → `needsHumanReview`, sin bucle
infinito · determinismo (mismo brief + `--json` dos veces, ignorando
ids/timestamps, diff vacío) · regresión completa de `marketing-engine/`
y `creative-engine/` sin cambios de comportamiento.
