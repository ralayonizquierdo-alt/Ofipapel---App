# Skills de RAX

Esta carpeta es la ubicación **canónica y versionada** de todas las Skills
del ecosistema RAX para este repositorio. Antes de esta consolidación
(2026-07-10) existían tres ramas distintas y sin fusionar construyendo
versiones divergentes de este mismo sistema — esta carpeta es el resultado
de resolver esa duplicidad en una única fuente de verdad.

> **Toda Skill de este proyecto se crea, edita y versiona dentro de
> `.claude/skills/<nombre-skill>/SKILL.md`. Nunca solo en local, nunca en
> una rama que no se fusiona.**

## Convención de cada Skill

```
.claude/skills/<nombre-skill>/
  SKILL.md          # obligatorio: frontmatter (name, description) + instrucciones
  references/        # opcional: material de apoyo largo que no debe ir en SKILL.md
```

`SKILL.md` sigue el formato estándar de Claude Code: front-matter YAML con
`name` y `description` (la `description` es lo que decide cuándo se activa,
así que debe ser específica y mencionar disparadores reales), seguido de
markdown con las instrucciones.

## Skills activas

| Skill | Rol | Estado |
|---|---|---|
| [`project-manager`](./project-manager/SKILL.md) | CTO / Product Manager / Coordinador del ecosistema RAX. Piensa, planifica y prioriza; no escribe código. Mantiene `.claude/rax/` al día. | ✅ Activa |
| [`diseno-ofipapel`](./diseno-ofipapel/SKILL.md) | Diseño visual de marca (banners, posts, landing pages, material promocional) para Ofipapel, Canarias INK y FalControl, reutilizando `design-studio/` | ✅ Activa — validada por primera vez con la campaña real "Vuelta al Cole" |

## Deliberadamente no incluida: `sales-marketing`

Existió una versión completa de un Skill `sales-marketing` (Director de
Marketing con calendario comercial, plan anual, etc.) en una rama huérfana
(`claude/rax-sales-marketing-skill-4raaru`). Se decidió **no** incorporarla
en esta consolidación por dos motivos:

1. Dependía de `references/identidad-visual.md` propio, que duplicaba (y en
   parte contradecía con datos incorrectos — p. ej. el color primario real
   de Canarias INK) los tokens de marca ya verificados en
   `design-studio/README.md`. Mantener dos fuentes de verdad de identidad
   visual es exactamente la duplicidad que este sistema existe para evitar.
2. Es una Skill grande (5 documentos de referencia planeados) sin que
   `diseno-ofipapel`, de la que depende, hubiera producido todavía ni una
   sola pieza real. Construir más encima de un cimiento sin validar es
   deuda, no progreso.

Regla acordada: no se retoma `sales-marketing` hasta que `diseno-ofipapel`
tenga al menos una campaña real entregada y usada por el negocio (ver
`.claude/rax/DECISIONES.md`, entrada 2026-07-10). El código sigue disponible
en esa rama si se decide retomarlo más adelante.

## Cómo añadir una Skill nueva

1. Comprueba esta tabla y `.claude/rax/INVENTORY.md` — evita crear algo que
   ya cubre otra Skill.
2. Crea `.claude/skills/<nombre>/SKILL.md`.
3. Añade la fila correspondiente en la tabla de arriba.
4. Si la Skill nueva podría solapar con otra, dilo explícitamente y deja
   que `project-manager` arbitre quién es responsable de qué (y que quede
   anotado en `.claude/rax/DECISIONES.md`).
