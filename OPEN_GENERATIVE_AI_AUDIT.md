# Auditoría técnica — Open Generative AI (Anil-matcha/Open-Generative-AI)

Auditoría de arquitectura, no de producto: se ha clonado el repositorio
públicamente (sin modificarlo ni copiarlo a este proyecto) y se ha leído
su código real — no solo el README — para extraer principios de diseño
aplicables. **Nada de este documento se ha integrado**; es un análisis
comparativo contra nuestra arquitectura actual (`marketing-engine/`,
`creative-engine/`, `creative-engine/creative-lab/`).

## Metodología y limitación

Repositorio: monorepo Next.js/Electron. El código de las "Studios" vive en
`packages/studio/src/` (un componente por Studio: Image, Video, Cinema,
Marketing, Lip Sync, Workflow, Agent, Design Agent, Recast, AI
Influencer, Vibe Motion, Clipping, Apps, MCP/CLI) sobre un catálogo
estático de +400 modelos (`models.js`, 22.282 líneas) y un cliente HTTP
compartido hacia el servicio MuAPI (`muapi.js`). **Tres piezas están
fuera de alcance real de esta auditoría**: `packages/Vibe-Workflow`
(motor del editor de nodos de Workflow Studio), `packages/Open-Poe-AI` y
`packages/Open-AI-Design-Agent` son submódulos git declarados pero no
inicializados en el clon — su lógica interna de nodos/canvas no era
inspeccionable. Las conclusiones sobre Workflow/Design Agent Studio se
basan en cómo los invoca `packages/studio`, no en su implementación
interna.

## Comparación previa: dónde ya tenemos una solución mejor

Antes del ranking, esto es lo que la lectura del código confirma que
**no hace falta adoptar** porque ya lo resolvemos mejor:

- **Validación de calidad del resultado**: Open Generative AI no tiene
  ningún sistema de validación, scoring o moderación — el resultado del
  proveedor se muestra crudo (`res.url` directo a la UI). Nuestro
  `creative-validator/` (6 checks) + `creative-lab/concept-score/` (dos
  capas, plan y real) no tiene equivalente ahí.
- **Bibliotecas de conocimiento**: no existe nada parecido a
  `marketing-engine/knowledge/*.md` (playbooks de categoría, copywriting,
  dirección de arte) ni a `creative-lab/reference-library/` (referencias
  curadas con principios de diseño). Su único "catálogo" es metadata
  técnica de API (`models.js`), no editorial.
- **Normalización de respuesta de proveedor**: `muapi.js` normaliza con
  un encadenado `result.outputs?.[0] || result.url || result.output?.url`
  sin validar forma. Nuestro `GENERATION_RESULT_SHAPE` + `assertShape`
  fuerza una forma concreta — más seguro, confirma que la decisión de
  validar shapes fue acertada.
- **Persistencia de errores**: sus errores de generación son un toast que
  se autodestruye a los 4s. Nosotros persistimos `providerError` en
  `metadata.json` de cada versión — inspeccionable después, no efímero.

## Ranking de las 20 mejores ideas / hallazgos, por impacto

| # | Idea | Impacto | Dificultad |
|---|---|---|---|
| 1 | Esquema de entrada por proveedor más granular | Alto | Media |
| 2 | Helper de polling compartido y resiliente | Alto | Media |
| 3 | Paralelizar las llamadas reales del shortlist | Alto | Baja |
| 4 | Auto-preferir proveedor de edición cuando hay foto real | Alto (futuro) | Alta |
| 5 | Capacidades de continuidad de vídeo (extend / FLF) | Medio-alto | Baja (declarar ahora) |
| 6 | Biblioteca de escenarios con presencia humana/UGC | Medio-alto | Media |
| 7 | Depuración por etapa en el CLI de Creative Lab | Medio | Baja |
| 8 | Historial de imágenes de referencia reutilizables | Medio | Media |
| 9 | Deduplicar imágenes de referencia por identidad | Bajo-medio | Baja |
| 10 | Exponer la categorización ya existente de `sourceType` | Bajo-medio | Baja |
| 11 | Principio: campo explícito en vez de heurística de nombre | Bajo | Baja |
| 12 | Tratar 5xx como transitorio en llamadas reales | Medio | Baja |
| 13 | Validación/scoring de calidad — **ya lo tenemos mejor** | Nulo | — |
| 14 | Bibliotecas de conocimiento — **ya lo tenemos mejor** | Nulo | — |
| 15 | Agent/Design Agent Studio — **no adoptar** | Nulo | — |
| 16 | Normalización laxa de respuesta — **ya lo tenemos mejor** | Nulo | — |
| 17 | Plantillas de Workflow Studio (community) — **no aplica** | Bajo | — |
| 18 | Toast de error autodestructivo — **ya lo tenemos mejor** | Nulo | — |
| 19 | Soporte de LoRA — **fuera de alcance** | Nulo | — |
| 20 | AI Influencer Studio (persona consistente) — **aparcado** | Bajo | — |

