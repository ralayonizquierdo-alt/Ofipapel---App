# Gestor de Roturas (tarea 32)

Sustituye por completo a la app RAX-OS «Devoluciones y Roturas» (Vercel + Firebase): se migran todos
sus expedientes y después se apaga. Código de referencia: repo `RAX-OS`, `src/lib/domain/tipos.ts`.

## Dónde va en el ERP
- **Una sola entrada de menú: Almacén → Gestor de Roturas** (Rober, 12/11/2026). Una sola pantalla
  (`GestorRoturasPage`), con pestañas que se enseñan según el permiso de quien entra:
  - Registrar rotura → todos (`/roturas-peticion`, que es también el permiso para entrar).
  - Para destruir y Separados → `/roturas-destruccion`.
  - Pendientes de Compras, Reclamadas, Cuadrar abono y Todos → `/gestor-roturas`.
  Las rutas `/gestor-roturas` y `/roturas-destruccion` siguen abriendo la misma pantalla.
- **Permisos (Rober, 12/11):** Gerencia, Administrador y Compras, todo; Almacén, registrar y destruir;
  el resto, solo registrar (`20261112_roturas_permisos_grupos.sql`).
- **El desperfecto es obligatorio** al registrar (pantalla y servidor:
  `20261112_roturas_desperfecto_obligatorio.sql`).

## Decisiones de Rober (11-12/11/2026)
- 10 estados (RAX-OS tenía 16). Recambio = compensación con género: un solo camino.
- El ERP hace la baja del Almacén 06 y el traspaso 06→04. Nadie teclea números de traspaso.
- Sin Excel de Géminis, sin cron de obsoletos y **sin correos a Gerencia**.
- El abono crea la factura de abono del proveedor y queda «pendiente de contabilizar»
  (la contabilidad se sustituirá por CONTANET: no se programa ningún asiento ahora).
- «Abonado» (el proveedor se llevó la mercancía) no pasa por destrucción, pero sí da de baja el stock del 06.

## Estados
PENDIENTE_COMPRAS → ABONO_PROVEEDOR / SEPARADO_PROVEEDOR / OBSOLETO_DESTRUIR ·
ABONO_PROVEEDOR, SEPARADO_PROVEEDOR, PENDIENTE → RECHAZADO / ABONADO / ABONADO_DESTRUIR / COMPENSADO_DESTRUIR ·
RECHAZADO → OBSOLETO_DESTRUIR / DESTRUIDO · *_DESTRUIR → DESTRUIDO. Finales: ABONADO y DESTRUIDO.
La tabla `rotura_transicion` es la única fuente: cada paso dice qué permiso lo puede hacer y si es
«solo_proceso» (mueve stock o documentos y solo lo hace su función propia).

## Migración de expedientes antiguos (estados que desaparecen)
EN_ESTUDIO → PENDIENTE · RETIRADO_POR_PROVEEDOR y A_ESPERA_DE_ABONO → SEPARADO_PROVEEDOR ·
PROVEEDOR_ENVIA_RECAMBIO y A_ESPERA_DE_RECAMBIO → PENDIENTE · CERRADO → histórico ya resuelto.
El estado original se guarda en `estado_origen` y el id de Firestore en `origen_id`.

## Fases
| Fase | Qué | Estado |
|---|---|---|
| 1 | Tablas, historial inmutable, máquina de estados, permisos | **Hecha 12/11** (`20261112_roturas_base.sql`) |
| 2 | Adjuntos (fotos y documentos, almacenamiento privado) | **Hecha 12/11** (`20261112_roturas_adjuntos.sql`, `src/lib/roturas.ts`) |
| 3 | Almacén: Petición de Abono (sin cobertura) y Confirmar Destrucción (baja de stock) | **Hecha 12/11** (`20261112_roturas_stock.sql`, `pages/almacen/roturas/`) |
| 4 | Compras: Gestor de Roturas y reclamación en PDF por correo (compras@) | **Hecha** (12/11/2026) |
| 5 | Cuadre con IA: abono (factura de abono) / género (traspaso 06→04) | **Hecha** (12/11/2026) |
| 6 | Migración desde Firebase, prueba en paralelo y apagado de RAX-OS | Pendiente (necesita copias, tarea 24) |

## Fase 1: qué hay y cómo se probó
Tablas `rotura_estado`, `rotura_transicion`, `rotura_expediente`, `rotura_historial`,
`rotura_documento`, `rotura_contador`. Funciones `fn_rotura_crear`, `fn_rotura_destinos`,
`fn_rotura_cambiar_estado`, `fn_rotura_anular`. Nadie escribe en las tablas desde el navegador.
Probado simulando usuarios (todo deshecho al terminar): sin permiso no se crea ni se ve nada; alta con
número EXP-2026-000001; el reenvío del móvil no duplica; cantidad 0 rechazada; saltos de estado no
permitidos rechazados; los pasos con stock rechazados por el cambio genérico; historial con una fila
por cambio, que no se puede modificar ni borrar; el expediente no se borra, se anula con motivo; todo
queda en la auditoría.

## Fase 2: adjuntos
Almacenamiento privado `roturas` (15 MB por fichero; fotos, PDF, Excel, correos). Ruta
`<id expediente>/<uuid>-<nombre>`. Se sube y se lee solo con permiso de Roturas; no se puede cambiar
ni borrar un fichero desde el navegador. `fn_rotura_documento_registrar` lo apunta en el expediente.
Las fotos se reducen en el navegador (1600 px) antes de subir. Probado simulando usuarios: no se sube
a expedientes inexistentes ni fuera de carpeta, no se registra lo no subido, y sin permiso no se ve
ni se sube nada. **Falta probar una subida real desde el navegador** (llega con las pantallas).

