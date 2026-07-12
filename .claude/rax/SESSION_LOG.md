# Historial de sesiones — RAX

Cada entrada: fecha, resumen (3-5 líneas), decisiones tomadas, siguiente
paso recomendado para la próxima sesión. Append-only.

---

### 2026-07-10 — Creación de la Skill `project-manager` y del sistema RAX

**Resumen**: no existía ninguna Skill versionada en el repo. Se estableció
`.claude/skills/` como ubicación canónica y `.claude/rax/` como memoria
compartida. Se creó `project-manager` (CTO/PM/coordinador). Primera pasada
de inventario real (6 proyectos + 2 implementaciones paralelas de
WhatsApp) y una deuda técnica real detectada y corregida (`.gitignore` de
`joe-app/`).

**Siguiente paso recomendado (en su momento)**: migrar `diseno-ofipapel` y
decidir el canal de WhatsApp canónico.

---

### 2026-07-12 — Modo CTO: auditoría de producción

**Resumen**: auditoría real de código de todo el ecosistema. Se aprobaron
2 implementaciones (proxy IA de `Index.html`, migración de `alquileres` a
Supabase) y se aplazaron 2 (auth/RLS de `Index.html`, canal de WhatsApp).

**Siguiente paso (en su momento)**: desplegar con las variables de entorno
necesarias y confirmar en real. **Este plan quedó parcialmente invalidado**
por el hallazgo de la sesión siguiente: `main` ya llevaba 74+ commits de
diferencia, incluida una migración de `alquileres` a Firestore hecha de
forma independiente.

---

### 2026-07-12 — Auditoría de ramas y PRs relacionados con RAX

**Resumen**: a petición del propietario, se identificaron todas las ramas
y PRs relacionados con RAX. Hallazgo principal: 6 ramas (incluida la
propia) construyendo trabajo solapado o divergente sobre el mismo sistema,
todas 74-78 commits por detrás de `main`. Se entregó un informe único con
matriz comparativa (Fase 1), plan de rescate (Fase 2) y secuencia de
commits propuesta (Fase 3) — sin implementar nada.

**Decisiones tomadas**: ver `DECISIONES.md` (2026-07-12, "Auditoría de
ramas").

**Siguiente paso recomendado**: crear `claude/rax-v1-consolidacion` desde
`main` actual y ejecutar el rescate priorizando código sobre documentación.

---

### 2026-07-12 — Consolidación de código: `claude/rax-v1-consolidacion`

**Resumen**: se creó la rama desde `origin/main` actual y se ejecutó el
rescate priorizando valor técnico/funcional/seguridad. Rescatado: proxy IA,
RLS+sesión anónima de `joe-app`, dedup de WhatsApp, CI+Dependabot,
simplificación de `pages.yml`, `404.html` (corregido: no estaba enlazado en
`build.sh`), `design-studio/`. Descartado explícitamente: migración a
Supabase de `alquileres` (superada por Firestore, ya en `main`), Sentry
(especulativo), Skill `sales-marketing` completa (dato de color erróneo
verificado + sin campaña real de `diseno-ofipapel` todavía). Se corrigieron
además 9 errores reales de lint entre `joe-app` y `alquileres` (cero
cambio de comportamiento, todo verificado con build) y una regresión del
bug de `.gitignore` de `joe-app/` (DT-01, volvió a aparecer porque la
rama que lo arregló nunca se fusionó).

**Decisiones tomadas**: ver `DECISIONES.md` (2026-07-12, "Consolidación de
código sobre `main`").

**Hallazgo nuevo sin resolver**: `alquileres/LoginScreen.tsx` comparte el
mismo hash de contraseña por defecto que `Index.html` (DT-11) — mismo tipo
de riesgo que DT-06, ahora en dos apps.

**Siguiente paso recomendado**: escribir la documentación definitiva
(`CLAUDE.md`, Skills, `.claude/rax/*` — hecho en esta misma sesión, ver
más abajo) y, tras aprobación expresa del propietario, fusionar
`claude/rax-v1-consolidacion` a `main` y limpiar las ramas ya rescatadas.

---

### 2026-07-12 — Documentación definitiva + clasificación de ramas para limpieza

**Resumen**: con el código ya integrado y verificado en
`claude/rax-v1-consolidacion`, se escribió la documentación definitiva
(`CLAUDE.md`, `.claude/skills/*`, `.claude/rax/*`) reflejando el `main`
real (Firestore, login por persona, WebAuthn, CI, planificador de
vacaciones, conversor de facturas, catálogo). No se tocó código de ninguna
app en este pase — solo documentación, y dos completados menores de
commits ya aprobados (`404.html` en `build.sh`, `.gitignore` de
`design-studio/`/`netlify/functions/`). Se generó la clasificación de
ramas (Producción / Inactivo con valor / Prueba-obsoleto) para que el
propietario apruebe qué borrar.

**Siguiente paso recomendado**: el propietario revisa la clasificación de
ramas y el estado final del repo; con su aprobación expresa, fusionar
`claude/rax-v1-consolidacion` a `main`, cerrar PR #61 sin fusionar, y
borrar las ramas marcadas como seguras.
