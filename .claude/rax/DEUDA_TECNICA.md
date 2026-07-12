# Deuda técnica — RAX

Formato por entrada: síntoma → causa → riesgo si no se corrige → esfuerzo →
prioridad (Impacto/Riesgo/ROI → score, ver fórmula en
`project-manager/SKILL.md`). Estado `resuelto` se mantiene en la tabla (no
se borra) para conservar el historial.

| ID | Síntoma | Causa | Riesgo si no se corrige | Esfuerzo | I / R / ROI → score | Estado |
|---|---|---|---|---|---|---|
| DT-01 | `.gitignore` raíz ignoraba **toda** la carpeta `joe-app/` | Regla `joe-app/` en vez de `joe-app/node_modules/` + `joe-app/dist/` (a diferencia de `alquileres/`, que sí lo hace bien) | Cualquier fichero nuevo creado dentro de `joe-app/` queda invisible para git de forma silenciosa: no aparece en `git status`, se puede perder trabajo sin darse cuenta | Baja (1 línea) | 4 / 1 / 3 → 13 | **Resuelto** (2026-07-10, ver `DECISIONES.md`) |
| DT-02 | Conviven `index.html` (minúscula) e `Index.html` (mayúscula) en la raíz | Probablemente evolución histórica del sitio principal sin limpiar el fichero antiguo | Confuso para cualquiera que edite el sitio; en sistemas de fichero *case-insensitive* (p.ej. algunos entornos locales en macOS/Windows) pueden pisarse entre sí sin avisar, aunque en git/Linux son ficheros distintos | Media (hay que confirmar cuál es el "real" antes de tocar nada) | 3 / 2 / 2 → 8 | Abierto — **preguntar al propietario** cuál es el fichero vigente antes de tocarlo |
| DT-03 | Dos implementaciones paralelas de agente de WhatsApp (Meta Cloud API y Twilio) sin documentación de cuál es la canónica | Se añadió Twilio como alternativa (commit "Add Twilio WhatsApp webhook as alternative to Meta Cloud API") pero no hay registro de cuál está realmente conectada en producción | Riesgo de mantener/depurar el webhook equivocado, o de que ambos respondan a la vez si los dos están configurados en Meta/Twilio a la vez | Baja (es una decisión + documentarla) | 3 / 2 / 2 → 8 | Abierto — pendiente de decisión del propietario (ver `ROADMAP_TECNICO.md` RT-01) |
| DT-04 | Sin tests automatizados ni linting en CI | El único workflow de GitHub Actions despliega (`pages.yml`); no hay verificación de calidad antes de publicar | Un error de sintaxis o de build en `alquileres/`/`joe-app/` solo se detecta al fallar el build de Netlify, no antes | Media | 3 / 2 / 2 → 8 | Abierto |
| DT-05 | Esquemas de Supabase no centralizados | `alquileres/` y `joe-app/` tienen cada uno su propio `supabase-schema.sql` suelto, sin migraciones versionadas ni proyecto Supabase documentado como compartido/separado | Difícil saber qué proyecto Supabase usa cada app, ni reproducir el esquema si hay que recrear el entorno | Media-alta | 3 / 3 / 2 → 9 | Abierto |

## Cómo añadir una entrada nueva

Cada vez que detectes deuda técnica real (no hipotética), añade una fila con
el mismo formato. No la marques `resuelto` hasta que el cambio esté
efectivamente commiteado.
