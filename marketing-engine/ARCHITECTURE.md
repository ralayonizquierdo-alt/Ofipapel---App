# Arquitectura del Motor de Marketing con IA

**Fecha de creación**: 2026-07-24. **Estado**: arquitectura completa e
implementada, funcionando de punta a punta en modo simulado (sin ningún
proveedor de IA real conectado todavía).

## 1. Resumen ejecutivo

Este subsistema convierte el brief de un producto de Ofipapel (o de sus
marcas hermanas Canarias INK y FalControl) en una publicación lista para
redes sociales, mediante un pipeline de **8 agentes con responsabilidad
única**, cada uno en su propia carpeta con configuración, documentación,
prompts, estado, interfaz y servicio propios.

**Filosofía del propietario**: *"Claude es el Director General del
departamento creativo. Todas las decisiones pasan primero por Claude.
Después Claude decide qué agente debe actuar."* En la práctica hoy esto
significa: el pipeline se invoca manualmente o desde una sesión de Claude
Code (vía `cli/run-pipeline.js`), no hay ningún disparador automático ni
cron desatendido — cada ejecución es una decisión consciente, y la traza
completa (`jobs/<id>/events.log`) queda disponible para que una sesión de
Claude la audite después.

**Lo que NO hace todavía, a propósito**: ningún proveedor de IA real de
imagen/vídeo está conectado. El pipeline completo funciona hoy con un
proveedor `simulated` que genera un placeholder determinista, precisamente
para poder construir y validar toda la arquitectura sin depender de
credenciales ni de coste de generación. Ver sección 10.

## 2. Diagrama del pipeline

```
Nuevo producto (brief JSON)
        │
        ▼
┌─────────────────────┐
│ 01 Director Creativo │  estrategia, tipo de post, tono, canal, familia gráfica
└──────────┬───────────┘
        ▼
┌─────────────────────┐
│ 02 Director de Arte  │  composición, jerarquía, estructura, layout
└──────────┬───────────┘
        ▼
┌─────────────────────┐
│ 03 Guardián de Marca │──── blocked ────┐  (valida contra brand-kit.json;
└──────────┬───────────┘                 │   puede bloquear)
        ▼ ok                             │
┌──────────────────────────┐             │
│ 04 Fotógrafo Publicitario │             │  el orquestador rebota el job
└──────────┬────────────────┘            │  al agente indicado en
        ▼                                │  `returnTo`, con límite de
┌───────────────────────────┐            │  reintentos (ver sección 5)
│ 05 Especialista en Prompts │           │
└──────────┬──────────────────┘          │
        ▼                                │
   [ Proveedor de IA ]  ◄── invocado por el orquestador, no es un agente
        │                    con carpeta propia (ver sección 6)
        ▼
┌─────────────────────┐
│ 06 Copywriter         │  (posición decidida por RAX, ver sección 3)
└──────────┬───────────┘
        ▼
┌─────────────────────┐
│ 07 Maquetador         │  integración real: design-studio/scripts/render-html.js
└──────────┬───────────┘
        ▼
┌─────────────────────┐
│ 08 Control de Calidad │──── needs_revision ──► (rebota a cualquier agente anterior)
└──────────┬───────────┘
        ▼ ok
   Publicación (status: "completed")
```

## 3. Por qué el Copywriter va donde va (decisión no especificada por el propietario)

El diagrama de flujo original del propietario enumera 8 agentes pero su
lista de flechas salta de *"Proveedor de IA"* a *"Maquetador"* a *"Control
de Calidad"*, sin mencionar dónde encaja el Copywriter. Usando la
autorización explícita del propietario para mejorar la arquitectura
documentando el motivo, se decidió colocarlo **justo antes del
Maquetador**: el propio Maquetador se define como *"recibe imágenes, recibe
fondos, recibe elementos"* — el copy (título, CTA, hashtags) es uno de esos
elementos y debe existir antes de poder maquetar el titular sobre la pieza
final (exactamente como en el trabajo real de vídeo de producto de esta
misma sesión, donde el titular se compone dentro de la pieza, no se añade
después). El Copywriter no depende de nada que produzca el Maquetador, así
que no hay ciclo. Ver el comentario al principio de
`agents/06-copywriter/interface.js` y `core/pipeline-config.js`.

## 4. Por qué `marketing-engine/` es una carpeta separada de `design-studio/`

