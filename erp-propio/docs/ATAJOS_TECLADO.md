# Atajos de teclado del ERP (como GeminisWin)

GeminisWin se usa casi entero con teclado. Esta es la tabla de **todas** las teclas que entiende
el ERP propio, dónde funcionan y de dónde salen. Lo que no se sabe cómo es en GeminisWin va
marcado **confirmar con Luis**; las incoherencias que había, marcadas **⚠** (corregidas o
pendientes de decidir).

Código de referencia:

| Pieza | Qué lleva |
|---|---|
| `src/components/shell/MenuBar.tsx` + `mnemonicos.ts` | Barra de menús: Alt+letra, Alt solo, F10, flechas, letra de cada opción |
| `src/components/shell/menus.ts` | Los atajos de las opciones de menú (columna derecha) |
| `src/components/Layout.tsx` | Ejecuta esos atajos (normalizados, respetando permisos) y la ayuda de la barra de estado |
| `src/components/gw/teclado.ts` | Normalización de teclas, Intro = siguiente campo, teclas de rejilla, Intro/Esc de los diálogos |
| `src/components/gw/teclasFicha.ts` | Teclas de la barra de registro de **todas** las fichas (una sola definición) |

## 1. Barra de menús

| Tecla | Acción | Dónde |
|---|---|---|
| Alt + letra subrayada | Abre ese menú | En cualquier ventana sin diálogo abierto |
| Alt (pulsar y soltar solo) | Activa la barra (resalta Archivo) sin abrir menú; otra vez Alt la desactiva | Igual |
| F10 | Igual que Alt solo | Igual |
| ← / → | Menú anterior / siguiente (con un menú abierto sin submenú, también) | Barra activa o menú abierto |
| ↓ / ↑ | Opción siguiente / anterior (salta separadores y opciones en gris) | Menú abierto |
| Inicio / Fin | Primera / última opción | Menú abierto o barra activa |
| Intro / Espacio | Ejecuta la opción o abre su submenú | Menú abierto |
| → en opción con ▶ | Abre el submenú; ← lo cierra | Menú abierto |
| Letra subrayada de la opción | La ejecuta (o abre su submenú) directamente | Menú abierto |
| Esc | Cierra el menú (y la barra) | Menú abierto |
| Tab / F10 | Cierra el menú | Menú abierto |
| Ctrl + tecla | Cierra el menú y deja pasar el atajo | Menú abierto |

Letras de los menús superiores (subrayadas siempre, sin colisiones). **Confirmar con Luis** si
GeminisWin usa otras:

| Menú | Tecla | | Menú | Tecla |
|---|---|---|---|---|
| Archivo | Alt+A | | Compras | Alt+O |
| Edición | Alt+E | | Almacén | Alt+L |
| Clientes | Alt+C | | Web | Alt+W |
| Ventas | Alt+V | | Utilidades | Alt+U |
| Caja | Alt+J | | Ventana | Alt+N |
| Facturación | Alt+F | | ? | Alt+? |
| Contabilidad | Alt+T | | | |

Las letras de cada opción las calcula `mnemonicos.ts`: la primera letra libre al principio de una
palabra (si no hay, la primera libre de la etiqueta). Una opción puede fijar la suya con `letra`
en `menus.ts` (hoy solo Edición → Cortar = T, como en Windows). **Confirmar con Luis** las de
GeminisWin y fijarlas con `letra` donde no coincidan.

## 2. Atajos de las opciones de menú (`menus.ts`)

Todos funcionan desde cualquier ventana, **respetan el grupo de acceso** (sin permiso no hacen
nada, igual que la opción en gris) y no actúan con un diálogo modal abierto ni si la ventana ya ha
usado la tecla. Se escriben de cualquier forma en `menus.ts` (`CTRL+F12`, `Ctrl+F12`) y se
rotulan siempre igual en el menú (`Ctrl+F12`).

| Atajo | Opción | Menú |
|---|---|---|
| Ctrl+E | Cambiar Empleado | Archivo |
| Ctrl+O | Cambiar Grupo de Acceso (solo administradores) | Archivo |
| Ctrl+Z / Ctrl+Y | Deshacer / Rehacer | Edición (el navegador) |
| Ctrl+X / Ctrl+C / Ctrl+V | Cortar / Copiar / Pegar | Edición (el navegador; Pegar desde el menú va al último campo) |
| Supr | Borrar | Edición (el navegador) |
| Ctrl+A | Seleccionar todo (solo dentro de un campo; fuera no selecciona la página) | Edición |
| Ctrl+F | Encontrar en la rejilla de la ventana activa | Edición |
| Ctrl+H | Reemplazar en los campos de la ficha en modificación | Edición |
| Alt+F7 | Pagos de Clientes, Cobros | Clientes |
| Ctrl+F12 | TPV / Ventas | Ventas |
| Ctrl+F11 | Reparaciones | Ventas |
| Alt+F6 | Gestor de Pedidos | Ventas |
| Alt+F9 | Listado de Ventas por Artículo | Ventas → Listados |
| Alt+F5 | Movimientos de Caja | Caja |
| Ctrl+F5 | Listado de Caja | Caja |
| ~~Alt+F6~~ | Apertura de Caja — ⚠ ver incoherencias | Caja |
| Ctrl+F6 | Cierre de Caja | Caja |
| Ctrl+P | Generar Petición de artículo (en la ficha de un artículo, la de ese artículo) | Compras |
| F11 | Examinar tablas (solo administradores) | Utilidades |
| Alt+F8 | Hacer Copia (ZIP de los datos) | Utilidades → Copias |
| Alt+F12 / Alt+F11 | Reparar Base de Datos / Reconstruir Ficheros: **no aplican** en el ERP web (opción en gris, la tecla no hace nada) | Utilidades |
| Ctrl+F1 | Recorrer ventanas | Ventana |

