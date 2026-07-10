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

### Pareja que sí debe coincidir (regla contraria, nueva)

Al contrario que las anteriores, hay una pareja que **siempre debe salir de vacaciones junta**:

- **Javier Iguarán Martínez ↔ Rosa María Brito Morales** — 💑 en el nombre de ambos en la cuadrícula, el
  listado de empleados y la hoja impresa.

Esta regla no bloquea nada (no impide guardar fechas distintas), pero:
- Al crear o editar un periodo para uno de los dos, si las fechas no coinciden con las que ya tiene su pareja
  la app muestra un aviso informativo (azul) recordándolo — no impide guardar.
- El **generador automático** intenta primero repetir para cada uno las fechas ya asignadas a su pareja antes
  de mirar sus preferencias propias o buscar hueco libre; si sobran días por asignar tras eso, sigue con el
  reparto habitual.
- Se ve también en el "Registro de reglas activas" del panel lateral, en su propio apartado ("Parejas que
  salen juntas 💑"), separado del de parejas incompatibles.

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
- **Vacaciones fijas cada año** 📌: **María Candelaria García Fumero** (Ofipapel · Informática) coge todos
  los años del **1 al 15 de julio** fijo; los otros 15 días son a convenir cada año. Se ha precargado en su
  ficha como "fecha preferida" marcada como **fija** (checkbox 📌 junto al campo de fechas preferidas): a
  diferencia de una preferencia normal, el generador automático nunca la desplaza ni un día — o entra exacta
  del 1 al 15 de julio, o se deja sin asignar y avisa en el informe para revisarlo a mano (una preferencia
  normal sí se puede correr unos días si hay conflicto). El resto de sus 15 días se reparten igual que a
  cualquier otra persona. Esta misma casilla "fecha fija" se puede usar para cualquier otro empleado que
  tenga una fecha de vacaciones invariable año tras año.

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
- **Registro de compensaciones (nuevo)**: dentro del mismo panel de Festivos, cada festivo trabajado se
  puede marcar como **Compensado** o dejarlo en **Pendiente**, por cada persona que lo trabajó. Al marcarlo
  compensado se indica si se lo llevó como **día de vacaciones** o **día de permiso**, en qué fecha, y una
  nota opcional. Debajo de la lista de festivos hay un resumen ("Registro de compensaciones") con todo esto
  de un vistazo, para comprobar rápidamente qué festivos ya se han compensado, cuándo y cómo, y evitar dar
  el mismo día dos veces. Esto es solo un registro informativo — no bloquea nada ni cambia el total de días
  (ese +1 día ya se suma automáticamente en cuanto se asigna a la persona el festivo trabajado).

## 10. Turnos de sábado (nuevo, panel aparte)

Basado en la hoja "Turno SABADOS": una clasificación de apoyo (no un calendario semana a semana) para saber
quién cubre qué puesto los sábados.

- El panel es una **tabla/cuadrícula** (Empleado · Puesto a cubrir · Grupo A · Grupo B), agrupada por
  puesto igual que en el Excel original — marcar la casilla de un grupo desmarca automáticamente la del
  otro. Se abre desde el botón **🔄 Turnos sábado**.
- Recordatorio del Excel, incluido como nota en el propio panel: no se pueden cambiar turnos con quien
  encabeza cada tienda, y cualquier cambio de turno solo se admite por urgencia avisando con 15 días de
  antelación.
- Se han precargado las **29 asignaciones reales** de Grupo A/B y puesto que aparecían en el Excel
  (Reparto, Comercial, Ofipapel, Oficina, Aliz-1, Aliz-2, Almacén, Pedidos). Quedan sin asignar quienes no
  aparecían en esa hoja (algunos comerciales, Dunia, María Pedrido, Gladys de Limpieza) — rellénalo desde
  la app si también hacen turno de sábado.
- Tiene su propia vista previa/impresión/PDF/WhatsApp, igual que el cuadrante de vacaciones (ver más abajo
  en la guía de pantalla). **Nota sobre WhatsApp**: comparte solo un resumen en texto (nombre + grupo por
  puesto), no una imagen del documento — adjuntar la imagen o el PDF real requeriría una librería externa
  que no he podido verificar que funcione de forma fiable en este entorno, así que preferí la opción segura
  y sin dependencias.

## 11. Permisos (nuevo, enlazado con la cobertura)

Fechas puntuales de permiso, aparte de las vacaciones — se gestionan desde el botón **📋 Permisos**.

- Al conceder un permiso (empleado, fechas, motivo) queda guardado en un **registro** ordenado
  cronológicamente, con quién, unidad, fechas y motivo, y un botón para borrarlo.
- **Está enlazado con las reglas de cobertura**: un permiso cuenta exactamente igual que un periodo de
  vacaciones a la hora de calcular cuánta gente queda fuera de una unidad ese día. Esto significa que:
  - Al ir a conceder un permiso, si esas fechas ya están justas de gente en su unidad (por vacaciones u
    otros permisos), sale un aviso — no bloquea, pero avisa antes de confirmar.
  - Si esas fechas coinciden con un sábado y el empleado tiene turno de sábado asignado, también avisa para
    que se revise quién cubriría ese turno.
  - El **mapa de calor de cobertura** del calendario principal y el **generador automático** de vacaciones
    ya tienen en cuenta los permisos concedidos, así que no proponen fechas que dejarían una unidad
    descubierta por culpa de un permiso ya dado.
- No se puede conceder un permiso que se solape con otro permiso o con unas vacaciones ya asignadas a la
  misma persona (bloqueo duro, evita duplicar fechas).
- Los permisos también aparecen en el panel **"¿Quién está fuera?"** (ahora incluye vacaciones y permisos
  juntos, marcados como "(permiso)") y en su mensaje de WhatsApp.

## 12. Sincronización en la nube entre dispositivos (nuevo)

Hasta ahora todo se guardaba solo en el navegador de cada dispositivo (`localStorage`), sin compartirse.
Ahora los datos (empleados, periodos, permisos, festivos, reglas... todo) se guardan también en una base de
datos en la nube (Firestore, proyecto `ofipapelvv`), para que los cambios se vean en todos los dispositivos.

- **Icono de estado** junto al título, en la cabecera:
  - 🔄 conectando.
  - ☁️ sincronizado — los cambios se comparten con el resto de dispositivos (puede tardar unos segundos en
    verse, no es instantáneo).
  - ⚠️ sin conexión con la nube ahora mismo — se sigue trabajando con normalidad, pero los cambios de
    momento solo se guardan en este dispositivo hasta que vuelva la conexión.
- Cada dispositivo **consulta la nube cada ~6 segundos** para recoger cambios hechos por otros; al guardar
  algo, se sube a la nube pasado menos de un segundo. No es una conexión "en directo" al milisegundo, pero
  para el uso normal (una persona edita, otra revisa poco después) es más que suficiente.
- **Aviso importante**: si dos personas editan exactamente lo mismo a la vez en dos dispositivos distintos,
  gana el último guardado (el otro cambio se pierde). Para el uso habitual de la app (una persona a la vez
  gestionando el cuadrante) no debería pasar, pero conviene saberlo.
- Si algún día no hay conexión a internet, la app sigue funcionando igual que antes (todo en local); en
  cuanto vuelve la conexión, se sincroniza solo.

## 13. Inicio de sesión (login, nuevo)

Para que no cualquiera con el enlace pueda ver o cambiar los datos, ahora hace falta iniciar sesión con
email y contraseña antes de entrar.

- Cada persona tiene su **propia cuenta** (email + contraseña), creada de antemano — no hay
  autorregistro, así que solo entra quien ya tiene una cuenta dada de alta.
- Una vez que inicias sesión en un dispositivo, **se queda recordado**: no hace falta volver a entrar cada
  vez que se abre la app en ese mismo móvil/ordenador (la sesión se renueva sola). Solo se pide de nuevo si
  cierras sesión a propósito, o si el dispositivo lleva mucho tiempo sin usarse.
- Botón **🔒 Salir** en la cabecera para cerrar sesión en ese dispositivo (pide confirmación).
- Sin sesión iniciada, la app no puede leer ni guardar en la nube — la Base de datos (Firestore) exige
  estar identificado para cualquier lectura o escritura.
- Si necesitas dar de alta a alguien nuevo o quitarle el acceso a alguien, se hace desde la consola de
  Firebase (Authentication → Users), no hay una pantalla dentro de la propia app para gestionar cuentas por
  ahora.

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
- **📋 Permisos**: concede permisos puntuales y consulta el registro de los ya dados (ver sección 11 de
  reglas).
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
  límites de cobertura, parejas incompatibles, parejas que salen juntas 💑, comodines y "sin sustituto" que
  hay cargados en este momento — para revisar de un vistazo que todo está bien antes de imprimir o generar.

### Barra lateral — otras secciones

- **🏖️ ¿Quién está fuera?**: panel destacado en amarillo, arriba del todo, para control visual rápido. Por
  defecto muestra la fecha de hoy; se puede cambiar a cualquier otra fecha del año que se esté viendo, y
  lista a quién le toca vacaciones **o permiso** ese día (nombre, unidad y el rango completo), marcando los
  permisos aparte, con un contador junto al título.
- **Leyenda**: qué significa cada color de barra (periodo 1º, 2º, 3º...) y cada icono (🔁 comodín, 🚫 sin
  sustituto, 🔗 tiene pareja incompatible, 💑 pareja que sale junta, 📌 fechas fijas cada año, rayado = fecha
  bloqueada, rojo = exceso de cobertura).
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
trabajaron ese año — al elegirlas se les suma automáticamente 1 día a su total de vacaciones. Debajo de
cada persona asignada hay un interruptor "Compensado / Pendiente"; al marcarlo se despliegan un desplegable
(vacaciones o permiso), una fecha y una nota, para dejar constancia de cómo y cuándo se le dio el día. Más
abajo hay un formulario para añadir festivos nuevos que no estén en la lista, y al final del todo el
"Registro de compensaciones", que resume en una lista todos los festivos trabajados de todas las personas
con su estado (✔ Compensado, con el detalle, o ⏳ Pendiente).

### Vista previa de impresión / PDF

Muestra a tamaño reducido cómo saldrá la hoja en papel (A3 apaisado) antes de imprimir de verdad. Desde ahí,
*Imprimir* manda directamente a la impresora y *Guardar como PDF* abre el mismo cuadro de impresión del
navegador para que elijas ahí el destino "Guardar como PDF" (un navegador no permite que una página lo
preseleccione automáticamente). El botón *📱 WhatsApp* abre WhatsApp con un mensaje de texto ya escrito con
quién está de vacaciones o con permiso en la fecha seleccionada en el panel "¿Quién está fuera?" — no envía
la imagen del cuadrante, solo la lista en texto (ver nota sobre esto en la sección 10).

### Vista previa de Turnos de sábado

Igual que la de vacaciones, pero para la tabla de turnos: *🖨 Vista previa* (dentro del propio modal de
Turnos), *Imprimir*, *Guardar como PDF* (A4) y *📱 WhatsApp*, que envía un resumen de texto con el Grupo
A/B de cada puesto, listo para pegar en el grupo del equipo.

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
