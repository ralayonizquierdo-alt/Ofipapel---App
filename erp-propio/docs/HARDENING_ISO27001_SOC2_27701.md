# Hardening del ERP — ISO 27001, SOC 2 e ISO 27701

Fecha de la medición: 06/11/2026 · Alcance: proyecto Supabase `sufxvpiwcncnyltrvoun` (ERP propio),
web `ofipapel-erp-propio-preview.netlify.app`, funciones de borde y correo (Microsoft 365).
Quedan fuera las apps antiguas (comprobadas el 05/11, ver tarea 23) y el proyecto de Roturas.

> **Aviso importante.** Esto es un hardening técnico guiado por los tres marcos, **no una
> certificación**. ISO 27001 e ISO 27701 las concede un auditor acreditado sobre un sistema de
> gestión (políticas, riesgos, revisiones). SOC 2 es un informe de un auditor externo; el Tipo II
> exige entre 3 y 12 meses de evidencia. Lo de abajo es la parte técnica y un borrador de la parte
> documental. Las decisiones de privacidad (RGPD) deben validarse con un asesor (tarea 29).

## 1. Estado medido hoy (evidencia)

| Medida | Resultado |
|---|---|
| Tablas del esquema `public` | 182, **todas con RLS activo** |
| Tablas con permiso de lectura para `anon` | **176** (hoy las bloquea RLS: defensa en profundidad pendiente) |
| Políticas RLS | 576, de ellas **139 abiertas a «cualquier usuario autenticado»** (`using true`) |
| Funciones `public` | 431; **225 ejecutables sin sesión**, de ellas **94 `SECURITY DEFINER`** |
| Buckets de almacenamiento | 2, ninguno público |
| Avisos del analizador de Supabase | 6 (1 info, 5 warn): ver H-01, H-03, H-10 |
| Cabeceras de seguridad web | Solo HSTS (el resto, ausentes hasta este cambio) |
| `npm audit` (producción) | 2 vulnerabilidades: 1 **crítica**, 1 alta (`jspdf` → `dompurify`) |
| Copias de seguridad | **Ninguna automática** (plan gratuito) |
| Auditoría interna | Tabla `auditoria` con sellos de integridad, 4.510 filas |

Prueba real sin sesión (clave pública): `fn_contab_empresas` devuelve 1 fila de datos de empresa;
`fn_fichaje_personas` devuelve 5 filas con nombres; `fn_app_rep_repartidores`, 2 filas. Las funciones
de reparto con permisos (`fn_reparto_seguimiento`) sí rechazan sin sesión (HTTP 401).

## 2. Hallazgos y plan, por prioridad

