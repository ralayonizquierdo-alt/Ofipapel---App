# Puente de reparto GeminisWin → app de repartidores (TEMPORAL)

Rober, 13/11/2026 (tarea 35). Mientras se siga trabajando con GeminisWin, los repartidores usan ya
la app de móvil (`/repartidor`). Se empieza con **una sola ruta**, supervisada.

## Parte A — de GeminisWin a la app (hecha)

| Pieza | Dónde | Qué hace |
|---|---|---|
| Programa lector | `scripts/geminiswin/puente_reparto.py` | En el PC de Mónica (Windows 10; no en el de Rober ni en el servidor de GeminisWin), con Python instalado para ello y como tarea de su usuario con la sesión iniciada, cada 5 min de 8:00 a 19:00 (el reparto nuevo se genera por la tarde, al cerrar el del día): lee SOLO LECTURA `REPARTOS`, `REPARLIN`, `VENTAS` y `FACTURAS` de `\\SERVER-OFIPAPEL\GEMINISW\GW002024` (ruta de red, no la letra G:) y manda los repartos «Generado» de las rutas elegidas. Solo biblioteca estándar de Python |
| Entrada del servidor | función `reparto-gw-ingesta` (sin JWT, con clave propia en la cabecera `x-puente-clave`) | `ping` (clave + rutas), ingesta y `partes` |
| Base de datos | `supabase/migrations/20261114_reparto_puente_geminiswin.sql` | `reparto.origen` (`erp` / `geminiswin`), `reparto_gw_venta`, `reparto_gw_pasada`, `fn_reparto_gw_entrada` → `fn_reparto_gw_ingesta`, guardas, `fn_reparto_gw_partes` |

- **Qué rutas entran**: parámetro `reparto.puente_gw_rutas` (por ejemplo `["01"]`). Vacío = el puente no trae nada. El programa lo pregunta en cada pasada, así que se cambia solo en el ERP.
- **Quién lleva cada ruta**: el repartidor de un reparto abierto de GeminisWin no es de fiar (lo cambian al cerrar), así que los repartos entran **sin repartidor** y cada uno coge su ruta en la app; puede soltarla con «No es mi ruta» antes de empezar a marcar (`fn_app_rep_soltar`). El repartidor de GeminisWin solo se toma cuando el reparto ya llega cerrado.
- **Repartos que no se quieren en la app**: parámetro `reparto.puente_gw_ignorar` (por ejemplo `["52-48281"]`). El puente los salta aunque sigan abiertos en GeminisWin; al quitarlos de la lista vuelven solos.
- **Clave del puente**: en la base de datos solo está su huella sha-256 (`reparto_privado.puente_gw`). La clave en claro vive en `puente_reparto.clave`, junto al programa, en el PC. No va en el repositorio. Para cambiarla: fichero nuevo + `update reparto_privado.puente_gw set clave_sha256 = …`.
- **Estados** (LEEME de Cowork del 13/11): línea 2 → pendiente; 3 u `OLDVTAREP` 7 → viene de anterior (sale la primera); 4 y 5 → entregado; 7 → no entregado; 1, 6, 8 y 10 no se llevan a la app. Reparto 2 = abierto, 4 = cerrado.
- **Fecha**: `REPARTOS.FECHA` es el día en que se genera; el reparto se hace al día siguiente, y el del viernes queda para el lunes (confirmado por Rober, 13/11/2026). Se ajusta en `puente_reparto.json` (`fecha_mas_dias`, `salta_fin_de_semana`).
- **Lo que marca el repartidor no se pisa**: la ingesta solo cambia el estado de una línea si en GeminisWin ya está resuelta (entregado / no entregado) y en la app seguía pendiente. Una línea que desaparece de GeminisWin se quita de la app solo si nadie la tocó.
- **Cliente, importe, pagado, forma de pago y factura** salen de `reparto_gw_venta` (las ventas de GeminisWin no están en la tabla `venta`). `fn_app_rep_lineas` devuelve además `contado` y `forma_pago`.
- **Guardas**: un reparto de origen `geminiswin` no se puede cerrar, ni añadirle o cambiarle pedidos de ruta, desde el ERP ni desde la app: eso se hace en GeminisWin y llega por el puente.
- **Vigilancia**: `select * from reparto_gw_pasada order by id desc limit 20;` (una fila por pasada) y `puente_reparto.log` en el PC.

Probado con ficheros DBF inventados (estructura del LEEME) y un servidor de pega: filtro por ruta y fecha, registros borrados y a medias, ventas con el mismo número en otra oficina, venta antigua, cierre del reparto y partes. **Falta la prueba con los ficheros reales** (`--prueba`, que no envía nada).

## Pasar un pedido a otro repartidor
Un repartidor ofrece un pedido suyo sin entregar a otra ruta abierta («🔀 Pasar a otro»); al otro le sale
el aviso y lo acepta o lo rechaza (tabla `reparto_traspaso`, migración
`20261116_reparto_traspaso_entre_repartidores.sql`). El pedido **no cambia de reparto**: sigue en el de
origen —así el puente no lo deshace y GeminisWin no se toca— y lo marca quien lo aceptó. En el parte y en
la vista OFICINA el pedido sigue saliendo en su ruta de origen.

