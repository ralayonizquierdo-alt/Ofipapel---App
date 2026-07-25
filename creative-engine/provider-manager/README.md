# Provider Manager

Registro central de proveedores creativos. Ver `provider.interface.js`
para el contrato exacto (`GENERATION_REQUEST_SHAPE`/`GENERATION_RESULT_SHAPE`/
`PROVIDER_META_SHAPE`) y `registry.js` para el mecanismo de registro.

## Estado hoy

| Proveedor | Estado | Tipo | Notas |
|---|---|---|---|
| `simulated` | **active** | image | Placeholder SVG determinista, sin red |
| `openai-images` | planned | image | |
| `canva` | planned | template | Rellena plantillas de marca, no genera desde cero |
| `adobe-firefly` | planned | image | `design-studio/scripts/firefly-generate.js` ya tiene el cliente HTTP |
| `ideogram` | planned | image | Fuerte en texto renderizado — ver nota en su fichero |
| `flux` | planned | image | |
| `runway` | planned | video | |
| `veo` | planned | video | |
| `kling` | planned | video | |

## Este registro es el canónico para generación creativa

`marketing-engine/core/providers/` tiene su propio registro (con 6 de
estos mismos ids, mismo estado `planned`) porque nació antes de que
existiera `creative-engine/`. Queda **legado**: sigue usando `simulated`
porque el pipeline de marketing-engine lo necesita hoy, pero no debe
recibir proveedores nuevos — cualquier proveedor real se activa aquí. Ver
`../ARCHITECTURE.md`, sección "Convivencia con marketing-engine".

## Cómo añadir un proveedor nuevo

1. Crear `providers/mi-proveedor.provider.js` exportando `PROVIDER_META`
   (con `capabilities` completo y honesto — qué `contentClasses` admite,
   si soporta `negativePrompt`/imágenes de referencia, cuántas variantes
   por llamada, qué formatos de salida) y `generate(req)`.
2. Añadir una línea al mapa `PROVIDERS` de `registry.js`.
3. Listo — `asset-pipeline/`, `prompt-composer/`, `variant-generator/` e
   `index.js` no cambian nada.

## Cómo activar un proveedor ya registrado (hoy solo `planned`)

1. Escribir el cuerpo real de `generate(req)` — llamar a la API del
   proveedor, guardar el resultado en `req.metadata.outputDir` (el
   directorio de versión que `creative-assets/store.js` ya preparó), y
   devolver `GENERATION_RESULT_SHAPE`.
2. Cambiar `PROVIDER_META.status` a `'active'`.
3. Guardar las credenciales en variables de entorno de Netlify, nunca en
   el repo — mismo criterio que `FIREFLY_CLIENT_ID`/`FIREFLY_CLIENT_SECRET`
   documentadas en `CLAUDE.md`.

`index.js#runCreativePipeline` ya distingue (por `err.code`) un proveedor
"no implementado todavía" de un fallo real dentro de un proveedor activo —
al activar uno, cualquier error real de la API se propaga como debe, no
se confunde con "planned".
