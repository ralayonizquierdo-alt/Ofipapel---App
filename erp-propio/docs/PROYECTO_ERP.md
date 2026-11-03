# El ERP propio de Ofipapel: explicación completa del proyecto

Documento para Luis y para su Claude. Sirve para entender en una lectura qué
es el proyecto, cómo está hecho, en qué punto está y cómo se sigue. Situación
a **28/10/2026**.

> **Para el Claude de Luis:** este documento es la puerta de entrada. Para el
> día a día lee además `docs/COORDINACION.md` (estado de cada pantalla,
> capturas pendientes, preguntas abiertas) y `docs/CARGA_GEMINISWIN.md` (cómo
> se cargan los datos reales). Si algo de aquí no cuadra con el código o con
> la base de datos, manda el código y la base de datos; avisa y corrige este
> documento.

---

## 1. Qué es y para qué

Ofipapel trabaja hoy con **GeminisWin** (de IdsSoft), un programa de gestión
en Visual FoxPro que lleva artículos, clientes, proveedores, ventas, compras,
almacén, caja y facturación. Funciona, pero es antiguo, solo vive en el
servidor de la oficina y depende de un proveedor externo.

El objetivo es tener **un ERP propio que haga lo mismo que GeminisWin**, en
el navegador, con nuestros datos en una base de datos moderna, y que además
añada cosas que GeminisWin no tiene: VeriFactu integrado, conexión con la web
(WooCommerce), un panel de inicio y una asistente con IA (NEXA).

**Regla principal del proyecto: replicar GeminisWin lo más fielmente posible.**
Cada pantalla se calca de una captura real: los mismos campos, en el mismo
sitio, con los mismos nombres, las mismas pestañas y los mismos atajos de
teclado. Así los empleados no tienen que aprender un programa nuevo. Las
mejoras van aparte y nunca cambian cómo se hace lo de siempre.

## 2. Quién es quién

| Quién | Papel |
|---|---|
| **Rober** | Dueño del proyecto. Decide prioridades, prueba las pantallas y pasa las capturas. |
| **Luis** | El jefe y quien mejor conoce GeminisWin por dentro. Administrador del ERP. Resuelve las dudas de funcionamiento («Preguntas para Luis») y puede encargar trabajo a su propio Claude. |
| **Claude Code** (sesiones de Rober y de Luis) | Construye las pantallas, la base de datos y las funciones del servidor. Trabaja sobre el repositorio de GitHub y sobre Supabase. |
| **Cowork** | Otro Claude que trabaja en el PC de la oficina, donde está GeminisWin. Saca las capturas de pantalla (en ZIP por bloques) y sube los datos reales (los ficheros DBF) a Supabase. No escribe código del ERP. |

Los distintos Claude se dejan avisos en la tabla **`coordinacion_notas`** de
Supabase (de quién, para quién, texto) y en `docs/COORDINACION.md`.

## 3. Dónde está cada cosa

| Pieza | Qué es | Dónde |
|---|---|---|
| Código | Carpeta `erp-propio/` dentro del repositorio | https://github.com/ralayonizquierdo-alt/Ofipapel---App |
| Rama común | **`erp`**: la «versión buena». Todo lo que entra aquí se publica solo | rama `erp` |
| Web de prueba | Se publica sola desde `erp` en 2-3 minutos | https://ofipapel-erp-propio-preview.netlify.app |
| Publicaciones | Lista de publicaciones y sus errores | https://app.netlify.com/projects/ofipapel-erp-propio-preview/deploys |
| Base de datos | Supabase, proyecto «Ofipapel ERP propio» (id `sufxvpiwcncnyltrvoun`) | panel de Supabase |

El repositorio tiene **otros proyectos** de Ofipapel (Finanzas, Alquileres, el
bot de WhatsApp…). El ERP está entero dentro de `erp-propio/` y no depende de
ellos. El `CLAUDE.md` de la raíz describe el resto; para el ERP, este
documento.

> El repositorio es **público**. Nunca se escriben en él contraseñas, claves,
> IBAN, DNI ni datos de clientes.

## 4. Cómo está hecho (arquitectura)

```
Navegador (React)  ──►  Supabase
  erp-propio/src         ├─ Base de datos Postgres (114 tablas, ~150 funciones)
                         ├─ Usuarios (Supabase Auth) + reglas de acceso (RLS)
                         └─ Funciones del servidor (Edge Functions):
                              empleados-acceso · nexa · woocommerce-erp
Netlify: construye erp-propio/ y publica la web cada vez que cambia la rama erp
```

- **Pantalla (frontend):** React 19 + TypeScript + Vite 8 + Tailwind 4,
  react-router 7 para las rutas, recharts para gráficos, `qrcode` para el QR de
  VeriFactu, `lucide-react` para iconos y `oxlint` para revisar el código.
- **Servidor:** no hay servidor propio. Todo lo hace Supabase:
  - La **lógica de negocio importante está en la base de datos**, en funciones
    SQL (numeración de documentos, stock, caja, facturación, VeriFactu,
    contabilidad, carga de datos). Así nadie puede saltársela desde el
    navegador y da igual qué pantalla la llame.
  - Las **reglas de acceso (RLS)** deciden qué puede leer o escribir cada
    usuario. Sin sesión iniciada no se ve nada.
  - Tres **Edge Functions** para lo que necesita claves secretas o servicios
    externos (ver apartado 10).
- **Publicación:** Netlify, sitio `ofipapel-erp-propio-preview`, con
  `erp-propio/netlify.toml`. Comando `npm ci && npm run build`, publica `dist/`.
  Solo construye si el cambio toca `erp-propio/`.

### Comandos (dentro de `erp-propio/`)

