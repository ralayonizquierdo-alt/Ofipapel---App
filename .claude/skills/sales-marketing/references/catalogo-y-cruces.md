# Catálogo y ventas cruzadas — Ofipapel y Canarias INK

Resumen de qué vende cada negocio (para decidir qué promocionar) y lógica de
venta cruzada entre ambos y dentro de cada uno. No es el catálogo en sí — el
catálogo real y vivo de Canarias INK está en `canarias-ink.html`
(`#catalog-grid`, `#featured-products`, filtros de marca/categoría); esto es
una capa de conocimiento de negocio para razonar sobre él, no un duplicado.

## Ofipapel — papelería física (Los Cristianos, Tenerife)

Negocio de proximidad: particulares (familias, estudiantes) y pymes/
autónomos de la zona que compran material de oficina y papelería. Fuente de
datos de tienda: `netlify/functions/whatsapp-agent-config.js`.

Categorías típicas de una papelería de este tipo a tener en cuenta al
proponer promociones (verificar con el negocio antes de dar por definitivo
el detalle de referencias/stock, que no está volcado en el repo):
- Material escolar (mochilas, cuadernos, escritura, manualidades).
- Material de oficina y archivo (papel, carpetas, archivadores, cajas).
- Impresión/copistería si la tienda la ofrece.
- Regalería y papelería creativa.
- Consumibles de impresora básicos para el cliente de proximidad (aquí es
  donde hay solape natural con Canarias INK — ver venta cruzada).

## Canarias INK — consumibles de impresión (online, toda Canarias)

Fuente real: `canarias-ink.html`. Vende tóner y cartuchos de inyección de
tinta (original y compatible/genérico), botellas de tinta para sistemas de
tinta continua, cintas y etiquetas, para las marcas de impresora: Epson,
Brother, Canon, Kyocera, Samsung, Lexmark, Ricoh, Konica, Xerox, Dymo,
Zebra, Olivetti, Toshiba, Pantum, Citizen, Sharp, Gestetner. Envío gratuito
en pedidos superiores a 50€ a toda Canarias. Ya tiene sección de ofertas y
blog activos.

Eje de decisión "qué promocionar" en Canarias INK:
- **Rotación por marca**: si el negocio puede indicar qué marcas/modelos
  rotan más, prioriza esas en banners y posts en vez de repartir el
  esfuerzo por igual entre 15 marcas.
- **Original vs. compatible**: son públicos distintos — original apela a
  garantía/tranquilidad, compatible/genérico apela a precio. Segmenta el
  mensaje según cuál se está promocionando, no mezcles ambos reclamos en la
  misma pieza.
- **Umbral de envío gratis (50€)**: usarlo como palanca de venta cruzada
  dentro del propio catálogo ("añade una etiqueta o una botella de tinta y
  supera los 50€ de envío gratis") en vez de solo como dato informativo.

## Ventas cruzadas

1. **Ofipapel → Canarias INK**: un cliente de la tienda física que compra
   una impresora o pregunta por tóner es candidato directo a Canarias INK
   para reposición de consumibles — sobre todo si no vive cerca de la
   tienda o compra online habitualmente. Oportunidad: código o mención en
   ticket/WhatsApp de Ofipapel hacia la web de Canarias INK.
2. **Canarias INK → Ofipapel**: un cliente online de Canarias INK que está
   en Tenerife-Sur es candidato a conocer la tienda física para compra
   urgente (consumible que no puede esperar al envío) o para material de
   oficina que no vende Canarias INK.
3. **Dentro de Canarias INK**: tóner/cartucho de una marca + etiquetas o
   cinta compatible con el mismo uso (oficina que imprime y etiqueta), o
   empujar el pedido sobre el umbral de 50€ de envío gratis.
4. **Dentro de Ofipapel**: material escolar + mochila/agenda en vuelta al
   cole; papel de factura + archivador + carpetas en campaña de cierre de
   IGIC trimestral.

## Qué producto conviene promocionar — criterio por defecto

Cuando el usuario no da una prioridad explícita, decide en este orden:
1. Lo que cruza con la campaña estacional activa (`calendario-comercial.md`).
2. Lo que el negocio indique que tiene mejor margen o stock que mover.
3. Lo más buscado/vendido si hay datos de un conector conectado (ver
   `conectores-roadmap.md` — Search Console, Ahrefs, futura analítica de
   ventas), en vez de una suposición.
4. Si no hay ninguna señal, no inventes un dato de ventas/margen — pregunta
   al negocio en vez de asumir cuál es "el producto estrella".
