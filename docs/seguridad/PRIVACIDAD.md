# Privacidad — registro de tratamientos (RGPD art. 30 · ISO/IEC 27701)

Borrador pendiente de revisión por el propietario y por el asesor de protección de datos. **Las bases jurídicas y plazos de
conservación son propuestas, no asesoramiento legal.** Responsable del tratamiento: Ofipapel S.L. (y los titulares de los
alquileres, en la app de Alquileres). Encargados: ver tabla de proveedores.

## Tratamientos
| Tratamiento (app) | Personas | Datos | Finalidad | Base jurídica (propuesta) | Quién accede | Conservación (propuesta) |
|---|---|---|---|---|---|---|
| Fichaje (`fichaje.html`) | Empleados | Nombre, horas de entrada/salida, correcciones | Registro de jornada obligatorio | Obligación legal (ET art. 34.9) | Gerencia | 4 años (obligación legal) |
| Vacaciones (`vacaciones.html`) | Empleados | Nombre, periodos de vacaciones, turnos | Planificar la plantilla | Ejecución del contrato | Gerencia | Mientras dure la relación + 1 año |
| Finanzas (`Index.html`) | Proveedores, algún cliente (pagarés) | Nombre/razón social, importes, vencimientos | Control financiero y de tesorería | Interés legítimo / obligación contable | Cuentas de `fin_miembros` | 6 años (Código de Comercio) |
| Ventas por vendedor / cliente | Empleados comerciales, clientes | Ventas agregadas por vendedor y cliente | Control comercial | Interés legítimo | Cuentas de `fin_miembros` | 6 años |
| Control de Pedidos | Clientes (nombre en el pedido), comerciales | Nombre de cliente, referencias pedidas | Gestión de pedidos y facturación | Ejecución del contrato | Cuentas de `cp_miembros` | 6 años |
| Bot de WhatsApp | Clientes | Teléfono, mensajes, fotos enviadas, nombre | Atención al cliente | Consentimiento / interés legítimo | Equipo de atención (panel) | 12 meses sin actividad (a definir) |
| Alquileres | Huéspedes | Nombre, fechas de estancia, importes | Gestión de reservas y cobros | Ejecución del contrato / obligación fiscal | Luis, Rober | 6 años |
| Joe App | Titular (uso personal) | Agenda, turnos, notas | Uso personal | — (uso doméstico) | Titular | A voluntad |

## Encargados y transferencias
| Proveedor | Trata datos de | Ubicación | Salvaguarda a documentar |
|---|---|---|---|
| Supabase | Finanzas, pedidos, Joe App | UE/EEUU (según región del proyecto) | Acuerdo de encargado (DPA) |
| Google Firebase | Alquileres, vacaciones, fichaje | EEUU/UE | DPA + cláusulas contractuales tipo |
| Netlify, Vercel, GitHub | Código y funciones (sin datos personales en reposo; las funciones los procesan) | EEUU | DPA |
| Anthropic, OpenAI | Texto/fotos que el bot o el asistente envían | EEUU | DPA; **no enviar datos personales innecesarios** |
| Meta (WhatsApp Cloud API) | Mensajes de clientes | UE/EEUU | Condiciones de WhatsApp Business |
| Upstash, Resend | Estado del bot, correos de aviso | UE/EEUU | DPA |

## Derechos de las personas (arts. 15–22)
Acceso, rectificación, supresión, limitación, oposición y portabilidad. **Procedimiento:** la solicitud llega al propietario,
que responde **en un mes como máximo**; se localizan los datos de esa persona en cada app de la tabla, se entrega, rectifica
o suprime lo que proceda (salvo lo que haya que conservar por ley) y se anota fecha y resultado.

## Principios que aplican las apps
- **Minimización:** solo se guardan los datos necesarios para la finalidad de cada tabla.
- **Limitación del acceso:** cada cuenta ve solo su ámbito; los permisos están en el código y en las tablas de miembros.
- **Seguridad:** ver `POLITICA_SEGURIDAD.md`. Los ficheros con datos reales no se versionan.
- **Privacidad desde el diseño:** al añadir un dato personal nuevo se actualiza esta tabla en el mismo cambio.

## Pendiente de completar
Aviso legal y política de privacidad pública de la web (`privacidad.html` cubre WhatsApp), cláusulas informativas a empleados
(fichaje/vacaciones), contratos de encargado con cada proveedor, definir el plazo real de borrado del bot y de los
documentos subidos, y evaluar si hace falta una EIPD (evaluación de impacto) por el registro de jornada y las fotos de clientes.