- `design-studio/` es la **capa de capacidades**: brand kit, plantillas
  HTML, el renderizador Playwright, la integración Adobe/Firefly. Ya la usa
  en producción la Skill `diseno-ofipapel` (validada con la campaña real
  "Vuelta al Cole").
- `marketing-engine/` es la **capa de orquestación**: decide, valida,
  secuencia — y delega en `design-studio/` para producir la pieza final
  (agente Maquetador).
- Mantenerlas separadas permite que cada una evolucione sin que la otra se
  entere: `design-studio/` puede ganar plantillas o proveedores de stock
  nuevos sin tocar ni un fichero de `marketing-engine/`, y viceversa.
- Dependencia unidireccional: `marketing-engine/` usa `design-studio/`
  (por `require`/ruta relativa), nunca al revés.
- Los 8 agentes **no** son Skills de `.claude/skills/` invocables
  individualmente — son etapas de un único pipeline interno. Exponer el
  orquestador como una Skill fina queda fuera de esta pasada.

## 5. Contrato `Job` y mecanismo de loop-back

### Forma completa del `Job` (`core/contracts/job.contract.js`)

```json
{
  "id": "8368634b-5590-4c9f-8458-0a780cae6196",
  "createdAt": "2026-07-24T21:00:00.000Z",
  "input": {
    "productName": "Ventilador Nebulizador MUVIP 75W",
    "category": "electrodomesticos",
    "brand": "ofipapel",
    "description": "Refresca y humedece el ambiente al instante...",
    "channel": "instagram",
    "images": []
  },
  "state": {
    "director-creativo": { "...": "salida de cada agente, acumulada" },
    "guardian-marca": { "approved": true, "checks": ["..."] },
    "proveedor-ia": { "assetPath": "...", "providerId": "simulated", "width": 1080, "height": 1920 },
    "maquetador": { "renderedAssetPath": "...", "templateUsed": "pieza-generica" }
  },
  "retryCount": { "copywriter": 1 },
  "currentAgentIndex": 8,
  "status": "completed"
}
```

`job.state` y `job.retryCount` son mapas dinámicos indexados por
`agentId` — cada agente valida solo su propia porción con su propio
`interface.js`; el contrato del Job no valida el contenido interno de cada
agente (eso rompería "cada agente evoluciona independientemente").

### Sobre uniforme que devuelve cualquier agente

```js
{
  status: 'ok' | 'blocked' | 'needs_revision',
  agentId: 'guardian-marca',
  output: { /* validado contra el OUTPUT_SHAPE propio de ese agente */ },
  returnTo: null | 'director-arte',   // solo lo rellenan guardian-marca y control-calidad
  reason: null | 'texto explicando por qué',
}
```

### El orquestador (`core/orchestrator.js`)

Una lista (`PIPELINE`) + un `while` + un switch de 3 casos — sin motor de
workflow de terceros, sin dependencia npm nueva:

1. Ejecuta `agents[PIPELINE[index]].service.run(job)`.
2. `status: 'ok'` → guarda `output` en `job.state[agentId]`, avanza el
   índice, persiste (`job-store.js`), registra el evento.
3. `status: 'blocked' | 'needs_revision'` → busca el índice de
   `returnTo`, incrementa `job.retryCount[returnTo]`; si supera
   `MAX_RETRIES_PER_AGENT` (2), termina en `failed_needs_human` — nunca un
   bucle infinito silencioso.
4. Al llegar al final del pipeline en `ok` → `status: 'completed'`.

### Traza real de una prueba de loop-back (verificación de esta implementación)

Se forzó temporalmente un fallo en `08-control-calidad` (revertido antes de
entregar) para confirmar el mecanismo con datos reales, no solo en teoría:

```
{"type":"loop_back","from":"control-calidad","to":"copywriter","retryCount":1,"reason":"Checklist de calidad no superado: __test-forzar-needs-revision-una-vez"}
{"type":"pipeline_end","status":"completed"}
```

Y forzando un fallo que **nunca** se recupera, para confirmar el límite:

```
{"type":"loop_back","from":"control-calidad","to":"copywriter","retryCount":1, ...}
{"type":"loop_back","from":"control-calidad","to":"copywriter","retryCount":2, ...}
{"type":"pipeline_end","status":"failed_needs_human","reason":"Máximo de reintentos (2) superado para \"copywriter\" — última razón: ..."}
```

Confirmado: ni un bucle infinito, ni una pérdida silenciosa de un job
atascado.

