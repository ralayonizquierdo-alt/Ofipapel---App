# Creative Lab

Módulo dentro de [`creative-engine/`](../ARCHITECTURE.md) dedicado
exclusivamente a investigar y perfeccionar la calidad visual — no genera
funcionalidades de negocio nuevas. Ver **[ARCHITECTURE.md](./ARCHITECTURE.md)**
para el diseño completo.

## Estado hoy

Arquitectura completa, verificada de punta a punta con el proveedor
`simulated`. Compatible con cualquier proveedor real ya registrado en
`../provider-manager/` sin cambios de código.

## Ejecutar la demo

```bash
node creative-engine/creative-lab/cli/run-creative-lab-demo.js <brief.json> [--provider id] [--concepts N] [--from-marketing-engine] [--json]
```

- `--concepts`: 8-12 (por defecto 10).
- El resto de flags, igual que `creative-engine/cli/run-creative-demo.js`.

## Estructura

```
creative-lab/
├── libraries/               9 bibliotecas atómicas (el "vocabulario")
├── reference-library/       la Biblioteca de Referencias (el "lenguaje") — escalable a decenas de miles
├── analysis/                filtra referencias elegibles según el CreativeBrief
├── concept-generator/       8-12 conceptos, mezcla + variación propia obligatoria
├── moodboard/                moodboard textual por concepto
├── master-prompt-composer/  extiende prompt-composer/ de creative-engine
├── concept-score/            evaluación en dos capas (plan gratis + real con coste)
├── layout-composer/          compone la pieza final real (6 arquetipos) según el concepto ganador
├── cli/                      demo de línea de comandos
├── config.js                  QUALITY_THRESHOLD / MAX_RETRIES / SHORTLIST_SIZE
└── index.js                   runCreativeLab() — punto de entrada único
```

## Añadir referencias a la biblioteca

```js
const { registerEntry } = require('./reference-library/service.js');
registerEntry({ id: '...', styleId: '...', /* ver reference-library/schema.js */ });
```

Ver `reference-library/seed-inicial.js` como plantilla de formato.

Para dar de alta una campaña propia ya aprobada (no una referencia
textual), usa `reference-library/import-from-campaign.js#importFromCampaign(creativeId, versionNumber, curation)`
— lee el concepto ganador directamente de `creative-assets/store.js` y
solo pide los campos cualitativos que no se pueden inferir solos.