```bash
npm ci                                   # instalar
VITE_BASE_PATH=/ npx vite --port 5173    # servidor de desarrollo
npm run build                            # comprobar tipos y construir
npm run lint                             # revisión con oxlint
```

### Carpetas

| Carpeta | Contenido |
|---|---|
| `src/pages/` | Una carpeta por menú: `archivo`, `articulos`, `clientes`, `proveedores`, `ventas`, `compras`, `almacen`, `caja`, `facturacion`, `listados`, `contabilidad`, `web`, `panel` |
| `src/components/gw/` | Las «piezas GW»: los controles que imitan a GeminisWin (apartado 5) |
| `src/nexa/` | La asistente NEXA (avatar de partículas y conversación) |
| `src/lib/` | Conexión a Supabase, sesión (`AuthContext`), VeriFactu, WooCommerce |
| `supabase/migrations/` | Cambios de estructura de la base de datos guardados como SQL |
| `supabase/functions/` | Las tres Edge Functions |
| `docs/` | Este documento, coordinación, carga de datos y manual de alta |

> Las migraciones del repositorio (11 ficheros) no recogen todo: en la base de
> datos hay 77 aplicadas, porque las primeras se aplicaron directamente desde
> Claude. **La fuente de verdad de la estructura es la propia base de datos.**
> A partir de ahora, todo cambio de estructura se guarda también como
> migración en el repositorio.

## 5. Cómo se construyen las pantallas (convenciones GW)

Para que todas las pantallas se comporten igual que en GeminisWin hay un juego
de piezas comunes en `src/components/gw/`. **Una pantalla nueva se monta con
estas piezas, no con controles propios.**

- **Aspecto:** letra Tahoma, colores y bordes de Windows clásico, ventanas
  dentro de un «escritorio» con menús arriba, barra lateral y barra de estado.
  El texto de la ventana no se puede seleccionar con el ratón (como en un
  programa de escritorio); el de los campos sí.
- **Campos:** `GwField` (etiqueta + control), `GwInput`, `GwNumber`,
  `GwDate`, `GwDateTime`, `GwSelect`, `GwCheck`, `GwGroup` (marco con título),
  `GwTabs` (pestañas).
- **Barra de registro (`GwRecordBar`):** los botones de siempre: primero,
  anterior, siguiente, último, nuevo, modificar, guardar, cancelar, borrar,
  buscar, imprimir y salir.
- **Búsquedas:**
  - `GwLocalizarDialog`: la ventana común «Localizar registros».
  - `GwLookupDialog` y `GwCampoBusqueda` / `GwCodigoBuscador`: campos con
    botón de búsqueda (cliente, artículo, proveedor…).
  - **Ctrl+Intro** en un campo de código abre la lista ordenada
    alfabéticamente, colocada en el registro actual (`GwListaOrdenada` +
    `useListaOrdenada`, con las funciones SQL `gw_lista_ordenada*`).
- **Más de 1000 filas:** Supabase devuelve como mucho 1000 filas por
  consulta, aunque se pida `.limit(5000)`, y no avisa. Toda consulta que
  pueda pasar de ahí va con `todasLasFilas` / `filasPorTrozos`
  (`src/lib/todasLasFilas.ts`): pide por bloques con `.range()` y, en los
  gestores, con un tope y el aviso «Se muestran las primeras N filas; afina
  el filtro» (`avisoTope`). La consulta debe ir ordenada por una clave única.
- **Listados:** `GwListado` es la pieza común de todos los informes (filtros,
  vista previa, imprimir); `GwInformeArticulos` para los de artículos.

### Patrón de una ficha (artículo, cliente, pedido…)

1. **Se abre en consulta**, mostrando un registro. No se puede escribir hasta
   pulsar «Modificar» o «Nuevo».
2. En consulta, **escribir un código en el campo de código salta a ese
   registro** (`useBusquedaFicha`).
3. Anterior/siguiente **solo pide al servidor el registro vecino**
   (`useNavRegistro`), no la tabla entera: es lo que permite trabajar con los
   volúmenes reales (decenas de miles de artículos).
4. **El número se asigna al guardar**, no al pulsar «Nuevo», con la función
   `fn_siguiente_numero` (contadores por tienda y serie, sin huecos ni
   duplicados aunque dos personas guarden a la vez). Al pulsar «Nuevo» la
   ficha ya **enseña** el próximo número de la tienda/serie (hook
   `useProximoNumero` de `src/lib/proximoNumero.ts`, que consulta
   `fn_proximo_numero` sin reservar nada; cancelar no deja huecos). Si al
   guardar sale otro número porque otro puesto se adelantó, la barra de
   mensajes lo avisa («Se ha guardado con el nº X (el Y lo usó otro puesto)»).
   Toda ficha nueva con número debe usar ese hook.
5. **Borrar es una baja lógica:** el registro se marca como dado de baja y
   desaparece de las listas, pero no se elimina (hay documentos que lo
   referencian).
6. Los documentos (pedidos, ventas, facturas) tienen **estados** y, según el
   estado, quedan bloqueados para modificar (lo controla la base de datos con
   triggers, no la pantalla).

## 6. Qué hay hecho, menú a menú

Leyenda: **Calcada** = copiada de una captura real y comprobada en el
navegador a 1366 y 1920 píxeles sin solapes · **Sin captura** = hecha con el
mapa funcional en PDF y el estilo de su pantalla gemela; se ajusta cuando
llegue su captura · **Gris** = opción de menú que aún no está construida. El
detalle pantalla a pantalla está en `COORDINACION.md`.

### Inicio
- **Panel de inicio** (`/`): pedidos nuevos hoy, pendientes de preparar,
  reparto de hoy, reparaciones abiertas, actividad por hora, pedidos por
  origen y por comercial, tickets por tienda, más vendidos, últimos pedidos y
  avisos. **No enseña importes, márgenes ni datos contables**, porque lo ven
  todos los empleados.

