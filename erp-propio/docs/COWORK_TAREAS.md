# Tareas de Cowork (GeminisWin)

Rober, 23/11/2026: «que quede constancia de todas las automatizaciones y agentes que tengo por ahí, por si me olvido
de algo». Aquí solo está lo que hace **Cowork** (Claude con acceso al escritorio de un PC de la oficina, donde está
GeminisWin). Los agentes del ERP (E-milio, Whacimara, Virgilio) tienen su propio documento.

Hay **más de un Cowork**, cada uno en un PC distinto. Cada tarea dice dónde corre y cómo se lanza.

| # | Tarea | PC | Cómo se lanza | Qué deja |
|---|---|---|---|---|
| 1 | **Cerrar los repartos del día** en GeminisWin a partir del parte de la app de repartidores y **generar los del día siguiente** (habilidad `cerrar-reparto-geminiswin`) | PC de Mónica | Por confirmar | Repartos cerrados en GeminisWin |
| 2 | **Generar el pedido semanal de informática**: propuesta del Generador de Pedidos de GeminisWin con las ventas de domingo a domingo, unida en un Excel (habilidad `generar-pedido-informatica-geminiswin`) | PC de Rober | **A mano**: Rober se lo pide al chat de Cowork | Excel «PEDIDO dd--dd MMM» en la carpeta PEDIDOS INFORMATICA |
| 3 | **Importar los pedidos de informática** en Compras de GeminisWin (Excel semanales de UFP, EXADI e INFORPOR), imprimir las hojas de control y archivar los ficheros en la carpeta de la semana (habilidad `importar-pedidos-informatica-geminiswin`) | PC de Rober | **A mano**: Rober se lo pide al chat de Cowork | Pedidos en GeminisWin, hojas impresas, ficheros archivados |
| 4 | **Listados para Finanzas** (`Index.html`): ventas anuales, por vendedor, por tienda, por cliente, compras, pagos a proveedores, cierres de caja… Entre ellos «Totales Mensuales de Ventas agrupado por Vendedor» del año en curso (habilidad `listado-ventas-vendedor-geminiswin`). Formato de cada uno: `docs/ERP_PARA_FINANZAS.md` | **Por confirmar** | **Por confirmar** (Rober no recuerda cómo se automatizó) | `\\SERVER-OFIPAPEL\Aplicaciones\ARCHIVOS OFIPAPEL\LISTADOS AUTOMATIZADOS` (= `P:\ARCHIVOS OFIPAPEL\LISTADOS AUTOMATIZADOS`) |

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
