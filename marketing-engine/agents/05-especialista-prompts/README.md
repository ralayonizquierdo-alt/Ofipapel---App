# Agente: Especialista en Prompts

## Responsabilidad única

Convierte todas las decisiones anteriores (estrategia, composición, ficha
de foto, reglas de fidelidad) en un prompt optimizado para un motor de
generación de imágenes, y decide qué proveedor usar.

## Límites explícitos

- **Nunca decide estrategia, composición ni ficha de foto** — solo las
  traduce a prompt.
- **No depende de un único proveedor** — `providerId` es un dato, no algo
  hardcoded en la lógica (ver `core/providers/registry.js`).

## Dónde encaja el "Proveedor de IA" del pipeline

Este agente NO invoca al proveedor — solo decide `providerId` y construye
`generationRequest`. Es el **orquestador** quien, justo después de este
paso, llama a `core/providers/registry.js` con esos datos y guarda el
resultado en `job.state['proveedor-ia']` antes de pasar a
`06-maquetador`. Así el diagrama del propietario
(`Especialista en Prompts → Proveedor de IA → Maquetador`) queda
representado exactamente, sin que el proveedor sea un agente con carpeta
propia (los proveedores son intercambiables por diseño, no tienen
responsabilidad creativa única).

## Entrada

`job.input` + `job.state['director-creativo']` + `job.state['director-arte']`
+ `job.state['fotografo-publicitario']`.

## Salida (`job.state['especialista-prompts']`)

```json
{
  "prompts": [{ "purpose": "generacion-imagen-principal", "text": "..." }],
  "providerId": "simulated",
  "generationRequest": { "prompt": "...", "width": 1080, "height": 1920, "contentClass": "photo" }
}
```

## Estado actual

Simulado — prompt genérico desde plantilla
(`prompts/image-prompt-template.prompt.md`), proveedor siempre `simulated`
(`config.js`).
