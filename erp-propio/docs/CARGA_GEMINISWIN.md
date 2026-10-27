# Carga de datos de GeminisWin al ERP

Pasa los DBF de GeminisWin, ya volcados en bruto en `public.carga_dbf`, a las
tablas del ERP. Código: `supabase/migrations/20261027_fn_carga_geminiswin.sql`
(en la base se aplicó en cuatro migraciones `fn_carga_geminiswin_1..4`; el
fichero local es el resultado final).

> Este documento no lleva datos de clientes. Los recuentos son los de la
> muestra cargada el 27/10/2026.

## Cómo repetir la carga

```sql
select fn_carga_gw_todo();
```

- Se ejecuta por SQL (rol `postgres` o `service_role`). Las funciones **no** son
  `SECURITY DEFINER` y `anon` / `authenticated` no pueden ejecutarlas.
- Todo va en una transacción: si algo falla, no se queda nada a medias.
- Es **repetible**: todo es upsert por la clave natural (el código). Ejecutarla
  dos veces deja exactamente lo mismo (comprobado: mismos recuentos, mismo
  stock, ningún movimiento nuevo, mismo hash de precios y clientes).
- No borra nada. Los datos de prueba con el mismo código que uno real se
  sobrescriben; los demás se quedan (decisión de Rober: el día de la migración
  definitiva se vacía todo antes).
- No genera ventas, facturas, asientos ni registros VeriFactu (comprobado antes
  y después). Lo único que dispara triggers es el stock (ver abajo) y la ruta
  (`ruta_reparto` → `ruta`).
- Devuelve un informe jsonb: por cada tabla, filas leídas, insertadas,
  actualizadas, rechazadas (con motivo y algún código de ejemplo) y referencias
  que se dejaron a NULL; y al final, las diferencias entre `_RESUMEN` (recuento
  del DBF original) y lo que hay en `carga_dbf`.
- Cada tabla tiene su función `fn_carga_gw_<tabla>()`, que se puede ejecutar
  sola, pero respetando el orden de dependencias de `fn_carga_gw_todo()`.

Ayudantes (`gw_t`, `gw_n`, `gw_i`, `gw_b`, `gw_d`, `gw_ts`) leen el jsonb con la
convención de `carga_dbf`: un campo que no está = vacío / 0 / false.

## Qué DBF va a qué tabla (y orden)

| # | DBF | Tabla del ERP | Clave | Muestra: leídas → cargadas |
|---|---|---|---|---|
| 1 | PAISES | pais | ISO2 | 1 → 1 |
| 2 | PROVINCIAS | provincia | CODIGO | 52 → 52 |
| 3 | FOMA | forma_pago | FORMA_COD | 60 → 59 (1 rechazada) |
| 4 | ALMACEN | almacen | CODALMAC | 4 → 4 |
| 5 | OFICINA | tienda_terminal | OFICINA | 32 → 32 |
| 6 | ZONATERR | zona_territorial | ZONATERRIT | 90 → 90 |
| 7 | RUTAS | ruta_reparto (+ ruta por trigger) | IDRUTA | 12 → 12 |
| 8 | RUTAZONA | ruta_reparto_zona | IDRUTA+IDZONA | 95 → 95 |
| 9 | REPARTIDOR | repartidor | IDREPARTID | 35 → 35 |
| 10 | RUTAREPA | ruta_reparto_repartidor | IDRUTA+IDREPARTID | 81 → 81 |
| 11 | VENDEDOR | vendedor (+ vendedor_comision_nivel) | IDVENDEDOR | 15 → 15 (32 comisiones por nivel) |
| 12 | TRANSPOR | transportista | CODIGO | 99 → 99 |
| 13 | PLANTTAR | plantilla_tarifa (+ _nivel 0..6) | CODTAR | 110 → 110 (770 niveles) |
| 14 | FAMILIAS | familia | COD_FAM | 1114 → 1114 |
| 15 | MARCAS | marca | MARCA | 1094 → 1094 (+75 creadas desde artículos) |
| 16 | PROVEEDO | proveedor | CODIGO | 508 → 508 |
| 17 | TIPOCLIE | tipo_cliente | TIPOCLIENT | 70 → 70 |
| 18 | CLIENTES | cliente | IDCLIENTE | 601 → 601 |
| 19 | ARTICULO | articulo | COD_INTERN | 2001 → 2001 |
| 20 | ARTICULO (PVP_n…) | articulo_precio_nivel | artículo+nivel | 14007 → 14007 |
| 21 | ARTBARRA | articulo_codigo_barras | el código de barras | 5009 → 4996 (13 rechazadas) |
| 22 | ARTDPROV + ARTPROV | articulo_proveedor | artículo+proveedor | 7736 pares → 6419 (1317 rechazados) |
| 23 | ARTICALM | articulo_almacen_stock (vía movimiento_stock) | artículo+almacén | 6010 → 6007 (3 rechazadas) |
| 24 | CLIENART | cliente_articulo_precio | cliente+artículo | 4926 → 4926 |

