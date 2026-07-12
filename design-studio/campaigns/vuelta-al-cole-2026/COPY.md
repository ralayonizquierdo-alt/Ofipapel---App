# Campaña "Vuelta al Cole 2026" — Ofipapel

Primera campaña real generada con el pipeline `design-studio` +
`.claude/skills/diseno-ofipapel`. Sirve como caso de validación del sistema
(ver `.claude/rax/DECISIONES.md`, 2026-07-10) y como material listo para
publicar, revisado contra los datos reales del negocio:

- Identidad visual verificada contra el CSS real de `Index.html` (no
  inventada): verde `#1A5C1A`/`#237523`/`#3DAF3D`, acento lima `#8DC41E`,
  acento naranja `#F5A623`, tipografía Inter + IBM Plex Mono.
- Logo real (`logo-ofipapel.png`, subido por el propietario el 2026-07-12).
- Dirección, horario y teléfono reales, desde
  `netlify/functions/whatsapp-agent-config.js`.

## ⚠️ Antes de publicar — confirmar

1. **Número de WhatsApp**: todas las piezas usan `643 31 66 14` (el mismo
   teléfono de la ficha de la tienda) como número de contacto y en los
   enlaces `wa.me/34643316614`. No está confirmado que ese número sea
   exactamente el WhatsApp Business conectado a la Meta Cloud API del bot
   (`WHATSAPP_SETUP.md`) — verificarlo antes de publicar el enlace, igual
   que se detectó que el botón de WhatsApp de Canarias INK apuntaba a un
   número de ejemplo.
2. **Sin oferta numérica**: esta campaña no incluye descuento ni precio
   concreto (ej. "20% en material escolar") porque no hay datos reales de
   precio/margen para respaldarlo — inventar una cifra sería publicidad
   engañosa. El gancho de la campaña es el servicio real que ya se presta
   (preparar la lista, atención personal), no un precio. Si el negocio
   quiere añadir una oferta concreta, se actualiza el copy con esa cifra
   real antes de publicar.
3. **Fecha de campaña**: los textos son evergreen ("ya disponible", sin
   fecha de caducidad). Si se quiere acotar a una ventana concreta (p. ej.
   1 agosto – 15 septiembre), añadirlo antes de publicar.

## Piezas generadas

| Pieza | Fichero fuente (versionado) | Render | Dimensiones |
|---|---|---|---|
| Banner web | `design-studio/templates/ofipapel-vuelta-al-cole-banner.html` | `design-studio/output/vuelta-al-cole-banner-1200x630.png` | 1200×630 |
| Post Instagram/Facebook | `design-studio/templates/ofipapel-vuelta-al-cole-post.html` | `design-studio/output/vuelta-al-cole-post-1080x1080.png` | 1080×1080 |
| Story Instagram/Facebook | `design-studio/templates/ofipapel-vuelta-al-cole-story.html` | `design-studio/output/vuelta-al-cole-story-1080x1920.png` | 1080×1920 |
| Imagen WhatsApp | `design-studio/templates/ofipapel-vuelta-al-cole-whatsapp.html` | `design-studio/output/vuelta-al-cole-whatsapp-1080x1080.png` | 1080×1080 (texto mínimo, pensado para miniatura de chat) |
| Landing page | `design-studio/templates/ofipapel-vuelta-al-cole-landing.html` | página completa, responsive (no se renderiza a imagen — se sirve tal cual) | Responsive, mobile-first |

Los PNG se regeneran en cualquier momento con:
```bash
NODE_PATH=/opt/node22/lib/node_modules node design-studio/scripts/render-html.js \
  design-studio/templates/ofipapel-vuelta-al-cole-banner.html \
  design-studio/output/vuelta-al-cole-banner-1200x630.png 1200 630 2
```
(mismo patrón para post/story/whatsapp, cambiando fichero y dimensiones).

## Copy comercial

**Titular principal**: La Vuelta al Cole, resuelta en tu barrio
**Titular corto** (post/story/WhatsApp): Vuelta al Cole 2026

**Subtitular**: Trae la lista del cole y te la preparamos nosotros. Todo el
material escolar, cerca de casa, con atención de verdad — no un almacén
online sin rostro.

**Propuesta de valor (3 puntos, usados en todas las piezas)**:
1. Listas completas por curso y edad
2. Atención cercana en tienda
3. Encárgalo por WhatsApp

**Cómo funciona (landing, 3 pasos)**:
1. Envíanos la lista — por WhatsApp, foto o texto, al 643 31 66 14.
2. La preparamos — reunimos todo el material y te confirmamos cuándo está lista.
3. La recoges en tienda — en Bulevar Chajofe, 4, dentro de nuestro horario habitual.

## Llamadas a la acción (CTA)

| Contexto | CTA |
|---|---|
| Botón principal (banner, post, story, landing) | **Escríbenos por WhatsApp** |
| Botón imagen WhatsApp (minimalista) | **¡Trae tu lista!** |
| Botón secundario landing | Llamar · 643 31 66 14 / Cómo llegar (enlace a Google Maps con la dirección real) |
| Enlace WhatsApp usado en la landing | `https://wa.me/34643316614?text=Hola%2C%20quiero%20mi%20lista%20de%20Vuelta%20al%20Cole` (mensaje pre-rellenado) |

## Textos listos para copiar y pegar

**Caption Instagram/Facebook** (para acompañar el post cuadrado):
> Vuelta al Cole 2026 en Ofipapel 🎒 Trae la lista del cole y te la
> preparamos nosotros — todo el material escolar, cerca de casa, con
> atención de verdad. Escríbenos por WhatsApp al 643 31 66 14 o pásate por
> Bulevar Chajofe, 4, Los Cristianos.

**Mensaje de difusión por WhatsApp** (para lista de difusión/estados, junto a la imagen de WhatsApp):
> ¡Ya está aquí la Vuelta al Cole! 📚 Envíanos la lista de tu peque (foto o
> texto) y te la dejamos preparada para recoger. Escríbenos por aquí mismo o
> llámanos al 643 31 66 14.

**Texto corto para story (sticker de enlace / superposición si se añade en la app de Instagram)**:
> Desliza para escribirnos → tu lista, lista.
