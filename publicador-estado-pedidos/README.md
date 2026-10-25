# Publicador del estado de pedidos (GeminisWin → el bot de WhatsApp)

Cuando un cliente pregunta por su pedido web, el bot solo sabe lo que diga
WooCommerce — y la web **no se entera** de que un pedido se ha facturado,
cargado o entregado, porque eso se cambia a mano. Este programa sube a Supabase
el estado de verdad, el que lleva GeminisWin, y el bot lo lee
(`netlify/functions/gestion-pedidos.js`).

**Corre en la oficina, no en Netlify.** GeminisWin no tiene API: hay que generar
un listado allí y pasárselo a esto.

## Cómo se usa

```bash
node publicar.js "C:\geminisw\estado-pedidos-web.xls"
node publicar.js listado.csv --seco     # lo calcula todo y NO escribe nada
```

Acepta `.xls`, `.xlsx` y `.csv`. Para los dos primeros hace falta `npm install`
una vez en esta carpeta (SheetJS); el CSV se lee sin instalar nada.

Credenciales en variables de entorno, **nunca** en un fichero del repo:

| Variable | Qué es |
|---|---|
| `SUPABASE_GESTION_EMAIL` | `gestion@ofipapel.internal` |
| `SUPABASE_GESTION_PASSWORD` | la suya |

## Lo primero que hay que hacer: traducir los estados

El vocabulario de los listados de GeminisWin **no está puesto todavía**, porque
no lo conocemos: no tiene API y los listados se miran con computer use en
rober-pc. En `estados.js` solo están traducidas las palabras que significan
literalmente lo mismo (`Facturado` → `facturado`, `Anulado` → `anulado`).

Cualquier otra palabra **no se publica**: ese pedido se queda fuera de la tabla
y el bot contesta con WooCommerce, igual que hoy. No se pierde nada y, sobre
todo, no se le dice una cosa por otra a un cliente.

Al terminar, el programa imprime lo que no supo traducir:

```
⚠  2 estados de GeminisWin SIN TRADUCIR (139 pedidos):
     98  "Pdte. Servir"
     41  "Servido"
```

Esa lista es la tarea: por cada palabra, saber **qué significa de verdad** y
añadirla a `TRADUCCION` en `estados.js`.

⚠️ **Cuidado con «Liquidado»**: en GeminisWin significa **COBRADO** (el
repartidor ha liquidado la factura en administración), **no** facturado. Está
sin traducir a propósito.

## Cada pasada reescribe TODO, no solo lo que cambia

El bot mide la frescura del dato en días laborables: si una fila no se reescribe
y queda por detrás del último día laborable, deja de fiarse de ella y contesta
con WooCommerce. Por eso el listado tiene que traer **todos los pedidos vivos**
en cada pasada, no solo los que hayan cambiado.

`actualizado` no se manda nunca: lo pone la base de datos con un trigger.

## Seguridad

- Se escribe llamando a la función `publicar_estado_pedidos(jsonb)`, que
  comprueba por dentro que quien llama es `gestion@ofipapel.internal`. Mismo
  patrón que `cp_guardar_lote` en Control de Pedidos.
- Esa cuenta **no puede leer** la tabla, ni tocar ninguna otra. No se usa
  `service_role` en ningún sitio.
- La tabla **no lleva nombres a propósito**: la identidad del cliente la
  comprueba siempre el bot contra WooCommerce antes de consultar nada de aquí.
- Los listados que salen de GeminisWin llevan datos de clientes reales y este
  repositorio es público: `.gitignore` bloquea `*.xls`, `*.xlsx` y `*.csv`.

## Qué falla y qué hace entonces

| Qué pasa | Qué hace |
|---|---|
| No encuentra la columna del pedido web o la del estado | **Para**, dice qué columnas trae el listado y dónde se arregla |
| Ninguna fila publicable | **No escribe nada** y sale con error, para que la tarea programada lo marque como fallido |
| Un estado que no conoce | Se salta ese pedido y lo cuenta en el aviso final |
| Una fila sin número de pedido reconocible | Se la salta (una clave inventada apuntaría al pedido de otro) |
| El mismo pedido dos veces | Se queda la última y lo avisa |

## Pruebas

```bash
node scripts/probar-publicador.js
```

No necesita GeminisWin, ni Excel, ni Supabase.