## Decisiones

### Stock (ARTICALM)

El stock del ERP lo mueve el trigger `fn_actualizar_stock_desde_movimiento`
desde `movimiento_stock`. Para que el saldo cuadre con el histórico de
movimientos, la carga **no** escribe `cantidad_actual` a mano: por cada
artículo/almacén calcula la diferencia entre `CANTIDAD` del DBF y el stock
actual del ERP y, si no es cero, inserta un movimiento `tipo_movimiento =
'inventario'`, `documento_origen_tipo = 'carga_geminiswin'` por esa diferencia
(entrada o salida). El trigger hace el resto.

- Repetir la carga no suma dos veces: si el stock ya es el del DBF, la
  diferencia es 0 y no se crea movimiento (2ª ejecución: 0 movimientos).
- Si cuando se refresque `carga_dbf` el stock real ha cambiado, se crea solo el
  ajuste por la diferencia, como haría un inventario.
- `CANTIDAD` se redondea a 3 decimales (la precisión de la columna); sin eso,
  una cantidad con más decimales dejaba una diferencia de milésimas imposible
  de saldar.
- `CANTINIC` y `FECHSTKINI` van tal cual a `cantidad_inicial` /
  `fecha_stock_inicial` (informativos, no mueven stock).
- Efecto secundario: la tabla `auditoria` registra cada movimiento (≈3400 filas
  en la primera carga).
- Rechazadas: 2 filas sin almacén y 1 con almacén `00` (no existe en ALMACEN).

### Precios

- Niveles 0..6 de ARTICULO → `articulo_precio_nivel`: `PVP_n` → `pvp`,
  `INC_PVPn` → `incremento_pct`, `PODn` → `modo_calculo` (P/D/N),
  `VERDTO_n = 'S'` → `permite_descuento_linea`. Se crea el nivel si hay
  cualquiera de los tres datos; un dato ausente es 0 (convención del volcado).
  `articulo.pvp` = `PVP_0`.
- Costes: `COSTE_PURO` → coste_puro, `COSTE_NETO` → coste_neto, `COSTE_BRUT` →
  coste_bruto, `PRECIO_LIQ` → precio_liquidado, `PM_COMPRA` →
  precio_medio_compra, `COST_LOCAL` → coste_local, `COSTEPVP_0` →
  coste_usado_calculo_pvp. `IGIC` ausente = 0 %.
- Plantillas (PLANTTAR): igual que los niveles del artículo, en
  `plantilla_tarifa_nivel`.
- Por proveedor (ARTDPROV): costes, impuestos `T_IMP1..3`, última compra,
  unidades pedidas/compradas, fecha prevista de entrega.
- Precios especiales cliente-artículo (CLIENART): `PVP`, `CANTIDAD` →
  cantidad_minima, `FECHA_FIN`. (`DESCRIP` es copia de la descripción del
  artículo: no se guarda.)

### Referencias a maestros ausentes

Nunca rompen la carga: se pone NULL y se cuenta en `referencias_a_null`.

| Dónde | Referencia | Filas | Comentario |
|---|---|---|---|
| ARTICULO | proveedor habitual | 68 (14 proveedores) | No están en PROVEEDO (proveedores borrados) |
| ARTBARRA | proveedor | 216 | Ídem |
| PROVEEDO | almacén (CODALMAC) | 2 | Almacenes que no están en ALMACEN |
| PROVEEDO | plantilla de tarifa | 1 | |
| TIPOCLIE | zona territorial | 16 | Códigos de zona antiguos |
| TIPOCLIE | vendedor | 1 | |
| CLIENTES | zona territorial | 1 | |
| VENDEDOR | tienda (OFICINA) | 1 | |

