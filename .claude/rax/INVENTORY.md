# Inventario de proyectos — RAX

Mantenido por la Skill `project-manager`. Refleja el estado real del repo
`ralayonizquierdo-alt/Ofipapel---App`. Última revisión completa: 2026-07-12
(Sprint "RAX v1 Production").

| Proyecto | Tipo | Ruta | Stack | Despliegue | Estado |
|---|---|---|---|---|---|
| Ofipapel · Control Financiero | Sitio/app de negocio (papelería) | `Index.html` | HTML monolítico + Chart.js + Supabase JS + SheetJS. Asistente de IA vía proxy server-side (`netlify/functions/chat-assistant.js`) — ya no expone la API key de Anthropic en el navegador | GitHub Pages + Netlify (`_site/`) | Activo |
| Canarias INK | Microsite de marca (venta de consumibles de impresora) | `canarias-ink.html` | HTML monolítico | GitHub Pages + Netlify | Activo — botón de WhatsApp con número placeholder, ver `ROADMAP_TECNICO.md` |
| FalControl | Microsite/herramienta personal ("Radio Alerta"), sin relación de negocio con Ofipapel | `falcontrol.html` | HTML monolítico | GitHub Pages + Netlify | Activo |
| Alquileres | Aplicación interna de gestión (8 apartamentos reales) | `alquileres/` | React 19 + Vite + TS + Tailwind 4 + Recharts + **Firebase Firestore** (proyecto `ofipapelvv`) — backend real confirmado, con login de app (Luis/Rober) y reglas de acceso (`alquileres/firestore.rules`, pendiente de activar el proveedor Anonymous y desplegar) | Netlify (build propio, `_site/alquileres/`) | Activo |
| Joe App | Aplicación familiar/personal (calendario, turnos, "coisinhas", música, negocio) | `joe-app/` | React 19 + Vite + TS + Supabase + PIN/biometría (WebAuthn) de acceso a la UI + sesión anónima Supabase para RLS | Netlify (`_site/joe/`) | Activo |
| Agente WhatsApp (Meta Cloud API) | Automatización — auto-respuesta con reglas + IA (Claude) | `netlify/functions/whatsapp-webhook.js`, `whatsapp-agent-config.js` | Netlify Functions + Anthropic API | Netlify Functions | Activo (ver `WHATSAPP_SETUP.md`) |
| Agente WhatsApp (Twilio, alternativa) | Automatización — variante del agente anterior vía Twilio | `netlify/functions/twilio-webhook.js` | Netlify Functions | Netlify Functions | Activo/paralelo — **sigue sin confirmar con el propietario cuál es la vía canónica** |
| Landing genérica raíz | Redirect a `Index.html` | `index.html` (minúsculas) | HTML estático, `location.replace('Index.html')` | GitHub Pages + Netlify | Activo — confirmado intencional, no es deuda técnica |
| Design Studio | Estudio de diseño autónomo compartido por las Skills visuales | `design-studio/` | Plantillas HTML + Playwright + Adobe for Creativity (MCP) + `brand-kit.json` (identidad visual machine-readable) | No se despliega | Activo — validado con la campaña real "Vuelta al Cole" |
| Motor de Marketing con IA | Orquestación multi-agente (8 agentes) que convierte un brief de producto en una publicación lista, preparado para proveedores de IA reales sin tocar el núcleo. Desde 2026-07-25, `intelligence/` analiza/recomienda/puntúa cada campaña en modo *shadow* (asesora, nunca decide) | `marketing-engine/` | Node.js (CommonJS) puro, sin dependencias npm — CLI propio (`cli/run-pipeline.js`, `cli/run-intelligence.js`) y puente serverless (`netlify/functions/marketing-engine-run.js`, consumido por `app.html`), usa `design-studio/scripts/render-html.js` y `design-studio/brand-kit.json` por referencia | Netlify Functions (además del CLI) | Activo — funcional de punta a punta en modo simulado, integrado con `app.html`; ningún proveedor de IA real conectado todavía (ver `marketing-engine/INTEGRATION.md`, `intelligence/README.md`) |
| Panel de Redes Sociales | Almacén (crea campañas vía Motor de Marketing) + Calendario (programa lo ya aprobado) | `app.html` | HTML monolítico. Estado (`CampaignStore`) solo en memoria del navegador, sin persistencia | GitHub Pages + Netlify | Activo — integrado con `marketing-engine/` (2026-07-25); sin proveedores de IA reales todavía, ver `marketing-engine/INTEGRATION.md` |
| Creative Engine | Motor de generación de contenido, completamente independiente de `marketing-engine/` — Provider Manager, Asset Pipeline, Prompt Composer, Variant Generator, Creative Validator, Creative Assets | `creative-engine/` | Node.js (CommonJS) puro, sin dependencias npm. 9 proveedores registrados; `simulated` y `openai-images` activos (`openai-images` requiere `OPENAI_API_KEY`, si no cae a `simulated`) | No se despliega (CLI/script) | Activo — conectado por primera vez a marketing-engine con un proveedor real vía `netlify/functions/marketing-engine-run.js`, ver `FIRST_REAL_GENERATION.md` y `creative-engine/ARCHITECTURE.md` |
| Creative Lab | Módulo de investigación y perfeccionamiento de calidad visual dentro de Creative Engine — 9 bibliotecas atómicas, Biblioteca de Referencias (combina sin copiar, escalable a decenas de miles, con importador real desde campañas propias aprobadas — `reference-library/import-from-campaign.js`), Generador de Conceptos (8-12 por campaña) con filtro "Director de Arte Senior", Moodboard textual, Prompt Composer Cinematográfico (13 bloques, campaña no producto), Concept Score en dos capas, **Art Direction Engine** (elige entre 18 patrones editoriales premium — Hero Product, Apple Style, Nike Style, Muji Style, Luxury Minimal, Amazon Premium, MediaMarkt Editorial, Problema → Solución...— agrupados en las 4 familias oficiales y permanentes de Ofipapel definidas en el sprint "Cierre de arquitectura" — Lifestyle, Premium Editorial, Comercial, Problema-Solución, ver `patterns.js#officialFamily` y `design-studio/OFIPAPEL_VISUAL_DNA.md` cap. 12 — decide qué elementos sobran y qué iconos usar ANTES de calcular el grid), **Editorial Design Engine** (a partir del patrón ya elegido, decide romper simetría, solapes deliberados y acotados, sangre de canvas — "el producto invade el lienzo" — y bandas de color; nunca renderiza ni calcula geometría), Layout Intelligence/Composition Engine (calcula grid/jerarquía/tamaños relativos/márgenes/espacios en blanco/equilibrio siguiendo esas decisiones y los puntúa ANTES de renderizar — sin coordenadas fijas), **Design Director Engine** (revisa la pieza combinada con 14 criterios de crítica de dirección de arte — impacto visual, equilibrio, tensión visual, ritmo, punto focal, legibilidad, sensación premium...— veta si "parece plantilla automática" o si el título compite con el producto, y fuerza un patrón editorial distinto hasta aprobar), **Component Library** (2-4 variantes visuales reales por componente — precio, CTA, logo, footer, marco, tarjeta del hero, divisor, sistema de iconos — selección determinista por campaña, "nunca repetir siempre la misma"), Layout Composer (orquesta todo lo anterior y renderiza sin cajas/tarjetas, con precio y contacto de marca reales — `brand-kit.json#contact`), umbral de calidad + reintento acotado en cada capa | `creative-engine/creative-lab/` | Node.js (CommonJS) puro. Reutiliza el Provider Manager de `creative-engine/` y `design-studio/scripts/render-html.js` sin cambios — independiente del proveedor de imágenes | No se despliega (CLI/script) | Activo — pipeline completo verificado extremo a extremo (concepto → patrón editorial → decisión editorial → composición calculada y puntuada → revisión de dirección de arte → render con componentes variados → precio/contacto reales); la campaña real del Ventilador Muvip aprueba con 92/100 (excelente) en Design Director Engine tras el sprint "Design Evolution v2" (2026-07-26: Editorial Design Engine + Component Library + 2 patrones nuevos), sin regresión frente al resultado del sprint anterior; primera entrada real (`sourceType: 'campana-propia'`) registrada en la Biblioteca de Referencias — la "memoria" del sistema ya está activa. **Objetivo principal (RT-09) sin resolver todavía**: la fotografía de la campaña Muvip fue aportada manualmente por el propietario y compuesta tal cual (`simulated.provider.js`, sin IA) — ningún proveedor real de generación de imágenes está conectado hoy, así que esto NO demuestra que el sistema genere fotografía de calidad equivalente por sí solo, ver `.claude/rax/DECISIONES.md` 2026-07-26 y `creative-engine/creative-lab/ARCHITECTURE.md` |

