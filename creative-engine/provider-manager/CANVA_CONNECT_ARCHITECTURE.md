# Arquitectura de integración con Canva Connect — informe técnico (FASE CANVA)

**Estado: diseño only — cero código escrito.** Actualizado 2026-08-02 tras
la directiva del propietario "NUEVA DIRECTIVA ESTRATÉGICA – INICIO FASE
CANVA": se detiene temporalmente el desarrollo de la fase OpenAI (la
fotografía de referencia real ya es aceptable; la segunda pasada de
limpieza de texto elimina el texto fantasma por completo pero degrada
algunos detalles del producto — decisión pendiente del propietario, no
bloqueante) y pasa a ser prioridad implementar la integración real con
Canva Connect. Este documento responde, en orden, a las 10 preguntas que
el propietario pidió validar **antes de escribir una sola línea de
código**. Todo lo que sigue está verificado con las herramientas MCP de
Canva ya disponibles en esta sesión (sus propias descripciones de
parámetros y comportamiento) — donde algo no puede verificarse así se
marca explícitamente como pendiente de confirmar en el momento de la
implementación, nunca se da por supuesto.

## 1. Qué API oficial de Canva debemos utilizar

**Canva Connect API** (REST, `api.canva.com/rest/v1/...`) — la API pública
de Canva para integraciones de terceros, distinta de "Canva Apps SDK"
(esa es para apps que corren *dentro* del editor de Canva, no aplica
aquí: nosotros necesitamos generar diseños desde fuera, sin usuario
delante de una pantalla). Dentro de Connect API, los cuatro grupos de
endpoints que usaremos:

- **Brand Template API** — `GET /v1/brand-templates`, `GET /v1/brand-templates/{id}/dataset`.
- **Autofill API** — `POST /v1/autofills`, `GET /v1/autofills/{jobId}`.
- **Asset Upload API** — `POST /v1/asset-uploads`, `GET /v1/asset-uploads/{jobId}`.
- **Export API** — `GET /v1/exports/formats` (o `get-export-formats` en las
  herramientas de esta sesión), `POST /v1/exports`, `GET /v1/exports/{jobId}`.

## 2. Qué tipo de credenciales necesitamos

**OAuth 2.0** de una app registrada en el Canva Developer Portal, tipo
"integración Connect API". Necesitamos `CANVA_CLIENT_ID` /
`CANVA_CLIENT_SECRET` de esa app, y los *scopes* mínimos: lectura de
plantillas de marca (`brandtemplate:meta:read`, `brandtemplate:content:read`),
escritura/lectura de diseño (`design:content:write`, `design:meta:read`),
y assets (`asset:read`, `asset:write`).

**Limitación real a anticipar**: Canva Connect no ofrece un modo
"server-to-server" puro tipo API key estática (como `OPENAI_API_KEY`).
El flujo OAuth siempre actúa en nombre de un usuario/equipo de Canva
concreto (el que da su consentimiento). Para un job automático en segundo
plano sin usuario delante (nuestra función de Netlify), el patrón es:

1. **Una vez**, el propietario (dueño de la cuenta/equipo de Canva de
   Ofipapel) hace el login OAuth interactivo una sola vez y obtiene un
   `refresh_token` de larga duración.
2. Ese `refresh_token` se guarda de forma persistente (candidato natural:
   Netlify Blobs, ya en uso desde DT-17) y la función lo usa para pedir un
   `access_token` nuevo (de corta duración) en cada ejecución, refrescándolo
   automáticamente cuando caduque.
3. Riesgo a vigilar: un refresh_token de Canva puede invalidarse si no se
   usa durante mucho tiempo o si cambian los scopes de la app — necesita
   monitorización, no es "configúralo una vez y olvídalo" como la key de
   OpenAI.

## 3. Qué limitaciones tiene Canva Connect

- **OAuth de usuario, no server-to-server puro** (ver pregunta 2).
- **Autofill solo rellena campos ya etiquetados** en la plantilla — es
  trabajo de diseño manual previo (una vez por plantilla), no algo que la
  API resuelva sola sobre cualquier diseño.
- **Autofill y Export son asíncronos**: ambos crean un *job* que hay que
  sondear (`GET .../{jobId}`) hasta `status: 'success'` o `'failed'` — no
  hay respuesta síncrona con el resultado final.
