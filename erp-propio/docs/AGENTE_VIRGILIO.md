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

| # | Vigila | Avisa a | Fase |
|---|---|---|---|
| 1 | Peticiones **resueltas** (la mercancía llegó) **sin imprimir** para el almacén, por proveedor (`fn_peticiones_resueltas_nuevas`) | Compras / almacén | 1 |
| 2 | Presupuestos **enviados o en seguimiento sin movimiento en 7 días** (sin contacto, correo, aceptación ni pérdida), o con el **próximo contacto pasado**. Solo los hechos en el ERP. Los 7 días, en un parámetro | El comercial del presupuesto | 1 |
| 3 | **Estado del sistema**: espejo de GeminisWin, puente, Wasimara (bot de WhatsApp), E-milio y cartero; si alguno se para, aviso | Rober | 1 |
| 4 | **Pedidos a proveedor retrasados** (ya deberían haber llegado según los días de entrega) | Compras | 2 |
| 5 | **Correo de proveedores**: facturas con diferencias y documentos sin revisar de E-milio | Compras | 2 |
| 6 | **Clientes que pasan su límite de riesgo** | Administración y comercial | 2 |
| 7 | **Recibos vencidos sin cobrar** | Administración | 2 |
| 8 | **Cuadre ERP–GeminisWin** de ventas y cobros (diferencias de totales) | Rober | 2 |
| 9 | **Vigilancias personales**: cualquier empleado se las pide a NEXA con sus palabras («avísame cuando llegue el pedido de Apli», «cuando el artículo X tenga stock», «si el cliente Y hace un pedido») | Quien la pide | 3 |

## Estado

- 23/11/2026: dado de alta en la tabla `agente` (código `vigilante`), **apagado**, con estas funciones. Pendiente de
  montar la fase 1.
