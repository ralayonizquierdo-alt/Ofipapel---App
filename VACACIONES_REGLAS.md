# Cuadrante de vacaciones — reglas acordadas (borrador)

Documento de referencia para revisar con el equipo. Refleja lo hablado hasta ahora;
falta contrastarlo con el Excel actual y con el convenio para cerrar los puntos marcados como **[pendiente]**.

## 1. Empleados y unidades

Cada empleado pertenece a una única **unidad de cobertura** (no hay comodines entre unidades).
Las unidades pueden agruparse solo a efectos de visualización/filtro:

| Grupo | Unidad | Nº personas |
|---|---|---|
| Reparto | Repartidores | 7 |
| Almacén | Almacén | 2 |
| Oficina | Oficina | 3 |
| Pedidos | Pedidos | 2 |
| Comerciales | Comerciales | 7 |
| Dependientas | Aliz 2 | 2 |
| Dependientas | Aliz 1 | 3 |
| Dependientas | Ofipapel · Detalle | 4 |
| Dependientas | Ofipapel · Informática | 2 |
| **Total** | | **32** |

*(El número total real ronda 36 según memoria — revisar si falta alguna unidad o alguna persona sin asignar.)*

## 2. Fechas bloqueadas para todos (no se puede pedir vacaciones)

Aplican a toda la plantilla, se repiten cada año, y son editables por si cambian:

- **Vuelta al cole**: 1–30 de septiembre.
- **Campaña de Navidad**: 20 de diciembre – 6 de enero.

Regla dura: no se permite crear un periodo de vacaciones que incluya ningún día bloqueado.

## 3. Cobertura mínima por unidad

Cada unidad tiene un número máximo de personas que pueden estar de vacaciones **a la vez**:

- Valor por defecto propuesto: **máximo 1 persona fuera al mismo tiempo por unidad** (nadie debe coincidir de
  vacaciones con otro compañero del mismo puesto).
- Ese máximo puede cambiar según la época del año (ej. más permisivo en temporada baja, más estricto en
  campaña alta) mediante excepciones por unidad y rango de fechas.
- **[pendiente]** Definir los rangos de fechas y el valor exacto por temporada para cada unidad — de momento
  el prototipo permite añadir estas excepciones a mano, pero no hay valores reales cargados.
- Es un aviso, no un bloqueo duro: si se supera el máximo, la app avisa pero permite guardar igualmente
  (a veces será inevitable forzarlo).

## 4. Rotación de fechas solicitadas (ej. verano)

- Quien disfrutó de una fecha concreta (ej. primeras dos semanas de julio) el año anterior, pasa a la cola
  para esa misma fecha este año, dando preferencia a quien no la tuvo.
- En caso de empate, tiene prioridad quien tenga **mayor antigüedad**.
- Es una sugerencia de apoyo a la decisión, no una asignación automática: el prototipo calcula un orden de
  prioridad a partir de antigüedad + si tuvo o no esa época el año pasado, pero la decisión final la toma
  una persona.
- **[pendiente]** No existe todavía un histórico real de "quién tuvo qué el año pasado"; hay que decidir cómo
  se registra ese dato (¿se migra desde el Excel de años anteriores?).

## 5. Duración y reparto de los periodos

- Habitualmente se reparten en periodos de **15 días**, varios a lo largo del año.
- **[pendiente]** Confirmar los días de vacaciones totales por empleado al año. Por ley en España el mínimo
  son 30 días naturales (22 laborables) igual para todos, pero algunos convenios añaden días extra por
  antigüedad — hay que revisar si el convenio de la empresa incluye esa cláusula.

## 6. Particularidades individuales

- **[pendiente]** No se han recogido aún casos concretos por empleado (restricciones médicas, acuerdos
  previos, etc.). El modelo de datos deja hueco para añadir notas/restricciones por empleado cuando se
  identifiquen.

## Cómo está construido el prototipo

- Archivo único `vacaciones.html`, sin backend: los datos se guardan en el navegador (localStorage) y sirven
  solo para probar la interacción — **los empleados y periodos que aparecen son inventados**, no reales.
- Funcionalidades incluidas: calendario horizontal año completo, pintar/editar/borrar periodos por empleado,
  aviso de choque con fechas bloqueadas y con la cobertura mínima de cada unidad, filtros por unidad/nombre/
  conflictos, panel de prioridad de rotación, exportación a CSV.
- Lo que falta para pasar de prototipo a versión real: cargar los datos reales del Excel, cerrar los puntos
  "[pendiente]" de este documento, y decidir dónde vive el dato de forma permanente (¿localStorage sigue
  siendo suficiente, o hace falta una base de datos compartida entre varias personas, como en `alquileres`?).