### Archivo
- Tiendas, Empleados (con la pestaña Seguridad para crear usuario y clave),
  Almacenes, Datos de empresa, Formas de pago.
- Cambiar contraseña (`/cambiar-clave`).
- Utilidades de mantenimiento: unas construidas sin captura, otras en gris.
- **Sesión de trabajo** (`src/lib/sesionTrabajo.ts`, único sitio que la decide):
  tienda/terminal (Utilidades → Cambio de Tienda), fecha y hora de trabajo
  (Cambio de Fecha / Fecha y Hora, nunca para VeriFactu) y periodo (Archivo →
  Seleccionar Periodo, tabla `ejercicio`). Se ven en la barra de estado y en el
  título. Detalle de qué pantallas las usan en `COORDINACION.md`.
- Utilidades → Examinar (visor de tablas de solo lectura), Copia de Seguridad
  (ZIP descargable y test) y Eliminar Ficheros Temporales.

### Artículos y Almacén
- **Ficha de Artículos** con sus 12 vistas (precios, tarifas, stock por
  almacén, códigos de barras, códigos de compra por proveedor, etc.):
  Calcada.
- Familias, Marcas, Plantillas de tarifas: Calcadas.
- Tarifas de oferta, Modificación de precios: Calcadas.
- Traspasos entre almacenes, Regularización de stock, Inventarios (con
  puntos de restauración): Calcadas.
- Utilidades de Almacén (`/almacen/*`): creación rápida, listados,
  movimientos, etiquetas, PLU, modificación en bloque, recalcular stock…
  Construidas en su mayoría sin captura.
- **Control de Lotes** (`/almacen/lotes`, sin captura): lotes por artículo y
  almacén con caducidad y movimientos (`articulo_lote`). Es un desglose: compras
  y ventas aún no piden lote (pendiente de Luis). Desde Utilidades, **Stock A 0
  de Familia** (con regularizaciones, nunca editando el stock) y **Elimina
  ArtiEnBlanco** (baja lógica).

### Clientes y Proveedores
- **Ficha de Clientes** (10 pestañas): Calcada. Las tarifas especiales por
  cliente se llevan desde la propia ficha del cliente.
- **Ficha de Proveedores**: Calcada salvo Bancos y Observaciones.
- Transportistas: Datos generales calcada.

### Ventas
- Pedidos de clientes, Presupuestos, **TPV**, Ventas/Facturas, Repartos:
  Calcadas.
- Gestor de pedidos, Gestor de presupuestos: Calcadas.
- Números de serie, Reparaciones: Calcadas.
- Maestros de ventas: Vendedores, Técnicos, Repartidores, Zonas
  territoriales, Rutas de reparto.

### Compras
- Pedido a proveedor, Creación rápida de pedidos, Gestor de pedidos a
  proveedores: Calcadas.
- Pagos a proveedores y Gestor de pagos, Facturas de proveedor: Calcadas
  (al gestor de pagos le faltan vistas por capturar).
- Peticiones de artículos y Generar petición: construidas sin captura.
- Al **recepcionar** un pedido de proveedor entra el stock y se recalculan los
  costes. Los **gastos de transporte** se reparten entre las líneas en
  proporción a su importe. En un **abono** se elige si actualiza o no los
  costes.

### Caja
- Apertura, cierre, entradas y salidas de caja, movimientos, listado de caja,
  aperturas y cierres.
- **Solo puede haber una caja abierta por tienda** (lo impide la base de
  datos). Funciones `fn_caja_abrir`, `fn_caja_cerrar`, `fn_caja_totales`,
  `fn_caja_entrada_salida`.

### Facturación
- Facturas de clientes, **Generar facturas** (facturar albaranes a fin de
  mes), Listado de facturas, **Registros VeriFactu**.
- Ver apartado 7 para las reglas.

### Listados
- Ventas: ventas, artículos, reparaciones, presupuestos, tarjetas, divisas,
  aperturas de cajón.
- Compras: pedidos y facturas.
- Hechos con los filtros de las capturas; faltan los «tipos de informe» y
  columnas de cada uno (pendiente de capturas y de Luis).

### Contabilidad (nuevo, no existe en GeminisWin)
- Genera los **asientos** de ventas, compras, cobros, pagos y caja, con
  contraasientos cuando una factura se anula, para pasárselos a la gestoría.
- Pantallas: Plan de cuentas, Configuración contable, Generar asientos,
  Diario, Mayor, Balances, Impuestos (IGIC), Conciliación bancaria (ficheros
  Norma 43), Previsión de tesorería y Exportar a gestoría.
- Pendiente de confirmar con la gestoría el programa (probablemente Sage) y
  su formato de importación.

### Web / WooCommerce (nuevo)
- Menú Web con: configuración, importar pedidos, catálogo, errores, precios,
  categorías, pendientes, stock reservado, estado de pedidos, devoluciones,
  clientes y clientes empresa, cupones, registro, estadísticas, publicar y
  WhatsApp. Desde el 28/10 también (en consulta): imágenes y textos,
  variaciones, productos relacionados, facturas de pedidos web, envíos y
  seguimiento, solicitudes de presupuesto, reseñas y carritos abandonados
  (este último vacío: WooCommerce no los da sin un plugin).
- **Hoy solo lee** de la web (función `woocommerce-erp`, solo peticiones GET).
  **No se escribe nada en WooCommerce hasta que Rober lo autorice.** Faltan
  por configurar sus claves (son las mismas que usa el bot de WhatsApp).

## 7. Reglas de negocio ya decididas

Cosas confirmadas por Rober (o por Luis) que el ERP ya aplica. No cambiarlas
sin preguntar.

