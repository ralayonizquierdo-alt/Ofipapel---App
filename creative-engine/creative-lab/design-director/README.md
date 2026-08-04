# Design Director Engine

La última revisión antes de renderizar. Art Direction Engine ya eligió un
patrón; Composition Engine (`../layout-intelligence/`) ya calculó y
puntuó la geometría dentro de ese patrón. Este módulo revisa el
RESULTADO combinado con 14 criterios de crítica de dirección de arte y
puede vetar la pieza aunque la puntuación agregada sea alta. Ver la
sección "Sprint Design Director Engine" en
[`../ARCHITECTURE.md`](../ARCHITECTURE.md) para el diseño completo,
incluidas las recalibraciones reales hechas tras verificar contra la
campaña Muvip.

## Orden real del pipeline

```
Creative Brief → Creative Lab → Art Direction Engine → Composition Engine (layout-intelligence/) → Design Director Engine (este módulo) → render (layout-composer/)
```

## Los 14 criterios

```
impactoVisual · equilibrio · tensionVisual · ritmo · respiracion · puntoFocal ·
legibilidad · recorridoVisual · tamanoRelativo · espacioNegativo · elegancia ·
limpieza · sensacionPremium · percepcionComercial
```

Cada uno es una función pura en `criteria.js` — heurística geométrica
sobre el `LayoutPlan` ya calculado (sin proveedor de IA con visión
conectado, ver el caveat de RT-09 en `.claude/rax/ROADMAP_TECNICO.md`),
reutilizando al máximo `layout-intelligence/grid.js` en vez de duplicar
matemática de composición.

## Reglas duras (veto, no puntuación)

Descalifican una pieza **aunque la puntuación agregada supere el
umbral** — mismo mecanismo que `concept-generator/self-critique.js`:

- **"El título nunca puede competir con el producto"**: si el área del
  título es mayor o igual que la del hero, veto directo.
- **"Parece plantilla automática"**: estrategia `centrado-clasico` +
  alineación centrada + centroide casi exacto + sin ningún recurso
  editorial (franja diagonal, marco, degradado) → veto.
- Precio ausente pese a existir en el brief.

## Bucle de reintento

`layout-composer/service.js#reviewLoop`: si `reviewComposition()` no
aprueba, se pide a Art Direction Engine un patrón editorial
**genuinamente distinto** (`excludePatternIds` — nunca repite el mismo
patrón, mismo criterio determinista que el resto del sistema, nunca
`Math.random`), hasta `MAX_DESIGN_RETRIES` (3 por defecto) intentos. Si
ninguno aprueba, se usa honestamente el mejor visto — nunca bloquea,
nunca lanza excepción por esto.

```bash
CREATIVE_LAB_DESIGN_QUALITY_THRESHOLD=78   # por defecto
CREATIVE_LAB_DESIGN_MAX_RETRIES=3          # por defecto
```

## Añadir un criterio nuevo

Una función más en `criteria.js#CRITERIA` (`(ctx) -> {points, detail}`,
`points` ya escalado a su peso) + una entrada en
`config.js#CRITERIA_WEIGHTS` (deben seguir sumando 100) — cero cambios en
`service.js`.
