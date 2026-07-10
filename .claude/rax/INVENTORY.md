# Inventario de proyectos — RAX

Mantenido por la Skill `project-manager`. Refleja el estado real del repo
`ralayonizquierdo-alt/Ofipapel---App`. Última revisión completa: 2026-07-10.

| Proyecto | Tipo | Ruta | Stack | Despliegue | Estado |
|---|---|---|---|---|---|
| Ofipapel · Control Financiero | Sitio/app de negocio (papelería) | `Index.html` | HTML monolítico + Chart.js + Supabase JS + SheetJS | GitHub Pages + Netlify (`_site/`) | Activo |
| Canarias INK | Microsite de marca (venta de consumibles de impresora) | `canarias-ink.html` | HTML monolítico | GitHub Pages + Netlify | Activo |
| FalControl | Microsite/herramienta ("Radio Alerta") | `falcontrol.html` | HTML monolítico | GitHub Pages + Netlify | Activo |
| Alquileres | Aplicación interna de gestión | `alquileres/` | React 19 + Vite + TS + Tailwind 4 + Supabase + Recharts | Netlify (build propio, `_site/alquileres/`) | Activo |
| Joe App | Aplicación familiar/personal (calendario, turnos, "coisinhas", música, negocio) | `joe-app/` | React 19 + Vite + TS + Supabase | Netlify (`_site/joe/`) | Activo |
| Agente WhatsApp (Meta Cloud API) | Automatización — auto-respuesta con reglas + IA (Claude) | `netlify/functions/whatsapp-webhook.js`, `whatsapp-agent-config.js` | Netlify Functions + Anthropic API | Netlify Functions | Activo (ver `WHATSAPP_SETUP.md`) |
| Agente WhatsApp (Twilio, alternativa) | Automatización — variante del agente anterior vía Twilio | `netlify/functions/twilio-webhook.js` | Netlify Functions | Netlify Functions | Activo/paralelo — **confirmar con el propietario cuál es la vía canónica** |
| Landing genérica raíz | Redirección/landing mínima | `index.html` (minúsculas) | HTML estático | GitHub Pages + Netlify | Activo — convive con `Index.html` (mayúscula), ver deuda técnica |

## Skills de RAX (referencia — el detalle vive en `.claude/skills/README.md`)

| Skill | Estado |
|---|---|
| `project-manager` | Activa, versionada en el repo |
| `diseno-ofipapel` | Pendiente de migrar desde carpeta local (no versionada aún) |

## Infraestructura compartida

- **Despliegue dual**: GitHub Pages (`.github/workflows/pages.yml`, sirve el
  repo tal cual en cada push a `main`) y Netlify (`netlify.toml` + `build.sh`,
  compila `alquileres/` y `joe-app/`, ensambla todo en `_site/`).
- **Base de datos**: Supabase, usado por `alquileres/` y `joe-app/` (cada
  uno con su propio `supabase-schema.sql`/config — no hay un esquema
  compartido documentado todavía).
- **IA**: Anthropic API (Claude) usada por el agente de WhatsApp.

## Proyectos sin clasificar / a vigilar

Ninguno detectado en esta revisión inicial. La Skill `project-manager` debe
añadir aquí cualquier carpeta o fichero nuevo que aparezca sin
clasificación previa, en vez de integrarlo silenciosamente arriba.