- **IGIC** (Canarias), no IVA, en todos los documentos.
- **Clientes de crédito:** se les hacen **albaranes** durante el mes y una
  **factura mensual** que los agrupa (`fn_facturar_albaranes`). El albarán no
  genera registro VeriFactu; lo genera la factura, y desde ese momento el
  albarán queda bloqueado.
- **Coste base del PVP:** se calcula sobre el **coste líquido**
  (`coste_liquido`), confirmado.
- **Transporte en compras:** se reparte en porcentaje sobre las líneas
  (implementado en proporción al importe de cada línea; Luis puede
  confirmarlo).
- **Abonos de proveedor:** pueden actualizar o no los costes; se elige.
- **El Panel de inicio no muestra datos económicos.**
- **Baja lógica** en todo: nada se borra de verdad.

## 8. VeriFactu

Obligatorio por ley para las facturas (Real Decreto 1007/2023). El ERP lo trae
integrado en la base de datos:

- Cada factura o ticket genera un registro en **`registro_facturacion`** con su
  **huella SHA-256 encadenada** con la anterior. La huella se calcula **en la
  base de datos** (funciones `fn_verifactu_*`), así no se puede manipular
  desde el navegador.
- El documento lleva su **QR** de verificación. Hoy apunta a la URL de
  **pruebas** de la Agencia Tributaria (`verifactu_configuracion`); se cambia a
  la de producción el día del arranque real.
- Una factura registrada **no se puede modificar** (lo bloquea un trigger). Si
  hay un error se **anula** o se hace una **rectificativa** (tipos R1, R5).
- Las facturas anuladas no cuentan en Contabilidad, que genera sus
  contraasientos (`fn_factura_anulada`).
- Falta: el **envío real a la Agencia Tributaria** (necesita el certificado
  digital de la empresa) y decidir el cambio a producción.

## 9. Los datos reales y la carga desde GeminisWin

- La base de datos tiene ya **una carga real de GeminisWin** (artículos,
  clientes, proveedores, familias, tarifas, stock…), para probar con
  volúmenes y casos de verdad.
- Cómo llega: Cowork, en el PC de la oficina, sube los ficheros DBF tal cual a
  la tabla `carga_dbf` (función `cargar_dbf_lote`, solo con su usuario o un administrador). Luego
  **`fn_carga_gw_todo()`** los convierte en las tablas del ERP. Se puede
  repetir las veces que haga falta: no duplica nada. El stock entra como
  movimientos de inventario, no como un número suelto.
- **No se instala nada en el servidor de GeminisWin** (decisión de Rober).
- El mapeo campo a campo y las dudas de la carga están en
  `docs/CARGA_GEMINISWIN.md`.
- Hay **datos de prueba** mezclados (códigos `ZZTEST…`, palabra `PRUEBA`,
  tienda 01, almacén 98). Se borrarán todos en la **migración definitiva**,
  cuando se vacíe la base y se cargue GeminisWin de nuevo para arrancar.
- Para probar escribiendo datos: tienda **01**, almacén **98**, códigos que
  empiecen por **ZZTEST** o con la palabra **PRUEBA**.

> Las capturas de GeminisWin llevan **datos reales de clientes**: sirven para
> copiar la pantalla, nunca se copian sus datos al código ni a los datos de
> prueba.

## 10. Usuarios, permisos y seguridad

- **Entrar:** se escribe solo el **nombre de usuario** (por ejemplo `luis`); el
  ERP le añade por dentro `@ofipapel.local` para Supabase Auth.
- **Usuarios de ahora:** `rober`, `luis` (administrador), `cowork` (solo para
  cargar datos) y `prueba`. Las claves no están en este documento: se pasan en
  persona y cada uno cambia la suya en **Archivo → Cambiar contraseña**.
- **Administradores** (`rol.es_administrador`): pueden crear usuarios y poner
  claves a los empleados desde **Archivo → Empleados → Seguridad**. Lo hace
  la Edge Function **`empleados-acceso`**, que comprueba que quien lo pide es
  administrador.
- **Reglas de acceso (RLS):** sin sesión no se lee ni se escribe nada.
- **Permisos por grupo de acceso** (como GeminisWin): cada empleado pertenece a
  un grupo (`empleado.rol_id`, se elige en Empleados → Seguridad) y solo puede
  usar las opciones de menú marcadas para su grupo en **Archivo → Grupos de
  Acceso**; las demás salen en gris en los menús y la barra lateral, y si se
  escribe la URL sale «No tienes permiso para esta opción». Cada opción de menú
  es un permiso (`permiso.tipo = 'menu'`, código = su ruta, p. ej.
  `/caja/movimientos`, o `accion:generar-peticion`); una ruta da acceso a lo
  que cuelga de ella. Catálogo y reglas en `src/lib/permisos.ts` (sale solo de
  `menus.ts`: una opción nueva aparece en la pantalla de grupos y se da de alta
  en `permiso` al abrirla un administrador). Los permisos del usuario los da
  `fn_mis_permisos()` y se exponen con `usePermisos()`. Los administradores lo
  pueden todo. Sin empleado o sin grupo: solo Panel y Cambiar contraseña.
  El Panel no enlaza a pantallas no permitidas y NEXA no las propone (filtro en
  la Edge Function). Solo administradores escriben en `rol`/`rol_permiso`/
  `permiso` (políticas restrictivas) y no se puede quitar «Administrador» al
  último grupo administrador. Las tablas de configuración y administración
  (empresa, tiendas, formas de pago, series, contadores, configuración VeriFactu/
  web/contable, empleados, ejercicios…) solo las escriben administradores, y
  `registro_facturacion` y `auditoria` no se tocan por la API (políticas
  restrictivas, `20261028_seguridad_config.sql`).