---

### 1. Esquema de entrada por proveedor más granular
**Qué hace**: cada modelo en `models.js` declara un `inputs` tipo
JSON-Schema (`type`, `enum`, `min/maxValue`, `default`), más campos como
`imageField`/`videoField`/`lastImageField` (qué clave del payload recibe
cada tipo de media), `required`, `isEdit`, `hasPrompt`. La UI construye
sus controles dinámicamente a partir de esto, en vez de tener un `if`
hardcodeado por modelo.

**Por qué es buena**: evita que cada proveedor nuevo obligue a tocar
lógica de negocio — el contrato describe sus capacidades reales, no solo
un booleano grueso.

**¿Mejora nuestro proyecto?**: sí. Hoy `PROVIDER_META.capabilities` de
`creative-engine/provider-manager/provider.interface.js` es más grueso
(`supportsNegativePrompt`, `supportsReferenceImages` como booleanos) —
correcto para 1 proveedor activo, pero se quedará corto en cuanto
conectemos un segundo proveedor real con parámetros muy distintos (p. ej.
Adobe Firefly con `contentClass` propio, o Ideogram con control de
tipografía).

**Cómo adaptarlo**: añadir un campo opcional
`capabilities.inputSchema` (mapa `{campo: {type, enum?, min?, max?,
default?}}`) + `maxReferenceImages: number` + `requiresPrompt: boolean` +
`contentMode: 'generate'|'edit'` a `PROVIDER_META_SHAPE` — aditivo, no
rompe los 9 proveedores ya registrados (todos con `inputSchema`
ausente/`undefined` seguirían validando).

**Dificultad**: media. **Impacto**: alto.

### 2. Helper de polling compartido y resiliente
**Qué hace**: `muapi.js#pollForResult` es una única función reutilizada
por las 9 formas de generación (imagen, vídeo, audio, workflow...), con
`maxAttempts` distinto por tipo de media (60 para imagen, 900 para
vídeo/audio/workflow) y tratando errores 5xx como transitorios en vez de
fallo definitivo.

**Por qué es buena**: evita reimplementar el bucle "enviar → esperar →
reintentar" en cada integración nueva — justo el tipo de proveedor
asíncrono que tenemos pendiente (Runway, Veo, Kling, Adobe Firefly).

**¿Mejora nuestro proyecto?**: sí, directamente. Hoy nuestros proveedores
`planned` (incluido cualquier vídeo) tendrían que escribir su propio
polling desde cero — no existe ese helper en `provider-manager/`.

**Cómo adaptarlo**: un fichero nuevo
`creative-engine/provider-manager/poll.js` exportando `pollUntilDone(fn,
{maxAttempts, intervalMs, isTransientError})`, opcional — un proveedor
síncrono (como `openai-images`) simplemente no lo usa. Cero cambios en
`assertSupports`/`adaptToCapabilities`/`index.js`.

**Dificultad**: media. **Impacto**: alto (desbloquea limpiamente los
proveedores de vídeo ya registrados como `planned`).

### 3. Paralelizar las llamadas reales del shortlist
**Qué hace**: `ImageStudio.jsx` genera un batch con `Promise.all` en
paralelo, no secuencial.

**Por qué es buena**: con proveedores de red reales, una llamada tarda
segundos — generar 3-4 en paralelo en vez de uno a uno reduce el tiempo
total de un intento de Creative Lab de forma casi gratuita.

**¿Mejora nuestro proyecto?**: sí. `creative-lab/index.js#runCreativeLab`
genera el shortlist con un `for...of` secuencial
(`for (const item of shortlist) { await generateForConcept(...) }`).

