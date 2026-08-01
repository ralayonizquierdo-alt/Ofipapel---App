# Plantilla: prompt final para el proveedor de generación de imagen

> Usado por `service.js` para construir `generationRequest.prompt`. No es
> un prompt para un LLM de razonamiento — es la plantilla de texto que se
> envía directamente al proveedor de imagen (hoy `simulated`, mañana
> OpenAI Images/Firefly/Flux/etc.).

## Plantilla

```
{{productName}}, {{photoSpec.angle}}, {{photoSpec.background}}, {{photoSpec.lighting}}.
Composición: {{composition}}.
Tono/estrategia: {{strategy}}.
Reglas de fidelidad (obligatorias, no negociables): {{fidelityRules}}.
```

## Notas para cuando se conecte un proveedor real

Cada proveedor tiene su propio "dialecto" de prompt óptimo (longitud,
palabras clave, negative prompts, parámetros de estilo). Este agente debe
soportar variantes por proveedor — `service.js` construye hoy un único
prompt genérico; al activar un proveedor concreto, añadir aquí una sección
específica (p. ej. "## Variante Ideogram", "## Variante Firefly") en vez de
bifurcar la lógica dentro de `service.js`.
