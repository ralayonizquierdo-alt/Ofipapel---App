# Motor de Marketing con IA — Ofipapel

Pipeline de 8 agentes con responsabilidad única que convierte el brief de un
producto en una publicación lista para redes sociales — arquitectura
preparada para incorporar proveedores de IA reales (imagen/vídeo) sin tocar
el núcleo. Ver **[ARCHITECTURE.md](./ARCHITECTURE.md)** para el
razonamiento completo, los contratos y las decisiones tomadas.

## Ejecutar el pipeline

```bash
node marketing-engine/cli/run-pipeline.js marketing-engine/campaigns-input/ejemplo-producto-generico.json
```

El brief es un JSON con esta forma (ver
`core/contracts/job.contract.js` → `JOB_INPUT_SHAPE`):

```json
{
  "productName": "Ventilador Nebulizador MUVIP 75W",
  "category": "electrodomesticos",
  "brand": "ofipapel",
  "description": "...",
  "channel": "instagram",
  "images": []
}
```

`brand` debe ser una de `ofipapel` | `canarias-ink` | `falcontrol`.

## Qué hace hoy (2026-07-24)

Todo el pipeline corre de punta a punta **sin ningún proveedor de IA real
conectado** — el único proveedor activo es `simulated` (genera un
placeholder SVG determinista, sin red ni credenciales). Dos agentes ya son
integración real, no simulación:

- **`03-guardian-marca`**: valida de verdad contra
  `design-studio/brand-kit.json`.
- **`07-maquetador`**: renderiza de verdad con
  `design-studio/scripts/render-html.js` (Playwright/Chromium).

Los otros 6 agentes usan reglas deterministas simuladas, con una costura
clara y documentada para sustituirlas por un LLM real más adelante (ver
cada `agents/0N-*/service.js`, bloque `LÓGICA SIMULADA`).

## Activar un proveedor de IA real

Ver `core/providers/README.md`. Resumen: un fichero nuevo en
`core/providers/providers/`, cambiar su `status` a `'active'`, y apuntar
`05-especialista-prompts/config.js` a ese `providerId`. Cero cambios en el
orquestador ni en ningún agente.

## Integración con `app.html`

Ver **[INTEGRATION.md](./INTEGRATION.md)** — cómo el Almacén de `app.html`
crea campañas a través de `netlify/functions/marketing-engine-run.js`, qué
puntos del motor se tocaron para hacerlo posible, y la guía completa para
sustituir `simulated` por un proveedor de IA real.

## Capa de inteligencia (`intelligence/`)

Antes de que un job llegue a `01-director-creativo`, y otra vez cuando
termina, `marketing-engine/intelligence/` lo analiza, recomienda un
enfoque propio (con razones) y lo compara con lo que el pipeline decidió
de verdad — en modo `shadow` (por defecto) nunca cambia ninguna decisión,
solo asesora y registra. Ver **[intelligence/README.md](./intelligence/README.md)**
y **[ROADMAP_V2.md](./ROADMAP_V2.md)**.

```bash
node marketing-engine/cli/run-intelligence.js marketing-engine/campaigns-input/ejemplo-producto-generico.json
```

## `package.json`

No existe todavía — nada aquí necesita un paquete npm (mismo precedente que
`design-studio/`). El primer proveedor real activado que necesite un SDK es
la señal para crear uno.

## Estructura

```
marketing-engine/
├── core/           orquestador, contratos compartidos, registro de proveedores
├── agents/         los 8 agentes, cada uno autocontenido
├── knowledge/       el cerebro: criterio creativo reutilizable, sin código ni IA — ver knowledge/README.md
├── intelligence/    la capa de cálculo sobre ese criterio — ver intelligence/README.md
├── jobs/           estado + traza por ejecución (generado, no versionado salvo .gitkeep)
├── campaigns-input/ briefs de ejemplo para probar el pipeline
└── cli/            puntos de entrada de línea de comandos (pipeline + inteligencia)
```

## Conocimiento creativo (`knowledge/`)

Los 6 agentes hoy simulados (todos salvo Guardián de Marca y Maquetador,
ver arriba) toman decisiones con reglas deterministas simples en su
`config.js`. **Antes de conectarlos a un LLM real**, ese LLM debe recibir
como contexto el contenido relevante de `knowledge/` — el criterio de un
Director Creativo de agencia (cuándo vender/emocionar/sorprender, qué
estrategia de campaña usar, cómo componer, cómo escribir, qué formato
elegir). Sin eso, conectar un LLM solo cambia *quién* rellena la plantilla,
no la calidad de la decisión. Ver `knowledge/README.md`.