Maestros que sí se crean: **marcas**. La tabla `marca` solo tiene el nombre
(que es la clave), así que las 75 marcas que usan 360 artículos y no están en
MARCAS se crean con ese nombre; no se inventa nada.

Filas rechazadas (no se pueden guardar sin la clave o el maestro):

- FOMA: la forma de pago CONTADO de GeminisWin tiene el código vacío. El ERP
  tiene su propia `CON` de prueba; los 3 clientes sin `FORMA_P` quedan con la
  forma de pago a NULL.
- ARTBARRA: 5 sin código de barras; 8 con un código de barras repetido en otro
  artículo (el código es único en el ERP: se queda el del primer artículo).
- articulo_proveedor: 512 pares sin proveedor (`COD_PROV` vacío) y 805 pares de
  56 proveedores que no están en PROVEEDO.
- ARTICALM: 3 (ver Stock).

### ARTPROV y ARTDPROV

Las dos van a `articulo_proveedor` (una fila por artículo+proveedor): ARTDPROV
trae los costes y datos de compra; ARTPROV, los códigos de compra (puede haber
varios por pareja). `codigo_compra` = el de ARTDPROV o, si no hay, el primero
de ARTPROV. **2181 códigos de compra alternativos no tienen dónde guardarse**
(el ERP admite uno por proveedor). Si hacen falta para buscar artículos por
cualquiera de sus códigos de compra, habría que crear una tabla
`articulo_codigo_compra`.

### Países

En GeminisWin conviven dos códigos para España: el de PAISES (`724`) y el
`11` que llevan casi todas las fichas (con PAIS = «España», «España -
I.Canarias»…). El ERP usa el ISO2 (`ES`) como código de país, así que los dos
se traducen a `ES`. El texto `PAIS` no se usa: algunos proveedores extranjeros
(Alemania, Italia, Portugal) llevan el código de España en `CODPAIS` y quedan
como `ES`.

### Otras decisiones

- `activo` (cliente, proveedor, vendedor, transportista, artículo) = sin
  `F_BAJA` o con `F_BAJA` futura.
- Tiendas (OFICINA): el DBF no trae el tipo; se deduce de la descripción:
  `ESCAJCENTR` → caja_central; «tienda web» → tienda_web; «tableta…» →
  tableta; «tienda…» → tienda; el resto → oficina_interna. La empresa es la
  única que hay en `empresa`. La oficina central (`OFICENTRAL`) se enlaza en una
  segunda pasada.
- Las referencias de `forma_pago` a sí misma (`F_PAGOCOMB`, `F_PAGOVENC`) se
  enlazan en una segunda pasada.
- Los contadores de OFICINA (`NUMVENTA`, `NUMCAJA`, `NUM_N_FRA`, …) **no** se
  cargan: tocarían la numeración de documentos y VeriFactu. Se decidirá el día
  de la migración definitiva.
- `ULTMOD` no se copia: `actualizado_en` es la fecha de la carga.

## Campos sin mapear y dudas para Luis

Sin correspondencia clara (no se cargan, para no inventar):

- **ARTICULO**
  - `COSTTOCALC` (coste base para el PVP). Solo aparece vacío (= 0) o `4`, y la
    ficha del ERP usa 0 puro · 1 neto · 2 bruto · 3 líquido. Se deja el valor
    por defecto del ERP (3, líquido). En el artículo 149719 el PVP general
    (125 % sobre coste) cuadra con el coste líquido/bruto (4,00) y no con el
    puro (4,31). **¿Qué significan 0 y 4?**
    Comprobación sobre toda la muestra (artículos con `POD0` = P): el PVP general
    es `coste × (1 + INC_PVP0/100)` **sin IGIC**, y el coste que cuadra es
    `PM_COMPRA` (precio medio): 89 de 89 con `COSTTOCALC` = 4 y 1856 de 1900
    con `COSTTOCALC` vacío (el líquido solo cuadra en 1195). El selector del ERP
    (0..3) no tiene «precio medio», así que «Recalcular Pvps» en el ERP daría
    otros PVP en cientos de artículos: hay que añadir esa opción en la ficha.
  - Los 99 artículos con `COSTTOCALC` = 4 son casi todos de marca
    `SOBREPEDIDO` (92). Muchos vienen así de GeminisWin: sin coste puro (53),
    sin `PVP_0` (9), sin código de barras (98) o sin proveedor (9). Ejemplo:
    00003000087 solo trae `COSTE_NETO` y `PVP_1`. Lo cargado coincide con el
    DBF: no es un fallo de la carga.
  - `TIPPLANTAR` / `TIPOPLANTT` (de dónde sale la plantilla de tarifa): valores
    1..9 y la ficha solo prevé 0..3. **¿Qué significa cada valor?**
  - `TIPOIGIC`: siempre 2. La ficha usa 1 = soportado / otro = repercutido.
  - `TIPO_ART` (-1, 2), `GARANTIA` (-1), `TALLA`/`COLOR` (-1), `INC_PTAS`,
    `DIG_BARRAS`, `IMAGEN` (rutas de Windows locales), `FECPREVENT` del
    artículo (el ERP solo la tiene por proveedor).
  - `INC_PVP` / `POD_PVP` sin número: duplican el nivel 0.
