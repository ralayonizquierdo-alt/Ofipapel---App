# Plan: el ERP como espejo vivo de GeminisWin

Rober, 17/11/2026. Borrador para decidir. No hay nada construido de este plan todavía.

**La idea.** Para que el cambio de GeminisWin al ERP sea seguro, los dos conviven un tiempo: GeminisWin
sigue mandando y el ERP recibe, cada pocos minutos, todo lo que pasa en él. Después se van pasando al ERP
las piezas una a una, de la menos arriesgada a la más.

**Las tres reglas.**
1. **En GeminisWin no se escribe.** Solo se lee, como hace hoy el puente del reparto. Lo que GeminisWin
   necesite recibir entra por su propia pantalla de importar o a mano.
2. **Cada dato tiene un solo dueño en cada momento.** Mientras el dueño sea GeminisWin, en el ERP ese dato
   se ve pero no se cambia.
3. **Nada se da por bueno sin comparar.** Cada tanda termina con una comprobación automática de que el ERP
   dice lo mismo que GeminisWin.

---

## 1. De dónde partimos

- **El puente del reparto** ya hace esto en pequeño: lee cuatro ficheros de GeminisWin cada 5 minutos y los
  manda al ERP. Lleva días funcionando.
- **La carga de GeminisWin** (`CARGA_GEMINISWIN.md`): ya hay funciones que pasan cada fichero de GeminisWin
  a su tabla del ERP (artículos, clientes, proveedores, familias, tarifas…). Se hicieron con una muestra
  del 27/10/2026 y se pueden repetir sin duplicar nada. El espejo las aprovecha: lo que cambia es que los
  datos llegan solos y completos, en vez de una vez y a mano.
- **Lo que hay cargado hoy es una muestra**, no todo: unos 2.000 artículos, 600 clientes, 500 proveedores
  y el histórico mensual de ventas.

## 2. Lo que hace falta antes de empezar

| Qué | Por qué | Quién |
|---|---|---|
| Plan de pago de la base de datos | El espejo completo no cabe en el gratuito (500 MB, 285 ocupados) | Rober |
| Un ordenador siempre encendido en la oficina | Hoy el puente corre en el PC de Mónica y solo con su sesión abierta | Rober |
| Saber cuántos datos hay de verdad | Para dimensionar: cuántos artículos, clientes y ventas por año | Cowork, una vez |

El ordenador del puente no puede ser el servidor de GeminisWin (no se instala nada en él). Sirve cualquier
PC de la oficina que no se apague, con acceso de lectura a la carpeta de GeminisWin.

## 3. Cómo funciona el espejo

- Un programa en ese PC lee los ficheros de GeminisWin, solo lectura.
- GeminisWin no avisa de qué ha cambiado, así que el programa lo deduce: guarda una huella de cada
  registro y manda al ERP solo los que son nuevos o han cambiado.
- Dos ritmos: **cada pocos minutos** lo que se mueve durante el día (ventas, cobros, stock) y **una vez
  cada noche** un repaso completo, que además detecta lo que se haya borrado.
- En el ERP, lo que viene de GeminisWin va marcado y bloqueado para edición.
- Una pantalla de control dice cuándo fue la última lectura de cada fichero y si algo no cuadra. Si el
  puente lleva un rato sin leer, avisa.

### Lo construido (17/11/2026)
- **Plan de pago contratado** y decidido el equipo: se arranca en el PC de Mónica, junto al puente de reparto.
- **En el servidor** (`20261117_espejo_geminiswin.sql` y la función `espejo-gw-ingesta`): recibe por lotes las
  filas que han cambiado, las guarda en `carga_dbf` y las pasa a las tablas del ERP con las `fn_carga_gw_*`
  de siempre. Usa la misma clave del puente de reparto. Cada pasada queda anotada en `espejo_gw_pasada`.
- **El programa** (`scripts/geminiswin/espejo_geminiswin.py`): lee los 24 ficheros de maestros con todos sus
  campos; si un fichero no ha cambiado de tamaño ni de fecha, no lo lee; guarda una huella de cada registro
  y manda solo lo nuevo o cambiado; si el ERP falla al cargar, lo reintenta en la pasada siguiente.
- **Probado** con ficheros inventados y un servidor falso (tipos de campo, textos largos, acentos, registros
  borrados, reintentos) y la entrada del servidor contra la base real (clave, tabla no admitida, lote vacío).
  **Sin probar contra los ficheros reales de GeminisWin.**
