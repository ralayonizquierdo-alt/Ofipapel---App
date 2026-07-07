# Cuadrante de vacaciones — reglas aplicadas en el prototipo

Documento de referencia para revisar con el equipo. Recoge lo acordado hasta ahora sobre plantilla y
reglas, más una lista de posibles reglas adicionales a valorar. Los puntos marcados **[pendiente]** son
los que aún faltan por cerrar.

## 1. Empleados y unidades (plantilla real, 35 personas)

Cada empleado tiene una unidad de cobertura principal. Dos personas son excepción y se consideran
**comodines** (ver punto 6): pueden cambiar de tienda según necesidad, aunque tienen una unidad de
referencia asignada.

| Grupo | Unidad | Nº personas |
|---|---|---|
| Reparto | Repartidores | 9 |
| Comerciales | Comerciales (vendedores) | 7 |
| Dependientas | Ofipapel · Detalle | 5 |
| Oficina | Oficina | 3 |
| Dependientas | Aliz 1 | 3 |
| Dependientas | Aliz 2 | 2 |
| Dependientas | Ofipapel · Informática | 2 |
| Pedidos | Pedidos | 2 |
| Almacén | Almacén | 2 |
| **Total** | | **35** |

**[pendiente]** Apellidos de 5 personas nuevas/sustitutas: Manu (sustituye a Javier Blanco Suárez),
Walter (sustituye a Manuel González Rodríguez), Fran (sustituye a Mario Ezequiel Ramírez Quiroz),
Natalia y Jose (ambos nuevas incorporaciones).

Se dio de baja permanente a una persona (Infante Santana, María Carmen) — ya no aparece en el listado.

## 2. Fechas bloqueadas para todos (no se puede pedir vacaciones)

Aplican a toda la plantilla, se repiten cada año, y son editables por si cambian:

- **Vuelta al cole**: 1–30 de septiembre.
- **Campaña de Navidad**: 20 de diciembre – 6 de enero.

Regla dura: no se permite crear un periodo de vacaciones que incluya ningún día bloqueado.

## 3. Cobertura mínima por unidad

Cada unidad tiene un número máximo de personas que pueden estar de vacaciones **a la vez**:

- Valor por defecto: **máximo 1 persona fuera al mismo tiempo por unidad** (nadie debe coincidir de
  vacaciones con otro compañero del mismo puesto).
- Ese máximo puede cambiar según la época del año (ej. más permisivo en temporada baja, más estricto en
  campaña alta) mediante excepciones por unidad y rango de fechas — el prototipo ya permite añadir estas
  excepciones a mano.
- **[pendiente]** Definir los rangos de fechas y el valor exacto por temporada para cada unidad — de
  momento no hay valores reales cargados, solo el máximo por defecto de 1.
- Es un aviso, no un bloqueo duro: si se supera el máximo, la app avisa pero permite guardar igualmente
  (a veces será inevitable forzarlo, sobre todo en unidades pequeñas como Almacén o Aliz 2).

## 4. Rotación de fechas solicitadas (ej. verano)

- Quien disfrutó de una fecha concreta (ej. primeras dos semanas de julio) el año anterior, pasa a la cola
  para esa misma fecha este año, dando preferencia a quien no la tuvo.
- En caso de empate, tiene prioridad quien tenga **mayor antigüedad**.
- Es una sugerencia de apoyo a la decisión, no una asignación automática: el prototipo calcula un orden de
  prioridad a partir de antigüedad + si tuvo o no esa época el año pasado, pero la decisión final la toma
  una persona.
- **[pendiente]** No hay todavía fechas de antigüedad reales cargadas (se dejó "pendiente" para las 35
  personas), ni un histórico real de "quién tuvo qué el año pasado". Ambos datos hay que rellenarlos a
  mano en el prototipo o migrarlos desde el Excel de años anteriores.

## 5. Duración y días de vacaciones

- Habitualmente se reparten en periodos de **15 días**, varios a lo largo del año.
- Días totales por empleado: de momento **22 días laborables** para todos por defecto (mínimo legal en
  España). **[pendiente]** Confirmar si el convenio de la empresa añade días extra por antigüedad, en cuyo
  caso habría que ajustar este valor persona a persona.

## 6. Particularidades individuales

- **Comodines**: **Sonia Cabrera Pérez** (asignada a Aliz 1) y **María Ángeles Afonso García** (asignada a
  Ofipapel · Detalle) son las dos personas que con más frecuencia cambian de tienda según necesidad del
  negocio. En el prototipo aparecen con un icono 🔁 junto al nombre para que quede visible al planificar,
  pero de momento se cuentan solo en su unidad de referencia — si conviene reflejar que "cubren" en más de
  una tienda a la vez, hay que decidir cómo afecta eso al cálculo de cobertura mínima.
- **[pendiente]** No se han recogido más casos concretos por empleado (restricciones médicas, acuerdos
  previos, etc.). El modelo deja hueco (campo de nota) para añadirlos cuando se identifiquen.

## Posibles reglas adicionales a valorar

Ideas que han salido durante la conversación pero que aún no están decididas ni implementadas — para que
las discutáis con el equipo:

- **Límite de periodos por empleado al año**: ¿hay un número máximo de veces que se puede fraccionar el
  año (ej. no más de 3 periodos), o queda libre?
- **Aviso de "mismo mes, misma unidad, muchos años seguidos"**: detectar si alguien lleva varios años
  pidiendo siempre la misma quincena, para equilibrar con quien nunca la pide.
- **Prioridad automática por hijos en edad escolar**: algunas empresas dan preferencia en julio/agosto a
  quien tiene hijos en el colegio — a valorar si aplica aquí.
- **Regla específica para comodines**: definir si Sonia y Ángeles cuentan doble (en las dos tiendas que
  cubren) a efectos de cobertura mínima, o si se gestionan aparte.
- **Aviso de coincidencia entre comerciales y su zona/cliente asignado**: si cada comercial lleva una
  cartera de clientes, evitar que dos comerciales de zonas solapadas falten a la vez (más fino que el
  límite genérico por unidad).

## Cómo está construido el prototipo

- Archivo único `vacaciones.html`, sin backend: los datos se guardan en el navegador (localStorage) de
  quien lo abre — no se comparten automáticamente entre varios ordenadores.
- **La plantilla de 35 personas ya es real** (nombres, apellidos y unidad según lo comentado); los
  periodos de vacaciones están vacíos, listos para que los rellenéis vosotros. La antigüedad de cada
  persona sigue "pendiente" porque no la tengo — se puede escribir directamente en el código o pedirme que
  añada un campo editable desde la propia app.
- Funcionalidades incluidas: calendario horizontal año completo, pintar/editar/borrar periodos por
  empleado, aviso de choque con fechas bloqueadas y con la cobertura mínima de cada unidad, filtros por
  unidad/nombre/conflictos, panel de prioridad de rotación, exportación a CSV.
- Lo que falta para pasar de prototipo a versión de uso diario: cerrar los puntos "[pendiente]" de este
  documento (apellidos, antigüedades, valores de cobertura por temporada, convenio), y decidir dónde vive
  el dato de forma permanente si más de una persona necesita editarlo a la vez (¿localStorage sigue siendo
  suficiente, o hace falta una base de datos compartida, como en `alquileres`?).
