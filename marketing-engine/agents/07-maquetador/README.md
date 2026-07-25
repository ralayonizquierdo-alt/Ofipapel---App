# Agente: Maquetador

## Responsabilidad única

Recibe imágenes, fondos y elementos (copy) ya decididos, y construye
automáticamente la publicación usando una plantilla inteligente.

## Límites explícitos

- **Nunca diseña desde cero** — la composición ya la decidió
  `02-director-arte`, el copy ya lo decidió `06-copywriter`.
- **Nunca reimplementa el render** — siempre delega en
  `design-studio/scripts/render-html.js` (Playwright/Chromium), el mismo
  motor que ya usa la Skill `diseno-ofipapel`.

## A diferencia de la mayoría de los otros agentes

**Este no está simulado** — es integración real. Construye un HTML
autocontenido (`templates/pieza-generica.js`) a partir de
`design-studio/brand-kit.json` + los datos del job, y lo renderiza a PNG de
verdad. "Plantillas inteligentes" (plural): añadir un layout visual
distinto es un fichero nuevo en `templates/` + una entrada en `config.js`,
sin tocar `service.js`.

## Entrada

`job.input` + `job.state['director-arte']` + `job.state['copywriter']` +
`job.state['proveedor-ia']` (resultado del proveedor de IA, que el
orquestador guarda ahí — ver `05-especialista-prompts/README.md`).

## Salida (`job.state['maquetador']`)

```json
{
  "renderedAssetPath": "/ruta/absoluta/a/pieza-final.png",
  "templateUsed": "pieza-generica",
  "width": 1080,
  "height": 1920
}
```

## Estado actual

Integración real y funcional hoy mismo, usando el proveedor `simulated`
como fuente de imagen (placeholder SVG) mientras no haya un proveedor de IA
real activado.
