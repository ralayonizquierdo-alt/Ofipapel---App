# Ofipapel — App (ecosistema RAX)

Monorepo con varios productos independientes ligados al negocio Ofipapel
(papelería) y proyectos personales del propietario. No hay un `package.json`
en la raíz: cada subproyecto se gestiona por separado. Este archivo es el
punto de entrada que Claude Code carga automáticamente al empezar cualquier
sesión — no dupliques aquí lo que ya vive en otro sitio.

## Estructura

| Ruta | Qué es | Stack |
|---|---|---|
| `inicio.html` | **Hub del ecosistema** — pantalla de entrada estilo "red neuronal" (fondo negro, marco metálico circular, 8 nodos con icono plano y aro de neón propio conectados al centro por líneas tipo rayo animadas + sonido) para saltar a cualquiera de las apps: Gestión Finanzas (`Index.html`), Alquileres, Vacaciones y Turnos, Fichaje, WhatsApp BOT (enlaza a la función Netlify `conversations`), Roturas Almacén (enlaza a `rax-os.vercel.app`, app externa fuera de este repo), Compras (`control-pedidos.html`, que lleva dentro la herramienta de Importación Pedidos en su pestaña «PDF a Excel»; desde el 2026-10-07 — antes el nodo se llamaba «PDF's», tenía una hoja PDF y abría `importacion-pedidos-proveedores.html` suelta; el nombre y el carrito rojo van dibujados dentro de la imagen del icono, no son texto) y RR.SS. Manager (enlaza a `ofipapel-social-manager.vercel.app`, app externa fuera de este repo — funcionalmente solapa con `app.html`/`marketing-engine`/`creative-engine` de este mismo repo, ver DT correspondiente en `.claude/rax/DEUDA_TECNICA.md`, pendiente de decidir cuál es la canónica). Canarias INK, Joe App y FalControl ya no tienen icono en el hub (siguen existiendo como páginas propias, solo no están enlazadas desde aquí). HTML/CSS/JS vanilla en un único fichero, sin build ni dependencias externas (solo Google Fonts) — los iconos son SVG planos inline y los conectores se generan por JS (sin imágenes de moneda). Antes era un redirect directo a `Index.html` servido desde `index.html`; ahora `index.html` no existe como fichero — `netlify.toml` hace un rewrite de `/` a `/inicio.html`. Se eligió deliberadamente un nombre sin colisión de mayúsculas con `Index.html`: tenerlos ambos (`index.html`/`Index.html`) en el mismo directorio hacía que Netlify sirviera aleatoriamente el fichero equivocado en `/`, incluso pidiendo la ruta exacta. |
| `Index.html` | Control financiero de Ofipapel (ventas, caja, informes, asistente IA) | HTML/CSS/JS vanilla en un único fichero, sin build. Supabase como backend (URL + clave `anon` hardcodeadas, es el modelo esperado para clientes frontend). Login 100% client-side (ver seguridad conocida). |
| `canarias-ink.html` | Catálogo/e-commerce de consumibles de impresora | HTML/CSS/JS vanilla en un único fichero, sin build. Catálogo de productos embebido como array JS. |
| `falcontrol.html` | App personal de alertas de radio, sin relación de negocio con Ofipapel | HTML/CSS/JS vanilla en un único fichero, sin build. |
| `vacaciones.html` | Planificador de cuadrante de vacaciones del personal | HTML/CSS/JS vanilla en un único fichero, sin build. |
| `importacion-pedidos-proveedores.html` | Conversión de facturas PDF de proveedores a Excel 5.0/95 (BIFF5) que importa **Gestión** — herramienta terminada y en uso real. También se abre, **tal cual y sin tocarla**, en la pestaña «📄 PDF a Excel» —la primera, y en la que arranca siempre la app— de `control-pedidos.html` (un `<iframe>` a esta misma página). ~33 perfiles de proveedor calibrados contra facturas reales (un parser por proveedor; SGEL con texto rotado, `extraerLineasPDFRotado`; Júpiter por OCR, de baja confianza) y parser genérico de respaldo. **Normas del propietario**: no reescribirla, no «modernizarla» ni integrarla con otra lógica sin que lo pida; no simplificar los parsers; el precio nunca se modifica ni se inventa (solo el descuento se recalcula o colapsa para cuadrar; un descuento único de la factura se exporta tal cual); al exportar se elige plantilla: **«Luis» (por defecto)**, la oficial de Gestión con artículos desde la fila 13, intacta, o **«Rober»**, la misma de Control de Pedidos con artículos desde la fila 11 (`generarExcelRober()`, aparte; el fichero lleva `_ROBER`); cualquier cambio se avisa antes y se prueba contra una factura real. Para homologar un proveedor nuevo: factura real en PDF, texto extraído, Cantidad × Precio × (1 − Dto/100) = Importe en **todas** las líneas y suma = total de la factura; si no cuadra, decirlo en vez de forzarlo. | HTML/CSS/JS vanilla en un único fichero, sin build. pdf.js, SheetJS y Tesseract.js (OCR de respaldo) desde CDN; todo se procesa en el navegador. |
| `control-pedidos.html` | **Control de pedidos del comercial y de reposición** (2026-10-02). **Objetivo principal (palabras del propietario): comprobar que no falte ninguna referencia pedida y que no se facture ninguna que no se haya pedido** — por eso cada comparación abre con los recuadros «Faltan» / «Sobran» (`faltasYSobras()` en la lógica) y la lista de pedidos va **agrupada por campaña** (proveedor + campaña; las reposiciones, por proveedor), cada una desplegable —**minimizadas por defecto**— con su recuento, sus pedidos, su Excel de Géminis y su resumen «Faltas y sobras», imprimible, — la campaña se elige de las existentes o se crea, y `campanaCanonica()` junta las que solo cambian en mayúsculas, tildes o espacios — con «📧 **Enviar pedidos al proveedor**» (2026-10-08: PDF sin precios con un bloque por pedido —nº y cliente— hecho en el navegador con jsPDF, `pedidosParaProveedor()`; el correo sale del programa de correo del propio usuario —compras@— con el mensaje fijado por el propietario: en móvil/tableta/Windows se comparte con el PDF adjunto, y si no se puede, se descarga y se abre `mailto:`; no hay servidor de correo ni contraseñas en la app; al confirmar, cada pedido guarda `p.envio` {fecha, para, por} y la campaña muestra «📧 enviada»; el correo del proveedor se recuerda del último envío) y con el texto de **reclamación de faltas al proveedor separado por cliente** (`textoReclamacion()`; se copia o se imprime y se manda a mano); precios, formato y duplicados van detrás, como secundario. Las faltas **pendientes** (`faltasPendientes()`) son solo las aún sin decidir y las que se deciden «✉️ Reclamar al proveedor» (van al texto de reclamación y se espera respuesta; **no** van a Restos: si fue fallo del proveedor, lo añade y se revalida con su propuesta nueva; si está descatalogado, se cambia a «Descartar»). **Restos es solo para lo que el proveedor no tiene en stock** («Sin stock: dejar en restos»). Las descartadas, excluidas o en restos se tachan y dejan de contar como faltas. La pestaña «✍️ Pedido a mano» crea pedidos **siempre del comercial** (la reposición tiene **su propia pestaña «🔄 Reposición»**, simplificada a petición del propietario: un solo botón «📤 Subir nuestro pedido al proveedor», de uno en uno, que crea el pedido y lo abre; el proveedor sale del documento —la lectura con IA toma al destinatario, nunca a Ofipapel— y `proveedorCanonico()` lo ajusta al nombre que ya tenemos; el nº de pedido es opcional; la propuesta o factura del proveedor se sube dentro del pedido; cada grupo tiene su Excel de Géminis y el último control con la factura final, opcional; la pestaña «Campañas» —antes «Pedidos»— queda solo para las campañas del comercial), con «➕ Otro pedido de esta campaña» para seguir con el siguiente cliente (cada campaña tiene además «📷 Añadir pedidos por foto a esta campaña», «✍️ Añadir pedido a mano a esta campaña» y «✏️ Renombrar / Poner nombre a la campaña», que cambia el nombre en todos sus pedidos), y cada campaña imprime una **guía de facturación por cliente** (`imprimirGuiaFacturacion()`: solo lo que se factura — lo validado a precio de cliente, menos lo que no haya venido en la factura final — y sus notas de facturación; nada de restos; los sin validar se avisan y no entran). **Último control** (tarjeta 4 del pedido o «🔎 subir facturas finales» de la campaña): la factura definitiva del proveedor se compara con lo VALIDADO (`controlFactura()`), no con la propuesta, y dice qué referencias no vienen, cuáles vienen de más y qué precio neto cambia; **la factura final manda** (palabras del propietario): en cuanto está, el Excel de Géminis sale de ella tal cual, y en un pedido del comercial lo validado que no viene pasa a **Restos** del cliente como si no hubiera stock (`restosDeFactura()`, `deFactura: true`, se regenera al cambiar la factura o revalidar; en reposición nunca), y las líneas se meten casilla a casilla (`entradaRapida()`: Enter pasa de cantidad a referencia, descripción y precio, y en el precio añade la línea; la referencia del catálogo rellena descripción y precio), pensado para la tableta del comercial; cada artículo así apuntado queda en el «📝 Bloc del pedido» (`p.registro`, con hora; los borrados se tachan, no desaparecen), que desde el 2026-10-08 es una **hoja de libreta rayada** (`libreta()`: renglones, margen rojo, columnas del talonario y letra manuscrita Kalam de Google Fonts; el último renglón es donde se escribe; Enter va también por el envío del formulario por si el teclado de Android no manda la tecla). Compara lo que el comercial apunta a mano en campaña (Finocam la primera) con la propuesta Excel del proveedor, obliga a decidir cada discordancia antes de validar (en precio, **tolerancia cero**; la de 0,25 € es solo para reposición) — en un pedido del comercial la decisión fija el **precio al cliente** (listado imprimible), pero el Excel de Géminis lleva siempre el **coste que factura el proveedor** (`precioCliente` frente a `precio` en `aplicarDecisiones`); el listado del cliente va sin el descuento global de la propuesta, que es entre el proveedor y nosotros, deja en **Restos** lo que el cliente pidió y no llega (solo pedidos del comercial, nunca reposición) y lo asigna al cliente original cuando aparece en una llegada posterior (el más antiguo primero). Exporta el Excel **5.0/95** (BIFF5) para Géminis —es la **compra al proveedor**, no el pedido del cliente («📥 Excel de la compra al proveedor»; en la campaña, sin marcar ninguno sale la campaña entera): la factura final si ya está; si no, las líneas validadas, **en el orden en que factura el proveedor** (el de su propuesta, `ordenarComoPropuesta()`; lo que no venga en ella, al final)— con los artículos desde la **fila 11** (la columna UdsXCja va siempre en blanco: la cantidad es solo «Pedidas») — la cabecera (filas 1–10) está pendiente de comprobar con un fichero que Géminis haya aceptado (`PLANTILLA_GEMINIS` en la lógica). Las fotos manuscritas (y los PDF de proveedor, ver más abajo) las lee `netlify/functions/leer-pedido-manuscrito-background.js` (Claude, en segundo plano + `leer-pedido-manuscrito-estado.js`, Netlify Blobs). **El fichero entra antes por `leer-pedido-manuscrito-subir.js`**: una Background Function de Netlify rechaza con 413 cualquier cuerpo de más de ~256 KB (comprobado en producción el 2026-10-03), y una foto o un PDF pasan de eso; a la de segundo plano solo le llega el `jobId`. La tarjeta «Subir los pedidos de una campaña» es **solo para pedidos nuevos**: proveedor y campaña sin valores por defecto, obligatorios y confirmados antes de abrir la galería (antes venía FINOCAM puesto y unas fotos acabaron en un pedido existente sin querer), y nunca añade a un pedido que ya existía (`soloNuevos`; si el nº ya estaba, crea otro y avisa). Para completar un pedido se abre y se usa su «Hacer foto»; y cada foto del pedido tiene «quitar» (se va con sus líneas). Acepta todas las fotos de todos los clientes a la vez y las reparte por el nº de pedido leído en cada hoja; si una hoja no lo trae, por el cliente; y si tampoco, va sola a su propio pedido (juntar hojas «sin nada» mezclaba clientes: 61 discordancias en la prueba real del 2026-10-05). El «FACTURA Nº 1/4» del talonario es la hoja, nunca el nº de pedido. Cada pedido guarda sus fotos con la hoja leída (`p.fotos`) y la lista enseña cuántas fotos tiene y, si las hojas vienen numeradas, **qué hoja falta** (`hojasDelPedido()`), por si alguna foto se quedó sin subir. La cabecera de cada campaña suma las fotos subidas y las hojas que faltan. Las fotos que no se pudieron leer quedan en un aviso con su nombre y «🔁 Volver a intentar» (`fotosFallidas`, solo en memoria). Si el navegador no decodifica una foto («The source image could not be decoded», visto en Android), se prueba con `<img>` y, si es un JPEG < 3 MB, se manda sin reducir. Las propuestas o facturas se suben **desde cada campaña** («📄 Cargar propuestas del proveedor de esta campaña»; ya no hay botón general en la pantalla principal) y solo se emparejan con los pedidos de esa campaña (varias a la vez, PDF, Excel o foto — la casilla no lleva `accept`: con él Android no dejaba marcar varios PDF/.xlsm) se asignan por nº de pedido o, si no casa, por el cliente de Observaciones / «su pedido» (`pedidoCliente` en la lectura con IA); si tampoco, **por contenido**: las referencias que coinciden con los pedidos sin propuesta (`repartirPorContenido()`, sin repetir pedido, a partir de la mitad de referencias en común — las de Miquelrius traen su propio nº «MR23636» y ningún cliente reconocible); cada carga acaba con un **sumatorio** (líneas e importe por documento y total); las que aun así no casan se preguntan con el pedido más parecido ya elegido y «Asignar todas las elegidas» y cada referencia se contrasta con el catálogo del proveedor, que se guarda al cargar su propuesta. | HTML/CSS/JS vanilla, sin build, **pensada también para Android**: por debajo de 700px las tablas pasan a tarjetas (`ponerEtiquetas()` copia el título de cada columna a sus celdas), salvo la lista de pedidos de cada campaña, que va compacta en dos líneas por pedido (`filaMovil()`: nº y cliente; debajo fecha, líneas, fotos y estado), botón de cámara directa, e instalable como app (`manifest-pedidos.json` + el `sw.js` común, que sirve el HTML siempre desde la red). Las pestañas van siempre en una sola línea (si no caben, se desliza la barra, no la página). Cuidado con cualquier texto largo sin espacios: si ensancha la página, Chrome en Android la aleja entera. La lógica vive en `control-pedidos-logica.js` para poder probarla (se carga con `?v=` en la URL: **cambia esa versión cada vez que se toque la lógica**, porque un móvil cargó el HTML nuevo con la lógica vieja y la app se quedó trabada en la primera pestaña el 2026-10-07; desde entonces un fallo así sale en un aviso rojo y no bloquea las pestañas): `node --test scripts/probar-control-pedidos.js`. **Datos compartidos en la nube** (2026-10-07): Supabase, proyecto **«App Bancos»** (el de `Index.html`), en tablas propias `cp_docs` (un documento por pedido, resto, nota, catálogo e historial de proveedor, con versión) y `cp_miembros` (quién entra: admin, luis, rober y miguel `@ofipapel.internal`; Mónica tiene cuenta en el proyecto pero no aquí). Se escribe solo con la función `cp_guardar_lote` (comprueba la versión: si otro cambió el mismo documento antes, no se pisa — manda la nube y lo nuestro queda apartado en «Datos»); sin cuenta de `cp_miembros` todo devuelve 401/vacío (comprobado). Cada dispositivo trabaja sobre su copia en `localStorage` y sincroniza cada 20 s, al volver a la pestaña y al recuperar la red (`firma`/`cambiosPendientes`/`integrarBajada`/`integrarSubida` en la lógica, con pruebas); sin cobertura se sigue trabajando y se sube al volver (la página tiene que estar ya abierta: `sw.js` no guarda el HTML). La sesión se guarda con su propia clave (`ofipapel-control-pedidos-auth`) para **no** compartirla con `Index.html`, que está en el mismo sitio y usa el mismo proyecto. No se repinta mientras se escribe en una casilla. El Bloc apunta quién metió cada línea. Hay papelera por pedido en la lista y «Borrar la campaña» (doble confirmación); borrar llega a todos los dispositivos. Fuera de `*.netlify.app` (p. ej. la copia de GitHub Pages) no hay funciones: la app se pasa sola a `ofipapel.netlify.app` en cuanto no queda nada sin subir a la nube (si queda algo, avisa arriba con un botón) y no intenta leer fotos ni PDF (antes daba «405»). Sustituye al prototipo Python local (`ofipapel-pedidos/`, nunca subido al repo). **Reposición** (2026-10-03, mismo fichero, tipo de pedido aparte): nuestro pedido al proveedor ↔ su propuesta/albarán/factura, comparando el **precio neto tras todos los descuentos** (0,25 € informativo), cambios de cantidad, uds/caja, unidad y posibles sustituciones (mismo EAN o descripción); sus faltas **nunca** van a Restos, pero se pueden «✉️ Reclamar al proveedor» igual que en el comercial (entran en el texto de reclamación del grupo y siguen contando como pendientes hasta que se descartan); al validar guarda el neto aceptado por proveedor y referencia (`historial`) y lo usa cuando el pedido no trae precio. Al Excel de Géminis va un único descuento equivalente por línea sin tocar el precio base, cuadrado con el importe del proveedor (decimales configurables; avisa si no cuadra al céntimo). Entra en **PDF, Excel o foto** (o pegando líneas). **Nuestro pedido de Géminis** («Propuesta de Pedido», el que mandamos al proveedor) se lee **sin IA**, del texto del PDF con pdf.js (`leerPedidoGeminis()`, 2026-10-08): la IA confundía las columnas de números seguidas; la cantidad es siempre «Unidades» (no cajas × Udes. x Caja: un 0 × 60 puede ser 12), la referencia «Rfc.Compra» (la del proveedor; «Cod.Venta» es la nuestra) y el EAN «Cod. Barras». El resto de PDF y las fotos los lee Claude con la misma función que los manuscritos (`modo: 'documento'`, cualquier proveedor, sin lector propio por proveedor) y `lineasDeDocumento()` no se fía de lo leído — marca como dudosa (en ámbar, con «✓ Está bien» para quitar la duda sin borrar la línea; la ✕ borra la línea entera) la línea cuyo importe no sale de precio × cantidad − descuentos y compara la suma de líneas con la base imponible del documento («No cuadra» en rojo). Lo mismo para la propuesta del comercial y para el albarán de «Registrar llegada». |
| `fichaje.html` | Registro horario del personal (fichajes, exportación mensual, login de gerencia) | HTML/CSS/JS vanilla en un único fichero, sin build. Backend Firebase (ver comentario `SECRETS_SCAN_OMIT_PATHS` en `netlify.toml`). Ya tiene icono propio en el hub de `inicio.html` (nodo blanco/plata, "Fichajes"). |
| `app.html` | Panel de redes sociales de Ofipapel: Almacén (centro de trabajo creativo — crea campañas y el Marketing Engine las produce) y Calendario (solo programa en el tiempo lo que el Almacén ya aprobó) | HTML/CSS/JS vanilla en un único fichero, sin build. Estado compartido en memoria (`CampaignStore`, sin persistencia — se pierde al recargar). Crea campañas vía `netlify/functions/marketing-engine-run.js`; nunca implementa lógica creativa propia, ver `marketing-engine/INTEGRATION.md`. |
| `privacidad.html`, `404.html` | Política de privacidad (review de WhatsApp Cloud API) y página 404 propia | HTML estático |
| `joe-app/` | App personal: agenda, turnos de hospital, música, seguimiento de "Limón", tareas de empresa, "Coisinhas" | React 19 + Vite + TypeScript + Tailwind 4 + Supabase con RLS real y **cuenta real** (no sesión anónima): cada dispositivo se conecta una vez con correo y contraseña (`components/ConectarCuenta.tsx`), y la sesión queda guardada. El PIN + biometría WebAuthn opcional (`PinScreen.tsx`) sigue bloqueando la pantalla en el día a día, sin distinguir personas — son dos cosas distintas: el PIN bloquea la pantalla, la cuenta da acceso a los datos. |
| `alquileres/` | Gestión de alquileres vacacionales: reservas, precios, reparaciones, cobros, analítica | React 19 + Vite + TypeScript + Tailwind 4 + Recharts. Backend **Firebase Firestore** (`contexts/DataContext.tsx`, tiempo real vía `onSnapshot`) con login por persona (`LoginScreen.tsx`, Luis/Rober) y migración automática de datos antiguos de `localStorage` (`MigrateLocalData.tsx`). Los cobros de **todos los años (2022–2026)** salen del Excel de Luis (`RESERVAS`, una hoja por mes con los pagos y su fecha a la derecha) y llevan **mes contable** (`Payment.mes`, `AAAA-MM`) además de la fecha real: el alquiler de enero del 106 se pagó el 31 de diciembre y en el Excel cuenta en enero, así que Cobros agrupa por `mes` y solo cae en `paymentDate` cuando no lo hay. Los cobros del Excel van por apartamento (`Payment.apartmentId`) y pueden no tener estancia detrás. El **nº de asiento lleva la fecha dentro**, en `ddmmaa` por delante (`0704262B` = 07/04/26, `210926105` = 21/09/26): comprobado en 230 de 264 cobros que traen las dos cosas, y sirve para recuperar la fecha de los que vienen sin ella —solo cuando la deducida cae en el mes del cobro o pegada a él, porque algún asiento está mal tecleado. **Los gastos NO están en ese Excel** (solo la hoja «RESUMEN COBROS Y GASTOS», que es de 2025, y «REPARACIONES»): entran aparte por la pantalla de subida. **El Excel no se versiona: el repo es público y lleva nombres e importes** (`.gitignore` bloquea `*.xlsx`). `@supabase/supabase-js` sigue como dependencia en `package.json` pero ya no se usa en ningún fichero — dependencia muerta, ver `.claude/rax/DEUDA_TECNICA.md` DT-10. |
| `netlify/functions/` | Bot de WhatsApp con IA + proxy del Asistente IA de `Index.html` | Netlify Functions. `whatsapp-webhook.js` (Meta Cloud API, único canal — la alternativa por Twilio se eliminó) usa `whatsapp-agent-core.js` (matching de FAQ + llamada a Claude) y `whatsapp-agent-config.js` (datos del negocio). `whatsapp-consumibles.js` responde "qué cartucho lleva mi impresora" a partir de un índice propio (`data/consumibles-impresora.json`, generado con `scripts/generar-consumibles.py` desde el Excel del distribuidor en `scripts/datos/`) — va empaquetado con la función, no se consulta por red, y de él sale la referencia comercial con la que luego se busca precio en el catálogo — escrita como la escribe la web (`TN-248`, no `TN248`) gracias a `data/referencias-catalogo.json`, que genera `scripts/emparejar-catalogo.py` descargando el catálogo entero una vez; ese fichero es opcional y sin él se busca por la referencia del proveedor. `whatsapp-notas.js` es cómo se le enseñan HECHOS al bot ("las cajas registradoras de siempre ya no son legales", "el papel A4 normal es el Mattio de la oferta"): texto libre que se escribe desde el panel (Aprendizaje del bot) sin desplegar nada, viaja en el prompt y manda sobre lo que la IA crea saber. Lo importante es la otra mitad: una nota **aparta la respuesta fija de FAQ** cuando el mensaje toca su tema — si no, la respuesta de siempre contesta y corta el turno, y la IA ni llega a leer la nota. Eso vale también para lo que el equipo apunta en la ficha de un cliente concreto (`notaDeFicha`). Es el ÚNICO mecanismo de aprendizaje: el anterior ("búsquedas sin resultado", que apuntaba la frase del cliente cada vez que el catálogo volvía vacío) se quitó el 23/9/2026 porque lo que salía en la lista eran trozos de frase inconexos que no se parecían a la pregunta. De los ALIAS (`alias_busqueda`) solo queda aplicar y quitar los que ya había; los nuevos van en `FRASES_ALIAS` (woocommerce-client.js) o en una nota. Ver `WHATSAPP_SETUP.md`. `chat-assistant.js` es un proxy aparte para el chat de `Index.html`: la API key de Anthropic vive solo aquí, nunca en el navegador. `marketing-engine-run.js` conecta `app.html` con el Motor de Marketing/Creative Lab — solo válida con el proveedor `simulated` (termina dentro del límite síncrono de Netlify, ~26s). Con el proveedor real (`openai-images`) usar en su lugar `marketing-engine-run-background.js` (Background Function, hasta 15 min, sin ese límite) + `marketing-engine-status.js` (consulta el resultado por `trackingId` vía Netlify Blobs) — DT-17, `.claude/rax/DEUDA_TECNICA.md`. `app.html` todavía llama al endpoint síncrono antiguo, pendiente de migrar al patrón background+polling. |
| `design-studio/` | Estudio de diseño autónomo de RAX: banners, posts, flyers, edición de imagen | Ver `design-studio/README.md` — brand kit real por app (verificado contra el CSS de cada una), script de render HTML→PNG/PDF (`render-html.js`, probado), integración con Adobe Firefly API (`firefly-generate.js`, código completo, sin probar — pendiente de credenciales). No se ejecuta como parte de ningún build; es una herramienta que se invoca a demanda. |
| `marketing-engine/` | Motor de Marketing con IA: pipeline de 8 agentes que convierte un brief de producto en una publicación lista — el "cerebro" creativo que consume `app.html` (Almacén) vía `netlify/functions/marketing-engine-run.js`, que a su vez delega la generación real en `creative-engine/creative-lab/` (ver esa fila). Antes del primer agente y al terminar, `marketing-engine/intelligence/` (Product Intelligence, Campaign Recommender, Creative Score, Variant Engine, Learning Engine) analiza, recomienda y puntúa cada campaña en modo *shadow* — nunca cambia una decisión real del pipeline de 8 agentes hasta que se demuestre mejor, ver `intelligence/README.md` y `ROADMAP_V2.md`. `marketing-engine/core/providers/` queda legado (sin proveedor real activo) — el proveedor real vive en `creative-engine/provider-manager/`, ver esa fila | Node.js (CommonJS) puro, sin dependencias npm. Ver `marketing-engine/ARCHITECTURE.md` (diseño interno) e `INTEGRATION.md` (cómo se conecta con la app). |
| `creative-engine/` | Motor de generación de contenido — "El Marketing Engine piensa, el Creative Engine crea". Completamente independiente de `marketing-engine/` (contrato propio `CreativeBrief`, sin `require()` cruzado): Provider Manager, Asset Pipeline, Prompt Composer (modular), Variant Generator, Creative Validator, Creative Assets, ver `creative-engine/ARCHITECTURE.md`. Desde 2026-07-26, `creative-lab/` — "El Marketing Engine piensa, el Creative Engine crea, el Creative Lab perfecciona": 9 bibliotecas atómicas + Biblioteca de Referencias, Art Direction Engine (18 patrones editoriales agrupados en las 4 familias oficiales de Ofipapel — Lifestyle, Premium Editorial, Comercial, Problema → Solución, ver `design-studio/OFIPAPEL_VISUAL_DNA.md` cap. 12), Layout Intelligence, Design Director, Component Library — 8-12 conceptos por campaña puntuados en dos capas con umbral de calidad y reintento acotado, ver `creative-engine/creative-lab/ARCHITECTURE.md`. Desde el sprint "Cierre de arquitectura" (2026-08-01, `.claude/rax/DEUDA_TECNICA.md` DT-15), `netlify/functions/marketing-engine-run.js` usa este pipeline (`creative-lab/`) y no el más simple de `creative-engine/index.js` — es el que sirve `app.html` en producción | Node.js (CommonJS) puro, sin dependencias npm. Proveedor real conectado: `openai-images` (activo si hay `OPENAI_API_KEY`; si no, cae a `simulated`), ver `creative-engine/FIRST_REAL_GENERATION.md` y `provider-manager/README.md`. |

Los HTML monolíticos (`inicio.html`, `Index.html`, `canarias-ink.html`,
`falcontrol.html`, `vacaciones.html`, `importacion-pedidos-proveedores.html`,
`fichaje.html`, `app.html`, `control-pedidos.html`) no tienen proceso de build: se sirven tal cual.
Cualquier cambio se hace editando el fichero directamente (CSS y JS están
embebidos inline).

## Comandos

### `joe-app/` y `alquileres/` (idénticos entre sí)
```bash
npm ci             # instalar dependencias
npm run dev        # servidor de desarrollo (Vite)
npm run lint       # ESLint
npm run build      # tsc -b && vite build → genera dist/
npm run preview    # sirve el build de producción localmente
```

### Build completo (como en producción)
```bash
bash build.sh   # compila alquileres y joe-app, y ensambla todo en _site/
```

## Despliegue

- **Netlify** (`netlify.toml`) es la fuente de verdad: ejecuta `build.sh`,
  publica `_site/` y sirve las funciones serverless de `netlify/functions/`.
  Rutas: `/alquileres/*` → `alquileres/dist`, `/joe/*` → `joe-app/dist`,
  el resto son los HTML estáticos de la raíz. **`/joe/` solo se publica en el
  sitio que tenga `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`** (hoy solo
  `joesworld`): Vite mete esas variables dentro del bundle en tiempo de build
  y sin ellas compila igual, dejando una app que se abre y no conecta con
  nada. Donde faltan, `/joe/` da 404 a propósito — un 404 se ve, una app sin
  backend parece que funciona. Comprobable con `scripts/comprobar-copias.sh`.
- **OJO: hay VARIOS sitios de Netlify sirviendo este mismo repositorio**, con
  variables de entorno distintas cada uno. Los dos que importan:

  | Sitio | Qué sirve | Variables que solo están ahí |
  |---|---|---|
  | `spontaneous-lebkuchen-60fa41` | **El bot de WhatsApp y su panel.** Es a donde apunta el webhook de Meta | `WHATSAPP_*`, `UPSTASH_*`, `CUSTOMER_TEMPLATE*` |
  | `ofipapel` | Las apps estáticas y el resto de funciones | `OPENAI_API_KEY`, `SUPABASE_*`, `CHAT_ASSISTANT_TOKEN`, `VACACIONES_*` |

  El nombre del primero es el aleatorio que le puso Netlify al crearlo y no se
  ha cambiado nunca, así que **no se parece en nada a lo que hace**. El 17/9/2026
  eso costó una mañana de diagnóstico con el bot caído, y estuvo a punto de
  costar más: se llegó a proponer mover el webhook de Meta a `ofipapel`, que
  no tiene ninguna variable de WhatsApp y habría dejado el bot mudo del todo.

  Antes de tocar nada de despliegue, **mira en qué sitio estás**: el panel lo
  dice abajo del todo (`pieDeSitio` en `conversations.js`, sale de `SITE_NAME`),
  junto al commit desplegado — que además avisa si un sitio se ha quedado atrás.

  Consolidarlos en uno es lo deseable, pero mover las credenciales de WhatsApp
  de sitio implica reconfigurar el webhook en Meta: mientras no se haga, lo
  importante es no confundirlos.
- **GitHub Pages** (`.github/workflows/pages.yml`) es el respaldo: ejecuta
  `bash build.sh` (el mismo script que Netlify, sin duplicar la lista de
  ficheros a mano) y publica `_site/`, así que genera exactamente el mismo
  resultado en ambas plataformas.
- **CI** (`.github/workflows/ci.yml`) corre `lint` + `build` (incluye
  `tsc -b`) para `joe-app` y `alquileres` en cada PR y push a `main`. Los
  HTML monolíticos no tienen build ni lint automatizado.
- `.github/dependabot.yml` abre PRs semanales de actualización de
  dependencias npm para ambas apps y de GitHub Actions.

## Variables de entorno / secretos

Configurados en Netlify (Site settings → Environment variables), **no** en
el repo:
- `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_APP_SECRET` — Meta Cloud API (ver `WHATSAPP_SETUP.md`).
- `ANTHROPIC_API_KEY` — usada tanto por el bot de WhatsApp como por
  `netlify/functions/chat-assistant.js` (proxy del chat de `Index.html`).
- `CHAT_ASSISTANT_TOKEN` — token compartido para el proxy del chat; debe
  coincidir con `APP_CHAT_TOKEN` en `Index.html`. No es un secreto real
  (`Index.html` es HTML estático, visible con "ver código fuente"), solo
  evita dejar el endpoint completamente abierto.
- `WOOCOMMERCE_CONSUMER_KEY` / `WOOCOMMERCE_CONSUMER_SECRET` — claves de la
  API REST de WooCommerce (`ofipapel.net`, WordPress + WooCommerce), usadas
  por `netlify/functions/woocommerce-client.js` desde el bot de WhatsApp
  para consultar productos/precios/stock reales antes de responder, y para
  el flujo de "estado de mi pedido" (número de pedido + verificación por
  teléfono, o por nombre comercial/nombre y apellidos si el teléfono no
  coincide con el del pedido). Sin ellas, el bot nunca confirma ni descarta
  productos concretos y "estado de mi pedido" da solo el contacto de
  siempre (cae al comportamiento anterior).
- `WOOCOMMERCE_BYPASS_TOKEN` (opcional) — valor secreto que el bot manda en la
  cabecera `X-Ofipapel-Bot` para que la protección anti-bots del hosting de
  ofipapel.net lo reconozca. Esa protección va **delante** de WordPress, así
  que corta la petición antes de que WooCommerce mire las claves: tener claves
  válidas no basta. Procedimiento completo (incluidas las instrucciones para
  quien administra la web) en `WHATSAPP_SETUP.md`, "Cuando ofipapel.net nos
  bloquea".
- `OPENAI_API_KEY` — activa el proveedor real `openai-images` de
  `creative-engine/creative-lab/` desde
  `netlify/functions/marketing-engine-run.js` (marcarla como secreto en
  Netlify). Sin ella, el sistema sigue funcionando con el proveedor
  `simulated`, sin ningún cambio de código. Ver
  `creative-engine/FIRST_REAL_GENERATION.md` y `.claude/rax/DEUDA_TECNICA.md`
  DT-15.
- `joe-app` usa `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` vía
  `.env.local` (no versionado) en desarrollo, inyectadas por Netlify en
  producción. Ya **no** usa sesión anónima: cada dispositivo se conecta una
  sola vez con una cuenta real de Supabase Auth (`ConectarCuenta.tsx`), y
  supabase-js guarda y renueva esa sesión. Hace falta crear esa cuenta a
  mano en Supabase (Authentication → Users → Add user), porque el registro
  público está cerrado.
- `alquileres` usa credenciales de Firebase (ver `alquileres/src/lib/firebase.ts`)
  para Firestore, Firebase Authentication y Firebase Storage. Requiere activar el
  proveedor "Anonymous" en Firebase Console → Authentication → Sign-in method y
  desplegar `alquileres/firestore.rules` para que las reglas de acceso
  estén realmente activas. Los justificantes de cobro **no** usan Firebase
  Storage: Google lo sacó del plan gratuito y al activarlo pide tarjeta. Se
  guardan en Firestore, troceados en documentos de la colección
  `justificantes` (`alquileres/src/lib/justificantes.ts`), así que no hay nada
  que activar ni reglas nuevas que desplegar — los trozos van en la misma
  colección de primer nivel a propósito, porque `firestore.rules` no cubre
  subcolecciones.
- `FIREFLY_CLIENT_ID` / `FIREFLY_CLIENT_SECRET` (opcionales, no configuradas
  todavía) — credenciales OAuth Server-to-Server de Adobe Developer Console
  para `design-studio/scripts/firefly-generate.js`. Ver `design-studio/README.md`.

Los HTML monolíticos llevan la URL y la clave `publishable`/`anon` de
Supabase **hardcodeadas en el propio fichero** (modelo esperado en Supabase
para clientes puramente frontend, protegido por RLS — no es una key
secreta, pero conviene verificar periódicamente que las políticas RLS son
correctas; la de `Index.html` sigue sin verificar, ver seguridad conocida).

## Seguridad conocida

> **Estado real, comprobado en vivo (2026-08-19)**: los datos de Finanzas,
> Alquileres, Vacaciones y Fichaje son accesibles **sin ninguna contraseña**
> — en Finanzas incluso con escritura. El login de las apps no protege los
> datos: se llega a la base de datos sin pasar por él. Ver el informe completo
> en `.claude/rax/AUDITORIA_SEGURIDAD_2026-08.md` y `DEUDA_TECNICA.md` DT-23.
> Es el punto abierto más grave del proyecto; el resto de esta sección son
> problemas menores en comparación.


- `Index.html`: login 100% client-side (hash SHA-256 sin salt, contraseña
  por defecto compartida entre los 4 usuarios) y estado de RLS de Supabase
  sin verificar. Abierto, requiere decisión del propietario
  (`.claude/rax/DEUDA_TECNICA.md` DT-09).
- `alquileres`: `LoginScreen.tsx` comparte **el mismo hash de contraseña
  por defecto** que `Index.html` entre sus dos usuarios (Luis/Rober) — no
  es casualidad, es el mismo valor. Mismo tipo de riesgo, mismo origen
  (DT-11).
- `joe-app`: **ya resuelto (2026-09-08), y esta vez verificado**. Estuvo
  mal dado por cerrado antes: decía "sesión anónima de Supabase Auth + RLS
  real", y las políticas RLS sí eran correctas — pero la sesión anónima la
  abre cualquiera con la clave pública del bundle, así que `authenticated`
  no exigía nada y las 7 tablas se leían enteras. Ahora cada dispositivo se
  conecta una vez con una cuenta real (`ConectarCuenta.tsx`), y el acceso
  anónimo y el registro público están desactivados. Comprobado con
  peticiones reales: alta anónima → `422 anonymous_provider_disabled`, y
  las tablas → 401 sin credencial. Detalle en
  `.claude/rax/DEUDA_TECNICA.md` DT-33.
- Proyecto Supabase «App Bancos»: desde el 2026-10-07 las tablas de Finanzas (`registros`, `app_sync`) solo las leen y escriben las cuentas de `fin_miembros` (admin, luis, rober, monica) — política **restrictiva** `finanzas_solo_sus_cuentas` añadida encima de las de siempre (que dejaban a cualquier cuenta del proyecto). Hacía falta porque Control de Pedidos usa el mismo proyecto y trae cuentas que no son de Finanzas (miguel). Comprobado con cada cuenta: las 4 ven lo mismo que antes, miguel 0 filas y no puede modificar; sin cuenta, 401. **Una cuenta nueva de Finanzas hay que añadirla a `fin_miembros`** (y una de Pedidos, a `cp_miembros`).
- El Asistente IA de `Index.html`: ya resuelto — proxy server-side, la API
  key de Anthropic ya no vive en el navegador.
- Dos canales de WhatsApp en paralelo (Meta y Twilio): ya resuelto — se
  eliminó Twilio, Meta Cloud API es el único canal.

## Estudio de diseño (RAX)

`design-studio/README.md` documenta cómo crear banners, posts, flyers y
gráficos para Ofipapel de forma autónoma: qué herramienta usar según la
tarea, el brand kit real de cada app (colores/tipografía verificados contra
el CSS real, no inventados), el script de render HTML→PNG/PDF standalone, y
la integración (preparada, pendiente de credenciales) con Adobe Firefly
API. Consultar ese documento antes de abordar cualquier encargo visual.

## Skills de RAX

`.claude/skills/` — sistema modular de Skills de Claude Code para este
repo. Cada Skill es una carpeta autocontenida con su propio `SKILL.md`;
añadir una Skill nueva nunca requiere modificar una existente. Catálogo y
convenciones en `.claude/skills/README.md`.

`.claude/rax/` es el "cerebro" persistente del ecosistema (inventario,
roadmaps, deuda técnica, decisiones, historial de sesiones) — independiente
de cualquier Skill concreta, para que todas puedan leerlo sin acoplarse
entre sí. La Skill `project-manager` es responsable de mantenerlo al día;
al empezar una sesión de trabajo real sobre este repo, actívala primero
para tener contexto antes de tocar código.

## Convenciones

- **Ramas, PRs y ciclo de vida de las ramas**: ver `CONTRIBUTING.md` —
  comprobar ramas activas antes de crear una nueva, proceso de
  reconciliación, y criterio para cerrar o eliminar ramas. No lo dupliques
  aquí.
- Nombres de commit descriptivos, en español, estilo `fix:`/`feat:` cuando aplica.
- **Fusión de PRs de Control de Pedidos** (autorización permanente del
  propietario, 2026-10-03): Claude fusiona él mismo sus PRs de
  `control-pedidos.html` y sus piezas (`control-pedidos-logica.js`,
  `manifest-pedidos.json`, `netlify/functions/leer-pedido-manuscrito-*.js`,
  `scripts/probar-control-pedidos.js` y su documentación) **solo cuando pasan
  todas las pruebas** (`node --test scripts/probar-control-pedidos.js` y los
  recorridos en navegador) y la previsualización de Netlify está lista, y
  después comprueba que `ofipapel.netlify.app/control-pedidos.html` sirve la
  versión nueva. Cualquier PR que toque otras apps del repo lo sigue
  fusionando el propietario.
- Casi no hay tests automatizados (CI cubre lint + build). La excepción es
  `scripts/probar-control-pedidos.js` (`node --test`), que no corre en CI.
- `joe-app` y `alquileres` comparten patrón de ESLint flat config
  (`eslint.config.js`) con `typescript-eslint` + `eslint-plugin-react-hooks`.
  `alquileres` tiene `react-hooks/set-state-in-effect` degradado a warning
  (deuda conocida, con TODO en el propio fichero) por varios efectos
  preexistentes en `Reservations.tsx` y `MigrateLocalData.tsx`.
- Antes de crear un documento, Skill o carpeta nueva, comprueba en
  `.claude/skills/README.md` y `.claude/rax/INVENTORY.md` que no exista ya
  algo equivalente. Máximo impacto · mínimo riesgo · cero duplicidades.