## Parte B — de la app a GeminisWin (pendiente, la hará Cowork)

`python puente_reparto.py --partes` deja en `partes\` un fichero por reparto abierto con lo que marcó
el repartidor y el estado a poner en GeminisWin (4 entregado, 7 no entregado), sin nombres ni
direcciones. Cowork lo aplicará por la pantalla de GeminisWin (nunca escribiendo en los DBF), cerrará
el reparto y generará el del día siguiente, según la grabación de pantalla.

Pendiente de decidir: el aviso de facturas de contado sin pagar al día siguiente (no se monta todavía).

## Parte C — generar y cerrar en el ERP, y liquidar en la Caja (18/11/2026)

Migración `20261118_reparto_circuito_erp.sql`. Las ventas, facturas y cobros siguen en GeminisWin; el reparto pasa
a ser del ERP, ruta a ruta. GeminisWin no necesita saber nada del reparto (es control interno).

| Pieza | Qué hace |
|---|---|
| Puente (`puente_reparto.py`) | Si el parámetro `reparto.puente_gw_ventas` es `true`: en cada pasada manda las ventas nuevas (final de VENTAS desde la última pasada; la primera vez, las últimas 4.000) con la ruta y la dirección de la sucursal (CLISUCUR) o del cliente (CLIENTES), y vuelve a leer las ventas que el ERP le pide vigilar (`fn_reparto_gw_vigilar`, máx. 5.000: candidatas a reparto y entregadas de contado sin cobrar o liquidadas sin apuntar). Todo a `reparto_gw_venta` (`fn_reparto_gw_ventas`). |
| Ruta de cada venta | `VENTAS.IDRUTA` si se puso en la venta; si no, la de la sucursal; si no, la de la ficha del cliente. |
| Ventas → Generar repartos (`/repartos/generar`) | Por ruta: propuesta (`reparto_privado.erp_candidatas`), repartidor de la última vez, generar (`fn_reparto_erp_generar`), cerrar (`fn_reparto_erp_cerrar`), quitar una venta sin tocar (`fn_reparto_erp_quitar`), pasar la ruta al ERP o devolverla (`fn_reparto_erp_ruta`, parámetro `reparto.erp_rutas`). Las rutas que siguen en GeminisWin solo se comparan con su reparto abierto. |
| Repartos generados en el ERP | Origen `geminiswin` + `generado_erp = true`, numerados en la tienda `reparto.erp_tienda` desde 900001. El puente no los toca ni crea repartos nuevos de las rutas del ERP (los que ya estaban abiertos se terminan). No salen en los partes para GeminisWin. Al generar el de un día se cierra el anterior de la ruta: lo sin marcar pasa a «no entregado» y vuelve a la propuesta como «viene del anterior». |
| Propuesta | Ventas «nuevas» de los últimos `reparto.erp_dias` días (7) con ruta, importe positivo, cliente no genérico, que no han ido en ningún reparto ni se han entregado, más las no entregadas. Marcadas por defecto las de las tiendas `reparto.erp_tiendas_venta` (["54"]) y las que vienen del anterior. |
| Caja (app, usuario CAJA) | «Liquidar» (`fn_app_rep_liquidar`): guarda `reparto_liquidacion` (nº, quién, cuándo, esperado, entregado, facturas) y pasa las líneas a «liquidado». Deshacer en 7 días (`fn_app_rep_liquidacion_anular`). `fn_app_rep_liquidaciones`: las de 7 días y las «Falta apuntar en GeminisWin» (liquidadas aquí con pendiente en GeminisWin). La Caja ve también las rutas de los 10 días anteriores con cobros sin liquidar. El puente no deshace una liquidación de la Caja aunque GeminisWin siga diciendo «entregado». |

Cobros en GeminisWin (diagnóstico de Cowork del 17/11): el cobro de una factura fuera del reparto se apunta en
«Pagos Factura» (fichero PAGOS, con la tienda que cobra) y la venta queda con `TOT_PEND` 0 y `FECHA_PAGO`. Eso es
lo que el puente lee para saber que ya está cobrada.

Probado el 18/11/2026 en una transacción deshecha (ruta 11, ventas ZZTEST): alta de ventas, propuesta, generar,
entregar, liquidar, «falta apuntar» y su desaparición al llegar el pago, generar el día siguiente (cierra el
anterior y pasa la no entregada), deshacer la liquidación y negativa a generar una ruta de GeminisWin. Puente
probado con ficheros DBF inventados y un servidor de pega. Pantallas probadas en el navegador con datos simulados.
**Falta**: la primera pasada con los ficheros reales (`--prueba`) y comparar una ruta varios días antes de pasarla.

## Para quitarlo cuando ya no haga falta
Tarea programada y carpeta del PC; función `reparto-gw-ingesta`; funciones `fn_reparto_gw_*`, los dos
disparadores `trg_reparto*_gw_guarda`, tablas `reparto_gw_venta`, `reparto_gw_pasada` y
`reparto_privado.puente_gw`, parámetro `reparto.puente_gw_rutas`; y volver a dejar `fn_app_rep_lineas`
sin la unión con `reparto_gw_venta`.