## Skills de RAX (referencia — el detalle vive en `.claude/skills/README.md`)

| Skill | Estado |
|---|---|
| `project-manager` | Activa |
| `diseno-ofipapel` | Activa — validada con una campaña real |
| `sales-marketing` | No incorporada — aparcada (ver nota) |

**Nota sobre `sales-marketing` vs. `marketing-engine/`**: son cosas
distintas. `sales-marketing` (rama huérfana `claude/rax-sales-marketing-skill-4raaru`,
nunca fusionada) era un Skill de calendario comercial/plan anual, sigue sin
incorporarse. `marketing-engine/` (2026-07-24) es un sistema nuevo,
construido desde cero por instrucción directa del propietario, que
sí supera explícitamente la regla de aparcamiento de 2026-07-10 — ver
`.claude/rax/DECISIONES.md`, entrada 2026-07-24. No confundir ambos al
decidir si "ya se puede retomar sales-marketing".

## Infraestructura compartida

- **Despliegue dual**: GitHub Pages (`.github/workflows/pages.yml`) y Netlify (`netlify.toml` + `build.sh`).
- **Bases de datos**: Supabase (`joe-app`, con RLS + sesión anónima) y Firebase Firestore (`alquileres`, con reglas + sesión anónima). Dos backends distintos por decisión explícita del propietario — no se unifican.
- **IA**: Anthropic API, usada por el agente de WhatsApp y por el proxy `chat-assistant.js` de `Index.html`.
- **Diseño**: `design-studio/`, consumido por `diseno-ofipapel` y por
  `marketing-engine/` (agentes `guardian-marca` y `maquetador`).
