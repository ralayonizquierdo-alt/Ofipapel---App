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
