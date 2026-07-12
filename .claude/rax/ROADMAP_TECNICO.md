# Roadmap técnico — RAX

Mantenido por `project-manager`. Cada ítem lleva su score de prioridad
(Impacto/Riesgo/ROI, fórmula en `SKILL.md`). Enlaza con `ROADMAP_NEGOCIO.md`
por ID (`RT-xx` ↔ `RN-xx`) cuando un ítem técnico habilita uno de negocio.

| ID | Ítem | I / R / ROI → score | Vínculo negocio | Estado |
|---|---|---|---|---|
| RT-01 | Decidir y documentar cuál es el agente de WhatsApp canónico (Meta vs Twilio, `DT-03`) — apagar el que no se use | 3 / 1 / 3 → 11 | RN-02 | Pendiente de decisión del propietario |
| RT-02 | Centralizar y versionar el esquema de Supabase de `Index.html` (no existe `supabase-schema.sql` para esa app) | 3 / 2 / 2 → 8 | — | Pendiente |
| RT-03 | CI mínima (lint + build) antes de desplegar | 3 / 1 / 2 → 9 | — | **Resuelto** — `.github/workflows/ci.yml` |
| RT-04 | Resolver la duplicidad `index.html` / `Index.html` en la raíz (`DT-02`) | 3 / 2 / 2 → 8 | — | Bloqueado — necesita respuesta del propietario |
| RT-05 | Migrar la Skill `diseno-ofipapel` a `.claude/skills/` para que sea versionada | 3 / 1 / 3 → 11 | — | **Resuelto** |
| RT-06 | Consolidar las ramas huérfanas y divergentes de Skills/infraestructura RAX en una única rama coherente sobre `main` actualizado | 4 / 1 / 4 → 15 | — | **Resuelto** — `claude/rax-v1-consolidacion`, pendiente de fusionar a `main` y de la limpieza final de ramas |
| RT-07 | Login real de `Index.html` (Supabase Auth) reemplazando el hash compartido client-side | 5 / 4 / 3 → 15 | RN-04 | Pendiente de decisión del propietario (`DT-06`) |
| RT-08 | Verificar/endurecer RLS de Supabase para `Index.html` | 5 / 4 / 3 → 15 | RN-04 | Pendiente — requiere acceso al dashboard de Supabase (`DT-07`) |
| RT-09 | Quitar dependencia muerta `@supabase/supabase-js` de `alquileres/package.json` (`DT-10`) | 1 / 1 / 1 → 2 | — | Pendiente — cambio trivial, documentado y no ejecutado a la espera de turno |
| RT-10 | Resolver la contraseña compartida por defecto en `alquileres/LoginScreen.tsx` (`DT-11`), probablemente a la vez que RT-07 | 5 / 4 / 3 → 15 | RN-04 | Pendiente de decisión del propietario |
| RT-11 | Auditar en profundidad `vacaciones.html` e `importacion-pedidos-proveedores.html` (descubiertos durante esta consolidación, nunca auditados) | 2 / 2 / 2 → 6 | — | Pendiente |
| RT-12 | Probar `design-studio/scripts/firefly-generate.js` con credenciales reales de Adobe Firefly | 2 / 1 / 2 → 6 | — | Pendiente de `FIREFLY_CLIENT_ID`/`FIREFLY_CLIENT_SECRET` |

## Próximo paso recomendado (mayor score, sin bloqueo externo)

Con RT-05/RT-06 resueltos, los de mayor score sin bloqueo son **RT-07/RT-08/RT-10**
(login + RLS de `Index.html` y `alquileres`) — los tres aplazados por
decisión explícita del propietario, no por falta de plan. El siguiente
paso puramente técnico sin decisión de negocio pendiente es **RT-01**
(decidir canal de WhatsApp) en cuanto el propietario responda.