- **Mapeados con duda** (confirmar):
  - `FOV` = 1 → PVP fijo, 2 → variable (casi todos son 2).
  - `MODDES` → «Genérico»; `NOCALCCTE` / `NOCALCPVP` → «no sumar costes / PVP»
    de la composición (934 artículos los tienen marcados).
  - TRANSPOR `TRANSPO410` → `cuenta_contable_400` del transportista (el ERP
    no tiene columna 410).
  - CLIENTES `WEBNOMBRE` → `web_usuario`; `WEBFNAME`/`WEBLNAME` → nombre y
    apellidos web; `WEBFEFNAME`/`WEBFELNAME` → los de facturación.
  - PROVEEDO `ESDEPENIN` → «proveedor dependiente»; `PENDIENTES` →
    pendiente_pago.
- **CLIENTES**: `CMP_LIBRE1`, `CMP_LIBRE2` (texto libre; ¿son «Ejerce desde» y
  «Horario» de la pestaña Obs.?), `FLAG`, `FORMAPAGO` (número 1..3, distinto
  de `FORMA_P`), `T_FORMA` (texto de la forma de pago).
- **TIPOCLIE**: `FORMAPAGO` (número).
- **PROVEEDO**: `FECHAULTIM`, `IMAGEN`.
- **OFICINA**: contadores (ver arriba), `DC_*` (documentos por defecto),
  `DIG_CTRL*`, `EML*` (configuración de correo SMTP: no se migra), `FP*RET`,
  `PVPACC1..6`, `UT_IL`, `VENDDELCLI`.
- **ALMACEN**: `QUEFECHA`. **REPARTIDOR / VENDEDOR**: `IMAGEN`.
- **_RESUMEN**: el DBF original tiene más filas que `carga_dbf` en ARTPROV
  (7619/7467), ARTBARRA (5032/5009), ARTDPROV (6111/6109) y CLIENART
  (5000/4926). Parecen claves repetidas en el DBF que el volcado juntó en una.
  **¿Son duplicados reales en GeminisWin?**

## Pantallas comprobadas con los datos reales

Artículo 149719 y otro, lista y búsqueda de artículos, cliente, lista de
clientes, proveedor y lista, Familias, Marcas, Plantillas, Tiendas, Almacenes,
Vendedores, Repartidores, Rutas, Zonas, Transportistas, Stock, TPV y Panel de
Control: cargan sin errores de consola ni de red.

Corregido en esta tarea: las fichas de maestros (`useFichaMaestro`: familias,
marcas…), la navegación de la ficha de artículos y Categorías web pedían la
lista entera en una sola consulta, y PostgREST corta en 1000 filas (había 1115
familias y 1170 marcas: «Registro 1 de 1000»). Ahora usan `selectTodo()`
(`src/lib/supabase.ts`), que pagina de 1000 en 1000.

Pendiente para cuando se cargue el catálogo completo: hay más consultas sin
paginar a tablas que crecerán (listas de clientes y proveedores en algunos
desplegables, artículos publicados en Categorías web…). Con decenas de miles
de artículos, la navegación anterior/siguiente de la ficha de artículos
debería consultar el vecino en la base en lugar de traerse todos los códigos.
