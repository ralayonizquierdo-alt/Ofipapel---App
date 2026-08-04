# Agente: Director de Arte

## Responsabilidad única

Diseña composición, jerarquía, estructura y distribución de la pieza.

## Límites explícitos

- **Nunca crea fotografías** — eso es `04-fotografo-publicitario` (ficha
  técnica) y el proveedor de IA (imagen real).
- **Nunca decide la estrategia** — eso ya lo hizo `01-director-creativo`.
- **Nunca valida marca** — eso es `03-guardian-marca`, el siguiente paso.

## Entrada

`job.input` + `job.state['director-creativo']`.

## Salida (`job.state['director-arte']`)

```json
{
  "layoutId": "layout-centrado",
  "composition": "Producto centrado sobre placa clara con sombra, fondo de marca de fondo, texto en franja inferior reservada.",
  "hierarchy": ["logo", "eyebrow", "producto", "badges de características", "titular", "eslogan"],
  "structure": "vertical-1080x1920"
}
```

## Estado actual

Simulado — elige entre layouts predefinidos (`config.js`) según la familia
gráfica recibida. Prompt real ya redactado en
`prompts/composition.prompt.md` para cuando se conecte un LLM.
