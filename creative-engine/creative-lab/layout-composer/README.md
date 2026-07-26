# Layout Composer

La pieza que faltaba entre "Creative Lab decide" y "se ve en la imagen
final". Antes de este módulo, el concepto ganador (estilo, composición,
iluminación, escenario...) solo describía un prompt — el maquetado real
seguía siendo una única plantilla fija, sin relación con esa decisión.

## Qué hace

Toma el concepto ganador de `runCreativeLab` + el asset que devolvió el
proveedor (foto real si existe, o el placeholder determinista si no) y
compone una pieza HTML real, renderizada a PNG vía
`design-studio/scripts/render-html.js` (mismo motor que ya usa
`marketing-engine/07-maquetador`, nunca reimplementado).

## Cómo elige el layout

- **Arquetipo** (6, en `archetypes/`): derivado de `concept.compositionId`
  (las 15 composiciones de `libraries/compositions.js`, agrupadas por
  afinidad visual real — ver `config.js#COMPOSITION_TO_ARCHETYPE`).
- **Énfasis tipográfico** (3 niveles): derivado de `concept.textSpaceId`
  — cuánto protagonismo tiene el titular dentro del arquetipo elegido.

Los dos ejes son independientes: el mismo arquetipo se ve distinto según
el énfasis, y el mismo énfasis se aplica de forma distinta según el
arquetipo — sin necesitar 6×7 plantillas hechas a mano.

## Arquetipos

| Arquetipo | Composición | Sensación |
|---|---|---|
| `centrado-clasico` | simétrica, triangular, radial | Producto centrado sobre placa, clásico |
| `diagonal-dinamico` | diagonal | Franja diagonal de acento, producto desplazado |
| `flotante-minimalista` | espacio negativo dominante | Mucho blanco, producto pequeño y flotante |
| `flat-lay-editorial` | flat-lay, patrón, marco | Producto enmarcado, sensación de orden |
| `cinematico-fullbleed` | regla de tercios, capas, horizonte bajo | Imagen a sangre completa, degradado dramático |
| `dividido-lifestyle` | encuadre cerrado/abierto, L, asimetría | Pantalla partida imagen/texto |

## Añadir un arquetipo nuevo

Un fichero nuevo en `archetypes/` con la firma `buildHtml(data) → string`
(mismos datos que los 6 existentes: `brand`, `product`, `copy`,
`heroImagePath`, `width`, `height`, `textEmphasis`) + una entrada en
`config.js#ARCHETYPES` y en `COMPOSITION_TO_ARCHETYPE` — cero cambios en
`service.js`.

## Fuera de alcance (por ahora)

- Reglas de armonía de paleta (`paletteHarmonyId`) — todos los
  arquetipos usan `preparedAssets.brand.palette` directamente, sin
  aplicar todavía la regla de armonía elegida por el concepto.
- Tendencias (`trendId`) — biblioteca validada pero no cableada en
  ningún punto de Creative Lab todavía (ver `creative-lab/ARCHITECTURE.md`).
