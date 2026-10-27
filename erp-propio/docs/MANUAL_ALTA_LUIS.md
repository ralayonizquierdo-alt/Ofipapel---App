# Manual: conectar a Luis al proyecto del ERP y empezar a construir

Para Rober y Luis. Sigue los pasos en orden; cada uno dice **quién** lo hace.
Tiempo total: unos 30 minutos.

---

## Qué tenemos montado (para entender el resto)

| Pieza | Qué es | Dónde |
|---|---|---|
| **GitHub** | El código del ERP. | https://github.com/ralayonizquierdo-alt/Ofipapel---App (carpeta `erp-propio/`) |
| **Rama `erp`** | La «versión buena» del ERP. Lo que entra aquí se publica solo. | rama `erp` del repositorio |
| **Netlify** | Publica la web de prueba automáticamente desde la rama `erp` (2-3 min). | https://ofipapel-erp-propio-preview.netlify.app |
| **Supabase** | La base de datos (artículos, clientes, ventas…), los usuarios y NEXA. | proyecto «Ofipapel ERP propio» |
| **Claude Code** | Donde cada uno pide el trabajo a su Claude, desde el navegador. | https://claude.ai/code |

No hay que instalar nada en ningún ordenador: todo funciona en el navegador,
desde cualquier PC o incluso el móvil.

---

## Paso 1 · Cuenta de Claude de pago — **Luis**

1. Entra en https://claude.ai con tu correo (lualme31@gmail.com o el que prefieras).
2. Ve a https://claude.ai/upgrade y elige un plan que incluya **Claude Code**:
   - **Pro**: suficiente para encargos normales.
   - **Max**: si vas a encargar trabajos largos a menudo.

## Paso 2 · Aceptar la invitación de GitHub — **Luis**

1. Si no tienes cuenta de GitHub, créala en https://github.com/signup **con el
   mismo correo al que llegó la invitación** (lualme31@gmail.com).
2. Abre https://github.com/ralayonizquierdo-alt/Ofipapel---App/invitations
3. Pulsa **«Accept invitation»**.

> Si dice que la invitación ha caducado (duran 7 días): Rober la vuelve a
> enviar en https://github.com/ralayonizquierdo-alt/Ofipapel---App/settings/access
> → «Add people» → correo de Luis.

## Paso 3 · Invitar a Luis a Supabase — **Rober**

1. Abre https://supabase.com/dashboard/org/_/team
2. Pulsa **«Invite»**, escribe el correo de Luis y elige el rol **Developer**.
3. Envía la invitación.

## Paso 4 · Aceptar la invitación de Supabase — **Luis**

1. Abre el correo de Supabase y pulsa el enlace de la invitación.
2. Si no tienes cuenta de Supabase, créala con ese mismo correo.

## Paso 5 · Conectar GitHub y Supabase a tu Claude — **Luis**

1. **GitHub:** https://claude.ai/connect-github → autoriza y comprueba que
   aparece el repositorio `Ofipapel---App`.
2. **Supabase:** https://claude.ai/customize/connectors → busca **Supabase**
   → **Connect** → entra con tu cuenta de Supabase y autoriza.

> No hace falta conectar Netlify: la web se publica sola desde GitHub.

## Paso 6 · Avisar a la sesión de Rober — **Rober**

Escribe en tu conversación de Claude: **«Luis ya está dado de alta»**. Tu Claude:
- comprueba que Luis aparece como colaborador en GitHub;
- añade a Luis a la tabla de notas (`coordinacion_notas`);
- deja el documento de coordinación listo para las sesiones de Luis.

## Paso 7 · Primera sesión de Luis — **Luis**

1. Abre https://claude.ai/code → **nueva sesión**.
2. Elige el repositorio **`ralayonizquierdo-alt/Ofipapel---App`**.
3. Si te deja elegir rama, elige **`erp`**. El entorno déjalo en **Default**.
4. Copia y pega este primer mensaje:

> Trabajo en el ERP propio de Ofipapel (carpeta `erp-propio/`), junto con Rober.
> Antes de hacer nada, lee `CLAUDE.md`, `erp-propio/docs/COORDINACION.md` y
> `erp-propio/docs/MANUAL_ALTA_LUIS.md`. Parte siempre de la rama `erp`, trabaja
> cada encargo en tu propia rama y, al terminar, junta los cambios en `erp`
> (eso publica solo la web de prueba). Antes de empezar y al terminar, mira la
> tabla de notas `coordinacion_notas` de Supabase y deja una nota de lo que has
> hecho. Cuando lo tengas, dime en qué estado está el proyecto.

5. Comprueba que el Claude de Luis responde con el estado del proyecto: eso
   confirma que lee el repositorio y la base de datos.

## Paso 8 · Entrar al ERP — **Luis**

- Web: https://ofipapel-erp-propio-preview.netlify.app
- Usuario: **`luis`** · clave provisional que te pasa Rober.
- Cámbiala en **Archivo → Cambiar Contraseña**.
- Luis es **Administrador**: puede crear usuarios y claves de empleados en
  **Archivo → Empleados → Seguridad**.

---

## Cómo trabajamos los dos (reglas para no pisarnos)

1. **Un encargo = una sesión de Claude.** Cada sesión trabaja en su propia rama
   y al terminar junta sus cambios en `erp`.
2. **No trabajar los dos a la vez en la misma pantalla o módulo.** Si vas a
   empezar algo grande, dilo antes (WhatsApp entre vosotros o una nota en la
   tabla `coordinacion_notas`).
3. **La base de datos es la misma para los dos.** Los cambios de estructura
   (tablas, columnas) siempre como migración guardada en el repositorio, nunca
   a mano.
4. **No se publica a mano.** Lo que entra en `erp` se publica solo en 2-3
   minutos. Para ver si ha salido bien:
   https://app.netlify.com/projects/ofipapel-erp-propio-preview/deploys
5. **Las capturas de GeminisWin** las saca Cowork en el PC de la oficina y
   llegan en ZIP; cualquiera de los dos se las pasa a su Claude adjuntándolas.
6. **Datos reales:** la base tiene una muestra real de GeminisWin. Las pruebas
   que escriben datos se hacen con la tienda **01**, el almacén **98** y códigos
   que empiecen por **ZZTEST** o con la palabra **PRUEBA**.
7. **Dudas para Luis** (cómo funciona algo en GeminisWin): están en
   `erp-propio/docs/COORDINACION.md`, apartado «Preguntas para Luis».

## Ideas para empezar a construir

- Repasar y contestar las **«Preguntas para Luis»** del documento de
  coordinación (desbloquean varias pantallas).
- **Gestor de pagos de clientes** (cobros), cuando lleguen sus capturas.
- **Permisos por grupo de acceso** (que cada empleado vea solo lo suyo).
- Probar con datos reales Caja, Facturación y los Listados, y apuntar lo que no
  cuadre con GeminisWin.

## Si algo falla

- **Claude no ve el repositorio:** repetir el Paso 5 (GitHub) y abrir una
  sesión nueva.
- **Claude no puede consultar la base de datos:** repetir el Paso 5 (Supabase)
  y abrir una sesión nueva (los conectores se cargan al empezar la sesión).
- **La web no se ha actualizado:** mirar la lista de Deploys; si pone «Failed»,
  pulsar sobre ella y pasarle la captura del error a Claude.
- **Cualquier otra cosa:** captura de pantalla a Claude y que lo explique.
