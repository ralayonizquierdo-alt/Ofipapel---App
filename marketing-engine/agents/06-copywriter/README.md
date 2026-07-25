# Agente: Copywriter

## Responsabilidad única

Genera título, cuerpo, CTA, hashtags y descripción, adaptado a cada red
social.

## Límites explícitos

- **Nunca decide estrategia ni tono** — eso ya lo hizo `01-director-creativo`.
- **Nunca maqueta la pieza** — eso es `07-maquetador`, el siguiente paso.

## Nota de posición en el pipeline

Ver el comentario al principio de `interface.js`: el diagrama de flujo del
propietario no fija explícitamente dónde va el Copywriter. Se colocó antes
del Maquetador porque este último recibe "imágenes, fondos y elementos" —
el copy es uno de esos elementos y debe existir antes de maquetar.

## Entrada

`job.input` + `job.state['director-creativo']`.

## Salida (`job.state['copywriter']`)

```json
{
  "title": "Ventilador Nebulizador MUVIP 75W",
  "body": "Refresca y humedece el ambiente",
  "cta": "Míralo en tienda",
  "hashtags": ["#ofipapel", "#loscristianos", "#tenerife", "#ventiladornebulizadormuvip75w"],
  "description": "Refresca y humedece el ambiente Míralo en tienda. #ofipapel #loscristianos #tenerife #ventiladornebulizadormuvip75w"
}
```

## Estado actual

Simulado — plantillas parametrizadas por tono/canal/marca (`config.js`).
Prompt real ya redactado en `prompts/copy.prompt.md`.