**Cómo adaptarlo**: cambiar ese bucle por
`Promise.all(shortlist.map((item) => generateForConcept(...)))` — la
única precaución es que `store.beginVersion()` siga asignando números de
versión sin colisión si se llama en paralelo (verificar antes de
cambiarlo; si `beginVersion` no es seguro en paralelo, reservar los N
números de versión primero, secuencialmente, y lanzar las generaciones en
paralelo después).

**Dificultad**: baja. **Impacto**: alto (reduce el tiempo real de un
intento en, aproximadamente, el factor del tamaño del shortlist).

### 4. Auto-preferir proveedor de edición cuando hay foto real
**Qué hace**: al subir una imagen de referencia, `ImageStudio.jsx` cambia
automáticamente el catálogo de modelos disponibles de texto-a-imagen a
imagen-a-imagen (edición) — sin un interruptor manual, la propia subida
es el cambio de modo.

**Por qué es buena**: cuando existe una foto real, un modelo de edición
real la respeta con mucha más fidelidad que un modelo de texto-a-imagen
al que solo le describimos el producto en palabras (nuestra demo con el
Ventilador Muvip ya mostró esta limitación: sin edición real, la "foto
real" solo entra como reglas de fidelidad en texto, no como imagen que el
proveedor edite de verdad).

**¿Mejora nuestro proyecto?**: sí, en cuanto exista un proveedor real con
modo edición — hoy ninguno de los 9 registrados lo tiene activo
(`openai-images` v1 declara `supportsReferenceImages: false`).

**Cómo adaptarlo**: en `creative-lab/index.js`, si
`preparedAssets.product.photoPath` existe y el proveedor pedido soporta
`contentMode: 'edit'` (ver idea 1), usarlo automáticamente en vez del
modo genérico — aditivo, con fallback al comportamiento actual si no hay
proveedor de edición disponible.

**Dificultad**: alta (depende de tener antes un proveedor real de
edición conectado — hoy 0 de 9). **Impacto**: alto una vez desbloqueado.

### 5. Capacidades de continuidad de vídeo (extend / first-last-frame)
**Qué hace**: Video Studio soporta continuar un clip previo por
`requestId` (modo "Extend", preservando estilo/movimiento) y generar
usando fotograma inicial + final (`lastImageField`) para animar entre dos
imágenes.

**Por qué es buena**: son necesidades reales y distintas de la
generación de vídeo desde cero — sin declararlas, cualquier proveedor de
vídeo que las soporte (Runway, Kling ya las tienen) quedaría
infrautilizado.

**¿Mejora nuestro proyecto?**: sí, como preparación — hoy no tenemos
ningún proveedor de vídeo activo, pero los 3 registrados (`runway`,
`veo`, `kling`) ya declaran `kind: 'video'`.

**Cómo adaptarlo**: añadir `capabilities.supportsExtend: boolean` y
`capabilities.supportsLastFrame: boolean` a `PROVIDER_META_SHAPE` (idea
1) — solo declarar, sin construir la lógica de uso todavía, mismo
criterio que "arquitectura preparada, sin conectar proveedor".

**Dificultad**: baja (declarar ahora). **Impacto**: medio-alto (a
futuro, cuando se conecte un proveedor de vídeo real).

### 6. Biblioteca de escenarios con presencia humana / UGC
**Qué hace**: Marketing Studio ofrece "Avatar Presets" — plantillas
predefinidas de persona/avatar sosteniendo o usando un producto, para
generar creatividades de estilo "contenido de usuario real" (UGC) a
partir de una sola foto de producto.

**Por qué es buena**: es un formato de anuncio con alto rendimiento real
en redes (más auténtico que un producto flotante de estudio) que hoy
nuestras 14 entradas de `scenarios.js` no cubren explícitamente.

**¿Mejora nuestro proyecto?**: sí, es una laguna real — tenemos
`en-uso-manos` (manos genéricas) pero no un escenario de "persona
sosteniendo/usando el producto en contexto UGC".

**Cómo adaptarlo**: 2-3 entradas nuevas en
`creative-engine/creative-lab/libraries/scenarios.js` (ej.
`persona-sosteniendo-producto`, `contexto-ugc-casero`) + 1-2 entradas
nuevas en `reference-library/` que las combinen — mismo patrón ya
existente, sin tocar arquitectura.

