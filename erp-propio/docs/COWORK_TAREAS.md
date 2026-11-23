# Tareas de Cowork (GeminisWin)

> Las tareas 2, 3 y 4 (PC de Rober) forman el agente **Geminio** (código `geminis_pc`), con su ficha en el hub y en
> NEXA. Cómo conectarlo al ERP: apartado «Geminio: avisar al ERP», al final.

Rober, 23/11/2026: «que quede constancia de todas las automatizaciones y agentes que tengo por ahí, por si me olvido
de algo». Aquí solo está lo que hace **Cowork** (Claude con acceso al escritorio de un PC de la oficina, donde está
GeminisWin). Los agentes del ERP (E-milio, Whacimara, Virgilio) tienen su propio documento.

Hay **más de un Cowork**, cada uno en un PC distinto. Cada tarea dice dónde corre y cómo se lanza.

| # | Tarea | PC | Cómo se lanza | Qué deja |
|---|---|---|---|---|
| 1 | **Cerrar los repartos del día** en GeminisWin a partir del parte de la app de repartidores y **generar los del día siguiente** (habilidad `cerrar-reparto-geminiswin`) | PC de Mónica | Por confirmar | Repartos cerrados en GeminisWin |
| 2 | **Generar el pedido semanal de informática**: propuesta del Generador de Pedidos de GeminisWin con las ventas de domingo a domingo, unida en un Excel (habilidad `generar-pedido-informatica-geminiswin`) | PC de Rober | **A mano**: Rober se lo pide al chat de Cowork | Excel «PEDIDO dd--dd MMM» en la carpeta PEDIDOS INFORMATICA |
| 3 | **Importar los pedidos de informática** en Compras de GeminisWin (Excel semanales de UFP, EXADI e INFORPOR), imprimir las hojas de control y archivar los ficheros en la carpeta de la semana (habilidad `importar-pedidos-informatica-geminiswin`) | PC de Rober | **A mano**: Rober se lo pide al chat de Cowork | Pedidos en GeminisWin, hojas impresas, ficheros archivados |
| 4 | **Listados de GeminisWin para Finanzas** (encargo de Luis). Detalle abajo | PC de Rober (`C:\Ofipapel\Herramientas`) | **Automático**: cada día laborable a las 9:50 | Carpeta LISTADOS AUTOMATIZADOS, app de Finanzas y correo |

## 4 · Listados de GeminisWin para Finanzas (proceso automático del PC de Rober)

Programa en `C:\Ofipapel\Herramientas` del PC de Rober. Arranca **cada día laborable a las 9:50**. Lo de cada día va
solo a la app de Finanzas; a la carpeta `\\SERVER-OFIPAPEL\Aplicaciones\ARCHIVOS OFIPAPEL\LISTADOS AUTOMATIZADOS` solo
va lo de los días que toca. Datos según el código que revisó el Cowork de Rober el 17/11/2026.

| Cuándo | Qué hace |
|---|---|
| **Cada día laborable** | Sube a Finanzas las **ventas por caja** y los **pedidos sin actualizar** del día. No pasa por la carpeta |
| **Día 10** (si cae en fin de semana, el lunes) | `LISTADOS GEMINISWIN <fecha>.xlsx`: el Excel completo, con todas las pestañas, del **mes anterior cerrado**. Se guarda en la carpeta, se envía por correo y se sube a Finanzas |
| **Día 20** | `VENTAS POR VENDEDOR <fecha>.xlsx` (listado 17 de GeminisWin) |
| **Último día laborable del mes** (o los 5 primeros días del siguiente, si el PC estuvo apagado) | `PEDIDOS PROVEEDOR SIN ACTUALIZAR <fecha>.xlsx` |
| **Lunes** | Los 3 **inventarios semanales** (04, Aliz-1 y Aliz-2). **En pausa hasta el 01/12/2026** |

Cada fichero de la carpeta se mete además en el archivo cifrado `LISTADOS GEMINISWIN.7z`, ordenado por tipo y mes.

**Avisos (23/11/2026):**
- **El cifrado falla desde el 09/11.** Puede haber copias sueltas sin cifrar en la carpeta. La causa probable son las
  exportaciones de ContaNet que hay en esa misma carpeta (sin confirmar).
- Las exportaciones de ContaNet de esa carpeta (ZIP de capturas, CSV de diarios y balances) **no las pone ningún
  proceso programado**: vienen de la extracción manual de noviembre (desde el 05/11).
- **Pendiente:** cuando el PC de Rober esté conectado a su Cowork, comprobar la carpeta y **mover lo de ContaNet a
  otra carpeta** para que el cifrado vuelva a funcionar.
