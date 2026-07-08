# Cuadrante de vacaciones — reglas aplicadas en el prototipo

Documento de referencia para revisar con el equipo. Recoge lo acordado hasta ahora sobre plantilla y
reglas, más una lista de posibles reglas adicionales a valorar. Los puntos marcados **[pendiente]** son
los que aún faltan por cerrar.

## 1. Empleados y unidades (plantilla real, 35 personas)

La plantilla ya no vive en el código: se edita desde la propia app (botón **👤 Empleados**), con una ficha
por persona (unidad, antigüedad, días, particularidades, activo/baja). Esto es importante porque la
plantilla cambia con el tiempo — dar de baja a alguien no borra su historial, solo lo oculta del cuadrante.

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
Natalia y Jose (ambos nuevas incorporaciones). La antigüedad de estas 5 personas también queda pendiente
(no hereda la de quien sustituyen, son personas distintas).

Se dio de baja permanente a Infante Santana, María Carmen — ya no aparece en el listado.

**[pendiente / a confirmar]** En la tabla de antigüedad que pasaste aparecen tres personas que no están en
esta plantilla: **Alayón Izquierdo, Luis David**, **Alayón Izquierdo, Roberto** y **Alayón Melo, Luis**
(antigüedad 2003, 2003 y 2015). ¿Son gerencia/propiedad y no participan del cuadrante, o hay que darlos de
alta y decir a qué unidad pertenecen?

## 2. Fechas bloqueadas para todos (no se puede pedir vacaciones)

Aplican a toda la plantilla, se repiten cada año, y son editables por si cambian:

- **Vuelta al cole**: 1–30 de septiembre.
- **Campaña de Navidad**: 20 de diciembre – 6 de enero.

Regla dura: no se permite crear un periodo de vacaciones que incluya ningún día bloqueado.

## 3. Cobertura mínima por unidad

Cada unidad tiene un número máximo de personas que pueden estar de vacaciones **a la vez**:

- Valor por defecto: **máximo 1 persona fuera al mismo tiempo por unidad** (nadie debe coincidir de
  vacaciones con otro compañero del mismo puesto).
- Ese máximo puede cambiar según la época del año mediante excepciones por unidad y rango de fechas.
- Es un aviso, no un bloqueo duro: si se supera el máximo, la app avisa pero permite guardar igualmente
  (a veces será inevitable forzarlo, sobre todo en unidades pequeñas como Almacén o Aliz 2).
- **[pendiente]** Definir los rangos de fechas y el valor exacto por temporada para cada unidad.

## 4. Parejas que nunca pueden coincidir (regla dura, nueva)

Algunas personas se cubren mutuamente un puesto o una cartera de clientes, así que **nunca pueden estar de
vacaciones a la vez** — si lo intentas, la app lo bloquea directamente (no es un aviso, es un tope):

- **Natalia ↔ Dunia Delgado Valido** — fotocopiadora: siempre debe quedar una de las dos.
- **María Luz Gómez Rufiangel ↔ Roberto Correa Hernández** — se cubren mutuamente los clientes.
- **Haridian Fumero Benítez ↔ Javier Iguarán Martínez** — se cubren mutuamente los clientes.

Además, tres comerciales están marcados como **"sin sustituto"** (nadie cubre su cartera si faltan):
**Felipe García Padrón**, **María Paz Rodríguez Deniz** y **Miguel Ramos Delgado**. De momento esto es solo
informativo (icono 🚫 en el nombre) — la protección real sigue siendo el límite de cobertura de
Comerciales (máx. 1 fuera a la vez), que ya evita que dos falten el mismo día.

## 5. Rotación de fechas solicitadas (ej. verano)

- Quien disfrutó de una fecha concreta el año anterior pasa a la cola para esa misma fecha este año, dando
  preferencia a quien no la tuvo. En empate, prioridad para quien tenga más antigüedad.
- Es una sugerencia de apoyo a la decisión (panel "Prioridad rotación"), no una asignación automática.
- **[pendiente]** No hay histórico real de "quién tuvo qué el año pasado" — hay que marcarlo a mano la
  primera vez (checkbox por persona en ese panel).

## 6. Duración y días de vacaciones

- Habitualmente se reparten en periodos de **15 días**, varios a lo largo del año.
- Días totales por empleado: **30 días naturales** para todos (confirmado).

