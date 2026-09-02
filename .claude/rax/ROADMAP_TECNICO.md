# Roadmap técnico — RAX

Mantenido por `project-manager`. Cada ítem lleva su score de prioridad
(Impacto/Riesgo/ROI, fórmula en `SKILL.md`). Enlaza con `ROADMAP_NEGOCIO.md`
por ID (`RT-xx` ↔ `RN-xx`) cuando un ítem técnico habilita uno de negocio.

| ID | Ítem | I / R / ROI → score | Vínculo negocio | Estado |
|---|---|---|---|---|
| RT-01 | Decidir y documentar cuál es el agente de WhatsApp canónico (Meta Cloud API vs Twilio, `DT-03`) — apagar o eliminar el que no se use | 3 / 1 / 3 → 11 | RN-02 | **Resuelto** — Meta Cloud API es la canónica, `twilio-webhook.js` eliminado |
| RT-02 | Centralizar y versionar el esquema de Supabase de `Index.html` (no existe `supabase-schema.sql` para esa app; ya no aplica a `alquileres/`, que pasó a Firebase — ver `DEUDA_TECNICA.md` DT-05) | 3 / 2 / 2 → 8 | — | Pendiente |
| RT-03 | Añadir verificación mínima en CI (lint + `tsc` + build) antes de desplegar, para `alquileres/` y `joe-app/` | 3 / 1 / 2 → 9 | — | **Resuelto** — `.github/workflows/ci.yml` |
| RT-04 | Resolver la duplicidad `index.html` / `Index.html` en la raíz (`DT-02`) una vez confirmado con el propietario cuál es el vigente | 3 / 2 / 2 → 8 | — | Bloqueado — necesita respuesta del propietario |
| RT-05 | Migrar la Skill `diseno-ofipapel` a `.claude/skills/` para que sea versionada y reutilizable en cualquier sesión (incluida la nube) | 3 / 1 / 3 → 11 | — | **Resuelto** (2026-07-10, ver `DECISIONES.md`) |
| RT-06 | Consolidar las 3 ramas huérfanas y divergentes de Skills/infraestructura RAX (`rax-project-manager-skill`, `rax-sales-marketing-skill`, `autonomous-dev-environment`) en una única rama coherente | 4 / 1 / 4 → 15 | — | **Resuelto** (2026-07-10, ver `DECISIONES.md`) |
| RT-07 | Mover el asistente de IA de `Index.html` a un proxy server-side (`DT-06`) | 5 / 1 / 4 → 17 | — | **Resuelto** (2026-07-12) |
| RT-08 | Blindar el acceso a `joe-app` (Supabase, `DT-07`) y `alquileres` (Firestore, `DT-08`) con sesión + reglas/RLS reales | 5 / 1 / 4 → 17 | — | **Resuelto en código** (2026-07-12) — pendiente de activación en Supabase/Firebase Console por el propietario |
| RT-09 | Quitar dependencia muerta `@supabase/supabase-js` de `alquileres/package.json` (`DT-10`) | 1 / 1 / 1 → 2 | — | Pendiente — cambio trivial, documentado y no ejecutado a la espera de turno |
| RT-10 | Resolver la contraseña compartida por defecto en `alquileres/LoginScreen.tsx` (`DT-11`), probablemente a la vez que un futuro login real | 5 / 4 / 3 → 15 | RN-04 | Pendiente de decisión del propietario |
| RT-11 | Auditar en profundidad `vacaciones.html` e `importacion-pedidos-proveedores.html` (nunca auditados) | 2 / 2 / 2 → 6 | — | Pendiente |
| RT-12 | Probar `design-studio/scripts/firefly-generate.js` con credenciales reales de Adobe Firefly | 2 / 1 / 2 → 6 | — | Pendiente de `FIREFLY_CLIENT_ID`/`FIREFLY_CLIENT_SECRET` |
| RT-13 | Añadir observabilidad de errores (Sentry) a `joe-app` y `alquileres` (`DT-14`) — código ya escrito y verificado en `claude/autonomous-dev-environment-8obtv2`, sin rescatar | 3 / 2 / 2 → 8 | — | Pendiente |
| RT-14 | **Objetivo principal del proyecto Creative Lab**: conectar un proveedor real de generación de imágenes (`openai-images`) y demostrar que produce fotografía de calidad equivalente a la campaña Muvip **sin depender de una imagen aportada por el propietario**. Ver `.claude/rax/DECISIONES.md` 2026-07-26 y `FIRST_REAL_GENERATION.md` | 5 / 2 / 5 → 18 | — | **Confirmado en producción real** (2026-08-01/02) — logs reales de `marketing-engine-run` muestran ejecuciones de 36-39s sin error con el proveedor `openai-images` activo (generación real completa: OpenAI + Chromium + `creative-lab`). El único bloqueante restante para verlo desde el cliente era de plataforma (`DEUDA_TECNICA.md` DT-17), no del proveedor en sí — ver RT-15 |
| RT-16 | **Verificar con la factura de septiembre que el recorte de despliegues de Netlify es real.** El 2026-09-02 se pusieron reglas por sitio en `netlify-ignore.sh` (`DEUDA_TECNICA.md` DT-32): cada sitio construye solo cuando cambia lo suyo. Proyección calculada sobre los 128 pushes reales de agosto: **384 → 202 despliegues (−47%), de ~57,60 $ a ~30,30 $**. Comprobar en Netlify → Billing → Credits, apartado "Credit usage breakdown", el número de "Production deploys" del periodo 19 sep – 18 oct y contrastarlo con los 177 del periodo anterior | 4 / 1 / 5 → 20 | — | **Pendiente de medir** — no se puede cerrar hasta tener el dato del periodo completo. Encargo explícito del propietario (2026-09-02): "lo comprobaremos con los datos de septiembre". Ya verificado a pequeña escala el mismo día: un commit de solo documentación no generó despliegue en ninguno de los tres sitios (los tres conservaron el despliegue anterior), lo que confirma que **un build saltado no se factura** — de eso dependía todo el ahorro. Si la cifra real no baja como se proyecta, el siguiente sospechoso es el número de pushes: 128 en 23 días (5,6/día), y ahí el cambio es de método, no de código |
| RT-15 | Migrar `app.html` (Almacén) del endpoint síncrono `marketing-engine-run.js` al patrón background+polling (`marketing-engine-run-background.js` + `marketing-engine-status.js`, `DEUDA_TECNICA.md` DT-17) — necesario para que una generación real con `openai-images` llegue alguna vez a la interfaz, no solo a `curl`/logs | 5 / 2 / 4 → 20 | — | Pendiente — backend verificado (local + logs de producción vía DT-16/17), falta el fetch+polling en el propio `app.html` |

## Próximo paso recomendado (mayor score, sin bloqueo externo)

**RT-14** tiene el score más alto y es el objetivo principal declarado del
proyecto — el código ya está verificado, solo falta la validación real en
producción tras el despliegue (fuera del alcance de esta sesión). Sin
contar esa validación pendiente, el mayor score accionable sin bloqueo
externo es **RT-10** (contraseña compartida de `alquileres`) y **RT-01**
(canal de WhatsApp canónico) — ambos necesitan una decisión corta del
propietario, no más trabajo técnico. RT-02 queda reducido de alcance: solo
aplica ya a `Index.html`/`joe-app` (ver `DEUDA_TECNICA.md` DT-05).