- **El permiso de menú también en la base** (`20261028_seguridad_funciones.sql`):
  `fn_puede('<ruta>')` aplica la misma regla que `rutaPermitida`. Las funciones
  que anulan o rectifican documentos VeriFactu, cobran, recalculan deuda o
  stock, dan de baja artículos, modifican en bloque o liquidan comisiones
  empiezan comprobando el permiso de su pantalla (error `42501` «No tienes
  permiso…»). `cargar_dbf_lote` solo la usan `cowork` (por su id) o un
  administrador; las `fn_carga_gw_*` ya no se ejecutan por la API (se lanzan por
  SQL). **Borrar físicamente** artículos, clientes, proveedores, familias,
  marcas, vendedores, bancos, rutas, zonas… es solo de administradores: los
  demás dan de baja; la ficha avisa si no se pudo borrar. Si cambias
  `REDIRECCIONES` en `permisos.ts`, cámbialas también en `fn_puede`.
- **Escrituras por permiso de pantalla** (`20261029_seguridad_escrituras.sql`,
  29/10): en las 95 tablas de negocio (maestros, clientes, artículos, almacén,
  compras, ventas, caja, facturación, repartos, web) alta, modificación y
  borrado solo los hace quien tiene permiso en alguna pantalla que
  legítimamente escribe en esa tabla (`fn_puede_alguno`, políticas
  restrictivas `permiso_alta/modifica/borra_<tabla>`); administradores
  siempre, `cowork` en las tablas de la carga. Leer sigue abierto a todo
  empleado con sesión. **Si una pantalla nueva escribe en una tabla de
  negocio, hay que añadir su ruta al array de esa tabla** (mapa y cómo
  ampliarlo en `SEGURIDAD_BD.md` §7); si no, a quien no sea administrador no
  le guardará. Pendiente: Contabilidad (`fn_contab_*`, `cuenta_contable`,
  extractos) tiene plan aparte, y limitar la lectura de datos sensibles.
  Inventario, clasificación de funciones, pruebas y plan en
  **`docs/SEGURIDAD_BD.md`**.

## 11. NEXA, la asistente con IA

Una asistente dentro del ERP para preguntar en lenguaje normal («¿qué pedidos
están pendientes de servir?», «¿cuánto stock queda de tal artículo?») y que
lleve a la pantalla adecuada.

- **Se abre** con el avatar de la esquina superior derecha (en la franja del
  título y los menús, para no tapar botones de las ventanas) o con
  **Ctrl+Espacio**. Saluda según
  la hora de Canarias y por el nombre del empleado, y **habla en voz alta**
  (se puede silenciar; la preferencia se recuerda).
- **El avatar** es una cara hecha de partículas (WebGL2, `src/nexa/visual`)
  que cambia según el estado: en reposo, pensando, hablando o alerta.
- **Sabe en qué pantalla estás** (`useNexaContexto`) y lo usa para contestar.
- **Cómo funciona por dentro:** la conversación va a la Edge Function
  **`nexa`**, que llama a Claude (clave de Anthropic «ERP Ofipapel - NEXA»,
  guardada como secreto en Supabase). Claude tiene estas herramientas:
  `describir_tablas`, `consultar_bd`, `abrir_pantalla`, las del centro de
  listados y las de cambios (`describir_funciones`, `proponer_cambio`,
  `ejecutar_cambio`; abajo).
- **Seguridad:** NEXA trabaja **siempre con la identidad y los permisos del
  usuario que le habla** (su JWT: RLS, políticas por pantalla, `fn_puede`).
  Lee con `fn_nexa_consulta` (solo lectura) y, desde el 31/10/2026, también
  **escribe**, pero solo por el camino proponer → confirmar → ejecutar de
  abajo. **Nunca puede saltarse el sistema de permisos**: lo que el grupo del
  usuario no puede hacer en pantalla, tampoco lo hace NEXA por él.

### NEXA con control total (31/10/2026)

Decisión de Rober: NEXA puede leer, escribir y razonar sobre todo el ERP
(tablas y funciones, las de hoy y las que se creen). Migración
`supabase/migrations/20261031_nexa_control_total.sql` (aplicada en 6 partes,
`nexa_control_total_1..6`) y Edge Function `nexa` (versión 8, `verify_jwt`).

- **Cómo cambia algo:** `proponer_cambio` llama a `fn_nexa_proponer`, que
  **simula** los pasos con los permisos del usuario dentro de un subbloque que
  se deshace siempre, recoge de la auditoría TODO lo que cambiaría (también lo
  que hacen los triggers), calcula el **nivel** y guarda la propuesta en
  `nexa_propuesta` (caduca a los 10 minutos). El panel enseña una tarjeta con
  lo que cambia (antes → después, registros por tabla). `ejecutar_cambio`
  comprueba en la Edge Function el **último mensaje del usuario** (no lo que
  diga la IA), firma la propuesta (HMAC con un secreto que solo conocen la
  función y la base, en `nexa_privado.secreto`) y `fn_nexa_ejecutar` la repite
  con el JWT del usuario. Solo ejecuta una propuesta **del mismo usuario,
  pendiente, sin caducar, creada en una petición anterior** y con firma buena.
- **Niveles** (color de la tarjeta):
  1. Consultar: nada (devuelve el resultado).
  2. Cambio leve (1 registro, ≤2 campos sin importes): antes → después + «sí».
  3. Cambio normal: qué y cuántos + «sí» + resumen de lo hecho.
  4. Masivo (>20 registros) o con dinero/stock: vista previa total +
     **palabra de confirmación** (p. ej. `ADELANTE-998`) + **motivo** + resumen.
  5. Crítico o legal (anular/rectificar VeriFactu, permisos y usuarios,
     borrado físico): lo del 4 + **contraseña** verificada en el servidor con
     Supabase Auth + **solo administradores**. La contraseña va en un campo de
     la tarjeta, viaja solo en esa petición (`credencial`), no entra en el
     historial ni se guarda (comprobado: no aparece en `nexa_propuesta`).
