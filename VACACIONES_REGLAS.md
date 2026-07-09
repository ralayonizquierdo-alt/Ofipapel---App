# Cuadrante de vacaciones — reglas aplicadas en el prototipo

Documento de referencia para revisar con el equipo. Recoge lo acordado hasta ahora sobre plantilla y
reglas, más una lista de posibles reglas adicionales a valorar. Los puntos marcados **[pendiente]** son
los que aún faltan por cerrar.

## 1. Empleados y unidades (plantilla real, 36 personas)

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
| Limpieza | Limpieza | 1 |
| **Total** | | **36** |

Los 5 apellidos que faltaban se han resuelto cruzando con el Excel real (hoja "Turno SABADOS"):
**Manu → Morales Álvarez, Manuel**; **Walter → Mendoza Acevedo, Walter**; **Fran → Herrera Martín,
Francisco Javier**; **Natalia → García Reina, Natalia**; **Jose → García Vargas, José Manuel**. Su
antigüedad sigue pendiente (no la heredan de quien sustituyen, son personas distintas).

Se dio de alta a **Ávila Ovando, Gladys Lastenia** (Limpieza), que aparecía en el Excel pero no en la
plantilla anterior.

Se dio de baja permanente a Infante Santana, María Carmen — ya no aparece en el listado. Los tres Alayón
de la tabla de antigüedad (Luis David, Roberto y Luis Melo) son gerencia/propiedad y no participan de este
cuadrante.

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
- **Regla dura sobre el día de la semana**: un periodo no puede **empezar ni terminar en sábado**. Terminar
  en domingo sí está permitido (así se reincorpora el lunes). Se aplica siempre — al crear, editar,
  arrastrar/estirar un periodo, y también en el generador automático.
- **Separación entre los periodos de una misma persona**: el generador automático intenta dejar al menos
  ~45 días entre dos periodos de la misma persona (no los deja pegados uno detrás de otro), aunque prioriza
  igualmente evitar coincidir con compañeros — en las pruebas la separación real ha sido de 43 a más de 300
  días según el hueco disponible. Es una preferencia del generador, no un bloqueo duro: si editas a mano dos
  periodos seguidos para la misma persona, la app lo sigue permitiendo.

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

## 9. Festivos trabajados (nuevo)

Basado en la hoja "FESTIVOS LABORABLES" del Excel: en ciertos festivos nacionales/locales, Aliz-1 (a veces
las 3 tiendas) abre en horario reducido y necesita a 1-2 personas concretas trabajando.

- **Cada festivo trabajado suma automáticamente 1 día** a los días de vacaciones totales de quien lo
  trabaje ese año (compensación). Se ve reflejado al momento en el cuadrante, el resumen, la ficha y la
  hoja impresa (ej. "0/31 días" en vez de "0/30" si esa persona tiene un festivo asignado).
- Se han precargado las **7 fechas de 2026** que aparecían en la revisión más reciente del Excel (21/01/26):
  La Candelaria (2 feb), Carnaval (17 feb), Jueves Santo (2 abr), Día de Canarias (30 may), Fiesta de Arona
  (5 oct), Hispanidad (12 oct) e Inmaculada Concepción (8 dic) — **sin nadie asignado todavía**, porque el
  Excel tenía nombres ambiguos entre dos "Cande" distintas y preferí dejarlo en blanco antes que adivinar
  mal quién trabajó cada uno. Se asignan desde el botón **🎉 Festivos**.
- Navidad (24 dic) y Fin de Año (31 dic) no se han incluido como festivo "compensable" porque en el Excel
  son de "todos trabajan en horario reducido", no una asignación de 1-2 personas concretas — si querías que
  también compensen, dímelo y los añado.

## 10. Turnos de sábado (nuevo, panel aparte)

Basado en la hoja "Turno SABADOS": una clasificación de apoyo (no un calendario semana a semana) para saber
quién cubre qué puesto los sábados.

- Cada empleado se puede marcar como **Grupo A** o **Grupo B**, con un campo de texto libre para el
  "puesto a cubrir" (tienda, reparto, almacén...). Se edita desde el botón **🔄 Turnos sábado**.
- Recordatorio del Excel, incluido como nota en el propio panel: no se pueden cambiar turnos con quien
  encabeza cada tienda, y cualquier cambio de turno solo se admite por urgencia avisando con 15 días de
  antelación.
