# Capa de Inteligencia — `marketing-engine/intelligence/`

**Fecha de creación**: 2026-07-25. **Estado**: activa en modo `shadow`
(por defecto) en cada ejecución del pipeline — analiza, compara y
registra; no decide nada todavía.

## Por qué existe

El objetivo de este módulo no es depender de que el modelo de IA de turno
sea bueno. Es que **el conocimiento del sistema** — qué funciona para qué
producto, en qué momento, con qué enfoque — sea el activo real del
proyecto, independiente de qué proveedor de imagen/texto se conecte algún
día. Por eso `intelligence/` es **completamente independiente de
cualquier proveedor de IA**: cero llamadas de red, cero credenciales,
determinista de principio a fin.

## Los 5 componentes

| Componente | Qué hace | Ficheros |
|---|---|---|
| **Product Intelligence** | Analiza el producto: beneficios, objeciones, público objetivo, estacionalidad, banda de ticket, complementarios, emociones, argumentos de venta | `product-intelligence/` |
| **Campaign Recommender** | A partir de ese análisis, recomienda objetivo, tipo de campaña, formato, plataforma, estilo creativo, CTA, horario y nº de variantes — siempre con una razón por campo | `campaign-recommender/` |
| **Creative Score** | Puntúa (0-100) una campaña ya terminada: impacto visual, claridad, jerarquía, branding, atención, conversión, calidad del copy, adecuación al público | `creative-score/` |
| **Variant Engine** | Genera propuestas creativas alternativas (Lifestyle, Minimalista, Premium, Oferta, Black Friday, Problema→Solución, Comparativa, Corporate) | `variant-engine/` |
| **Learning Engine** | Arquitectura para aprender de resultados reales — hoy solo estructura, sin aprendizaje implementado | `learning-engine/` |

Un único punto de entrada las orquesta a todas: `index.js` →
`enrichJob(job)` / `closeJob(job)`. `core/orchestrator.js` no conoce los 5
componentes por separado, igual que no conoce el detalle interno de
ningún agente.

## Shadow Mode — el principio que gobierna todo esto

Por defecto (`MARKETING_ENGINE_INTELLIGENCE_MODE` sin definir, o
`=shadow`), esta capa **nunca cambia una decisión real del pipeline**:

1. `enrichJob(job)` corre antes del primer agente (director-creativo) y
   calcula `productProfile` + `recommendation` + `variants` — pero no
   toca `job.input`.
2. El pipeline decide exactamente igual que si `intelligence/` no
   existiera.
3. `closeJob(job)` corre al final, cuando la decisión real ya es
   definitiva, y **compara** la recomendación contra lo que el pipeline
   decidió de verdad (`shadowComparison`), explicando las discrepancias.
4. Se registra todo (`learning-engine/store.js`) para poder analizarlo más
   adelante — recomendación, decisión real, comparación, puntuación.

Cuando se hayan comparado suficientes campañas y se compruebe que las
recomendaciones son mejores o equivalentes a las decisiones actuales, se
activa el modo `decision` con **una sola variable de entorno**
(`MARKETING_ENGINE_INTELLIGENCE_MODE=decision`) — en ese modo,
`enrichJob()` aplica la recomendación como override de `job.input`
(`postTypeOverride`/`objective`/`creativeStyleHint`/`channel`), pero
**nunca** pisa un valor que el usuario ya haya elegido explícitamente. Ver
`mode.js` y `ROADMAP_V2.md` (Fase 1) para el criterio de cuándo dar ese
paso.

```
job.intelligence = {
  mode: 'shadow' | 'decision',
  productProfile,      // Product Intelligence
  recommendation,      // Campaign Recommender
  variants,             // Variant Engine
  shadowComparison,     // recomendación vs. decisión real (null hasta que el pipeline termina)
  creativeScore,        // Creative Score (null hasta que el pipeline termina)
}
```

Se adjunta en `jobs/<id>/job.json` (`core/contracts/job.contract.js` →
`JOB_SHAPE.intelligence`, opcional). **No se expone todavía** en la
respuesta HTTP de `netlify/functions/marketing-engine-run.js` — ver
`INTEGRATION.md`.

## Tres invariantes que no cambian con el modo