- **Motor de Marketing con IA**: `marketing-engine/` — pipeline de 8
  agentes, 6 simulados con costura clara hacia IA real, 2 con integración
  real hoy (`guardian-marca` valida contra `design-studio/brand-kit.json`,
  `maquetador` renderiza con `render-html.js`). Sin proveedores de imagen/
  vídeo por IA conectados — arquitectura preparada para añadirlos (OpenAI
  Images, Google, Ideogram, Adobe Firefly, Flux, Runway, Veo) sin tocar el
  núcleo. Ver `marketing-engine/ARCHITECTURE.md`. Desde 2026-07-25 es
  además el "cerebro" real de `app.html` (Almacén) vía
  `netlify/functions/marketing-engine-run.js` — ver
  `marketing-engine/INTEGRATION.md` para el mapa completo de puntos de
  integración y el bloqueante conocido de Playwright/Chromium en Lambda.
- **Capa de Inteligencia**: `marketing-engine/intelligence/` (mismo
  2026-07-25) — Product Intelligence, Campaign Recommender, Creative
  Score, Variant Engine y Learning Engine, independientes de cualquier
  proveedor de IA. Corre en modo *shadow* por defecto: analiza cada
  campaña, recomienda con razones, compara con la decisión real del
  pipeline y registra todo, sin cambiar ninguna decisión. Un modo
  `decision` existe como interruptor de una sola variable de entorno
  (`MARKETING_ENGINE_INTELLIGENCE_MODE`), pendiente de activar hasta que
  el propio Shadow Mode demuestre que las recomendaciones son mejores o
  equivalentes — ver `marketing-engine/intelligence/README.md` y
  `marketing-engine/ROADMAP_V2.md`. Objetivo `resolver-problema` añadido
  en Fase 4 del sprint "Cierre de arquitectura" (2026-08-01) — señal real
  ya existente (`strategyAffinity` incluye `'Problema → Solución'`),
  alimenta el bonus de familia oficial homónima en
  `art-direction-engine/service.js#selectPattern`; este campo concreto
  (`recommendation.objective`) ya fluye como entrada real hacia
  `creative-engine` desde el puente `from-marketing-engine.js` (no forma
  parte de lo que el Shadow Mode protege — eso es `job.input` del propio
  pipeline de `marketing-engine`).
- **Creative Engine**: `creative-engine/` (2026-07-25) — capa de
  generación de contenido, completamente independiente de
  `marketing-engine/` (contrato propio `CreativeBrief`, sin `require()`
  cruzado). Provider Manager (9 proveedores registrados, solo
  `simulated` activo — `marketing-engine/core/providers/` queda legado
  desde ahora, ver `creative-engine/ARCHITECTURE.md` §4), Asset Pipeline,
  Prompt Composer modular, Variant Generator (eje de variación distinto
  al de `intelligence/variant-engine`: ejecución visual, no estrategia),
  Creative Validator (6 checks) y Creative Assets (imágenes/vídeos/
  prompts/metadatos/versiones). Primer proveedor real conectado desde
  2026-07-25: `openai-images` (activo si hay `OPENAI_API_KEY`, si no cae
  a `simulated`), ver `creative-engine/FIRST_REAL_GENERATION.md`.
- **Creative Lab**: `creative-engine/creative-lab/` (2026-07-26) —
  tercer verbo del ecosistema ("Marketing Engine piensa, Creative Engine
  crea, Creative Lab perfecciona"), dedicado en exclusiva a la calidad
  visual. 9 bibliotecas atómicas (52 estilos, composiciones, direcciones
  artísticas, iluminación, escenarios, jerarquías tipográficas, paletas y
  armonías, ángulo/lente, tendencias) + una Biblioteca de Referencias
  (15 entradas semilla textuales, escalable a decenas de miles sin
  cambiar arquitectura) que el Generador de Conceptos combina —nunca
  copia una sola referencia, invariante forzado por código— para producir
  8-12 conceptos por campaña, cada uno con una variación propia
  obligatoria del director. Evaluación en dos capas (plan gratis sobre
  los 8-12, real con coste solo sobre el shortlist de 3-4) contra un
  umbral de calidad (85/100 por defecto) con reintento acotado (máx. 3,
  nunca bucle infinito). Reutiliza el Provider Manager de
  `creative-engine/` sin cambios — ver
  `creative-engine/creative-lab/ARCHITECTURE.md`.

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

Ninguno detectado en esta revisión.
