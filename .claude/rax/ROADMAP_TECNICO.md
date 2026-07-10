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
| RT-05 | Migrar la Skill `diseno-ofipapel` a `.claude/skills/` para que sea versionada y reutilizable en cualquier sesión (incluida la nube) | 3 / 1 / 3 → 11 | — | Pendiente — acción de un solo paso, ver `.claude/skills/README.md` |

## Próximo paso recomendado (mayor score, sin bloqueo externo)

**RT-05** (migrar `diseno-ofipapel`) y **RT-01** (decidir el agente de
WhatsApp canónico) son los de mayor score que no dependen de esperar nada
más que una respuesta corta del propietario.
