# Agente: Guardián de Marca

## Responsabilidad única

Controla toda la identidad visual: colores, logotipo, tipografía,
composición, calidad. **Puede bloquear cualquier publicación.**

## Límites explícitos

- **Nunca decide composición** — eso ya lo hizo `02-director-arte`; este
  agente solo la valida contra la marca.
- **Nunca genera ni edita imágenes.**
- **Fuente única de verdad**: nunca declara colores/tipografía propios —
  siempre lee `design-studio/brand-kit.json` (ver `config.js`). Repetir
  esos valores aquí sería exactamente el error ya documentado en
  `.claude/rax/DECISIONES.md` (2026-07-10) que motivó este diseño.

## A diferencia de los otros 7 agentes

Este **no está simulado** — ejecuta comprobaciones deterministas reales
(existencia de la marca en `brand-kit.json`, colores/tipografía declarados,
eslogan obligatorio si aplica, assets de marca presentes en disco). El
juicio subjetivo de composición/calidad sobre una imagen ya generada queda
documentado como capa futura en `prompts/brand-review.prompt.md`.

## Entrada

`job.input.brand` + `job.state['director-arte']`.

## Salida (`job.state['guardian-marca']`)

```json
{
  "approved": true,
  "brandKey": "ofipapel",
  "checks": [
    { "name": "brand-kit-legible", "passed": true, "detail": "..." },
    { "name": "marca-existe-en-brand-kit", "passed": true, "detail": "\"ofipapel\" encontrada" },
    { "name": "colores-declarados", "passed": true, "detail": "8 colores declarados" },
    { "name": "tipografia-declarada", "passed": true, "detail": "Inter" },
    { "name": "eslogan-obligatorio", "passed": true, "detail": "Mucho más que papel" },
    { "name": "asset-en-disco:backgroundImage", "passed": true, "detail": "design-studio/assets/fondo-corporativo-ofipapel.png" },
    { "name": "asset-en-disco:logoTransparent", "passed": true, "detail": "design-studio/assets/logo-ofipapel-transparente.png" }
  ]
}
```

Si `approved: false`, el resultado tiene `status: "blocked"` y
`returnTo: "director-arte"` — el orquestador rebota el job automáticamente
(con límite de reintentos, ver `core/pipeline-config.js`).
