# Agente: Control de Calidad

## Responsabilidad única

Revisa absolutamente todo lo producido por el pipeline, detecta errores e
incoherencias, y puede devolver la publicación al agente responsable.

## Límites explícitos

- **Nunca corrige nada él mismo** — solo señala qué agente debe rehacer su
  parte (`returnTo`) y por qué (`reason`).
- **Es el último paso antes de "Publicación"** — si aprueba, el job pasa a
  `status: "completed"`.

## Entrada

`job.state['guardian-marca']` + `job.state['copywriter']` +
`job.state['maquetador']` (prácticamente todo el estado acumulado).

## Salida (`job.state['control-calidad']`)

```json
{
  "checklist": [
    { "name": "marca-aprobada", "passed": true, "detail": "ok" },
    { "name": "copy-tiene-cta", "passed": true, "detail": "ok" },
    { "name": "copy-tiene-hashtags", "passed": true, "detail": "ok" },
    { "name": "pieza-renderizada-existe", "passed": true, "detail": "ok" }
  ],
  "approved": true
}
```

Si `approved: false`, el resultado tiene `status: "needs_revision"` y
`returnTo` apunta al primer agente responsable del fallo (ver
`config.js` — cada check declara a quién devolver el job).

## Estado actual

Determinista real (`config.js`), no simulado — igual que
`03-guardian-marca`. El juicio subjetivo ("¿se ve bien de verdad?") queda
documentado como capa futura en `prompts/quality-review.prompt.md`.
