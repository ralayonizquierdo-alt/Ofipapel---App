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