**Dificultad**: media (requiere pensar bien el texto para no invitar a
generar caras específicas reconocibles — cuestión de prompt, no de
código). **Impacto**: medio-alto.

### 7. Depuración por etapa en el CLI de Creative Lab
**Qué hace**: Workflow Studio permite ejecutar y depurar UN nodo del
grafo de forma aislada (`runSingleNode`), no solo el pipeline completo.

**Por qué es buena**: iterar sobre una sola etapa (ajustar una
biblioteca, revisar solo el prompt maestro) sin rehacer todo el flujo
ahorra tiempo real de desarrollo — ya lo noté yo mismo al tener que
escribir scripts ad-hoc para probar `concept-generator/` por separado
durante la construcción de Creative Lab.

**¿Mejora nuestro proyecto?**: sí, como comodidad de desarrollo/ajuste de
bibliotecas, no de producción.

**Cómo adaptarlo**: flag `--stage=analysis|concepts|moodboard|prompt|score`
en `creative-lab/cli/run-creative-lab-demo.js` que imprime la salida de
esa etapa y para ahí — aditivo, no cambia `runCreativeLab`.

**Dificultad**: baja. **Impacto**: medio (operativo, no de producto).

### 8. Historial de imágenes de referencia reutilizables
**Qué hace**: cada imagen subida se guarda en `localStorage` con
miniatura; un panel permite reutilizar cualquier foto ya subida sin
volver a subirla.

**Por qué es buena**: en el Almacén de `app.html`, hoy cada campaña
nueva requiere volver a subir la foto del producto aunque ya se haya
subido antes para otra campaña del mismo producto.

**¿Mejora nuestro proyecto?**: sí, para cuando `runCreativeLab` se
conecte al Almacén (siguiente paso ya documentado en
`creative-lab/SESSION_LOG.md`) — mejora de UX, no de arquitectura del
motor.

**Cómo adaptarlo**: extensión del `CampaignStore` de `app.html` (ya
existe, en memoria) con un array de imágenes subidas + miniatura;
picker reutilizable en el modal de "Nueva Campaña". No toca
`creative-engine/`/`creative-lab/`.

**Dificultad**: media (trabajo de frontend en `app.html`). **Impacto**:
medio.

### 9. Deduplicar imágenes de referencia por identidad
**Qué hace**: `UploadButton` fusiona el historial por URL antes de
guardarlo, para no listar la misma imagen subida dos veces.

**Por qué es buena**: evita un historial de referencias ruidoso con
duplicados exactos.

**¿Mejora nuestro proyecto?**: sí, como detalle menor de la idea 8 — sin
esto, subir la misma foto del Ventilador Muvip dos veces crearía dos
entradas idénticas en el futuro historial del Almacén.

**Cómo adaptarlo**: comparar por hash del contenido (más fiable que URL,
ya que nuestras imágenes llegan como data-URL, no URLs remotas) antes de
añadir al historial.

**Dificultad**: baja. **Impacto**: bajo-medio.

### 10. Exponer la categorización ya existente de `sourceType`
**Qué hace**: Workflow Studio organiza en 3 pestañas — plantillas
predefinidas, propias del usuario, comunidad.

**Por qué es buena**: separar claramente el origen de cada elemento
ayuda a confiar (o no) en él.

**¿Mejora nuestro proyecto?**: parcialmente ya resuelto — el esquema de
`reference-library/schema.js` YA tiene `sourceType`
(`'seed-textual'|'campana-propia'|'stock-licenciado'`), solo que no se
expone como filtro en ningún sitio todavía (ni CLI ni futura UI).

**Cómo adaptarlo**: flag `--source=seed-textual|campana-propia` en el
CLI, o un filtro equivalente cuando exista UI — cero cambios de
esquema, ya está el dato.

**Dificultad**: baja. **Impacto**: bajo-medio.

### 11. Principio: campo explícito en vez de heurística de nombre
**Qué hace**: Video Studio empareja modelos t2v/i2v "hermanos" por un
campo explícito `family`; Image Studio, en cambio, usa una cadena de
heurísticas de nombre (sufijos, mapas de excepciones hardcodeados) —
más frágil y con más código.

**Por qué es buena**: es una lección de diseño, no una función a copiar
— declarar la relación explícitamente siempre es más robusto que
adivinarla por convención de nombre.

