# Condiciones de Programación de Ofipapel

OBLIGATORIAS para todo el que programa en este repositorio (Rober, los Claude, Cowork). Las fija la gerencia y solo
cambian con un Acuerdo de Dirección (ERP → Archivo → Parámetros → Condiciones de Programación; tabla
`condicion_programacion`). Este fichero es una copia sacada del ERP el 03/11/2026: si no coincide con el ERP, manda el
ERP. Para actualizarlo: en esa pantalla, «Descargar para el repositorio», y sustituir este fichero.

El estado de cumplimiento (semáforo) está en la misma pantalla, pestaña «Cumplimiento» (`fn_condiciones_cumplimiento`).

## Seguridad

1. **Ninguna clave, contraseña, token, IBAN, DNI ni dato de cliente o empleado en el repositorio, en notas ni en documentos.** — El repositorio es público: lo que se sube ahí lo puede leer cualquiera.
2. **Las claves y secretos van solo en los secretos del servidor (Supabase, Netlify), nunca en el programa.** — El programa que llega al navegador se puede leer entero.
3. **Toda tabla nueva lleva permisos en la base de datos (RLS) desde el primer día.** — La protección real está en la base de datos, no en la pantalla: si no, se llega a los datos sin pasar por el programa.
4. **Ninguna función que cambie datos se puede usar sin haber entrado, salvo las imprescindibles (entrada, bloqueo de claves, «¿Has olvidado la clave?»).** — Lo que se puede llamar sin sesión lo puede llamar cualquiera desde internet.

## Auditoría

1. **Toda tabla con datos de negocio lleva su registro de auditoría.** — Si una tabla no se audita, lo que pase en ella no deja rastro.
2. **Nadie, ni la gerencia ni el programador, se libra de la auditoría. Nada puede desactivarla, borrarla ni modificarla.** — Es la garantía de que lo que pasa en el programa queda registrado tal cual.
3. **Las cargas masivas (por ejemplo desde GeminisWin) se hacen por el servidor y quedan identificadas como tales.** — Para no llenar la auditoría de apuntes sin dueño y saber de dónde vino cada dato.

## Base de datos

1. **Ningún cambio de estructura sin migración guardada en el repositorio.** — Para saber qué cambió, cuándo y poder rehacerlo.
2. **Las pruebas se hacen con datos de prueba (tienda 01, almacén 98, códigos ZZTEST o PRUEBA) y se deshacen al terminar.** — Para no mezclar pruebas con datos reales ni dejar basura.
3. **Los protocolos de control (super administradores, avisos, gerencia, doble firma, teletrabajo y estas condiciones) solo cambian con un Acuerdo de Dirección.** — Para que nadie cambie las reglas que le controlan.

## Pantallas

1. **Toda pantalla nueva o cambiada lleva su Operativa (cómo se usa, en pocas líneas).** — Sirve de manual para quien la use.
2. **Todo mensaje que impide hacer algo dice también cómo hacerlo bien.** — Para que el usuario sepa el camino correcto y no busque atajos.
3. **Textos en español sencillo, sin tecnicismos, y fechas e importes en formato español.** — El programa lo usan personas de tienda, no programadores.

## Publicación

1. **Se publica en el ERP solo cuando lo pide Luis, juntando cambios.** — Cada publicación cuesta dinero en Netlify y puede afectar a quien está trabajando.
2. **Antes de publicar: el programa compila y lo nuevo se ha probado.** — Para no romper lo que funciona.

## Coordinación

1. **Antes y después de cada trabajo, nota en el tablón de coordinación; lo pendiente de las personas, como tarea en el Registro de incidencias.** — Para que Luis, Rober, los Claude y Cowork sepan qué ha hecho cada uno.
2. **No se tocan ficheros ni tablas de otro sin avisar, y los datos de CONTANET y GeminisWin nunca van al repositorio.** — Para no pisar el trabajo de otro ni filtrar datos reales.
