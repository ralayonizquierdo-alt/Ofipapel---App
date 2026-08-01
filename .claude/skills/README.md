# Skills de RAX

Esta carpeta es la ubicación **canónica y versionada** de todas las Skills
del ecosistema RAX para este repositorio. Antes de esta consolidación
existían varias ramas distintas y sin fusionar construyendo versiones
divergentes de este mismo sistema (Skills, `CLAUDE.md`, memoria de RAX) —
esta carpeta es el resultado de resolver esa duplicidad en una única fuente
de verdad, integrada directamente sobre `main`. El detalle de qué se
rescató de dónde vive en `.claude/rax/DECISIONES.md`.

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
| [`ui-ux-pro-max`](./ui-ux-pro-max/SKILL.md) | Base de datos consultable de UI/UX (estilos, paletas de color, tipografías, guías de accesibilidad/UX, stacks) para diseñar o revisar interfaces de `joe-app`/`alquileres`. Importada de terceros ([nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), MIT), scripts Python de librería estándar sin red | ✅ Activa |

## Fuente única por dato (anti-duplicidad)

Ninguna Skill debe redefinir un dato que otra Skill o el propio repo ya
posee. Antes de escribir un dato nuevo (color de marca, horario de tienda,
prioridad de una iniciativa...), busca si ya existe y referéncialo:

| Dato | Fuente | Quién lo usa |
|---|---|---|
| Identidad visual (colores, tipografías) de las 3 marcas | `design-studio/README.md` (verificado contra el CSS real de cada app) | `diseno-ofipapel`, cualquier Skill futura que genere piezas visuales |
| Datos de la tienda Ofipapel (dirección, horario, teléfono) | `netlify/functions/whatsapp-agent-config.js` | Agente de WhatsApp |
| Inventario de proyectos, roadmap, deuda técnica, decisiones | `.claude/rax/*.md` | Todas las Skills |
| Cola de propuestas de trabajo entre Skills | `.claude/skills/project-manager/references/cola-prioridades.md` | Todas las Skills |

## Deliberadamente no incluida: `sales-marketing`

Existió una versión completa de una Skill `sales-marketing` (Director de
Marketing con calendario comercial, plan anual, etc.) en una rama huérfana
(`claude/rax-sales-marketing-skill-4raaru`). Se decidió **no** incorporarla
en esta consolidación:

1. Su propio fichero de identidad visual (`identidad-visual.md`) daba un
   color primario incorrecto para Canarias INK (`#00BFA5`, que en realidad
   es el color de la categoría "botella", no el acento de marca — el real
   es `#00B4D8`, ya verificado en `design-studio/README.md`). Mantener una
   segunda fuente de identidad visual, y encima con un dato erróneo, es
   exactamente la duplicidad que este sistema existe para evitar.
2. Es una Skill grande (5 documentos de referencia) sin que `diseno-ofipapel`
   hubiera producido todavía ninguna pieza real. Construir más encima de un
   cimiento sin validar es deuda, no progreso.

Regla acordada: no se retoma `sales-marketing` hasta que `diseno-ofipapel`
tenga al menos una campaña real entregada y usada por el negocio — condición
ya cumplida con "Vuelta al Cole 2026", así que se puede reevaluar retomarla
cuando el propietario lo priorice. El código sigue disponible en esa rama
(que se conserva, no se borra) por si se decide retomarlo. Sí se rescató de
esa rama el formato de `project-manager/references/cola-prioridades.md`,
que no depende de ningún dato de marca.

## Cómo añadir una Skill nueva

1. Comprueba esta tabla y `.claude/rax/INVENTORY.md` — evita crear algo que
   ya cubre otra Skill.
2. Crea `.claude/skills/<nombre>/SKILL.md`.
3. Añade la fila correspondiente en la tabla de arriba.
4. Si la Skill nueva podría solapar con otra, dilo explícitamente y deja
   que `project-manager` arbitre quién es responsable de qué (y que quede
   anotado en `.claude/rax/DECISIONES.md`).
