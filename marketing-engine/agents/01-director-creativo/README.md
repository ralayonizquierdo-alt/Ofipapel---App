# Agente: Director Creativo

## Responsabilidad única

Analiza el producto y decide:
- Estrategia (qué se quiere transmitir)
- Tipo de publicación (`foto` | `carrusel` | `reel`)
- Tono
- Canal (`instagram` | `facebook` | `whatsapp` | `ambas`)
- Familia gráfica

## Límites explícitos

- **Nunca genera imágenes** — eso es `05-especialista-prompts` + el proveedor de IA.
- **Nunca diseña la composición** — eso es `02-director-arte`.
- **Nunca escribe el copy final** — eso es `07-copywriter`.

## Entrada

`job.input` (el brief inicial: `productName`, `category`, `brand`,
`description`, `channel`, `images`). Es el primer agente del pipeline, no
depende de la salida de ningún otro.

## Salida (`job.state['director-creativo']`)

```json
{
  "strategy": "Mostrar el Ventilador Nebulizador MUVIP 75W destacando su beneficio principal para el público de ofipapel.",
  "postType": "reel",
  "tone": "cercano y práctico",
  "channel": "instagram",
  "graphicFamily": "producto-sobre-fondo-marca"
}
```

## Estado actual

Simulado — reglas deterministas por categoría (`config.js`). Ver el bloque
`LÓGICA SIMULADA` en `service.js` para el punto de enganche hacia un LLM
real; el prompt ya está redactado en `prompts/strategy.prompt.md`.
