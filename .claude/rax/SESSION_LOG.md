# Historial de sesiones — RAX

Cada entrada: fecha, resumen (3-5 líneas), decisiones tomadas, siguiente
paso recomendado para la próxima sesión. Append-only.

---

### 2026-07-10 — Creación de la Skill `project-manager` y del sistema RAX

**Resumen**: no existía ninguna Skill versionada en el repo (`diseno-ofipapel`
solo vivía, si acaso, en local). Se estableció `.claude/skills/` como
ubicación canónica de Skills y `.claude/rax/` como memoria compartida del
ecosistema (inventario, roadmaps, deuda técnica, decisiones, integraciones).
Se creó la Skill `project-manager` como CTO/PM/coordinador. Se hizo una
primera pasada de inventario real del repo (6 proyectos activos + 2
implementaciones paralelas de WhatsApp) y se detectó y corrigió una deuda
técnica real (`.gitignore` de `joe-app/` ignoraba ficheros nuevos
silenciosamente).

**Decisiones tomadas**: ver `DECISIONES.md` (2026-07-10, dos entradas).

**Siguiente paso recomendado para la próxima sesión**: migrar
`diseno-ofipapel` desde la carpeta local a `.claude/skills/diseno-ofipapel/`
(RT-05) y decidir cuál de los dos agentes de WhatsApp (Meta vs Twilio) es
el canónico (RT-01) — ambos son de alto score y no dependen de más trabajo
técnico, solo de una respuesta del propietario.

---

### 2026-07-10 — Auditoría de valor real + consolidación de Skills + primera campaña

**Resumen**: el propietario pidió pasar de "construir arquitectura" a
"demostrar valor real", actuando como CTO. Auditoría completa del repo
(incluidas ramas sin PR) reveló que "RAX" existía como tres líneas de
trabajo divergentes sin fusionar, más hallazgos reales no documentados
antes: el botón de WhatsApp de Canarias INK apunta a un número placeholder
(`34600000000`), RLS está desactivado en las tablas de Supabase de `joe-app`
con grant total a `anon` (fix ya escrito en rama huérfana sin fusionar), y
`alquileres` no usa Supabase pese a declararlo como dependencia — 8
apartamentos reales dependen solo de `localStorage`. Se presentaron 10
mejoras priorizadas por impacto/riesgo/ROI. El propietario aprobó dos:
consolidar las ramas de Skills (esta entrada) y generar una campaña real de
"Vuelta al Cole" para validar el pipeline de diseño. RLS, instrumentación
del bot de WhatsApp y migración de `alquileres` quedan aplazadas
explícitamente hasta cerrar esta fase.

**Decisiones tomadas**: ver `DECISIONES.md` (2026-07-10, dos entradas
nuevas: consolidación de ramas y `sales-marketing` aparcado).

**Siguiente paso recomendado para la próxima sesión**: una vez revisada y
fusionada esta consolidación, retomar por orden de score: RLS en Supabase de
`joe-app` (18), instrumentación del bot de WhatsApp (18), corregir el número
de WhatsApp de Canarias INK (17) — todas requieren un dato o aprobación del
propietario que ya se pidió en la sesión anterior. Considerar también borrar
las ramas huérfanas ya consolidadas (`rax-project-manager-skill-1o2kl3`,
`rax-sales-marketing-skill-4raaru`) una vez este PR esté fusionado.

---

### 2026-07-12 — Sprint "RAX v1 Production"

**Resumen**: el propietario pidió un plan de despliegue para uso diario
(4 bloques: producción inmediata, configuración pendiente, validación,
métricas). Al preparar el plan se detectó que otra sesión en paralelo había
auditado y arreglado dos cosas reales en una rama huérfana sin fusionar
(proxy de IA de `Index.html`, migración de `alquileres` — pero a Supabase,
mientras que `main` ya había migrado el mismo módulo a Firebase de forma
independiente). El propietario aprobó: Firebase como backend definitivo de
`alquileres`, rescatar el proxy de IA como prioridad máxima, y continuar el
resto del Bloque 1 tomando las decisiones técnicas sin pausar salvo por
datos de producción, riesgo de pérdida de información o decisión de
negocio.