- **Falta**: la primera medida en el PC de Mónica (`--medir`, que no envía nada) para confirmar nombres de
  fichero y campos; detectar lo que GeminisWin borra; la pantalla de control; las tandas 2 a 5.

### La medida real (17/11/2026, PC de Mónica)
`--ping` y `--medir` funcionaron: 22 de 24 ficheros encontrados, todos con sus campos de clave. Dos se
llamaban distinto (`provincias.dbf`, `repartidor.dbf`), ya corregido.

| Fichero | Registros |
|---|---|
| ARTICALM (stock por almacén) | 381.022 |
| ARTPROV (referencias de proveedor) | 243.196 |
| ARTDPROV (datos de compra por proveedor) | 200.825 |
| ARTBARRA (códigos de barras) | 185.014 |
| ARTICULO | 142.670 |
| CLIENTES | 13.609 |
| CLIENART (precios especiales cliente-artículo) | 6.587.281 |

Consecuencias, ya hechas:
- **Cargar solo lo que cambia** (`20261117_espejo_incremental.sql`): las cargas de las tablas grandes leen
  solo las filas llegadas desde la última vez. Medido con la muestra: 9 s por cada 2.000 artículos la
  primera vez; 0,2 s cuando no hay cambios.
- **El programa envía según lee** y pide la carga cada 4.000 registros: ni llena la memoria del PC ni hay
  cargas largas. Si se corta, sigue donde se quedó.
- **CLIENART queda fuera** por ahora: 6,5 millones de registros (881 MB). Habrá que traer solo los precios
  vigentes.
- **Pendiente de vigilar:** cada cambio de stock en GeminisWin entra en el ERP como un movimiento de ajuste.
  Con el stock actualizándose cada pocos minutos serán muchos movimientos al año; se revisa en la tanda 3.

### Áreas de solo consulta (`20261117_areas_solo_consulta.sql`)
Mientras GeminisWin sea el dueño de un área, en el ERP se consulta pero no se cambia: lo rechaza la base de
datos y la ficha lo avisa y apaga Nuevo, Modificar y Eliminar. Áreas: artículos, clientes, proveedores y
stock (ventas, cobros y caja, con la tanda 2). Siguen editables los campos propios del ERP: stock mínimo y
máximo del artículo, pedido mínimo y días de entrega del proveedor; la carga ya no los pisa si el ERP tiene
valor. **Empiezan abiertas** y se cierran al terminar la primera carga; después se irán abriendo una a una
(`fn_area_poner`), con su fecha.

## 4. Las tandas

Cada tanda se puede usar en cuanto termina; no hay que esperar a la siguiente.

### Tanda 1 — Maestros
Artículos, familias, marcas, tarifas y precios, clientes, proveedores, vendedores, formas de pago,
tiendas y almacenes.
- **Sirve para:** que el ERP tenga los mismos artículos y clientes que GeminisWin, siempre al día.
- **Comprobación:** mismo número de artículos, clientes y proveedores; precios iguales en una muestra amplia.

### Tanda 2 — Ventas y cobros
Ventas, líneas de venta, facturas, cobros de clientes y movimientos de caja. Primero el año en curso;
los anteriores, de noche y poco a poco.
- **Sirve para:** los listados y el análisis de gerencia desde el ERP. **Es el primer uso real.**
- **Comprobación:** ventas del día por tienda y cierre de caja, iguales a los de GeminisWin, cada noche.

### Tanda 3 — Stock y compras
Existencias por almacén, movimientos, pedidos a proveedor, entradas y facturas de proveedor.
- **Sirve para:** ver el stock real en el ERP y preparar las compras desde él.
- **Comprobación:** stock de todos los artículos, igual al de GeminisWin, cada noche.

### Tanda 4 — Contabilidad
Los asientos de ventas, compras, cobros y pagos los genera el ERP a partir de las tandas 2 y 3, sin que
Mónica traspase nada. Ver `PLAN_CONTANET.md`, fase 8.
- **Comprobación:** un trimestre con los mismos totales que CONTANET.

### Tanda 5 — Lo que quede
Reparto (ya hecho), roturas, presupuestos y pedidos de clientes, y lo que aparezca al comparar.

## 5. Qué pasa al ERP y en qué orden

