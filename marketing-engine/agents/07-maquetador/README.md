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

### Plantillas inteligentes por layoutId (2026-07-26)

Ya no hay una única plantilla fija — `config.js#TEMPLATES_BY_LAYOUT_ID`
selecciona `templates/*.js` según `job.state['director-arte'].layoutId`
(con `layout-centrado` como default si el layoutId no está registrado,
para no romper jobs existentes):

| layoutId | Fichero | Composición |
|---|---|---|
| `layout-centrado` | `templates/pieza-generica.js` | Producto centrado sobre placa, franja inferior de texto |
| `layout-diagonal` | `templates/layout-diagonal.js` | Franja diagonal de acento, producto desplazado, badge de oferta, botón CTA |

Añadir un layout nuevo = un fichero nuevo con la misma firma
`buildHtml(data) → string` + una entrada en `TEMPLATES_BY_LAYOUT_ID` —
cero cambios en `service.js`.

También se corrigió `agents/02-director-arte/config.js`: las jerarquías
de `producto-sobre-fondo-marca` (6 elementos) y `oferta-destacada` (5)
superaban el máximo de 4 que ya exigían tanto
`creative-engine/creative-validator/` como el filtro "Director de Arte
Senior" de `creative-lab/` — bloqueaban toda campaña de electrodomésticos/
papelería/ofertas sin que se notara hasta que Creative Lab empezó a
rechazarlas activamente. Ahora ambas declaran 4 elementos.
