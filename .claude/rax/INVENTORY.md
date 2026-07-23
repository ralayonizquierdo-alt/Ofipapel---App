# Inventario de proyectos — RAX

Mantenido por la Skill `project-manager`. Refleja el estado real del repo
`ralayonizquierdo-alt/Ofipapel---App`. Última revisión completa: 2026-07-12
(Sprint "RAX v1 Production").

| Proyecto | Tipo | Ruta | Stack | Despliegue | Estado |
|---|---|---|---|---|---|
| Ofipapel · Control Financiero | Sitio/app de negocio (papelería) | `Index.html` | HTML monolítico + Chart.js + Supabase JS + SheetJS. Asistente de IA vía proxy server-side (`netlify/functions/chat-assistant.js`) — ya no expone la API key de Anthropic en el navegador | GitHub Pages + Netlify (`_site/`) | Activo |
| Canarias INK | Microsite de marca (venta de consumibles de impresora) | `canarias-ink.html` | HTML monolítico | GitHub Pages + Netlify | Activo — botón de WhatsApp con número placeholder, ver `ROADMAP_TECNICO.md` |
| FalControl | Microsite/herramienta personal ("Radio Alerta"), sin relación de negocio con Ofipapel | `falcontrol.html` | HTML monolítico | GitHub Pages + Netlify | Activo |
| Cuadrante de Vacaciones | Planificador de turnos/vacaciones del personal | `vacaciones.html` | HTML monolítico | GitHub Pages + Netlify | Activo — detectado durante la reconciliación de documentación, no auditado en profundidad todavía (ver `ROADMAP_TECNICO.md` RT-11) |
| Importación de Pedidos a Proveedores | Conversión de facturas PDF a Excel para proveedores | `importacion-pedidos-proveedores.html` | HTML monolítico | GitHub Pages + Netlify | Activo — detectado durante la reconciliación de documentación, no auditado en profundidad todavía (ver `ROADMAP_TECNICO.md` RT-11) |
| Alquileres | Aplicación interna de gestión (8 apartamentos reales) | `alquileres/` | React 19 + Vite + TS + Tailwind 4 + Recharts + **Firebase Firestore** (proyecto `ofipapelvv`) — backend real confirmado, con login de app (Luis/Rober) y reglas de acceso (`alquileres/firestore.rules`, pendiente de activar el proveedor Anonymous y desplegar). `package.json` conserva `@supabase/supabase-js` sin usarse en ningún fichero, dependencia muerta del intento anterior (`DEUDA_TECNICA.md` DT-10) | Netlify (build propio, `_site/alquileres/`) | Activo |
| Joe App | Aplicación familiar/personal (calendario, turnos, "coisinhas", música, negocio) | `joe-app/` | React 19 + Vite + TS + Supabase + PIN/biometría (WebAuthn) de acceso a la UI + sesión anónima Supabase para RLS | Netlify (`_site/joe/`) | Activo |
| Agente WhatsApp (Meta Cloud API) | Automatización — auto-respuesta con reglas + IA (Claude) | `netlify/functions/whatsapp-webhook.js`, `whatsapp-agent-config.js` | Netlify Functions + Anthropic API | Netlify Functions | Activo (ver `WHATSAPP_SETUP.md`) |
| Agente WhatsApp (Twilio, alternativa) | Automatización — variante del agente anterior vía Twilio | `netlify/functions/twilio-webhook.js` | Netlify Functions | Netlify Functions | Activo/paralelo — **sigue sin confirmar con el propietario cuál es la vía canónica** |
| Landing genérica raíz | Redirect a `Index.html` | `index.html` (minúsculas) | HTML estático, `location.replace('Index.html')` | GitHub Pages + Netlify | Activo — confirmado intencional, no es deuda técnica |
| Página 404 propia | Página de error personalizada | `404.html` | HTML estático | GitHub Pages + Netlify | Activo — integrada en `build.sh` |
| Design Studio | Estudio de diseño autónomo compartido por las Skills visuales | `design-studio/` | Plantillas HTML + Playwright + Adobe for Creativity (MCP) | No se despliega | Activo — validado con la campaña real "Vuelta al Cole" |
| Fichaje | Registro horario del personal (RD-ley 8/2019 + preparado para la reforma pendiente) | `fichaje.html` | HTML monolítico + Firestore REST sin SDK. **Proyecto Firebase propio** (`ofipapel-fichaje-63ced`, "Ofipapel Fichaje") separado de Vacaciones/Alquileres a petición del propietario — mantiene una conexión de solo lectura aparte al proyecto `ofipapelvv` únicamente para leer la plantilla de `vacaciones.html` (sin duplicarla). PIN propio por persona (hash SHA-256) + 3 cuentas de gerencia (Luis/Rober/David, cuentas nuevas en el proyecto nuevo) + horario individual por persona (con horario de departamento como valor por defecto); eventos inmutables (nunca se edita/borra, solo se enlaza una corrección) | GitHub Pages + Netlify | Activo — pendiente activar el proveedor "Anonymous" en **ambos** proyectos Firebase (`ofipapel-fichaje-63ced` y `ofipapelvv`, este último ya pendiente también para `alquileres`), crear Firestore Database en el proyecto nuevo, y dar de alta a Luis/Rober/David como usuarios ahí |

## Skills de RAX (referencia — el detalle vive en `.claude/skills/README.md`)

| Skill | Estado |
|---|---|
| `project-manager` | Activa |
| `diseno-ofipapel` | Activa — validada con una campaña real |
| `sales-marketing` | No incorporada — aparcada hasta que `diseno-ofipapel` acumule más piezas reales |

## Infraestructura compartida

- **Despliegue dual**: GitHub Pages (`.github/workflows/pages.yml`) y Netlify (`netlify.toml` + `build.sh`).
- **CI**: `.github/workflows/ci.yml` (lint + build de `joe-app`/`alquileres` en cada PR/push a `main`) + `.github/dependabot.yml` (actualizaciones semanales).
- **Bases de datos**: Supabase (`joe-app`, con RLS + sesión anónima) y Firebase Firestore (`alquileres`, con reglas + sesión anónima). Dos backends distintos por decisión explícita del propietario — no se unifican.
- **IA**: Anthropic API, usada por el agente de WhatsApp y por el proxy `chat-assistant.js` de `Index.html`.
- **Diseño**: `design-studio/`, consumido por `diseno-ofipapel`.

## Pendiente de activación en consolas externas (no ejecutable desde este repo)

- Supabase (`joe-app`): activar "Allow anonymous sign-ins".
- Firebase (`ofipapelvv`): activar el proveedor "Anonymous" y desplegar `alquileres/firestore.rules`.
- Netlify: configurar `CHAT_ASSISTANT_TOKEN` (debe coincidir con `APP_CHAT_TOKEN` en `Index.html`).

## Deliberadamente fuera de alcance de este sprint

Login con identidad real (Firebase Auth / Supabase Auth) en `alquileres` e
`Index.html` — hoy siguen siendo una contraseña client-side, no un control
de acceso a los datos (`DT-09`). Decidir el canal de WhatsApp canónico y
corregir el número de WhatsApp de Canarias INK — pendientes de datos que
solo tiene el propietario.

## Proyectos sin clasificar / a vigilar

- `catalogo_ofipapel_2026.html` (catálogo/tarifa de librería para imprenta):
  vive solo en una rama sin fusionar y sin relación con RAX
  (`claude/shared-conversation-access-2kj9iv`), detectado durante la
  reconciliación de documentación de `claude/rax-v1-consolidacion`. Fuera
  del alcance de esta consolidación — no se ha tocado ni evaluado a fondo.
