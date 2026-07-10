# Agente de WhatsApp de Ofipapel — puesta en marcha

Este agente contesta automáticamente los mensajes de WhatsApp del negocio:
primero intenta responder con reglas rápidas (horario, dirección, teléfono...)
y, si no reconoce la pregunta, responde con IA (Claude) usando la información
del negocio como contexto.

Vive como una función serverless de Netlify en
`netlify/functions/whatsapp-webhook.js`, así que se despliega junto con el
resto del sitio sin necesidad de un servidor aparte.

## 1. Datos del negocio

Los datos de la tienda (Los Cristianos: dirección, teléfono y horario) ya
están cargados en `netlify/functions/whatsapp-agent-config.js`. Puedes
añadir más preguntas frecuentes en el array `FAQ_RULES` si lo necesitas.

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

Despliega el sitio (push a la rama o build manual) para que la función quede
publicada en `https://<tu-dominio>/.netlify/functions/whatsapp-webhook`.

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

## Notas y limitaciones de esta primera versión

- Solo responde a mensajes de **texto**. Mensajes con audio, imagen, etc.
  reciben una respuesta genérica indicando que el equipo lo revisará.
- No guarda historial de conversación entre mensajes (cada mensaje se
  responde de forma independiente). Si más adelante quieres memoria de
  conversación o un panel para ver el historial, se puede añadir una base de
  datos (por ejemplo Supabase, que ya se usa en `joe-app`).
- La deduplicación de reintentos de Meta es best-effort (en memoria), válida
  para el volumen de mensajes de una papelería; si el tráfico creciera mucho
  convendría pasar a un almacén persistente.