| Orden | Qué se empieza a hacer en el ERP | Necesita | ¿Hay que devolver algo a GeminisWin? |
|---|---|---|---|
| 1 | Listados y análisis de gerencia | Tandas 1 y 2 | No |
| 2 | Contabilidad | Tanda 4 | No |
| 3 | Preparar y enviar pedidos a proveedor | Tanda 3 | Sí: la entrada de mercancía, por su pantalla de importar |
| 4 | Ventas, TPV, stock, clientes y artículos | Todo | Es el cambio final |

El paso 4 va todo junto y de una vez, en un fin de semana: una venta baja stock y usa cliente y artículo,
así que no se puede partir. Ese día el dueño de todo pasa a ser el ERP y el puente se apaga.

### Las compras mientras conviven (Rober, 17/11/2026)
Decidir y preparar en el ERP; recibir y liquidar en GeminisWin. Se teclea una sola vez.

| Paso | Dónde |
|---|---|
| 1. Qué hay que pedir: lo propone el Gestor de Pedidos a Proveedores (`COMPRAS_NEXA.md`) y lo revisa Rober | ERP |
| 2. Enviar la propuesta al proveedor, comparar con su respuesta y aceptar | ERP |
| 3. Pasar el pedido aceptado a GeminisWin: el ERP genera el Excel y se importa allí | Excel → GeminisWin |
| 4. Liquidar el pedido | GeminisWin, administración |
| 5. Con la liquidación, almacén coloca, etiqueta y sube a la venta | GeminisWin, almacén |
| 6. El ERP se entera de lo recibido | Solo, por el espejo |

Confirmado por Rober: en GeminisWin lo importado **entra como pedido** y se liquida después en
administración. La importación por Excel que hoy se usa para informática (UFP, EXADI, INFORPOR) se puede
adaptar a cualquier proveedor. El formato del Excel ya está en este repositorio: lo genera `importacion-pedidos-proveedores.html`
(función `generarExcel`), que hoy convierte la factura PDF de un proveedor en ese mismo fichero.
- Excel 5.0/95 de verdad (`.xls`, BIFF5), una hoja llamada «fichero», sin tildes ni Ñ.
- Filas 1 a 11: cabecera en celdas fijas (Almacén, Proveedor, N.º Pedido, Fecha) y el recordatorio de familias.
- Fila 12: títulos. Desde la 13, una línea por artículo: Código ISBN/EAN · Marca/Editorial · Rfcia.
  Proveedor · Descripción · Caja · Ud./Caja · Udes · Precio U. · Dcto · Igic · Importe · (vacía) · Cód. Familia.
- Al final, la fila del TOTAL. Un solo descuento por línea: si hay varios encadenados, se funden en uno.
El ERP sacará ese mismo fichero desde el pedido aceptado. Sin probar todavía contra GeminisWin.

**Cómo quiere comprar Rober (17/11/2026).** Hoy: saca las ventas de un proveedor desde su último pedido.
Lo ideal: que el ERP proponga **cada semana** los pedidos de todos los proveedores a partir del stock
mínimo y máximo de cada artículo, y él decida con cada uno si lo envía ya o aguanta.
- Ya existe, como funciones que hoy solo usa NEXA: cálculo de mínimos y máximos desde el histórico
  (`fn_compras_calcular_minimos`), propuesta por proveedor de lo que está en el mínimo o por debajo, con la
  cantidad que lo lleva al máximo (`fn_compras_propuesta_pedidos`), y su método de siempre
  (`fn_compras_gestor_proveedor`).
- Falta: una pantalla semanal que junte las propuestas de todos los proveedores, con «enviar» y «aguantar»;
  el pedido mínimo y los portes de cada proveedor, para saber si compensa enviarlo ya; y los datos reales
  del espejo. Sin el stock de cada día, los mínimos y máximos no sirven.

**Campañas (vuelta al cole, Navidad).** Rober no usa mínimos y máximos: mira lo que vendió el año pasado
en esas fechas y pide eso y un poco más. El ERP hará lo mismo como «pedido de campaña», aparte de la
propuesta semanal: ventas de la misma campaña del año anterior por artículo, corregidas por lo que sobró,
por lo que se agotó antes de tiempo y por cómo va el año, con el «poco más» como un porcentaje que pone él.
Antes de calcular nada hay que hacer el estudio con el histórico (tres años de ventas mensuales ya
cargados) y una prueba hacia atrás: calcular con datos hasta 2025 y ver qué habría pasado en 2026.

