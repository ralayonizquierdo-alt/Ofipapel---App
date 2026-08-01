# Proveedores de IA — registro y activación

Este directorio implementa la abstracción de proveedores de generación de
imágenes/vídeo del motor de marketing. Ningún proveedor real está activado
todavía (2026-07-24) — solo `simulated` (`status: "active"`), que genera un
placeholder determinista sin red ni credenciales, para poder ejecutar el
pipeline completo hoy mismo.

## Cómo activar un proveedor planned

1. Abre `providers/<proveedor>.provider.js` — cada uno documenta en su
   cabecera qué necesita (SDK, variable de entorno con la API key).
2. Implementa `generate(req)` sustituyendo el `throw new Error(...)` actual,
   devolviendo `{ assetPath, providerId, rawResponse }` (ver
   `provider.interface.js` para la forma exacta — `GenerationResult`).
3. Cambia `PROVIDER_META.status` de `'planned'` a `'active'`.
4. Si el proveedor necesita un paquete npm que no existe todavía en este
   repo: es la señal para crear `marketing-engine/package.json` (hasta
   ahora este subsistema no tiene ninguno, igual que `design-studio/`).
5. No hace falta tocar `registry.js` (ya está registrado), ni
   `core/orchestrator.js`, ni ningún `agents/*/service.js` — el agente
   `05-especialista-prompts` decide qué `providerId` usar leyendo su propio
   `config.js`; cambia ese valor cuando quieras que el pipeline use el
   proveedor recién activado en vez de `simulated`.

## Caso especial: Adobe Firefly

`adobe-firefly.provider.js` NO debe reimplementar el flujo OAuth
Server-to-Server — ese código ya existe, escrito (sin probar con
credenciales reales todavía), en `design-studio/scripts/firefly-generate.js`.
Al activarlo, delega en ese script en vez de duplicar lógica.

## Proveedores registrados

| id | status | kind | notas |
|---|---|---|---|
| `simulated` | active | image | placeholder SVG determinista, sin red |
| `openai-images` | planned | image | — |
| `google-images` | planned | image | — |
| `ideogram` | planned | image | fuerte en composición con texto dentro de la imagen |
| `adobe-firefly` | planned | image | delegar en `design-studio/scripts/firefly-generate.js` |
| `flux` | planned | image | vía gateway (Replicate/fal.ai) o API propia, a decidir |
| `runway` | planned | video | para cuando el pipeline soporte Reels generados por IA |
| `veo` | planned | video | alternativa a runway para vídeo |