## 7. Particularidades individuales (ficha por empleado)

- **Comodines** 🔁: **Sonia Cabrera Pérez** (asignada a Aliz 1) y **María Ángeles Afonso García** (asignada
  a Ofipapel · Detalle) son las dos personas que con más frecuencia cambian de tienda según necesidad del
  negocio. Se cuentan en su unidad de referencia; si hace falta que cuenten en más de una a la vez, hay que
  decidir cómo afecta eso al cálculo de cobertura.
- Cualquier otra particularidad (restricción médica, acuerdo previo, etc.) se añade directamente en el
  campo "Particularidades / notas" de la ficha de cada persona — ya no hace falta tocar código.

## 8. Reglas de texto y generador automático (nuevo)

Para no depender de que yo edite el código cada vez, ahora hay dos herramientas en el propio panel
**Reglas / Filtros**:

- **Reglas de texto**: un cuadro donde escribes una regla simple por línea y se aplica de verdad (no es
  solo una nota). Formatos reconocidos:
  - `BLOQUEO: 10/05-20/05 Feria` → añade un bloqueo de fechas.
  - `PAREJA: Nombre1 / Nombre2 - Motivo` → añade una pareja que no puede coincidir.
  - `COBERTURA: Unidad max 2` → cambia el máximo de esa unidad (o de una fecha concreta si añades un rango).
  - `DIAS: Nombre 30` → cambia los días de una persona.
  - Cualquier línea que no encaje en ese formato se guarda igualmente, pero solo como nota informativa (no
    se aplica), y se avisa de que no se ha reconocido.
- **Registro de reglas activas**: un resumen siempre actualizado (bloqueos, cobertura, parejas, comodines,
  sin sustituto) para poder comprobar de un vistazo que lo cargado es correcto antes de generar nada.
- **Generador automático**: crea un borrador de vacaciones para quien no tenga ya periodos asignados,
  usando la antigüedad, si tuvo esa época el año pasado, y las "fechas preferidas" que se guarden en la
  ficha de cada empleado (mismo formato `DD/MM-DD/MM`). Respeta todas las reglas duras (bloqueos, cobertura,
  parejas incompatibles) — si no encuentra hueco cerca de la fecha preferida, lo avisa para revisión manual
  en vez de forzarlo. Se puede lanzar para toda la plantilla o solo para la unidad seleccionada en el
  filtro. El resultado siempre queda editable a mano después, como cualquier otro periodo.

## Posibles reglas adicionales a valorar

- **Límite de periodos por empleado al año**: ¿máximo de veces que se puede fraccionar el año, o libre?
- **Aviso de "mismo mes, misma unidad, muchos años seguidos"**: para equilibrar con quien nunca la pide.
- **Prioridad automática por hijos en edad escolar** en julio/agosto — a valorar si aplica aquí.
- **Aviso de coincidencia entre comerciales y su zona/cliente asignado**, más fino que el límite genérico.

## Cómo está construido el prototipo

- Archivo único `vacaciones.html`, sin backend: los datos se guardan en el navegador (localStorage) de
  quien lo abre — no se comparten automáticamente entre varios ordenadores.
- La plantilla, los periodos, las reglas y las preferencias ya se editan todos desde la propia app (fichas,
  formularios y el cuadro de reglas de texto) — ya no hace falta tocar código para el día a día.
- Funcionalidades incluidas: calendario horizontal año completo con sábados/domingos sombreados,
  pintar/editar/borrar periodos, aviso de choque con fechas bloqueadas y cobertura, bloqueo duro de parejas
  incompatibles, gestión de empleados (alta/baja/ficha), reglas de texto procesables, registro de reglas
  activas, generador automático (total o por unidad), prioridad de rotación, impresión/PDF en A3 apaisado
  con vista previa.
- Lo que falta para pasar de prototipo a versión de uso diario: cerrar los puntos "[pendiente]" de este
  documento (apellidos, antigüedad de las 5 personas nuevas, las 3 personas "Alayón" de la tabla, valores
  de cobertura por temporada), y decidir dónde vive el dato de forma permanente si más de una persona
  necesita editarlo a la vez (¿localStorage sigue siendo suficiente, o hace falta una base de datos
  compartida, como en `alquileres`?).
