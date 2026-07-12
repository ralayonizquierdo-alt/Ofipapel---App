# Inventario de proyectos — RAX

Mantenido por la Skill `project-manager`. Refleja el estado real del repo
`ralayonizquierdo-alt/Ofipapel---App` sobre `main` ya consolidado. Última
revisión completa: 2026-07-12.

| Proyecto | Tipo | Ruta | Stack | Despliegue | Estado |
|---|---|---|---|---|---|
| Ofipapel · Control Financiero | Sitio/app de negocio (papelería) | `Index.html` | HTML monolítico + Chart.js + Supabase JS + SheetJS | GitHub Pages + Netlify (`_site/`) | Activo — Asistente IA vía proxy server-side (`chat-assistant.js`); login sigue siendo client-side (ver DEUDA_TECNICA DT-06/DT-07) |
| Canarias INK | Microsite de marca (venta de consumibles) | `canarias-ink.html` | HTML monolítico | GitHub Pages + Netlify | Activo |
| FalControl | Microsite/herramienta personal ("Radio Alerta"), sin relación de negocio con Ofipapel | `falcontrol.html` | HTML monolítico | GitHub Pages + Netlify | Activo |
| Cuadrante de Vacaciones | Planificador de turnos/vacaciones del personal | `vacaciones.html` | HTML monolítico | GitHub Pages + Netlify | Activo — descubierto durante esta consolidación, no auditado en detalle todavía |
| Importación de Pedidos a Proveedores | Conversión de facturas PDF a Excel 5.0/95 | `importacion-pedidos-proveedores.html` | HTML monolítico | GitHub Pages + Netlify | Activo — descubierto durante esta consolidación, no auditado en detalle todavía |
| Alquileres | Aplicación interna de gestión (8 apartamentos reales) | `alquileres/` | React 19 + Vite + TS + Tailwind 4 + Recharts + **Firebase Firestore** (tiempo real) + Firebase Auth (login por persona) | Netlify (build propio, `_site/alquileres/`) | Activo — backend real desde esta consolidación (antes solo `localStorage`); `@supabase/supabase-js` sigue en `package.json` sin usarse en ningún fichero (dependencia muerta, ver DT-10) |
| Joe App | Aplicación familiar/personal (calendario, turnos, "coisinhas", música, negocio) | `joe-app/` | React 19 + Vite + TS + Supabase (RLS real vía sesión anónima) | Netlify (`_site/joe/`) | Activo — acceso por PIN + biometría WebAuthn opcional, sin distinguir personas |
| Agente WhatsApp (Meta Cloud API) | Automatización — auto-respuesta con reglas + IA (Claude) | `netlify/functions/whatsapp-webhook.js` | Netlify Functions + Anthropic API, lógica compartida vía `whatsapp-agent-core.js` | Netlify Functions | Activo (ver `WHATSAPP_SETUP.md`) |
| Agente WhatsApp (Twilio, alternativa) | Automatización — variante del agente anterior vía Twilio | `netlify/functions/twilio-webhook.js` | Netlify Functions, misma lógica compartida | Netlify Functions | Activo/paralelo — **sigue sin decidirse cuál es la vía canónica** (RT-01) |
| Asistente IA de Index.html | Proxy server-side para el chat del Control Financiero | `netlify/functions/chat-assistant.js` | Netlify Functions + Anthropic API | Netlify Functions | Activo — resuelto en esta consolidación (antes exponía keys en el navegador) |
| Estudio de diseño (design-studio) | Herramienta de apoyo para banners/posts/flyers on-brand | `design-studio/` | Node scripts + Adobe for Creativity (MCP) + Adobe Firefly API (opcional) | No se despliega — se invoca a demanda desde una sesión de Claude Code | Activo — `render-html.js` probado, `firefly-generate.js` sin probar (pendiente credenciales) |
| Landing genérica raíz | Redirección/landing mínima | `index.html` (minúsculas) | HTML estático | GitHub Pages + Netlify | Activo — convive con `Index.html` (mayúscula); sigue sin resolver cuál es el vigente (DT-02) |
| Página 404 propia | Página de error personalizada | `404.html` | HTML estático | GitHub Pages + Netlify | Activo — recién integrada en `build.sh` |
| Producto: catálogo Ofipapel 2026 | Catálogo/tarifa de librería para imprenta | `catalogo_ofipapel_2026.html` | HTML | No desplegado — vive solo en una rama sin fusionar (`claude/shared-conversation-access-2kj9iv`) | **Inactivo con valor, fuera del alcance de esta consolidación de RAX** — no evaluado a fondo, ver informe de ramas |

## Skills de RAX (referencia — el detalle vive en `.claude/skills/README.md`)

| Skill | Estado |
|---|---|
| `project-manager` | Activa, versionada en el repo |
| `diseno-ofipapel` | Activa, versionada en el repo, depende de `design-studio/` |
| `sales-marketing` | Deliberadamente no incorporada (ver `.claude/skills/README.md` y `DECISIONES.md`) — código conservado en `claude/rax-sales-marketing-skill-4raaru` |

## Infraestructura compartida

- **Despliegue dual**: GitHub Pages (`.github/workflows/pages.yml`, ejecuta
  `bash build.sh` — ya no duplica la lista de ficheros a mano) y Netlify
  (`netlify.toml` + `build.sh`).
- **CI**: `.github/workflows/ci.yml` (lint + build de `joe-app`/`alquileres`
  en cada PR/push a `main`) + `.github/dependabot.yml` (actualizaciones
  semanales).
- **Bases de datos**: Firebase Firestore (`alquileres`) y Supabase
  (`joe-app`, `Index.html` — proyectos independientes, no compartidos).
- **IA**: Anthropic API (Claude), usada por el bot de WhatsApp y por el
  proxy del chat de `Index.html`.

## Proyectos sin clasificar / a vigilar

- `vacaciones.html` e `importacion-pedidos-proveedores.html`: existen y
  están desplegados, pero no se auditaron en profundidad durante esta
  consolidación (el foco era RAX). Pendiente de una revisión dedicada.
- `catalogo_ofipapel_2026.html` (rama `claude/shared-conversation-access-2kj9iv`,
  último commit 2026-06-29): fuera del alcance de esta consolidación. No
  tocar sin revisión aparte — ver informe de clasificación de ramas.