- **Límites de la API** (rate limits, tamaño máximo de asset subido,
  planes de Canva requeridos para Brand Templates/Autofill — típicamente
  Canva Enterprise o Canva for Teams con Brand Kit): no se inventan
  números aquí porque no están verificados en esta sesión — se confirman
  en el momento de registrar la app real, contra la documentación oficial
  vigente entonces, y contra qué plan de Canva tiene o necesita la cuenta
  de Ofipapel (esto último es una decisión de negocio del propietario, no
  técnica).
- **Formatos de exportación** disponibles dependen del tipo de diseño
  concreto — se consultan con `get-export-formats` antes de exportar, no
  se asume que todos (PNG/JPG/PDF) estén siempre disponibles.

## 4. Qué formato de entrada recibirá Canva desde HELIX

No es un prompt de texto libre (a diferencia de OpenAI) — es un par
`{brand_template_id, dataset}`, ya anotado como contrato en la cabecera
de `providers/canva.provider.js` desde que se creó el stub:
`req.metadata.templateId` + `req.metadata.fields`, en vez de `req.prompt`.
El `dataset` es un mapa `{ nombreDeCampo: {type:'text', text} |
{type:'image', asset_id} }`. Los valores de texto salen del `brief` ya
construido por `creative-lab` (título/CTA del estado `copywriter`,
contacto de `preparedAssets.brand`); el campo `precio` no está cableado
todavía en el brief (deuda ya conocida, aparte de esta integración). El
valor de imagen es el `asset_id` que devuelve el paso de subida (pregunta 5).

## 5. Cómo enviaremos la fotografía generada por OpenAI

En dos pasos, y con una restricción de seguridad importante: la foto
generada solo existe en memoria/`/tmp` de la función de Netlify — **nunca
debe publicarse en una URL pública** solo para poder subirla. Por eso la
herramienta interactiva `upload-asset-from-url` de esta sesión (que exige
una URL ya pública, por diseño de seguridad) **no es la vía correcta**
para la integración real. La vía correcta es la API REST directa:

1. `POST /v1/asset-uploads` con los bytes del PNG en el cuerpo
   (binario/multipart, `Authorization: Bearer {access_token}`) — devuelve
   un job de subida.
2. Sondear `GET /v1/asset-uploads/{jobId}` hasta `status: 'success'` →
   devuelve el `asset_id` final, que es el valor que se usa en el campo
   `foto_producto` del dataset (pregunta 4).

## 6. Cómo rellenaremos automáticamente los textos

Vía **Autofill**: `POST /v1/autofills` con `{brand_template_id, data}`
(el `data` es el dataset de la pregunta 4) → devuelve un job → sondear
`GET /v1/autofills/{jobId}` hasta `status: 'success'` → la respuesta trae
el `design_id` del diseño ya generado, con los campos de texto e imagen
rellenados automáticamente. Requisito previo (una sola vez por
plantilla, trabajo de diseño, no de runtime): cada campo debe estar
**etiquetado** en el editor de Canva como campo de autofill
(`autofill_field_label`), vía `create-brand-template-draft` →
`start-editing-transaction` → `perform-editing-operations` →
`commit-editing-transaction` → `publish-brand-template`.

## 7. Cómo utilizaremos nuestras cuatro plantillas oficiales

Una **Brand Template** de Canva por cada una de las 4 familias oficiales
(Lifestyle, Premium Editorial, Comercial, Problema-Solución — mismas 4 de
`art-direction-engine/patterns.js#OFFICIAL_FAMILIES`), diseñada a mano en
Canva con el Brand Kit real de Ofipapel y con sus campos etiquetados
(pregunta 6). Cada plantilla, una vez publicada, tiene un
`brand_template_id` fijo — se guarda un mapa simple
`CANVA_TEMPLATE_ID_BY_FAMILY` (config, no código de lógica) que traduce
la familia ya elegida por `art-direction-engine` (esa decisión no cambia)
al `brand_template_id` correspondiente que usa el paso de Autofill.

## 8. Cómo exportaremos automáticamente el diseño final

