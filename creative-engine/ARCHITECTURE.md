# Creative Engine — Arquitectura

**Fecha de creación**: 2026-07-25. **Estado**: arquitectura completa,
verificada de punta a punta con el proveedor `simulated` (placeholder
determinista) — ningún proveedor de IA real conectado todavía.

## 1. El principio: piensa / crea

> El Marketing Engine piensa. El Creative Engine crea.

`marketing-engine/` analiza productos, recomienda campañas, puntúa
creatividad y genera variantes de **estrategia** — todo determinista, sin
generar ni un solo píxel. `creative-engine/` es la capa que, cuando se
conecte un proveedor real, convertirá esas decisiones en imágenes y vídeo
de verdad. Hoy, sin proveedor conectado, `creative-engine/` ya hace todo
lo demás: prepara recursos, compone prompts automáticamente, genera
variantes de **ejecución visual**, valida el resultado antes de aceptarlo,
y guarda cada versión con su historial completo.

Separar los dos motores no es solo organización de carpetas — es una
garantía: `marketing-engine/` puede evolucionar su criterio de negocio
(qué vender, a quién, con qué tono) sin que eso obligue a tocar cómo se
genera una imagen, y `creative-engine/` puede cambiar de proveedor de IA
sin que eso obligue a tocar ninguna decisión de negocio.

## 2. Los 6 componentes

```
CreativeBrief (marketing-engine → mapper, o a mano)
       │
       ▼
┌─────────────────┐
│  Asset Pipeline   │  resuelve brand-kit, paleta, logo, dimensiones
└────────┬─────────┘
         ▼
┌─────────────────┐
│ Variant Generator │  N ángulos visuales distintos (1/3/5/10)
└────────┬─────────┘
         │  (por cada variante)
         ▼
┌─────────────────┐
│ Prompt Composer   │  9 secciones modulares → 1 prompt + negativePrompt
└────────┬─────────┘
         ▼
┌─────────────────┐
│ Provider Manager  │  intenta generar (hoy: solo "simulated" activo)
└────────┬─────────┘
         ▼
┌─────────────────┐
│ Creative Validator│  6 checks — aprueba o marca para regeneración
└────────┬─────────┘
         ▼
┌─────────────────┐
│  Creative Assets  │  guarda imagen/vídeo/prompt/metadata/versión
└─────────────────┘
```

| Componente | Responsabilidad | Ficheros |
|---|---|---|
| Provider Manager | Registro de proveedores creativos, contrato común, capacidades declaradas | `provider-manager/` |
| Asset Pipeline | Resuelve TODOS los recursos (foto, logo, brand-kit, colores, copy, formato) en un bundle normalizado | `asset-pipeline/` |
| Prompt Composer | Construye el prompt automáticamente a partir del brief, de forma modular | `prompt-composer/` |
| Variant Generator | 1/3/5/10 variantes realmente distintas de la misma campaña | `variant-generator/` |
| Creative Validator | Branding, legibilidad, presencia del producto, espacio de logo/texto, composición | `creative-validator/` |
| Creative Assets | Imágenes, vídeos, thumbnails, capas, prompts, metadatos, versiones | `creative-assets/` |

`index.js` es el único punto de entrada — expone cada componente por
separado y `runCreativePipeline(brief, options)`, que los encadena todos.

## 3. `CreativeBrief` — el mecanismo real de independencia

`creative-engine/` **no hace `require()` de nada bajo `marketing-engine/`,
en ningún sentido** (verificado: `grep -rn "require(...marketing-engine" creative-engine/`
no encuentra nada). Su único contrato de entrada,
`brief/contracts.js#CREATIVE_BRIEF_SHAPE`, refleja ESTRUCTURALMENTE lo que
ya producen los agentes de marketing-engine (director-creativo,
director-arte, fotógrafo, Product Intelligence, Campaign Recommender) —
pero es una forma propia, declarada aquí, no importada de allí.

`brief/from-marketing-engine.js` es un mapper puro: toma un objeto con
forma de salida real de marketing-engine (documentada en la cabecera del
propio fichero) y devuelve un `CreativeBrief`. **No importa nada** — el
conocimiento va en un solo sentido: creative-engine sabe (por convención
documentada, no por código compartido) qué forma tiene la salida de
marketing-engine; marketing-engine no sabe que creative-engine existe. Es
la respuesta concreta, ejecutable, a "cómo podrá conectarse
posteriormente" — no solo un párrafo de intenciones.

El cableado EN VIVO (que `netlify/functions/marketing-engine-run.js` o el
propio `core/orchestrator.js` llamen a `creative-engine/` de verdad) queda
**fuera de este sprint** — es la integración del sprint siguiente, cuando
además se decida qué proveedor activar primero.

