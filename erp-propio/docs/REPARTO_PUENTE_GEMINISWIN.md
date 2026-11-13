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
- **Clave del puente**: en la base de datos solo está su huella sha-256 (`reparto_privado.puente_gw`). La clave en claro vive en `puente_reparto.clave`, junto al programa, en el PC. No va en el repositorio. Para cambiarla: fichero nuevo + `update reparto_privado.puente_gw set clave_sha256 = …`.
- **Estados** (LEEME de Cowork del 13/11): línea 2 → pendiente; 3 u `OLDVTAREP` 7 → viene de anterior (sale la primera); 4 y 5 → entregado; 7 → no entregado; 1, 6, 8 y 10 no se llevan a la app. Reparto 2 = abierto, 4 = cerrado.
- **Fecha**: `REPARTOS.FECHA` es el día en que se genera; el reparto se hace al día siguiente, y el del viernes queda para el lunes (confirmado por Rober, 13/11/2026). Se ajusta en `puente_reparto.json` (`fecha_mas_dias`, `salta_fin_de_semana`).
- **Lo que marca el repartidor no se pisa**: la ingesta solo cambia el estado de una línea si en GeminisWin ya está resuelta (entregado / no entregado) y en la app seguía pendiente. Una línea que desaparece de GeminisWin se quita de la app solo si nadie la tocó.
- **Cliente, importe, pagado, forma de pago y factura** salen de `reparto_gw_venta` (las ventas de GeminisWin no están en la tabla `venta`). `fn_app_rep_lineas` devuelve además `contado` y `forma_pago`.
- **Guardas**: un reparto de origen `geminiswin` no se puede cerrar, ni añadirle o cambiarle pedidos de ruta, desde el ERP ni desde la app: eso se hace en GeminisWin y llega por el puente.
- **Vigilancia**: `select * from reparto_gw_pasada order by id desc limit 20;` (una fila por pasada) y `puente_reparto.log` en el PC.

Probado con ficheros DBF inventados (estructura del LEEME) y un servidor de pega: filtro por ruta y fecha, registros borrados y a medias, ventas con el mismo número en otra oficina, venta antigua, cierre del reparto y partes. **Falta la prueba con los ficheros reales** (`--prueba`, que no envía nada).

## Parte B — de la app a GeminisWin (pendiente, la hará Cowork)

`python puente_reparto.py --partes` deja en `partes\` un fichero por reparto abierto con lo que marcó
el repartidor y el estado a poner en GeminisWin (4 entregado, 7 no entregado), sin nombres ni
direcciones. Cowork lo aplicará por la pantalla de GeminisWin (nunca escribiendo en los DBF), cerrará
el reparto y generará el del día siguiente, según la grabación de pantalla.

Pendiente de decidir: el aviso de facturas de contado sin pagar al día siguiente (no se monta todavía).

## Para quitarlo cuando ya no haga falta
Tarea programada y carpeta del PC; función `reparto-gw-ingesta`; funciones `fn_reparto_gw_*`, los dos
disparadores `trg_reparto*_gw_guarda`, tablas `reparto_gw_venta`, `reparto_gw_pasada` y
`reparto_privado.puente_gw`, parámetro `reparto.puente_gw_rutas`; y volver a dejar `fn_app_rep_lineas`
sin la unión con `reparto_gw_venta`.
