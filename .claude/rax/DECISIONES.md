# Decisiones — RAX

Registro append-only. No se edita retroactivamente una entrada ya escrita;
si una decisión se revierte, se añade una entrada nueva que referencia a la
anterior por fecha.

---

### 2026-07-10 — Ubicación canónica de las Skills: `.claude/skills/`

**Contexto**: existía (según el propietario) una primera Skill,
`diseno-ofipapel`, pero no se encontró en el repo, en ninguna rama, ni en
las carpetas globales de Claude Code accesibles desde esta sesión. Todo
indicaba que vivía solo en una carpeta personal local, no versionada.

**Decisión**: establecer `.claude/skills/<nombre>/SKILL.md` (dentro del
repo, versionado en git) como la única ubicación válida para cualquier
Skill del ecosistema RAX. Se crea `.claude/rax/` como memoria compartida
independiente de cualquier Skill concreta.

**Quién decide**: propuesto por Claude, confirmado por el propietario.
**Reversibilidad**: alta.

---

### 2026-07-10 — Corrección de `.gitignore`: `joe-app/` completo → solo `node_modules/` y `dist/`

**Contexto**: la regla `joe-app/` en el `.gitignore` raíz ignoraba
cualquier fichero nuevo dentro de esa carpeta.

**Decisión**: corregir a `joe-app/node_modules/` y `joe-app/dist/`.
Aplicado directamente por ser de bajo riesgo.

**Quién decide**: Claude, acción de bajo riesgo. **Reversibilidad**: total.
**Nota (2026-07-12)**: esta rama nunca se fusionó a `main`, así que el bug
regresó y tuvo que arreglarse otra vez durante la consolidación — ver más
abajo.

---

### 2026-07-12 — Auditoría de producción: proxy del Asistente IA y migración de `alquileres` a Supabase

**Contexto**: en "modo CTO", auditoría real de código sobre todo el
ecosistema. Hallazgos: (1) `Index.html` exponía la API key de Anthropic de
cada usuario en el navegador; (2) `alquileres` no tenía backend real; (3)
login de `Index.html` 100% client-side con contraseña compartida, RLS sin
verificar; (4) dos agentes de WhatsApp activos sin decidir cuál es el
canónico.

**Decisión**: implementar (1) y (2) sobre la rama de aquella sesión
(`claude/rax-project-manager-skill-1o2kl3`): proxy `chat-assistant.js`, y
migración completa de `alquileres` a Supabase (esquema, `storage.ts` async,
9 páginas). (3) y (4) se dejaron abiertas por decisión explícita del
propietario.

**Nota (2026-07-12, más tarde)**: la migración a Supabase de (2) se
descartó por completo al descubrir que `main` ya había migrado
`alquileres` a Firebase Firestore de forma independiente, con una solución
más completa (incluye login por persona). Ver la entrada de consolidación
más abajo. El proxy de (1) sí se rescató.

---

### 2026-07-12 — Auditoría de ramas: 6 ramas RAX huérfanas, trabajo duplicado real

**Contexto**: a petición del propietario, auditoría de todas las ramas y
PRs relacionados con RAX. Hallazgo: además de la rama propia
(`claude/rax-project-manager-skill-1o2kl3`), existían al menos otras 3
ramas construyendo versiones divergentes del mismo sistema de Skills
(`claude/autonomous-dev-environment-8obtv2` = PR #61, abierto;
`claude/rax-validation-priorities-88bwrv`, sin PR; `claude/rax-sales-marketing-skill-4raaru`,
sin PR), más una quinta rama de seguridad no relacionada con Skills pero
del mismo tema (`claude/rls-user-data-security-414x0a`) y una sexta ya
redundante con `main` (`claude/vacation-rental-app-eb8fdy`). Todas
arrancaban de un punto de `main` que para entonces ya llevaba 74-78
commits de diferencia (incluida la migración de `alquileres` a Firestore).

**Decisión**: no desarrollar más sobre ninguna rama existente. Crear
`claude/rax-v1-consolidacion` desde `origin/main` actual como única base
autorizada. Priorizar rescatar valor técnico/funcional/seguridad sobre
documentación, y no fusionar Firestore↔Supabase — Firestore queda como
backend oficial de `alquileres` salvo razón técnica muy fuerte para
cambiar (decisión del propietario).

**Quién decide**: propietario, tras análisis de Claude.
**Reversibilidad**: alta — ninguna rama se borra hasta aprobación expresa.

---

### 2026-07-12 — Consolidación de código sobre `main`: qué se rescata y qué se descarta

**Contexto**: ejecución del plan anterior. Se crea `claude/rax-v1-consolidacion`
desde `origin/main` (commit `e132aae`).

**Rescatado (verificado con `tsc`/`lint`/`build`/`build.sh` en cada paso)**:
- Proxy IA de `Index.html` (`chat-assistant.js`) — de la sesión de auditoría.
- RLS real + sesión anónima de Supabase para `joe-app` — de
  `claude/rls-user-data-security-414x0a`, adaptado al `App.tsx` actual (con
  `PinScreen`, que no existía cuando se escribió esa rama).