## 6. Dónde encaja el "Proveedor de IA" del diagrama del propietario

No es un agente con carpeta propia — los proveedores son intercambiables
por diseño, no tienen responsabilidad creativa única. El **orquestador**,
justo tras completar `05-especialista-prompts`, invoca automáticamente
`core/providers/registry.js` con el `providerId`/`generationRequest` que
ese agente produjo, guarda el `GenerationResult` en
`job.state['proveedor-ia']`, y solo entonces continúa con
`06-copywriter`. Así el diagrama (`Especialista en Prompts → Proveedor de
IA → Maquetador`) queda representado exactamente.

## 7. Registro de proveedores de IA — preparado, sin integrar

`core/providers/provider.interface.js` define el contrato común:

```js
generate(request: { prompt, width, height, contentClass, metadata? })
  → { assetPath, providerId, width, height, rawResponse }
```

| id | status | kind | notas |
|---|---|---|---|
| `simulated` | **active** | image | placeholder SVG determinista, sin red — el único conectado hoy |
| `openai-images` | planned | image | — |
| `google-images` | planned | image | — |
| `ideogram` | planned | image | fuerte en composición con texto dentro de la imagen |
| `adobe-firefly` | planned | image | al activar, delegar en `design-studio/scripts/firefly-generate.js` (ya escrito) — no reimplementar el OAuth |
| `flux` | planned | image | vía gateway (Replicate/fal.ai) o API propia, a decidir |
| `runway` | planned | video | para cuando el pipeline soporte Reels generados por IA |
| `veo` | planned | video | alternativa a runway |

**Añadir un proveedor nuevo el día de mañana = un fichero nuevo en
`core/providers/providers/` + una línea en `registry.js`. Cero cambios en
`orchestrator.js` ni en ningún `agents/*/service.js`.** Ver
`core/providers/README.md` para el procedimiento paso a paso.

## 8. Fuente única de verdad de la marca

Se creó **`design-studio/brand-kit.json`** — los mismos datos que ya
documentaba `design-studio/README.md` sección 2, pero en formato
machine-readable, **verificados contra el CSS real de cada app** el
2026-07-24 (no transcritos de memoria). Esto corrige explícitamente el
error documentado en `.claude/rax/DECISIONES.md` (2026-07-10): un intento
anterior de esta misma idea (`sales-marketing`) duplicó la identidad visual
en su propio fichero y esa copia tenía datos incorrectos.

Durante la verificación se encontró y corrigió una imprecisión real que
tenía el propio README de Canarias INK: documentaba el fondo oscuro como
`#1A5C1A / #12141F`, pero `#1A5C1A` no aparece en `canarias-ink.html` en
absoluto — es el verde de Ofipapel. El fondo real de Canarias INK es
`--bg: #0F1119` (`#1A1D2E` es `--card`, no el fondo). `brand-kit.json`
usa el valor correcto verificado; el README no se reescribió (fuera de
alcance de esta pasada) pero ahora referencia el JSON como fuente
autoritativa.

`agents/03-guardian-marca/service.js` hace
`require('design-studio/brand-kit.json')` directamente — su propio
`config.js` solo contiene parámetros de validación (qué marcas exigen
eslogan), nunca colores.

## 9. Qué está simulado vs. integrado de verdad

| Agente | Estado | Motivo |
|---|---|---|
| 01 Director Creativo | Simulado (reglas por categoría) | Decisión creativa — necesita juicio, hoy determinista |
| 02 Director de Arte | Simulado (layouts predefinidos) | Ídem |
| **03 Guardián de Marca** | **Real** | Es validación de reglas objetivas contra `brand-kit.json` — no necesita IA |
| 04 Fotógrafo Publicitario | Simulado (ficha por plantilla) | Decisión creativa |
| 05 Especialista en Prompts | Simulado (prompt genérico) | Decisión creativa |
| 06 Copywriter | Simulado (plantillas de texto) | Decisión creativa |
| **07 Maquetador** | **Real** | Delega en `render-html.js`, ya produce un PNG real hoy |
| **08 Control de Calidad** | **Real** (checklist) | Comprobaciones objetivas (¿existe el archivo?, ¿hay CTA?) |

Cada agente simulado sigue el mismo patrón en su `service.js`:

```js
// === INICIO: LÓGICA SIMULADA (reemplazar por llamada real más adelante) ===
const output = simulateDecision(job);
// === FIN: LÓGICA SIMULADA ===
//
// Punto de enganche futuro:
//   const output = await callLLM(loadPrompt('....prompt.md'), job);
```