Con el `design_id` que devolvió Autofill: `POST /v1/exports` con
`{design_id, format: {type:'png'}}` → devuelve un job → sondear
`GET /v1/exports/{jobId}` hasta `status:'success'` → la respuesta trae
una o varias URLs de descarga → la función descarga los bytes y los
escribe en `req.metadata.outputDir` (el mismo directorio de versión que ya
prepara `creative-assets/store.js` hoy) → devuelve exactamente el mismo
`GENERATION_RESULT_SHAPE` que cualquier otro proveedor. Nada aguas abajo
(`creative-assets/store.js`, el resto de `creative-lab/index.js`) necesita
saber que el proveedor fue Canva en vez de OpenAI.

## 9. Qué partes podrán editarse en Canva sin romper la automatización

Todo lo que **no** esté etiquetado como campo de autofill puede rediseñarse
libremente en Canva sin tocar código: fondos decorativos, disposición
visual general, elementos fijos que nunca cambian (logo si siempre es el
mismo, iconos de redes sociales fijos). Autofill solo toca los campos que
existen por *nombre* en el dataset — un rediseño visual completo de la
plantilla sigue funcionando mientras conserve los mismos nombres y tipos
de campo etiquetados. El único punto de acoplamiento real: si se renombra
o cambia el tipo de un campo etiquetado (p. ej. `titulo` deja de ser
`text`), hay que actualizar el mapa de dataset (pregunta 4) — una
actualización de configuración, no un cambio de lógica.

## 10. Arquitectura completa de la integración

```
HELIX (marketing-engine) → Creative Lab (concepto + prompt) →
openai-images.provider.js (foto limpia, sin texto) →
[NUEVO] canva.provider.js#generate(req):
  1. Token válido: refrescar access_token desde el refresh_token guardado
     en Netlify Blobs si ha caducado (pregunta 2).
  2. Subir la foto (req.referenceImages[0]) vía POST /v1/asset-uploads +
     sondeo → asset_id (pregunta 5).
  3. Resolver brand_template_id a partir de la familia oficial que ya
     eligió art-direction-engine (pregunta 7).
  4. Construir el dataset (título/precio*/CTA/contacto del brief + el
     asset_id de la foto) (pregunta 4).
  5. POST /v1/autofills + sondeo → design_id (pregunta 6).
  6. POST /v1/exports + sondeo → URL de descarga → escribir en
     req.metadata.outputDir (pregunta 8).
  7. Devolver GENERATION_RESULT_SHAPE — mismo contrato que
     openai-images/simulated, cero cambios en el resto del pipeline.
```

*precio: no cableado todavía en el brief, deuda técnica aparte de esta integración.

**Punto de conexión en el pipeline** (cambio mínimo, no arquitectura
nueva): `creative-lab/index.js#composeFinalLayout` es hoy el único punto
que llama a `layout-composer/service.js#composeLayout` (HTML + Chromium).
Cuando el proveedor activo sea `canva`, ese paso se **salta por
completo** — Canva ya entrega el PNG final compuesto, no hace falta
maquetar nada encima. La selección de proveedor sigue el mismo patrón ya
usado para elegir `openai-images` vs `simulated`
(`creativeProviderId = ... ` en `marketing-engine-run-background.js`),
extendido con una tercera opción condicionada a que existan las
credenciales de Canva.

**Sinergia arquitectónica a aprovechar**: los tres pasos de Canva (subida
de asset, autofill, export) son asíncronos con sondeo — exactamente el
mismo tipo de operación de larga duración que ya resolvimos en DT-17 con
el patrón Background Function + Netlify Blobs + polling
(`marketing-engine-run-background.js` + `marketing-engine-status.js`).
No hace falta inventar nada nuevo para esa parte: la función ya corre en
modo background (hasta 15 min), y el helper `fetchWithTimeout` ya escrito
en `openai-images.provider.js` es reutilizable tal cual para las llamadas
a Canva.

## Estado de la implementación (2026-08-02, DT-19)

**Código completo y verificado — pendiente solo de cuenta/credenciales reales.**
Arquitectura aprobada e implementada tal cual, sin desviaciones:

- `creative-engine/provider-manager/providers/canva.provider.js` —
  `generate(req)` real: sube la foto (`POST /v1/asset-uploads` + sondeo),
  rellena la plantilla (`POST /v1/autofills` + sondeo) y exporta
  (`POST /v1/exports` + sondeo + descarga). `status:'active'`.
