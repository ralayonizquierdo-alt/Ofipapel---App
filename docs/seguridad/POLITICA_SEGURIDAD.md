# Política de seguridad de la información

Borrador pendiente de aprobación. Responsable: propietario de Ofipapel (Rober). Revisión: una vez al año
o tras cualquier incidente grave.

## 1. Alcance
Todas las aplicaciones de este repositorio (Finanzas, Alquileres, Vacaciones, Fichaje, Control de Pedidos,
Joe App, bot de WhatsApp, motor de marketing) y la infraestructura que las sirve (GitHub, Netlify, Supabase,
Firebase, Vercel).

## 2. Control de acceso (ISO A.5.15–5.18, A.8.2–8.5 · SOC 2 CC6.1–6.3)
- Cada persona tiene **cuenta propia**; no se comparten contraseñas ni cuentas entre personas.
- **Mínimo privilegio:** cada cuenta ve solo lo que necesita (p. ej. Mónica no ve Ventas ni Compras). Los permisos
  de cada app están en su código y en las tablas `fin_miembros` / `cp_miembros`.
- **Altas y bajas:** quien entra en la empresa recibe cuenta con el rol mínimo; quien sale pierde **todas** sus
  cuentas el mismo día (apps, Supabase, Firebase, Netlify, GitHub, correo). Se anota la fecha en el registro de accesos.
- **Revisión trimestral** de quién tiene acceso a qué; se retira lo que sobre.
- Contraseñas: únicas, largas (mínimo 12 caracteres) y en un gestor de contraseñas. **Doble factor** obligatorio
  en GitHub, Netlify, Supabase, Firebase, Vercel, Anthropic, OpenAI y el correo del propietario.
- Un servicio automático (p. ej. el script de GeminisWin) usa una cuenta propia con permisos solo de lo que necesita.
  **Nunca** se usa la clave `service_role` de Supabase fuera del servidor.

## 3. Secretos y claves (ISO A.8.24 · SOC 2 CC6.1)
- Las claves secretas viven **solo** en las variables de entorno de Netlify (marcadas como secretas) o en el
  gestor de credenciales del equipo que las usa; **nunca** en el repositorio, en chats ni en capturas.
- Las claves públicas por diseño (`anon`/`publishable` de Supabase, `apiKey` web de Firebase) pueden ir en el HTML,
  pero su seguridad depende de las reglas de acceso (RLS / reglas de Firestore), que se revisan en cada cambio.
- `scripts/comprobar-secretos.sh` corre en cada cambio y cada lunes. Si salta, se trata como incidente (ver plan).
- **Rotación:** cada 12 meses y siempre que una clave pueda haberse visto. Checklist en `PLAN_INCIDENTES.md`.

## 4. Gestión de cambios (ISO A.8.9, A.8.32 · SOC 2 CC8.1)
- Todo cambio pasa por git con mensaje descriptivo; los de las apps con build pasan lint y build en CI antes de publicarse.
- No se toca producción a mano (SQL, reglas, variables) sin dejar rastro: el cambio se anota en el mensaje del commit
  o en `.claude/rax/SESSION_LOG.md`, con fecha y motivo.
- Los cambios de datos hechos directamente en base de datos se limitan a correcciones puntuales y se anotan.

## 5. Copias de seguridad y continuidad (ISO A.8.13–8.14 · SOC 2 A1.2–A1.3)
- Los datos viven en Supabase (Finanzas, Joe App, Pedidos) y Firebase (Alquileres, Vacaciones, Fichaje). **Pendiente de
  definir y documentar:** frecuencia de copia, dónde se guarda y la **prueba de restauración** (al menos una al año).
- El código está en GitHub y se reconstruye con `bash build.sh`; los despliegues antiguos de Netlify permiten volver atrás.

## 6. Registro y vigilancia (ISO A.8.15–8.16 · SOC 2 CC7.2)
- Finanzas deja **registro de cargas** (`importlog`: quién, cuándo, qué) y de los cambios en el Pool de Deuda y en Pagarés.
- Alertas automáticas avisan si una fuente de datos deja de llegar (ver pantalla *Alertas*).
- Pendiente: error tracking en las apps (DT-14) y revisión periódica de los registros de acceso de Supabase y Firebase.

## 7. Vulnerabilidades y dependencias (ISO A.8.8 · SOC 2 CC7.1)
- Dependabot propone actualizaciones cada semana; el flujo *Seguridad* ejecuta `npm audit` y falla con fallos graves en
  producción.
- Plazos de corrección: **crítico, 48 h · alto, 14 días · medio, 60 días**. Lo que no se pueda corregir se anota como
  riesgo aceptado, con motivo y fecha de revisión.
- Cabeceras de seguridad HTTP definidas en `netlify.toml`. **Plan de CSP por fases:** (1) retirar `eval` y manejadores
  `onclick` en línea de los HTML monolíticos, (2) mover el JS a ficheros propios, (3) activar `Content-Security-Policy`
  primero en modo informe y después en modo bloqueo.

## 8. Proveedores y tratamiento de datos por terceros (ISO A.5.19–5.22 · SOC 2 CC9.2)
Proveedores con acceso a datos de la empresa: GitHub, Netlify, Supabase, Google Firebase, Vercel, Anthropic (asistente
y bot), OpenAI (imágenes de marketing), Meta (WhatsApp Cloud API), Upstash (caché del bot), Resend (correo).
Para cada uno: contrato/condiciones aceptadas, **acuerdo de encargado del tratamiento** si tratan datos personales
(ver `PRIVACIDAD.md`) y revisión anual de que sigue siendo necesario.

## 9. Datos y soportes (ISO A.5.12–5.13, A.7.10, A.8.10)
- Los ficheros con datos reales (Excel de alquileres, listados de GeminisWin, cierres de caja) **no se suben al repositorio**
  (`.gitignore` bloquea `*.xlsx`). Los archivos de listados se guardan cifrados.
- Los equipos que acceden a estas apps tienen bloqueo de pantalla y disco cifrado.

## 10. Formación y responsabilidad (ISO A.6.3 · SOC 2 CC1.4)
Todo el personal con acceso conoce esta política y sabe a quién avisar de un incidente. Se repasa una vez al año.