**Ejecutado**: rebase de la rama de trabajo sobre `main` actualizado;
proxy `chat-assistant.js` adaptado y fusionado; RLS real en Supabase
(`joe-app`) y reglas reales en Firestore (`alquileres`), ambos con sesión
anónima, código fusionado y build/lint verificados — pendiente solo de
activación en las consolas externas (fuera del alcance de este repo);
`index.html`/`Index.html` confirmado como no-problema por lectura de
código, sin necesidad de preguntar al propietario.

**No ejecutado, deliberadamente aplazado por falta de datos que solo tiene
el propietario**: número real de WhatsApp de Canarias INK, decisión del
canal de WhatsApp canónico (Meta vs Twilio), publicación de la campaña
"Vuelta al Cole" (depende de lo anterior), y la migración manual de datos
locales de `alquileres` en los dispositivos reales de Luis y Rober (acción
física que solo pueden hacer ellos).

**Decisiones tomadas**: ver `DECISIONES.md`, entrada 2026-07-12.

**Siguiente paso recomendado para la próxima sesión**: en cuanto el
propietario confirme el número de WhatsApp de Canarias INK y el canal
canónico, cerrar esos dos ítems y publicar la campaña. Recordar activar
"Allow anonymous sign-ins" (Supabase) y el proveedor "Anonymous" +
desplegar `firestore.rules` (Firebase) — sin eso, el blindaje de acceso
fusionado en este sprint no está realmente activo todavía.

---

### 2026-07-24/25 — Motor de Marketing con IA: construcción + integración con `app.html`

**Resumen**: sesión larga en dos fases. Fase 1 (2026-07-24): construcción
desde cero de `marketing-engine/`, un pipeline de 8 agentes con
responsabilidad única (Director Creativo → Director de Arte → Guardián de
Marca → Fotógrafo Publicitario → Especialista en Prompts → proveedor de
IA → Copywriter → Maquetador → Control de Calidad), sin dependencias npm,
con contratos propios por shape-checker, registro de proveedores (7
"planned" + `simulated` activo), y `brand-kit.json` como fuente de verdad
de marca verificada línea a línea contra el CSS real (se encontró y
corrigió una imprecisión heredada de un intento anterior no fusionado,
`sales-marketing`). Fase 2 (2026-07-25): integración de ese motor con
`app.html` (el panel de redes sociales — se detectó que ni `CLAUDE.md` ni
este inventario lo documentaban, corregido en la misma sesión), bajo el
principio explícito del propietario de que la app nunca debe implementar
lógica creativa propia. El propietario autorizó trabajo autónomo por el
resto de su lista de prioridades tras dar el objetivo, sin pausar salvo
decisión de arquitectura que comprometiera el proyecto — no surgió
ninguna.

**Ejecutado**: puente serverless nuevo
(`netlify/functions/marketing-engine-run.js`) + `netlify.toml` con
`included_files`; 3 bugs reales corregidos antes de construir el puente
(ruta de almacenamiento de jobs incompatible con `/tmp` de Lambda,
duplicada en dos escritores independientes; `metadata` sobrescrita en vez
de fusionada en el orquestador, que habría roto en silencio el paso de
fotos reales); 4 campos opcionales nuevos en `JOB_INPUT_SHAPE` consumidos
en un único punto (Director Creativo); proveedor `simulated` capaz de usar
una foto real de producto en vez de un placeholder abstracto; `app.html`
reescrito con `CampaignStore` como estado único compartido, Almacén como
centro de trabajo creativo (crear/aprobar/rechazar/editar) y Calendario
reducido a solo-organizar (se eliminó su capacidad de crear contenido).
Verificado de punta a punta con Playwright contra un servidor propio
mínimo (sin `netlify-cli`): crear campaña con foto real → pipeline
completo → aprobar → aparece en Calendario → programar, todo confirmado.
Documentado en `marketing-engine/ARCHITECTURE.md`,
`marketing-engine/INTEGRATION.md`, y en `CLAUDE.md`/`INVENTORY.md` (gap de
`app.html` y `marketing-engine/` corregido en ambos).