- Dedup de lógica FAQ/Claude entre los dos webhooks de WhatsApp
  (`whatsapp-agent-core.js`) — de PR #61.
- CI (`ci.yml`), Dependabot, `404.html`, simplificación de `pages.yml` para
  usar `build.sh` en vez de duplicar la lista de ficheros — de PR #61,
  verificado que `build.sh` produce el mismo `_site/` esperado.
- `design-studio/` completo (brand kit verificado, scripts de render y de
  Firefly) — de PR #61. Necesario para que `diseno-ofipapel` funcione.
- `.claude/skills/diseno-ofipapel/SKILL.md` (versión "productora", con
  tabla de dimensiones y flujo de entrega) — de PR #61, elegida sobre la
  versión "guardiana de datos" de `rax-sales-marketing` por ser un rol más
  completo y porque esta última dependía de un fichero de identidad visual
  con un dato erróneo (ver más abajo).
- `.claude/skills/project-manager/SKILL.md` — versión propia (CTO/PM
  completo), casi idéntica a la que `rax-validation-priorities` ya había
  copiado de forma independiente (única diferencia: una frase sobre el
  estado de `diseno-ofipapel`).
- Formato de `project-manager/references/cola-prioridades.md` — de
  `rax-sales-marketing`, la única pieza de esa rama que no dependía de
  ningún dato de marca.
- Ampliaciones de `.gitignore` (`design-studio/output/`,
  `netlify/functions/node_modules/`) — de PR #61.

**Descartado explícitamente (no por omisión)**:
- Toda la migración de `alquileres` a Supabase de la sesión de auditoría —
  `main` ya tenía Firestore + Firebase Auth + login por persona, una
  solución más completa. Nada de esa migración aportaba algo que Firestore
  no tuviera ya.
- Skill `sales-marketing` completa (5 documentos de referencia) — su
  `identidad-visual.md` afirma que el color primario de Canarias INK es
  `#00BFA5`; verificado contra el CSS real de `canarias-ink.html`, ese
  valor es en realidad `--c-botella` (categoría de producto botella), no
  `--acento` (el acento real de marca es `#00B4D8`, que sí coincide con
  `design-studio/README.md`). Dato falso confirmado, no solo una diferencia
  de estilo. Además, dependía de que `diseno-ofipapel` hubiera entregado ya
  una campaña real, cosa que no había pasado. Se conserva la rama, no se
  retoma hasta que esa condición se cumpla.
- Observabilidad Sentry (`@sentry/react` + `ErrorFallback.tsx`) de PR #61 —
  no-op sin `VITE_SENTRY_DSN` configurada, y el intento original en
  `netlify/functions` ya se había revertido una vez por romper el deploy.
  Se aplaza por ser trabajo especulativo de bajo valor inmediato frente al
  esfuerzo de readaptarlo a la estructura actual de `alquileres`
  (`DataContext` no existía cuando se escribió esa rama).
- `CLAUDE.md`, `.claude/skills/README.md` y `.claude/rax/*.md` de las
  otras ramas no se copiaron literalmente — se reescribieron desde cero
  reflejando el `main` real de hoy, usando esas versiones como referencia
  de contenido, no como fuente a fusionar.

**Bugs reales encontrados durante la propia consolidación (no planeados)**:
- El `.gitignore` de `joe-app/` volvió a tener el bug de DT-01 (la rama que
  lo arregló nunca se fusionó) — se arregló otra vez.
- `404.html` se había añadido en un commit pero nunca se enlazó en
  `build.sh` — corregido en el mismo sprint.
- 2 ficheros de `_site/` (build artifact) llevaban tiempo trackeados en
  git por error — eliminados.
- `joe-app` no tenía `eslint.config.js` en absoluto; al añadirlo aparecieron
  6 errores reales nunca detectados (Fast Refresh roto en `PinScreen.tsx`,
  3 bloques `catch{}` vacíos, 1 variable sin usar). Corregidos con cambios
  de comportamiento cero (extracción de funciones a `lib/pinAuth.ts`,
  comentarios en los `catch`, un `eslint-disable` puntual).
- `alquileres` tenía 3 errores reales de lint (Fast Refresh en
  `LoginScreen.tsx` y `DataContext.tsx`) nunca detectados hasta correr lint
  con CI de por medio. Mismo tipo de corrección, cero cambio de
  comportamiento.
- **`alquileres/LoginScreen.tsx` usa el mismo hash de contraseña por
  defecto que `Index.html`** (mismo valor exacto, no casualidad) — mismo
  tipo de riesgo que DT-06, ahora en dos apps. No se ha tocado (cambiar
  credenciales es producción); registrado como DT-11.

**Quién decide**: Claude ejecuta el plan ya aprobado por el propietario;
las exclusiones (Supabase de alquileres, Sentry, sales-marketing) siguen
criterio ya acordado explícitamente en turnos anteriores.

**Reversibilidad**: alta — todo son commits aditivos o refactors
verificados sobre `claude/rax-v1-consolidacion`, que todavía no se ha
fusionado a `main`. Nada de esto ha tocado `main` directamente.