- **VeriFactu** nunca se borra ni se modifica (`registro_facturacion` está
  bloqueada en el catálogo): solo se anula o rectifica con sus funciones.
  Contabilidad (`fn_contab_*`, asientos, cuentas) también está bloqueada.
- **Auditoría:** cada fila tocada lleva en `auditoria.origen`
  «NEXA · nivel N · propuesta P · motivo: …».
- **Catálogo `nexa_operacion`:** nivel, permiso y bloqueos por función o tabla
  (admite `%`), y la **receta** de lo que una pantalla hace en varias tablas
  sin función SQL (p. ej. regularizar stock = `regularizacion_stock` +
  `movimiento_stock`; presupuesto = cabecera + líneas). Lo no catalogado
  recibe el **nivel prudente**: alta 3, modificar 2-3, tablas de dinero/stock 4,
  configuración/seguridad 5, borrado físico 5; funciones de solo lectura 1, que
  cambian datos 4, de anular/rectificar/VeriFactu/permisos/usuarios 5.
  **NORMA: cada función o tabla nueva del ERP se añade a `nexa_operacion` con
  su nivel (y su receta si hace falta)**; si no, NEXA usa el nivel prudente.
  `describir_funciones` (`fn_nexa_funciones`) le enseña a NEXA las funciones
  que el usuario puede ejecutar, con argumentos, nivel y receta.
- **Modelo:** `claude-sonnet-5-5` por defecto («por ahora algo barato»); el
  secreto `NEXA_MODEL` manda si existe. Con Sonnet las herramientas de varios
  niveles funcionan bien en todas las pruebas (propone, para, pide palabra o
  contraseña, ejecuta solo tras confirmar y resume). Pendiente (solo idea):
  elegir el modelo según la pregunta (consultas con uno barato, cambios de
  nivel 4-5 con uno más potente).
- **Sugerencias de bienvenida:** «Tus listados» (`fn_nexa_sugerencias`): los
  3 más usados por el empleado → si no, por su grupo → si no, los guardados
  visibles más recientes (nunca vacío si hay alguno). Sacar un listado
  guardado por NEXA apunta su uso (`fn_listado_usado`). Debajo, 4-5 frases
  fijas según el grupo, solo de lo que su grupo tiene: gerencia (resumen,
  ventas por vendedor, deuda, bajo mínimo, compras) o mostrador (stock,
  cliente, pedidos, reparaciones, presupuesto — sin dinero).
- **Los 503:** son `BOOT_ERROR` de Supabase (logs del 31/10 02:08): con 8
  preguntas a la vez, el plan gratuito no levantó más copias de la función en
  10 s y dos peticiones fallaron sin llegar a ejecutar nada. No es un fallo del
  código. Mitigación: el panel reintenta solo ante 503/429 (2 s y 5 s, seguro
  porque la función no llegó a hacer nada) y, si persiste, avisa «NEXA está muy
  ocupada».
- **Pruebas reales (01/11/2026, por la Edge Function con el JWT de `rober`):**
  nivel 2 (observación de ZZ002, «sí»), nivel 3 (3 clientes ZZ003-5; con «no»
  no hace nada), nivel 4 (regularizar ZZTEST-001 en almacén 98 de 11 a 12:
  regularización + movimiento + stock, con palabra y motivo), nivel 5 (anular
  la venta de prueba 01/66: registro VeriFactu de anulación). Sin palabra, sin
  contraseña, con contraseña mala, con propuesta caducada o de otro usuario, o
  con firma inventada por RPC: **no se ejecuta**. `prueba` (DEPENDIENTE) no
  puede modificar proveedores ni anular ventas por NEXA. Auditoría con origen
  NEXA en todos. En el navegador (Playwright, como `prueba`): bienvenida con
  «Tus listados» (PRE-0001 el primero, por uso) y las 5 frases de mostrador, y
  tarjeta de nivel 2 con antes → después.

### NEXA, centro de listados e informes (31/10/2026)

Petición de Rober: «el centro de listados y de todo debe ser NEXA». El empleado
pide en lenguaje normal un listado («listado de clientes de la zona Arona
Centro», «ventas de octubre por vendedor», «artículos sin stock de la familia
de papel», «el listado CLI-0001») y NEXA se lo da como **tabla en su panel**
(se amplía sola), con botones **Excel** (.xlsx de verdad, números como
números, con la identificación del listado arriba), **PDF / Imprimir** (ventana
aparte con código, qué incluye, quién lo saca y «Página X de Y»), **Abrir en el
Generador** y, si no estaba guardado, **Guardar**.

- **Cómo lo hace:** primero busca un listado guardado del Generador de Luis
  (`buscar_listados`); si encaja, lo saca por su código (`ejecutar_listado`,
  pudiendo añadir filtros, p. ej. el mes). Si no hay, lo monta sobre las vistas
  `v_lst_*` (columnas, filtros, agrupar y sumar, orden), mirando antes el
  informe equivalente de GeminisWin (`informe_geminiswin`, tabla `gw_informe`)
  para copiar sus columnas, agrupación y totales. Enseña hasta 500 filas y
  dice el total real. Después ofrece guardarlo; solo lo guarda
  (`guardar_listado`) si el último mensaje del usuario es un «sí» (lo comprueba
  la Edge Function, no solo la IA), en la misma tabla y formato que la
  pantalla del Generador y con su código automático (CLI-0005…), a nombre de
  quien lo pide.