## 3. Barra de registro de las fichas (`teclasFicha.ts`)

Una sola definición para **todas** las barras: `GwRecordBar` (Clientes, Proveedores, Artículos,
Vendedores, Familias, Tiendas, Empleados, Formas de Pago…), `BarraCompacta` (Marcas, Plantillas
de tarifa), `PedidoBar` (Pedidos y Presupuestos), `CompraBar` (Pedidos/Albaranes/Facturas de
proveedor), `PagosBar`, Traspasos, Regularización de stock y el documento de Ventas (TPV). La
tecla sale en el tooltip del botón («Modificar (F2)») y en la barra de estado al pasar el ratón.

| Tecla | Botón | Cuándo | Origen |
|---|---|---|---|
| Ctrl+Inicio | Primero | Consulta | ERP — **confirmar con Luis** |
| RePág | Anterior | Consulta | ERP — **confirmar con Luis** |
| AvPág | Siguiente | Consulta | ERP — **confirmar con Luis** |
| Ctrl+Fin | Último | Consulta | ERP — **confirmar con Luis** |
| F5 | Buscar (Localizar) | Consulta | ERP — **confirmar con Luis** |
| F3 | Nuevo / Agregar | Consulta | ERP — **confirmar con Luis** |
| F2 | Modificar / Editar (el cursor va al primer campo editable) | Consulta | ERP — **confirmar con Luis** |
| Esc | Salir / Cerrar la ventana | Consulta | ERP |
| F1 | Grabar / Aceptar | Modificación o alta | GeminisWin (ya estaba en Pedidos, Compras, Traspasos, TPV) |
| Alt+Retroceso | Cancelar sin preguntar | Modificación o alta | GeminisWin |
| Esc | Cancelar, **preguntando** antes de perder cambios | Modificación o alta | ERP |

Reglas comunes: un botón desactivado no responde a su tecla; RePág/AvPág/Inicio/Fin no se le
quitan a un área de texto ni a un desplegable; con un diálogo abierto solo responde la barra que
esté dentro de él; si hay dos fichas montadas (una dentro de otra), manda la de arriba.

### Teclas propias del documento de Ventas / TPV (`VentaDocumento.tsx`, GeminisWin)

| Tecla | Acción |
|---|---|
| F1 | Grabar la venta |
| F2 | **Imprimir** (⚠ en las fichas F2 = Modificar) |
| F11 | Grabar como **aplazada** (⚠ fuera del TPV F11 = Examinar) |
| Ctrl+F11 | Recuperar ventas aplazadas (⚠ fuera del TPV = Reparaciones) |
| F12 | Stock del artículo de la línea |
| F10 | Abrir el cajón (confirmado por Rober, 29/10; aquí F10 no activa la barra de menús) |
| Ctrl+F12 | Cambiar de empleado (confirmado por Rober, 29/10; ⚠ fuera del TPV = abrir el TPV) |
| Alt+Retroceso / Esc | Cancelar (Esc pregunta) |
| AvPág/RePág, Ctrl+Inicio/Fin, F3, F5, Esc | Como en el resto de fichas |

## 4. Campos

| Tecla | Acción | Dónde |
|---|---|---|
| Intro | Pasa al campo siguiente | Cualquier campo de la ventana que no tenga ya su propia tecla Intro (FoxPro) |
| Mayús+Intro | Campo anterior | Igual |
| (al entrar) | Se selecciona todo el número: lo tecleado lo sustituye (antes «2» en una cantidad 1 daba 12). Al salir sin teclear no se cambia el valor | Números (`GwNumber`, celdas y pie del TPV, números de Archivo) — `seleccionEntrada.ts` |
| Intro | Busca lo escrito | Campos de búsqueda (código de cliente, artículo…) en consulta |
| Ctrl+Intro / F4 / F2 | Lista ordenada o buscador del campo | Campos con lupa (`GwCampoBusqueda`, `GwCodigoBuscador`, listados) — la ayuda sale en la barra de estado |
| Esc | Deshace lo escrito en el campo de búsqueda | Igual |
| + / − | Un día más / menos | Fechas (`GwDate`, `GwDateTime`) |
| H / T | Hoy | Fechas |
| / o . | Salta a la parte siguiente | Fechas |
| F4 / Alt+↓ / doble clic | Calendario | Fechas |
| Esc | Deshace la fecha a medio escribir | Fechas |

