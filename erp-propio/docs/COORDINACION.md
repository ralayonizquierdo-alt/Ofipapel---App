# Coordinación del ERP propio (réplica de GeminisWin)

Documento compartido entre la sesión de Claude Code que construye el ERP y
cualquier otro chat que ayude (claude.ai, proyectos, otra sesión). Quien lo lea:
añade notas al final de cada sección con fecha y tu nombre de chat; no borres
lo que escribió otro.

- Repositorio: `ralayonizquierdo-alt/Ofipapel---App`, rama
  `claude/wholesale-retail-management-nhfyf9`, carpeta `erp-propio/`.
- Web de prueba: https://ofipapel-erp-propio-preview.netlify.app
- Referencias: `GeminisWin_mapa_funcional_para_el_ERP_propio` (PDF de Rober),
  `MAPA_DATOS_GEMINISWIN.xlsx` y los ZIP de capturas por bloque.
- Regla de privacidad: las capturas llevan datos reales de clientes; nunca se
  copian al código, a la base de datos ni a datos de prueba. Las pestañas de
  Bancos no se capturan con datos (la estructura sale de una ficha vacía).

## Quién trabaja (28/10/2026)

- **Rober** y **Luis** (GitHub `Lualme31`, escritura; administrador del ERP),
  cada uno con su propio Claude. Notas entre sesiones en la tabla
  `coordinacion_notas` (de/para: `claude-code`, `cowork`, `rober`, `luis`,
  `todos`). Antes de empezar un encargo, mira las notas sin leer y deja una
  diciendo qué pantalla o módulo vas a tocar; al terminar, otra con lo hecho.
- No trabajar los dos en la misma pantalla a la vez.
- **Pestaña «Operativa» (norma de Luis, 29/10/2026):** cada pantalla nueva o que se cambie a
  petición suya lleva una pestaña «Operativa» con cómo se usa, en pocas líneas (pasos numerados
  y «Bueno es saber»). Componente común `src/components/gw/GwOperativa.tsx`
  (`<GwOperativa bloques={[{ titulo, pasos?, notas? }]} />`).

## Ramas y publicación

- Rama común del ERP: **`erp`** (conectada a Netlify el 27/10/2026). La web de prueba
  (ofipapel-erp-propio-preview) se publica SOLA desde GitHub cada vez que
  entra un cambio en `erp` que toca `erp-propio/` (configuración en
  `erp-propio/netlify.toml`).
- Cada encargo se hace en su propia rama y se junta en `erp` con una
  solicitud de cambios (pull request) o, si es de la misma sesión, empujando a
  `erp`. Nada de publicar a mano salvo emergencia.

## Estado por pantalla

Leyenda: **Calcada** = copiada de captura real y comprobada en navegador (sin
solapes a 1366 y 1920) · **Sin captura** = hecha con el PDF y el estilo de su
gemela; se ajusta cuando llegue la captura · **Gris** = opción de menú aún no
construida.

