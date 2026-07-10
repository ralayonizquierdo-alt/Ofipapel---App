# Especificaciones por canal

Formatos y reglas concretas para cada tipo de pieza. Genera siempre a partir
de la identidad visual de `diseno-ofipapel`
(`.claude/skills/diseno-ofipapel/references/identidad-visual.md`).

## Banners web

- Para insertar en `canarias-ink.html` (p. ej. como bloque destacado sobre
  `#featured-products` o en un slot de oferta) o donde el negocio indique en
  la web de Ofipapel si llega a tener una.
- Medidas habituales a cubrir según el hueco: banner ancho de cabecera
  (1200×400 o 1600×500), banner cuadrado de tarjeta de oferta (600×600),
  banner vertical lateral (300×600) si el sitio tiene sidebar.
- Un único mensaje por banner: oferta/beneficio + CTA. Nada de varios
  productos compitiendo por atención en la misma pieza.
- Genera con la skill de diseño visual (Adobe Express / HTML autocontenido)
  usando los tokens de marca — nunca colores sueltos a mano.

## Instagram / Facebook — publicaciones (feed)

- Cuadrado 1080×1080 (recomendado también para Facebook por compatibilidad
  cruzada) o vertical 1080×1350 si se quiere maximizar espacio en feed
  móvil.
- Texto en la imagen mínimo (la plataforma penaliza exceso de texto en
  redes de pago si más adelante se usa Meta Ads — ver
  `conectores-roadmap.md`): titular corto + producto/oferta, el detalle va
  en el copy del pie de publicación, no en la imagen.
- Copy del pie: gancho en la primera línea (se corta en el feed), oferta o
  beneficio claro, CTA, máx. 3-5 hashtags relevantes (marca, categoría,
  localización — p. ej. `#Tenerife`, `#Canarias` cuando aplique), nunca
  relleno genérico de hashtags.

## Historias (Instagram / Facebook Stories)

- Vertical 1080×1920, diseño pensado para pulgar — CTA y elemento clave en
  el tercio central (los extremos superior/inferior quedan tapados por la
  UI de la app).
- Mensaje aún más reducido que en feed: una idea, una imagen, un CTA
  ("Desliza para ver más" / "Link en bio" si no hay conector de Meta Ads
  activo para sticker de enlace directo).
- Pensar en secuencias de 2-3 historias para una campaña grande en vez de
  una sola pieza sobrecargada.

## Imágenes para WhatsApp

- Cuadrado 1080×1080 o el formato que mejor previsualice en el chat; texto
  grande y legible en miniatura (WhatsApp comprime y el usuario la ve
  pequeña antes de abrirla).
- Pensadas para envío directo a clientes o para acompañar respuestas del
  agente de WhatsApp ya existente
  (`netlify/functions/whatsapp-webhook.js`,
  `netlify/functions/whatsapp-agent-config.js`) — coordina con esa
  infraestructura en vez de crear un canal de envío paralelo.
- Copy de acompañamiento corto, tono cercano (coherente con el
  `AI_SYSTEM_PROMPT` ya definido para el agente: cercano, natural, sin
  markdown ni listas largas).

## Newsletter

- Asunto: máx. ~50 caracteres, beneficio o urgencia claro, evita palabras
  que disparen spam (TODO MAYÚSCULAS, exceso de signos de exclamación,
  "gratis" repetido).
- Cuerpo: un CTA principal claro (no cinco enlaces compitiendo), estructura
  corta pensada para móvil, bloque de producto(s) destacado(s) coherente con
  la campaña activa.
- Hoy no hay conector de envío (Mailchimp/Brevo) activo — ver
  `conectores-roadmap.md`. Mientras tanto, entrega el contenido como
  borrador de email listo para copiar/pegar (o como Draft de Gmail si el
  usuario lo pide y hay conector de correo disponible en la sesión), no
  simules un envío real.

## Landing pages

- Pieza autocontenida en HTML (una sola página, sin dependencias externas
  salvo fuentes ya usadas en el sitio — Inter / IBM Plex Mono).
- Estructura mínima: héroe con oferta y CTA, bloque de producto(s)/beneficio,
  prueba social o dato de confianza si existe (envío gratis desde 50€,
  ubicación física de Ofipapel, etc.), CTA repetido al final.
- Dónde encaja en el despliegue: el sitio es estático y se ensambla en
  `build.sh` (copia archivos raíz a `_site/`) según `netlify.toml`. Una
  landing de campaña nueva sigue el mismo patrón: archivo `.html`
  autocontenido en la raíz del repo (p. ej. `promo-vuelta-al-cole.html`) que
  debe añadirse a la lista de copia de `build.sh` para que se publique junto
  al resto del sitio. No lo publiques sin confirmar con el usuario que debe
  desplegarse (ver reglas de acciones con impacto en el sistema del propio
  Claude Code).
- Alternativa rápida para revisión interna antes de publicar: entregar la
  landing como Artifact para que el negocio la vea y apruebe antes de
  integrarla en el build.

## SEO

Checklist a aplicar en landing pages, newsletters (versión web si la hay) y
contenido para el blog ya existente de Canarias INK:

- Un único `<title>` claro con la palabra clave principal cerca del
  principio (patrón ya usado en el sitio: `"Producto/Categoría – Marca"`,
  ver `<title>` de `canarias-ink.html`).
- `meta description` de 120-155 caracteres con el beneficio + CTA implícito
  (el sitio ya tiene un buen ejemplo en `canarias-ink.html`: sigue ese
  patrón de "qué es + qué ofrece + gancho de envío gratis").
- Un solo `<h1>` por página, jerarquía de encabezados coherente debajo.
- Texto alternativo (`alt`) descriptivo en imágenes de producto, incluyendo
  marca/modelo cuando aplique (relevante para búsquedas tipo "tóner Brother
  TN-2420").
- Palabras clave con intención de compra local: incluir "Canarias",
  "Tenerife" u otras islas cuando el contenido lo justifique — el negocio ya
  compite en ese espacio geográfico.
- Si hay conector de Search Console/Ahrefs activo en la sesión (ver
  `conectores-roadmap.md`), consulta consultas y páginas reales antes de
  suponer qué palabra clave usar.
