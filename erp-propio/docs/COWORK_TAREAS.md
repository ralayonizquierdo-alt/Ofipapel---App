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

## Programas del PC de Mónica que cuidó Cowork (no son Cowork: corren solos en Windows)

- **Espejo de GeminisWin → ERP** (`scripts/geminiswin/`, tarea de Windows «Ofipapel\Espejo GeminisWin», cada ~10
  minutos en horario de tienda). Ver `docs/PLAN_ESPEJO_GEMINISWIN.md`. Lo vigila Virgilio.
- **Puente del reparto** (`scripts/geminiswin/puente_reparto.py`, en `C:\Ofipapel\puente_reparto`): repartos de
  GeminisWin a la app de repartidores. Ver `docs/REPARTO_PUENTE_GEMINISWIN.md`.

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