- Depende de que el PC de Rober esté encendido a las 9:50. Nadie lo vigila todavía (podría hacerlo Virgilio).

## PC de Mónica (equipo MONICA) — agente «Sr. Puente» (código `pc_monica`)

Inventario hecho por su Cowork el 23/11/2026 (registros y lista de tareas de Windows, sin cambiar nada).

### Tareas de Windows (carpeta «Ofipapel»: solo estas dos)

| Tarea | Qué hace | Cuándo | Qué deja |
|---|---|---|---|
| **Ofipapel\Puente reparto** | Lee en solo lectura repartos, ventas, facturas y clientes de GeminisWin y manda a la app de repartidores los repartos abiertos y los cambios de las ventas. `pythonw.exe C:\Ofipapel\puente_reparto\puente_reparto.py` (sin ventana). Ver `docs/REPARTO_PUENTE_GEMINISWIN.md` | Todos los días (también fin de semana), **cada 5 min de 07:00 a 21:00**, y al iniciar sesión «Usuario» (entonces corre 14 h desde ese momento y puede pasar de las 21:00). Máximo 10 min; si sigue en marcha, la siguiente se salta | `C:\Ofipapel\puente_reparto\`: `puente_reparto.log`, `.estado` y `.cerrojo` mientras corre |
| **Ofipapel\Espejo GeminisWin** | Copia al ERP maestros e histórico de GeminisWin (ventas, facturas, cobros, caja, pedidos, artículos, clientes…). `wscript.exe espejo_oculto.vbs` → `espejo_todas.bat` → `espejo_geminiswin.py`. Ver `docs/PLAN_ESPEJO_GEMINISWIN.md` | **Cada 10 min, día y noche**, y al iniciar sesión. Máximo 12 h. De día solo los últimos 60 días; de 21:00 a 07:00 y los domingos relee los ficheros enteros (de noche también CLIENART) | Misma carpeta: `espejo_geminiswin.log`, `.estado` (~586 MB), `.json`, `resultado_espejo_todas.txt` |

Lo vigila Virgilio (espejo parado o con errores). **No tocar nunca** `puente_reparto.clave`, `.json` ni `.estado`.

### Cowork del PC de Mónica

- **Cerrar los repartos del día en GeminisWin** (habilidad `cerrar-reparto-geminiswin`): **solo cuando alguien se lo
  pide**, no está programado. Controla la pantalla y necesita GeminisWin abierto con la contraseña de un empleado (la
  mete una persona).
- Tareas programadas: solo «Informe del espejo completo», una vez (23/11, 08:47). Ninguna más.
- **ContaNet**: el Sr. Puente es el encargado de sacar los datos de ContaNet que hagan falta. Todo lo necesario ya se
  sacó en noviembre (ver `docs/PLAN_CONTANET.md`); si hace falta algo más, se le pide a su Cowork.

### Herramientas a mano (`C:\Ofipapel\puente_reparto\`, solo cuando alguien lo pide)

- `sacar_partes.bat`: saca el parte de la app para el cierre (en `partes\` y `resultado_partes.txt`).
- `enviar_una_vez.bat`: una pasada manual del puente (`resultado_envio_manual.txt`).
- `prueba_puente.bat`: prueba del puente sin enviar nada (`resultado_prueba_puente.txt`).
- `crear_tarea_espejo.bat` + `tarea_espejo.xml`: rehacen la tarea del espejo si hiciera falta.

### Diagnósticos de una sola vez (no se ejecutan solos; solo lectura)

`C:\Ofipapel\diag_dbf\` (listar_dbf, estructura_tablas, leer_repartos, cuadre_dia2, ver_tareas; `cuadre_dia.py` es una
copia rota) y `C:\Ofipapel\diag_cobro\` (cobros del 17/11).

### Obsoleto (se puede borrar o archivar; pendiente del visto bueno de Rober)

En `puente_reparto\`: pruebas (`paso2_espejo.bat`, `paso3_espejo.bat`, `medir_espejo.bat`, `diag_repartidor.*`), versiones
viejas de la tarea (`modificar_tarea*.bat` v1–v4, `tarea_puente_reparto*.xml` v1–v4), `instalar_y_probar.bat`, el
instalador de Python y los `resultado*.txt` antiguos. **`enviar_y_programar.bat` es peligroso** (vuelve a enviarlo
todo): conviene borrarlo. Además `C:\Ofipapel\capturas_contanet\` y `entrega_contanet\` (ContaNet, 16–17/11).

### Pendiente

- Hora de fin del puente: si «Usuario» inicia sesión tarde, el puente sigue después de las 21:00. El arreglo está
  preparado (`modificar_tarea_v4.bat`), sin aplicar.
- 23/11: el puente ve **13 repartos abiertos** (estado 2 en GeminisWin); cuatro son antiguos (48281, 48300, 48338 y
  48342) y hay que cerrarlos o revisarlos.

## Encargos puntuales ya hechos (no se repiten)

Capturas de pantalla de GeminisWin por tandas (ZIP), copia cifrada completa e inventario fichero a fichero (12/11),
cargas a `carga_dbf` (informes, parámetros, histórico de ventas y compras, empleados…), extracción de CONTANET (13/11,
PC de Mónica). Informe del volcado completo del espejo: 23/11 a las 8:47, PC de Mónica (aviso programado de una vez).

## Cómo averiguar lo que falta («Por confirmar»)

Las tareas programadas de Cowork se guardan **en cada PC**, dentro de la app de escritorio de Claude: no se ven desde
el ERP ni desde otro ordenador. En cada PC con Cowork: abrir la app de Claude → Cowork → **tareas programadas**, y
apuntar aquí qué hay, a qué hora y qué hace. Para los listados de Finanzas, mirar también la fecha de los ficheros de
LISTADOS AUTOMATIZADOS: dice cada cuánto se generan.

## Reglas para Cowork (siguen en vigor)

GeminisWin solo se lee desde fuera: nunca se escribe en los DBF ni se instala nada en su servidor; no se guardan
cambios en pantallas de GeminisWin salvo las tareas de esta lista que lo hacen a propósito (1 y 3); los datos de
GeminisWin y CONTANET nunca van al repositorio.

## Geminio: avisar al ERP (lo hace el Cowork del PC de Rober, una vez)

Para que su ficha diga qué ha hecho y Virgilio sepa si un día no ha trabajado, el programa de
`C:\Ofipapel\Herramientas` avisa al ERP al terminar cada trabajo. Clave propia de Geminio (no es la del puente):

1. **Crear la clave en el PC** (nunca sale de él ni pasa por ningún chat): 48 caracteres aleatorios, por ejemplo
   `python -c "import secrets; print(secrets.token_urlsafe(36))"`, guardada en `C:\Ofipapel\Herramientas\geminio.clave`.
2. **Registrar su huella** (SHA-256 en hexadecimal) en el ERP, una sola vez. El registro está abierto hasta el
   26/11/2026; después hay que pedir a un administrador que lo vuelva a abrir (parámetro `agentes.registro_abierto`):
   `POST https://sufxvpiwcncnyltrvoun.supabase.co/rest/v1/rpc/fn_agente_registrar_clave`
   con cabeceras `apikey` y `Content-Type: application/json` (la clave pública del ERP, la misma de `inicio.html`) y
   cuerpo `{"p_agente": "geminis_pc", "p_huella": "<sha256 de la clave>"}`.
