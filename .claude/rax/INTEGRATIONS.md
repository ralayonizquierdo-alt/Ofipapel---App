# Integraciones — RAX

Estado real de cada integración externa preparada para el ecosistema. Regla
general: no asumir disponibilidad de memoria — comprobarla (vía `ToolSearch`
para MCPs, o revisando credenciales/config en el repo) antes de actuar como
si estuviera activa.

| Integración | Estado actual | Cómo se usará cuando esté activa | Límites de autonomía |
|---|---|---|---|
| **GitHub Issues** | No usado activamente en este repo (sin Issues abiertos gestionados) | `project-manager` cruzará Issues abiertos con el roadmap para detectar duplicidades entre "lo que se pidió" y "lo que ya está planeado" | Solo lectura autónoma; crear/cerrar/comentar requiere aprobación (acción visible a terceros) |
| **GitHub Projects** | No configurado | Reflejar el roadmap técnico/negocio en un Project si el propietario quiere verlo fuera del repo | Requiere aprobación para crear/modificar |
| **Pull Requests** | En uso normal para el desarrollo (vía MCP de GitHub cuando está disponible en la sesión) | `project-manager` puede leer PRs abiertos y su estado de CI para incluirlos en el resumen de sesión | Solo lectura autónoma; crear/mergear/comentar requiere aprobación |
| **GitHub Actions** | 1 workflow activo (`pages.yml`, despliegue a GitHub Pages) | Detectar fallos de build/deploy y añadirlos como alerta en el resumen de sesión | Solo lectura autónoma; modificar workflows requiere aprobación (toca CI/CD) |
| **Supabase** | En uso por `alquileres/` y `joe-app/`, cada uno con su propio esquema suelto (`DT-05`) | Una vez centralizado (`RT-02`), `project-manager` podría detectar migraciones pendientes o desincronización de esquema | Cambios de esquema siempre requieren aprobación explícita |
| **Netlify** | En uso para build y funciones serverless (`netlify.toml`, `build.sh`) | Leer estado de builds/deploys y logs de funciones para detectar fallos antes de que los reporte un usuario | Cambios de configuración de build/deploy requieren aprobación |
| **Figma** | No conectado | Si se usa para diseño de las marcas, `diseno-ofipapel` (una vez migrada) sería la Skill consumidora, no `project-manager` | — |
| **Herramientas de IA adicionales** | Anthropic API ya en uso (agente WhatsApp) | Evaluar caso por caso antes de añadir una nueva dependencia de IA (coste + mantenimiento entran en el score de ROI/Riesgo) | Añadir una nueva herramienta de pago requiere aprobación |
| **MCPs adicionales** | Los disponibles en cada sesión varían por entorno (algunos requieren autorización previa del propietario, otros tardan en conectar) | Comprobar con `ToolSearch`/`ListConnectors` antes de asumir que un MCP concreto existe o está listo | — |
| **Monitorización** | No hay monitorización activa detectada (ni de uptime ni de errores) | Oportunidad de automatización (crear ítem en `ROADMAP_TECNICO.md`) una vez el propietario priorice qué proyectos monitorizar primero | Conectar un servicio de monitorización externo requiere aprobación |

## Cómo activar una integración

1. Confirmar que el acceso/credencial/MCP existe y responde (no asumir).
2. Documentar aquí qué cambia de "no usado" a "activo" y desde cuándo.
3. Si la integración habilita autonomía nueva (p.ej. poder crear Issues sin
   preguntar), eso es un cambio de las reglas de `project-manager` y debe
   registrarse como decisión en `DECISIONES.md`, no solo aquí.
