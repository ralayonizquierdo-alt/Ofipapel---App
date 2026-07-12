# Historial de sesiones — RAX

Cada entrada: fecha, resumen (3-5 líneas), decisiones tomadas, siguiente
paso recomendado para la próxima sesión. Append-only.

---

### 2026-07-10 — Creación de la Skill `project-manager` y del sistema RAX

**Resumen**: no existía ninguna Skill versionada en el repo (`diseno-ofipapel`
solo vivía, si acaso, en local). Se estableció `.claude/skills/` como
ubicación canónica de Skills y `.claude/rax/` como memoria compartida del
ecosistema (inventario, roadmaps, deuda técnica, decisiones, integraciones).
Se creó la Skill `project-manager` como CTO/PM/coordinador. Se hizo una
primera pasada de inventario real del repo (6 proyectos activos + 2
implementaciones paralelas de WhatsApp) y se detectó y corrigió una deuda
técnica real (`.gitignore` de `joe-app/` ignoraba ficheros nuevos
silenciosamente).

**Decisiones tomadas**: ver `DECISIONES.md` (2026-07-10, dos entradas).

**Siguiente paso recomendado para la próxima sesión**: migrar
`diseno-ofipapel` desde la carpeta local a `.claude/skills/diseno-ofipapel/`
(RT-05) y decidir cuál de los dos agentes de WhatsApp (Meta vs Twilio) es
el canónico (RT-01) — ambos son de alto score y no dependen de más trabajo
técnico, solo de una respuesta del propietario.

---

### 2026-07-12 — Modo CTO: auditoría de producción y dos implementaciones aprobadas

**Resumen**: a petición del propietario ("modo CTO", entrar en fase de
producción, priorizar beneficio real sobre arquitectura), se hizo una
auditoría real de código de todo el ecosistema (no solo mapeo de proyectos):
se revisaron los 3 microsites, las 2 apps React, las 3 funciones Netlify,
esquemas Supabase y dependencias (`npm audit` limpio). Se entregó una lista
única priorizada (P1/P2/P3 con tiempo, ROI, riesgo, dependencias). El
propietario aprobó 2 de las tareas y pospuso 2:
- ✅ Implementado: proxy server-side para el Asistente IA de `Index.html`
  (`netlify/functions/chat-assistant.js`) — ya no se exponen API keys de
  Anthropic en el navegador.
- ✅ Implementado: migración de `alquileres/` de `localStorage` a Supabase
  (esquema, cliente, `storage.ts` async, 9 páginas actualizadas). `tsc`,
  `vite build` y `eslint` verificados limpios.
- ⏸️ Pospuesto (decisión explícita del propietario): auditar/activar RLS y
  sustituir el login client-side de `Index.html` (DT-06, DT-07).
- ⏸️ Pospuesto (decisión explícita del propietario): decidir canal
  canónico de WhatsApp (RT-01).

**Limitación importante**: ninguna de las dos implementaciones se ha podido
probar contra credenciales reales de Supabase/Netlify — no hay acceso desde
estas sesiones. El propietario debe, antes de desplegar:
1. Para el proxy de IA: confirmar que `ANTHROPIC_API_KEY` ya existe en
   Netlify (se reutiliza la del agente de WhatsApp) y añadir
   `CHAT_ASSISTANT_TOKEN` (cualquier cadena, debe coincidir con
   `APP_CHAT_TOKEN` en `Index.html`).
2. Para `alquileres/`: crear/reutilizar un proyecto Supabase, ejecutar
   `alquileres/supabase-schema.sql`, y configurar `VITE_SUPABASE_URL` +
   `VITE_SUPABASE_ANON_KEY` en Netlify (build de `alquileres/`). Sin esto,
   la app no arranca (fallará `initStorage()`).
3. Verificar en un despliegue real que la migración automática de datos
   locales a Supabase funciona como se espera antes de confiar en ella
   como única copia de los datos.

**Decisiones tomadas**: ver `DECISIONES.md` (2026-07-12).

**Siguiente paso recomendado para la próxima sesión**: el propietario
despliega con las variables de entorno de arriba y confirma que todo
funciona en real; después, retomar DT-06/DT-07 (auth + RLS de `Index.html`)
y RT-01 (WhatsApp), que siguen siendo los ítems de mayor score sin resolver.
