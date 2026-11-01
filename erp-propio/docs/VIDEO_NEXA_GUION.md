# Guion del vídeo: «NEXA, el cerebro del ERP»

**Para:** Rober (que lo graba) y Luis (que lo ve para entender el nuevo enfoque).
**Duración:** unos 10-12 minutos. **Tono:** cercano, sin tecnicismos, con ejemplos reales de la tienda.
**Idea central:** hoy las personas pierden el día *buscando, tecleando y revisando línea por línea*. Con NEXA, la persona
*decide y aprueba*; NEXA busca, prepara y propone. La persona nunca deja de mandar.

> **Cómo leer este guion.** Cada capítulo tiene **HOY** (cómo se trabaja ahora), **CON NEXA** (cómo sería) y una marca:
> ✅ **YA FUNCIONA** (construido y probado, aunque con datos de prueba) · 🟡 **PARCIAL** (hay una parte hecha) ·
> 🔵 **PROPUESTA** (aún no está construido; es una idea para decidir entre todos). En pantalla conviene poner esa marca,
> para que nadie crea que algo existe si todavía no.

---

## 0. Apertura (30 s)

**En pantalla:** el ERP, una persona tecleando, relojes, papeles.
**Locución:**
«Todos los días hacemos lo mismo: buscamos un listado, revisamos línea por línea, facturamos corriendo al mediodía,
preparamos los repartos a mano. Es trabajo que sabemos hacer… pero que no necesita que lo haga una persona.
Esto es lo que cambia si el ERP tiene un cerebro: NEXA.»

## 1. Qué es NEXA y cómo se le habla (1 min) ✅

**En pantalla:** el panel de NEXA; se escribe una frase normal.
**Locución:**
«NEXA es el asistente del ERP. No es un menú más: se le habla como a un compañero. Ve los mismos datos que tú, en tiempo
real, y trabaja *con tus permisos*: lo que tú no puedes hacer, NEXA tampoco. No se salta nunca el sistema de permisos.»
**Ejemplos para enseñar:** «¿qué clientes han bajado sus compras este año?» · «saca las ventas de octubre por vendedor».

## 2. Control: NEXA propone, tú decides (1 min) ✅

**En pantalla:** la tarjeta de propuesta (antes → después), la palabra de confirmación, la contraseña.
**Locución:**
«Si NEXA solo consulta, te contesta. Si va a *cambiar* algo, primero te enseña qué cambiaría y espera. Hay cinco niveles:
una consulta no pide nada; un cambio pequeño pide un "sí"; uno mayor pide una palabra de confirmación y un motivo; y lo
crítico, como anular una factura de VeriFactu, además pide tu contraseña. Todo lo que hace NEXA queda apuntado en la
auditoría, con quién, cuándo y por qué.»

## 3. Listados: pídelos, no los busques (1 min) ✅

**HOY:** hay que saber en qué menú está cada listado; existen decenas de listados fijos; si hace falta uno distinto, se
pide que lo hagan.
**CON NEXA:** «sácame las peticiones resueltas por proveedor» → aparece la tabla, con Excel, PDF e imprimir, y se puede
guardar para usarlo otra vez. Cualquier combinación de datos, sin esperar a nadie.
**Idea clave:** no hacen falta 50 informes: hace falta *pedirlos a demanda*.

## 4. Compras (3-4 min) — el capítulo principal

### HOY (cómo compra Rober)
1. Entra en Compras → Gestor de Pedidos a Proveedores.
2. Saca el listado de **ventas desde la última compra** a ese proveedor: artículos vendidos, cantidad y stock actual.
3. Revisa **línea por línea** si con el stock que tiene y lo vendido aguanta hasta el siguiente pedido, o hay que pedir.
4. Suma lo que está **pendiente de clientes** (peticiones) y quita los artículos pedidos expresamente para un cliente
   (códigos `00003…`).
5. Pasa la propuesta al proveedor, que la devuelve **valorada**.
6. En una **aplicación externa** concilia su propuesta con la del proveedor (faltan, sobran, cambian precios) y, validada,
   da el OK.

### CON NEXA — pedido a un proveedor ✅ (probado con datos de prueba)
Una sola orden: **«prepara el pedido de ESSELTE».**
- NEXA hace la misma cuenta que Rober, pero con todas las líneas a la vez: ventas desde la última compra + lo que ya
  viene en pedidos pendientes + lo comprometido a clientes (pedidos y peticiones).
- **Cuenta el plazo de entrega** del proveedor: unos 20 días hasta Canarias, 7 los de informática y consumibles, 3 los locales.
- Deja fuera los artículos `00003…` y a los proveedores locales (esos se piden cada semana, a demanda).
- Marca cada línea: **pedir**, **no pedir** o **dudosa**, *con el motivo* («hay stock de sobra», «llega justo»,
  «venta aislada», «stock negativo»…). Rober solo mira las dudosas.
- Crea el **borrador** del pedido (estado *pendiente*), con precios, descuentos, IGIC y totales, **sin confirmarlo**.
  Rober lo edita y lo manda al proveedor como propuesta.

