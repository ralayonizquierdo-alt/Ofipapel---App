# Decisiones — RAX

Registro append-only. No se edita retroactivamente una entrada ya escrita;
si una decisión se revierte, se añade una entrada nueva que referencia a la
anterior por fecha.

---

### 2026-07-10 — Ubicación canónica de las Skills: `.claude/skills/`

**Contexto**: existía (según el propietario) una primera Skill,
`diseno-ofipapel`, pero no se encontró en el repo, en ninguna rama, ni en
las carpetas globales de Claude Code accesibles desde esta sesión. Todo
indica que vivía solo en una carpeta personal local, no versionada.

**Decisión**: establecer `.claude/skills/<nombre>/SKILL.md` (dentro del
repo, versionado en git) como la única ubicación válida para cualquier
Skill del ecosistema RAX, presente o futura. Se crea `.claude/rax/` como
memoria compartida (inventario, roadmaps, deuda, decisiones, log de
sesiones) independiente de cualquier Skill concreta, para que todas puedan
leerla sin acoplarse entre sí.

**Alternativas descartadas**: mantener las Skills en carpetas personales
(descartado: invisible entre entornos/sesiones, es la causa raíz del
problema); meter el estado vivo (inventario/roadmap) dentro de la propia
carpeta de `project-manager` (descartado: acopla la memoria compartida a
una Skill concreta, dificultando que otras Skills la usen sin duplicarla).

**Quién decide**: propuesto por Claude (Skill `project-manager` en
construcción), confirmado explícitamente por el propietario.

**Reversibilidad**: alta — son solo ficheros markdown, mover o renombrar es
trivial si se decide otra estructura más adelante.

---

### 2026-07-10 — Corrección de `.gitignore`: `joe-app/` completo → solo `node_modules/` y `dist/`

**Contexto**: detectado durante la primera pasada de inventario (`DT-01`).
La regla `joe-app/` en el `.gitignore` raíz ignoraba cualquier fichero
nuevo dentro de esa carpeta (comprobado: un fichero de prueba creado dentro
de `joe-app/src/` no aparecía en `git status`), pese a que 29 ficheros ya
estaban trackeados de antes (por eso pasaba desapercibido).

**Decisión**: corregir la regla a `joe-app/node_modules/` y `joe-app/dist/`,
igual que ya estaba bien hecho para `alquileres/`. Aplicado directamente
por ser una corrección de bajo riesgo (reversible, no toca producción,
datos ni credenciales) según la regla de autonomía de `project-manager`.

**Alternativas descartadas**: dejarlo para que lo confirme el propietario
primero — descartado porque el riesgo real (pérdida silenciosa de trabajo
no versionado) supera el coste de una corrección de una línea, y cae
dentro de "bajo riesgo" según el propio criterio de la Skill.

**Quién decide**: Claude (Skill `project-manager`), acción de bajo riesgo,
comunicada al propietario en el resumen de la sesión.

**Reversibilidad**: total — un `git revert` del commit correspondiente.

---

### 2026-07-10 — Consolidación de las 3 ramas huérfanas de Skills en una única rama

**Contexto**: una auditoría completa del repo (incluyendo ramas sin PR)
encontró que "RAX" existía como tres líneas de trabajo divergentes y sin
fusionar: `claude/rax-project-manager-skill-1o2kl3` (Skill `project-manager`
completa + `.claude/rax/`), `claude/rax-sales-marketing-skill-4raaru`
(`sales-marketing` completa + `diseno-ofipapel` con una versión propia de
identidad visual + `project-manager` como stub), y
`claude/autonomous-dev-environment-8obtv2` / PR #61 (CI, Dependabot,
`design-studio/`, Sentry, y una tercera versión de `diseno-ofipapel`).
Ninguna de las tres construía sobre las otras. Se verificó además que la
versión de `identidad-visual.md` de la rama `sales-marketing` contenía datos
incorrectos: afirmaba que el color primario de Canarias INK era `#00BFA5`
(teal) cuando el CSS real (`canarias-ink.html`, variable `--acento`,
comentario "primary accent") confirma que es `#00B4D8` (cian) — `#00BFA5` es
solo el acento de categoría "botella". También afirmaba que Ofipapel usa
Arial como tipografía de marca, cuando `Index.html` ya carga y usa Inter +
IBM Plex Mono vía Google Fonts.

