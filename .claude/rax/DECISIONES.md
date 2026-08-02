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

### 2026-07-12 — Modo restringido: solo arquitectura/documentación, cero código de producción

**Contexto**: tras cerrar el sprint anterior, el propietario acota
explícitamente el ámbito de trabajo de una sesión paralela que estaba
reconstruyendo el mismo sistema de Skills sobre otra rama
(`claude/rax-v1-consolidacion`): solo documentación y organización del
repo (`CLAUDE.md`, `.claude/skills/`, `.claude/rax/`, inventario,
clasificación de ramas, roadmap, deuda técnica). Prohibido: tocar código de
producción (`Index.html`, `joe-app`, `alquileres`, `canarias-ink.html`,
funciones de Netlify, bot de WhatsApp), abrir PRs de código, o rescatar
funcionalidad de otras ramas aunque sea de bajo riesgo. Cualquier cambio de
código detectado como necesario se documenta como pendiente, no se
implementa.

**Decisión derivada — Sentry (PR #61) queda formalmente descartado, no
solo aplazado**: no se rescata mientras esté vigente este modo. Queda
documentado como pendiente en `DEUDA_TECNICA.md`/`ROADMAP_TECNICO.md` para
una futura sesión con permiso explícito de tocar código.

**Quién decide**: propietario. **Reversibilidad**: total — el propietario
puede levantar este modo en cualquier momento para una tarea concreta.

---

### 2026-07-12 — PR #67 detectado: invalida la clasificación de ramas de la sesión paralela

**Contexto**: al preparar un plan de limpieza de ramas, se detectó el PR
#67 (`claude/rax-validation-priorities-88bwrv` → `main`), abierto y sin
fusionar en ese momento. Verificado con diffs de contenido (no solo
mensajes de commit): ese PR incluía una copia funcionalmente idéntica de
todo el rescate hecho en paralelo en `claude/rax-v1-consolidacion`
(`chat-assistant.js` e `Index.html` byte a byte idénticos, RLS de `joe-app`
equivalente, CI/Dependabot/dedup de WhatsApp/`404.html`/`design-studio`
presentes), más trabajo real que esa rama paralela no tenía: reglas de
seguridad de Firestore para `alquileres` (`firestore.rules`), la primera
campaña real ("Vuelta al Cole 2026") y la resolución de DT-02.

**Decisión**: `claude/rax-validation-priorities-88bwrv` se retira de
cualquier lista de ramas candidatas a "Prueba/obsoleto" — es la rama de un
PR abierto con trabajo genuinamente más completo, no un experimento. Al
ser `claude/rax-v1-consolidacion` un subconjunto estricto y verificado de
ese PR, pasa a ser segura de eliminar una vez el PR se fusione.

**Quién decide**: verificación técnica de Claude. **Reversibilidad**:
alta — ninguna rama se tocó, solo se corrigió el informe.

---

### 2026-07-13 — Regla fija: comprobar ramas activas antes de crear una nueva

**Contexto**: consecuencia directa de la causa raíz de todo lo limpiado
estos días — varias ramas (`claude/rax-project-manager-skill-1o2kl3`,
`claude/autonomous-dev-environment-8obtv2` / PR #61,
`claude/rax-validation-priorities-88bwrv` / PR #67) reconstruyeron el
mismo sistema de Skills de forma independiente, cada una sin saber que las
otras existían, porque nada obligaba a comprobarlo antes de crear rama.

**Decisión**: ninguna sesión crea una rama nueva sin comprobar antes si ya
existe una rama activa para ese mismo trabajo. Si existe, continúa sobre
ella. Si no existe, crea una única rama nueva y lo indica explícitamente
en el primer mensaje de la sesión. Ampliado el mismo día: no duplicar
trabajo ya iniciado ni recrear funcionalidad ya implementada, y si se
detecta trabajo relacionado en otra rama, reconciliarlo **antes** de
empezar a implementar, no como limpieza posterior. Codificado como
política permanente en `.claude/skills/project-manager/SKILL.md`
("Disciplina de ramas").

**Quién decide**: propietario. **Reversibilidad**: total.

---

### 2026-07-13 — `CONTRIBUTING.md`: normas de trabajo formalizadas para humanos y sesiones de Claude Code

**Contexto**: la disciplina de ramas del punto anterior vivía solo dentro
de `project-manager/SKILL.md` — útil para sesiones de Claude Code, pero
invisible para GitHub y para cualquier colaborador humano (GitHub muestra
`CONTRIBUTING.md` automáticamente al abrir issues/PRs; un `SKILL.md` no).

**Decisión**: crear `CONTRIBUTING.md` en la raíz con las normas completas
de trabajo del repo (uso de ramas, comprobación de ramas activas antes de
crear una nueva, creación de PRs, proceso de reconciliación, y criterio
para cerrar/eliminar ramas — tabla Producción/Inactivo con
valor/Prueba-obsoleto, con la regla explícita de no borrar por antigüedad
y de verificar contenido con diffs reales, no solo títulos de commit).
`CLAUDE.md` referencia el documento en vez de duplicar su contenido.
`project-manager/SKILL.md` sigue siendo la aplicación automática de estas
normas dentro de una sesión de Claude Code; `CONTRIBUTING.md` es la fuente
de verdad legible por cualquiera.

**Quién decide**: propietario. **Reversibilidad**: total.
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

### 2026-07-25 — Primera generación real: Marketing Engine → Creative Engine → OpenAI Images

**Contexto**: ambos motores estaban completos pero nunca conectados con
un proveedor real. El propietario pidió demostrar la arquitectura, no
ampliarla: un solo proveedor real (OpenAI Images), sin tocar `app.html`
ni ningún agente.

**Decisión**: se implementó `openai-images.provider.js` (llamada real a
`/v1/images/generations`, `status: 'active'`) y se conectó en el único
punto que ya conocía ambos motores: `netlify/functions/marketing-engine-run.js`.
La elección de proveedor (`openai-images` si hay `OPENAI_API_KEY`, si no
`simulated`) vive ahí, no dentro de `creative-engine/` — es el punto de
sustitución de un futuro proveedor distinto. `response.renderedAsset`
solo se sustituye por la imagen real cuando la generación tiene éxito de
verdad; con el fallback se mantiene el PNG del maquetador, para no
degradar la vista previa actual. Ver `FIRST_REAL_GENERATION.md`.

**Verificado**: extremo a extremo con el fallback `simulated` (sin
`OPENAI_API_KEY` en este entorno) — pipeline completo, `response.creative`
presente, `renderedAsset` intacto. El cuerpo real de `generate()`
(mapeo de tamaño, escritura de PNG, manejo de respuesta) se verificó por
separado con `fetch` sustituido por un doble de prueba, sin llamada real
a la API (no hay credencial en este sandbox).

**Alternativas descartadas**: hacer que `marketing-engine/07-maquetador`
llame a `creative-engine` directamente — descartado, rompería el
principio de independencia ya documentado (conocimiento en un solo
sentido). La integración vive en el puente, no en ninguno de los dos
motores.

**Quién decide**: propietario (objetivo explícito del sprint); Claude
ejecutó implementación y verificación dentro de ese marco.

**Reversibilidad**: alta — 3 ficheros tocados, ninguno de
`marketing-engine/` ni `app.html`. Sin `OPENAI_API_KEY`, el comportamiento
es idéntico al de antes de este sprint.

### 2026-07-26 — creative-lab/: investigación y perfeccionamiento de calidad visual

**Contexto**: tras demostrar el pipeline completo con un producto real
(Ventilador Muvip, sprint anterior), el propietario cambió la prioridad
del proyecto: dejar de ampliar arquitectura y centrarse exclusivamente en
alcanzar un nivel visual comparable al de una agencia profesional. Pidió
un nuevo módulo, Creative Lab, con arquitectura aprobada explícitamente
antes de implementar (plan revisado y confirmado punto por punto: capas
de evaluación, umbral/reintentos, ubicación, Biblioteca de Referencias,
filosofía).

**Decisión**: `creative-lab/` vive dentro de `creative-engine/` (no es un
módulo top-level — no tiene consumidor externo propio, reutiliza
Provider Manager/brief/creative-assets/prompt-composer/creative-validator
existentes). 9 bibliotecas atómicas (8 aprobadas + `angles-lenses.js`
añadida a petición explícita para la Biblioteca de Referencias). La
Biblioteca de Referencias es una capa de "recetas" que apunta por id a
las bibliotecas atómicas (no duplica texto), con 12 campos obligatorios +
2 heredados de la propuesta original (`whatMakesItSpecial`,
`whyItWorksOnSocial`). Semilla textual (15 entradas, `sourceType:
'seed-textual'`), sin ninguna imagen con derechos de terceros — decisión
explícita del propietario tras planteársela como pregunta con dos
opciones. Escala a decenas de miles vía `entries/<id>.json` +
`manifest.json` ligero (solo campos de filtrado).

**Norma obligatoria aplicada como invariante de código, no como
esperanza**: `concept-generator/` mezcla 2-3 referencias por concepto +
fuerza una variación propia del director en una de 6 dimensiones
(encuadre/emoción/narrativa/iluminación/composición/escenario), y
`assertNoReferenceIsFullyCopied`/`assertDistinctConcepts` lanzan si algún
concepto coincide con una referencia o con otro concepto.

**Corrección de diseño durante la implementación** (documentada per
instrucción explícita del propietario: "si encuentras una arquitectura
mejor... documenta el motivo antes de implementarla"): la primera versión
de la mezcla usaba módulos simples y producía conceptos idénticos cada
`references.length` iteraciones (detectado por el propio invariante al
probarlo) — se sustituyó por selección por hash determinista + salt con
reintento acotado (25 intentos), sin perder determinismo (verificado:
mismo brief + misma biblioteca = mismo resultado).

**Evaluación en dos capas** (decisión definitiva del propietario, para no
pagar 8-12 generaciones reales cuando bastan 3-4): capa 1 gratuita sobre
todos los conceptos (reutiliza `creative-validator/` + calidad de
referencias + originalidad fija), capa 2 real y definitiva solo sobre el
shortlist. `QUALITY_THRESHOLD=85`, `MAX_RETRIES=3`, `SHORTLIST_SIZE=4`,
configurables por variable de entorno.

**Verificado**: independencia por grep, las 9 bibliotecas + 15
referencias validan al cargar, `runCreativeLab` extremo a extremo con el
brief real de Ventilador Muvip (`approved`, capa 2 = 100/100), brief
deliberadamente incompleto → 3 intentos agotados sin bucle infinito →
`needsHumanReview`, determinismo confirmado (mismo brief + `--json` dos
veces, diff vacío ignorando ids/timestamps), regresión completa de
`marketing-engine/` y `creative-engine/` sin cambios de comportamiento.

**Alternativas descartadas**:
- Módulo top-level `creative-lab/` en la raíz del repo — descartado: no
  tiene consumidor externo propio, habría sido un tercer registro/
  contrato sin necesidad real.
- Guardar imágenes reales con derechos de terceros en la Biblioteca de
  Referencias — descartado por decisión explícita del propietario
  (semilla textual); el campo `sourceRef` queda como referencia, nunca
  una copia de la imagen.
- Enviar las 8-12 generaciones al proveedor real — descartado
  explícitamente por el propietario ("no quiero generar 12 imágenes de
  pago cuando solo necesito las mejores").
- Cablear ya la biblioteca de tendencias (`trends.js`) en la mezcla de
  conceptos — se dejó validada pero sin integrar: no formaba parte de los
  12 campos mínimos pedidos para la Biblioteca de Referencias: mismo
  patrón "un fichero + una línea" cuando se decida activarla.

**Quién decide**: propietario (aprobó la arquitectura explícitamente,
punto por punto, antes de autorizar la implementación); Claude ejecutó
diseño, implementación, verificación y documentación dentro de ese marco,
incluida la corrección de diseño de concept-generator/ documentada arriba.

**Reversibilidad**: alta — módulo aditivo dentro de `creative-engine/`,
ningún fichero de `marketing-engine/` ni de `app.html` tocado. Sin
`OPENAI_API_KEY`, se comporta igual que el resto de `creative-engine/`
(fallback a `simulated`).

### 2026-07-26 — Sprint "Director de Arte Senior": autocrítica obligatoria antes del prompt

**Contexto**: el propietario pidió mejorar solo la calidad creativa de
`creative-lab/`, sin módulos nuevos: el Director Creativo debe responder
7 preguntas sobre cada concepto antes de componer ningún prompt, y
descartar automáticamente lo que no parezca campaña profesional.

**Decisión**: nuevo fichero dentro del módulo ya existente
`concept-generator/self-critique.js` (no un módulo top-level) —
determinista, sin IA, reutiliza campos que el concepto ya trae.
`index.js#runCreativeLab` aplica el filtro entre `generateConcepts()` y
`composeMasterPrompt()`. `SHORTLIST_SIZE` baja de 4 a 3.

**Verificado**: brief real (Ventilador Muvip) → 0 descartados, mismo
ganador. Brief con jerarquía sobrecargada → los 10 descartados, error
claro. Concepto sintético "ficha de catálogo" → descartado correctamente.

**Quién decide**: propietario (norma exacta, 7 preguntas literales).

**Reversibilidad**: alta — un fichero nuevo + una inserción de 3 líneas
en `index.js` + un valor de configuración. Revertir es quitar el import y
la llamada a `filterProfessionalConcepts`.

### 2026-07-26 — Sprint "Prompt Composer Cinematográfico": campaña, no producto

**Contexto**: el propietario pidió reescribir el Prompt Composer para que
deje de describir productos primero y describa campañas primero, con 13
bloques obligatorios (12 + negative prompt), sin módulos nuevos y sin
tocar ningún otro componente.

**Decisión**: se reescribió únicamente `creative-lab/master-prompt-composer/`
(service.js + sections/from-concept.js + config.js nuevo dentro del
módulo ya existente; se eliminó sections/director-variation.js, plegado
como anotación). Deja de envolver `creative-engine/prompt-composer/` — el
compositor base de 9 secciones queda intacto y lo sigue usando
`creative-engine/index.js#runCreativePipeline` sin cambios. Se mantiene
`id: 'copy'` en el bloque de espacio de texto a propósito, porque 3 de
los 6 checks de `creative-validator/` (no modificado) dependen de ese id
exacto.

**Verificado**: 6/6 checks de creative-validator con la nueva estructura,
regresión de `creative-engine/` y `marketing-engine/` sin cambios,
brief real (Ventilador Muvip) → `approved`, capa 2 = 100/100.

**Quién decide**: propietario (los 13 bloques y su orden son literales).

**Reversibilidad**: alta — cambio contenido en 1 módulo, forma de salida
idéntica a la anterior (mismos campos), cero cambios en index.js/
concept-score/CLI.

### 2026-07-26 — Fix: jerarquía sobrecargada + maquetador de plantilla única

**Contexto**: al probar la campaña real del Ventilador Muvip contra el
nuevo filtro "Director de Arte Senior" de `creative-lab/`, los 10
conceptos fueron rechazados por jerarquía visual sobrecargada. Investigando
la causa raíz (no en `creative-lab/`, sino en `marketing-engine/`) se
encontraron dos problemas reales pre-existentes que arrastrábamos desde
la primera demo de la sesión: `02-director-arte/config.js` declaraba 6 y 5
elementos de jerarquía (máximo real: 4) para las dos familias gráficas más
usadas, y `07-maquetador` solo tenía UNA plantilla fija
(`templates/pieza-generica.js`) pese a que `02-director-arte` ya decide un
`layoutId` distinto por categoría — nunca se leía.

**Decisión**: (1) `02-director-arte/config.js`: hierarchy de
`producto-sobre-fondo-marca` 6→4, de `oferta-destacada` 5→4. (2)
`07-maquetador/config.js`: nuevo `TEMPLATES_BY_LAYOUT_ID` (registro por
layoutId, con `layout-centrado` de default) + `templates/layout-diagonal.js`
nuevo (franja diagonal, producto desplazado, CTA — para `oferta-destacada`).
`service.js` selecciona la plantilla por `job.state['director-arte'].layoutId`
en vez de importar `pieza-generica.js` a pelo. Sigue exactamente el
patrón de extensión que el propio `pieza-generica.js` ya documentaba
("añadir un fichero + una entrada, sin tocar service.js").

**Verificado**: electrodomésticos → `layout-centrado`, jerarquía 4,
Creative Lab ya no descarta ningún concepto (antes: 10/10 descartados) →
`approved`, capa 2 = 100/100. Categoría oferta → `layout-diagonal`,
jerarquía 4, pieza visualmente distinta (franja diagonal + badge + CTA).
Regresión de `creative-engine/` sin cambios, independencia
`creative-lab/`↔`marketing-engine/` intacta (grep vacío).

**Quién decide**: propietario (pidió priorizar esto sobre conectar un
proveedor de IA real, tras señalar la desconexión entre el prompt
cinematográfico y la plantilla fija).

**Reversibilidad**: alta — 3 ficheros de `marketing-engine/` modificados,
1 nuevo; `creative-lab/` no tocado en absoluto.

### 2026-07-26 — layout-composer/: la pieza que faltaba entre decisión y resultado

**Contexto**: tras arreglar la jerarquía sobrecargada y dar al maquetador
2 plantillas por categoría, el propietario señaló que seguía siendo
insuficiente ("¿solo hay dos plantillas disponibles?") — con razón: esas
2 plantillas cubrían las 2 únicas ramas del sistema simple de categorías
de `marketing-engine/`, no la riqueza combinatoria real de `creative-lab/`
(52 estilos, 15 composiciones...). Se le presentaron dos caminos
(ampliar categorías de marketing-engine, o construir un compositor de
layout real dentro de creative-lab) y eligió el segundo, explícitamente
aprobando un módulo nuevo.

**Decisión**: `creative-engine/creative-lab/layout-composer/` — 6
arquetipos de layout genuinamente distintos (no 15, uno por composición;
agrupados por afinidad visual real), seleccionados por
`concept.compositionId`, con un eje independiente de énfasis tipográfico
por `concept.textSpaceId` (3 niveles). Reutiliza
`design-studio/scripts/render-html.js` (nunca reimplementado) y escribe
dentro del mismo directorio de versión de `creative-assets/store.js` (sin
almacenamiento nuevo). `index.js#runCreativeLab` lo invoca automáticamente
sobre el concepto ganador, nunca rompe el pipeline si falla.

Fix necesario fuera de `creative-lab/`:
`creative-engine/provider-manager/providers/simulated.provider.js` ahora
usa la foto real del producto si se le pasa (antes solo generaba el
placeholder abstracto) — mismo mecanismo que ya tenía el equivalente de
`marketing-engine/`, solo que nunca se había portado a `creative-engine/`
porque hasta ahora nada consumía el asset generado de verdad.

**Verificado**: 2 bugs visuales reales encontrados y corregidos durante
la verificación (botón CTA sin estilo por CSS no declarado; título
solapando el producto en 2 de los 6 arquetipos por falta de margen) —
detectados mirando las imágenes generadas, no solo el código. Extremo a
extremo con el Ventilador Muvip real: el concepto ganador
(`diagonal-dinamica`) seleccionó automáticamente el arquetipo
`diagonal-dinamico` — la decisión de Creative Lab por fin se refleja en
la pieza final. Regresión de `marketing-engine/` y del resto de
`creative-engine/` sin cambios, independencia intacta.

**Quién decide**: propietario (eligió explícitamente la opción de mayor
alcance tras comparar ambas).

**Reversibilidad**: alta — módulo aditivo dentro de `creative-lab/`, un
único fichero fuera tocado (`simulated.provider.js`, cambio aditivo:
antes solo placeholder, ahora placeholder O foto real).

---

### 2026-07-26 — Precio/contacto reales en la pieza final + primera activación de la memoria de Creative Lab

**Contexto**: tras ver la pieza compuesta con foto real (sprint anterior),
el propietario pidió un "producto terminado, sin placeholder" con precio
(89,00€), redes e "contacto de Ofipapel" — dando por hecho que esos datos
ya estaban fijados en algún sitio. Búsqueda en `brand-kit.json`/HTML
principales: nada. Búsqueda ampliada en `design-studio/templates/`: sí
existían teléfono/WhatsApp y dirección reales, hardcodeados en las
plantillas de la campaña "Vuelta al Cole" (sesión anterior, no esta
conversación como creía el propietario) — nunca Instagram/Facebook
(confirmado por grep, cero coincidencias en todo el repo). Se preguntó
antes de fabricar nada; el propietario confirmó: solo iconos genéricos de
Facebook/Instagram (sin handles reales) + web `ofipapel.net` (dato nuevo).

**Decisión**: promover teléfono/dirección a `design-studio/brand-kit.json#ofipapel.contact`
(fuente única de verdad, en vez de quedar atados a una sola plantilla de
campaña) junto con `website`/`socialIcons` recién confirmados. `copy.price`
se añade como campo aditivo (`maybe('string')`) en `CreativeBrief` — dato
de negocio que ningún agente de `marketing-engine/` produce, así que solo
llega como override explícito, nunca inferido. `layout-composer/` pinta
ambos en los 6 arquetipos vía dos helpers nuevos en `_shared.js`
(`priceBadge`, `contactFooter` con iconos SVG inline — sin red externa).

Además, se activó por primera vez el mecanismo de "memoria" documentado
pero nunca invocado de `reference-library/registerEntry()`:
`reference-library/import-from-campaign.js#importFromCampaign()` lee el
concepto ganador ya guardado por `creative-assets/store.js` y registra una
entrada real (`sourceType: 'campana-propia'`) — la campaña Ventilador
Muvip con foto lifestyle real es la entrada #16 (las 15 anteriores eran
semilla textual). Verificado que `findRelevantReferences()` ya la
devuelve para briefs futuros de electrodomésticos/hogar.

**Alternativas descartadas**: inventar redes/contacto para no interrumpir
al propietario (descartado explícitamente — viola la regla de no fabricar
datos de negocio, ya establecida y reafirmada en esta misma sesión);
automatizar por completo el registro de referencias sin curación humana
(descartado — `whatMakesItSpecial`/`whyItWorksOnSocial` están documentados
desde el principio como juicio cualitativo no automatizable).

**Quién decide**: propietario (confirmó precio, alcance de redes/contacto
y web tras la pregunta explícita de Claude).

**Reversibilidad**: alta — todos los cambios son aditivos (nuevo bloque en
`brand-kit.json`, campo `maybe()` en el contrato, helpers nuevos, un
fichero nuevo en `reference-library/`); ninguna interfaz existente cambia
de forma incompatible.

---

### 2026-07-26 — Aclaración explícita: la campaña Muvip NO demuestra generación real de imágenes; el objetivo principal sigue abierto

**Contexto**: tras la entrada anterior (precio/contacto + primera
activación de memoria), el propietario pidió dejar constancia expresa de
un matiz importante que la redacción de esa entrada y de
`creative-lab/ARCHITECTURE.md` no distinguía con suficiente claridad: la
fotografía principal de la pieza "Ventilador Muvip" fue **aportada
manualmente por el propietario** (subida como imagen, convertida a data-URL
y usada tal cual por `simulated.provider.js` — sin ningún modelo de IA de
por medio, ver `useRealPhoto()` en ese fichero). Creative Lab decidió el
concepto/arquetipo/layout y compuso precio+contacto alrededor, pero **no
generó** la fotografía en sí. Ningún proveedor real de generación de
imágenes está conectado hoy (`OPENAI_API_KEY` sigue sin definir en este
entorno — ver `FIRST_REAL_GENERATION.md`, sección "Limitaciones
actuales"), así que esta pieza no es evidencia de que el sistema pueda
producir fotografía de nivel similar sin depender de una imagen
proporcionada por el usuario.

**Decisión**: registrar explícitamente que **el objetivo principal del
proyecto no se considera resuelto** hasta que Creative Lab demuestre
generar, con un proveedor de IA real (`openai-images` u otro), imágenes de
calidad equivalente sin foto de partida aportada por el usuario. Se añade
`RT-09` en `ROADMAP_TECNICO.md` como el ítem técnico que representa
formalmente este objetivo pendiente, y se matiza la fila de Creative Lab
en `INVENTORY.md` y las secciones correspondientes de
`creative-engine/creative-lab/ARCHITECTURE.md`/`README.md` para que
ninguna sesión futura interprete la campaña Muvip (o cualquier pieza que
use `simulated.provider.js` con foto real del usuario) como prueba de
generación de imágenes por IA.

**Alternativas descartadas**: dejar el matiz solo en la conversación con
el propietario sin registrarlo en la documentación persistente
(descartado — es exactamente el tipo de ambigüedad que
`.claude/rax/` existe para prevenir entre sesiones, y `project-manager` lee
`INVENTORY.md`/`ROADMAP_TECNICO.md` al empezar cada sesión).

**Quién decide**: propietario, explícitamente.

**Reversibilidad**: alta — cambios puramente documentales, ningún fichero
de código tocado en esta entrada.

---

### 2026-07-26 — Sprint "Layout Intelligence": composición calculada y puntuada, cero coordenadas fijas

**Contexto**: `layout-composer/archetypes/*.js` posicionaba cada
elemento con porcentajes escritos a mano por plantilla (6 arquetipos
fijos). El propietario pidió que, antes de generar cualquier HTML, el
sistema calcule una composición completa (grid, jerarquía visual,
tamaños relativos, márgenes, espacios en blanco, reglas de equilibrio) y
la puntúe — descartando y probando otra si no supera un umbral, sin
coordenadas fijas en ningún punto.

**Decisión**: nuevo módulo `creative-engine/creative-lab/layout-intelligence/`
(grid + jerarquía + 6 estrategias de equilibrio + puntuación en 5
componentes + umbral/reintento acotado, mismo patrón exacto que
`QUALITY_THRESHOLD`/`MAX_RETRIES` de `runCreativeLab`). `layout-composer/`
se reduce a orquestar esa geometría ya resuelta y renderizarla —
`archetypes/*.js` (los 6 ficheros con posiciones fijas) se elimina por
completo, sustituido por `strategies/` (geometría) + un único
`render-plan.js` (HTML/CSS a partir de cajas ya calculadas).

Se escribió un test sintético directo sobre `planLayout()` (15
composiciones × 4 formatos reales) ANTES de tocar el renderer, y encontró
3 bugs reales corregidos antes de dar el sprint por bueno: (1)
`brief.artDirection.hierarchy` se interpretó primero como ranking de
TAMAÑO cuando en realidad es orden de LECTURA (verificado contra los 2
presets reales de `agents/02-director-arte`) — el logo salía más grande
que el producto; (2) el badge de precio podía solaparse con el hero
cuando su tier propio era más alto que el de la cabecera; (3) el rango
"sano" de contraste de jerarquía estaba mal calibrado contra la propia
geometría del sistema. Un cuarto bug (título blanco casi invisible sobre
el fondo claro de marca) se encontró mirando el PNG real de la campaña
Muvip re-ejecutada de punta a punta — mismo criterio de "verificar
visualmente, no solo que no lance excepción" ya aplicado en sprints
anteriores.

**Alternativas descartadas**: mantener `layout-composer/` decidiendo
posiciones directamente con una función de cálculo interna, sin un
módulo separado (descartado — mezclaría "calcular composición" con
"renderizar HTML", y rompería el patrón ya establecido en el repo de
separar generación/evaluación en módulos hermanos, como
`concept-generator/`+`concept-score/`).

**Quién decide**: propietario (especificación explícita del sprint:
grid, jerarquía, tamaños relativos, márgenes, espacios en blanco,
reglas de equilibrio, puntuación antes de renderizar, descarte si no
supera el umbral — todos los puntos incorporados literalmente).

**Reversibilidad**: media — módulo nuevo aditivo, pero `archetypes/*.js`
se eliminó (recuperable del historial de git si hiciera falta). La firma
pública de `layout-composer/service.js#composeLayout()` no cambió, así
que `creative-lab/index.js` solo necesitó actualizar los nombres de los
campos que expone (`archetype` → `strategyId`, más `layoutScore`/
`layoutAttempts`/`layoutPassed` nuevos).

---

### 2026-07-26 — Sprint "Art Direction Engine": criterio de diseño antes de calcular el grid

**Contexto**: tras "Layout Intelligence" el propietario fue explícito en
que no bastaba — pidió un cambio de paradigma, no una evolución: "no
falla el código, no falla el grid, falla el criterio visual". Instrucción
directa de implementar sin preguntar ni proponer alternativas, con
prioridad absoluta en calidad visual sobre cualquier otra cosa.

**Decisión**: nuevo módulo `creative-engine/creative-lab/art-direction-engine/`,
ejecutado ANTES de Composition Engine (`layout-intelligence/`, que ahora
obedece sus decisiones en vez de decidir solo desde `compositionId`) —
15 patrones editoriales (`patterns.js`, reglas de composición inspiradas
en publicidad premium real — Apple, Nike, Muji, IKEA, retail de lujo —
nunca coordenadas ni campañas copiadas), selección determinista
(`selectPattern`), recorte real de elementos prescindibles
(`decideElements` — "si un elemento no aporta valor, se elimina"), e
Icon Library (`icons.js`, ~14 iconos con trazo/tamaño/espaciado
idénticos, seleccionados solo si hay palabras clave reales en el texto
del brief — nunca relleno). `layout-composer/render-helpers.js` se
reescribe para eliminar la placa blanca con sombra pesada del hero y la
tarjeta del logo — prohibidas explícitamente por el propietario.

Al conectar el módulo, un barrido sintético de los 15 patrones × 3
formatos reales encontró 2 bugs geométricos reales antes de dar el
sprint por bueno: el check de espacio en blanco reprobaba SIEMPRE los
patrones de foto a sangre completa (la métrica no puede ver "dentro" de
una foto, solo huecos entre cajas) y una fila de iconos podía solaparse
con el footer de contacto en estrategias con apilado anclado al fondo.
Ambos corregidos (ver `creative-engine/creative-lab/ARCHITECTURE.md`,
sección del sprint).

**Regla protegida explícita**: `hero`, `price` y `contactFooter` nunca
se recortan, aunque un patrón sea muy minimalista — son contenido de
negocio ya exigido por el propietario en el sprint de "precio y contacto
reales" (2026-07-26, entrada anterior). La eliminación agresiva de este
sprint se aplica solo al chrome visual (cta/logo/título/iconos), nunca a
ese contenido — reconciliación explícita entre dos instrucciones del
mismo propietario en sprints distintos, documentada para que no se lea
como una contradicción.

**Verificación**: campaña real del Ventilador Muvip regenerada de punta
a punta y comparada visualmente contra la pieza del sprint anterior — la
foto pasa de ir en una placa central a ocupar el 100% del encuadre
(patrón "Lifestyle Premium", elegido por tener fotografía real +
`campaignType:'Lifestyle'`), aparecen 3 iconos técnicos reales
(potencia/nebulización/mando, extraídos del texto real del producto), y
el CTA se descarta solo por no aportar valor en una pieza foto-dominante.
Score de composición 87/100 (excelente) al primer intento. Regresión
completa sin cambios de comportamiento en el resto del repo.

**Quién decide**: propietario — especificación explícita y exhaustiva
del sprint (15 patrones nombrados, reglas de eliminación, comportamiento
de iconos con referencias de marca reales, prohibición explícita de
cajas/tarjetas), instrucción de implementar directamente sin ciclo de
aprobación.

**Reversibilidad**: media — mismo patrón que el sprint anterior: módulo
nuevo aditivo, `layout-composer/service.js#composeLayout()` mantiene su
firma pública (añade campos nuevos: `patternId`, `patternLabel`,
`droppedElementIds`), pero el estilo visual de `render-helpers.js`
cambió de forma sustancial (placas/tarjetas eliminadas) — revertible
desde el historial de git si hiciera falta, no desde una variable de
configuración.

---

### 2026-07-26 — Sprint "Design Director Engine": crítica de dirección de arte, no más código de layout

**Contexto**: instrucción explícita del propietario de dejar de tocar el
código del layout y mejorar el CRITERIO de evaluación — una revisión
final, posterior a Art Direction Engine y Composition Engine, con 14
criterios de crítica real de dirección de arte (impacto visual,
equilibrio, tensión visual, ritmo, respiración, punto focal, legibilidad,
recorrido visual, tamaño relativo, espacio negativo, elegancia, limpieza,
sensación premium, percepción comercial), rechazo automático de
composiciones que "parezcan plantilla", y reintento hasta un umbral de
calidad. Sin preguntar ni proponer alternativas, implementación directa.

**Decisión**: nuevo módulo `creative-engine/creative-lab/design-director/`,
posterior a Composition Engine. Los 14 criterios son heurísticas
geométricas deterministas (sin proveedor de IA con visión conectado,
mismo caveat de RT-09) que reutilizan al máximo `layout-intelligence/grid.js`
en vez de duplicar matemática. Dos vetos duros que descalifican sin
importar la puntuación agregada (mismo mecanismo que
`concept-generator/self-critique.js`): "el título nunca puede competir
con el producto" (área del título ≥ área del hero) y "parece plantilla
automática" (estrategia más neutra + centrado + sin recurso editorial).
El bucle de reintento (`layout-composer/service.js#reviewLoop`) pide a
Art Direction Engine un patrón editorial genuinamente distinto
(`excludePatternIds`) cuando no aprueba — `art-direction-engine/service.js#selectPattern`
se amplía para soportarlo.

Dos hallazgos reales antes de dar el sprint por bueno, ambos documentados
en `creative-engine/creative-lab/ARCHITECTURE.md`: (1) el umbral del veto
"parece plantilla" (0.06) era inalcanzable — ni el caso más plantilla
posible lo disparaba, porque un apilado centrado real tiene ~20% de
desviación de centroide de forma estructural; corregido a 0.22,
verificado que ahora sí atrapa el caso sintético neutro. (2) la primera
versión de `reviewComposition()` puntuó la campaña real del Ventilador
Muvip (la misma que salió "espectacular" en el sprint anterior) con solo
69/100 — 4 fórmulas mal calibradas (equilibrio demasiado estricto para
estilos asimétricos por diseño, respiración/espacio negativo sin
reconocer que los patrones full-bleed eligen margen mínimo a propósito,
elegancia/sensación premium penalizando desde 3 elementos cuando 5 es el
suelo realista con hero/precio/contacto protegidos) — recalibradas contra
la propia campaña real, que pasó a 83/100 sin cambiar ni un píxel del
layout.

**Verificación**: campaña real re-ejecutada de punta a punta — Design
Director Engine aprueba con 92/100 (excelente) al primer intento,
confirmando que la decisión del sprint anterior ya era sólida. Camino de
rechazo verificado forzando un umbral imposible
(`CREATIVE_LAB_DESIGN_QUALITY_THRESHOLD=999`): el sistema agotó los
reintentos probando patrones distintos y devolvió honestamente el mejor
visto, sin bloquear. Regresión completa sin cambios de comportamiento.

**Quién decide**: propietario — especificación explícita y exhaustiva
(14 criterios nombrados, reglas duras de producto/título/precio,
referencias de campañas premium reales como inspiración de principios,
no de copia), instrucción de implementar sin ciclo de aprobación.

**Reversibilidad**: alta — módulo nuevo aditivo, ningún fichero de
`art-direction-engine/` ni `layout-intelligence/` pierde su
comportamiento por defecto (el bucle de revisión es la única llamada
nueva en `layout-composer/service.js#composeLayout`); revertible desde
el historial de git.

### 2026-07-26 — Sprint "Design Evolution v2": Editorial Design Engine + Component Library + 2 patrones nuevos

**Contexto**: instrucción explícita del propietario de ejecutar tres
sprints CONSECUTIVOS, sin pausa ni aprobación intermedia salvo conflicto
arquitectónico grave: (1) un motor exclusivamente de decisión editorial
(romper simetría, solapes deliberados, sangre de canvas, bandas de
color) — "no renderiza, no genera imágenes, no calcula geometrías"; (2)
una biblioteca de componentes premium con múltiples variantes reales por
tipo, "nunca repetir siempre la misma"; (3) que el motor deje de pensar
en bloques verticales, con composición inteligente y patrones
editoriales nuevos (Amazon Premium, MediaMarkt Editorial entre otros).
Reutilizar toda la arquitectura existente, cero duplicidades, cero deuda
técnica, todo documentado e integrado en el pipeline actual, y al
finalizar generar campañas de prueba con productos distintos comparando
antes/después.

**Decisión**: `creative-engine/creative-lab/editorial-design-engine/`
(nuevo, entre Art Direction Engine y Composition Engine) produce una
`EditorialDecision` a partir del patrón/alineación ya elegidos —
`layout-intelligence/` la consume vía nuevas funciones puramente
aditivas (`strategies/_shared.js#offsetColStart`, `service.js#applyCanvasBleed`
/`applyColorBand`/`applyDeliberateOverlap`) sin reescribir ninguna
estrategia existente. `creative-engine/creative-lab/component-library/`
(nuevo) da 2-4 variantes reales a 9 tipos de componente, seleccionadas
por hash determinista (mismo patrón `hashString` ya usado en
`art-direction-engine/` y `concept-generator/`, deliberadamente
duplicado en vez de crear un util compartido de 3 líneas) —
`layout-composer/render-helpers.js` deja de tener un único tratamiento
visual posible por elemento y delega en ella. `art-direction-engine/patterns.js`
pasa de 15 a 17 patrones (`amazon-premium`, `mediamarkt-editorial`), ya
referenciados de antemano en `editorial-design-engine/config.js` como
referencia hacia delante intencionada. El solape deliberado de
Editorial Design Engine (`allowOverlap`) se propaga a
`design-director/criteria.js#limpieza` reutilizando (no duplicando)
`balance-score.js#isAllowedOverlap`.

Verificar los 2 patrones nuevos contra las 6 estrategias (heroes de
hasta 0.86 de ancho de columna) sacó a la luz **tres bugs reales
preexistentes al sprint**, documentados con detalle en
`creative-engine/creative-lab/ARCHITECTURE.md` ("Bugs reales encontrados
y corregidos"): (1) el badge de precio se solapaba sin declarar con
heroes anchos y centrados (`product-first`, `apple-style`,
`hero-product`, `premium-retail`, `luxury-catalogue`, y el nuevo
`amazon-premium`) — corregido convirtiéndolo en un badge consciente del
hero real, con fallback a un badge pequeño explícitamente marcado
(`overlaysHero:true`, mismo lenguaje que un precio superpuesto en retail
real) cuando no hay hueco; (2) el apilado vertical de 3 de las 6
estrategias podía invadir el footer de contacto (solo
`cinematico-fullbleed` reservaba esas filas) — corregido generalizando
`footerReservedRows` a las otras 3; (3) la banda de color quedaba
invisible detrás de un hero a sangre completa por compartir `z-index`
— corregido subiéndola de nivel. Los tres se verificaron con el mismo
producto/pipeline real que los expuso, antes y después del fix.

**Verificación**: `node --check` en todos los ficheros nuevos/tocados ·
independencia `creative-lab/`↔`marketing-engine/` intacta · determinismo
(20 iteraciones, mismo resultado) · barrido sintético 17 patrones × 6
estrategias sin `NaN` ni caja fuera de canvas · pipeline real completo
con la foto real del Ventilador Muvip → 92/100 (excelente), sin
regresión frente al sprint "Design Director Engine" · dos campañas
adicionales con productos distintos (silla de oficina, auriculares
Bluetooth) confirman que el sistema no rompe con categorías nuevas y
sigue siendo honesto cuando no alcanza el umbral · comparación visual
antes/después forzando `nike-style` y `mediamarkt-editorial` sobre la
misma foto real: tensión asimétrica, solape deliberado, sangre de canvas
y banda de color — salto visual evidente frente al `cinematico-fullbleed`
centrado sin recursos editoriales que producía el sistema antes de este
sprint.

**Quién decide**: propietario — misión de tres sprints especificada
explícitamente, con instrucción de ejecutar sin pausa ni aprobación
intermedia.

**Reversibilidad**: alta — `editorial-design-engine/` y
`component-library/` son módulos nuevos aditivos (todo consumidor
existente sigue funcionando sin ellos si se pasa `undefined`), los 2
patrones nuevos son entradas más en un array ya existente, y los tres
fixes de bugs son correcciones acotadas en funciones ya existentes
(`topRightCorner`, `stackVertically`, `decorationMarkup`); revertible
desde el historial de git.

### 2026-08-01 — Sprint "Cierre de arquitectura", Fase 3: las 4 familias oficiales de plantilla

**Contexto**: el propietario cerró formalmente la fase de arquitectura del
ecosistema con una misión de 6 fases (auditoría → congelar arquitectura →
registrar 4 plantillas maestras a partir de 4 imágenes de referencia
reales → terminar el "cerebro" de selección automática → dejar el
proveedor OpenAI listo sin conectar → informe final), con la regla
explícita de detenerse y proponer una única alternativa si alguna
instrucción contradecía la simplicidad/modularidad/reutilización del
sistema, y ejecutar sin preguntar en cualquier otro caso.

**Flag levantado antes de implementar (Fase 3↔Fase 4)**: guardar las 4
imágenes de referencia como ficheros HTML sueltos en `design-studio/`
(lectura literal de la Fase 3) las habría dejado inservibles para la Fase
4, porque `design-studio/templates/` no tiene ningún mecanismo de
parametrización — nada ahí puede ser "elegido" por un selector automático.
El sistema que sí es real, parametrizado y ya está integrado en el
pipeline (`layout-intelligence`/`design-director`/`layout-composer`) es
`art-direction-engine/patterns.js` (18 patrones editoriales con reglas,
no coordenadas). Alternativa única propuesta y ejecutada: las 4 familias
oficiales se registran como una capa de agrupación sobre los patrones ya
existentes (`officialFamily` en cada patrón), nunca como un quinto sistema
paralelo — la Fase 4 seleccionará una familia (nunca inventará una
quinta) y, dentro de ella, el motor de selección por tags ya existente
(`selectPattern()`) elige el patrón concreto, sin tocar esa lógica.

**Qué se implementó**:
1. `patterns.js`: campo `officialFamily` añadido a los 17 patrones
   existentes (Lifestyle: `nike-style`, `ikea-lifestyle`,
   `lifestyle-premium` · Premium Editorial: `magazine-editorial`,
   `luxury-minimal`, `apple-style`, `muji-style`, `negative-space`,
   `asymmetric-editorial`, `luxury-catalogue` · Comercial: `hero-product`,
   `product-first`, `swiss-grid`, `poster-design`, `premium-retail`,
   `amazon-premium`, `mediamarkt-editorial`), más `OFFICIAL_FAMILIES` y
   `patternsByFamily()` exportados para que la Fase 4 los consuma.
2. Patrón nuevo `problema-solucion` (familia Problema-Solución): ninguno
   de los 17 patrones previos representaba honestamente un anuncio de
   "nombra la molestia, entrega el alivio" — se añadió como entrada 18 del
   mismo array, reutilizando `heroTreatment:'large-borderless'` y las
   estrategias `dividido-lifestyle`/`diagonal-dinamico` ya existentes
   (nunca un `heroTreatment` ni una estrategia de layout nuevos — el
   renderizador de hoy solo soporta una foto hero, así que esta familia
   se expresa con jerarquía de texto molestia→alivio, no con un
   verdadero split de dos fotografías, que sí sería una capacidad nueva
   de `asset-pipeline`/`layout-composer` no construida aquí).
3. `design-studio/OFIPAPEL_VISUAL_DNA.md`: capítulo 12 nuevo ("Familias
   Oficiales de Plantilla"), documentando las 4 familias (cuándo
   usarla/cuándo no/objetivo comercial/personalidad/estructura/grid/
   jerarquía/pesos visuales/restricciones/errores prohibidos/checklist),
   con las cifras de cada familia calculadas del rango real de sus
   patrones (no inventadas aparte) — el código sigue siendo la fuente
   ejecutable, este capítulo es su traducción legible.
4. `.claude/rax/INVENTORY.md`: fila de Creative Lab actualizada (17→18
   patrones, referencia a las 4 familias).

**Verificación**: `node --check` en `patterns.js` · barrido de
`directArt()`/`selectPattern()` (30 iteraciones con brief sintético)
confirma que todo `patternId` devuelto sigue siendo válido y que la
selección sigue siendo determinista · comprobación de recuento (17+1=18
patrones, cada uno con `officialFamily`, la suma por familia cuadra con
el total) · invariante de independencia `grep -rn "marketing-engine"
creative-engine/` sigue en cero `require()` · ningún otro módulo
(`editorial-design-engine/config.js`, `component-library/`,
`design-director/`) tiene listas de patrones por nombre que necesitaran
actualizarse para el patrón nuevo — `problema-solucion` recibe
tratamiento por defecto (sin solape/sangre/banda de color) hasta que se
pruebe en producción, documentado como estado real en el propio capítulo
12 en vez de fingir que ya está validado.

**Quién decide**: propietario — misión de 6 fases especificada
explícitamente, con la regla de detenerse solo ante contradicciones reales
de arquitectura (una ya detenida y resuelta arriba) y ejecutar sin
preguntar en cualquier otro caso.

**Reversibilidad**: alta — todo lo añadido es aditivo sobre un array y un
documento ya existentes (un campo nuevo por objeto, una entrada nueva en
el array, un capítulo nuevo al final del documento); ningún consumidor
existente de `patterns.js` cambia de comportamiento, revertible desde el
historial de git.

### 2026-08-01 — Sprint "Cierre de arquitectura", Fase 4: selección real de familia (sin tocar el modo shadow)

**Contexto**: Fase 4 pide que categoría y objetivo se "clasifiquen
automáticamente" y que esa clasificación conduzca la selección de una de
las 4 familias oficiales. Antes de implementar se verificó de dónde viene
hoy cada señal: `job.input.category` es directo (elegido por quien crea
la campaña, nunca inferido), y `brief.campaign.objective` en
`creative-engine` ya se alimenta de
`marketing-engine/intelligence/campaign-recommender` — un dato importante
descubierto al revisar `creative-engine/brief/from-marketing-engine.js`:
ese puente (sprint "Primera generación real", 2026-07-25) ya trata la
`recommendation` de `campaign-recommender` como una entrada real para la
generación creativa, no como una comparación en shadow — el modo shadow
(`marketing-engine/intelligence/README.md`) protege específicamente que
`job.input` del pipeline de `marketing-engine` (`postType`/`tone`/
`channel` que deciden los 8 agentes) no se sobrescriba sin permiso, no la
salida de `campaign-recommender` en sí, que YA es un input legítimo del
lado de `creative-engine` desde antes de esta sesión. Extender esa señal
no revierte ninguna promesa de shadow mode.

**Qué se implementó**:
1. **Objetivo nuevo `resolver-problema`** (único genuinamente nuevo de los
   6 que nombró el propietario — los otros 3, "posicionar marca",
   "destacar una innovación" y "promocionar una oferta", ya tenían un
   valor real y suficientemente cercano: `minimalista`, `sorprender` y
   `vender`+`categoria:oferta`; añadir sinónimos sin una señal real que
   los distinga habría sido duplicar sin motivo). Añadido a los dos
   enums reales (`marketing-engine/intelligence/contracts.js#OBJECTIVE`,
   `marketing-engine/core/contracts/job.contract.js#JOB_INPUT_SHAPE.objective`)
   y a las 3 tablas de configuración que ya listaban los otros 4 valores
   (`campaign-recommender/config.js#STYLE_BY_OBJECTIVE`/`CTA_BY_OBJECTIVE`,
   `agents/01-director-creativo/config.js#OBJECTIVE_TONE_MAP`).
2. **Señal real, no inventada**: `campaign-recommender/service.js#resolveObjective`
   ahora comprueba `productProfile.strategyAffinity.includes('Problema →
   Solución')` — un dato que `product-intelligence/config.js` ya
   declaraba para `electrodomesticos` desde julio sin que nada lo
   consumiera. Se comprueba después del evento estacional (una fecha
   límite activa sigue mandando) y antes de la rama técnica/ticket-alto.
   Verificado con `recommend()` aislado (sin evento estacional activo):
   devuelve `resolver-problema` con razón explícita.
3. **`art-direction-engine/service.js#selectPattern`**: bonus de
   puntuación (+12, mismo mecanismo que el bonus de +8 ya existente para
   `lifestyle`) cuando `brief.campaign.objective === 'resolver-problema'`
   y `pattern.officialFamily === 'Problema-Solución'` — nunca una
   selección forzada, un refuerzo más en la misma suma. Verificado: 12/12
   ejecuciones con ese objetivo eligen `problema-solucion`; sin él, el
   patrón ganador cambia a uno de otra familia con mejor encaje por tags.
4. **Briefing y prompt de OpenAI Images**: ya estaban completos de
   extremo a extremo desde sprints anteriores (concept-generator →
   master-prompt-composer) — Fase 4 no necesitaba construir nada nuevo
   aquí, solo confirmarlo (hecho, sin cambios de código).

**Gap real, documentado en vez de fingido**: los pasos "revisar la imagen
generada usando el ADN Visual" y "regenerar si falla" (Fase 4, puntos 8-9)
siguen sin poder construirse honestamente hoy — el pipeline no tiene
ningún modelo de visión conectado (`creative-validator/service.js` ya
documentaba esto: todos sus checks son `evaluatedOn:'plan'`, `'pixel'` es
un valor futuro sin implementación). Construir un chequeo de dimensiones
de fichero PNG habría sido una implementación hueca que no cumple lo que
pide realmente el propietario ("usando el ADN Visual" implica juicio
semántico: posición del logo, tamaño del precio, tipografía única — no
solo que el fichero tenga el ancho correcto). Queda documentado como el
gap real para el informe de Fase 6, no resuelto con una implementación de
relleno.

**Verificación**: `node --check` en los 6 ficheros tocados · barrido de
regresión (`directArt()`, 5 objetivos × 6 categorías × 3 repeticiones = 90
combinaciones) sin `NaN` ni excepción · pipeline real completo (Calefactor
Cerámico, categoría electrodomésticos) confirma la cadena categoría→
objetivo real→bonus de familia→patrón, con el matiz correcto de que un
evento estacional activo (verano-canario, activo en la fecha de esta
sesión) sigue teniendo prioridad sobre la nueva rama, tal como decide la
función ya existente · invariante de independencia
`creative-engine/`↔`marketing-engine/` intacto.

**Quién decide**: propietario — misma misión de 6 fases, regla de
detenerse solo ante contradicciones reales (ninguna nueva detectada en
este incremento, ver arriba por qué el puente `campaign.objective` no
cuenta como una) y ejecutar sin preguntar en cualquier otro caso.

**Reversibilidad**: alta — un valor nuevo en dos enums ya existentes,
cuatro entradas nuevas en tablas de configuración ya existentes, una rama
nueva en una función ya existente y un bonus más en una suma ya
existente; ningún valor ni comportamiento previo cambia, revertible desde
el historial de git.

### 2026-08-02 — DT-17: `marketing-engine-run` pasa a Background Function + polling

Fase 7 ("Conexión OpenAI") terminó de verificarse en producción real tras
DT-16: los logs reales de `marketing-engine-run` mostraban ejecuciones de
36-39s con memoria 700-770MB y **sin ningún error** — el pipeline completo
(OpenAI Images + render de Chromium + composición de `creative-lab`)
generaba la pieza final correctamente. Pero el cliente (`curl` del
propietario) recibía siempre un `504 Inactivity Timeout` de Netlify.

Diagnóstico confirmado con logs reales, no solo con curl: el límite de
~26s del proxy síncrono que da la cara al cliente en las funciones
normales de Netlify es independiente y más corto que el límite de
ejecución de la propia función Lambda (que sí permite hasta 60s) — la
función termina bien, pero la conexión con el cliente ya se cortó antes.
Ya se había reducido todo lo posible en el sprint anterior
(`CREATIVE_LAB_SHORTLIST_SIZE=1`, `MAX_RETRIES=1`,
`OPENAI_IMAGES_QUALITY=low`) sin bajar de los 36-39s reales — no hay
margen de optimización adicional dentro del pipeline que resuelva esto:
es un límite de la plataforma, no un bug de código.

**Decisión**: separar la ejecución de la entrega del resultado.
`netlify/functions/marketing-engine-run-background.js` es una copia del
pipeline de `marketing-engine-run.js` con sufijo `-background`
(convención de Netlify: se ejecuta de forma asíncrona, responde 202 al
cliente de inmediato, corre hasta 15 min sin el límite de 26s). El
resultado final se escribe en Netlify Blobs (`@netlify/blobs`, nueva
dependencia de `netlify/functions/package.json`) bajo la clave
`trackingId` que el propio cliente genera y envía en el body — necesario
porque una Background Function no devuelve nada útil al cliente que la
llama. `netlify/functions/marketing-engine-status.js` (función síncrona
normal, sin el problema de tiempo porque solo lee Blobs) sirve el
resultado cuando esté listo, consultando esa misma clave.
`marketing-engine-run.js` (síncrona) se mantiene sin tocar para pruebas
rápidas con el proveedor `simulated` (sin llamada real a OpenAI, sí
termina dentro de los ~26s).

**Verificación**: `node --check` en los ficheros nuevos · `netlify.toml`
validado con `tomllib` · flujo completo probado en local con
`@netlify/blobs` mockeado (no existe contexto real de Blobs fuera de
Netlify) — `marketing-engine-run-background.js` ejecuta el pipeline
completo con el proveedor `simulated` y escribe primero `status:'running'`
y luego el resultado final `status:'completed'` con `renderedAsset`;
`marketing-engine-status.js` responde 400 sin `jobId`, 202
`not_found_or_running` para una clave inexistente, y 200 con el cuerpo
completo para una clave ya escrita. **Pendiente confirmar en producción
real** — mismo patrón de caveat que DT-16 hasta la verificación con
`ofipapel.netlify.app`, fuera del alcance de red de esta sesión.

**Quién decide**: propietario — autorización explícita a corregir
cualquier bloqueante real que impidiera "probar a generar" hoy, más allá
del encargo estrecho de Fase 7.

**Reversibilidad**: alta — dos ficheros nuevos, una dependencia npm
nueva, una sección nueva en `netlify.toml`; `marketing-engine-run.js`
original no se modifica.

### 2026-08-02 — FASE 8: Prompt Composer PRO (enriquecer, no duplicar)

Encargo del propietario: mejorar la calidad de imagen sin nueva
arquitectura ni tocar agentes/proveedor. `master-prompt-composer/` ya
ERA el último paso antes de llamar a OpenAI (compone el prompt justo
antes de `generateForConcept()` en `creative-lab/index.js`) — se
enriquece en el sitio, no se crea un módulo paralelo.

Hallazgo real durante la revisión: `provider.interface.js#adaptToCapabilities()`
descarta `negativePrompt` en silencio para cualquier proveedor con
`supportsNegativePrompt:false` (caso de `openai-images` — la API de
OpenAI no tiene ese parámetro). Las instrucciones negativas se
calculaban pero NUNCA llegaban a OpenAI en ninguna forma — coincide
exactamente con el texto alucinado/ilegible visto en las 3 generaciones
reales de hoy (DT-18) pese a que "texto renderizado o letras ilegibles"
ya estaba en la lista.

**Cambios**: `master-prompt-composer/service.js` ahora incrusta
`negativePrompt` dentro del propio `fullPrompt` (única vía que llega
siempre a cualquier proveedor); `sections/from-concept.js` añade
`brief.product.description` (antes solo nombre+categoría) y
`brief.creativeDirection.graphicFamily` como ancla de consistencia.
`negativePrompt` se sigue devolviendo igual que antes (compatibilidad).

**Verificación**: `node --check` en los 2 ficheros · CLI real
(`run-creative-lab-demo.js --from-marketing-engine`, proveedor
`simulated`) — aprobado 100/100, prompt pasó de ~243 a 317 palabras,
confirmado en el JSON guardado que incluye descripción, familia
gráfica y la cláusula negativa al final · invariante de independencia
`creative-engine/`↔`marketing-engine/` intacto (`grep` solo comentarios)
· cero llamadas nuevas a OpenAI, cero cambios en agentes/proveedor/DT-10.

**Quién decide**: propietario, encargo explícito "FASE 8".

**Reversibilidad**: alta — 2 ficheros existentes tocados, ninguno nuevo.