El contrato (`interface.js`) no cambia nunca al activar la IA real — el
prompt en español ya está redactado en `prompts/` de cada agente,
esperando ese momento.

## 10. Decisiones de diseño y alternativas descartadas

- **JSDoc + shape-checker propio, no zod/ajv**: cero dependencias de
  validación existen hoy en todo el repo, el volumen de formas es pequeño,
  y es un pipeline interno sin payloads externos poco fiables. Señal
  concreta para reconsiderarlo: cuando entre un proveedor real con
  payloads complejos y poco fiables.
- **Sin motor de workflow de terceros**: el loop-back real (QA → cualquier
  agente anterior) se resuelve con una lista + un `while` + 3 casos. Un
  motor de grafo genérico habría sido complejidad sin beneficio para 8
  pasos conocidos.
- **Numeración `01-…08-` en las carpetas**: hace el orden visible con un
  `ls`, pero deliberadamente NO es la fuente de verdad (esa es
  `core/pipeline-config.js`) — así nunca pueden desincronizarse dos sitios
  distintos. El Copywriter se numeró `06` (no en el orden de la lista
  original del propietario) precisamente para que el número de carpeta
  coincida con el orden real de ejecución (ver sección 3).
- **Sin `marketing-engine/package.json` todavía**: nada en esta pasada
  hace red ni necesita un paquete npm — mismo precedente que
  `design-studio/` (cero `package.json`). El primer proveedor real
  activado que necesite un SDK es la señal para crear uno.
- **`.gitignore` con patrón de dos líneas para `jobs/`**: se usó
  `marketing-engine/jobs/*` + `!marketing-engine/jobs/.gitkeep` en vez de
  una sola línea `marketing-engine/jobs/` (que habría sido más fiel al
  estilo de una línea de las entradas existentes) — una carpeta ignorada
  al completo también ignora cualquier `.gitkeep` dentro, así que la
  versión de una sola línea habría hecho el `.gitkeep` inútil. Pequeña
  desviación del estilo exacto, documentada aquí, necesaria para que
  funcione.
- **Maquetador genera su plantilla en memoria** (`templates/pieza-generica.js`)
  en vez de rellenar un `.html` estático de `design-studio/templates/`:
  esos ficheros llevan el logo embebido en base64 y no están pensados para
  recibir datos dinámicos de un job. Se generó una plantilla nueva que
  reutiliza el mismo *lenguaje visual* (logo, fondo corporativo, eslogan) y
  el mismo *motor de render* (`render-html.js`), sin tocar
  `design-studio/templates/`. Añadir un layout visual distinto es un
  fichero nuevo en `agents/07-maquetador/templates/`, no una modificación.

## 11. Qué queda explícitamente fuera de esta pasada

- Ninguna llamada real a proveedor de IA (todos en `status: "planned"`).
- Ninguna UI nueva.
- Ningún despliegue serverless/Netlify Function — el pipeline corre como
  script Node local/CLI, igual que `render-html.js` hoy.
- Ninguna modificación de `joe-app/`, `alquileres/`, `Index.html`,
  `canarias-ink.html`, `falcontrol.html`.
- Ninguna automatización desatendida/cron.
- El orquestador no se expone todavía como Skill de `.claude/skills/`.
- No se creó `marketing-engine/package.json`.

## 12. Cómo ejecutar el pipeline hoy

```bash
node marketing-engine/cli/run-pipeline.js marketing-engine/campaigns-input/ejemplo-producto-generico.json
```

Salida real (verificada en esta misma implementación):

```
Job creado: a1b1f284-4d1c-4f24-89ca-04540042adaf
Producto: Ventilador Nebulizador MUVIP 75W (ofipapel)
Ejecutando pipeline...

Estado final: completed
Job guardado en: marketing-engine/jobs/a1b1f284-.../job.json
Traza completa en: marketing-engine/jobs/a1b1f284-.../events.log
Pieza generada: marketing-engine/jobs/a1b1f284-.../assets/pieza-final.png
```

La pieza generada es un PNG real de 1080×1920 con el logo real de Ofipapel,
el fondo corporativo real, el eslogan obligatorio, y el título del
Copywriter — con un placeholder "IMAGEN SIMULADA" donde iría la fotografía
del producto una vez se active un proveedor de IA real.
