# Seguridad y privacidad — Ofipapel / RAX

**Estado: borrador para aprobación del propietario (6/11/2026).**

Marco de referencia: ISO/IEC 27001:2022 (seguridad de la información), ISO/IEC 27701
(privacidad, ampliación de la anterior) y los criterios de confianza de SOC 2
(seguridad, disponibilidad, confidencialidad, privacidad).

> Esto **no es una certificación** ni la garantiza. Una certificación ISO 27001 o un
> informe SOC 2 los emite un auditor externo y exigen, además de controles técnicos,
> procesos que se ejecutan de forma continuada (revisiones, formación, actas, evidencias).
> Estos documentos son la base para llegar a eso, y por sí solos ya ordenan el trabajo.

| Documento | Para qué |
|---|---|
| [POLITICA_SEGURIDAD.md](POLITICA_SEGURIDAD.md) | Reglas de acceso, secretos, cambios, copias, vulnerabilidades, proveedores |
| [PLAN_INCIDENTES.md](PLAN_INCIDENTES.md) | Qué hacer cuando algo sale mal (incluye el aviso a la AEPD en 72 h) |
| [PRIVACIDAD.md](PRIVACIDAD.md) | Qué datos personales se tratan, para qué, quién los ve y cuánto se guardan (ISO 27701 / RGPD) |
| [MAPA_CONTROLES.md](MAPA_CONTROLES.md) | Qué control de ISO 27001 / SOC 2 / ISO 27701 cubre cada pieza del repositorio y dónde está la evidencia |

**Lo que no está aquí a propósito:** el estado real de cada hueco (qué sistema está abierto,
qué falta). El repositorio es público y esa lista sería el manual de ataque; vive fuera de
git (`.claude/rax/auditoria-*.md`, ver `.gitignore`).
