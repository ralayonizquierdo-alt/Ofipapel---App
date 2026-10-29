# Robot de pruebas del ERP (`e2e/`)

`recorrido.mjs` inicia sesión y abre, una a una, **todas las opciones de menú con `to`**
(`src/components/shell/menus.ts`) y **las rutas de `src/App.tsx` que no están en el menú**
(incluidas las hijas de los `XxxRoutes`). En cada pantalla apunta:

- errores JS de la página y errores de consola;
- respuestas 4xx/5xx de Supabase (con el cuerpo del error: columna inexistente, permiso, …);
- si la ventana se pinta: título visible, sin pantalla en blanco ni «Cargando…» eterno;
- solapes evidentes: controles que se salen de su ventana o del navegador, barra horizontal,
  y (como aviso) controles tapados por otro elemento;
- menús que llevan a una ruta que no existe en `App.tsx`.

«No tienes permiso para esta opción» cuenta como **sin permiso**, no como fallo (es lo correcto
para un usuario con grupo restringido).

## Uso

Usa el Playwright instalado de forma global (no añade dependencias al proyecto):

```bash
# servidor de desarrollo en otra terminal
VITE_BASE_PATH=/ npx vite --port 5184

ERP_USUARIO=rober ERP_CLAVE='…' NODE_PATH=$(npm root -g) \
  node e2e/recorrido.mjs --puerto=5184 --ventana=1366x768
```

La contraseña va **solo** por variable de entorno: nunca en el repositorio.

| Parámetro | Variable | Por defecto |
|---|---|---|
| `--url=` | `ERP_URL` | `http://localhost:<puerto>` |
| `--puerto=` | `ERP_PUERTO` | `5173` |
| `--ventana=` | `ERP_VENTANA` | `1366x768` |
| `--salida=` | `ERP_SALIDA` | `e2e/salida/<fecha>-<usuario>-<ventana>` |
| `--solo=` | `ERP_SOLO` | todas (expresión regular sobre la ruta) |
| `--recarga=1` | `ERP_RECARGA` | navega dentro de la app sin recargar |
| `--espera=` | `ERP_ESPERA` | `12000` ms por pantalla |
| — | `ERP_SPKI` | pin SPKI del proxy, solo en la nube (`--ignore-certificate-errors-spki-list`) |

## Resultado

En la carpeta de salida (`e2e/salida/`, fuera de git) quedan `informe.md` (tabla por ruta:
menú, título de la ventana, estado, problemas, captura) e `informe.json`, y en `capturas/`
una imagen de cada pantalla con fallo o aviso. Sale con código 1 si hay algún fallo.