## 4. Convivencia con `marketing-engine/`

No se ha tocado ni un fichero de `marketing-engine/` en este sprint. Pero
hay un solapamiento real que hay que resolver por escrito para que no
confunda a nadie:

**`marketing-engine/core/providers/` ya tiene su propio registro de
proveedores**, con 6 de los 8 ids que se piden aquí (`openai-images`,
`adobe-firefly`, `ideogram`, `flux`, `runway`, `veo`), todos `planned`,
mismo patrón de registro eager. Nació antes de que existiera
`creative-engine/`, cuando la única "generación" del sistema era el
placeholder SVG que usa `07-maquetador`.

**Desde ahora, `creative-engine/provider-manager/` es el registro
canónico para generación creativa real.** El de `marketing-engine/` queda
**legado**:

- No se toca ni se borra — `simulated` sigue siendo necesario allí porque
  el pipeline de 8 agentes lo usa hoy en producción (vía
  `07-maquetador` → `05-especialista-prompts`).
- No debe recibir proveedores nuevos. Cualquier proveedor real que se
  active a partir de ahora se activa en `creative-engine/`, nunca en
  `marketing-engine/core/providers/`.
- Cuando se construya la integración real entre los dos motores (sprint
  futuro), ese es el momento de retirar el registro de
  `marketing-engine/` y hacer que `07-maquetador` (o su sucesor) llame a
  `creative-engine/` en su lugar.

Este párrafo es la única fuente de verdad sobre cuál registro manda — si
en el futuro alguien activa un proveedor real, debe hacerlo aquí.

## 5. Dos ejes ortogonales de variación

`marketing-engine/intelligence/variant-engine/` y
`creative-engine/variant-generator/` generan "variantes", pero de cosas
distintas — no se solapan, no se deben consolidar:

- **`intelligence/variant-engine`** varía **QUÉ campaña**: estrategia
  (Lifestyle vs. Black Friday vs. Corporate...), devuelve overrides de
  `job.input` (`postTypeOverride`/`objective`/`creativeStyleHint`).
- **`creative-engine/variant-generator`** varía **CÓMO se fotografía**
  una campaña YA elegida: ángulo, luz, composición — la ejecución visual
  de una única estrategia fija.

Componen multiplicativamente: 3 variantes de campaña × 5 ángulos visuales
= 15 piezas posibles a partir del mismo producto. Cada eje resuelve un
problema distinto y ambos son necesarios.

## 6. El principio de composición posterior

`creative-engine/prompt-composer/sections/copy.js` nunca pide renderizar
texto — solo reserva espacio negativo para él. Es una decisión de diseño
explícita, no un descuido:

- Los modelos de difusión renderizan texto mal (letras deformadas,
  ortografía incorrecta). Pedirles que reserven espacio es fiable;
  pedirles que escriban el titular no lo es.
- `marketing-engine/agents/07-maquetador` ya resuelve esto hoy: genera la
  pieza final con HTML→PNG (`design-studio/scripts/render-html.js`),
  componiendo el texto real DESPUÉS de que exista la imagen de fondo —
  nunca le pide a un proveedor de imagen que "escriba" el titular.
  `creative-engine/` sigue el mismo patrón.
- Es lo que hace coherentes dos de los 6 checks de Creative Validator:
  "espacioLogo" y "espacioTextos" no tendrían nada que verificar si esta
  sección no existiera.

**Nota para cuando se active un proveedor con buen renderizado de texto**
(p. ej. Ideogram, ver `provider-manager/providers/ideogram.provider.js`):
decidir explícitamente si se le sigue pidiendo espacio vacío (consistente
con el resto) o si se le permite renderizar el titular/CTA directamente —
nunca cambiarlo en silencio, cambia lo que mide el Validador.

## 7. Cómo se conectará después a un proveedor real

Ningún componente fuera de `provider-manager/` cambia al activar un
proveedor — es la garantía central de este diseño. Pasos:

1. Escribir el cuerpo real de `generate(req)` en el fichero del proveedor
   (`providers/<id>.provider.js`) — llamar a la API real, escribir el
   asset en `req.metadata.outputDir` (la carpeta de versión que
   `creative-assets/store.js` ya preparó), devolver
   `GENERATION_RESULT_SHAPE`.
2. Cambiar `PROVIDER_META.status` a `'active'`.
3. Credenciales en variables de entorno de Netlify — nunca en el repo
   (mismo criterio que `FIREFLY_CLIENT_ID`/`FIREFLY_CLIENT_SECRET`, ya
   documentadas en `CLAUDE.md`).

