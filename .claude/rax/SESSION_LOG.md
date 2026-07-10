# Historial de sesiones — RAX

Cada entrada: fecha, resumen (3-5 líneas), decisiones tomadas, siguiente
paso recomendado para la próxima sesión. Append-only.

---

### 2026-07-10 — Creación de la Skill `project-manager` y del sistema RAX

**Resumen**: no existía ninguna Skill versionada en el repo (`diseno-ofipapel`
solo vivía, si acaso, en local). Se estableció `.claude/skills/` como
ubicación canónica de Skills y `.claude/rax/` como memoria compartida del
ecosistema (inventario, roadmaps, deuda técnica, decisiones, integraciones).
Se creó la Skill `project-manager` como CTO/PM/coordinador. Se hizo una
primera pasada de inventario real del repo (6 proyectos activos + 2
implementaciones paralelas de WhatsApp) y se detectó y corrigió una deuda
técnica real (`.gitignore` de `joe-app/` ignoraba ficheros nuevos
silenciosamente).

**Decisiones tomadas**: ver `DECISIONES.md` (2026-07-10, dos entradas).

**Siguiente paso recomendado para la próxima sesión**: migrar
`diseno-ofipapel` desde la carpeta local a `.claude/skills/diseno-ofipapel/`
(RT-05) y decidir cuál de los dos agentes de WhatsApp (Meta vs Twilio) es
el canónico (RT-01) — ambos son de alto score y no dependen de más trabajo
técnico, solo de una respuesta del propietario.
