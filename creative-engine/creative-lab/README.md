# Creative Lab

Módulo dentro de [`creative-engine/`](../ARCHITECTURE.md) dedicado
exclusivamente a investigar y perfeccionar la calidad visual — no genera
funcionalidades de negocio nuevas. Ver **[ARCHITECTURE.md](./ARCHITECTURE.md)**
para el diseño completo.

## Estado hoy

Arquitectura completa, verificada de punta a punta con el proveedor
`simulated`. Compatible con cualquier proveedor real ya registrado en
`../provider-manager/` sin cambios de código.

**Objetivo principal del proyecto, todavía sin resolver**: generar
fotografía de calidad por IA sin depender de una imagen aportada por el
usuario. `simulated` cubre dos rutas distintas y no deben confundirse:
placeholder abstracto (sin foto de partida) o foto real del usuario
compuesta tal cual (sin IA en ningún punto) — ninguna de las dos es
generación real. Hasta que un proveedor real (`openai-images` u otro)
esté conectado y verificado con una foto de nivel comparable generada
desde cero, este objetivo sigue abierto — ver `.claude/rax/ROADMAP_TECNICO.md`
(RT-09) y `.claude/rax/DECISIONES.md` (2026-07-26).

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
├── layout-intelligence/      calcula y puntúa el grid/jerarquía/equilibrio ANTES de renderizar — ver su README
├── layout-composer/          orquesta layout-intelligence/ y renderiza la pieza final real
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
