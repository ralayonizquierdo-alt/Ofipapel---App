# Plantilla — Plan de marketing anual

Estructura para construir el plan de marketing anual completo de Ofipapel,
Canarias INK, o ambos. Rellénala cruzando
`calendario-comercial.md` (cuándo) con `catalogo-y-cruces.md` (qué).

## 1. Resumen ejecutivo

- Negocio(s) cubiertos y periodo (año natural salvo que el usuario pida
  otro).
- 3-5 objetivos del año (p. ej. "aumentar ventas online de Canarias INK en
  Black Friday", "recuperar clientes de Ofipapel en la vuelta al cole",
  "consolidar Canarias INK como referencia en toda la comunidad autónoma").
- Nota de qué datos son reales/verificados (repo, negocio) y cuáles son
  estimaciones a validar — no presentar suposiciones como hechos.

## 2. Calendario mes a mes

Por cada mes del año:

- **Campaña(s) del mes**: de `calendario-comercial.md`, incluida la
  recurrente trimestral de IGIC cuando aplique.
- **Negocio(s) implicados**.
- **Producto/oferta propuesta**: de `catalogo-y-cruces.md`, no genérica.
- **Canal(es) principal(es)**: no todos los canales todos los meses —
  prioriza según el objetivo del mes (p. ej. Black Friday pesa más en
  online/redes/newsletter; vuelta al cole pesa más en tienda física +
  banner + WhatsApp local).
- **Ventana de producción**: cuándo debe estar lista la campaña (recordar
  que en Canarias el curso escolar empieza antes que en la Península, y que
  las piezas de campañas grandes necesitan tiempo de producción antes del
  pico de demanda).

## 3. Ventas cruzadas destacadas del año

Lista de 3-5 combinaciones de venta cruzada (de `catalogo-y-cruces.md`) que
tengan sentido repetir o reforzar a lo largo del año, no solo en una
campaña puntual.

## 4. Medición

- Qué se va a medir por campaña (tráfico, conversión, alcance en redes,
  aperturas de newsletter...) y con qué conector, si lo hay ya activo (ver
  `conectores-roadmap.md`).
- Si no hay conector activo para algún dato, decirlo explícitamente en vez
  de inventar una métrica.

## 5. Registro en la cola de trabajo

Al entregar el plan, registra cada campaña como propuesta en
`.claude/skills/project-manager/references/cola-prioridades.md` (título,
negocio, impacto, esfuerzo, fecha límite = ventana de producción del mes
correspondiente), para que el negocio pueda priorizar qué se ejecuta primero
en vez de recibir 12 meses de trabajo sin orden de ataque.

## Formato de entrega

Markdown por defecto. Si el usuario quiere una versión visual para
presentar al negocio, ofrécele generarla como Artifact (calendario/tabla) en
vez de solo texto plano.
