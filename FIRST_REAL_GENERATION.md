# Primera generación real — Marketing Engine → Creative Engine → proveedor real

Objetivo de este sprint: **no** construir arquitectura nueva — demostrar
que la ya construida funciona, conectando por primera vez los dos motores
con un proveedor de IA real:

```
Producto → Product Intelligence → Campaign Recommender → Director
Creativo → (mapper) → Creative Engine → Prompt Composer → OpenAI Images
→ Creative Validator → Almacén → Vista previa
```

## Archivos modificados

Solo 3 — nada más se ha tocado (ni agentes, ni `app.html`, ni
`intelligence/`, ni el resto de proveedores):

1. **`creative-engine/provider-manager/providers/openai-images.provider.js`**
   — implementación real. `status: 'planned'` → `'active'`. Llama a
   `POST https://api.openai.com/v1/images/generations` (modelo
   `gpt-image-1`), decodifica `b64_json` y lo escribe como PNG en
   `req.metadata.outputDir` (el mismo contrato que ya cumplía
   `simulated.provider.js`). Sin `OPENAI_API_KEY`, falla rápido con
   `err.code = 'PROVIDER_NOT_CONFIGURED'` sin llamar a la red.
2. **`netlify/functions/marketing-engine-run.js`** — único punto donde se
   conectan los dos motores. Tras completarse el pipeline de
   marketing-engine, llama a `creative-engine`:
   `fromMarketingEngine(finalJob)` → `runCreativePipeline(brief, {providerId, variantCount: 1})`.
   `finalJob` ya trae `input`/`state`/`intelligence` en la forma exacta
   que el mapper espera — no hizo falta adaptar nada del lado de
   marketing-engine.
3. **`creative-engine/provider-manager/README.md`** y **`CLAUDE.md`** —
   tabla de estado de proveedores y variables de entorno actualizadas.

## Integración realizada

- La elección de proveedor ocurre en `marketing-engine-run.js`, no dentro
  de `creative-engine/`:
  ```js
  const creativeProviderId = process.env.OPENAI_API_KEY ? 'openai-images' : 'simulated';
  ```
- El resultado se añade a la respuesta JSON existente en un campo nuevo
  `response.creative` (`creativeId`, `providerId`, `providerStatus`,
  `validation`) — aditivo, no rompe ningún consumidor actual.
- `response.renderedAsset` (el campo que ya pinta el Almacén) **solo se
  sustituye** por la imagen real de `openai-images` cuando la generación
  tiene éxito de verdad. Con el fallback `simulated`, se mantiene el PNG
  ya compuesto por el maquetador de marketing-engine (mejor preview que
  un placeholder) — la costura con creative-engine se ejecuta igual y
  queda registrada en `response.creative`, pero no degrada la vista
  previa actual. Así se cumple "no modificar la experiencia de usuario".
- Cualquier fallo de creative-engine (proveedor no configurado, error de
  red, validación) se captura con try/catch y se añade a
  `response.errors` — nunca rompe la respuesta del pipeline de
  marketing-engine, que sigue devolviendo 200 con su resultado normal.
- `creative-engine/` sigue sin importar nada de `marketing-engine/`
  (verificado): el único punto que conoce ambos motores sigue siendo este
  fichero puente, igual que ya conocía ambos antes de este sprint.

## Punto de sustitución

Activar generación real end-to-end = definir `OPENAI_API_KEY` en Netlify
(Site settings → Environment variables). Cero cambios de código. Sin la
variable, todo el sistema sigue funcionando exactamente igual que antes
de este sprint (proveedor `simulated`).

Para añadir un proveedor distinto en el futuro (Canva, Adobe Firefly,
etc.) el punto de sustitución sigue siendo el mismo que ya documentaba
`provider-manager/README.md`: implementar `generate()` en su fichero,
marcar `status: 'active'`, y — si se quiere que sea el elegido por
defecto en el puente — ajustar la única línea de
`marketing-engine-run.js` citada arriba.

## Limitaciones actuales

- Verificado estructuralmente (mapeo de tamaño, escritura de fichero,
  manejo de respuesta) con `fetch` sustituido por un doble de prueba —
  **no se ha hecho ninguna llamada real a la API de OpenAI** porque este
  entorno no tiene `OPENAI_API_KEY` configurada. La ruta de fallback
  (`simulated`) sí se ha verificado de punta a punta, incluida la
  respuesta completa de `marketing-engine-run.js`.
- Solo texto→imagen (`/v1/images/generations`). No se implementa el
  endpoint de edits/variaciones (referencia real de imagen de producto) —
  `supportsReferenceImages: false`, declarado con honestidad en
  `PROVIDER_META`.
- `gpt-image-1` solo admite tamaños fijos (1024×1024, 1024×1536,
  1536×1024); se usa el más cercano por relación de aspecto al formato
  real de `app.html`, no el tamaño exacto — el maquetador seguiría siendo
  quien recorte/ajuste si se necesitara el tamaño exacto.
- El bloqueante ya conocido de Playwright/Chromium en Lambda (para el
  maquetador de marketing-engine, ver `marketing-engine/INTEGRATION.md`)
  sigue sin resolverse — no afecta a esta costura porque el renderedAsset
  final, cuando `openai-images` tiene éxito, viene de creative-engine
  directamente, no del maquetador.

## Siguiente paso recomendado

Configurar `OPENAI_API_KEY` en un entorno real (o de prueba) y confirmar
la llamada real de punta a punta — hoy solo verificado con doble de
prueba por falta de credencial en este sandbox. Después, decidir si
`openai-images` sustituye a `simulated` como proveedor por defecto en
`creative-engine/provider-manager/registry.js` (hoy sigue siendo
`simulated` el default si no se pasa `providerId` explícito).
