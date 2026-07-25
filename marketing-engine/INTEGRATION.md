# Integración App ↔ Marketing Engine

Cómo `app.html` (el Almacén, concretamente) y `marketing-engine/` se
conectan hoy, qué se tocó para hacerlo posible, y cómo sustituir el
proveedor `simulated` por uno real el día que corresponda. Ver también
[ARCHITECTURE.md](./ARCHITECTURE.md) para el diseño interno del pipeline.

## Principio de diseño

> La aplicación es únicamente la interfaz. El Motor de Marketing es el
> cerebro. Toda decisión creativa pasa por el motor — la app nunca
> implementa lógica creativa propia.

En la práctica esto significa: `app.html` recoge un brief (producto, foto,
categoría...) y algunas preferencias opcionales del propietario, se lo
manda al motor tal cual, y pinta lo que el motor devuelve. No decide tipo
de publicación, no escribe copy, no genera imágenes, no valida marca — todo
eso vive en `agents/`.

## Diagrama de flujo

```
Almacén (app.html)                Netlify Function              marketing-engine/
──────────────────                ───────────────────            ─────────────────
"+ Nueva Campaña"                                                
  → formulario (producto,                                        
    foto, categoría,                                             
    tipo/objetivo/estilo                                         
    opcionales, fecha)                                           
  → CampaignStore.add()                                          
    status: 'processing'                                         
  → fetch POST ────────────────→  marketing-engine-run.js                                    
                                     fija MARKETING_ENGINE_        
                                     JOBS_DIR=/tmp/...             
                                     createJob(input) ──────────→  job.contract.js valida
                                     runPipeline(job) ───────────→  orchestrator.js
                                                                     01 director-creativo
                                                                     02 director-arte
                                                                     03 guardian-marca
                                                                     04 fotografo-publicitario
                                                                     05 especialista-prompts
                                                                        → provider "simulated"
                                                                     06 copywriter
                                                                     07 maquetador (Playwright)
                                                                     08 control-calidad
                                     ← job final + trace + asset
  ← JSON (status, trace,
    copy, renderedAsset)
  → CampaignStore.update()
    status: 'ready_for_review'
    (o 'failed')

Detalle de campaña
  → línea de tiempo = trace
  → Aprobar → status: 'approved'  ─────────────────────────────→ (el motor no se entera;
  → Rechazar → status: 'rejected'                                  la app decide sobre el
  → Editar → reabre el                                             resultado ya generado)
    formulario, reenviar
    vuelve a ejecutar el
    pipeline entero

Calendario (app.html)
  → lee CampaignStore
    filtrando status:
    'approved'
  → arrastrar a un día →
    status: 'scheduled'
```

## Puntos de integración tocados

| Fichero | Cambio | Motivo |
|---|---|---|
| `core/job-store.js` | `JOBS_DIR` (const) → `jobsBaseDir()` (función que lee `process.env.MARKETING_ENGINE_JOBS_DIR` en cada llamada, con fallback a la ruta del repo) | Lambda/Netlify Functions solo pueden escribir en `/tmp`; el resto del filesystem es de solo lectura en producción. |
| `core/providers/providers/simulated.provider.js` | Usa `jobDir()` de `job-store.js` en vez de recalcular su propia ruta. Además: si `req.metadata.sourceImage` es un `data:image/...` real, decodifica y usa esa foto directamente como asset generado (en vez del placeholder SVG abstracto) | Bug: escribía fuera del directorio configurable — rompía en serverless. Mejora: permite probar el flujo completo con una foto real sin conectar un proveedor de IA de verdad. |
| `agents/07-maquetador/service.js` | Ídem — usa `jobDir()` de `job-store.js` en vez de calcular su propia ruta con `REPO_ROOT` | Mismo bug, segundo escritor independiente que lo repetía. |
| `core/orchestrator.js` (`invokeProvider`) | `metadata: { jobId: job.id }` → `metadata: { ...(generationRequest.metadata ?? {}), jobId: job.id, sourceImage: job.input.images[0] ?? null }` | Bug: sobrescribía en silencio cualquier `metadata` que ya trajera la petición del agente, y nunca propagaba la foto subida por el usuario hasta el proveedor. |
| `core/contracts/job.contract.js` (`JOB_INPUT_SHAPE`) | + `postTypeOverride`, `objective`, `creativeStyleHint`, `targetDate` (los 4 opcionales, `maybe(...)`) | Dejar que el usuario influya en decisiones que por defecto toma el Director Creativo, sin quitarle autonomía cuando no se especifican. |
| `agents/01-director-creativo/service.js` + `config.js` | `simulateDecision()` usa `postTypeOverride`/`objective` si vienen en el input (prioridad sobre `CATEGORY_RULES`); nuevo `OBJECTIVE_TONE_MAP` en `config.js` | Único punto de consumo de los overrides — el resto del pipeline sigue viendo un `postType`/`tone` normal, no sabe si vino de una regla o de una elección del usuario. |
| `netlify/functions/marketing-engine-run.js` | **Nuevo.** Puente HTTP entre `app.html` y el motor (detalle abajo) | La app es un SPA estático sin backend propio — necesita un endpoint serverless para ejecutar Node. |
| `netlify.toml` | `[functions."marketing-engine-run"] included_files = ["marketing-engine/**", "design-studio/**"]` | El bundler de Netlify traza dependencias por análisis estático de `require()`; no detecta las rutas que `07-maquetador` arma en tiempo de ejecución (`execFileSync` a `design-studio/scripts/render-html.js`, carga de `brand-kit.json` por ruta calculada). |
| `app.html` | `CampaignStore` (IIFE nueva), Almacén reescrito como centro de trabajo creativo, Calendario simplificado a solo-organizar (detalle abajo) | Ver siguientes secciones. |

