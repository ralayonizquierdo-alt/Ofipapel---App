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
