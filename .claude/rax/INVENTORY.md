# Inventario de proyectos — RAX

Mantenido por la Skill `project-manager`. Refleja el estado real del repo
`ralayonizquierdo-alt/Ofipapel---App`. Última revisión completa: 2026-07-10
(consolidación de las ramas de Skills en una única fuente de verdad).

| Proyecto | Tipo | Ruta | Stack | Despliegue | Estado |
|---|---|---|---|---|---|
| Ofipapel · Control Financiero | Sitio/app de negocio (papelería) | `Index.html` | HTML monolítico + Chart.js + Supabase JS + SheetJS | GitHub Pages + Netlify (`_site/`) | Activo |
| Canarias INK | Microsite de marca (venta de consumibles de impresora) | `canarias-ink.html` | HTML monolítico | GitHub Pages + Netlify | Activo |
| FalControl | Microsite/herramienta personal ("Radio Alerta"), sin relación de negocio con Ofipapel | `falcontrol.html` | HTML monolítico | GitHub Pages + Netlify | Activo |
| Alquileres | Aplicación interna de gestión (8 apartamentos reales) | `alquileres/` | React 19 + Vite + TS + Tailwind 4 + Recharts. Declara `@supabase/supabase-js` como dependencia pero **no se usa en ningún fichero de `src/`** — toda la persistencia es `localStorage` del navegador (verificado por grep, no por suposición). Riesgo real de pérdida de datos de negocio. | Netlify (build propio, `_site/alquileres/`) | Activo — ver deuda técnica |
| Joe App | Aplicación familiar/personal (calendario, turnos, "coisinhas", música, negocio) | `joe-app/` | React 19 + Vite + TS + Supabase (uso real confirmado en las 6 páginas) | Netlify (`_site/joe/`) | Activo |
| Agente WhatsApp (Meta Cloud API) | Automatización — auto-respuesta con reglas + IA (Claude) | `netlify/functions/whatsapp-webhook.js`, `whatsapp-agent-config.js` | Netlify Functions + Anthropic API | Netlify Functions | Activo (ver `WHATSAPP_SETUP.md`) |
| Agente WhatsApp (Twilio, alternativa) | Automatización — variante del agente anterior vía Twilio | `netlify/functions/twilio-webhook.js` | Netlify Functions | Netlify Functions | Activo/paralelo — **sigue sin confirmar con el propietario cuál es la vía canónica** (no resuelto en esta consolidación, aplazado a petición del propietario) |
| Landing genérica raíz | Redirección/landing mínima | `index.html` (minúsculas) | HTML estático | GitHub Pages + Netlify | Activo — convive con `Index.html` (mayúscula), ver deuda técnica |
| Design Studio | Estudio de diseño autónomo compartido por las Skills visuales: brand kits reales (verificados contra el CSS de cada sitio), script de render HTML→PNG/PDF (Playwright), integración Firefly preparada | `design-studio/` | Plantillas HTML + Playwright (preinstalado en sesiones cloud) + Adobe for Creativity (MCP) | No se despliega — es infraestructura de autoría, no un producto | Activo desde 2026-07-10 |

## Skills de RAX (referencia — el detalle vive en `.claude/skills/README.md`)

| Skill | Estado |
|---|---|
| `project-manager` | Activa, versionada en el repo |
| `diseno-ofipapel` | Activa, versionada en el repo — validada con la primera campaña real ("Vuelta al Cole") el 2026-07-10 |
| `sales-marketing` | Deliberadamente no incorporada — código existe en rama huérfana, aparcado hasta que `diseno-ofipapel` acumule más de una pieza real usada por el negocio |

## Infraestructura compartida

- **Despliegue dual**: GitHub Pages (`.github/workflows/pages.yml`, sirve el
  repo tal cual en cada push a `main`) y Netlify (`netlify.toml` + `build.sh`,
  compila `alquileres/` y `joe-app/`, ensambla todo en `_site/`).
- **Base de datos**: Supabase, usado realmente solo por `joe-app/` (cada uno
  con su propio `supabase-schema.sql`/config). `alquileres/` NO tiene backend
  real pese a la dependencia declarada (ver fila de arriba) — migrarlo queda
  aplazado a petición explícita del propietario (2026-07-10), no está hecho.
- **IA**: Anthropic API (Claude) usada por el agente de WhatsApp.
- **Diseño**: `design-studio/` (brand kits + render HTML→PNG/PDF + Adobe for
  Creativity), consumido por la Skill `diseno-ofipapel`.

## Deliberadamente aplazado en esta revisión (2026-07-10)

Por instrucción explícita del propietario, quedan fuera de esta consolidación
y de cualquier trabajo hasta nueva indicación: RLS/seguridad de Supabase en
`joe-app`, instrumentación/logging del bot de WhatsApp, y la migración de
`alquileres` a Supabase. Ver `.claude/rax/DEUDA_TECNICA.md` y
`ROADMAP_TECNICO.md` — siguen abiertos, no se han tocado.

## Proyectos sin clasificar / a vigilar

Ninguno detectado en esta revisión. La Skill `project-manager` debe añadir
aquí cualquier carpeta o fichero nuevo que aparezca sin clasificación previa,
en vez de integrarlo silenciosamente arriba.