## `JOB_INPUT_SHAPE` — referencia de campos

Definido en `core/contracts/job.contract.js`. Es exactamente lo que espera
`marketing-engine-run.js` en el `body` de la petición:

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `productName` | string | sí | |
| `category` | string | sí | Alimenta `CATEGORY_RULES` en `agents/01-director-creativo/config.js`. Cualquier string cae en `CATEGORY_RULES.default` si no coincide una regla explícita. |
| `brand` | `'ofipapel' \| 'canarias-ink' \| 'falcontrol'` | sí | La app lo fija siempre a `'ofipapel'` — este panel es el de Ofipapel. |
| `description` | string | sí | Lo que ve `03-guardian-marca` y `06-copywriter`. |
| `channel` | `'instagram' \| 'facebook' \| 'whatsapp' \| 'ambas'` | no | Si se omite, `DEFAULT_CHANNEL` (`'ambas'`). |
| `images` | string[] | sí (puede ser `[]`) | Data URLs (`data:image/...;base64,...`). Solo se usa `images[0]` hoy — ver `sourceImage` más abajo. |
| `postTypeOverride` | `'foto' \| 'carrusel' \| 'reel'` | no | Prima sobre la decisión autónoma del Director Creativo. |
| `objective` | `'vender' \| 'emocionar' \| 'sorprender' \| 'minimalista'` | no | Mapeado a tono vía `OBJECTIVE_TONE_MAP`. Mismos 4 modos que `knowledge/creative-playbook.md`. |
| `creativeStyleHint` | string | no | Texto libre, se añade a la estrategia del Director Creativo. |
| `targetDate` | string (fecha) | no | Ningún agente la consume — solo se devuelve tal cual para que el Almacén muestre "fecha prevista". |

## `netlify/functions/marketing-engine-run.js` — esquema HTTP

**Request**: `POST`, `Content-Type: application/json`, body = `JOB_INPUT_SHAPE` de la tabla anterior.

**Response**: siempre `200` salvo error de petición (ver abajo) — un fallo
del *pipeline* no es un error HTTP, es un estado de campaña que el Almacén
debe poder mostrar.

```json
{
  "jobId": "uuid",
  "status": "completed | failed_needs_human",
  "input": { "...echo completo del brief, incluye targetDate..." },
  "trace": [ "...eventos crudos de core/event-log.js, ver abajo..." ],
  "errors": [ "...strings derivados de trace (agent_error / agent_result con status != ok)..." ],
  "copy": { "title": "...", "body": "...", "cta": "...", "hashtags": [], "description": "..." },
  "postType": "foto | carrusel | reel",
  "graphicFamily": "...",
  "renderedAsset": {
    "mimeType": "image/png",
    "base64": "...",
    "width": 1080,
    "height": 1920
  }
}
```

