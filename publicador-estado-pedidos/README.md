# Publicador del estado de pedidos (GeminisWin → el bot de WhatsApp)

Cuando un cliente pregunta por su pedido web, el bot solo sabe lo que diga
WooCommerce — y la web **no se entera** de que un pedido se ha facturado,
cargado o entregado, porque eso se cambia a mano. Este programa sube a Supabase
el estado de verdad, el que lleva GeminisWin, y el bot lo lee
(`netlify/functions/gestion-pedidos.js`).

**Corre en el PC de Rober**, no en Netlify: GeminisWin no tiene API y los datos
están en los `.dbf` del servidor.

| | |
|---|---|
| Carpeta | `C:\geminisw\ListadosGW\publicador\` |
| Datos | `G:\GW002024\` — **solo lectura**, nunca se escribe en un `.dbf` |
| Python | 3.14, lanzador `py` |
| Dependencias | `py -m pip install -r requirements.txt` (keyring y tzdata) |

## Instalación

```bat
py -m pip install -r requirements.txt
py publicar_estado_pedidos.py --credenciales
```

Lo segundo pide la contraseña de `gestion@ofipapel.internal` y la guarda en el
**Administrador de credenciales de Windows**. No se escribe en el código ni en
ningún fichero, y no se usa `service_role` en ningún sitio.

## Cómo se usa

```bat
py publicar_estado_pedidos.py                      :: publica
py publicar_estado_pedidos.py --seco               :: lo calcula y NO escribe
py publicar_estado_pedidos.py --comprobar 663273   :: qué saldría de ese pedido
```

`--comprobar` acepta varios números y es la forma de contrastar un caso
concreto contra lo que se ve en GeminisWin.

## Programación (Programador de tareas de Windows)

De lunes a viernes: cada 15 min de 13:00 a 15:30, cada hora de 9:00 a 19:00, y
una pasada a las 18:30.

Si `G:\` no está disponible (servidor apagado) **sale sin error** y lo deja para
la pasada siguiente: si devolviera error, la tarea saldría en rojo cada noche y
dejaría de mirarse. Registro en `log.txt`, sin contraseñas.

## Por qué cada pasada lo reescribe todo

El bot mide la frescura del dato **en días laborables**: si una fila no se
reescribe y se queda por detrás del último día laborable, deja de fiarse de ella
y contesta con WooCommerce. Por eso se publican **todos** los pedidos web de los
últimos 60 días en cada pasada, no solo los que hayan cambiado.

`actualizado` no se manda nunca: lo pone la base de datos con un trigger.

## Las reglas (`estados.py`)

En este orden:

1. `ANULADO` → **anulado**
2. Tiene línea de reparto (`reparlin.ESTADO`):
   - 4 (Entregado) o 5 (Liquidado = cobrado) → **entregado**
   - 7 (No entregado) → **no_entregado**
   - 1 (Quitado) o 6 (Devuelto) → **incidencia**
   - 2 o 3 (reparto abierto) → **en_reparto**, con `repartos.FECHA`
   - cualquier otro código → **no se publica** (y se avisa en el registro)
3. Sin reparto y `pedidos.LIQUIDADO = 5` con `IDVENTA > 0` → **facturado**
4. El resto → **recibido**

### Las tres trampas de GeminisWin

- **«Liquidado» significa dos cosas.** En el *pedido* es convertido en venta
  (facturado). En el *reparto* es **cobrado** por el repartidor. Misma palabra,
  dos cosas que al cliente se le cuentan al revés.
- **Pagado no es entregado.** Los pedidos web se pagan al hacerlos (Bizum,
  contado web), así que casi todos están pagados desde el minuto uno. Lo único
  que confirma una entrega es que David cierre el reparto.
- **Un pedido sin venta tiene `IDVENTA = 0`, y hay muchísimas líneas de reparto
  con ceros.** Cruzarlos le colgaría a un pedido de hoy el reparto de otro y el
  bot diría «entregado» de algo que no ha salido. Sin venta no hay cruce, y hay
  una prueba para eso.

`pago_pendiente` solo puede ser cierto con `FORMA_P = '77'` (transferencia
inmediata) y `TOT_PEND > 0`: es la única forma de pago que deja un pedido web
sin pagar.

## El lector de `.dbf` (`dbf.py`)

Escrito a mano con `struct` **a propósito**: `dbfread` leyó de menos en
`ventas.dbf`. Un lector que se deja registros no da un error — da un pedido que
«no existe».

- El número de registros **no se lee de la cabecera**, se calcula con el tamaño
  real del fichero: la cabecera de una tabla que se escribe a todas horas se
  queda corta. Hay una prueba con una cabecera que miente.
- `pedidos.dbf` son ~260 MB en una unidad de red y crece por el final, así que
  se leen solo los últimos 20.000 registros.
- Texto en cp1252 con `errors='replace'`; fechas `D` como `AAAAMMDD`; `T` como
  día juliano + milisegundos; lógicos en blanco como `None`, que **no es lo
  mismo que False**.

## Seguridad

- Se escribe llamando a `publicar_estado_pedidos(jsonb)`, que comprueba por
  dentro que quien llama es `gestion@ofipapel.internal` (mismo patrón que
  `cp_guardar_lote` en Control de Pedidos). Esa cuenta **no puede leer** la
  tabla, ni tocar ninguna otra, ni borrar filas.
- La tabla **no lleva nombres a propósito**: la identidad del cliente la
  comprueba siempre el bot contra WooCommerce antes de consultar nada de aquí.

## Pruebas

```bash
py scripts/probar-publicador.py
```

26 comprobaciones. No necesita `G:\`, ni GeminisWin, ni Supabase: fabrica
ficheros `.dbf` de verdad y los lee con el mismo lector que en producción.
Incluye los cinco pedidos reales del 25/10 (663273, 663617, 658813, 661149 y
655760) con el estado que dijo GeminisWin.