- **Permisos (migración `20261031_nexa_listados.sql`, todo SECURITY INVOKER con
  el JWT del usuario):** `fn_listado_fuente_permisos` dice qué pantallas dan
  acceso a cada fuente (ventas → `/ventas`, `/tpv`, listados de ventas,
  facturación…; compras → pedidos a proveedor y sus listados; etc.) y
  `fn_listado_fuente_permitida` lo comprueba con `fn_puede_alguno` (admin
  siempre). `fn_nexa_listados_buscar` solo devuelve guardados que la RLS deja
  ver **y** de fuentes permitidas; `fn_nexa_listado` reutiliza
  `fn_listado_ejecutar` (la del Generador, sin tocarla) y añade el total;
  `fn_nexa_listado_guardar` exige además `/listados`. Probado: el grupo
  DEPENDIENTE (`prueba`) no ve ni saca compras, facturas ni proveedores (ni por
  código: «COM-0001» no existe para él). **Fuente nueva del Generador =
  añadirla en `fn_listado_fuente_permisos`** (sin entrada, solo la ve un
  administrador).
- **Abrir en el Generador:** un guardado abre `/listados?id=…`; uno montado al
  vuelo abre `/listados?fuente=…&filtro=col:valor` (lo que ya admite la
  pantalla de Luis: fuente y filtros «igual a»; columnas y el resto se eligen
  allí). La pantalla del Generador no se ha tocado.
- **Código:** herramientas en `supabase/functions/nexa/index.ts`; tabla y
  botones en `src/nexa/NexaAsistente.tsx` (`TablaListado`); etiquetas, Excel,
  impresión y enlace en `src/lib/listados/resultado.ts` (reglas del Generador:
  nombres de `fuentes.ts`, sin sumar números/años, fechas dd/mm/aaaa);
  `crearXlsx` (`src/lib/hojaCalculo.ts`) acepta ahora números y la fila en
  negrita.
- **Pendiente:** «Abrir en el Generador» de un
  listado montado al vuelo no lleva sus columnas ni filtros que no sean «igual
  a» (haría falta que la pantalla aceptara la definición entera por URL); las
  conversaciones guardadas conservan las filas solo de los 3 últimos listados.

## 12. Cómo trabajamos para no pisarnos

1. **Un encargo = una sesión de Claude**, en su propia rama, que al terminar
   se junta en `erp`.
2. **No trabajar los dos a la vez en la misma pantalla o módulo.** Si vas a
   empezar algo grande, avísalo antes (WhatsApp o una nota en
   `coordinacion_notas`).
3. **La base de datos es la misma para los dos** (no hay una de pruebas
   aparte). Los cambios de estructura, siempre como migración guardada en
   `supabase/migrations/`.
4. **No se publica a mano:** lo que entra en `erp` sale solo. Si una
   publicación falla, aparece como «Failed» en la lista de Netlify.
5. **Antes de empezar y al terminar**, mirar `coordinacion_notas` y dejar una
   nota de lo hecho.
6. **Capturas:** las saca Cowork y llegan en ZIP; se adjuntan a la sesión de
   Claude que vaya a construir esa pantalla.

### Cosas del entorno que conviene saber (para el Claude)

- En Supabase, las órdenes `DROP POLICY/TRIGGER/CONSTRAINT`, `DELETE` y
  `TRUNCATE` lanzadas desde Claude **se quedan esperando una confirmación**
  del usuario. Si hacen falta, avisa antes.
- Para probar en el navegador con Playwright desde una sesión en la nube hace
  falta el certificado del proxy (pin SPKI) y ejecutar con
  `NODE_PATH=$(npm root -g)`.
- Las publicaciones gastan minutos de construcción de Netlify, no tokens de
  Claude.

## 13. Lo que falta (por orden aproximado)

**Arreglos conocidos**
- Resueltos el 28/10/2026: NEXA ya no tapa «Salir» (ahora está arriba a la
  derecha, en la cabecera); Factura de cliente, Aperturas y cierres y
  Peticiones navegan por registro vecino; gestores y listados ya no se cortan
  en 1000 filas (`todasLasFilas`); el TPV apunta las aperturas de cajón.
- Reparaciones, Repartos e Inventarios también navegan ya por registro vecino
  (`useNavRegistro`) y saltan a un número escribiéndolo en «Número» (28/10).

**Funcionalidad**
- **Gestor de pagos de clientes** (cobros): construido sin captura el 28/10
  (Facturación → Gestor de Pagos de Clientes y Clientes → Pagos de Clientes,
  Cobros); se ajusta cuando lleguen sus capturas.
- Permisos por grupo de acceso: hechos (apartado 10); falta llevarlos a las RLS de cada tabla.
- Tipos de informe y columnas de los Listados.
- Contabilidad: formato de exportación de la gestoría.
- WooCommerce: configurar claves; más adelante, escribir en la web (cuando se
  autorice).
- VeriFactu: envío real a la Agencia Tributaria.
- Al final: un **robot de pruebas** que recorra las pantallas.

**Capturas pendientes** (lista completa en `COORDINACION.md`): Apertura y
cierre de caja, Generar facturas, Gestor de pagos de clientes, Listados de
pedidos y de remesas, las pestañas Bancos (con ficha vacía), Utilidades de
Archivo…

**Preguntas para Luis** (lista completa en `COORDINACION.md`): significado de
códigos numéricos de GeminisWin (D.C., tipo de factura global, control de
lotes, estados de reparto…), cómo numera las series de facturas, cómo trata
la caja los cierres y el crédito, y los datos de la gestoría para
Contabilidad. **Son lo que más desbloquea ahora mismo.**

**Arranque real** (más adelante): vaciar los datos de prueba, cargar
GeminisWin completo, pasar VeriFactu a producción, dar de alta a los
empleados con sus permisos y elegir el día del cambio.

## 14. Por dónde empezar, Luis

