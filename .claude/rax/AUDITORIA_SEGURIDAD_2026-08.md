# Auditoría de seguridad — agosto 2026

Estado real de cada sistema, **comprobado con peticiones en vivo**, no leyendo
código. Fecha de la última comprobación: 2026-08-19.

Método: para cada backend se intentó acceder a los datos como lo haría un
desconocido — con la clave pública que va en el HTML (que cualquiera ve con
"ver código fuente") y, en Firebase, abriendo además una sesión anónima, que
el propio Firebase concede a quien la pida sin credenciales.

---

## Resumen

| Sistema | Sin ninguna credencial | Estado |
|---|---|---|
| **Finanzas** (Supabase "App Bancos") | **Lee y escribe** saldos bancarios | 🔴 Abierto (sigue igual el 2026-08-28) |
| **Vacaciones** (Firestore `ofipapelvv`) | Lee la plantilla con nombres reales | 🟢 Cerrado el 2026-08-28 — ver re-comprobación |
| **Alquileres** (Firestore `ofipapelvv`) | Lee reservas y pagos | 🟢 Cerrado el 2026-08-28 — ver re-comprobación |
| **Fichaje** (Firestore `ofipapel-fichaje-63ced`) | Lee fichajes y configuración | 🔴 Abierto (sigue igual el 2026-08-28) |
| **Joe's App** (Supabase) | Nada | 🟢 Cerrado |
| **RAX-OS** (Vercel) | Nada — redirige a `/login` | 🟢 Cerrado |
| Panel de WhatsApp (`conversations`) | Nada — 401 | 🟢 Cerrado |
| Proxy del asistente IA (`chat-assistant`) | Nada — 401 | 🟢 Cerrado |
| Reintento del bot (`whatsapp-reintento-background`) | Nada — firma propia | 🟢 Cerrado |
| Motor de marketing (`marketing-engine-run`) | Nada — 401 | 🟢 Cerrado |

### Verificación final (2026-08-19, 08:02 UTC)

Comprobado con peticiones reales, no por inspección de código:

```
marketing-engine-run  sin token         → 401
marketing-engine-run  token incorrecto  → 401
marketing-engine-run  token correcto    → 400 (pasa la puerta, se queja del brief vacío)
chat-assistant                          → 401
conversations                           → 401
Joe's App, las 7 tablas, sin sesión     → 401
```

Sigue abierto, como estaba previsto: Finanzas (200), Alquileres (200) y por
la misma causa Vacaciones y Fichaje. Son el trabajo pendiente de DT-23.

---

## Re-comprobación del 2026-08-28 (barrido de infraestructura)

Vuelto a probar en vivo. **Dos de los cuatro sistemas abiertos ya están
cerrados**, y aparece un efecto secundario que hay que corregir:

| Sistema | Antes | Ahora | |
|---|---|---|---|
| **Alquileres** (`ofipapelvv`) | Lee reservas y pagos | `403 PERMISSION_DENIED` con sesión anónima | 🟢 Cerrado |
| **Vacaciones** (`ofipapelvv`) | Lee la plantilla | `403 PERMISSION_DENIED` | 🟢 Cerrado |
| **Fichaje** (`ofipapel-fichaje-63ced`) | Lee fichajes | Sigue devolviendo `200` en `eventos`, `personas`, `config` y `fichajes` con una sesión anónima recién creada | 🔴 Abierto |
| **Finanzas** (Supabase "App Bancos") | Lee y escribe saldos | Sigue devolviendo `200` con la clave pública — se leen los saldos reales sin credencial | 🔴 Abierto |

El registro anónimo (`accounts:signUp`) sigue abierto en los **dos** proyectos
Firebase; lo que cambió en `ofipapelvv` son las reglas, que ahora exigen
`sign_in_provider == 'password'`. Es exactamente el patrón correcto, y es el
que falta por aplicar en `ofipapel-fichaje-63ced`.

### Efecto secundario: se rompió la pantalla de fichar (DT-29)

`ofipapelvv` no es solo de Alquileres: también guarda el estado de
`vacaciones.html`, y `fichaje.html` leía de ahí la plantilla de personal —
con una sesión **anónima**, antes de cualquier login, para poder mostrar la
lista donde cada persona se elige a sí misma para fichar.