- **[pendiente]** No he precargado las asignaciones Grupo A/B reales porque la hoja de origen tenía las
  columnas desalineadas y no pude mapear con seguridad quién iba en cada grupo — queda vacío, listo para
  rellenar desde la app.

## Guía de la pantalla: qué hace cada parte

Recorrido rápido de la interfaz, en el mismo orden en que aparece en pantalla, para que cualquiera pueda
usarla sin tener que preguntar.

### Cabecera

- **☰**: pliega/despliega la barra lateral de Reglas y Filtros, para ganar espacio en pantalla.
- **Selector de año**: cambia el año que se está viendo/editando. Cada año tiene su propio calendario y
  guarda sus propios periodos por separado.
- **👤 Empleados**: abre la gestión de plantilla (altas, bajas y ficha de cada persona — ver más abajo).
- **Prioridad rotación**: abre el panel de apoyo para decidir a quién le toca preferencia este año.
- **🔄 Turnos sábado**: clasificación de apoyo en Grupo A/B con el puesto que cubre cada persona los
  sábados (ver sección 10 de reglas).
- **🎉 Festivos**: gestiona los festivos trabajados y a quién se le suma el día de compensación (ver
  sección 9 de reglas).
- **🖨 Vista previa**: abre la vista previa de impresión/PDF.

### Barra lateral — sección "⚙️ Reglas / Filtros"

Todo lo relacionado con reglas y con qué se ve en el calendario vive agrupado aquí:

- **Filtros de vista**
  - *Buscar empleado*: escribe un nombre y el calendario solo muestra a quien coincida.
  - *Unidad*: limita el calendario a una sola unidad. También es el **ámbito que usan el generador
    automático y el botón de borrar todo** — con "Todas" actúan sobre toda la plantilla visible.
  - *Solo unidades con exceso de cobertura*: oculta las unidades que no tengan ningún día por encima de su
    máximo, para localizar rápido dónde hay un problema de cobertura.
- **Generador automático**
  - *Sobrescribir a quien ya tenga vacaciones asignadas este año*: si está desmarcado (por defecto), el
    generador solo rellena a quien todavía no tiene ningún periodo; si lo marcas, borra y vuelve a generar
    también a quien ya tuviera algo, dentro del filtro de Unidad activo.
  - **⚙️ Generar plan**: crea automáticamente los periodos que falten (ver sección 8 más arriba).
  - **🗑 Borrar todo y empezar de nuevo**: borra (con confirmación) todas las vacaciones ya asignadas dentro
    del filtro de Unidad/nombre activo, para volver a generar desde cero.
- **Fechas bloqueadas**: lista de rangos en los que nadie puede coger vacaciones (aparecen con rayado rosa
  en el calendario). El formulario de abajo (*Etiqueta*, *Desde*, *Hasta* en formato `MM-DD`) añade uno
  nuevo; la "✕" de cada tarjeta lo borra.
- **Cobertura por unidad**: elige la unidad en el desplegable y ajusta su máximo de personas fuera a la vez
  en el campo numérico de al lado (antes eran 9 campos siempre visibles; ahora solo se ve el de la unidad
  seleccionada, ya que se toca poco). Cambiarlo aquí afecta a todo el año (para una excepción solo en
  ciertas fechas, se usa la regla de texto `COBERTURA:` con rango de fechas).
- **Reglas de texto**: cuadro para escribir reglas sueltas que se aplican de verdad al pulsar
  *Procesar reglas de texto* (sintaxis `BLOQUEO:` / `PAREJA:` / `COBERTURA:` / `DIAS:`, detallada en la
  sección 8). Debajo aparece, línea por línea, qué se ha entendido y aplicado y qué no.
- **Registro de reglas activas**: resumen de solo lectura, siempre actualizado, con todos los bloqueos,
  límites de cobertura, parejas incompatibles, comodines y "sin sustituto" que hay cargados en este momento
  — para revisar de un vistazo que todo está bien antes de imprimir o generar.

### Barra lateral — otras secciones

- **🏖️ ¿Quién está de vacaciones?**: panel destacado en amarillo, arriba del todo, para control visual
  rápido. Por defecto muestra la fecha de hoy; se puede cambiar a cualquier otra fecha del año que se esté
  viendo, y lista a quién le toca vacaciones ese día (nombre, unidad y el rango completo del periodo), con
  un contador junto al título.
- **Leyenda**: qué significa cada color de barra (periodo 1º, 2º, 3º...) y cada icono (🔁 comodín, 🚫 sin
  sustituto, 🔗 tiene pareja incompatible, rayado = fecha bloqueada, rojo = exceso de cobertura).
