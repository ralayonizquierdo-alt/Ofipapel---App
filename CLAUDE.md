# Ofipapel — App (ecosistema RAX)

Monorepo con varios productos independientes ligados al negocio Ofipapel
(papelería) y proyectos personales del propietario. No hay un `package.json`
en la raíz: cada subproyecto se gestiona por separado. Este archivo es el
punto de entrada que Claude Code carga automáticamente al empezar cualquier
sesión — no dupliques aquí lo que ya vive en otro sitio.

## Estructura

| Ruta | Qué es | Stack |
|---|---|---|
| `Index.html` | Control financiero de Ofipapel (ventas, caja, informes) | HTML/CSS/JS vanilla en un único fichero, sin build. Supabase como backend (URL + clave `anon` hardcodeadas en el fichero, es el modelo esperado para clientes frontend). Asistente de IA vía proxy server-side (`netlify/functions/chat-assistant.js`), no llama a Anthropic directamente desde el navegador. |
| `canarias-ink.html` | Catálogo/e-commerce de consumibles de impresora | HTML/CSS/JS vanilla en un único fichero, sin build. Catálogo de productos embebido como array JS. |
| `falcontrol.html` | App personal de alertas de radio, sin relación de negocio con Ofipapel | HTML/CSS/JS vanilla en un único fichero, sin build. |
| `privacidad.html` | Política de privacidad (requerida para el review de la app de WhatsApp Cloud API) | HTML estático |
| `joe-app/` | App personal: agenda, turnos de hospital, música, seguimiento de "Limón", tareas de empresa, "Coisinhas" | React 19 + Vite + TypeScript + Tailwind 4 + Supabase (persistencia real en la nube) |
| `alquileres/` | Gestión de alquileres vacacionales: reservas, precios, reparaciones, cobros, analítica | React 19 + Vite + TypeScript + Tailwind 4 + Recharts + **Firebase Firestore** (proyecto `ofipapelvv`) como backend real, con login de app y `firestore.rules` (pendiente de activar el proveedor Anonymous y desplegar, ver `.claude/rax/DEUDA_TECNICA.md`). |
| `netlify/functions/` | Bot de WhatsApp con IA para atención al cliente | Netlify Functions. `whatsapp-webhook.js` (Meta Cloud API) y `twilio-webhook.js` (alternativa Twilio) — cuál de las dos es la canónica sigue sin decidirse, ver deuda técnica. Usa `whatsapp-agent-config.js` (reglas FAQ + prompt) y la API de Anthropic cuando ninguna regla coincide. |
| `design-studio/` | Estudio de diseño autónomo de RAX: banners, posts, landing pages, edición de imagen | Ver `design-studio/README.md` — plantillas HTML renderizadas con Playwright/Chromium + Adobe for Creativity (MCP) + Adobe Firefly API (opcional, requiere credenciales) |

Los tres HTML monolíticos (`Index.html`, `canarias-ink.html`, `falcontrol.html`)
no tienen proceso de build: se sirven tal cual. Cualquier cambio se hace
editando el fichero directamente (CSS y JS están embebidos inline).

## Comandos

### `joe-app/` y `alquileres/` (idénticos entre sí)
```bash
npm ci             # instalar dependencias
npm run dev        # servidor de desarrollo (Vite)
npm run lint       # ESLint
npm run build      # tsc -b && vite build → genera dist/
npm run preview    # sirve el build de producción localmente
```

### Build completo (como en producción)
```bash
bash build.sh   # compila alquileres y joe-app, y ensambla todo en _site/
```

## Despliegue

- **Netlify** (`netlify.toml`) es la fuente de verdad: ejecuta `build.sh`,
  publica `_site/` y sirve las funciones serverless de `netlify/functions/`.
  Rutas: `/alquileres/*` → `alquileres/dist`, `/joe/*` → `joe-app/dist`,
  el resto son los HTML estáticos de la raíz.
- **GitHub Pages** (`.github/workflows/pages.yml`) es el respaldo: ejecuta el
  mismo `build.sh` que Netlify y publica `_site/`, así que genera exactamente
  el mismo resultado en ambas plataformas.