1. Entra en la web de prueba con tu usuario y cambia la clave.
2. Recorre las pantallas que más uses en GeminisWin y apunta lo que no se
   parezca o no funcione igual.
3. Contesta las **«Preguntas para Luis»** de `COORDINACION.md`: a tu Claude
   se las puedes dictar tal cual y que las apunte.
4. Para encargar algo, pídeselo a tu Claude en una sesión nueva sobre la rama
   `erp`, con la captura de GeminisWin si es una pantalla.

### Memoria de NEXA (02/11/2026)

- Tabla `nexa_memoria` (migración `20261102_nexa_memoria.sql`): memoria **global** (todo el equipo, la ve cualquiera, la
  escribe quien tenga `accion:nexa-memoria-global`: administradores y GERENCIA) y **personal** (solo de cada persona).
- NEXA la lee en cada conversación (va en sus instrucciones, bloque `<memoria>`), no solo dentro de una charla.
- Herramientas `recordar` / `olvidar`: solo cuando la persona lo pide o lo confirma. «Olvidar» desactiva, no borra, y todo
  queda en la auditoría. No guardar en ella datos personales, claves ni nada confidencial.
- Límite conocido: «olvidar» pide confirmación si el mensaje lleva un «no» (p. ej. «ya no hace falta»).

### App de repartidores y seguimiento en TV (03/11/2026)

- **App del móvil:** `/repartidor` (pública, sin cuenta del ERP), código en `src/reparto-app/`. El repartidor toca su
  nombre, pone su PIN de 4 cifras (5 fallos = bloqueo 15 min) y elige su ruta (solo las suyas o sin repartidor).
  ① Comprobar: marca los albaranes que lleva antes de salir. ② Repartir: Entregado / Incidencia (faltan, devuelve,
  no corresponde, otro con texto obligatorio) / No entregado (motivo; 1.er y 2.º intento con hora automática).
  Ordena arrastrando (⋮⋮). Lo que viene de un reparto anterior sale arriba y en rojo. Sin cobertura: guarda y envía
  después. Ubicación solo con la ruta abierta y si el repartidor la acepta. `?r=CODIGO` abre con el nombre elegido
  (para enlazarla desde Fichaje).
- **ERP:** Ventas → Seguimiento de Repartos (`/repartos/seguimiento`): vista Rutas (una línea por ruta) y Mapa de
  Tenerife, ranking semanal, totales semana/mes/año, «Modo TV» (pantalla completa, alterna cada 30 s), «Cerrar
  reparto» y «PIN de la app».
- **Cerrar reparto** (`fn_reparto_cerrar`): lo no entregado, con incidencia o sin marcar pasa al siguiente reparto
  abierto de la ruta (o a uno nuevo del siguiente día de reparto) como «viene de anterior».
- **Base de datos:** migración `20261103_reparto_app.sql` (funciones de la app `fn_app_rep_*`, internas en el esquema
  `reparto_privado`, que la API no expone). Pendiente: de dónde salen los **bultos** (Rober lo habla con el equipo) y
  borrar posiciones de más de 30 días con una tarea programada.

### Fichaje dentro del ERP (03/11/2026, Rober)

- Sustituye a `fichaje.html` (Firebase, sin estrenar: nada que migrar). Migración `20261103_fichaje.sql`.
- **Pantalla de fichar:** `/fichaje` (pública): grupo → nombre → PIN de 4 cifras → Entrada / Pausa / Fin de pausa /
  Salida según el estado. La hora la pone el servidor; la ubicación se manda si el móvil la da (nunca bloquea).
  Código en `src/reparto-app/FichajeApp.tsx`.
- **Gestión:** Archivo → Fichaje (`/fichaje-gestion`, permiso del mismo nombre, dado a GERENCIA): Hoy, Alertas
  (fuera de horario / fuera de sitio, 7-30-90 días), Personas (los empleados del ERP: ficha, departamento,
  repartidor enlazado, PIN), Histórico, Corrección, Exportar (mes o fechas, PDF/Excel/WhatsApp), Horarios y
  festivos, Ubicaciones, Normativa y Operativa.
- **Ley (art. 34.9 ET):** `fichaje_evento` no se modifica ni se borra (trigger). Una corrección es un registro nuevo
  con motivo y autor que anula el equivocado (`anulado_por`). Con auditoría.
- **Reparto:** con el repartidor enlazado en Personas, `fn_app_rep_marcar` no deja entregar sin la entrada fichada
  ese día (mira la hora del marcado, vale sin cobertura). Al fichar sale «🚚 Mi reparto» → `/repartidor?t=token`.
  Repartidor sin enlazar: no se bloquea y la app lo avisa.
- **NEXA:** lee las tablas `fichaje_*` como el resto (esquema automático, con los permisos del usuario).
- **Mi fichaje:** botón de la barra de accesos (el segundo, en verde). Ficha quien tiene la sesión del ERP abierta
  (`fn_fichaje_mio` / `fn_fichaje_fichar_mio`, migración `20261103_fichaje_mio.sql`); en un ordenador compartido,
  «Otra persona» con nombre + PIN. Así cada uno ficha en el ordenador más cercano, sin colas.
- **Control de Repartos** (Ventas, antes «Repartos»): una sola ventana. Arriba, «Repartos de hoy» en vivo
  (`ControlRepartosHoy.tsx`): una fila por ruta con un punto por pedido en el color de su estado, Cerrar reparto,
  Mapa, PIN de la app y Pantalla de la TV. Pulsando una ruta se abre debajo su ficha, que se recarga cada 15 s
  mientras se consulta: el estado de cada pedido (coloreado) y la columna «Situación» cambian al momento con lo que
  marca el repartidor. Sin ranking ni totales (eso es solo la TV). La pantalla aparte de seguimiento ya no existe.