- **Resumen de días**: lista de todos los empleados con los días de vacaciones ya asignados frente a su
  total (ej. "18/30"), para ver de un vistazo a quién le queda mucho por coger.

### El calendario (zona central)

- Cada fila es un empleado; cada columna, un día del año. Los sábados y domingos aparecen sombreados en gris,
  y hay una línea vertical cada 5 días (1, 6, 11, 16, 21, 26 de cada mes) igual que en el Excel original,
  para que sea fácil ubicar una fecha de un vistazo.
- **Arrastrar sobre una fila vacía** crea un periodo nuevo entre las dos fechas marcadas.
- **Arrastrar el cuerpo de una barra ya creada** la mueve entera (mismas fechas, distinto sitio).
- **Arrastrar por el borde izquierdo o derecho de una barra** cambia solo esa fecha (inicio o fin).
- **Clic simple sobre una barra** (sin arrastrar) abre su ficha para editar las fechas a mano o eliminarla.
- La franja de color justo encima de cada grupo de unidad es el "mapa de calor" de cobertura: verde si hay
  gente fuera pero dentro del máximo, rojo si ese día se supera.

### Modal "Empleados"

- Lista con buscador y la casilla *Mostrar también los dados de baja*. Cada fila se puede pulsar para abrir
  su ficha. El botón *+ Nuevo empleado* da de alta a alguien desde cero.
- **Ficha de empleado**: nombre, unidad, año de antigüedad (en blanco si no se sabe), días de vacaciones al
  año, fechas preferidas (las que usará el generador automático, formato `DD/MM-DD/MM`), particularidades/
  notas en texto libre, las casillas 🔁 comodín y 🚫 sin sustituto, y *Activo* (desmárcala para dar de baja
  sin perder el historial de esa persona). *Eliminar ficha* la borra de verdad, con confirmación.

### Modal "Prioridad rotación"

Ordena a toda la plantilla de mayor a menor prioridad (combinando antigüedad y si ya marcaste que tuvo esa
misma época el año pasado). La casilla de cada fila es precisamente para marcar eso — "tuvo esta época el
año pasado" — de cara al año siguiente. Es solo orientativo, no asigna nada por sí solo.

### Modal "Turnos sábado"

Lista a todo el mundo agrupado por Grupo A / Grupo B / Sin asignar. En cada fila se elige el grupo y se
escribe el puesto que cubre ese sábado — se guarda solo, no hace falta ningún botón de guardar.

### Modal "Festivos"

Una tarjeta por festivo (fecha, festividad, tienda) con dos desplegables para marcar qué 1-2 personas lo
trabajaron ese año — al elegirlas se les suma automáticamente 1 día a su total de vacaciones. Abajo del
todo hay un formulario para añadir festivos nuevos que no estén en la lista.

### Vista previa de impresión / PDF

Muestra a tamaño reducido cómo saldrá la hoja en papel (A3 apaisado) antes de imprimir de verdad. Desde ahí,
*Imprimir* manda directamente a la impresora y *Guardar como PDF* abre el mismo cuadro de impresión del
navegador para que elijas ahí el destino "Guardar como PDF" (un navegador no permite que una página lo
preseleccione automáticamente).

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
- Funcionalidades incluidas: calendario horizontal año completo con cuadrícula cada 5 días y
  sábados/domingos sombreados, pintar/mover/estirar/borrar periodos arrastrando, aviso de choque con
  fechas bloqueadas y cobertura, bloqueo duro de parejas incompatibles, gestión de empleados
  (alta/baja/ficha), reglas de texto procesables, registro de reglas activas, generador automático (total
  o por unidad), prioridad de rotación, turnos de sábado (Grupo A/B), festivos trabajados con compensación
  automática de días, panel de "quién está de vacaciones hoy", impresión/PDF en A3 apaisado con vista
  previa.
- Lo que falta para pasar de prototipo a versión de uso diario: cerrar los puntos "[pendiente]" de este
  documento (apellidos y antigüedad de las 5 personas nuevas, asignaciones reales de Grupo A/B, valores de
  cobertura por temporada, quién trabajó cada festivo), y
  decidir dónde vive el dato de forma permanente si más de una persona necesita editarlo a la vez
  (¿localStorage sigue siendo suficiente, o hace falta una base de datos compartida, como en `alquileres`?).