**No ejecutado, deliberadamente fuera de alcance por instrucción explícita
del propietario**: ningún proveedor de IA real (OpenAI Images, Canva,
Runway, Veo...) — sigue activo únicamente `simulated`. Tampoco se resolvió
el bloqueante de Playwright/Chromium en AWS Lambda real (el maquetador
solo se ha verificado en este sandbox de desarrollo, no en un despliegue
real de Netlify) — documentado como bloqueante conocido, no solucionado,
en `marketing-engine/INTEGRATION.md`.

**Decisiones tomadas**: ver `DECISIONES.md`, entradas 2026-07-24 y
2026-07-25.

**Siguiente paso recomendado para la próxima sesión**: cuando el
propietario quiera conectar el primer proveedor de IA real, seguir la guía
de `marketing-engine/INTEGRATION.md` ("Cómo sustituir `simulated` por un
proveedor real") — el punto de enganche ya está preparado y no requiere
tocar `app.html` ni el orquestador. Antes de cualquier despliegue real a
Netlify, resolver el bloqueante de Chromium en Lambda (empaquetar
`@sparticuz/chromium` o equivalente). Si se decide persistir
`CampaignStore` entre recargas, es un cambio ortogonal — hoy vive solo en
memoria del navegador, igual que el resto del estado de `app.html`.

---

### 2026-07-25 — `marketing-engine/intelligence/`: ventaja competitiva en Shadow Mode

**Resumen**: sprint nuevo, explícitamente distinto del anterior — el
propietario pidió dejar de añadir funcionalidad técnica y construir en su
lugar el conocimiento propio del sistema: cinco componentes (Product
Intelligence, Campaign Recommender, Creative Score, Variant Engine,
Learning Engine) que analizan cada producto, recomiendan un enfoque de
campaña con razones, puntúan el resultado 0-100, y preparan la estructura
para aprender de resultados reales — todo determinista, sin ningún
proveedor de IA conectado. Al conectarlo con el pipeline, el propietario
tomó la decisión de arquitectura central del sprint: la capa arranca en
**Shadow Mode** — analiza, recomienda y compara con la decisión real del
pipeline sin cambiar nunca esa decisión — y solo pasará a "Decision Mode"
(un interruptor de una variable de entorno) cuando se demuestre con datos
propios que sus recomendaciones son mejores o equivalentes.

**Ejecutado**: `marketing-engine/intelligence/` completo (product-
intelligence, campaign-recommender, creative-score, variant-engine,
learning-engine, más `contracts.js`, `mode.js`, `clock.js`, `index.js`);
dos costuras no bloqueantes en `core/orchestrator.js` (antes del primer
agente, después del último) envueltas en `try/catch`; un campo opcional
nuevo en `JOB_SHAPE`; `cli/run-intelligence.js` como demo; un bug real de
coherencia encontrado y corregido durante el desarrollo (objetivo y tipo
de campaña podían salir de dos señales de calendario distintas y
contradictorias); documentación completa (`intelligence/README.md`,
`ROADMAP_V2.md` con 4 fases a 12 meses, nueva sección en
`ARCHITECTURE.md`, actualización de `INTEGRATION.md`/`CLAUDE.md`/
`INVENTORY.md`). Verificado: determinismo byte a byte, razonamiento
estacional real (misma ficha, tres fechas, tres campañas distintas),
regresión completa del pipeline de 8 agentes sin ningún cambio de
comportamiento, y resiliencia ante un almacén de aprendizaje no
escribible.

**No ejecutado, deliberadamente fuera de alcance en este sprint**: activar
Decision Mode (ni siquiera parcialmente) — el propio propietario fue
explícito en que primero hay que demostrarlo. Exponer `job.intelligence`
en la respuesta de la función Netlify o en la UI de `app.html` — habría
sido la "nueva funcionalidad técnica" que el propietario pidió dejar de
añadir; queda para la Fase 1 de `ROADMAP_V2.md`. Registro automático de
resultados reales (clics, ventas) — no hay ningún disparador real todavía,
así que `recordOutcome()` existe y está probada pero nada la llama.

**Decisiones tomadas**: ver `DECISIONES.md`, entrada 2026-07-25 (Shadow
Mode).

**Siguiente paso recomendado para la próxima sesión**: cuando haya
volumen suficiente de campañas reales pasadas por el pipeline, revisar
`agreementRate` acumulado en `learning-engine/store.js#listRecords()` por
categoría — es la señal que decide si se activa Decision Mode (Fase 3 de
`ROADMAP_V2.md`), no una fecha en el calendario. Antes de eso, la Fase 1
(exponer la recomendación en el Almacén para que el propietario la vea
junto al resultado real) es la pieza que falta para que Shadow Mode
empiece a acumular comparaciones de campañas reales y no solo de
ejemplos de CLI.

---

### 2026-07-25 — `creative-engine/`: motor de generación de contenido, independiente

**Resumen**: mismo día, tercer sprint de arquitectura de la sesión. Con
`marketing-engine/intelligence/` ya construido en Shadow Mode, el
propietario pidió separar por completo el "pensar" del "crear" — nueva
carpeta de primer nivel `creative-engine/`, explícitamente independiente
de `marketing-engine/`, con 6 componentes (Provider Manager, Asset
Pipeline, Prompt Composer, Variant Generator, Creative Validator,
Creative Assets), solo arquitectura, sin conectar ningún proveedor de IA.
Un agente de planificación encontró antes de construir que
`marketing-engine/core/providers/` ya tenía 6 de los 8 proveedores
pedidos (mismos ids) — se resolvió declarando el nuevo registro de
`creative-engine/` como canónico y el de `marketing-engine/` como legado,
por escrito, en vez de dejar dos registros ambiguos.

**Ejecutado**: los 6 componentes completos (41 ficheros: DSL de
validación independiente, `CreativeBrief` + mapper puro desde
marketing-engine, 9 proveedores registrados con capacidades declaradas,
Asset Pipeline con dimensiones reales verificadas de `app.html` y
resolución posicional de paleta de marca, Prompt Composer modular de 9
secciones con orden y principio de "composición posterior" documentados,
Variant Generator con distinción forzada de prompts
(`assertDistinctPrompts`), Creative Validator con 6 checks y
`regenerationHints`, almacén de versiones con numeración correcta);
`index.js` como fachada única + CLI de demo; `ARCHITECTURE.md` (el
entregable explícito pedido) documentando la convivencia con
marketing-engine, los dos ejes ortogonales de variación, y cómo se
conectará después a OpenAI Images/Canva/vídeo. Un bug real encontrado y
corregido durante el desarrollo: `assertSupports` rechazaba de forma
dura cualquier campo que un proveedor no soportara (p. ej.
`negativePrompt` en `openai-images`, fiel a la API real), rompiendo el
pipeline entero pese a que Prompt Composer siempre genera uno —
separado en un requisito duro (`assertSupports`, solo `contentClass`) y
uno suave (`adaptToCapabilities`, descarta con aviso en vez de romper).
Verificado: independencia por grep, sintaxis de los 35 ficheros `.js`,
demo con los dos desenlaces del Validador, fallo de proveedor gestionado
con gracia, 10/10 variantes con prompts únicos, determinismo, y
regresión completa de `marketing-engine/` sin cambios.

**No ejecutado, deliberadamente fuera de alcance**: ningún proveedor de
IA real (ni siquiera parcialmente) — solo arquitectura, tal como se
pidió explícitamente. El cableado en vivo entre `creative-engine/` y
`marketing-engine/` (que algo llame a `runCreativePipeline` de verdad
desde el orquestador o desde una función Netlify) — el mapper existe y
está probado, pero nada lo invoca automáticamente todavía; es la
integración del sprint siguiente.

**Decisiones tomadas**: ver `DECISIONES.md`, entrada 2026-07-25
(`creative-engine/`).

**Siguiente paso recomendado para la próxima sesión**: cuando se decida
activar el primer proveedor real, seguir la guía de
`creative-engine/provider-manager/README.md` (un fichero + una línea) —
el punto de enganche ya está preparado y verificado con `simulated`. Si
se decide conectar los dos motores en vivo, `brief/from-marketing-engine.js`
ya define el mapeo exacto; falta decidir desde dónde se llama
(¿`core/orchestrator.js` de marketing-engine, o una función Netlify
nueva que orqueste ambos?) — es una decisión de arquitectura real, no
solo de código, y debería plantearse explícitamente al propietario antes
de construirla.