**Decisión**: consolidar en una sola rama, eligiendo por fichero la versión
verificada contra el código real (no la más reciente ni la más elaborada):
- `project-manager/SKILL.md` de `rax-project-manager-skill` (única versión
  completa).
- `diseno-ofipapel/SKILL.md` de `autonomous-dev-environment` (delega en
  `design-studio/README.md` para los tokens de marca, cubre las 3 marcas,
  tiene flujo de entrega Express/standalone) en vez de la versión de
  `sales-marketing` (duplicaba y en parte erraba los tokens).
- `design-studio/` completo de `autonomous-dev-environment` (dependencia
  dura de `diseno-ofipapel`).
- `.claude/rax/*.md` de `rax-project-manager-skill`, con correcciones: el
  inventario afirmaba que `alquileres/` usa Supabase — verificado por grep
  que no es cierto, corregido.
- `sales-marketing` **no se incorpora** — queda documentado como aparcado en
  `.claude/skills/README.md` y `INVENTORY.md`, con su razón. El código sigue
  disponible en su rama original si se retoma más adelante.
- No se trae de `autonomous-dev-environment` nada de CI, Dependabot, Sentry,
  ni los demás cambios de esa PR (#61): quedan fuera de alcance de esta
  consolidación, aplazados por instrucción explícita del propietario junto
  con RLS, instrumentación del bot de WhatsApp y migración de `alquileres`.

**Alternativas descartadas**: hacer `git merge` de las 3 ramas — descartado
porque traería historial y ficheros no deseados (Sentry, CI) fuera del
alcance aprobado, y los conflictos entre versiones divergentes del mismo
fichero (p. ej. `diseno-ofipapel/SKILL.md` en dos ramas distintas) se
resuelven mejor eligiendo conscientemente por fichero que con una resolución
de conflictos genérica.

**Quién decide**: propuesto por Claude (auditoría + plan), aprobado
explícitamente por el propietario (consolidación + campaña de validación).

**Reversibilidad**: alta — las ramas originales no se han borrado, solo se
propone borrarlas una vez este PR esté fusionado y confirmado.

---

### 2026-07-10 — `sales-marketing` aparcado hasta validar `diseno-ofipapel`

**Contexto**: ver decisión anterior. `sales-marketing` es una Skill grande
(calendario comercial, cruces de catálogo, especificaciones por canal, plan
anual) que depende por completo de `diseno-ofipapel` para producir cualquier
pieza, y `diseno-ofipapel` no había generado todavía ni una sola pieza real.

**Decisión**: no incorporar `sales-marketing` en esta consolidación. Se
retoma solo cuando `diseno-ofipapel` tenga más de una campaña real entregada
y usada por el negocio — la campaña "Vuelta al Cole" de esta misma sesión es
la primera.

**Alternativas descartadas**: incorporarla igualmente "por si acaso" —
descartado explícitamente por instrucción del propietario ("no añadas
Skills ni documentación innecesaria").

**Quién decide**: Claude (Skill `project-manager`), consistente con la
instrucción explícita del propietario de no añadir Skills nuevas en esta
fase.

**Reversibilidad**: alta — el código de `sales-marketing` sigue existiendo
en su rama original, no se ha borrado.

---

### 2026-07-12 — Sprint "RAX v1 Production": backend de `alquileres`, proxy de IA, RLS/reglas

A partir de esta entrada, y por instrucción explícita del propietario, se
documentan aquí solo las decisiones finales — no las alternativas
evaluadas.

**`alquileres` se queda en Firebase Firestore** (proyecto `ofipapelvv`, ya
en `main`). Se descarta la migración paralela a Supabase que existía en una
rama huérfana sin fusionar; no se sustituye una implementación ya
integrada por otra.

**Proxy server-side para el asistente de IA de `Index.html`**
(`netlify/functions/chat-assistant.js`) rescatado de esa misma rama y
adaptado sobre el `main` actual — la API key de Anthropic ya no se expone
en el navegador.

**RLS/reglas de acceso reales en ambos backends**: `joe-app` (Supabase) y
`alquileres` (Firestore) ahora exigen una sesión (anónima) para leer o
escribir, en vez de aceptar cualquier petición con solo la clave pública.
El código está fusionado; falta que el propietario active el proveedor de
sign-in anónimo en cada consola (Supabase / Firebase) y, en el caso de
Firestore, despliegue `alquileres/firestore.rules` — ninguna de las dos
cosas es ejecutable desde este repo sin esas credenciales.

**`index.html` vs `Index.html`** confirmado como no-problema: es un
redirect intencional, no deuda técnica.

**Quién decide**: propietario (backend de `alquileres`, prioridad del
proxy de IA); Claude ejecuta el resto de decisiones técnicas dentro de ese
marco, sin pausar salvo por datos de producción, riesgo de pérdida de
información o decisión de negocio — ninguno de los cambios de esta entrada
cruzó esas líneas.

**Reversibilidad**: alta — todos los cambios son aditivos (nuevas reglas,
nuevo proxy, nuevas sesiones) y revertibles con `git revert`; ninguno
modifica datos existentes.

---

### 2026-07-24 — `marketing-engine/`: Motor de Marketing con IA, arquitectura de 8 agentes

**Contexto**: el propietario pidió explícitamente construir "los cimientos
de un sistema profesional de IA para marketing" — no funciones sueltas —
con filosofía "Claude es el Director General del departamento creativo":
un pipeline de 8 agentes con responsabilidad única (Director Creativo,
Director de Arte, Guardián de Marca, Fotógrafo Publicitario, Especialista
en Prompts, Copywriter, Maquetador, Control de Calidad), preparado para
incorporar proveedores de IA reales (OpenAI Images, Google, Ideogram, Adobe
Firefly, Flux, Runway, Veo) sin modificar el núcleo, y sin integrar
todavía ninguno de esos proveedores. El propietario autorizó explícitamente
mejorar la arquitectura propuesta durante el desarrollo, documentando el
motivo.

Esto es, en efecto, la misma idea que motivó la Skill `sales-marketing`
aparcada el 2026-07-10 (ver esa entrada) — pero no es esa Skill retomada:
es un sistema nuevo, construido desde cero, evitando explícitamente el
motivo por el que se descartó la anterior (identidad visual duplicada con
datos incorrectos). La regla de aparcamiento ("no retomar hasta que
`diseno-ofipapel` tenga más de una campaña real entregada y usada por el
negocio") queda superada por esta instrucción directa del propietario —
no se ignoró en silencio, queda documentada aquí.

**Decisión**:

1. Nueva carpeta de primer nivel `marketing-engine/`, hermana de
   `design-studio/` (no anidada dentro): `design-studio/` sigue siendo la
   capa de capacidades (brand kit, plantillas, render, Adobe/Firefly);
   `marketing-engine/` es la capa de orquestación que la consume por
   referencia, nunca al revés.
2. Cada uno de los 8 agentes vive en `marketing-engine/agents/0N-nombre/`
   con config/README/prompts/state/interface/service — el prefijo
   numérico refleja el orden real de ejecución (`core/pipeline-config.js`,
   única fuente de verdad del orden), no al revés.
3. **Fix de la causa raíz del intento anterior**: se creó
   `design-studio/brand-kit.json`, machine-readable, verificado línea a
   línea contra el CSS real de `Index.html`, `canarias-ink.html` y
   `falcontrol.html` (no transcrito de memoria) — se encontró y corrigió
   una imprecisión real que tenía el propio README de Canarias INK
   (fondo documentado como `#1A5C1A`/`#1A1D2E`; el real es `#0F1119`,
   `#1A5C1A` ni siquiera pertenece a esa marca). El agente
   `03-guardian-marca` consume ese JSON por `require()` directo — nunca
   copia colores a su propio `config.js`.
4. Orquestador sin dependencias (`core/orchestrator.js`): lista + bucle +
   3 casos de estado, con `returnTo` + `MAX_RETRIES_PER_AGENT=2` para el
   bucle de vuelta que puede pedir Guardián de Marca o Control de Calidad
   — verificado con pruebas reales (rebote que se recupera, y rebote que
   agota reintentos y termina en `failed_needs_human` sin bucle infinito).
5. Contratos por JSDoc + shape-checker propio (`core/contracts/shapes.js`,
   sin zod/ajv) y registro de proveedores (`core/providers/registry.js`,
   7 proveedores en `status:"planned"` + `simulated` activo) — mismo
   criterio de "cero dependencias hasta que haga falta de verdad" que ya
   rige `design-studio/` (que tampoco tiene `package.json`).
6. Dos agentes son integración real hoy, no simulación: Guardián de Marca
   (valida contra `brand-kit.json`) y Maquetador (renderiza de verdad con
   `design-studio/scripts/render-html.js`). Los otros 6 son reglas
   deterministas simuladas con costura documentada hacia IA real.

Documentado en detalle, con ejemplos reales de ejecución, en
`marketing-engine/ARCHITECTURE.md`.

**Alternativas descartadas**:
- Anidar `marketing-engine/` dentro de `design-studio/` — descartado: mezclaría
  commits de dos responsabilidades distintas (capacidades vs. orquestación) y
  repetiría el patrón de "cosas nuevas dentro de una carpeta ya asentada" que
  causó la duplicidad de 2026-07-10.
- zod/ajv para validar contratos — descartado por ahora: cero dependencias de
  validación existen en todo el repo, volumen de formas pequeño, sin payloads
  externos poco fiables todavía. Señal concreta para reconsiderarlo: el primer
  proveedor real con payloads complejos.
- Motor de workflow de terceros para el loop-back — descartado: 8 pasos
  conocidos no justifican un motor de grafo genérico.

**Quién decide**: propietario (instrucción directa, incluyendo autorización
explícita para mejorar la arquitectura documentando el motivo); Claude
ejecutó el diseño y la implementación dentro de ese marco.

**Reversibilidad**: alta — todo el subsistema es aditivo (carpeta nueva,
una línea añadida a `design-studio/README.md`, una línea añadida a
`.gitignore`), no modifica ningún fichero existente de las apps de
negocio. `marketing-engine/jobs/` es generado y está en `.gitignore`.

### 2026-07-25 — Integración `app.html` ↔ `marketing-engine/`: el Almacén como único punto de creación

**Contexto**: el propietario pidió conectar de verdad `marketing-engine/`
(hasta entonces solo accesible por CLI) con `app.html` (el panel de redes
sociales — no documentado hasta ahora ni en este inventario ni en
`CLAUDE.md`, gap corregido en esta misma sesión), con un principio
explícito no negociable: *"La aplicación será únicamente la interfaz. El
Marketing Engine será el cerebro. Toda decisión creativa debe pasar por el
Marketing Engine. La aplicación nunca deberá implementar lógica creativa
propia."* Sin nuevas pantallas ni navegación, sin proveedores de IA reales
todavía, sin fusionar la PR. El propietario autorizó después trabajo
autónomo por el resto de la lista de prioridades (revisar duplicidades,
probar, documentar, informe final) sin pausar salvo decisión de
arquitectura que comprometiera el proyecto.

**Decisión**:

1. **Puente serverless nuevo**, no cambios en el núcleo del motor:
   `netlify/functions/marketing-engine-run.js` crea un `Job` a partir del
   formulario "+ Nueva Campaña" del Almacén, ejecuta `runPipeline()` tal
   cual, y devuelve el job final (incluida la pieza generada en base64,
   porque la app no tiene backend/CDN propio). `app.html` nunca importa
   nada de `marketing-engine/` directamente — solo `fetch()`.
2. **3 bugs reales encontrados por el agente de planificación leyendo el
   código fuente** (no solo la descripción), corregidos antes de construir
   el puente encima: `job-store.js` tenía una ruta de escritura fija
   incompatible con el filesystem de solo-`/tmp` de Lambda; dos escritores
   de ficheros (`simulated.provider.js`, `07-maquetador/service.js`)
   ignoraban esa capa y recalculaban su propia ruta por su cuenta;
   `orchestrator.js` sobrescribía (en vez de fusionar) `metadata` al
   invocar al proveedor, lo que habría roto en silencio el paso de la foto
   real del producto. Ver tabla completa en `marketing-engine/INTEGRATION.md`.
3. **4 campos opcionales nuevos** en `JOB_INPUT_SHAPE`
   (`postTypeOverride`, `objective`, `creativeStyleHint`, `targetDate`),
   consumidos en un único sitio (`01-director-creativo/service.js`): si el
   usuario los elige en el formulario, priman sobre la simulación por
   categoría; si no, el Director Creativo decide solo, igual que antes.
   `targetDate` no lo consume ningún agente — es solo para que el Almacén
   muestre "fecha prevista".
4. **`simulated.provider.js` usa la foto real del producto cuando existe**
   (`req.metadata.sourceImage` como `data:image/...`) en vez del
   placeholder SVG abstracto — sigue sin ser IA real (cero red, cero
   credenciales), pero permite verificar el flujo completo con un producto
   de verdad, no solo con datos de relleno.
5. **`CampaignStore`** (IIFE nueva en `app.html`, antes de `Almacen`/
   `Calendario`): único estado compartido de campañas, con
   `subscribe()`/`notify()` para que Almacén y Calendario se repinten
   solos el uno al otro sin recargar. Sustituye los dos arrays
   `carruseles` independientes y duplicados que existían antes (mismos 6
   productos de demo, con `id`s coincidentes mostrando cosas distintas
   según la vista — fuente real de inconsistencia, no solo redundancia de
   código).
6. **Cambio de responsabilidad, no solo de código**: el Calendario pierde
   por completo la capacidad de crear contenido (se elimina el modal de
   subida y su botón) — pasa a leer `CampaignStore` filtrando
   `status === 'approved'`. Aprobar/rechazar/editar viven exclusivamente
   en el Almacén, sobre el resultado que ya devolvió el motor.
7. Verificado de punta a punta con Playwright contra un servidor mínimo
   propio (módulo `http` nativo, sin `netlify-cli`): crear campaña con
   foto real → pipeline real (20 eventos de traza) → `ready_for_review` →
   aprobar → aparece en el pool del Calendario → programar → confirmado en
   `stat-programados`. Guion completo en `marketing-engine/INTEGRATION.md`.

**Alternativas descartadas**:
- Que la app decidiera tipo/tono/estrategia y se lo "dijera" al motor —
  descartado explícitamente por el propietario: rompería el principio
  "toda decisión creativa pasa por el motor". Los overrides opcionales
  (punto 3) son una influencia, no una decisión que la app tome por su
  cuenta — el motor sigue siendo libre de ignorarlos si no vienen.
- Editar el resultado de una campaña directamente en el Almacén (retocar
  copy/imagen a mano) — descartado: "Editar" reabre el formulario y
  **relanza el pipeline completo**, nunca modifica el resultado generado
  a mano. Mantiene la garantía de que ningún contenido final salió sin
  pasar por el motor.
- Subir el asset generado a almacenamiento externo y devolver una URL —
  descartado por ahora: la app no tiene backend/CDN propio hoy (ninguna
  vista de `app.html` lo tiene), así que se devuelve base64 inline,
  documentado como límite práctico (~6MB) a resolver si se conecta un
  proveedor de vídeo real.

**Quién decide**: propietario (instrucción directa, incluyendo
autorización explícita para trabajo autónomo sin pausas de confirmación);
Claude ejecutó diseño, implementación, pruebas y documentación dentro de
ese marco, deteniéndose solo en los puntos que sí requerían decisión del
propietario (ninguno surgió — los 3 bugs y el diseño de estados se
resolvieron dentro del marco ya autorizado).

**Reversibilidad**: alta — el puente es un fichero nuevo
(`marketing-engine-run.js`) más una entrada en `netlify.toml`; los cambios
en `marketing-engine/core/` son compatibles hacia atrás con el CLI (que
sigue funcionando igual sin `MARKETING_ENGINE_JOBS_DIR` definida). El
cambio en `app.html` es más profundo (reescribe Almacén y Calendario) pero
sigue siendo un único fichero versionado normalmente — revertible con
`git revert` si hiciera falta.

### 2026-07-25 — `marketing-engine/intelligence/`: capa de inteligencia en Shadow Mode

**Contexto**: cerrada la integración app↔motor, el propietario cambió el
objetivo del sprint explícitamente: *"A partir de este momento no quiero
añadir nuevas funcionalidades técnicas. Quiero construir la ventaja
competitiva del producto... No quiero depender únicamente de la calidad
del modelo de IA. Quiero que el conocimiento del sistema sea el verdadero
valor del producto."* Pidió 5 componentes (Product Intelligence, Campaign
Recommender, Creative Score, Variant Engine, Learning Engine) que
enriquecieran cada campaña antes de llegar al Director Creativo, sin
conectar ningún proveedor de IA.

Al plantear la integración con el orquestador surgió la decisión
arquitectónica real de todo el sprint: ¿esta capa debía empezar a decidir,
o solo asesorar? El propietario resolvió con una instrucción muy concreta,
después de que se le presentaran las dos opciones: **modo "Shadow"**. La
capa analiza, recomienda y compara con la decisión real — nunca decide —
hasta que se demuestre con datos propios que sus recomendaciones son
mejores o equivalentes, momento en el que se activa un modo "Decision" con
una única variable de entorno, reversible en el acto.

**Decisión**:

1. **`marketing-engine/intelligence/`**, hermana de `core/` y `agents/`
   dentro de `marketing-engine/` — no un conjunto de agentes nuevos en
   `PIPELINE` (`core/pipeline-config.js`), sino un servicio de `core/`
   (mismo nivel que `invokeProvider()`) con un único punto de entrada
   (`index.js` → `enrichJob`/`closeJob`) que el orquestador invoca en dos
   costuras: antes del primer agente y después del último, ambas
   envueltas en `try/catch` sin propagación de errores.
2. **`intelligence/mode.js`**: interruptor `shadow` (por defecto) /
   `decision`, leído de `MARKETING_ENGINE_INTELLIGENCE_MODE` en cada
   llamada (mismo patrón que `MARKETING_ENGINE_JOBS_DIR`). En `shadow`,
   `enrichJob()` calcula su propia recomendación sin tocar `job.input`. En
   `decision`, la aplica como override — pero nunca pisa un valor que el
   usuario ya haya fijado explícitamente. Es el único sitio de todo el
   módulo donde el modo cambia un comportamiento observable.
3. **Comparación explicada, no solo registrada**: `campaign-recommender/service.js`
   → `compareToActual()` corre al final del pipeline (cuando la decisión
   real ya es definitiva, no antes de que un bucle de vuelta pudiera
   cambiarla) y compara campo a campo — con `actual:null` explícito, nunca
   inventado, en los campos que el pipeline no decide hoy (p. ej.
   `campaignType`, que es un concepto exclusivo de `intelligence/`).
4. **Registro automático para análisis futuro**: `learning-engine/store.js`
   (mismo patrón que `core/job-store.js`: fichero por `jobId`, base
   configurable vía `MARKETING_ENGINE_LEARNING_DIR`) guarda recomendación +
   decisión real + comparación + puntuación en cada job completado — sin
   que esto exponga nada nuevo en la app ni en la función Netlify.
   `getRecommendationBias()` ya cuenta campañas comparables reales, pero
   devuelve siempre un resultado neutro a propósito: contar no es
   aprender, y este sprint no implementa lo segundo.
5. **Creative Score honesto sobre lo que mide de verdad**: 55 de 100
   puntos son medidas reales sobre el estado del pipeline (branding,
   copy, claridad, jerarquía); los otros 45 (impacto visual, atención,
   conversión, adecuación al público) son heurísticas proxy, marcadas
   `confidence:'proxy'` en el resultado — nunca presentadas como medición
   real. Nunca es una puerta: `08-control-calidad` sigue siendo el único
   paso que puede bloquear una pieza.
6. **`marketing-engine/ROADMAP_V2.md`** (nuevo): 4 fases a 12 meses, con
   el criterio explícito del propietario ("cuando se compruebe que las
   recomendaciones son mejores o equivalentes") como condición de la Fase
   3 para activar `decision` mode — no una fecha, un criterio.

**Verificado**: determinismo (misma entrada + misma fecha efectiva vía
`MARKETING_ENGINE_NOW` = misma salida byte a byte), coherencia interna
(un bug real encontrado y corregido en desarrollo: `objective` y
`campaignType` podían derivarse de dos eventos de calendario activos
distintos, produciendo p. ej. una recomendación "Lifestyle" con un CTA
agresivo de "vender" — ahora ambos se derivan del mismo evento),
razonamiento estacional (misma ficha, tres fechas, tres campañas
distintas), regresión completa del pipeline existente con la capa activa,
y resiliencia (un directorio de aprendizaje no escribible no rompe el
pipeline — solo un evento `intelligence_error` en la traza).

**Alternativas descartadas**:
- Modelar `intelligence/` como agentes nuevos en `PIPELINE` — descartado:
  nunca cruzan el sobre uniforme `AGENT_RESULT_SHAPE`, no son pasos
  independientemente sustituibles por id como los proveedores de
  `core/providers/registry.js`. Son una capa cohesionada con un punto de
  entrada, más parecida a `invokeProvider()` que a un agente.
- Un `interface.js` por componente (mismo patrón que `agents/`) —
  descartado a favor de un único `contracts.js`: ese patrón existe en
  `agents/` porque cada agente cruza la frontera de sobre uniforme que
  valida el orquestador; ningún componente de `intelligence/` lo hace.
- Activar `decision` mode en este mismo sprint, aunque fuera solo para
  algún campo — descartado explícitamente por el propietario: el sprint
  demuestra que la inteligencia razona bien antes de darle autoridad, no
  al mismo tiempo.
- Registrar automáticamente resultados reales (clics, ventas) en cada
  job — descartado: no hay ningún disparador real todavía (ninguna UI
  para introducirlos), así que `recordOutcome()` existe y está probada,
  pero nada la llama todavía — evita fingir una funcionalidad que no
  existe de verdad.

**Quién decide**: propietario (instrucción directa del objetivo del
sprint, y decisión explícita de Shadow Mode frente a Decision Mode tras
presentársele la disyuntiva); Claude ejecutó diseño, implementación,
verificación y documentación dentro de ese marco.

**Reversibilidad**: total y de un solo paso para el modo
(`MARKETING_ENGINE_INTELLIGENCE_MODE`, por defecto ya en el lado seguro).
El resto es aditivo: carpeta nueva, dos costuras en `core/orchestrator.js`
envueltas en `try/catch`, un campo opcional (`intelligence: maybe('object')`)
en `JOB_SHAPE`. Ningún fichero de `agents/` se modificó — el pipeline de 8
agentes es, byte a byte, el mismo de antes de este sprint.

### 2026-07-25 — `creative-engine/`: motor de generación, independiente de marketing-engine

**Contexto**: con la capa de inteligencia ya construida y en Shadow Mode,
el propietario pidió separar por completo el "pensar" del "crear": *"El
Marketing Engine piensa. El Creative Engine crea."* Nueva carpeta de
primer nivel `creative-engine/`, explícitamente **completamente
independiente de `marketing-engine/`**, con 6 componentes (Provider
Manager, Asset Pipeline, Prompt Composer, Variant Generator, Creative
Validator, Creative Assets) — solo arquitectura, sin conectar ningún
proveedor de IA todavía.

Un agente de planificación revisó el diseño contra el código real antes
de construir y encontró un hallazgo crítico que un diseño superficial no
habría capturado: `marketing-engine/core/providers/` ya tenía 6 de los 8
proveedores pedidos aquí (mismos ids, mismo estado `planned`) — construir
un segundo registro sin resolver por escrito cuál manda habría violado
"cero duplicidades" (`CLAUDE.md`) y habría dejado al primer proveedor real
que se active sin saber qué fichero editar.

**Decisión**:

1. **Mecanismo de independencia real, no solo intención**: `CreativeBrief`
   (`brief/contracts.js`) es el único contrato de entrada — refleja
   estructuralmente la salida de marketing-engine (director-creativo,
   director-arte, fotógrafo, Product Intelligence, Campaign Recommender)
   sin importar ni un fichero de allí. Verificado con
   `grep -rnE "require\(['\"](\.\./)+marketing-engine" creative-engine/`
   → vacío. `brief/from-marketing-engine.js` es un mapper puro (cero
   `require`) que sí se construyó ahora, no se dejó como prosa — es la
   respuesta ejecutable a "cómo se conectará después", verificada con el
   flag `--from-marketing-engine` del CLI de demo.
2. **`creative-engine/provider-manager/` se declara el registro canónico
   para generación creativa real**; `marketing-engine/core/providers/`
   queda legado por escrito en `creative-engine/ARCHITECTURE.md` §4 — sin
   tocar ni un fichero de `marketing-engine/` (`simulated` sigue siendo
   necesario allí porque el pipeline de 8 agentes lo usa hoy). Cualquier
   proveedor real futuro se activa en `creative-engine/`.
3. **Se incluyó un proveedor `simulated` activo** (placeholder SVG
   determinista, sin red) — sin él, Creative Assets (imágenes/versiones)
   nunca se habría ejercitado de verdad en la demo. Mismo criterio ya
   aceptado en `marketing-engine/` y en `intelligence/`.
4. **Prompt Composer modular con orden declarado**: 9 secciones
   (`sections/*.js`), producto siempre primero, formato técnico siempre
   último, las dos secciones de estrategia (inteligencia de producto,
   campaña) DESPUÉS del lenguaje puramente visual para no diluirlo con
   vocabulario de negocio que un modelo de imagen no interpreta.
5. **Principio de "composición posterior"**: ninguna sección pide
   renderizar texto — `sections/copy.js` solo reserva espacio negativo
   (mismo patrón que ya usa `07-maquetador` con HTML→PNG). Es lo que hace
   coherentes 2 de los 6 checks del Validador (`espacioLogo`/
   `espacioTextos`).
6. **Variant Generator declarado como eje ORTOGONAL** al de
   `marketing-engine/intelligence/variant-engine/`: aquel varía QUÉ
   campaña (estrategia), este varía CÓMO se fotografía una campaña YA
   elegida (ángulo/luz/composición) — componen multiplicativamente, no se
   consolidan. "Cada variante realmente distinta" se implementó como
   invariante forzado (`assertDistinctPrompts()`, lanza si dos variantes
   comparten el mismo prompt), no como una esperanza.
7. **Creative Validator con 6 checks, todos `evaluatedOn:'plan'` hoy**
   (nunca `'pixel'` — no existe ninguna imagen real que inspeccionar,
   `simulated` es un placeholder abstracto). `regenerationHints` ya
   existe como mecanismo para que una futura v2 produzca de verdad un
   prompt distinto, aunque el bucle de regeneración real no se ejecuta
   este sprint (no hay proveedor real con el que regenerar).
8. **Bug real encontrado en desarrollo, corregido antes de completar**:
   `assertSupports` rechazaba de forma dura cualquier `negativePrompt`
   que un proveedor no soportara — pero Prompt Composer SIEMPRE genera
   uno, así que cualquier proveedor con `supportsNegativePrompt:false`
   (p. ej. `openai-images`, fiel a la API real) rompía el pipeline
   entero. Separado en dos funciones: `assertSupports` (solo
   `contentClass`, requisito duro, lanza) y `adaptToCapabilities`
   (negativePrompt/imágenes de referencia, requisito suave, se descartan
   con aviso en vez de romper) — el Provider Manager ahora adapta la
   petición al proveedor en vez de exigir que el resto del sistema lo
   anticipe.

**Verificado**: independencia (grep), sintaxis (35 ficheros), registro (9
proveedores validan al cargar), demo completa en los dos desenlaces
(brief completo vía `--from-marketing-engine` → aprueba 6/6; brief
incompleto → falla 3/6 con `regenerationHints` accionables), fallo de
proveedor no implementado gestionado con gracia (`pending-provider`,
sigue guardando `prompt.json`/`metadata.json`), 10 variantes con 10
prompts únicos, determinismo (mismo brief + misma fecha = mismos prompts
byte a byte en dos ejecuciones), almacén de versiones con orden numérico
correcto (v10 no ordena antes que v2), y regresión completa del pipeline
de `marketing-engine/` sin ningún cambio de comportamiento.

**Alternativas descartadas**:
- Reutilizar el registro de proveedores de `marketing-engine/` en vez de
  crear uno nuevo — descartado: habría creado la dependencia cruzada que
  la independencia exige evitar, y ese registro no soporta vídeo ni
  proveedores de tipo plantilla (Canva).
- Dejar `marketing-engine/core/providers/` y `creative-engine/provider-manager/`
  como dos registros igual de válidos, sin declarar cuál manda —
  descartado explícitamente: es exactamente la ambigüedad que
  `CLAUDE.md` pide evitar ("cero duplicidades").
- Permitir que proveedores como Ideogram (fuerte en texto renderizado)
  rompan el principio de composición posterior en silencio — descartado:
  se documentó como decisión pendiente y explícita, no una excepción
  tácita.

**Quién decide**: propietario (instrucción directa del objetivo del
sprint); Claude ejecutó diseño (con validación de un agente de
planificación contra el código real), implementación, verificación y
documentación dentro de ese marco — sin necesitar ninguna decisión
adicional del propietario durante la construcción.

**Reversibilidad**: alta — todo el módulo es aditivo, ningún fichero de
`marketing-engine/` ni de `app.html` se tocó. `creative-engine/creative-assets/assets/`
es generado y está en `.gitignore` (mismo patrón de dos líneas que
`marketing-engine/jobs/`).