| Id | Prioridad | Hallazgo | Marco | Acción | Estado |
|---|---|---|---|---|---|
| H-01 | **P0** | 94 funciones `SECURITY DEFINER` ejecutables sin sesión (tarea 26). Algunas son públicas **a propósito** (pantallas de fichaje y reparto, login), otras mueven dinero o contabilidad (`fn_concilia_*`, `fn_remesa_*`, `fn_contab_guardar_*`) | 27001 A.8.3, A.8.2 · SOC 2 CC6.1 | Revisar una a una. Lista blanca explícita de las públicas; para el resto, quitar `EXECUTE` a `anon` y comprobar el permiso dentro de la función. Migración + prueba de no regresión | **Hecho 08/11**: de 94 a 23 (solo las de pantallas públicas). Pendiente: revisar por dentro las 23 y las que se llaman con sesión (H-04) |
| H-02 | **P0** | Sin copias de seguridad automáticas | 27001 A.8.13 · SOC 2 A1.2 | Pasar a plan Pro (tarea 24) + copia propia cifrada fuera de Supabase + **prueba de restauración** documentada | Pendiente de decisión |
| H-03 | P1 | 176 tablas con permisos para `anon` (hoy protegidas solo por RLS) | 27001 A.8.3 | Quitar permisos a `anon` salvo en las tablas de la lista blanca | **Hecho 08/11**: 0 tablas con permiso para `anon`; lo nuevo nace cerrado |
| H-04 | P2 (rebajado tras probarlo) | 139 políticas «abiertas a cualquier autenticado» | 27001 A.5.15, A.8.3 · SOC 2 CC6.3 · 27701 (minimización) | **Probado el 08/11 simulando a un Dependiente** (el grupo más bajo): NO puede escribir en `empleado`, `rol`, `permiso` (las políticas RESTRICTIVAS de administrador lo impiden; no pudo subirse a administrador) y no ve `auditoría`, PIN de fichaje ni la cola de correo. SÍ puede **leer** los 45 empleados, las reglas de acceso (`rol`, `permiso`), bancos, extractos bancarios, 13 asientos y las operaciones de NEXA. Las tablas de configuración (`web_`, `verifactu_`) solo guardan códigos, no claves. Acción: decidir con la Dirección qué grupos deben ver contabilidad y bancos y limitar la lectura de `extracto_bancario`, `asiento*`, `banco*`, `nexa_operacion` y datos personales de `empleado` al grupo que corresponda (cambiarlo a ciegas rompería listas y desplegables) | Pendiente de decisión |
| H-05 | P1 | `jspdf`/`dompurify` con vulnerabilidad crítica y alta | 27001 A.8.8 · SOC 2 CC7.1 | Subir `jspdf` a 4.2.1 (cambio mayor) y probar todos los PDF | **Hecho 08/11**: `npm audit` = 0 vulnerabilidades; PDF de prueba y compilación correctos |
| H-06 | P1 | Cabeceras web: faltan CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy | 27001 A.8.9, A.8.26 · SOC 2 CC6.6 | **Hechas** las cuatro simples (`netlify.toml`). CSP: primero en modo «solo informar», después se aplica | Parcial |
| H-07 | P1 | Doble verificación solo opcional | 27001 A.8.5 · SOC 2 CC6.1 | Hacerla obligatoria a los super administradores (tarea 15) | Pendiente |
| H-08 | P1 | Clave mínima de 6 caracteres para todos (decisión de Rober, 05/11) | 27001 A.5.17 · SOC 2 CC6.1 | **Riesgo aceptado y firmado por la Dirección**, compensado con bloqueo tras 5 fallos, acceso cerrado por equipo/IP (tarea 28) y auditoría. Revisar antes de producción para administradores | Aceptado (revisable) |
| H-09 | P2 | Función `correo-enviar` sin verificación de sesión (cualquiera puede lanzar el envío de la cola) | 27001 A.8.20 | Exigir un secreto compartido o limitar la frecuencia | Pendiente |
| H-10 | P2 | `function_search_path_mutable` (1), `extension_in_public` (1), «contraseñas filtradas» desactivado | 27001 A.8.9 | Fijar `search_path`; mover la extensión; lo de contraseñas filtradas: **cerrado como innecesario** (tarea 25, solo Pro) | `search_path`: **hecho 08/11** (0 funciones sin fijar). `pg_net` sigue en `public` (moverlo puede romper el envío de correo programado; pendiente de probar) |
| H-11 | P2 | Secretos de la app de Roturas en Vercel guardados como «legibles» | 27001 A.8.24 | Marcarlos como «Sensitive» (3 variables) | Pendiente (Rober) |
| H-12 | P2 | Cuenta y datos de prueba (usuario 999, 19 artículos `ZZTEST`) | 27001 A.8.31 | Eliminar/dar de baja antes de producción (tarea 30) | Pendiente |
| H-13 | P2 | Registro y alertas: hay auditoría, pero sin alarma a un humano ni cadencia de revisión | 27001 A.8.15, A.8.16 · SOC 2 CC7.2 | Definir quién revisa qué y cada cuánto; activar el aviso de mantenimiento al final (tarea 19) | Pendiente |
| H-14 | P2 | Acceso cerrado por equipo + IP (A+B) | 27001 A.8.20, A.8.22 · SOC 2 CC6.6 | Tarea 28 (Cloudflare Access + IP de tiendas) | Decidido, pendiente |

### Registro de cambios aplicados

