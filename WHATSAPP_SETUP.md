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

1. **Verificación del negocio** en Meta Business Suite
   (Configuración del negocio > Centro de seguridad > Verificación del
   negocio). Sin ella el número queda limitado y el nombre visible no se
   aprueba. Hará falta documentación de Ofipapel S.L. (CIF, domicilio) y que
   el dato coincida con un registro público.
2. **Método de pago** en WhatsApp Manager. Meta lo exige para operar en
   producción aunque no se llegue a pagar nada (ver "Qué cuesta esto" abajo).
3. **Token permanente**: comprueba que `WHATSAPP_TOKEN` es de un *System User*
   y no el token temporal de 24h de "API Setup". Si fuera el temporal, el bot
   ya se habría caído solo, pero conviene confirmarlo antes de ir a real.
4. **Nombre visible** que verán los clientes (p. ej. `Ofipapel`). Lo revisa
   Meta y debe corresponderse con el negocio.
5. **Política de privacidad** publicada: ya está en `privacidad.html`.

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
