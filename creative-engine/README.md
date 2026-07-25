# Creative Engine

La capa de generación de contenido — independiente de
[`marketing-engine/`](../marketing-engine/), que es la capa de
inteligencia. Ver **[ARCHITECTURE.md](./ARCHITECTURE.md)** para el diseño
completo, cómo conviven ambos motores, y cómo se conectará un proveedor
de IA real más adelante.

## Estado hoy

Arquitectura completa, verificada de punta a punta. **Ningún proveedor de
IA real conectado** — el único activo es `simulated` (placeholder SVG
determinista, sin red ni credenciales). Ver
`provider-manager/README.md` para el estado de cada proveedor y cómo
activarlo.

## Ejecutar la demo

```bash
node creative-engine/cli/run-creative-demo.js <brief.json> [--provider id] [--variants N] [--from-marketing-engine] [--json]
```

- `--from-marketing-engine`: el JSON de entrada tiene forma de job de
  marketing-engine (`input`/`state`/`intelligence`), se traduce con
  `brief/from-marketing-engine.js`. Sin el flag, el JSON debe ser ya un
  `CreativeBrief` válido (ver `brief/contracts.js`).
- `--variants`: `1`, `3`, `5` o `10`.
- `--provider`: id de `provider-manager/registry.js` (por defecto
  `simulated`).

Ejemplos completos en `cli/briefs/` (uno con forma de marketing-engine,
otro deliberadamente incompleto para ver fallar al Validador).

## Estructura

```
creative-engine/
├── shared/            DSL de validación (copia independiente) + generador de ids
├── brief/              CreativeBrief — el único contrato de entrada, y mapper desde marketing-engine
├── provider-manager/   registro de proveedores creativos (9 registrados, 1 activo)
├── asset-pipeline/     resuelve brand-kit, paleta, logo, dimensiones
├── prompt-composer/    construye el prompt automáticamente, por secciones modulares
├── variant-generator/  1/3/5/10 variantes de ejecución visual, realmente distintas
├── creative-validator/ 6 checks antes de aceptar una pieza
├── creative-assets/    almacén de imágenes/vídeos/prompts/metadatos/versiones
├── cli/                demo de línea de comandos + briefs de ejemplo
└── index.js            punto de entrada único
```

## `package.json`

No existe — cero dependencias npm, mismo criterio que `marketing-engine/`
y `design-studio/`. El primer proveedor real que necesite un SDK es la
señal para crear uno.
