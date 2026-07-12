# Integraciones — RAX

Estado real de cada integración externa preparada para el ecosistema. Regla
general: no asumir disponibilidad de memoria — comprobarla (vía `ToolSearch`
para MCPs, o revisando credenciales/config en el repo) antes de actuar como
si estuviera activa.

| Integración | Estado actual | Cómo se usará cuando esté activa | Límites de autonomía |
|---|---|---|---|
| **GitHub Issues** | No usado activamente en este repo | `project-manager` cruzará Issues abiertos con el roadmap para detectar duplicidades | Solo lectura autónoma; crear/cerrar/comentar requiere aprobación |
| **GitHub Projects** | No configurado | Reflejar el roadmap si el propietario quiere verlo fuera del repo | Requiere aprobación para crear/modificar |
| **Pull Requests** | En uso normal (MCP de GitHub disponible cuando la sesión lo tiene conectado) | Leer PRs abiertos y su estado de CI para el resumen de sesión | Solo lectura autónoma; crear/mergear/comentar requiere aprobación |
| **GitHub Actions** | 2 workflows activos: `pages.yml` (despliegue) y `ci.yml` (lint+build) | Detectar fallos de build/deploy y añadirlos como alerta | Solo lectura autónoma; modificar workflows requiere aprobación |
| **Supabase** | En uso por `joe-app` (RLS real vía sesión anónima) e `Index.html` (RLS sin verificar, ver DT-07) — proyectos independientes | `project-manager` podría detectar desincronización de esquema si se centraliza (RT-02) | Cambios de esquema o de políticas RLS siempre requieren aprobación explícita |
| **Firebase** | En uso por `alquileres` (Firestore + Authentication) desde la migración ya integrada en `main` | — | Cambios de esquema/reglas de seguridad de Firestore requieren aprobación explícita |
| **Netlify** | En uso para build y funciones serverless | Leer estado de builds/deploys y logs de funciones | Cambios de configuración de build/deploy requieren aprobación |
| **Adobe for Creativity (MCP)** | Disponible para `diseno-ofipapel` vía `design-studio/` | Generación de banners/posts/flyers on-brand | Uso normal de la Skill; no requiere aprobación previa salvo publicar algo externamente |
| **Adobe Firefly API** | Preparado (`design-studio/scripts/firefly-generate.js`), sin probar — faltan `FIREFLY_CLIENT_ID`/`FIREFLY_CLIENT_SECRET` | Generación de imágenes por IA cuando no hay stock adecuado | Añadir las credenciales requiere aprobación (es una integración de pago) |
| **MCPs adicionales** | Varían por entorno/sesión | Comprobar con `ToolSearch`/`ListConnectors` antes de asumir que un MCP concreto existe | — |
| **Monitorización** | No hay monitorización activa detectada | Oportunidad de automatización una vez el propietario priorice qué proyectos monitorizar primero | Conectar un servicio externo requiere aprobación |

## Cómo activar una integración

1. Confirmar que el acceso/credencial/MCP existe y responde (no asumir).
2. Documentar aquí qué cambia de "no usado" a "activo" y desde cuándo.
3. Si la integración habilita autonomía nueva, eso es un cambio de las
   reglas de `project-manager` y debe registrarse como decisión en
   `DECISIONES.md`, no solo aquí.
