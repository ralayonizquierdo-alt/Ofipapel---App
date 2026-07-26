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
| RT-07 | Mover el asistente de IA de `Index.html` a un proxy server-side (`DT-06`) | 5 / 1 / 4 → 17 | — | **Resuelto** (2026-07-12) |
| RT-08 | Blindar el acceso a `joe-app` (Supabase, `DT-07`) y `alquileres` (Firestore, `DT-08`) con sesión + reglas/RLS reales | 5 / 1 / 4 → 17 | — | **Resuelto en código** (2026-07-12) — pendiente de activación en Supabase/Firebase Console por el propietario |
| RT-09 | **Objetivo principal del proyecto Creative Lab**: conectar un proveedor real de generación de imágenes (`openai-images` u otro) y demostrar que produce fotografía de calidad equivalente a la campaña Muvip **sin depender de una imagen aportada por el propietario**. Hoy solo existe la ruta `simulated` (foto real del usuario compuesta tal cual, sin IA) — ver `.claude/rax/DECISIONES.md` 2026-07-26 y `FIRST_REAL_GENERATION.md`. No se considera resuelto el objetivo principal del proyecto hasta que esto se demuestre | 5 / 2 / 5 → 18 | — | **Pendiente — bloqueante principal** (requiere `OPENAI_API_KEY` u otro proveedor real configurado) |

## Próximo paso recomendado (mayor score, sin bloqueo externo)

**RT-09** tiene el score más alto y es el objetivo principal declarado del
proyecto, pero está bloqueado externamente (requiere que el propietario
configure una credencial de proveedor de imágenes real). Sin esa
credencial, el mayor score accionable sin bloqueo externo es **RT-03** (CI
mínima). **RT-01** (canal de WhatsApp canónico) necesita una respuesta
corta del propietario. RT-02 queda reducido de alcance: solo aplica ya a
`joe-app` (ver `DEUDA_TECNICA.md` DT-05).
