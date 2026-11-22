# E-milio, el agente de correo de proveedores

Rober, 22/11/2026. Vigila el buzón de compras y deja preparados en el ERP los PDF que mandan los proveedores
(propuestas o confirmaciones de pedido, facturas y albaranes), emparejados con su proveedor y su pedido.

## Qué hace y qué no

- Cada 10 minutos (pg_cron `erp_correo_proveedores`) la función `correo-proveedores` mira los correos nuevos con PDF
  del buzón de Archivo → Datos de Empresa → «Correo remitente de Compras».
- Reconoce al proveedor por el correo o el dominio de su ficha, o por el NIF del documento.
- La IA dice qué es (propuesta, factura, albarán u otro), su número, fecha, total sin impuestos y a qué pedido nuestro
  se refiere. El emparejamiento con el pedido (del ERP o de GeminisWin) lo hace el código contra la base de datos:
  por el número que cita el documento o, si no cita ninguno, el único pedido abierto de ese proveedor.
- Todo queda en Gestor 2.0 → **Correo de proveedores** (tabla `correo_proveedor_documento`, PDF en el almacén privado
  `correo_proveedores`). Allí se ve el PDF, se abre el pedido y se marca como revisado o se descarta.
- **Solo lee.** No borra, no mueve, no marca como leído y no contesta. Nunca confirma nada al proveedor ni cambia
  pedidos ni facturas. Los correos internos (`@ofipapelsl.com`) no se tocan.
- Sin las claves de lectura no hace nada: la pestaña lo dice («esperando la conexión de Microsoft»).

## Puesta en marcha (una vez, la hace quien administra Microsoft 365)

Una app **aparte**, de solo lectura y limitada al buzón de compras. La del envío de correos (`AZURE_CLIENT_*`) no se
toca.

1. entra.microsoft.com → Aplicaciones → Registros de aplicaciones → **Nuevo registro**
   (`ERP Ofipapel - lectura compras`). Apuntar el **Id. de aplicación (cliente)**.
2. Permisos de API → Agregar → Microsoft Graph → **Permisos de aplicación** → `Mail.Read` → Agregar →
   **Conceder consentimiento de administrador**.
3. Certificados y secretos → **Nuevo secreto de cliente** (24 meses). Copiar el **Valor** (solo se ve una vez).
4. Supabase → Project Settings → Edge Functions → Secrets:
   - `AZURE_LECTURA_CLIENT_ID` = Id. de aplicación
   - `AZURE_LECTURA_CLIENT_SECRET` = Valor del secreto
   (`AZURE_TENANT_ID` ya existe y es el mismo.) Nunca en el repositorio ni en un chat.
5. **Limitarla al buzón de compras** (si no, podría leer cualquier buzón):
   - admin.exchange.microsoft.com → Destinatarios → Grupos → Agregar grupo → *Seguridad habilitada para correo*,
     `erp-lectura-compras@ofipapelsl.com`, con **solo** `compras@ofipapelsl.com` como miembro.
   - PowerShell:
     ```
     Install-Module ExchangeOnlineManagement -Scope CurrentUser
     Connect-ExchangeOnline
     New-ApplicationAccessPolicy -AppId <ID-DE-APLICACION> -PolicyScopeGroupId erp-lectura-compras@ofipapelsl.com -AccessRight RestrictAccess -Description "ERP solo lee compras"
     Test-ApplicationAccessPolicy -Identity compras@ofipapelsl.com -AppId <ID-DE-APLICACION>   # debe decir Granted
     Test-ApplicationAccessPolicy -Identity conta@ofipapelsl.com -AppId <ID-DE-APLICACION>     # debe decir Denied
     ```
   - Puede tardar hasta una hora en aplicarse.

La primera pasada coge los correos de los últimos 15 días; después, solo lo nuevo. Como mucho 6 PDF por pasada (lo
demás, en la siguiente).

## Pendiente

- Comparar automáticamente la propuesta con el pedido (hoy la comparación línea a línea de «Propuestas de proveedor»
  se lanza a mano y solo con pedidos del ERP; casi todos se hacen en GeminisWin).
- Facturas: dejarlas listas para la recepción / factura de proveedor del ERP.

## Facturas finales (22/11/2026)

Cuando el proveedor manda la factura de un pedido ya aceptado (o el albarán), el agente la compara línea a línea con
el pedido: la IA dice qué línea es cuál y la función calcula las diferencias (falta, menos, más, precio distinto en más
de un 2 %, añadido). Sale en rojo en la pestaña (filtro «Con diferencias») y en el informe de NEXA. Cada factura lleva
su nombre ordenado («AAAA-MM · PROVEEDOR · Nº.pdf») para la carpeta de facturas del servidor; la copia la hará el
programa del PC del espejo cuando se sepa la ruta.

## NEXA, encargada de los agentes

Tablas `agente` (registro) y `agente_orden` (cola). NEXA lo sabe por su memoria global: informe con
`fn_agentes_estado()`, órdenes con `fn_agente_ordenar(agente, orden, parametros)` (nivel 2: propone y la persona dice
«sí»). Órdenes de este agente: `pasar_ahora`, `releer {"documento": id}`, `pausar`, `reanudar`. Cada agente nuevo se da
de alta en `agente` con sus órdenes y su permiso.