- `netlify/functions/canva-auth.js` (nuevo) — refresco OAuth con
  persistencia del refresh_token rotativo en Netlify Blobs (confirmado
  contra la documentación oficial de Canva: cada refresh_token es de un
  solo uso, la respuesta de refresco siempre incluye uno nuevo que hay que
  guardar antes de la siguiente invocación — sin esto, la segunda
  ejecución real habría fallado).
- `creative-lab/index.js#composeWithCanva` + `composeFinalLayout` (ahora
  async) — exactamente el punto de conexión que describía la pregunta 10:
  sustituye a `layout-composer/service.js#composeLayout` cuando hay
  `canvaAccessToken` y una plantilla configurada para la familia oficial
  ya elegida por `selectPattern()` (la misma función que usa
  `layout-composer` — la decisión de familia no cambió). Si Canva falla
  por cualquier motivo, cae limpiamente al `layout-composer` de siempre
  sin romper el pipeline (mismo criterio de resiliencia que el resto del
  sistema), dejando el motivo en `layout.canvaError`.
- `marketing-engine-run-background.js` — obtiene el `canvaAccessToken` antes
  de invocar `runCreativeLab`, lo pasa como opción, y expone
  `creative.layoutStrategyId`/`creative.canvaError` en la respuesta para
  poder confirmar con datos reales (no adivinando) si una pieza concreta
  la compuso Canva.

**Verificado con la API de Canva mockeada** (sin llamada de red real —
ver más abajo por qué): flujo de éxito completo (subida → autofill →
exportación → descarga, 3 llamadas `POST` en el orden correcto, cada una
sondeada hasta `status:'success'`) y flujo de fallo real (Canva responde
500 en la subida → el pipeline cae a `layout-composer`, produce una pieza
final igualmente, y `layout.canvaError` registra el motivo exacto) — ambos
corridos contra el pipeline real de `creative-lab` (concept-generator,
art-direction-engine, `selectPattern`), no contra un mock del pipeline.

**Por qué no hay todavía una prueba con la API real de Canva**: al
intentar validar el flujo con las herramientas de Canva ya conectadas a
esta sesión, `list-brand-kits` devolvió cero brand kits y
`search-brand-templates` respondió "This feature requires a Canva paid
plan" — Brand Templates + Autofill (el mecanismo central de esta
arquitectura) no funciona sin Canva Pro/Teams/Enterprise, y esa cuenta
conectada no lo tiene. El propietario confirmó que la cuenta de
producción de Ofipapel sí tendrá (o ya tiene) plan de pago, pero es una
cuenta distinta, sin app de Developer registrada todavía — ver DT-19,
`.claude/rax/DEUDA_TECNICA.md`.

## Qué falta para la primera campaña real (todo fuera del código)

1. Cuenta de Canva con plan de pago (Pro/Teams/Enterprise) para Ofipapel.
2. App registrada en Canva Developer Portal → `CANVA_CLIENT_ID` /
   `CANVA_CLIENT_SECRET` (variables de entorno en Netlify).
3. Login OAuth interactivo único con esa app → `CANVA_REFRESH_TOKEN`
   inicial (variable de entorno en Netlify — `canva-auth.js` lo usa como
   semilla la primera vez y ya no vuelve a necesitarlo, guarda el rotado
   en Blobs).
4. Las 4 plantillas de marca (Lifestyle, Premium Editorial, Comercial,
   Problema-Solución) diseñadas en Canva con el Brand Kit real de
   Ofipapel, con los campos `titulo`/`cta`/`precio`/`direccion`/
   `foto_producto` etiquetados para autofill (pregunta 6) → sus
   `brand_template_id` en `CANVA_TEMPLATE_ID_LIFESTYLE` /
   `CANVA_TEMPLATE_ID_PREMIUM_EDITORIAL` / `CANVA_TEMPLATE_ID_COMERCIAL` /
   `CANVA_TEMPLATE_ID_PROBLEMA_SOLUCIÓN` (variables de entorno en Netlify).

Con esas 4 cosas puestas, el flujo ya está implementado y probado — no
hace falta ningún cambio de código adicional para la primera campaña real.

Esta fase no dependía de resolver primero el trade-off de fidelidad de la
segunda pasada de limpieza de texto de OpenAI (DT-18) — la fotografía de
referencia actual ya es válida como entrada para Canva; esa decisión
sigue abierta y pendiente del propietario, pero no bloqueaba esta
implementación.
