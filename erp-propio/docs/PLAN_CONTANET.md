# Plan: llevar CONTANET dentro del ERP propio

Rober, 16/11/2026. Borrador para revisar con Mónica (que es quien lleva CONTANET), con Luis y con la asesoría.

**Objetivo.** Que la contabilidad que hoy se lleva en CONTANET (más de 20 años) se lleve dentro del
ERP propio, con las pantallas y los menús de CONTANET lo más fieles posible, con los colores y el
estilo del ERP, y sumando las utilidades que el ERP ya tiene y CONTANET no.

**Estado (16/11/2026).** Hechas las fases 1 y 2 con las 68 capturas de CONTANET: el inventario de menús y
la comparativa con el ERP están en `CONTANET_INVENTARIO.md`. Los menús están completos; de pantallas de
trabajo solo hay 12, así que para calcar (fase 4) hacen falta más capturas, y los ficheros de datos todavía
no han llegado a este chat. Falta que Mónica y Luis den por buena la comparativa.

---

## 1. De dónde partimos: lo que el ERP ya tiene

La contabilidad del ERP no está vacía. Luis montó un módulo completo (área «Contabilidad»):

| Bloque | Qué hay hoy en el ERP |
|---|---|
| Empresas | Varias empresas del grupo, cada una con su plan, sus asientos y sus ejercicios. Hoy solo está dada de alta Ofipapel |
| Ejercicios | Año contable abierto o cerrado; cierre con regularización y asiento de apertura; un año cerrado es solo consulta |
| Plan de cuentas | PGC PYMES con subcuentas (184 cuentas cargadas) |
| Asientos | Diario con alta y edición manual; asientos pendientes o con errores |
| Asientos automáticos | Los genera el propio ERP desde ventas, facturas, cobros, pagos y caja |
| Consultas | Mayor / extracto, Sumas y saldos, Pérdidas y ganancias, Balance de situación |
| Impuestos | Libros registro de IGIC, modelos 420, 425 y 347 |
| Bancos | Conciliación con extractos Norma 43, remesas SEPA, previsión de tesorería |
| Control | Firmas de asientos, cierre de meses, comprobación de que nadie ha tocado un asiento |
| Otros | Resultados por tienda, exportar a gestoría, registros VeriFactu |

Datos reales: prácticamente ninguno (13 asientos de prueba, ejercicio 2026).

## 2. Lo que hace falta para empezar

1. **El material de CONTANET**, igual que se hizo con GeminisWin: los ZIP de capturas de pantalla, las
   tablas o ficheros de datos y los históricos de cada empresa. Se pasan a este chat; no van al
   repositorio (llevan datos reales).
2. **Mónica**, que es quien usa CONTANET cada día, para unas pocas decisiones (punto 5) y para
   reconocer las pantallas; con Luis y la asesoría donde haga falta. Rober no tiene que contestar dudas contables.

### Dónde está el material (nota 157 del tablón de coordinación, 13/11/2026)
- **Datos**, en el servidor de la oficina: `\\SERVER-OFIPAPEL\Aplicaciones\ARCHIVOS OFIPAPEL\LISTADOS AUTOMATIZADOS`
  (= `P:\ARCHIVOS OFIPAPEL\LISTADOS AUTOMATIZADOS`). Por cada «empresa» de CONTANET, cuatro CSV separados
  por tabulador (`PLAN_CONTABLE`, `DIARIO`, `DATOS_SUPLEMENTARIOS`, `IVA_IGIC`) y un balance de sumas y
  saldos en Excel. Además, las copias de seguridad originales de CONTANET (ZIP).
- **Capturas** de menús y pantallas: cinco ZIP (menús y bloques 2 a 5) que Cowork entregó a Rober por su
  chat. En el servidor solo está el primero.
- Desde el chat del ERP no se llega al servidor: el material hay que traerlo (ver fase 1).

### Lo que ya se sabe de esos datos
- En CONTANET **cada año es una «empresa» distinta**. Las 21 exportadas son en realidad dos: Ofipapel
  (2018 a 2026) y Luis Alayón (2018 a 2026). En el ERP serán dos empresas, cada una con sus ejercicios.
- **Hay años repetidos**: Ofipapel 2019 aparece tres veces (03, 04 «a diciembre» y 10) y Ofipapel 2020 dos
  (06 y 09 «reparada»). Mónica tiene que decir cuál es la buena de cada año.
- Las de Luis Alayón 2019 a 2026 parecen datos de demostración: confirmar con Mónica antes de cargarlas.
- El DIARIO de Ofipapel 2018 (01) se exportó cortado al 41 % y no llegó a repetirse: hay que volver a sacarlo.
- Ofipapel 2016 y 2017 no existen en CONTANET. Las empresas 07 (Sage) y 08 (Pruebas) no se exportaron.
- Los balances de sumas y saldos de cada empresa-año son justo la prueba de la fase 5.

## 3. Las fases