**¿Mejora nuestro proyecto?**: como principio a respetar si algún día
tenemos variantes generate/edit del mismo proveedor lógico (ver idea 1,
`contentMode`) — no hay nada que cambiar hoy, es una guía para no
repetir su propio error.

**Cómo adaptarlo**: no aplica código nuevo — documentar el principio en
`provider-manager/README.md` como criterio para el día que se necesite.

**Dificultad**: baja. **Impacto**: bajo.

### 12. Tratar 5xx como transitorio en llamadas reales
**Qué hace**: dentro del polling, un error 5xx no aborta inmediatamente —
se reintenta como si fuera un fallo temporal del proveedor.

**Por qué es buena**: proveedores reales de IA tienen picos de carga —
fallar a la primera por un 503 puntual desperdicia una generación que
habría funcionado en el siguiente intento.

**¿Mejora nuestro proyecto?**: sí, como parte del helper de polling
(idea 2) — hoy `generate()` de un proveedor real lanzaría directamente y
`runCreativePipeline`/`runCreativeLab` lo propagarían como error real.

**Cómo adaptarlo**: parte del mismo `poll.js` de la idea 2 —
`isTransientError(err)` clasifica 5xx/timeouts como reintentables, el
resto se propaga igual que hoy.

**Dificultad**: baja. **Impacto**: medio.

---

### 13-20. Comparaciones donde no se recomienda adoptar nada

**13. Validación/scoring de calidad de la pieza final — ya lo tenemos
mejor.** Open Generative AI no valida ni puntúa nada; nuestro
`creative-validator/` (6 checks) + `concept-score/` en dos capas no
tiene equivalente ahí. Nada que adoptar.

**14. Bibliotecas de conocimiento — ya lo tenemos mejor.** Su único
catálogo es metadata técnica de API, no principios de diseño ni
copywriting. `marketing-engine/knowledge/` y
`creative-lab/reference-library/` no tienen parangón en ese repo. Nada
que adoptar.

**15. Agent Studio / Design Agent Studio — no adoptar.** Son un producto
conversacional multi-turno tipo chat, cuya lógica de planificación ni
siquiera vive en el componente que se pudo inspeccionar (delega a otra
ruta/paquete). Adoptar algo así violaría directamente tu instrucción de
"no añadir agentes porque sí" y es un paradigma distinto al nuestro
(pipeline determinista y auditable, no conversacional). No recomendado.

**16. Normalización laxa de la respuesta del proveedor — ya lo tenemos
mejor.** Su encadenado `||` sin validar forma es exactamente lo que
`GENERATION_RESULT_SHAPE` + `assertShape` evita. Confirma que la
decisión de tipar estrictamente fue acertada. Nada que adoptar.

**17. Plantillas de Workflow Studio (con pestaña "comunidad") — no
aplica.** Depende de un backend multi-tenant (MuAPI) con usuarios que
comparten contenido entre sí — no tiene sentido para una herramienta de
un solo negocio (Ofipapel). La parte reutilizable de la idea (categorizar
por origen) ya está cubierta por la idea 10.

**18. Toast de error autodestructivo a los 4s — ya lo tenemos mejor.**
Nuestros errores de proveedor quedan persistidos en `metadata.json`, no
desaparecen. Nada que adoptar.

**19. Soporte de LoRA (`{model_id, weight}` por modelo) — fuera de
alcance.** No hay ningún caso de uso de fine-tuning/LoRA para Ofipapel,
Canarias INK o FalControl hoy. Aparcado, no descartado para siempre.

**20. AI Influencer Studio (persona consistente) — aparcado.** Idea
interesante para una futura "mascota de marca" o spokesperson
consistente, pero es una funcionalidad nueva, no una mejora de lo
existente — fuera del alcance explícito de este sprint ("no añadir
funcionalidades"). Queda anotado para un futuro sprint si el propietario
lo pide explícitamente.

## Recomendación de por dónde empezar

Si se retoma el desarrollo, las ideas **1, 2 y 3** son las de mayor
relación impacto/riesgo: ninguna añade arquitectura nueva ni funcionalidad
de negocio — son robustez interna (esquema de proveedor más rico, polling
resiliente, paralelismo) que preparan el terreno para el día que se
conecte un segundo proveedor real o un proveedor de vídeo, sin
comprometerse a construir nada de eso todavía.
