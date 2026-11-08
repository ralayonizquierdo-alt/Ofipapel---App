# Plan de respuesta a incidentes

Borrador pendiente de aprobación. Un incidente es cualquier hecho que ponga en riesgo la confidencialidad, integridad o
disponibilidad de los datos: una clave expuesta, un acceso no autorizado, datos borrados o alterados, un equipo perdido,
un servicio caído, un correo de phishing al que se ha respondido.

## 1. Detectar y avisar (inmediato)
Quien lo detecte avisa al **propietario** sin esperar a entender la causa. Se anota la hora y qué se ha visto.

## 2. Contener (primeras horas)
- **Clave o contraseña expuesta:** rotarla ya (checklist abajo) y retirar el acceso de la cuenta afectada.
- **Cuenta comprometida:** cambiar contraseña, cerrar sesiones, revisar qué hizo.
- **Datos expuestos públicamente:** cerrar el acceso (reglas de Supabase/Firestore, retirar el fichero) antes de investigar.
- No borrar pruebas: conservar registros y capturas.

## 3. Evaluar
¿Hay **datos personales** afectados (empleados, clientes, huéspedes)? ¿Cuántas personas? ¿Qué datos? ¿Se llegaron a ver o
copiar? Se clasifica: **bajo** (sin datos personales ni acceso real), **medio** (acceso posible sin evidencia de uso),
**alto** (acceso confirmado o datos personales/financieros expuestos).

## 4. Notificar (RGPD arts. 33 y 34)
- Si hay riesgo para las personas: **aviso a la AEPD en un máximo de 72 horas** desde que se tiene conocimiento
  (sede electrónica de la AEPD, «Notificación de brechas de seguridad»).
- Si el riesgo es alto: **avisar también a las personas afectadas** sin dilación, con lenguaje claro.
- Los proveedores que traten datos por cuenta de Ofipapel avisan a Ofipapel «sin dilación» (cláusula del acuerdo de encargado).

## 5. Recuperar y cerrar
Restaurar desde copia si hace falta, comprobar que el fallo está cerrado **con una prueba real** (no solo leyendo el código),
y escribir un resumen: qué pasó, causa, qué se hizo, qué se cambia para que no se repita. Se guarda en
`.claude/rax/SESSION_LOG.md` (sin datos sensibles).

## Checklist de rotación de secretos
| Secreto | Dónde se cambia | Dónde se actualiza |
|---|---|---|
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | consola del proveedor | variables de Netlify (sitios `ofipapel` y del bot) |
| `WHATSAPP_*` | Meta for Developers | variables de Netlify del sitio del bot |
| `WOOCOMMERCE_*` | WordPress → WooCommerce → claves API | variables de Netlify del bot |
| Contraseñas de cuentas de Supabase (`@ofipapel.internal`) | Supabase → Authentication | quien use la cuenta (PC del publicador, script GeminisWin) |
| `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `UPSTASH_*` | consola del proveedor | variables de Netlify |
| Contraseñas de Firebase de las funciones (`FICHAJE_*`, `VACACIONES_*`) | Firebase Authentication | variables de Netlify |
Tras rotar: comprobar que la app o función vuelve a funcionar y anotar fecha y motivo.

## Contactos
Propietario: _(completar)_ · Asesor de protección de datos / gestoría: _(completar)_ · AEPD: https://www.aepd.es
