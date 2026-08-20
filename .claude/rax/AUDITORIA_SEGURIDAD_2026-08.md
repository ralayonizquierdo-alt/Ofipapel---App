# Auditoría de seguridad — agosto 2026

Estado real de cada sistema, **comprobado con peticiones en vivo**, no leyendo
código. Fecha de la última comprobación: 2026-08-20.

Método: para cada backend se intentó acceder a los datos como lo haría un
desconocido — con la clave pública que va en el HTML (que cualquiera ve con
"ver código fuente") y, en Firebase, abriendo además una sesión anónima, que
el propio Firebase concede a quien la pida sin credenciales.

---

## Resumen

| Sistema | Sin ninguna credencial | Estado |
|---|---|---|
| **Finanzas** (Supabase "App Bancos") | **Lee y escribe** saldos bancarios | 🔴 Abierto |
| **Vacaciones** (Firestore `ofipapelvv`) | Nada — sesión anónima rechazada (`403`) | 🟢 Cerrado (2026-08-20) |
| **Alquileres** (Firestore `ofipapelvv`) | Nada — sesión anónima rechazada (`403`) | 🟢 Cerrado (2026-08-20) |
| **Fichaje** (Firestore `ofipapel-fichaje-63ced`) | Lee fichajes y configuración | 🔴 Abierto |
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

Sigue abierto: Finanzas (200) y Fichaje (200). Es el trabajo pendiente de
DT-23.

### Vacaciones y Alquileres — cerrados (2026-08-20)

Las reglas de Firestore del proyecto `ofipapelvv` (compartido por las dos
apps) se cerraron el mismo día, cada una por su lado:

- **Vacaciones**: ya tenía login real por persona (Firebase Auth
  email+contraseña) desde antes. Solo hacía falta que las reglas dejaran de
  aceptar sesiones anónimas para esa colección. Publicado en Firebase
  Console y verificado con peticiones reales:
  ```
                                antes    después
  sesión anónima → leer          200      403   ✅ cerrado
  sin ningún token → leer        403      403   (igual)
  login real (usuario rober)     200      200   ✅ sigue funcionando
  ```
- **Alquileres**: migrado a login real con Firebase Auth (`luis`/`rober` con
  correo interno `@alquileres.internal`) y reglas nuevas que exigen
  `sign_in_provider == 'password'` para **todas** las colecciones del
  proyecto (`apartments`, `reservations`, `payments`, etc. — ver
  `alquileres/firestore.rules`, que documenta el porqué y el orden de
  despliegue). Verificado en vivo hoy con sesión anónima contra `apartments`
  → `403`.

  ⚠️ Lo que **no** se ha verificado desde esta sesión: que el login real de
  Luis y Rober funcione de principio a fin en producción (crear las cuentas
  en Firebase Console, entrar con ellas). Si esas cuentas no existen todavía,
  la app puede haberse quedado sin acceso para nadie hasta crearlas — es la
  propia advertencia que deja el fichero de reglas. Confirmarlo queda a
  cargo de quien hizo ese cambio.

---

## La causa común de los sistemas abiertos

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

El caso de **Vacaciones** lo ilustró mejor que ningún otro: tenía login real
por persona, con email y contraseña de verdad — estaba **bien hecho** — y aun
así sus datos se leían enteros, porque las reglas del proyecto que comparte
con Alquileres solo pedían "tener sesión". Junto con Alquileres, son los dos
primeros de los cuatro ya cerrados (ver más arriba).

---

## El patrón correcto ya existe en casa

`vacaciones.html` autentica con email + contraseña reales contra Firebase
Identity Toolkit (`accounts:signInWithPassword`), guarda el token, lo renueva,
y lo manda en cada petición a Firestore. Cada persona entra con lo suyo.

Es el modelo que ya se copió en Alquileres (con su propio dominio de correo
interno, `@alquileres.internal`) y el que falta copiar en Finanzas y Fichaje.
Lo que hace falta después es que las reglas exijan un proveedor real en lugar
de conformarse con `auth != null` — por ejemplo comprobando
`request.auth.token.firebase.sign_in_provider != 'anonymous'` (o, más
estricto todavía, `== 'password'`, como quedó en `alquileres/firestore.rules`).

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
- Reglas de Firestore de **Vacaciones** y **Alquileres** (2026-08-20 — ver
  más arriba).

**No corregido a propósito** (DT-23, actualizado): quedan dos sistemas
abiertos — Finanzas y Fichaje. Cerrar sus reglas sin haber migrado antes el
login deja al propietario fuera de su propia app, y no había forma de
verificar el resultado con él dormido. Es trabajo de unos 20 minutos **con él
delante**, no de madrugada — igual que se hizo con Vacaciones y Alquileres.

---

## Nota sobre la comprobación de escritura

Para confirmar que Finanzas admitía **escritura** y no solo lectura, se insertó
un registro obviamente falso (`fecha: 1999-01-01`, nota "PRUEBA DE AUDITORIA")
y se borró inmediatamente. Se verificó después que la tabla quedó como estaba
(último registro real intacto). No se tocó ningún dato real en ningún momento.

En Firebase, las pruebas fueron de **solo lectura**; que la escritura también
está permitida se sabe por el texto de las propias reglas, sin necesidad de
probarlo.