### Fase 1 — Inventario de CONTANET (solo mirar)
Con el material: lista de todos los menús y pantallas de CONTANET, de sus listados, de sus tablas y de
qué empresas y qué años hay. Resultado: un índice numerado, como el de las capturas de GeminisWin.

### Fase 2 — Comparativa CONTANET ↔ ERP
Una tabla con tres columnas, pantalla por pantalla y función por función:
- **Está en los dos** → se queda el motor del ERP, con el aspecto y el orden de CONTANET.
- **Solo en CONTANET** → hay que construirlo.
- **Solo en el ERP** → se conserva como utilidad añadida, colocada en el menú donde menos estorbe.

Hecha: ver `CONTANET_INVENTARIO.md`, punto 3. Lo más importante que salió:
- **El cambio grande es la forma de meter asientos.** En CONTANET el diario es la pantalla principal y se
  escribe línea a línea sin abrir nada. El ERP tiene una lista y un editor aparte.
- Faltan en el ERP piezas pequeñas que se usan a diario: tipos de diario, canales, apuntes modelo,
  conceptos, punteo y referencia.
- Los módulos grandes (cartera, amortizaciones, centros de costo, retenciones, presupuestos) solo se
  construyen si se usan, y eso se sabrá por los datos, sin preguntar a nadie.
- Lo que el ERP tiene de más (asientos automáticos, 420 y 425, remesas, reglas de conciliación, firmas,
  resultados por tienda) cabe en el menú de CONTANET sin estorbar.

Esta fase termina con una reunión corta con Mónica y Luis para aprobar la tabla. Hasta entonces no se programa.

### Fase 3 — Menú y aspecto
El área Contabilidad del ERP pasa a tener el árbol de menús de CONTANET, con sus mismos nombres y
orden, y con los colores, tipos de letra y ventanas del ERP. Las utilidades propias del ERP se
integran en ese árbol.

### Fase 4 — Calcar las pantallas, por tandas
Mismo método que con GeminisWin: tandas de capturas, varias pantallas en paralelo, revisión y
publicación en la web de prueba. Orden propuesto:
1. Empresas, ejercicios y plan de cuentas.
2. Introducción de asientos y diario (lo que más se usa cada día).
3. Extractos, mayor y punteo.
4. Balances y cuentas anuales.
5. IGIC: libros y modelos.
6. Cartera, vencimientos y bancos.
7. Inmovilizado y amortizaciones.
8. Cierre y apertura de ejercicio.
9. Listados y utilidades.

Cada pantalla lleva su apartado «Operativa», como el resto del ERP.

### Fase 5 — Cargar los datos de CONTANET
Empresas del grupo, planes de cuentas y asientos de todos los años descargados. La prueba de que la
carga está bien es objetiva: **el balance de sumas y saldos de cada empresa y cada año tiene que dar
lo mismo en el ERP que en CONTANET**, al céntimo. Si no cuadra, no se da por cargado.

### Fase 6 — Unir con la gestión
Los asientos automáticos del ERP (ventas, compras, cobros, pagos, caja, abonos de roturas) pasan a
usar las cuentas reales de CONTANET. Mientras se siga con GeminisWin, se mantiene la forma actual de
pasar los datos a contabilidad.

### Fase 7 — Trabajar en paralelo y cambiar
Un trimestre llevando la contabilidad en los dos sitios. Se comparan sumas y saldos y el modelo 420.
Cuando coinciden, se deja CONTANET solo para consulta.

## 4. Cómo se sabrá que cada fase está bien
- Fase 1 y 2: Mónica y Luis dan por buena la lista y la tabla.
- Fase 3 y 4: quien usa CONTANET cada día reconoce cada pantalla sin explicación.
- Fase 5: sumas y saldos idénticos por empresa y año.
- Fase 7: un trimestre entero con los mismos resultados en los dos programas.

## 5. Decisiones que no son de programación (Mónica, Luis y asesoría)
1. Qué empresas del grupo se traen y desde qué año.
2. Si el plan de cuentas del ERP se sustituye por el de CONTANET tal cual (lo recomendable).
3. Qué hacer con los asientos de prueba que hay hoy en el ERP (lo recomendable: empezar limpio).
4. Si la asesoría necesita seguir recibiendo algo en un formato concreto.
5. Quién firma que una carga cuadra.

## 6. Riesgos conocidos
- **Tamaño de los datos.** La base de datos del ERP está en el plan gratuito (500 MB, 185 MB usados).
  Seis o más años de asientos de varias empresas pueden no caber: habría que pasar al plan de pago
  antes de la fase 5. Se sabrá con certeza al medir el material en la fase 1.
- **Datos reales.** El material de CONTANET no se sube al repositorio, que es público.
- **Fidelidad sin conocer el programa.** Las capturas enseñan cómo es una pantalla, no siempre qué
  hace cada botón. Donde no esté claro, se pregunta a quien lo usa, no se inventa.
- **Trabajo ya hecho por Luis.** El módulo actual es suyo: los cambios de la fase 3 en adelante se
  coordinan con él, como marcan las Condiciones de Programación.
