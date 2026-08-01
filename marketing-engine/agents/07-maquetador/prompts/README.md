# Por qué esta carpeta está casi vacía

El Maquetador es, junto al Guardián de Marca, el otro agente que hoy NO
necesita un LLM para funcionar: monta la pieza final con reglas
deterministas (elegir plantilla + rellenar datos + delegar el render en
`design-studio/scripts/render-html.js`). No hay decisión creativa que
tomar aquí — solo ensamblaje.

Carpeta mantenida por consistencia con el patrón de los 8 agentes
(config/README/prompts/state/interface/service), no porque esté vacía por
descuido. Si en el futuro el Maquetador necesita elegir entre varias
plantillas de forma no trivial (más allá del mapeo determinista de
`config.js`), ese es el momento de añadir aquí un prompt real de
"selección de plantilla".
