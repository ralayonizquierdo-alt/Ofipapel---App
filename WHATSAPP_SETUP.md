# Agente de WhatsApp de Ofipapel — puesta en marcha

Este agente contesta automáticamente los mensajes de WhatsApp del negocio:
primero intenta responder con reglas rápidas (horario, dirección, teléfono...)
y, si no reconoce la pregunta, responde con IA (Claude) usando la información
del negocio y el catálogo real de ofipapel.net como contexto.

Vive como una función serverless de Netlify en
`netlify/functions/whatsapp-webhook.js`, así que se despliega junto con el
resto del sitio sin necesidad de un servidor aparte.

> **¿Vienes a cambiar el número de prueba por el definitivo?**
> Ve directo a [Migración al número definitivo](#migración-al-número-definitivo).
> Ese apartado tiene el orden exacto de los pasos: hacerlos en otro orden hace
> que Meta rechace el alta del número.

## 1. Datos del negocio

Los datos de las tiendas (dirección, teléfono y horario) ya están cargados en
`netlify/functions/whatsapp-agent-config.js`. Puedes añadir más preguntas
frecuentes en el array `FAQ_RULES` si lo necesitas.

Ningún número de teléfono del bot está escrito a mano en el código: el número
desde el que contesta lo determina `WHATSAPP_PHONE_NUMBER_ID`, y los teléfonos
que el bot da a los clientes salen siempre de `STORES`. Por eso cambiar de
número no obliga a tocar el código.

## 2. Crear la app de WhatsApp Cloud API en Meta

1. Ve a [developers.facebook.com](https://developers.facebook.com/) y crea una
   app de tipo "Business".
2. Añade el producto **WhatsApp** a la app.
3. En la sección de WhatsApp > "API Setup" obtendrás:
   - Un **número de prueba** (o tu número real si ya has verificado uno).
   - El **Phone Number ID** (guárdalo, es `WHATSAPP_PHONE_NUMBER_ID`).
   - Un **token de acceso temporal** (24h) para probar. Para producción,
     genera un token permanente creando un **System User** en Meta Business
     Suite con permiso `whatsapp_business_messaging` (será `WHATSAPP_TOKEN`).
4. En "App settings > Basic" copia el **App Secret** (será
   `WHATSAPP_APP_SECRET`, opcional pero recomendado para verificar que las
   peticiones vienen realmente de Meta).

## 3. Configurar las variables de entorno en Netlify

En Netlify: **Site settings > Environment variables**, añade:

| Variable | Valor |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | Una cadena que inventes tú (ej. `ofipapel-verify-2026`) |
| `WHATSAPP_TOKEN` | El access token de la app de Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | El Phone Number ID de Meta |
| `WHATSAPP_APP_SECRET` | El App Secret de Meta (opcional) |
| `ANTHROPIC_API_KEY` | Tu API key de Claude (console.anthropic.com) |

Hay más variables opcionales (avisos por email, panel de conversaciones,
catálogo de WooCommerce). Están todas documentadas en la cabecera de
`netlify/functions/whatsapp-webhook.js`, que es la lista de verdad.

**Importante:** cambiar una variable de entorno en Netlify NO afecta a las
funciones ya desplegadas. Después de tocar cualquiera hay que lanzar un
**deploy nuevo** (Deploys > Trigger deploy) para que la función la recoja.

Despliega el sitio para que la función quede publicada en
`https://<tu-dominio>/.netlify/functions/whatsapp-webhook`.

## 4. Configurar el webhook en Meta

1. En la app de Meta, WhatsApp > Configuration > Webhook, pulsa "Edit".
2. **Callback URL**: `https://<tu-dominio-netlify>/.netlify/functions/whatsapp-webhook`
3. **Verify token**: el mismo valor que pusiste en `WHATSAPP_VERIFY_TOKEN`.
4. Guarda — Meta hará una petición GET de verificación; si todo está bien
   configurado, aceptará el webhook.
5. Suscríbete al campo `messages` (webhook fields).

## 5. Probar

Escribe un WhatsApp al número configurado. Deberías recibir una respuesta
automática en segundos. Revisa los logs de la función en Netlify (Functions >
whatsapp-webhook) si algo falla.

---

# Migración al número definitivo

Pasar del número de prueba de Meta al número real del negocio. El webhook, el
App Secret y el token **no cambian** mientras se use la misma app de Meta: lo
único que cambia de verdad es `WHATSAPP_PHONE_NUMBER_ID`.

## Antes de empezar: lo irreversible

Un número de teléfono **no puede estar a la vez** en la app de WhatsApp (o
WhatsApp Business) del móvil y en la API de Cloud. Para darlo de alta en Meta
hay que **eliminar su cuenta desde la app**, y eso **borra el historial de
chats de ese número**. No hay forma de deshacerlo.

Desinstalar la app NO vale: hay que eliminar la cuenta desde dentro
(Ajustes > Cuenta > Eliminar mi cuenta). Si solo se desinstala, Meta sigue
viendo el número como ocupado y el alta falla.

Si en ese número hay conversaciones que importan, haz copia antes
(Ajustes > Chats > Copia de seguridad) o replantea usar otra línea.

## Fase 0 — Preparación (se puede hacer con calma, días antes)

Esta fase no toca el número que está funcionando. Hazla primero porque la
verificación del negocio la revisa Meta a mano y puede tardar.

1. **Verificación del negocio** en Meta Business Suite. Sin ella el número
   queda limitado y el nombre visible no se aprueba. Es el paso más largo
   (días) y el que más se atasca, así que va el primero — ver
   [Paso a paso de la verificación](#paso-a-paso-de-la-verificación-del-negocio).
2. **Método de pago** en WhatsApp Manager. Meta lo exige para operar en
   producción aunque no se llegue a pagar nada (ver "Qué cuesta esto" abajo).
3. **Token permanente**: comprueba que `WHATSAPP_TOKEN` es de un *System User*
   y no el token temporal de 24h de "API Setup". Si fuera el temporal, el bot
   ya se habría caído solo, pero conviene confirmarlo antes de ir a real.
4. **Nombre visible** que verán los clientes (p. ej. `Ofipapel`). Lo revisa
   Meta y debe corresponderse con el negocio.
5. **Política de privacidad** publicada: ya está en `privacidad.html`.
6. **Campos de la app** en Meta for Developers > Configuración de la app >
   Básica. Los cuatro que hay que dejar bien (venían vacíos o apuntando a
   `facebook.com`, que no vale):

   | Campo | Valor |
   |---|---|
   | Categoría | `Negocios y páginas` |
   | URL de Condiciones del servicio | `https://ofipapel.net/terminos-y-condiciones/` |
   | URL de la política de privacidad | `https://ralayonizquierdo-alt.github.io/Ofipapel---App/privacidad.html` |
   | Eliminación de datos de usuario | la misma, más `#eliminacion-de-datos` |

   **Ojo con el dominio de Netlify:** el validador de Meta rechaza
   `https://ofipapel.netlify.app/...` con "Privacy policy URL should
   represent a valid URL", aunque la página responda 200 y sea HTML válido
   (comprobado desde fuera). No es un espacio ni un error al pegar: no traga
   el dominio de primer nivel `.app`. Por eso esos dos campos apuntan a
   GitHub Pages, que sirve exactamente la misma página y sí acepta. Curioso:
   el campo de eliminación de datos sí admitía `.app`; el de privacidad no.

### Paso a paso de la verificación del negocio

El motivo nº 1 de rechazo no es la documentación: es que **el dato tecleado no
coincide letra por letra con el documento**. Por eso conviene reunir los datos
antes de abrir el formulario.

**A. Comprobar de dónde cuelga la app (5 minutos, hacer esto primero)**

La verificación no se hace en la app de desarrollador, sino en el *portfolio*
de negocio del que cuelga. Si la app se creó a título personal y no está
enlazada a ningún portfolio, no hay nada que verificar todavía.

1. Entra en [developers.facebook.com](https://developers.facebook.com/) > Mis
   apps > la app de WhatsApp de Ofipapel.
2. **Configuración de la app > Básica**, y mira el campo de la cuenta o
   portfolio de empresa asociado.
3. Si está vacío, enlázala a un portfolio de empresa antes de seguir.
4. Confirma que entras como **administrador** de ese portfolio (no como
   "empleado": un empleado no ve la opción de verificar).

**B. Reunir los datos exactos**

Tienen que coincidir con el Registro Mercantil, no con el uso comercial:

- **Razón social** literal, con su puntuación (`OFIPAPEL, S.L.`), no el nombre
  comercial.
- **Domicilio social** el que consta en el registro — que puede no ser el de
  la tienda. Es el error más habitual.
- **Teléfono** en formato internacional (`+34 ...`). No tiene por qué ser el
  número que va a llevar el bot.
- **Web** (`ofipapel.net`) y un correo del propio dominio.

**C. Reunir la documentación**

Meta enseña la lista concreta que acepta para España dentro del propio
formulario — ésa es la que manda. En la práctica valen:

- Certificado o nota simple del **Registro Mercantil** (mejor reciente).
- **Modelo 036/037** sellado por la AEAT.
- Tarjeta de identificación fiscal (**CIF**).
- Si el teléfono no aparece en ninguno de los anteriores, una **factura de
  teléfono** a nombre de la empresa.

Requisitos de forma, que también tumban solicitudes: en **color**, documento
**completo** sin recortar ni tapar nada, legible, y de **menos de un año** de
antigüedad.

**D. Enviar**

1. [business.facebook.com/settings](https://business.facebook.com/settings)
2. Selecciona el portfolio > **Configuración**.
3. **Centro de seguridad** (Security Centre).
4. En **Verificación del negocio**, pulsa **Iniciar verificación**.
5. Rellena los datos del punto B, sube los documentos del punto C y confirma
   el código que Meta envía por teléfono o correo.

**E. Esperar**

El estado se sigue en ese mismo Centro de seguridad: *No verificado* >
*Pendiente* > *Verificado*. Lo normal son unos días; si la documentación va
justa puede irse a dos semanas. Si sale rechazado, Meta dice el motivo y se
puede volver a enviar corrigiendo ese punto.

Mientras tanto **no toques el número del móvil**: la fase 1 va después.

## Fase 1 — Liberar el número

1. Copia de seguridad de los chats, si hiciera falta.
2. En el móvil, en la app de WhatsApp o WhatsApp Business de ese número:
   **Ajustes > Cuenta > Eliminar mi cuenta**.
3. Espera unos minutos a que Meta lo dé por libre.

A partir de aquí ese número ya no recibe WhatsApp en el móvil. Lo recibirá el
bot.

## Fase 2 — Alta en Meta

1. En la app de Meta: **WhatsApp > API Setup > Add phone number**.
2. Rellena el perfil de empresa (nombre visible, categoría, descripción).
3. Verifica el número por **SMS** o por **llamada de voz**.
4. Copia el **Phone Number ID** nuevo. Ojo: es un identificador largo, **no**
   es el número de teléfono.
5. Comprueba en **WhatsApp > Configuration > Webhook** que el campo `messages`
   sigue suscrito, y que la app está suscrita a la cuenta de WhatsApp Business
   (WABA) donde ha quedado el número nuevo.

### El fallo que cuesta dos horas: la app suscrita a la cuenta

**Si el número está "Conectado" y aun así no llega ni un mensaje, es esto.**

Una app solo recibe los mensajes de las cuentas de WhatsApp Business (WABA) a
las que está **suscrita**. Ese enlace se hace solo cuando el número se añade
*desde dentro de la app*; si la cuenta se crea desde Configuración del negocio
(que es lo que hay que hacer, porque la cuenta de pruebas no admite números
reales), **el enlace no se crea** y Meta no entrega nada.

Lo peor es que **no se ve en ninguna pantalla de Meta**: solo existe en la API.
Todo lo demás sale en verde — número Conectado, webhook configurado, campo
`messages` suscrito, token con permisos — y no funciona nada.

Comprobarlo y arreglarlo, con un token de la app (Paso 1 > "Generar token"):

```bash
# ¿Qué apps reciben los mensajes de esta cuenta?
curl -sS "https://graph.facebook.com/v21.0/<WABA_ID>/subscribed_apps" \
  -H "Authorization: Bearer $TOKEN"
# {"data":[]}  <- vacío: ahí está el problema

# Suscribir la app
curl -sS -X POST "https://graph.facebook.com/v21.0/<WABA_ID>/subscribed_apps" \
  -H "Authorization: Bearer $TOKEN"
# {"success":true}
```

Tiene efecto inmediato, sin desplegar nada.

De paso, para ver el estado real del número sin dar vueltas por los menús:

```bash
curl -sS "https://graph.facebook.com/v21.0/<PHONE_NUMBER_ID>?fields=display_phone_number,verified_name,name_status,code_verification_status,quality_rating,platform_type,status" \
  -H "Authorization: Bearer $TOKEN"
```

`status: CONNECTED` y `code_verification_status: VERIFIED` es lo que hay que
ver. `name_status: DECLINED` significa que Meta rechazó el nombre visible —
molesto, pero **no impide** enviar ni recibir.

### Mientras se revisa el nombre, el perfil entero está bloqueado

Comprobado en real, y cuesta un rato entenderlo porque Meta no lo explica: con
una verificación de nombre visible **en curso**, la pantalla del perfil no deja
guardar NADA. Ni la foto, ni el correo, ni el sitio web. El aviso que sale es un
genérico *"No se pudieron guardar los cambios. Envía los cambios de nuevo y
vuelve a intentarlo"*, que invita a insistir — y por ahí no se sale.

Se reconoce por el cartel de arriba de la pantalla ("Se rechazó tu nombre
visible…") y por el diálogo *"La verificación del nombre visible ya está en
curso. Espera a que esta se complete antes de solicitar otra"*.

Qué hacer: **esperar**. No hay atajo, y reintentar no acelera nada. Solo se
admite una verificación de nombre a la vez.

Y sobre el nombre en sí: Meta es tiquismiquis con las formas jurídicas.
`Ofipapel SL` fue rechazado; `Ofipapel` a secas o `Ofipapel Papelería` tienen
mejor pinta. Si se rechaza una y otra vez, el motivo de fondo suele ser que la
verificación del NEGOCIO no está completa (ver Fase 0) — hasta que eso no esté,
los nombres se seguirán cayendo.

Nada de esto afecta al bot: sigue enviando y recibiendo con normalidad.

### Ojo: puede haber más de un sitio en Netlify

En este proyecto conviven dos sitios apuntando al mismo repositorio:
`ofipapel.netlify.app` (antiguo, sin las variables del bot) y
`spontaneous-lebkuchen-60fa41.netlify.app` (el que sirve de verdad). El bot,
el panel de conversaciones y el webhook viven en el **segundo**.

Los dos sirven el mismo HTML, así que por una página estática no se distinguen.
Para saber en cuál se está mirando, vale esta prueba: una petición POST sin
firma al webhook devuelve **401** en el sitio bueno (tiene
`WHATSAPP_APP_SECRET`) y **200** en el viejo.

## Fase 3 — Cambiar la configuración

1. En Netlify: **Site settings > Environment variables**, cambia
   `WHATSAPP_PHONE_NUMBER_ID` por el nuevo.
2. **Lanza un deploy nuevo.** Sin esto la función sigue con el valor viejo.
3. El resto de variables (`WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`,
   `WHATSAPP_VERIFY_TOKEN`) no se tocan.

## Fase 4 — Comprobaciones antes de darlo por bueno

Desde un móvil que **no** sea el del bot:

1. "Hola" → debe llegar la presentación de bot nuevo (solo la primera vez).
2. Una pregunta de FAQ ("¿a qué hora abrís?").
3. Una búsqueda de catálogo ("¿tenéis papeleras de rejilla?") → debe dar
   productos y precios reales, no el genérico de "pásate por la tienda".
4. Una referencia concreta ("tóner HP 83A") → debe ofrecer **exactamente** esa
   referencia, nunca una parecida.
5. Pedir hablar con una persona → deben llegar los botones, y al confirmar,
   el aviso por email.
6. Revisa los logs en Netlify (Functions > whatsapp-webhook) buscando errores.

## Qué cambia al pasar a producción

- **Coste**: las conversaciones que inicia el cliente y se responden dentro de
  las 24h siguientes (*service conversations*) no se facturan. El bot solo
  responde a mensajes entrantes, así que en el uso normal no genera coste de
  mensajería. Conviene confirmar las condiciones vigentes en la web de precios
  de Meta, que las ha cambiado varias veces.
- **Ventana de 24 horas**: fuera de esa ventana Meta solo deja enviar
  plantillas aprobadas. Esto afecta al aviso por WhatsApp al dueño
  (`OWNER_WHATSAPP_NUMBER`): si hace más de 24h que no le escribes al bot, ese
  aviso **fallará**. El aviso por email (`RESEND_API_KEY` / `OWNER_EMAIL`) no
  tiene esa limitación y es el que hay que considerar fiable.
- **Límite de mensajería**: se empieza en un escalón bajo de clientes únicos
  cada 24h y Meta lo va subiendo según el volumen y la calidad de las
  respuestas. Para el volumen de una papelería no debería notarse.
- **Calidad**: Meta puntúa la calidad del número según cómo reaccionan los
  clientes (bloqueos, reportes). Si baja mucho, restringe el envío.

## La ventana de 24 horas (y por qué hacen falta plantillas)

Meta solo deja a un negocio mandar texto libre a quien le ha escrito **en las
últimas 24 horas**, contadas desde el último mensaje del cliente y reiniciadas
con cada mensaje nuevo suyo. Cada conversación tiene su propia ventana. Fuera de
ella, el mensaje no se entrega: Meta lo rechaza y el destinatario no ve nada.

**Al bot esto no le afecta nunca**, porque solo responde: cuando contesta, la
ventana acaba de abrirse en ese mismo segundo.

**Sí afecta a los avisos al dueño.** Para WhatsApp el dueño es un cliente más
del número del bot, así que si hace más de un día que no le escribe, el aviso de
escalado en texto libre **no le llega, y falla en silencio**. Y un escalado salta
justo cuando no está escribiéndole al bot. En pruebas no se nota (se le escribe
al bot cada dos por tres); en producción falla casi siempre.

La forma correcta de escribir fuera de la ventana es una **plantilla aprobada**.

### Crear la plantilla de aviso de escalado

En WhatsApp Manager > Herramientas de la cuenta > **Plantillas de mensajes** >
Crear plantilla:

- **Nombre**: `aviso_escalado` (minúsculas y guiones bajos; es lo único que
  admite Meta)
- **Categoría**: **Utilidad** (*Utility*). No es marketing — es un aviso de
  servicio. Elegir marketing haría que la rechazaran o que costara más.
- **Idioma**: Español (`es`)
- **Cuerpo**:

  ```
  🔔 Bot de Ofipapel: un cliente quiere hablar con una persona.

  Su teléfono es {{1}} y su último mensaje fue: "{{2}}".

  Entra en el panel de conversaciones para responderle.
  ```

- **Ejemplos** que pide Meta para revisar: `34600123456` y
  `Quiero hablar con alguien sobre mi pedido`
- **Botón** (opcional pero cómodo): tipo *Visitar sitio web*, texto "Ver panel",
  URL `https://ofipapel.netlify.app/.netlify/functions/conversations`

Reglas de Meta que conviene respetar al escribir el cuerpo, porque son motivo de
rechazo: los huecos van numerados y correlativos desde `{{1}}`, no pueden ir dos
pegados, y es más seguro que el texto no empiece ni termine en un hueco.

Una vez aprobada, en Netlify:

| Variable | Valor |
|---|---|
| `OWNER_ALERT_TEMPLATE` | `aviso_escalado` |
| `OWNER_ALERT_TEMPLATE_LANG` | `es` (opcional, es el valor por defecto) |

Y un deploy nuevo. Sin `OWNER_ALERT_TEMPLATE` el aviso sigue yendo en texto
libre, igual que hasta ahora; si el envío por plantilla falla, también se cae al
texto libre. El aviso por **email** (`RESEND_API_KEY` / `OWNER_EMAIL`) va
siempre aparte y no depende de nada de esto — es el único que se puede
considerar fiable al 100%.

Los valores que se meten en los huecos se limpian antes de enviarlos (saltos de
línea, tabuladores, espacios repetidos y longitud): Meta rechaza el envío entero
si los llevan, y vienen de lo que ha escrito un cliente por WhatsApp.

## Parada de emergencia

Si el bot empieza a contestar mal a clientes reales, hay dos formas de callarlo,
y conviene conocer las dos **antes** de necesitarlas:

1. **Botón "Parar el bot"** en el panel de conversaciones
   (`/.netlify/functions/conversations`). Es la vía normal: dos clics desde el
   móvil, efecto inmediato, sin desplegar nada.
2. **Variable `BOT_PAUSADO=1`** en Netlify + un deploy. Es el respaldo, para
   cuando el panel no está disponible (por ejemplo si Redis está caído, que es
   justo cuando el botón del panel no se podría leer).

Estando parado:

- El bot **no responde** a nadie.
- Los mensajes de los clientes **se siguen archivando** en el panel, para
  contestarlos a mano. Parar el bot no pierde mensajes.
- Cada cliente recibe **un solo aviso** de que le atenderá una persona — no uno
  por cada mensaje que mande. Si más adelante se vuelve a parar el bot, se le
  vuelve a avisar.

La pausa **no caduca sola**: se reanuda a mano desde el mismo botón. Una parada
de emergencia que se levanta sola sin que nadie se entere es peor que no
tenerla.

## Estado actual del agente

Lo que la primera versión de este documento daba por no implementado y hoy sí
lo está:

- Guarda el historial de conversación (Upstash Redis) y hay panel para verlo
  (`netlify/functions/conversations.js`).
- La deduplicación de reintentos de Meta es persistente y funciona entre
  instancias distintas de la función, no solo en memoria.
- Consulta el catálogo real de ofipapel.net (productos, precios, stock) y el
  estado de pedidos.
- Ficha del cliente con datos duros y presentación una sola vez por cliente.
- Sabe qué consumible lleva cada impresora (ver más abajo).

Limitación que sigue vigente:

- Solo responde a mensajes de **texto**. Los mensajes con audio, imagen, etc.
  reciben una respuesta genérica indicando que el equipo lo revisará.

## El panel de conversaciones

`netlify/functions/conversations.js`. Además de leer y contestar, tiene:

- **Acuses de recibo.** Cada mensaje que sale (del bot o escrito a mano) lleva su
  tick: uno gris enviado, dos grises entregado en el móvil del cliente, dos
  azules leído. Meta los manda por el mismo webhook que los mensajes entrantes.
  **Si el cliente tiene desactivadas las confirmaciones de lectura en su
  WhatsApp, el azul no llega nunca** aunque lo haya leído — se queda en
  entregado. No es un fallo del bot y no hay forma de saberlo desde aquí.
- **Borrar una conversación desde la lista**, con el icono de la papelera en la
  esquina de cada tarjeta (pide confirmación). Borra también el contador de sin
  leer y los acuses de ese número; el historial no se puede recuperar.
- **Cada tarjeta dice de qué va**: junto al número y la hora salen el nombre del
  cliente y, entre comillas,
  por lo que preguntó — «lápiz 3D», «tóner Brother». Sale de lo que el bot
  anota en la ficha, y si no hay ficha, del primer mensaje con contenido del
  cliente. Un número de teléfono no identifica a nadie, y aquí no hay foto de
  perfil como en WhatsApp.

  El nombre sale, por orden de fiabilidad: de la empresa o el nombre de un
  pedido verificado contra WooCommerce, y si no, del **nombre que el cliente
  tiene puesto en su WhatsApp**, que Meta manda con cada mensaje.

  **La foto de perfil no se puede mostrar.** La API de WhatsApp Cloud no da la
  foto de los clientes — solo la del propio negocio — y no hay forma de
  obtenerla. Es una decisión de privacidad de Meta, no una limitación nuestra.
- **Buscador** en la lista: busca en el teléfono, en todo lo hablado y en la
  ficha del cliente (nombre, empresa y notas del equipo), sin distinguir
  acentos ni mayúsculas. Se piden todas las palabras, y cada resultado enseña
  el trozo de conversación por el que ha salido.
- **Parada del bot**, general (arriba del todo) o por conversación. Las
  conversaciones con el bot parado se ven **desde la lista**, con su aviso y la
  tarjeta en ámbar: si no, se quedan ahí muertas hasta que la pausa caduca sola
  a las 24 h y el cliente se lleva el silencio.
- **Adjuntar pegando**: además del botón del clip, se puede pegar una imagen
  copiada (Ctrl+V) en el cuadro de respuesta, sin tener que guardarla antes en
  el disco. Va al mismo sitio que un adjunto normal.
- **Perfil del negocio** (enlace en el pie): enseña la foto y los datos que ve un
  cliente al pulsar en el nombre del contacto, dice cuántos faltan por rellenar,
  y trae los pasos para cambiarlo en WhatsApp Manager. Solo se lee desde aquí:
  los textos se podrían cambiar por API, pero subir la foto es una carga en tres
  pasos que no compensa montar para algo que se toca una vez al año.
- **Volver arriba** al final de cada conversación.

## Cuando ofipapel.net nos bloquea

Es la causa número uno de que el bot conteste "un segundo, por favor" y acabe
sin dar precios. **No es un fallo del código ni de las claves de WooCommerce.**

### Qué pasa exactamente

La web tiene una protección anti-bots que va **delante de WordPress**, en la
capa del hosting (el servidor se identifica como `openresty`). Cuando decide
que una petición es sospechosa, contesta con un **HTTP 200 y una página HTML**
titulada *"One moment, please…"*, con un JavaScript ofuscado que espera un
parámetro `wsidchk` y reenvía a una ruta larga en hexadecimal
(`/z0f76a1d1…`). Es decir: responde una página web donde nosotros esperábamos
JSON.

Por eso **tener claves válidas de la API no ayuda**: quien corta la petición no
es WooCommerce, es el portero de la puerta de la calle. WordPress ni se entera
de que hemos llamado, así que nunca llega a mirar las claves. Es como tener la
tarjeta de la oficina pero que no te dejen entrar al edificio.

En los registros de Netlify se reconoce por este mensaje:

```
WooCommerce devolvió "text/html; charset=UTF-8" en vez de JSON:
la protección anti-bots de ofipapel.net nos ha bloqueado
```

### Qué pedirle a quien administra la web

Lo que hay que conseguir es una excepción para **una sola ruta**:
`/wp-json/wc/v3/*`. No hace falta bajar la protección del resto de la web.

**Importante: no vale una lista blanca por IP.** Las funciones de Netlify se
ejecutan en AWS Lambda y salen por direcciones que cambian en cada ejecución;
una regla por IP dejaría de valer al día siguiente. La excepción tiene que ir
por ruta, por cabecera o por las dos.

El bot se identifica en **todas** sus peticiones con:

| Cabecera | Valor |
|---|---|
| `User-Agent` | `OfipapelWhatsAppBot/1.0 (+https://ofipapel.net; bot de atencion al cliente)` |
| `Authorization` | `Basic …` (las claves de la API REST de WooCommerce) |
| `X-Ofipapel-Bot` | solo si se configura `WOOCOMMERCE_BYPASS_TOKEN` (ver abajo) |

Tres formas de hacer la excepción, de la más sencilla a la más estricta —
cualquiera de las tres sirve:

1. **Por ruta.** Excluir `/wp-json/wc/v3/` de la protección anti-bots y del
   límite de peticiones. Es la más simple. Esa ruta ya está protegida por las
   propias claves de la API: sin ellas devuelve 401.
2. **Por User-Agent.** Permitir las peticiones cuyo `User-Agent` sea
   `OfipapelWhatsAppBot/1.0`. Sirve si el panel del hosting permite reglas por
   agente pero no por ruta.
3. **Por cabecera secreta.** La más estricta y la que se recomienda si la
   protección la lleva Cloudflare u otro WAF con reglas propias:
   - Se genera un valor largo al azar (por ejemplo `openssl rand -hex 24`).
   - Se pone en Netlify como variable `WOOCOMMERCE_BYPASS_TOKEN` (marcada como
     secreta) y se despliega.
   - Se crea una regla que deje pasar las peticiones a `/wp-json/wc/v3/*` que
     lleven la cabecera `X-Ofipapel-Bot` con ese valor exacto.

   Sin la variable configurada el bot no manda esa cabecera y todo sigue
   funcionando igual que ahora, así que se puede preparar la regla primero y
   activar la variable después.

### Volumen real, para dimensionar la regla

Conviene decírselo, porque suele ser la duda: **el bot no hace scraping**.

- Solo llama cuando un cliente escribe por WhatsApp.
- Por cada mensaje, entre 2 y 7 peticiones (varias formas de escribir la misma
  búsqueda, más categorías y ofertas), y en dos tandas, no todas a la vez.
- Con el volumen actual de conversaciones son decenas de peticiones al día, no
  miles.
- Cada petición trae ya sus claves de API y solo hace lecturas (`GET`).

### Cómo comprobar que ha funcionado

Desde cualquier terminal, sustituyendo las claves:

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" \
  -H "User-Agent: OfipapelWhatsAppBot/1.0" \
  -u "ck_LA_CLAVE:cs_EL_SECRETO" \
  "https://ofipapel.net/wp-json/wc/v3/products?search=toner&per_page=3"
```

- **Bien:** `200 application/json`
- **Sigue bloqueado:** `200 text/html…` (esa es la pantalla de "One moment,
  please…")
- **Claves mal:** `401 application/json`

Repetirlo cinco o seis veces seguidas: el bloqueo a veces solo salta al
acumular varias peticiones seguidas, que es exactamente lo que hace el bot.

### Qué se gana

- Se acaban los "un segundo, por favor" y las respuestas sin precio.
- Se podría descargar el catálogo entero una vez y emparejar las referencias de
  consumible contra los nombres reales de los productos, en vez de deducir la
  forma en que están escritos (ver la limitación de los guiones más abajo).

## Consumibles por modelo de impresora

El cliente no sabe la referencia del cartucho; sabe qué impresora tiene. El bot
hace de puente: si nombra su modelo en cualquier frase ("tengo una Epson
XP-4200 y necesito tinta"), reconoce el equipo, sabe que lleva el **604 / 604XL**
y busca justo esa referencia en el catálogo para darle precio y stock.

Piezas:

| Fichero | Qué hace |
|---|---|
| `scripts/datos/Inf_Art_Rel.xlsx` | El Excel del distribuidor: relación equipo → consumible. Es el origen de todo. |
| `scripts/generar-consumibles.py` | Convierte ese Excel en el índice del bot. Se ejecuta **a mano**, no forma parte de ningún build. |
| `netlify/functions/data/consumibles-impresora.json` | El índice ya generado: 469 impresoras y 933 consumibles. Va empaquetado con la función. |
| `netlify/functions/whatsapp-consumibles.js` | Reconoce el modelo en el mensaje y arma el bloque que se le pasa a la IA. |

Cuando el proveedor mande un Excel nuevo:

```bash
pip install openpyxl                                   # solo la primera vez
cp <el excel nuevo> scripts/datos/Inf_Art_Rel.xlsx
python3 scripts/generar-consumibles.py scripts/datos/Inf_Art_Rel.xlsx
git add scripts/datos/Inf_Art_Rel.xlsx netlify/functions/data/consumibles-impresora.json
```

Y desplegar. No hay nada que configurar en Netlify: los datos viajan dentro de
la función, no se consultan por red. Es a propósito — la relación
equipo-consumible no está publicada en ofipapel.net, y la web se cae o nos
bloquea con demasiada frecuencia como para depender de ella también para esto.

### Cómo lo escribe el catálogo

El proveedor da `TN248`; la web escribe `TN-248`. Y el buscador de WordPress
compara letra por letra, así que preguntar por `TN248` no encuentra nada aunque
el producto esté ahí. Igual con `A4` contra `A-4`, o `nº305` contra `305`.

`scripts/emparejar-catalogo.py` descarga el catálogo entero una vez, busca cada
referencia dentro de los nombres reales y anota la forma exacta en
`netlify/functions/data/referencias-catalogo.json`. El bot pregunta por lo que
sabe que existe, en vez de probar variantes.

```bash
# La primera vez, o cuando cambie el Excel del proveedor (tarda ~30 min):
python3 scripts/emparejar-catalogo.py catalogo.json

# Repetir el emparejado sin volver a descargar (usa el catalogo.json de antes):
python3 scripts/emparejar-catalogo.py catalogo.json
```

Ese fichero es **opcional**: si no está, el bot busca por la referencia del
proveedor exactamente como antes. Una regeneración a medias no puede dejarlo
roto.

Requiere que el hosting no nos esté bloqueando — ver "Cuando ofipapel.net nos
bloquea".

### Cuánto del índice tiene precio en la web

Medido sobre el catálogo entero (18.891 productos), no sobre una muestra:

| Marca | Equipos con precio | Total | |
|---|---|---|---|
| EPSON | 23 | 27 | 85% |
| HP | 80 | 124 | 65% |
| BROTHER | 72 | 135 | 53% |
| CANON | 2 | 2 | 100% |
| KYOCERA | 2 | 64 | 3% |
| LEXMARK, OKI, DYMO, PANTUM, TOSHIBA, RICOH | 0 | 117 | 0% |
| **TOTAL** | **179** | **469** | **38%** |

El 38% general engaña: el Excel es el catálogo **completo del distribuidor**
(Lexmark de empresa, Kyocera TASKalfa, OKI industrial, etiquetadoras Dymo…),
mientras que la web vende la gama de hogar y pequeña oficina. Donde importa —
Epson, HP y Brother, que son 286 de los 469 equipos — la cobertura va del 53%
al 85%.

Para el resto el bot sigue siendo útil: da la referencia correcta, que es la
pregunta que hace el cliente. Lo que no puede dar es el precio.

### Lo que este índice NO resuelve

- **Solo lleva los equipos que el distribuidor vende hoy.** Una MFC-L2710DW o
  una Lexmark MS431, muy comunes entre clientes, no están en el Excel aunque su
  tóner siga vendiéndose. Para esas el bot sigue funcionando como antes: si el
  cliente da la referencia, la busca; si da el modelo, no la deduce.
- **No dice si lo tenemos ni a qué precio.** Eso sigue saliendo solo del
  catálogo. El bloque que recibe la IA se lo advierte de forma explícita, y la
  red de seguridad contra confirmaciones inventadas ("sí, tenemos…") sigue
  atada al catálogo, no a este índice.
- **Del Excel solo se usan las familias de tienda** (láser, inkjet,
  etiquetadoras, cintas). Gran formato, escáneres de producción y plotters
  quedan fuera a propósito: no es lo que se pregunta por WhatsApp.