## Grupos de acceso (creados el 12/11, `20261112_roturas_grupos.sql`)
- **Almacén**: todo el menú Almacén (incluye Petición de Abono y Confirmar Destrucción).
- **Compras**: todo el menú Compras (incluye el Gestor de Roturas) y registrar roturas.
Se ajustan en Archivo → Grupos de Acceso. Aún no hay ningún empleado asignado a ellos.

## Fase 3: stock y pantallas de Almacén
**Stock (lo mueve el ERP, con origen «rotura» en `movimiento_stock`):** al registrar, traspaso del
almacén de origen al 06; al destruir un obsoleto o rechazado, baja del 06; al anular, vuelve a su
almacén. Los abonados y compensados se darán de baja al cuadrar (fase 5), por eso su destrucción no
mueve stock. Almacenes fijos en `roturas_privado.almacen_roturas()` = 06 y `almacen_venta()` = 04.

**Pantallas** (`RoturasAlmacenPage`): Registrar rotura (búsqueda por código, barras o descripción;
fotos; cola sin cobertura en IndexedDB, `src/lib/roturasPendientes.ts`), Para destruir, Separados para
el proveedor (etiqueta por proveedor, una por hoja) y Operativa.

**Probado:** funciones con usuarios simulados y todo deshecho (stock 01 y 06 cuadran tras registrar,
anular y destruir). Pantallas en navegador real con el alta SIMULADA: alta con foto, registro sin
cobertura, envío automático al volver la conexión, y las tres pestañas. **No probado todavía:** un alta
real de principio a fin desde el navegador, ni la impresión de etiquetas con datos.

**Numeración hasta la migración:** el contador de 2026 empieza en 900000, así que lo que se cree en el
ERP sale como `EXP-2026-9xxxxx` y no choca con los números de RAX-OS. Al migrar hay que poner
`rotura_contador.ultimo` en el último número real.

**Límite del modo sin cobertura:** funciona con la pantalla ya abierta; el ERP no se abre desde cero sin
conexión (tarea 33).

## Fase 4: Gestor de Roturas (Compras) y reclamación por correo
Pantalla **Compras → Gestor de Roturas** (`/gestor-roturas`, `src/pages/compras/roturas/`): pestañas
Pendientes de Compras, Reclamadas, Todos y Operativa, y la ficha del expediente (datos, fotos,
documentos, historial, «Pasar a», anular).

- **Reclamar:** se marcan expedientes de un solo proveedor. El navegador hace el PDF
  (`reclamacionPdf.ts`: lista + anexo de fotos, máx. 12 fotos y 2,7 MB; si no cabe, va sin fotos y avisa),
  lo sube al bucket privado `roturas` en la carpeta del expediente de menor id y llama a
  `fn_rotura_reclamar`, que comprueba todo, encola el correo (buzón `compras`, origen
  `rotura_reclamacion`, PDF en `correo_pendiente.adjuntos`) y pasa los expedientes a ABONO_PROVEEDOR.
- **Adjuntos en el correo:** `correo-enviar` baja los adjuntos del almacenamiento privado (tope 3 MB en
  total) y los manda tanto por Microsoft Graph como por SMTP.
- **Si el correo no sale**, el expediente queda reclamado igualmente y la lista enseña el motivo con un
  botón «Reintentar» (`fn_rotura_correos`, `fn_rotura_correo_reintentar`).
- Separar para el proveedor y destruir como obsoleto: sin correo, desde Pendientes.
- Migración: `20261112_roturas_reclamacion.sql`.

**Probado:** `fn_rotura_reclamar` con usuarios simulados (todo deshecho); un correo real con PDF adjunto
desde el buzón de Compras a una dirección propia; y la pantalla en el navegador con datos simulados
(marcar, aviso de dos proveedores, PDF generado y subido, reclamar, reintentar, ficha, cambio de
situación, filtro). **Sin probar:** una reclamación real de principio a fin a un proveedor.

## Fase 5: cuadre del abono con IA
Pestaña **Cuadrar abono** del Gestor (`CuadreRoturas.tsx`). Rober (12/11): el cuadre no se hace a ojo.

1. Se elige el proveedor y se arrastra (o se examina) el PDF que manda.
2. La función del servidor `rotura-cuadre-ia` lo lee con la IA (clave en el secreto `ANTHROPIC_API_KEY`;
   modelo en `ROTURAS_MODEL`, por defecto `claude-opus-5-5`) y **propone** a qué expediente abierto del
   proveedor corresponde cada línea, con su confianza y avisos. No guarda nada. Exige sesión y permiso
   `/gestor-roturas`, lee los expedientes con la sesión de la persona (RLS) y descarta cualquier id que
   no esté en la lista o venga repetido. El PDF se trata como dato, no como instrucciones.
3. La persona revisa con el PDF al lado (importes, cantidades en rojo si no coinciden, «✔ Cuadra» o la
   diferencia con la base) y confirma. También hay «Cuadrar a mano».
4. `fn_rotura_cuadrar` (`20261112_roturas_cuadre.sql`) lo aplica todo o nada:
   - **Abono:** baja del 06 (devolución a proveedor), factura de abono del proveedor en negativo y sin
     contabilizar, `pendiente_contabilizar`, `importe_abonado`; estado ABONADO (se lo llevó) o
     ABONADO_DESTRUIR.
   - **Compensación con género:** traspaso 06→04; estado COMPENSADO_DESTRUIR.
   - Queda el lote en `rotura_cuadre` (documento, totales, PDF y lo que leyó la IA).

No se programa ningún asiento ni se manda correo. Un cuadre confirmado no se deshace desde la pantalla.