**OpenAI Images**: `contentClass:'photo'|'art'`, sin `negativePrompt`
nativo (ya declarado en `capabilities.supportsNegativePrompt: false` —
`provider-manager/provider.interface.js#adaptToCapabilities` ya descarta
ese campo automáticamente para este proveedor, sin fallar). Endpoint de
edits/variaciones para `referenceImages`.

**Canva**: estructuralmente distinto — no es "prompt in, píxeles out", es
"rellena esta plantilla con estos campos". Ya registrado con
`kind:'template'` y `contentClasses:['template']`, así que una petición
de foto nunca llega a intentarlo por error (`assertSupports` la rechaza
antes). Activarlo significa que `generate(req)` lea
`req.metadata.templateId` + `req.metadata.fields`, no `req.prompt`.

**Generadores de vídeo (Runway/Veo/Kling)**: ya registrados con
`kind:'video'`, `contentClasses:['video']`, `durationSeconds` en el
contrato. `variant-generator/` y `prompt-composer/` ya funcionan igual
para vídeo que para imagen (el brief no distingue) — lo único que cambia
es qué proveedor se pasa a `runCreativePipeline(brief, {providerId,
variantCount})` y que `brief.format.contentClass` sea `'video'`.

## 8. Hoja de ruta del Validador: plan → pixel

Los 6 checks de `creative-validator/` llevan hoy `evaluatedOn: 'plan'` —
evalúan el prompt/brief, no una imagen real, porque no existe ninguna
(solo `simulated` genera algo, y es un placeholder SVG abstracto, no algo
sobre lo que evaluar composición real). Cuando exista una imagen real de
un proveedor activo:

- Añadir checks equivalentes con `evaluatedOn: 'pixel'` junto a los de
  `'plan'` (no sustituirlos — el chequeo de plan sigue siendo útil como
  primera pasada barata antes de gastar una llamada a un proveedor de
  pago).
- `presenciaProducto` en modo pixel: comparación real contra la foto de
  referencia (similitud de imagen, no solo "¿hay fidelityRules?").
- `legibilidad`/`espacioLogo`/`espacioTextos` en modo pixel: detección de
  zonas vacías reales en la imagen generada, no solo "¿el prompt lo
  pidió?".
- `regenerationHints` ya existe como mecanismo (los `fix` de los checks
  fallidos) — con un proveedor real, alimentar esos hints como una
  sección adicional del Prompt Composer en la v2 es lo que hace que
  "marcar para regeneración" produzca de verdad un resultado distinto.

## 9. Duplicaciones deliberadas

- **`shared/shapes.js`**: copia independiente del DSL de validación de
  `marketing-engine/core/contracts/shapes.js` (~100 líneas, cero
  dependencias). El precio de la duplicación es mínimo comparado con el
  de una dependencia cruzada entre dos motores que deben poder fallar y
  evolucionar por separado. Mismo criterio ya usado en
  `marketing-engine/intelligence/contracts.js`.
- **`asset-pipeline/config.js#FORMAT_DIMENSIONS`**: dimensiones
  redeclaradas a partir de `app.html` (Calendario → `TAMANOS`,
  verificadas el 2026-07-25) — no son un módulo requerible (viven en un
  `<script>` inline de un HTML). `story` es una adición propia sin
  equivalente en `app.html`, documentada como tal.
- **Vocabulario de marca/enums**: `brief/contracts.js` redeclara sus
  propios `enumOf(...)` en vez de importar los de
  `marketing-engine/core/contracts/job.contract.js` — mismo motivo que
  `shapes.js`: cada capa es responsable de su propia forma, aunque el
  vocabulario de base coincida.

## 10. Cómo probarlo hoy

```bash
# Demo completa — brief con forma de marketing-engine, mapeado y
# ejecutado de principio a fin con el proveedor simulado
node creative-engine/cli/run-creative-demo.js \
     creative-engine/cli/briefs/ejemplo-brief-completo.json \
     --from-marketing-engine --variants 5

# Brief deliberadamente incompleto — demuestra que el Validador SÍ falla
# cuando debe, con regenerationHints accionables
node creative-engine/cli/run-creative-demo.js \
     creative-engine/cli/briefs/ejemplo-brief-incompleto.json --variants 3

# Un proveedor no implementado no rompe nada — se marca pending-provider
# y aun así se guarda prompt.json/metadata.json
node creative-engine/cli/run-creative-demo.js \
     creative-engine/cli/briefs/ejemplo-brief-completo.json \
     --from-marketing-engine --provider openai-images --variants 1
```

Ningún proveedor real está conectado — todo lo anterior corre sin red, sin
credenciales, con el proveedor `simulated`.