### Archivo / General
| Pantalla | Estado |
|---|---|
| Ventana principal (menús, barra lateral, escritorio, barra de estado) | Calcada |
| Login «Cambiar Empleado» | Sin captura |
| Buscar «Localizar registros» (común) | Calcada |
| Tiendas, Empleados, Almacenes | Pantallas antiguas sin rehacer (pendiente captura) |
| Códigos Postales (`/codigos-postales`; clave código postal + población, propone la provincia por las dos primeras cifras) | Sin captura (28/10) |
| Cód. Bancarios (`/bancos`: banco con BIC y rejilla de sucursales) | Sin captura (28/10) |
| Monedas (`/monedas`: cotización billete/cheque, decimales) | Sin captura (28/10) |
| Parámetros (`/archivo/parametros`; pestañas Generales, Tiendas / Terminales, Empresa, VeriFactu y Web) | Sin captura (28/10). Generales = tabla nueva `parametro` (clave, valor jsonb; RLS: leer todos, alta/modificación solo administradores): **IGIC por defecto** (líneas nuevas de Ventas/TPV y Creación rápida de artículos, antes fijo 7), **decimales de precio** (precio de las líneas de Pedidos, Ventas/TPV y ticket, antes fijo 3) y **moneda de la empresa** (base de Carga Cotización); se leen con `src/lib/parametros.ts` (se cargan al entrar en `UtilidadesHost`). Tiendas = cliente de contado, almacén, IGIC y fondo de caja de `tienda_terminal` (solo administradores modifican desde aquí). Empresa, VeriFactu y Web: solo consulta (se cambian en su pantalla; VeriFactu el día del arranque) |
| Zonas de servicio (`/archivo/zonas-servicio`) | Sin captura (28/10). Tabla nueva `zona_servicio` (código, descripción, observaciones, baja lógica). Ficha gemela de Monedas; Ctrl+Intro con `gw_lista_ordenada_zona_servicio`. Aún no se enlaza a clientes (no hay dato en GeminisWin cargado: confirmar con Luis para qué la usa) |
| Carga Cotización (`/archivo/carga-cotizacion`) | Sin captura (28/10). Rejilla de monedas para teclear la cotización o «Leer tipos del BCE» + «Aplicar BCE» (casa por código o descripción corta ISO: USD, GBP…; convierte a la moneda de la empresa). Guarda `fecha_actualizacion` y apunta cada cambio en `moneda_cotizacion` (manual/bce). El BCE no tiene CORS: se pide por `/bce/*` (regla en `public/_redirects` de Netlify; en desarrollo, proxy de Vite) |
| Importar (`/archivo/importar`) | Sin captura (28/10). Artículos, clientes o proveedores desde .xlsx o .csv (sin dependencias: `src/lib/hojaCalculo.ts` reutiliza el ZIP de la copia). Plantilla .xlsx, vista previa con Alta/Modificar/Error, validación (obligatorios, códigos repetidos en el fichero, números, familia/marca/provincia/forma de pago/tipo de cliente que existan), «Solo comprobar» y «Solo altas»; inserta/actualiza por lotes de 500 con `upsert`. Al modificar, una celda vacía NO borra el dato. No toca stock, tarifas por nivel ni códigos de barras adicionales |
| Preparar página… / Presentación preliminar / Elegir Impresora… | Sin captura (28/10). Preferencias del puesto en `localStorage` «gw.impresion.opciones» (`src/lib/impresion.ts`): tamaño, orientación y márgenes (regla @page global al principio de `<head>`; los listados GwListado las usan con su orientación) y nombre de la impresora de A4 y de tickets (el navegador no deja elegir impresora: solo se recuerda). Presentación preliminar: la ventana activa se registra con `registrarVistaPrevia`; lo hacen solos `ListadoVentana` (procesa con destino Pantalla), `DialogoListado` (= Aceptar) y las fichas con botón Imprimir de `GwRecordBar` (= Imprimir, el navegador enseña la vista previa). Sin ninguna: aviso «La ventana activa no tiene presentación preliminar» |
| ? → Acerca de Ofipapel ERP (versión de `package.json` y commit `COMMIT_REF` de Netlify) | Sin captura (28/10) |
| Edición → Pegar (portapapeles al último campo con foco), Encontrar (Ctrl+F: busca en las filas visibles de las rejillas de la ventana activa y selecciona la siguiente coincidencia; Intro/F3 sigue) y Reemplazar (Ctrl+H: solo en los campos de texto modificables de la ficha en Modificar/Nuevo, entra como si se tecleara y se guarda o cancela con la ficha; no toca rejillas) — `components/shell/EdicionHerramientas.tsx` | Sin captura (28/10) |
| Archivo → Cambiar Grupo de Acceso (Ctrl+O). Un empleado tiene un solo grupo (`rol_id`), así que se implementa como «ver como»: un administrador elige otro grupo y el programa (menús, barra lateral, Panel, NEXA) se ve con los permisos de ese grupo, con aviso «Viendo como: X · Volver» en la barra de estado; solo interfaz, nunca da permisos (el administrador ya lo tiene todo). A los demás les explica que no aplica. Dura la sesión del navegador (`PermisosContext`: `verComo`, `realAdmin`) | Sin captura (28/10) |
| Utilidades → Etiquetas y Listado De Ventas: abren las pantallas que ya existían (`/almacen/etiquetas`, `/listados-ventas/ventas`) | Enlazadas (28/10) |
| Utilidades → Stock A 0 de Familia (`/almacen/stock-cero-familia`): familia (con opción de subfamilias por prefijo) y almacén → lista de artículos con stock ≠ 0 → confirmación con nº de artículos y unidades → un movimiento de regularización por artículo (`fn_stock_cero_familia_previa` / `fn_stock_cero_familia_aplicar`, origen `stock_cero_familia`); también deja a 0 sus lotes en ese almacén | Sin captura (28/10) |
| Utilidades → Elimina ArtiEnBlanco (`/almacen/articulos-en-blanco`): artículos activos sin descripción (o solo signos) o sin familia, PVP, coste ni código de barras, y sin movimientos, stock, ventas, pedidos, traspasos, inventarios, peticiones ni lotes → baja lógica tras confirmar con la lista (`fn_articulos_en_blanco`, `fn_articulos_en_blanco_baja`, que lo vuelve a comprobar) | Sin captura (28/10) |
| Ventana → Ocultar / Mostrar todo / Borrar / Recorrer (Ctrl+F1) y lista de ventanas abiertas | Sin captura (28/10). El ERP enseña una sola ventana a la vez: Recorrer pasa a la siguiente ventana abierta en la sesión (vuelve al mismo registro), Ocultar la quita de la vista y Mostrar todo la vuelve a enseñar; no hay cascada ni mosaico |
| Archivo → Seleccionar Periodo (diálogo) y Periodos o Ejercicios (`/utilidades/ejercicios`, tabla `ejercicio`: año, fechas, cerrado, activo) | Sin captura (28/10). El periodo elegido se recuerda en el navegador; si no hay, vale el ejercicio «activo». Fija la fecha de referencia de los rangos por defecto de listados (`mesEnCurso`), gestores (`rangoPeriodo`), Listado de facturas y el año del Gestor de pagos. No toca la contabilidad |
| Utilidades → Cambio de Tienda (diálogo) | Sin captura (28/10). Tienda/terminal del puesto, centralizada en `src/lib/sesionTrabajo.ts` (clave `tpv.tienda`, la que ya usaban TPV y caja). La proponen TPV/Ventas, caja, pedidos, presupuestos, pedidos y facturas de proveedor y pagos. Se ve en la barra de estado |
| Utilidades → Cambio de Fecha / Cambio de Fecha y Hora (diálogos) | Sin captura (28/10). Fecha (y hora) de trabajo de la pestaña (sessionStorage, se olvida al cerrarla), resaltada en amarillo en la barra de estado. La usan como fecha por defecto de documentos nuevos: TPV/Ventas (y sus cobros), Pedidos y Presupuestos, Caja (movimientos, apertura, informes), Pedidos y Facturas de proveedor, Pagos a proveedores. NO la usan VeriFactu (fecha de generación = `clock_timestamp()` en la base de datos), Facturación (Generar facturas / Facturas de clientes), Contabilidad, Reparaciones, Repartos, Traspasos, Inventarios ni la auditoría |
| Utilidades → Examinar (F11, `/utilidades/examinar`) | Sin captura (28/10). Solo lectura y solo administradores: lista de tablas y rejilla paginada (100) con filtro «contiene» por columna y orden por cabecera (`fn_examinar`, SECURITY INVOKER, transacción de solo lectura) |
| Utilidades → Copia de Seguridad → Hacer Copia (Alt+F8 y botón «Copia» de la barra lateral) / Testear Copia | Sin captura (28/10). ZIP con `manifiesto.json` y `tablas/<tabla>.json` de todas las tablas legibles salvo `carga_dbf`, de 1000 en 1000 por clave primaria (`fn_tablas_erp`); solo administradores. Testear abre el ZIP, comprueba CRC y cuenta filas frente al manifiesto. Restaurar Copia en gris: «La restauración se hace desde Supabase (copias diarias automáticas)» |
| Utilidades → Eliminar Ficheros Temporales | Sin captura (28/10). Borra el localStorage/sessionStorage propio del ERP con confirmación; respeta la sesión (`sb-…`), tienda, periodo, fecha de trabajo, voz de NEXA y opciones de gestores y panel |
| Archivo → Parámetros (`/archivo/parametros`, 29/10, Claude-Luis) | Calcada del árbol de Utilidades → Parámetros de GeminisWin (captura de Parámetros Locales; faltan capturas del resto, pedidas a Cowork). Tres apartados: **Parámetros** (Locales, Generales, TPV, Compras, Almacén, Contadores, Formatos Numéricos, Definición de Impuestos; catálogo en `src/lib/catalogoParametros.ts`, valores en `parametro` y, por empleado, en `parametro_empleado`; «Valores de: empleado» para los marcados por empleado; punto verde = ya lo usa el programa), **Configuración** (accesos a fichas + valores por tienda/empresa/VeriFactu/web) y **Control de Accesos** por empleado (`empleado_acceso`: tiendas, almacenes, dto. máximo, precios, horario…; `empleado_permiso`: permitir/denegar opciones sobre su grupo, aplicado en `fn_mis_permisos`/`fn_tiene_permiso`). Tienda y descuento máximo los impone también la BD |
| Archivo → Periodos (`/utilidades/ejercicios`) y Seleccionar Periodo (29/10, Claude-Luis) | Periodo **en curso** (con el que se trabaja) y periodos **cerrados** de solo consulta (franja roja, botones apagados, y la BD no deja grabar en sus fechas: `fn_bloquear_periodo_cerrado`). Solo super administradores (`empleado.super_administrador`), con contraseña |
