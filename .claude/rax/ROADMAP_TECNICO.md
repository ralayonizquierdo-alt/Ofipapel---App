# Roadmap técnico — RAX

Mantenido por `project-manager`. Cada ítem lleva su score de prioridad
(Impacto/Riesgo/ROI, fórmula en `SKILL.md`). Enlaza con `ROADMAP_NEGOCIO.md`
por ID (`RT-xx` ↔ `RN-xx`) cuando un ítem técnico habilita uno de negocio.

| ID | Ítem | I / R / ROI → score | Vínculo negocio | Estado |
|---|---|---|---|---|
| RT-01 | Decidir y documentar cuál es el agente de WhatsApp canónico (Meta Cloud API vs Twilio, `DT-03`) — apagar o eliminar el que no se use | 3 / 1 / 3 → 11 | RN-02 | Pendiente de decisión |
| RT-02 | Centralizar y versionar los esquemas de Supabase de `alquileres/` y `joe-app/` (migraciones, no solo un `.sql` suelto) | 3 / 2 / 2 → 8 | — | Pendiente |
| RT-03 | Añadir verificación mínima en CI (lint + `tsc` + build) antes de desplegar, para `alquileres/` y `joe-app/` | 3 / 1 / 2 → 9 | — | Pendiente |
| RT-04 | Resolver la duplicidad `index.html` / `Index.html` en la raíz (`DT-02`) una vez confirmado con el propietario cuál es el vigente | 3 / 2 / 2 → 8 | — | Bloqueado — necesita respuesta del propietario |
| RT-05 | Migrar la Skill `diseno-ofipapel` a `.claude/skills/` para que sea versionada y reutilizable en cualquier sesión (incluida la nube) | 3 / 1 / 3 → 11 | — | **Resuelto** (2026-07-10, ver `DECISIONES.md`) |
| RT-06 | Consolidar las 3 ramas huérfanas y divergentes de Skills/infraestructura RAX (`rax-project-manager-skill`, `rax-sales-marketing-skill`, `autonomous-dev-environment`) en una única rama coherente | 4 / 1 / 4 → 15 | — | **Resuelto** (2026-07-10, ver `DECISIONES.md`) |

## Próximo paso recomendado (mayor score, sin bloqueo externo)

Con RT-05 y RT-06 resueltos, el mayor score pendiente sin bloqueo es
**RT-01** (decidir el agente de WhatsApp canónico) y **RT-03** (CI mínima) —
ambos aplazados por instrucción explícita del propietario hasta cerrar la
fase de consolidación actual. RT-02 (RLS/esquema de Supabase) también está
aplazado a petición expresa, pese a su score alto.