- `copy`/`postType`/`graphicFamily` solo aparecen si el agente correspondiente llegó a ejecutarse.
- `renderedAsset` solo aparece si `status === 'completed'`.
- Errores de petición (no del pipeline): `400` JSON inválido, `400` brief inválido (`createJob()` lanzó por incumplir `JOB_INPUT_SHAPE`), `405` método distinto de `POST`.

### Forma de un evento de `trace`

Vienen tal cual de `core/event-log.js` → `readEvents(jobId)`. Campos según `type`:

| `type` | Campos relevantes |
|---|---|
| `pipeline_start` | `input` |
| `agent_start` | `agentId`, `index` |
| `agent_result` | `agentId`, `status` (`ok`\|`blocked`\|`needs_revision`), `returnTo`, `reason` |
| `agent_error` | `agentId`, `error` |
| `loop_back` | `from`, `to`, `retryCount`, `reason` |
| `provider_start` / `provider_result` / `provider_error` | `providerId`, `assetPath` o `error` |
| `pipeline_end` | `status` (`completed`\|`failed_needs_human`), `reason` (si falló) |

Todos llevan `at` (timestamp ISO), añadido automáticamente por `appendEvent()`.

## `app.html` — qué cambió

### `CampaignStore` (nuevo, antes de `Almacen`/`Calendario`)

Único estado compartido de campañas. Sustituye los dos arrays `carruseles`
independientes que antes vivían duplicados en Almacén y Calendario. API:
`list()`, `get(id)`, `add(partial)`, `update(id, patch)`,
`subscribe(fn)` — `add`/`update` notifican a todos los suscriptores, así
que Almacén y Calendario se repintan solos en cuanto el otro cambia algo
(aprobar en Almacén hace aparecer la tarjeta en el pool de Calendario sin
recargar nada).

Forma de una campaña:

```js
{
  id, origin: 'engine' | 'legacy', jobId,
  status: 'processing' | 'ready_for_review' | 'approved' | 'scheduled' | 'rejected' | 'failed',
  titulo, tipo, slides, estilo, objetivo, emoji, media, brand,
  currentAgent, errors: [], trace: [], input,   // input = brief original, para "Editar"
  targetDate, fecha_programada, hora_programada, plataforma, caption, hashtags, ubicacion
}
```

`origin: 'legacy'` marca las 6 campañas de demo que ya existían antes de
esta integración (no vinieron del motor). `origin: 'engine'` son las que sí.

### Almacén — centro de trabajo creativo

- **"+ Nueva Campaña"** abre un modal con: producto, categoría, descripción,
  foto (opcional, `FileReader` → data URL), tipo/objetivo/estilo (opcionales,
  overrides), fecha prevista, canal. Al enviar: `CampaignStore.add(...)`
  con `status: 'processing'` inmediato, luego `fetch()` a
  `marketing-engine-run.js`; la respuesta actualiza la misma campaña
  (`ready_for_review` o `failed`).
- Tarjeta: miniatura (foto real si la hay), estado (pill de color), tipo,
  estilo, agente actual (mientras procesa), primer error (si los hay),
  fecha prevista o programada.
- Modal de detalle: si la campaña tiene `trace`, pinta una línea de tiempo
  vertical (un punto por evento — rojo si es un `*_error`, verde si es el
  `pipeline_end` de éxito). Si es `origin: 'legacy'` sin `trace`, mantiene
  la cuadrícula de slides original. Acciones: **Aprobar**
  (`status → 'approved'`), **Rechazar** (`status → 'rejected'`, limpia
  cualquier fecha programada), **Editar** (reabre "+ Nueva Campaña"
  precargado con `campaign.input`; al reenviar, **relanza el pipeline
  completo sobre la misma campaña** — la app nunca edita el resultado a
  mano).

### Calendario — solo organiza

- Ya no puede crear contenido: se eliminó el botón "+ Subir contenido" y
  el modal `#modalSubida` (`abrirModalSubida`/`confirmarSubida` y su
  selector de tipo/plataforma/archivo) por completo.
- `renderPool()` lee `CampaignStore.list()` filtrando `status === 'approved'`.
- Arrastrar/tocar a un día abre `#modalCompletar` (sin cambios en su UI) y
  al guardar hace `CampaignStore.update(id, { status: 'scheduled', fecha_programada, hora_programada, ... })`.
- Quitar del calendario devuelve la campaña a `status: 'approved'` (vuelve
  al pool, no desaparece).

## Cómo sustituir `simulated` por un proveedor de IA real

