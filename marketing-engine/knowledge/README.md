# Biblioteca de conocimiento creativo

Esto es el cerebro del Motor de Marketing — no código, no prompts, no
nada específico de un modelo de IA concreto. Es **criterio profesional
reutilizable**: lo que sabe un Director Creativo de agencia antes de tocar
una sola herramienta. Cualquier motor de razonamiento (Claude, GPT, Gemini,
o un ser humano leyendo esto directamente) debe poder usarlo igual.

Los agentes del pipeline (`marketing-engine/agents/`) consultan estos
documentos antes de decidir — hoy sus `service.js` están en modo simulado
con reglas deterministas simples; a medida que se conecten a un LLM real,
ese LLM recibirá el contenido relevante de esta biblioteca como contexto,
no como un prompt de una sola línea. Esta carpeta es el activo que hace
que esa conexión futura razone como una agencia de verdad, no que
simplemente rellene una plantilla.

## Documentos

| Documento | Enseña a... |
|---|---|
| [`creative-playbook.md`](./creative-playbook.md) | Pensar como Director Creativo: cuándo vender, emocionar, sorprender o ser minimalista, y cómo elegir |
| [`campaign-strategies.md`](./campaign-strategies.md) | 15 estrategias de campaña reutilizables, cada una con objetivo, emoción, composición, formato, tono, CTA y errores frecuentes |
| [`art-direction-rules.md`](./art-direction-rules.md) | Pensar como Director de Arte: jerarquía visual, espacio negativo, equilibrio, composición |
| [`copywriting-playbook.md`](./copywriting-playbook.md) | Escribir para vender, informar o fidelizar; títulos, CTA, hashtags |
| [`social-media-playbook.md`](./social-media-playbook.md) | Elegir formato (foto/carrusel/reel/story) y canal (Instagram/Facebook) según el mensaje |

## Cómo se usan juntos estos documentos

No son 5 documentos independientes — son las etapas de una misma decisión,
en el mismo orden en que las toma el pipeline de agentes:

1. `creative-playbook.md` decide el **modo** (vender / emocionar /
   sorprender / minimalismo) y la propuesta única de la pieza.
2. `campaign-strategies.md` aterriza ese modo en un **patrón concreto de
   campaña** (Producto Hero, Oferta Flash, Vuelta al Cole...).
3. `art-direction-rules.md` traduce esa estrategia en **decisiones de
   composición** (jerarquía, tamaño de producto, posición de precio/logo).
4. `copywriting-playbook.md` escribe el **texto** coherente con el mismo
   modo y estrategia — nunca un texto de venta agresivo sobre una
   composición pensada para emocionar.
5. `social-media-playbook.md` decide el **formato y canal** finales según
   lo que la pieza necesita comunicar.

Si en algún punto el modo, la composición, el texto y el formato no
cuentan la misma historia, algo se decidió sin mirar el paso anterior —
esa es la comprobación de coherencia más simple y más importante.

## Cómo aplicar esto según la marca

Estos cinco documentos son criterio universal, pero la **ejecución**
debe ajustarse a la personalidad de cada marca (`design-studio/brand-kit.json`
tiene la paleta/tipografía exacta de cada una; aquí va el criterio de tono):

- **Ofipapel** — negocio local, cercano, familiar. El registro por defecto
  es cálido incluso cuando el modo es "Vender". Los ejemplos de este
  documento están mayoritariamente escritos con esta voz por ser la marca
  principal del ecosistema.
- **Canarias INK** — e-commerce de consumibles de impresora, más
  transaccional y orientado a especificación técnica (categorías tóner/
  inkjet/botella/cinta). El registro por defecto se acerca más al modo
  Minimalismo/informar que al modo Emocionar — el comprador de esta
  categoría busca compatibilidad y precio, no cercanía emocional.
- **FalControl** — herramienta personal sin relación de negocio con
  Ofipapel. Si alguna vez necesita comunicación de marketing, no hereda el
  tono cálido de Ofipapel ni el técnico de Canarias INK — necesitaría su
  propio criterio, no incluido todavía en esta biblioteca.

## Principio de esta biblioteca

**Criterio, no reglas rígidas.** Ninguno de estos documentos dice "siempre
haz X" sin explicar de qué depende esa decisión. El objetivo es que el
sistema razone con las mismas señales que usaría un profesional — no que
seleccione una plantilla fija de una lista.

**Crece con el tiempo.** Cada campaña real ejecutada por Ofipapel es una
oportunidad de aprendizaje: cuando algo funcione mejor o peor de lo
esperado, ese aprendizaje se añade aquí, no se pierde en una conversación.
Ver la sección "Aprendizajes" al final de cada documento.

**Ninguna referencia a herramientas.** Cero menciones a Claude, GPT,
Playwright, Adobe, ni ningún proveedor de imagen. Eso vive en
`marketing-engine/core/` y `design-studio/`. Esta biblioteca es
independiente de cómo se ejecute — sobrevive aunque cambie toda la stack
técnica por debajo.
