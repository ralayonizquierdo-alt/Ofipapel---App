# Ofipapel — App

Monorepo con varios productos independientes ligados al negocio Ofipapel
(papelería) y proyectos personales del propietario. No hay un `package.json`
en la raíz: cada subproyecto se gestiona por separado.

## Estructura

| Ruta | Qué es | Stack |
|---|---|---|
| `Index.html` | Control financiero de Ofipapel (ventas, caja, informes) | HTML/CSS/JS vanilla en un único fichero, sin build. Supabase como backend. |
| `canarias-ink.html` | Catálogo/e-commerce de consumibles de impresora | HTML/CSS/JS vanilla en un único fichero, sin build. Catálogo de productos embebido como array JS. |
| `falcontrol.html` | App de alertas de radio | HTML/CSS/JS vanilla en un único fichero, sin build. |
| `privacidad.html` | Política de privacidad (requerida para el review de la app de WhatsApp Cloud API) | HTML estático |
| `joe-app/` | App personal: agenda, turnos de hospital, música, seguimiento de "Limón", tareas de empresa, "Coisinhas" | React 19 + Vite + TypeScript + Tailwind 4 + Supabase (persistencia real en la nube) |
| `alquileres/` | Gestión de alquileres vacacionales: reservas, precios, reparaciones, cobros, analítica | React 19 + Vite + TypeScript + Tailwind 4 + Recharts. **Persistencia solo en `localStorage` del navegador** — pese a tener `@supabase/supabase-js` como dependencia, no se usa; no hay sync entre dispositivos ni backend real. |
| `netlify/functions/` | Bot de WhatsApp con IA para atención al cliente | Netlify Functions (Node). `whatsapp-webhook.js` (Meta Cloud API) y `twilio-webhook.js` (alternativa Twilio) comparten `whatsapp-agent-config.js` (reglas FAQ + prompt). Usa Claude Haiku (`claude-haiku-4-5-20251001`) vía API de Anthropic cuando ninguna regla de FAQ coincide. |

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
- **GitHub Pages** (`.github/workflows/pages.yml`) despliega el repo en
  cada push a `main`, pero publica el código **sin compilar** — `joe-app`
  y `alquileres` no funcionan correctamente ahí porque no pasan por Vite.
  Antes de depender de esa URL, hay que alinear el workflow con `build.sh`.

## CI

`.github/workflows/ci.yml` corre `lint` + `build` (que incluye `tsc -b`) para
`joe-app` y `alquileres` en cada PR y push a `main`. Los HTML monolíticos no
tienen build ni lint automatizado.

`.github/dependabot.yml` abre PRs semanales de actualización de dependencias
npm para ambas apps y de GitHub Actions.

## Variables de entorno / secretos

Configurados en Netlify (Site settings → Environment variables), **no** en
el repo:
- `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_APP_SECRET` — Meta Cloud API (ver `WHATSAPP_SETUP.md`).
- `ANTHROPIC_API_KEY` — respuestas de IA del bot de WhatsApp.
- `joe-app` y `alquileres` usan `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
  vía `.env.local` (no versionado) en desarrollo, e inyectadas por Netlify en
  producción.

Los HTML monolíticos llevan la URL y la clave `publishable` de Supabase
**hardcodeadas en el propio fichero** (es el modelo esperado en Supabase para
clientes puramente frontend, protegido por RLS en las tablas — no es una key
secreta, pero conviene verificar periódicamente que las políticas RLS de
Supabase son correctas).

## Convenciones

- Nombres de commit descriptivos, en español, estilo `fix:`/`feat:` cuando aplica.
- No existen tests automatizados todavía en ninguna parte del repo.
- `joe-app` y `alquileres` comparten patrón de ESLint flat config
  (`eslint.config.js`) con `typescript-eslint` + `eslint-plugin-react-hooks`.