| Fecha | Cambio | Fichero | Prueba hecha |
|---|---|---|---|
| 06/11 | Cabeceras de seguridad web | `netlify.toml` | En vivo: las 4 cabeceras activas, la entrada carga sin errores |
| 08/11 | Funciones `SECURITY DEFINER`: de 94 a 23 abiertas sin sesión (H-01) | `20261108_hardening_anon.sql` | Sin sesión: las cerradas responden 401; las públicas (fichaje, reparto) siguen respondiendo; con sesión, el ERP sin errores |
| 08/11 | Sin permisos de tabla para `anon` (H-03) y lo nuevo nace cerrado | `20261108_hardening_anon.sql` | Sin sesión: `empleado`, `cliente`, `articulo` → 401 |
| 08/11 | `search_path` fijado en todas las funciones (H-10) | `20261108_hardening_search_path.sql` | 0 funciones sin fijar; funciones auxiliares y panel funcionan |
| 08/11 | `jspdf` 2.5.2 → 4.2.1 (H-05) | `package.json` | `npm audit` = 0; PDF de prueba y compilación correctos |

**Marcha atrás** de H-01/H-03, si alguna pantalla pública fallase: `grant execute on function public.<nombre> to anon;` (y añadir el nombre a la lista blanca de la migración).

## 3. Privacidad (ISO 27701) — a validar con asesor

| Id | Tema | Situación | Acción |
|---|---|---|---|
| P-01 | Registro de actividades de tratamiento | No existe | Redactarlo (clientes, empleados, proveedores, fichajes) |
| P-02 | Minimización | Las pantallas públicas de fichaje y reparto muestran nombres de empleados sin sesión | Valorar mostrar solo iniciales, o cerrar tras el acceso por equipo (tarea 28) |
| P-03 | Conservación | Fichajes: se suele decir 4 años (confirmar). `carga_dbf` guarda datos de GeminisWin (133 MB, incluye 60 empleados) | Política de retención; vaciar `carga_dbf` tras la migración |
| P-04 | Encargados del tratamiento | Supabase (UE, Irlanda), Microsoft 365, Netlify, Cloudflare (si se usa) | Contratos de encargado y lista de subencargados |
| P-05 | Derechos de las personas | Sin procedimiento | Procedimiento de acceso, rectificación y supresión |
| P-06 | Brechas | Sin procedimiento | Plan de respuesta y aviso a la AEPD en 72 h |
| P-07 | Geolocalización (reparto, fichaje) | Se registra posición | Evaluación de impacto y aviso a los empleados |
| P-08 | Bajas de empleados | Se desactivan, no se borran | Definir plazo de bloqueo y supresión |

## 4. Parte organizativa que falta (ISO 27001 cláusulas 4–10)

Alcance del sistema de gestión, política de seguridad, **registro de riesgos**, inventario de activos,
revisión periódica de accesos, gestión de proveedores, plan de continuidad y recuperación, plan de
respuesta a incidentes, formación del personal y revisión por la Dirección. Lo que ya existe y
cuenta como evidencia: `CONDICIONES_PROGRAMACION.md`, la auditoría con sellos, el registro de
incidencias (con quién lo lleva y su historial) y las notas de coordinación.

## 5. Orden recomendado

1. Esta semana (técnico, bajo riesgo): H-06 cabeceras (hecho), H-05 `jspdf`, H-09, `search_path`.
2. Antes de cargar los datos completos: H-02 copias (plan Pro) y **prueba de restauración**.
3. Antes de producción: H-01, H-03, H-04 (con pruebas de no regresión), H-07, H-12, H-14.
4. En paralelo, con asesor: sección 3 (privacidad) y sección 4 (sistema de gestión).
5. Revisión de seguridad externa antes de producción (tarea 28).

## 6. Cómo comprobar cada punto (para repetir la medición)

Las consultas están en el historial de esta sesión: recuento de tablas sin RLS, permisos de `anon`,
funciones `SECURITY DEFINER` con `EXECUTE` para `anon`, políticas con `using true`, `npm audit
--omit=dev`, `curl -I` de la web y `get_advisors` (seguridad) de Supabase.