**Tarifas de proveedores (Rober, 17/11/2026).** Subir al ERP la tarifa de cada proveedor para que diga, en
los artículos punteros que venden varios, quién sale más barato. El emparejamiento NO es por código de
barras: es el mismo producto de fabricantes distintos, así que cada uno tiene su EAN. Se empareja por la
**referencia de compra de cada proveedor**, que ya está en la ficha del artículo (recuadro de referencias:
un artículo, varios proveedores, cada uno con su referencia). Se compara el precio neto: tarifa menos descuentos, por unidad y no por caja, con los portes
y el pedido mínimo a la vista. El ERP ya guarda varios proveedores por artículo (`articulo_proveedor`);
falta la subida de tarifas desde Excel, con su fecha de validez, y enseñar la comparación en la propuesta
semanal. Sin construir.

Arranque con un piloto: un proveedor, unas semanas comparando la propuesta del ERP con el método de
siempre sin enviar nada, y después pedir de verdad. Necesita las tandas 1 a 3.

## 6. Por qué es más seguro

- **Se ensaya con datos reales** durante semanas, comparando los dos programas cada noche.
- **Hay marcha atrás** hasta el último paso: GeminisWin sigue entero.
- **El personal aprende** mirando en el ERP sus datos de verdad antes de trabajar con él.
- **El día del cambio no hay migración de última hora:** los datos ya están.

## 7. Riesgos

- **Leer mientras GeminisWin escribe.** Es lo que ya hace el puente del reparto sin problemas, pero con
  ficheros grandes hay que comprobar que no molesta a quien trabaja. Se prueba primero de noche.
- **Datos que GeminisWin borra o renumera.** Por eso existe el repaso nocturno completo.
- **Tamaño.** Varios años de ventas con sus líneas son muchos datos; se sabrá al medir (punto 2).
- **Dos dueños a la vez.** Es el error que estropea este tipo de cambios. Cada paso del punto 5 se anota
  con su fecha: desde ese día, eso se hace solo en el ERP.
- **Datos personales.** El espejo trae clientes con nombre, NIF y teléfono. Nada de eso va al repositorio,
  y la clave del puente vive solo en el PC del puente, como ahora.

## 8. Decisiones de Rober

1. El plan de pago de la base de datos.
2. Qué ordenador hará de puente.
3. Si se empieza ya por las tandas 1 y 2, o después de la prueba de contabilidad con Mónica.

## 9. Diario de la puesta en marcha

**17/11/2026 — tanda 1, PC de Mónica.**

- Las 18 tablas pequeñas están cargadas, clientes incluidos (13.607 fichas).
- **Fallo encontrado y corregido:** la primera tabla mediana se cargaba de una vez, pasaba del minuto y la
  conexión se cortaba (error 520) sin dejar nada. Ahora el ERP carga **por tandas de unos 5.000 registros**
  y avisa si queda más; el programa del PC repite hasta acabar. Medido: 11 segundos por tanda de clientes,
  unos 14 por tanda de artículos, 1 a 3 las de stock, códigos de barras y proveedores.
- **Las copias del espejo no se apuntan en la Auditoría:** no son cambios de una persona en el ERP, y con
  1,5 millones de registros la habrían llenado de ruido.
- **Pantalla de control:** Archivo → Espejo de GeminisWin (solo super administradores). Enseña, fichero por
  fichero, qué ha llegado, qué falta por pasar al ERP, cuándo llegó algo por última vez y el último fallo;
  y desde ahí se abren y cierran las áreas de solo consulta.
- Pendiente: las cinco tablas grandes (fuera de horario), comprobar totales, cerrar las áreas en solo
  consulta y dejar la tarea automática cada 10 minutos.

## 10. Pendiente para después de la primera carga

- **Adelgazar la copia de GeminisWin (`carga_dbf`)** (Rober, 18/11/2026: «para más adelante»). Hoy guarda cada
  registro entero (577 MB de los 1.085 MB de la base de datos, el 18/11). Para saber qué ha cambiado basta con una
  huella de cada registro; el registro entero solo hace falta mientras se pasa a la tabla del ERP. Guardando solo la
  huella (y borrando el contenido una vez cargado) bajaría a unos 50 MB. No es urgente: el plan Pro incluye 8 GB.
- Limpieza automática del historial (`espejo_gw_pasada`, `reparto_gw_pasada`) de más de 30 días: ocupa poco
  (unos 2 MB al mes con el espejo cada 10 minutos); se hará junto con lo anterior.