### CON NEXA — peticiones de clientes ✅
- Mientras el pedido está pendiente, las peticiones siguen **pendientes**.
- Cuando el pedido se **acepta** (ya comparado con el proveedor), pasan solas a **tramitada**.
- Cuando se **recibe y se liquida**, pasan solas a **resuelta**, listas para avisar y facturar.
- Antes se daban por tramitadas al *generar* el pedido, aunque luego no hubiera stock: ya no.
- Listado listo para imprimir: **«Peticiones resueltas por proveedor»** (proveedor, cliente, nº de pedido, cantidad).

### CON NEXA — stocks mínimos y máximos 🟡
Hoy casi ningún artículo los tiene marcados. NEXA los calcula con el histórico: lo que se vende al día × lo que tarda el
proveedor + un margen de seguridad. Te lo enseña por familias y **tú apruebas por bloques**.
*Falta cargar al ERP el histórico de ventas de GeminisWin (al menos un año, por la temporada de vuelta al cole).*

### Lo que viene después 🔵
- **Comparar la propuesta valorada del proveedor** con la nuestra (lo que hoy hace la aplicación externa): lo que falta,
  lo que sobra y los precios que cambian. *Necesitamos un ejemplo de las dos propuestas.*
- **Pedidos de informática por subasta semanal** (EXADI, INFORPOR, UFP): hoy ya están automatizados en el GeminisWin
  actual; se verá más adelante, con las reglas de adjudicación de Rober.

## 5. Facturación (1-2 min) 🔵 PROPUESTA

**HOY:** una o dos personas facturan **todos los pedidos al mediodía, corriendo**, uno a uno.
**CON NEXA (idea):** «factura los pedidos entregados de hoy».
- NEXA reúne todo lo facturable, lo agrupa por cliente y **genera las facturas de una vez**.
- Separa las **excepciones** (cliente bloqueado, precio raro, falta algo) y solo esas pasan por una persona.
- Antes de emitir, enseña el resumen: nº de facturas, importe total y avisos.
- Las facturas con VeriFactu se tratan como **nivel crítico**: confirmación explícita.
**Ventaja:** se acaba la carrera del mediodía; la persona revisa excepciones en vez de teclear todo.
*Ya existe la pantalla «Generar Facturas» del ERP: NEXA la manejaría. Hay que definir las reglas de qué se factura y cuándo.*

## 6. Repartos (1-2 min) 🔵 PROPUESTA

**HOY:** los repartos se organizan **muy a mano**.
**CON NEXA (idea):** «prepara el reparto de mañana».
- Con los pedidos pendientes de entrega, NEXA los agrupa por **ruta y zona**, propone el **repartidor** y el orden, y
  avisa de lo que no cabe o no está listo.
- El responsable ajusta lo que quiera con un clic; NEXA lo deja listo y lo imprime.
*El ERP ya tiene rutas, zonas, repartidores y repartos; falta decidir las reglas (capacidad, días, prioridades).*

## 7. Contabilidad y control (30 s) 🟡

«Los asientos ya salen solos de las ventas, compras, cobros y pagos. NEXA puede señalar lo raro y proponer el cuadre del
banco. La contabilidad sigue su plan propio y **siempre con revisión de una persona**.»

## 8. Qué cambia para las personas (1 min)

**Locución:**
«Esto no es quitar trabajo por quitarlo. Es que el tiempo que hoy se va en teclear y revisar se dedique a lo que
una máquina no hace: atender al cliente, vender, decidir. La persona deja de ser la que *hace* el proceso y pasa a ser
la que lo *supervisa y decide*. Algunas tareas cambiarán de manos, y por eso conviene hacerlo **por pasos y hablándolo
con el equipo**.»

## 9. Cómo lo haríamos, paso a paso (1 min)

1. Primero, que el ERP sustituya a GeminisWin y funcione bien.
2. Medir en qué se va el tiempo en cada puesto.
3. Automatizar con NEXA **tarea a tarea**, empezando por lo que más se repite (compras, facturación, repartos).
4. Siempre con el ERP funcionando también **a mano**, por si NEXA o internet fallan.

## 10. Cierre (20 s)

«Un ERP que no solo guarda datos, sino que *trabaja con nosotros*. NEXA prepara, tú decides.»

---

## Notas para Luis (no van en el vídeo)

- **Ya hecho y publicado/probado:** NEXA con control total y niveles 1-5 (`docs/PROYECTO_ERP.md` §11, `SEGURIDAD_BD.md` §9);
  compras con NEXA (`docs/COMPRAS_NEXA.md`); flujo de estados de las peticiones; listado PET-0001; auditoría de todo lo
  que hace NEXA (también stock y VeriFactu).
- **Regla del proyecto:** toda función o tabla nueva que NEXA deba poder usar se da de alta en `nexa_operacion` con su nivel
  y su «receta».
- **Decisiones que faltan** (Rober): reglas de facturación masiva; reglas de repartos; reglas de la subasta de informática;
  ejemplo de propuesta valorada de un proveedor; histórico de ventas de GeminisWin (lo tiene pedido el Cowork).
- **Contabilidad:** Luis ya está en ello; Rober tiene un plan específico, a coordinar.
- Todo lo del vídeo marcado 🔵 es **una propuesta**, no algo ya construido.
