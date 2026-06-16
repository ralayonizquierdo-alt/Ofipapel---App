# Automatización de pedidos semanales (Outlook + Excel)

Cada semana llegan 3 correos (uno por proveedor) con asunto "Re: Pedido semanal",
cada uno con un Excel adjunto cotizando los mismos artículos. Este script:

1. Detecta los 3 correos de esta semana.
2. Descarga y cruza los 3 Excel por la columna `referencia`.
3. Para cada artículo, decide qué proveedor ofrece el precio más bajo.
4. Genera 3 Excel de salida (uno por proveedor) con sus artículos ganadores.
5. Responde a cada correo original adjuntando su Excel y un mensaje predeterminado
   — **siempre como borrador**, nunca se envía nada automáticamente. Tú revisas
   y pulsas "Enviar" tú mismo en Outlook.

Como usas **"nuevo Outlook" / Outlook web** (no el Outlook de escritorio clásico),
esto no se puede automatizar con macros VBA. Usa la API de Microsoft Graph.

## 1. Registrar la aplicación en Microsoft Entra ID

Este paso es necesario una sola vez.

1. Ve a [entra.microsoft.com](https://entra.microsoft.com) → **Identidad → Aplicaciones
   → Registros de aplicaciones → Nuevo registro**.
2. Nombre: por ejemplo "Automatizacion Pedido Semanal". Tipo de cuenta: la opción
   por defecto de tu organización está bien.
3. No hace falta indicar URI de redirección para este flujo.
4. Una vez creada, anota de la pantalla "Información general":
   - **Application (client) ID**
   - **Directory (tenant) ID**
5. Ve a **Autenticación** y activa **"Allow public client flows" = Yes** (necesario
   para el login por código de dispositivo que usa este script). Guarda.
6. Ve a **Permisos de API → Agregar un permiso → Microsoft Graph → Permisos
   delegados** y añade **`Mail.ReadWrite`**.
7. **Paso bloqueante:** pulsa **"Grant admin consent for [tu organización]"**.
   Esto requiere rol de administrador (Global Administrator o Privileged Role
   Administrator) del tenant. **Si tú no tienes ese rol, necesitas pedirle a tu
   departamento de TI que lo haga** — sin este consentimiento el script no podrá
   leer ni crear borradores en tu buzón.

No se pide el permiso `Mail.Send`: el script nunca envía correos, solo crea
borradores para que los revises tú.

## 2. Instalar dependencias

Necesitas Python 3.10 o superior instalado.

```
cd automatizacion-pedidos-proveedores
python -m venv .venv
.venv\Scripts\activate          # en Windows
pip install -r requirements.txt
```

## 3. Configurar

Copia `config.example.yaml` como `config.yaml` (este archivo no se sube a git
porque contiene datos de tu organización) y edítalo:

- `auth.client_id` / `auth.tenant_id`: los valores que anotaste en el paso 1.
- `proveedores`: nombre de cada proveedor y una **lista** de correos (o
  dominios, con `@` delante) que se consideran válidos como remitente suyo —
  puedes poner varios por proveedor (por ejemplo, si el habitual coge
  vacaciones y otra persona responde desde otra dirección, basta con añadir
  esa dirección a la lista).
- `email.plantilla_respuesta`: el texto que se insertará en cada borrador de
  respuesta.
- Revisa `excel.columnas_esperadas` si las cabeceras de tus Excel no son
  exactamente `codigo, descripcion, referencia, precio`.

## 4. Primera ejecución

La primera vez que ejecutes el script (o cuando el login guardado caduque) verás
algo así en la consola:

```
To sign in, use a web browser to open the page https://microsoft.com/devicelogin
and enter the code ABC-DEF-123 to authenticate.
```

Abre esa URL, introduce el código e inicia sesión con tu cuenta de trabajo.
Las siguientes ejecuciones no te lo volverán a pedir (se guarda en
`token_cache.bin`, que tampoco se sube a git — trátalo como una contraseña).

## 5. Uso recomendado

La primera vez, ejecuta en modo de prueba para comprobar que detecta bien los
correos y que el cruce de precios es correcto, **sin** crear nada en Outlook:

```
python main.py --dry-run
```

Revisa los 3 Excel generados en la carpeta `output/`. Si todo está correcto,
ejecútalo en modo normal:

```
python main.py
```

Esto creará 3 borradores en tu carpeta de Borradores de Outlook, cada uno con
su Excel adjunto. **Revísalos y envíalos tú manualmente.**

Si vuelves a ejecutar el script en la misma semana, los correos ya procesados
(marcados con la categoría `PedidoProcesado`) se ignoran, así que no se
duplican borradores.

## 6. Programar la ejecución semanal (opcional)

En Windows, puedes usar el **Programador de tareas**:

1. Crear tarea básica → Desencadenador: semanal, el día que prefieras.
2. Acción: "Iniciar un programa" → apunta a tu `python.exe` (el del entorno
   virtual) con el argumento `main.py`, y fija el "directorio de inicio" en
   la carpeta de este proyecto.

Nota: ejecuta el script manualmente al menos una vez antes de programarlo, para
completar el login interactivo y generar `token_cache.bin` — el Programador de
tareas no puede mostrarte la pantalla de login la primera vez.

## Notas y límites conocidos

- El adjunto que se envía en la respuesta no puede superar ~3 MB (límite del
  método simple de adjuntos de Graph); para los Excel generados aquí esto no
  debería ser un problema.
- El refresh token guardado puede caducar por política de tu organización
  (cambio de contraseña, MFA, inactividad prolongada); si pasa, el script
  simplemente te pedirá iniciar sesión de nuevo con el código de dispositivo.
- El cruce de precios avisa (sin fallar) si una referencia no aparece en los
  3 proveedores, si hay referencias duplicadas dentro del Excel de un mismo
  proveedor, o si hay un empate exacto de precio — revisa siempre el resumen
  que imprime el script al final antes de enviar los borradores.
