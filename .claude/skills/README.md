# Registro de Skills — RAX

Esta carpeta es la ubicación **canónica y versionada** de todas las Skills
del ecosistema RAX para este repositorio. Antes de esta versión, las Skills
vivían (o vivían parcialmente) en carpetas personales de Claude Code no
versionadas (p.ej. `~/.claude/skills` en la máquina de un colaborador), lo
que las hacía invisibles para cualquier otra sesión o entorno (incluidas las
sesiones en la nube). A partir de ahora:

> **Toda Skill de este proyecto se crea, edita y versiona dentro de
> `.claude/skills/<nombre-skill>/SKILL.md`. Nunca solo en local.**

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
| [`project-manager`](./project-manager/SKILL.md) | CTO / Product Manager / Coordinador del ecosistema RAX. Piensa, planifica y prioriza; no escribe código. | ✅ Activa |
| `diseno-ofipapel` | Diseño visual para las marcas del ecosistema (Ofipapel, Canarias INK, FalControl, etc.) | ⚠️ Migración pendiente — ver abajo |

## Migración pendiente: `diseno-ofipapel`

Esta Skill existe (según su propietario) en una carpeta personal de Claude
Code, no en este repositorio, por lo que ninguna sesión en la nube puede
verla ni reutilizarla. Para fijarla como Skill oficial de RAX, una sola vez:

1. Localiza el `SKILL.md` real en tu carpeta local (normalmente
   `~/.claude/skills/diseno-ofipapel/SKILL.md`, o donde la tengas
   configurada).
2. Cópialo (junto con cualquier `references/` que tenga) a
   `.claude/skills/diseno-ofipapel/SKILL.md` dentro de este repo.
3. Haz commit y push. A partir de ese momento es la versión canónica; borra
   o ignora la copia local para no mantener dos fuentes de verdad.
4. La Skill `project-manager` la incorporará automáticamente al inventario
   (`.claude/rax/INVENTORY.md`) en cuanto exista el fichero.

Hasta que se migre, `project-manager` la seguirá marcando como pendiente en
cada resumen de sesión en vez de asumir que existe o inventar su contenido.

## Cómo añadir una Skill nueva

1. Comprueba esta tabla y `.claude/rax/INVENTORY.md` — evita crear algo que
   ya cubre otra Skill.
2. Crea `.claude/skills/<nombre>/SKILL.md`.
3. Añade la fila correspondiente en la tabla de arriba.
4. Si la Skill nueva podría solapar con otra, dilo explícitamente y deja
   que `project-manager` arbitre quién es responsable de qué (y que quede
   anotado en `.claude/rax/DECISIONES.md`).
