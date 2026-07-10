# Roadmap de conectores externos

Arquitectura prevista para que `sales-marketing` (y cualquier Skill futura)
se conecte a herramientas externas de marketing/analítica, más el estado
real de cada una hoy. El objetivo es que añadir un conector nuevo no
requiera rediseñar la Skill: cada conector se documenta con el mismo
formato, y el `SKILL.md` solo necesita comprobar su estado antes de usarlo.

## Patrón de conector

Cada conector, cuando exista, se documenta con:
- **Propósito**: qué decisión o pieza mejora al tenerlo.
- **Dirección del dato**: de RAX hacia la herramienta (publicar), de la
  herramienta hacia RAX (leer datos), o ambas.
- **Cómo se accede hoy**: herramienta MCP concreta si ya hay una disponible
  en la sesión, o "ninguna — pendiente" si no.
- **Qué hacer si no está disponible**: nunca simular datos ni una acción
  como si el conector existiera (no inventar métricas, no fingir que se ha
  publicado un anuncio). Decirlo explícitamente y ofrecer la alternativa
  manual.

Importante: qué herramientas MCP están disponibles puede variar de una
sesión a otra. Antes de dar un conector por "activo", comprueba en la sesión
actual que la herramienta sigue ahí (con `ToolSearch` si es una herramienta
diferida) en vez de asumir el estado escrito aquí.

## Estado por conector

### Google Search Console
- **Propósito**: basar el SEO de landing pages/blog en consultas y páginas
  reales en vez de intuición.
- **Cómo se accede hoy**: **parcialmente disponible** — el servidor MCP de
  Ahrefs incluye herramientas `gsc-*` (`gsc-keywords`, `gsc-pages`,
  `gsc-performance-history`, `gsc-positions-history`, etc.) que leen datos
  de Search Console si el proyecto está enlazado en la cuenta de Ahrefs.
  Verificar primero con `mcp__Ahrefs__doc` y las herramientas de gestión de
  proyecto (`management-projects`) que el dominio de Canarias INK/Ofipapel
  esté dado de alta antes de usarlo.
- **Dirección**: lectura.

### Analítica web (tipo Google Analytics)
- **Cómo se accede hoy**: **parcialmente disponible vía Ahrefs** — el
  servidor Ahrefs expone `web-analytics-*` (tráfico, fuentes, páginas de
  entrada/salida, dispositivos...), que es la analítica web propia de
  Ahrefs, no necesariamente Google Analytics. Válida como fuente de datos de
  tráfico si el sitio está dado de alta ahí; si el negocio usa Google
  Analytics de verdad, ese conector específico sigue **pendiente**.
- **Dirección**: lectura.

### Meta Ads (Instagram/Facebook Ads)
- **Propósito**: publicar y medir campañas de pago en Instagram/Facebook
  directamente desde RAX, y ajustar el contenido orgánico con datos de lo
  que mejor rinde en pago.
- **Cómo se accede hoy**: ninguna herramienta MCP disponible — **pendiente**.
- **Mientras tanto**: `sales-marketing` genera las piezas (posts/historias)
  listas para publicar manualmente; no reclama haber publicado ni haber
  medido resultado.

### Google Ads
- **Propósito**: campañas de búsqueda/shopping para Canarias INK
  (consumibles con alta intención de compra por búsqueda de marca/modelo de
  impresora).
- **Cómo se accede hoy**: **pendiente**.
- **Mientras tanto**: usar el trabajo de palabra clave de Search Console/
  Ahrefs (ver arriba) para preparar los grupos de anuncios en formato texto,
  listos para cargar manualmente cuando el conector exista.

### Mailchimp / Brevo (envío de newsletter)
- **Propósito**: enviar y medir la newsletter directamente.
- **Cómo se accede hoy**: **pendiente** ninguna de las dos.
- **Mientras tanto**: entregar el contenido como borrador de email (y, si
  hay conector de Gmail disponible en la sesión, como Draft real de Gmail)
  para que el negocio lo envíe desde su herramienta actual.

### WhatsApp Business
- **Propósito**: envío de campañas/imágenes promocionales a clientes por
  WhatsApp.
- **Cómo se accede hoy**: el negocio **ya tiene infraestructura propia** —
  no es un conector MCP de RAX, pero existe y hay que coordinarse con ella
  en vez de duplicarla: `netlify/functions/whatsapp-webhook.js` (Meta Cloud
  API y alternativa Twilio) y `netlify/functions/whatsapp-agent-config.js`
  (datos del negocio, reglas de FAQ, prompt del agente). `sales-marketing`
  genera las imágenes/copys pensados para ese canal; la Skill no modifica
  esas funciones salvo que el usuario pida explícitamente cambiar el
  comportamiento del agente.
- **Dirección**: RAX genera contenido → el negocio (o el agente ya
  existente) lo envía.

### Google Business Profile
- **Propósito**: publicaciones, ofertas y respuestas a reseñas en la ficha
  de Google de la tienda física de Ofipapel (y de Canarias INK si aplica).
- **Cómo se accede hoy**: **pendiente**.
- **Mientras tanto**: generar el texto de la publicación/oferta listo para
  pegar manualmente en la ficha.

## Al añadir un conector nuevo

1. Añade su entrada aquí con el mismo formato, no crees un documento nuevo
   por conector salvo que el detalle sea muy extenso (en tal caso, enlázalo
   desde aquí).
2. Actualiza el `SKILL.md` de `sales-marketing` solo si cambia el flujo de
   trabajo (p. ej. "ahora consulta X antes de proponer palabra clave") — no
   dupliques el estado del conector en dos sitios.
3. Si el conector permite una acción con efecto real (publicar un anuncio,
   enviar una campaña, gastar presupuesto), trátalo como una acción de alto
   impacto: confirma con el usuario antes de ejecutar, igual que con
   cualquier otra acción difícil de revertir.