- No hay CI de verificación (lint/build) antes de desplegar todavía — existe
  como propuesta escrita (`RT-03` en `.claude/rax/ROADMAP_TECNICO.md`) pero
  deliberadamente no se ha activado en esta consolidación.

## Variables de entorno / secretos

Configurados en Netlify (Site settings → Environment variables), **no** en
el repo:
- `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_APP_SECRET` — Meta Cloud API (ver `WHATSAPP_SETUP.md`).
- `ANTHROPIC_API_KEY` — usada por el bot de WhatsApp y por
  `netlify/functions/chat-assistant.js` (proxy del asistente de IA de
  `Index.html`).
- `CHAT_ASSISTANT_TOKEN` — token compartido para `chat-assistant.js`; debe
  coincidir exactamente con la constante `APP_CHAT_TOKEN` embebida en
  `Index.html`. No es un secreto real (Index.html es HTML estático visible
  con "ver código fuente"), solo evita dejar el endpoint completamente
  abierto — ver el comentario en `chat-assistant.js`.
- `joe-app` usa `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` vía
  `.env.local` (no versionado) en desarrollo, e inyectadas por Netlify en
  producción. Requiere además "Allow anonymous sign-ins" activado en
  Supabase (Authentication > Sign In / Providers) para que el RLS
  funcione — sin eso, la app sigue funcionando pero sin el blindaje activo.
- `alquileres` usa **Firebase Firestore** (proyecto `ofipapelvv`), con la
  config ya embebida en `alquileres/src/lib/firebase.ts` (no requiere
  variables de entorno). Requiere activar el proveedor "Anonymous" en
  Firebase Console > Authentication > Sign-in method y desplegar
  `alquileres/firestore.rules` para que las reglas de acceso estén
  realmente activas.
- `FIREFLY_CLIENT_ID` / `FIREFLY_CLIENT_SECRET` (opcionales, no configuradas
  todavía) — credenciales OAuth Server-to-Server de Adobe Developer Console
  para `design-studio/scripts/firefly-generate.js`. Ver `design-studio/README.md`.

## Estudio de diseño (RAX)

`design-studio/README.md` documenta cómo crear banners, posts, landing pages
y gráficos para Ofipapel de forma autónoma: qué herramientas del conector
Adobe for Creativity usar para cada tarea, la paleta/tipografía real de cada
una de las 3 apps (verificada contra el CSS real de cada sitio, no inventada),
el script de render HTML→PNG/PDF standalone (`design-studio/scripts/render-html.js`,
usa Playwright/Chromium ya preinstalado en las sesiones en la nube), y la
integración (preparada, pendiente de credenciales) con Adobe Firefly API.
Consultar ese documento antes de abordar cualquier encargo visual.

## Skills de RAX

`.claude/skills/` — sistema modular de Skills de Claude Code para este repo.
Cada Skill es una carpeta autocontenida con su propio `SKILL.md`; añadir una
Skill nueva nunca requiere modificar una existente. Catálogo y convenciones
en `.claude/skills/README.md`.

`.claude/rax/` es el "cerebro" persistente del ecosistema (inventario,
roadmaps, deuda técnica, decisiones, historial de sesiones) — independiente
de cualquier Skill concreta, para que todas puedan leerlo sin acoplarse
entre sí. La Skill `project-manager` es responsable de mantenerlo al día; al
empezar una sesión de trabajo real sobre este repo, actívala primero para
tener contexto antes de tocar código.

## Convenciones

- Nombres de commit descriptivos, en español, estilo `fix:`/`feat:` cuando aplica.
- No existen tests automatizados todavía en ninguna parte del repo.
- `joe-app` y `alquileres` comparten patrón de ESLint flat config
  (`eslint.config.js`) con `typescript-eslint` + `eslint-plugin-react-hooks`.
- Antes de crear un documento, Skill o carpeta nueva, comprueba en
  `.claude/skills/README.md` y `.claude/rax/INVENTORY.md` que no exista ya
  algo equivalente. Máximo impacto · mínimo riesgo · cero duplicidades.
