# Ofipapel — App (ecosistema RAX)

Monorepo con varios productos independientes ligados al negocio Ofipapel
(papelería) y proyectos personales del propietario. No hay un `package.json`
en la raíz: cada subproyecto se gestiona por separado. Este archivo es el
punto de entrada que Claude Code carga automáticamente al empezar cualquier
sesión — no dupliques aquí lo que ya vive en otro sitio.

## Estructura

| Ruta | Qué es | Stack |
|---|---|---|
| `Index.html` | Control financiero de Ofipapel (ventas, caja, informes, asistente IA) | HTML/CSS/JS vanilla en un único fichero, sin build. Supabase como backend (URL + clave `anon` hardcodeadas, es el modelo esperado para clientes frontend). Login 100% client-side (ver seguridad conocida). |
| `canarias-ink.html` | Catálogo/e-commerce de consumibles de impresora | HTML/CSS/JS vanilla en un único fichero, sin build. Catálogo de productos embebido como array JS. |
| `falcontrol.html` | App personal de alertas de radio, sin relación de negocio con Ofipapel | HTML/CSS/JS vanilla en un único fichero, sin build. |
| `vacaciones.html` | Planificador de cuadrante de vacaciones del personal | HTML/CSS/JS vanilla en un único fichero, sin build. |
| `importacion-pedidos-proveedores.html` | Conversión de facturas PDF de proveedores a Excel 5.0/95 | HTML/CSS/JS vanilla en un único fichero, sin build. |
| `privacidad.html`, `404.html` | Política de privacidad (review de WhatsApp Cloud API) y página 404 propia | HTML estático |
| `joe-app/` | App personal: agenda, turnos de hospital, música, seguimiento de "Limón", tareas de empresa, "Coisinhas" | React 19 + Vite + TypeScript + Tailwind 4 + Supabase (RLS real vía sesión anónima, ver seguridad). Acceso por PIN + biometría WebAuthn opcional (`PinScreen.tsx`), sin distinguir personas. |
| `alquileres/` | Gestión de alquileres vacacionales: reservas, precios, reparaciones, cobros, analítica | React 19 + Vite + TypeScript + Tailwind 4 + Recharts. Backend **Firebase Firestore** (`contexts/DataContext.tsx`, tiempo real vía `onSnapshot`) con login por persona (`LoginScreen.tsx`, Luis/Rober) y migración automática de datos antiguos de `localStorage` (`MigrateLocalData.tsx`). `@supabase/supabase-js` sigue como dependencia en `package.json` pero ya no se usa en ningún fichero — dependencia muerta, ver `.claude/rax/DEUDA_TECNICA.md` DT-10. |
| `netlify/functions/` | Bot de WhatsApp con IA + proxy del Asistente IA de `Index.html` | Netlify Functions. `whatsapp-webhook.js` (Meta Cloud API) y `twilio-webhook.js` (Twilio, alternativa — cuál es la canónica sigue sin decidirse) comparten `whatsapp-agent-core.js` (matching de FAQ + llamada a Claude) y `whatsapp-agent-config.js` (datos del negocio). `chat-assistant.js` es un proxy aparte para el chat de `Index.html`: la API key de Anthropic vive solo aquí, nunca en el navegador. |
| `design-studio/` | Estudio de diseño autónomo de RAX: banners, posts, flyers, edición de imagen | Ver `design-studio/README.md` — brand kit real por app (verificado contra el CSS de cada una), script de render HTML→PNG/PDF (`render-html.js`, probado), integración con Adobe Firefly API (`firefly-generate.js`, código completo, sin probar — pendiente de credenciales). No se ejecuta como parte de ningún build; es una herramienta que se invoca a demanda. |

Los HTML monolíticos (`Index.html`, `canarias-ink.html`, `falcontrol.html`,
`vacaciones.html`, `importacion-pedidos-proveedores.html`) no tienen proceso
de build: se sirven tal cual. Cualquier cambio se hace editando el fichero
directamente (CSS y JS están embebidos inline).

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
- **GitHub Pages** (`.github/workflows/pages.yml`) es el respaldo: ejecuta
  `bash build.sh` (el mismo script que Netlify, sin duplicar la lista de
  ficheros a mano) y publica `_site/`, así que genera exactamente el mismo
  resultado en ambas plataformas.
- **CI** (`.github/workflows/ci.yml`) corre `lint` + `build` (incluye
  `tsc -b`) para `joe-app` y `alquileres` en cada PR y push a `main`. Los
  HTML monolíticos no tienen build ni lint automatizado.
- `.github/dependabot.yml` abre PRs semanales de actualización de
  dependencias npm para ambas apps y de GitHub Actions.

## Variables de entorno / secretos

Configurados en Netlify (Site settings → Environment variables), **no** en
el repo:
- `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_APP_SECRET` — Meta Cloud API (ver `WHATSAPP_SETUP.md`).
- `ANTHROPIC_API_KEY` — usada tanto por el bot de WhatsApp como por
  `netlify/functions/chat-assistant.js` (proxy del chat de `Index.html`).
- `CHAT_ASSISTANT_TOKEN` — token compartido para el proxy del chat; debe
  coincidir con `APP_CHAT_TOKEN` en `Index.html`. No es un secreto real
  (`Index.html` es HTML estático, visible con "ver código fuente"), solo
  evita dejar el endpoint completamente abierto.