---

### 2026-07-12 — Modo restringido: solo arquitectura/documentación, cero código de producción

**Contexto**: tras cerrar el sprint de consolidación de código
(`claude/rax-v1-consolidacion`) y entregar la clasificación de ramas para
aprobación, el propietario acota explícitamente el ámbito de trabajo:
solo documentación y organización del repo (`CLAUDE.md`, `.claude/skills/`,
`.claude/rax/`, inventario, clasificación de ramas, propuesta de limpieza,
roadmap, deuda técnica). Prohibido: tocar código de producción
(`Index.html`, `joe-app`, `alquileres`, `canarias-ink.html`, funciones de
Netlify, bot de WhatsApp), abrir PRs de código, o rescatar funcionalidad de
otras ramas aunque sea de bajo riesgo. Cualquier cambio de código detectado
como necesario se documenta como pendiente, no se implementa.

**Decisión derivada — Sentry (PR #61) queda formalmente descartado, no
solo aplazado**: en la clasificación de ramas anterior quedó como pregunta
abierta ("¿lo rescato o lo doy por descartado?"). Este modo restringido
responde la pregunta por sí solo: no se rescata mientras esté vigente.
Queda documentado como pendiente en `DEUDA_TECNICA.md`/`ROADMAP_TECNICO.md`
para una futura sesión con permiso explícito de tocar código, no como
trabajo en curso.

**Efecto sobre la clasificación de ramas ya entregada**: `claude/autonomous-dev-environment-8obtv2`
(PR #61) deja de tener la salvedad de Sentry — pasa a "Prueba/obsoleto"
sin condición, salvo que el propietario pida explícitamente rescatarlo más
adelante (rompiendo este modo restringido para esa tarea concreta).

**Quién decide**: propietario. **Reversibilidad**: total — el propietario
puede levantar este modo en cualquier momento para una tarea concreta.

---

### 2026-07-12 — PR #67 detectado: rama definitiva de facto, invalida parte de la clasificación de ramas anterior

**Contexto**: al preparar el plan de limpieza post-fusión, el propietario
señaló la existencia del PR #67 (`claude/rax-validation-priorities-88bwrv`
→ `main`), abierto y sin fusionar. Verificado con diffs de contenido (no
solo mensajes de commit): ese PR incluye una copia funcionalmente idéntica
de **todo** el rescate hecho en `claude/rax-v1-consolidacion` (`chat-assistant.js`
byte a byte idéntico, `Index.html` byte a byte idéntico, RLS de `joe-app`
equivalente, CI/Dependabot/dedup de WhatsApp/`404.html`/`design-studio`
presentes), más trabajo real que esta rama no tenía:
- **Reglas de seguridad de Firestore para `alquileres`** (`firestore.rules`
  nuevo) — no existía ninguna versionada; sin ellas, cualquiera con la
  `apiKey` pública de Firebase (visible en el bundle) podía leer/escribir
  toda la base de datos de alquileres sin pasar por la app. Mismo tipo de
  hallazgo que el RLS de `joe-app`, en el backend nuevo.
- **Primera campaña real** "Vuelta al Cole 2026" (5 piezas + copy),
  generada con `design-studio` + `diseno-ofipapel`, validando el pipeline
  de extremo a extremo.
- **DT-02 resuelto**: `index.html` vs `Index.html` confirmado como
  redirect intencional (lectura de `build.sh`/`netlify.toml`), no deuda
  técnica real — se había dejado como pregunta abierta en la clasificación
  anterior.
- Su propia documentación (`CLAUDE.md`, `.claude/rax/*`) ya actualizada a
  este estado.

**Decisión**: `claude/rax-validation-priorities-88bwrv` **se retira de la
lista de ramas "Prueba/obsoleto"** — es la rama viva de un PR abierto, no
un experimento sin fusionar. No se toca ni se borra bajo ningún concepto
hasta que el propio PR #67 se fusione o se cierre explícitamente. El resto
de la clasificación anterior se mantiene: las otras 4 ramas marcadas
"Prueba/obsoleto" (la propia `rax-project-manager-skill-1o2kl3`,
`autonomous-dev-environment-8obtv2` / PR #61, `rls-user-data-security-414x0a`,
`vacation-rental-app-eb8fdy`) siguen siéndolo — su contenido útil está
confirmado presente tanto en `claude/rax-v1-consolidacion` como,
independientemente, en PR #67. `claude/rax-sales-marketing-skill-4raaru`
sigue conservándose intacta por instrucción expresa.

**Efecto sobre `claude/rax-v1-consolidacion`**: al ser un subconjunto
estricto y verificado de PR #67, esta rama (la creada en esta sesión) pasa
también a ser segura de eliminar una vez PR #67 se fusione — no antes,
por si acaso PR #67 no llega a fusionarse.

**Quién decide**: verificación técnica de Claude a partir de la
instrucción del propietario. **Reversibilidad**: alta — ninguna rama se ha
tocado, solo se corrige el informe.