3. **Avisar al terminar cada trabajo**:
   `POST .../rest/v1/rpc/fn_agente_informar` con
   `{"p_agente": "geminis_pc", "p_clave": "<clave>", "p_tarea": "<tarea>", "p_resumen": "<frase corta>", "p_ok": true, "p_equipo": "<nombre del PC>"}`.
   Tareas: `diario` (ventas por caja y pedidos sin actualizar a Finanzas), `listados_mes` (día 10), `ventas_vendedor`
   (día 20), `pedidos_sin_actualizar` (fin de mes), `inventarios` (lunes), `cifrado` (copia cifrada),
   `pedido_informatica`, `importar_informatica`. Si algo falla: `"p_ok": false` y en `p_resumen` qué ha fallado.
   El resumen **sin datos de clientes ni importes** (el hub es público): «Ventas por caja subidas a Finanzas».
4. Si el ERP no contesta, no pasa nada: el trabajo sigue igual; solo no queda apuntado.

### Encargos de NEXA a Geminio (no activo hasta que lo conecte el Cowork)

Si alguien pide a NEXA un dato de GeminisWin que **no está en el espejo** (un listado concreto), NEXA lo encarga a
Geminio (`agente_orden`, orden `listado`, parámetros `{"que", "desde", "hasta"}`; lo puede pedir quien tenga el permiso
de Listados). El programa del PC de Rober, en cada vuelta:
1. `POST .../rest/v1/rpc/fn_agente_ordenes_pendientes` con `{"p_agente": "geminis_pc", "p_clave": "<clave>"}`.
2. Saca el listado de GeminisWin **solo leyendo** (sin guardar cambios en GeminisWin).
3. `POST .../rest/v1/rpc/fn_agente_orden_terminar` con
   `{"p_agente": "geminis_pc", "p_clave": "<clave>", "p_orden": <n>, "p_ok": true, "p_resultado": "<frase>", "p_datos": [<filas>]}`
   (como mucho ~2 MB; si no puede, `"p_ok": false` y el motivo).
