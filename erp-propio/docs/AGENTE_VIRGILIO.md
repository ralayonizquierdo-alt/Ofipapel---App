# Virgilio, el vigilante de la empresa

Rober, 23/11/2026: «no quiero tener un agente para cada cosa… que el vigilante se encargue de cuantas tareas pueda… que
otros empleados también puedan usarlo para vigilar otras cosas. Sería el vigilante de la empresa».

**Solo lee y avisa.** No cambia pedidos, peticiones, presupuestos ni nada de GeminisWin. Nunca manda correos.

## Cómo avisa

- **Globo rojo** con el número en la pantalla del asunto (p. ej. pestaña «Peticiones de clientes» del Gestor 2.0).
- **Tarea en «Mis tareas pendientes»** del ERP (globo 📌 y recuadro del Panel de Control) a quien le toca. Una tarea viva
  por vigilancia y persona; se actualiza sola y se cierra sola cuando el asunto queda resuelto.
- **NEXA**: «¿qué hay pendiente?» lo cuenta (con `fn_agentes_estado`).
- **Su ficha en el hub** (`inicio.html`): qué ha vigilado hoy y qué tiene pendiente, solo números.

Cada persona solo recibe avisos de lo que su permiso le deja ver.

## Funciones

| # | Vigila | Avisa a | Estado |
|---|---|---|---|
| 1 | Peticiones **resueltas** (la mercancía llegó) **sin imprimir** para el almacén, por proveedor (`fn_peticiones_resueltas_nuevas`) | Compras / almacén | **Activada** |
| 2 | Presupuestos **enviados o en seguimiento sin movimiento en 7 días** (sin contacto, correo, aceptación ni pérdida), o con el **próximo contacto pasado**. Solo los hechos en el ERP. Los 7 días, en un parámetro | El comercial del presupuesto | No activada |
| 3 | **Estado del sistema**: espejo de GeminisWin, puente, Whacimara (bot de WhatsApp), E-milio y cartero; si alguno se para, aviso | Rober | **Activada** |
| 4 | **Pedidos a proveedor retrasados** (ya deberían haber llegado según los días de entrega) | Compras | Próximamente |
| 5 | **Correo de proveedores**: facturas con diferencias y documentos sin revisar de E-milio | Compras | Próximamente |
| 6 | **Clientes que pasan su límite de riesgo** | Administración y comercial | No activada |
| 7 | **Recibos vencidos sin cobrar** | Administración | No activada |
| 8 | **Cuadre ERP–GeminisWin** de ventas y cobros (diferencias de totales) | Rober | Próximamente |
| 9 | **Vigilancias personales**: cualquier empleado se las pide a NEXA con sus palabras («avísame cuando llegue el pedido de Apli», «cuando el artículo X tenga stock», «si el cliente Y hace un pedido») | Quien la pide | Próximamente |

Encender o apagar una función: parámetro `vigilante.desactivadas` (lista de claves: resueltas, presupuestos, sistema,
retrasados, correo, riesgo, recibos, cuadre, personales). Rober, 23/11/2026: 2, 6 y 7 «no activadas».

## Estado

- 23/11/2026: dado de alta en la tabla `agente` (código `vigilante`) con estas funciones.
- 23/11/2026: **fase 1 en marcha** (`20261123_virgilio_fase1.sql`). pg_cron `erp_vigilante` cada 10 minutos llama a
  `fn_virgilio_pasada()`, que mantiene una tarea por vigilancia y persona en «Mis tareas pendientes» (tabla `incidencia`,
  enlazada en `vigilancia_aviso`) y la da por resuelta sola. Parámetros (Archivo → Parámetros):
  `vigilante.resueltas_para`, `vigilante.presupuestos_dias`, `vigilante.presupuestos_sin_comercial`,
  `vigilante.sistema_para` (nombres como en «Le toca a…», varios con « / »). Los presupuestos de prueba (tienda 01,
  clientes ZZ) no cuentan. Whacimara no se puede mirar desde la base de datos (otro servidor): fase 2.
- Ficha en el hub: `fn_agente_resumen_publico('vigilante')` (`20261123_virgilio_resumen_publico.sql`).
- NEXA: «pasar_ahora» queda en la cola y se hace en la siguiente pasada (como mucho 10 minutos); «pausar»/«reanudar», al
  momento.