1. **Determinista.** Misma entrada + misma fecha efectiva
   (`MARKETING_ENGINE_NOW`, ver `clock.js`) = misma salida, siempre. Sin
   `Math.random`, sin llamadas de red.
2. **Asesora, nunca puerta.** `08-control-calidad` sigue siendo el único
   paso que puede bloquear una pieza. Una puntuación de 12/100 igual
   produce la pieza — se muestra tal cual para que el propietario decida.
3. **Complementa `knowledge/`, nunca lo duplica.** Las tablas de
   `product-intelligence/config.js`, `campaign-recommender/config.js` y
   `variant-engine/config.js` son claves de enlace hacia el criterio ya
   escrito en `marketing-engine/knowledge/` (nombres de estrategia,
   emociones, modos de comunicación) — nunca una redescripción. Si
   `knowledge/` cambia, estas tablas deben seguirlo.

## Limitaciones honestas (leer antes de confiar en un número)

- **Creative Score tiene 4 dimensiones proxy de 8** (impacto visual,
  atención, conversión, adecuación al público — 45 de 100 puntos). No hay
  visión por IA sobre el PNG generado ni resultados reales de campañas
  todavía, así que se calculan con señales indirectas, documentadas
  criterio a criterio en `creative-score/config.js`, y cada dimensión sale
  marcada `confidence:'proxy'` en el resultado.
- **`ticket` es una banda cualitativa (bajo/medio/alto), nunca un
  importe.** Este repo no contiene datos reales de precios de Ofipapel —
  inventarlos sería fabricar un hecho de negocio (ver la nota en
  `product-intelligence/config.js`).
- **`POSTING_WINDOWS` (horario recomendado) es la única tabla sin respaldo
  en `knowledge/` ni en datos reales** — es una heurística genérica
  documentada como tal, y la primera tabla que `learning-engine/` debe
  sustituir en cuanto haya suficientes resultados propios.
- **El almacén de aprendizaje es efímero en producción.** Igual que
  `MARKETING_ENGINE_JOBS_DIR`, `MARKETING_ENGINE_LEARNING_DIR` apunta a
  `/tmp` en Netlify Functions/Lambda — y `/tmp` no sobrevive más allá del
  contenedor. Mecánicamente correcto (mismo patrón que `jobs/`), pero como
  almacén de aprendizaje a largo plazo es un no-op real en producción
  hasta que se sustituya por un datastore de verdad — ver `ROADMAP_V2.md`,
  Fase 2.
- **`getRecommendationBias()` no aprende todavía**, aunque ya se llama en
  cada recomendación y ya cuenta campañas comparables reales — devuelve
  siempre un resultado neutro a propósito (ver `learning-engine/service.js`).

## Cómo probarlo

```bash
# Demo legible — la capacidad objetivo: que el motor explique su recomendación
node marketing-engine/cli/run-intelligence.js \
     marketing-engine/campaigns-input/ejemplo-producto-generico.json

# Con una fecha concreta (estacionalidad) y salida JSON
node marketing-engine/cli/run-intelligence.js \
     marketing-engine/campaigns-input/ejemplo-producto-generico.json \
     --date 2026-11-25 --json

# Regresión del pipeline completo (confirma que intelligence/ no cambia
# ninguna decisión real) — inspeccionar jobs/<id>/job.json → "intelligence"
# y jobs/<id>/events.log → intelligence_ready / intelligence_scored
node marketing-engine/cli/run-pipeline.js \
     marketing-engine/campaigns-input/ejemplo-producto-generico.json
```

No requiere ninguna variable de entorno para funcionar — las que existen
(`MARKETING_ENGINE_NOW`, `MARKETING_ENGINE_INTELLIGENCE_MODE`,
`MARKETING_ENGINE_LEARNING_DIR`) son todas opcionales, con un valor por
defecto seguro.

## Ver también

- `marketing-engine/ARCHITECTURE.md` §13 — cómo encaja esta capa en el
  pipeline (diagrama de las dos costuras con el orquestador).
- `marketing-engine/ROADMAP_V2.md` — cómo evoluciona en los próximos 12
  meses, incluido el criterio concreto para activar el modo `decision`.
- `marketing-engine/knowledge/` — el criterio profesional del que esta
  capa es solo la capa de cálculo.
