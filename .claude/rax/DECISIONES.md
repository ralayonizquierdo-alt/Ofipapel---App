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

### 2026-07-12 — Auditoría de producción: proxy del Asistente IA y migración de `alquileres/` a Supabase

**Contexto**: en "modo CTO", auditoría real de código (no solo arquitectura)
sobre todo el ecosistema. Hallazgos relevantes: (1) `Index.html` llamaba a
Claude directamente desde el navegador con la API key de cada usuario en
claro; (2) `alquileres/` no tenía backend real, todo vivía en `localStorage`
(riesgo de pérdida total de datos de negocio); (3) el login de `Index.html`
es 100% client-side con contraseña compartida por defecto y sin RLS
verificado en Supabase; (4) dos agentes de WhatsApp activos en paralelo sin
decidir cuál es el canónico.

**Decisión**: implementar (2) y (1), que el propietario aprobó explícitamente:
- `netlify/functions/chat-assistant.js`: proxy server-side para el chat de
  `Index.html`. La API key de Anthropic (`ANTHROPIC_API_KEY`, ya existente)
  pasa a vivir solo en el servidor; se añade un token de aplicación
  (`CHAT_ASSISTANT_TOKEN`) y rate-limit básico en memoria como mitigación
  parcial, documentado como no-definitivo mientras no haya auth real.
- `alquileres/`: nuevo `supabase-schema.sql` (7 tablas + `seed_flags`),
  `src/lib/supabase.ts` (mismo patrón que `joe-app`), y `storage.ts`
  reescrito de síncrono/localStorage a asíncrono/Supabase, con migración
  automática de los datos existentes en el navegador la primera vez que
  corre. Las 9 páginas + `App.tsx`/`main.tsx` se actualizaron para el nuevo
  API asíncrono. RLS se deja **activado pero con política abierta** (no
  hay auth de app todavía) — mismo tipo de riesgo que (3), documentado en
  `DEUDA_TECNICA.md` DT-09.

No se implementaron (3) ni (4): el propietario decidió posponerlas
explícitamente. Quedan abiertas en `DEUDA_TECNICA.md` (DT-06, DT-07) y
`ROADMAP_TECNICO.md` (RT-01).

**Alternativas descartadas**: para el proxy de IA, mantener las API keys
personales en el navegador (descartado por ser la causa raíz del hallazgo);
para `alquileres/`, un patrón "local-first con sync en segundo plano"
(descartado por añadir arquitectura no solicitada — el propietario pidió
explícitamente minimizar ampliación de arquitectura en esta fase).

**Quién decide**: propuesto por Claude tras auditoría, aprobado
explícitamente por el propietario para (1) y (2); (3) y (4) pospuestas por
decisión explícita del propietario.

**Reversibilidad**: alta — ambos cambios son aditivos (nuevas funciones/
esquema), revertibles con `git revert`. La migración de datos de
`alquileres/` es best-effort una sola vez por navegador; no se ha probado
contra un proyecto Supabase real (ver limitación en `SESSION_LOG.md`).