## 5. Rejillas y listas

| Tecla | Acción | Dónde |
|---|---|---|
| ↓ / ↑ | Fila siguiente / anterior | Listas (Clientes, Proveedores, Artículos, Vendedores), gestores (Pedidos, Presupuestos, Compras, Cobros, Pagos), buscadores (`GwLookupDialog`, `GwListaOrdenada`) |
| AvPág / RePág | Una página abajo / arriba | Igual |
| Inicio / Fin | Primera / última fila (desde un campo de filtro: Ctrl+Inicio / Ctrl+Fin, para no quitarle Inicio/Fin al cursor) | Igual |
| Intro / doble clic | Abre / elige la fila | Igual |
| Esc | Cierra el buscador | Buscadores |

Las listas abren con el cursor en el primer filtro (Código): se escribe para filtrar y las flechas
mueven la rejilla sin tocar el ratón.

## 6. Diálogos y ventanas de informe

| Tecla | Acción | Dónde |
|---|---|---|
| Intro | **Aceptar** | Cualquier diálogo sin teclas propias: pulsa el botón `data-gw-aceptar` o el rotulado Aceptar/Sí/OK (no «Procesar», «Generar»… a propósito: lo que escribe datos no se dispara con Intro) |
| Esc | **Cancelar** | Cualquier diálogo: el botón `data-gw-cancelar`, Cancelar/Cerrar/Salir/No o la X de la barra de título |
| (cualquier tecla) | Si el diálogo se abrió con un atajo y el foco quedó fuera, pasa al primer campo del diálogo | Todos los diálogos modales |
| F4 | Cierra la ventana de informe o listado | Listados (`GwListado`), Informes de Caja, Listado de Facturas, utilidades de Almacén — salvo en un campo de fecha, donde abre el calendario |
| Intro / F3 | Siguiente coincidencia | Encontrar / Reemplazar (Ctrl+F / Ctrl+H) |
| Intro | En Efectivo / Tarjeta pasa al campo siguiente; en Entregado cobra (Aceptar) | Pagar / Cobrar del TPV (`PagoDialog`) |

## 7. Incoherencias

| | Qué | Estado |
|---|---|---|
| ⚠ | **Alt+F6** está en dos opciones: Ventas → Gestor de Pedidos y Caja → Apertura de Caja. Gana la primera del árbol (Gestor de Pedidos). | Pendiente — **confirmar con Luis** cuál es la buena en GeminisWin y quitar o cambiar la otra en `menus.ts` |
| ⚠ | F2 = Modificar en las fichas, pero **Imprimir** en el TPV | Se deja: así lo hace GeminisWin en ventas — **confirmar con Luis** |
| ⚠ | F10, F11, Ctrl+F11 y Ctrl+F12 cambian de significado dentro del TPV (cajón, aplazar, aplazadas, cambiar empleado) | Intencionado (GeminisWin); la ventana de ventas gana a los atajos de menú |
| ⚠ | Ctrl+P, Ctrl+E, Ctrl+O, Ctrl+F, Ctrl+H, Ctrl+F5 y F10 eran teclas del navegador (imprimir, buscar, recargar…) | El ERP las usa como GeminisWin; imprimir va por el botón Imprimir |
| ✔ | Atajos escritos de varias formas en `menus.ts` (`CTRL+F12`, `ALT+F6`, `'Alt+F6 '` con espacio) y solo funcionaban algunos | Corregido: se normalizan todos y se rotulan igual |
| ✔ | Cada ficha tenía su propio manejador (F1 en unas, Alt+Retroceso en otras, nada en la mayoría) | Corregido: `teclasFicha.ts` para todas |
| ✔ | Esc en una ficha cerraba la ficha y además el diálogo de encima | Corregido: foto del diálogo abierto al pulsar (`modalAlPulsar`) |
| ✔ | F4 en una fecha de las utilidades de Almacén cerraba la ventana en vez de abrir el calendario; Esc en una fecha de un diálogo de Utilidades cerraba el diálogo | Corregido: respetan la tecla usada por el campo |
| ✔ | Alt+Retroceso en una fecha borraba en vez de cancelar la ficha | Corregido |
| ✔ | Al pulsar Modificar el cursor no iba a ningún campo | Corregido: va al primer campo editable |
| ✔ | Las listas abrían sin foco: flechas e Intro no hacían nada hasta hacer clic | Corregido: foco en el primer filtro |

## 8. Pendiente

- **Confirmar con Luis** las teclas de GeminisWin que el ERP ha propuesto (sección 3 y letras de
  menú) y el Alt+F6 duplicado.
- Eliminar (Borrar registro) no tiene tecla: **confirmar con Luis** si GeminisWin usa alguna.
- Inventariar Almacén y las barras de los gestores mueven la fila de la rejilla con sus botones;
  sus teclas son las de la rejilla (sección 5), no las de `teclasFicha`.