Cero cambios en `app.html`, en `marketing-engine-run.js` ni en
`core/orchestrator.js`. Los ficheros `openai-images.provider.js`,
`google-images.provider.js`, `ideogram.provider.js`,
`adobe-firefly.provider.js`, `flux.provider.js`, `runway.provider.js` y
`veo.provider.js` en `core/providers/providers/` ya existen con
`PROVIDER_META.status: 'planned'` (esqueletos sin llamada real todavía,
ver `core/providers/README.md`). Para activar uno:

1. Completar su `generate(req)` para que llame de verdad a la API externa
   (leer credenciales de variables de entorno de Netlify, nunca hardcodeadas).
2. Cambiar `PROVIDER_META.status` a `'active'`.
3. Cambiar `DEFAULT_PROVIDER_ID` en `agents/05-especialista-prompts/config.js`
   de `'simulated'` al nuevo id.

Nada más. `core/providers/registry.js` ya lo tiene registrado,
`provider.interface.js` ya define el contrato que cumple, y todo el resto
del pipeline (incluida la app) es agnóstico al proveedor.

## Bloqueantes conocidos antes de producción real

- **Playwright/Chromium en Lambda**: `07-maquetador` usa
  `design-studio/scripts/render-html.js`, que en este sandbox de
  desarrollo encuentra Chromium en `/opt/pw-browsers/chromium` — esa ruta
  **no existe** en Netlify Functions (AWS Lambda) real. Hace falta
  empaquetar un Chromium compatible con Lambda (p. ej.
  `@sparticuz/chromium`) y ajustar `executablePath` antes de desplegar de
  verdad. Todo lo construido y verificado en esta integración corrió en
  este sandbox, no en producción.
- **`included_files` en `netlify.toml`**: ya añadido (ver tabla arriba),
  pero no probado contra un despliegue real de Netlify, solo verificado
  como TOML válido.
- **Límite de tiempo de función síncrona**: el pipeline completo (8
  agentes + render con Playwright) puede acercarse al límite por defecto
  de Netlify Functions (10s en el plan gratuito, hasta 26s en planes de
  pago) — a vigilar cuando se conecte un proveedor de IA real con latencia
  de red real (hoy, con `simulated`, el pipeline corre en menos de 1s).
- **~6MB de payload en la respuesta**: `renderedAsset.base64` va inline en
  el JSON de respuesta porque la app no tiene backend/CDN propio para
  subir el asset y devolver solo una URL. Es el límite práctico de
  Netlify Functions Response — una imagen 1080×1920 PNG hoy va sobrada,
  pero un vídeo generado por un proveedor real (Runway/Veo) no cabría:
  necesitaría subirse a almacenamiento (Supabase Storage, S3...) y
  devolver una URL en su lugar.
- **Estado de la app solo en memoria**: `CampaignStore` vive en el
  navegador, se pierde al recargar — consistente con el resto de
  `app.html` hoy (ninguna vista persiste en Supabase/backend todavía).
  Si se decide persistir campañas, es un cambio ortogonal a esta
  integración.

## Cómo volver a probar esta integración

Sin necesidad de `netlify-cli` ni desplegar:

**1. Solo el backend** (sin servidor, sin navegador):

```js
process.env.MARKETING_ENGINE_JOBS_DIR = '/tmp/mi-prueba';
const fn = require('./netlify/functions/marketing-engine-run.js');
const res = await fn.handler({
  httpMethod: 'POST',
  body: JSON.stringify({
    productName: 'Producto de prueba', category: 'papeleria',
    description: 'Descripción de prueba', images: []
  })
});
console.log(res.statusCode, JSON.parse(res.body).status);
```

**2. Extremo a extremo real** (app + función, en un navegador de verdad):
levantar un servidor HTTP mínimo (módulo `http` nativo) que sirva
`app.html` en `/` y monte `POST /.netlify/functions/marketing-engine-run`
invocando `exports.handler` del mismo fichero in-process (sin red, sin
`netlify-cli`), y conducir el flujo con Playwright (ya preinstalado en las
sesiones en la nube de este proyecto): crear campaña con foto real → Ver
detalles → confirmar línea de tiempo → Aprobar → cambiar a Calendario →
confirmar que aparece en el pool → tocar y programar en el día de hoy →
confirmar `stat-programados`. Este es exactamente el guion usado para
verificar esta integración antes de documentarla.