Al cerrar las reglas esa lectura pasó a `403`. `fichaje.html` capturaba el
error y seguía adelante, así que no fallaba de forma visible: simplemente la
lista se quedaba con los 3 de gerencia y **el personal no podía fichar**.

Es el mismo aviso de DT-23 cumpliéndose, solo que en el sistema de al lado:
cerrar las reglas antes de migrar a *todos* los que las usan deja gente
fuera. La lección concreta: `alquileres/firestore.rules` cubre todo el
proyecto con `match /{collection}/{docId}`, pero el proyecto está compartido
por tres aplicaciones — y solo se revisó una.

Corregido en código (ver DT-29): `netlify/functions/plantilla-vacaciones.js`
lee la plantilla en el servidor con una cuenta real y devuelve solo
`{id, name, unitId}`. Queda pendiente crear esa cuenta y configurar las dos
variables de entorno; hasta entonces `fichaje.html` se comporta igual que
ahora, no peor.

---

## La causa común de los 4 sistemas abiertos

No son cuatro fallos distintos, es el mismo malentendido repetido:

**Se confundió "exigir sesión" con "exigir identidad".**

- En **Firestore**, las reglas dicen `allow read, write: if request.auth != null`.
  Suena a "hay que estar autenticado", pero el proveedor "Anonymous" está
  activado y **Firebase le da una sesión a cualquiera que la pida**, sin
  credenciales. Así que `auth != null` equivale en la práctica a `allow all`.
- En **Supabase "App Bancos"**, ni eso: la política es `allow_all` para el rol
  `public`, con `USING (true) WITH CHECK (true)`. RLS está activado, pero no
  restringe nada.

Consecuencia importante: **el login de las apps no protege los datos**. Se
puede ir directamente a la base de datos sin pasar por la pantalla de acceso.
Por eso la contraseña compartida (DT-09/DT-11) es un problema *secundario*
frente a este.

El caso de **Vacaciones** lo ilustra mejor que ningún otro: tiene login real
por persona, con email y contraseña de verdad — está **bien hecho** — y aun
así sus datos se leen enteros, porque las reglas del proyecto que comparte con
Alquileres solo piden "tener sesión".

---

## El patrón correcto ya existe en casa

`vacaciones.html` autentica con email + contraseña reales contra Firebase
Identity Toolkit (`accounts:signInWithPassword`), guarda el token, lo renueva,
y lo manda en cada petición a Firestore. Cada persona entra con lo suyo.

Es el modelo a copiar en Finanzas, Alquileres y Fichaje. Lo que falta después
es que las reglas exijan un proveedor real en lugar de conformarse con
`auth != null` — por ejemplo comprobando
`request.auth.token.firebase.sign_in_provider != 'anonymous'`.

Ojo al orden, porque el orden importa:

1. Primero migrar el login de la app (y verificar que se entra).
2. Después cerrar las reglas.

Al revés deja a las personas fuera de su propia aplicación hasta que el código
nuevo esté desplegado.

---

## Qué se corrigió y qué no, y por qué

**Corregido** (seguro y verificado):

- `favorite_artists` de Joe's App, que se había quedado fuera del script de
  RLS (DT-24). También se eliminaron las políticas `allow_all` residuales de
  las otras 6 tablas, que hoy eran inofensivas pero seguían siendo una trampa.
- `MARKETING_ENGINE_TOKEN` creada en Netlify (DT-25).

**No corregido a propósito** (DT-23): los cuatro sistemas abiertos. Cerrar las
reglas sin haber migrado antes el login deja al propietario fuera de su propia
app de contabilidad, y no había forma de verificar el resultado con él
dormido. Es trabajo de unos 20 minutos **con él delante**, no de madrugada.

---

## Nota sobre la comprobación de escritura

Para confirmar que Finanzas admitía **escritura** y no solo lectura, se insertó
un registro obviamente falso (`fecha: 1999-01-01`, nota "PRUEBA DE AUDITORIA")
y se borró inmediatamente. Se verificó después que la tabla quedó como estaba
(último registro real intacto). No se tocó ningún dato real en ningún momento.

En Firebase, las pruebas fueron de **solo lectura**; que la escritura también
está permitida se sabe por el texto de las propias reglas, sin necesidad de
probarlo.
