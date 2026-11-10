# Mapa de controles — dónde está la evidencia

Qué pieza del repositorio sirve de evidencia para cada control. Es un índice de trabajo: **no declara conformidad**.

| Tema | ISO 27001:2022 (Anexo A) | SOC 2 | ISO 27701 | Evidencia en este repositorio |
|---|---|---|---|---|
| Política y organización | 5.1–5.4, 5.36 | CC1.1–CC1.4, CC2.2 | 5.2, 6.2 | `docs/seguridad/POLITICA_SEGURIDAD.md`, `SECURITY.md` |
| Inventario de activos y datos | 5.9, 5.12–5.13 | CC6.1 | 7.2.8 | `CLAUDE.md` (inventario de apps), `.claude/rax/INVENTORY.md`, `docs/seguridad/PRIVACIDAD.md` |
| Control de acceso | 5.15–5.18, 8.2–8.5 | CC6.1–CC6.3 | 6.6 | RLS de Supabase (`fin_miembros`, `cp_miembros`), reglas de Firestore, `applyAccessControl()` en `Index.html` |
| **Comprobación de que el acceso sigue cerrado** | 5.36, 8.8, 8.9 | CC4.1, CC7.1 | 6.6 | `scripts/comprobar-seguridad.sh` — intenta leer y escribir las bases de datos **en vivo** con las claves públicas del HTML, y sin credencial y con sesión anónima; falla si algo responde. Es la evidencia con fecha, no la configuración declarada |
| Secretos y criptografía | 8.24, 5.17 | CC6.1, CC6.7 | 6.7 | Variables de Netlify; `scripts/comprobar-secretos.sh`; HTTPS/HSTS de Netlify |
| Seguridad de red y navegador | 8.20–8.23, 8.26 | CC6.6–CC6.7 | 6.10 | Cabeceras en `netlify.toml` |
| Desarrollo seguro y cambios | 8.25–8.32 | CC8.1 | 6.11 | Git, `.github/workflows/ci.yml` (lint + build), revisión por PR |
| Gestión de vulnerabilidades | 8.8 | CC7.1 | — | `.github/dependabot.yml`, `.github/workflows/seguridad.yml` |
| Registro y monitorización | 8.15–8.16 | CC7.2–CC7.3 | 6.9 | `importlog`, historial de Pool y Pagarés, alertas de datos sin actualizar (`alertasDatosViejos()`) |
| Copias y continuidad | 8.13–8.14, 5.29–5.30 | A1.2–A1.3 | 6.9 | `build.sh` reproduce el sitio; copias de datos **por documentar** (ver política §5) |
| Incidentes | 5.24–5.28 | CC7.3–CC7.5 | 6.13 | `docs/seguridad/PLAN_INCIDENTES.md` |
| Proveedores | 5.19–5.23 | CC9.2 | 7.2.6, 8.5 | Tabla de proveedores en `PRIVACIDAD.md` y política §8 |
| Privacidad: derechos, base jurídica, minimización | 5.34 | P1–P8 | 7.2–7.5, 7.3 | `PRIVACIDAD.md`, `privacidad.html` |
| Personas | 6.1–6.8 | CC1.4–CC1.5 | 6.4 | Política §10 (formación y responsabilidad) |