- `joe-app` usa `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` vía
  `.env.local` (no versionado) en desarrollo, inyectadas por Netlify en
  producción. Requiere además **"Allow anonymous sign-ins"** activado en
  Supabase (Authentication → Sign In / Providers) para que la sesión
  anónima de RLS funcione.
- `alquileres` usa credenciales de Firebase (ver `alquileres/src/lib/firebase.ts`)
  para Firestore y Firebase Authentication. Requiere activar el proveedor
  "Anonymous" en Firebase Console → Authentication → Sign-in method y
  desplegar `alquileres/firestore.rules` para que las reglas de acceso
  estén realmente activas.
- `FIREFLY_CLIENT_ID` / `FIREFLY_CLIENT_SECRET` (opcionales, no configuradas
  todavía) — credenciales OAuth Server-to-Server de Adobe Developer Console
  para `design-studio/scripts/firefly-generate.js`. Ver `design-studio/README.md`.

Los HTML monolíticos llevan la URL y la clave `publishable`/`anon` de
Supabase **hardcodeadas en el propio fichero** (modelo esperado en Supabase
para clientes puramente frontend, protegido por RLS — no es una key
secreta, pero conviene verificar periódicamente que las políticas RLS son
correctas; la de `Index.html` sigue sin verificar, ver seguridad conocida).

## Seguridad conocida

- `Index.html`: login 100% client-side (hash SHA-256 sin salt, contraseña
  por defecto compartida entre los 4 usuarios) y estado de RLS de Supabase
  sin verificar. Abierto, requiere decisión del propietario
  (`.claude/rax/DEUDA_TECNICA.md` DT-09).
- `alquileres`: `LoginScreen.tsx` comparte **el mismo hash de contraseña
  por defecto** que `Index.html` entre sus dos usuarios (Luis/Rober) — no
  es casualidad, es el mismo valor. Mismo tipo de riesgo, mismo origen
  (DT-11).
- `joe-app`: ya resuelto — sesión anónima de Supabase Auth + RLS real
  (`to authenticated`, no `to anon`).
- El Asistente IA de `Index.html`: ya resuelto — proxy server-side, la API
  key de Anthropic ya no vive en el navegador.
- Dos canales de WhatsApp activos en paralelo (Meta y Twilio) sin decidir
  cuál es el canónico — ambos comparten ya la misma lógica interna
  (`whatsapp-agent-core.js`), pero la decisión de negocio sigue abierta.

## Estudio de diseño (RAX)

`design-studio/README.md` documenta cómo crear banners, posts, flyers y
gráficos para Ofipapel de forma autónoma: qué herramienta usar según la
tarea, el brand kit real de cada app (colores/tipografía verificados contra
el CSS real, no inventados), el script de render HTML→PNG/PDF standalone, y
la integración (preparada, pendiente de credenciales) con Adobe Firefly
API. Consultar ese documento antes de abordar cualquier encargo visual.

`.claude/brand/` es la fuente única de verdad de la identidad de marca de
OFIPAPEL (logotipo oficial, paleta, tipografía, reglas de uso, plantillas
y ejemplos aprobados por el propietario). Cualquier Skill que genere
contenido gráfico o publicitario para Ofipapel debe consultar
`.claude/brand/reglas.md` antes de producir nada; ante contradicción con
un prompt puntual, prevalece siempre lo que hay ahí. Ver
`.claude/brand/README.md`.

## Skills de RAX

`.claude/skills/` — sistema modular de Skills de Claude Code para este
repo. Cada Skill es una carpeta autocontenida con su propio `SKILL.md`;
añadir una Skill nueva nunca requiere modificar una existente. Catálogo y
convenciones en `.claude/skills/README.md`.

`.claude/rax/` es el "cerebro" persistente del ecosistema (inventario,
roadmaps, deuda técnica, decisiones, historial de sesiones) — independiente
de cualquier Skill concreta, para que todas puedan leerlo sin acoplarse
entre sí. La Skill `project-manager` es responsable de mantenerlo al día;
al empezar una sesión de trabajo real sobre este repo, actívala primero
para tener contexto antes de tocar código.

## Convenciones

- **Ramas, PRs y ciclo de vida de las ramas**: ver `CONTRIBUTING.md` —
  comprobar ramas activas antes de crear una nueva, proceso de
  reconciliación, y criterio para cerrar o eliminar ramas. No lo dupliques
  aquí.
- Nombres de commit descriptivos, en español, estilo `fix:`/`feat:` cuando aplica.
- No existen tests automatizados todavía en ninguna parte del repo (CI
  cubre lint + build, no tests).
- `joe-app` y `alquileres` comparten patrón de ESLint flat config
  (`eslint.config.js`) con `typescript-eslint` + `eslint-plugin-react-hooks`.
  `alquileres` tiene `react-hooks/set-state-in-effect` degradado a warning
  (deuda conocida, con TODO en el propio fichero) por varios efectos
  preexistentes en `Reservations.tsx` y `MigrateLocalData.tsx`.
- Antes de crear un documento, Skill o carpeta nueva, comprueba en
  `.claude/skills/README.md` y `.claude/rax/INVENTORY.md` que no exista ya
  algo equivalente. Máximo impacto · mínimo riesgo · cero duplicidades.
