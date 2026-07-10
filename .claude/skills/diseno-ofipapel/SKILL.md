---
name: diseno-ofipapel
description: Guarda y aplica la identidad visual de Ofipapel y Canarias INK (colores, tipografías, logo, tono de voz). Úsala cuando cualquier Skill necesite generar o validar una pieza visual, de marca o de contenido para alguno de los dos negocios, para que el resultado sea coherente con lo ya publicado.
---

# diseno-ofipapel

Guardián de la identidad visual y de marca de Ofipapel y Canarias INK. Su
trabajo es que cualquier pieza nueva (banner, post, landing, newsletter,
imagen) se parezca a lo que el negocio ya ha publicado, sin que cada Skill
tenga que redescubrir los colores o el tono cada vez.

Esta es una versión mínima: cubre lo que `sales-marketing` necesita hoy
(tokens de marca reales, extraídos del propio repo). Se ampliará con guías
de composición, logotipos adicionales y plantillas de plantilla InDesign/
Express a medida que se vayan necesitando — sin romper lo que ya haya en
`references/identidad-visual.md`.

## Cuándo usarla

- Antes de elegir colores, fuentes o tono para cualquier pieza de Ofipapel o
  Canarias INK.
- Cuando otra Skill (p. ej. `sales-marketing`) necesite el logo, la paleta o
  las reglas de tono para generar contenido.
- Para validar que una pieza ya generada respeta la identidad visual antes
  de publicarla.

## Cómo usarla

1. Lee `references/identidad-visual.md` — ahí están los tokens reales
   (colores, tipografías, logo, tono de voz) por negocio.
2. Si necesitas el logo como archivo, usa `logo-canarias-ink.png` (raíz del
   repo) para Canarias INK. Ofipapel todavía no tiene un archivo de logo en
   el repo — está marcado como pendiente en las referencias; si lo generas
   o lo recibes, guárdalo en la raíz como `logo-ofipapel.png` y actualiza la
   referencia.
3. Si vas a introducir un color, fuente o elemento nuevo que no está en las
   referencias, decide si es una excepción puntual (dilo explícitamente) o
   si debe incorporarse a la identidad — en ese caso, actualiza
   `references/identidad-visual.md` en el mismo cambio, no lo dejes solo en
   la pieza generada.
4. Nunca dupliques los valores de marca dentro de otra Skill: enlaza a este
   archivo de referencia.

## Fuera de alcance (todavía)

Guías de maquetación avanzadas, sistema de iconografía, y activos de vídeo.
Cuando se necesiten, añádelos como nuevas referencias dentro de esta misma
Skill.
