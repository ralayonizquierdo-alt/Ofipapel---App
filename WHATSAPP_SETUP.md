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

Limitación que sigue vigente:

- Solo responde a mensajes de **texto**. Los mensajes con audio, imagen, etc.
  reciben una respuesta genérica indicando que el equipo lo revisará.
