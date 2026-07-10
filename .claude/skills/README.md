# Skills de RAX

Sistema modular de Skills de Claude Code para este repo. Cada Skill vive en
su propia carpeta bajo `.claude/skills/<nombre>/` con un `SKILL.md` propio.
Claude Code las descubre automáticamente por convención de carpeta — **no
hay ningún registro central que editar**: añadir una Skill nueva es crear
una carpeta nueva, nunca modificar una existente.

## Skills actuales

| Skill | Carpeta | Qué hace |
|---|---|---|
| Diseño Ofipapel | `diseno-ofipapel/` | Banners, posts, carteles, flyers y material promocional de marca para Ofipapel / Canarias INK / FalControl |

## Reglas para añadir una Skill nueva

1. **Aislamiento**: una carpeta nueva por Skill. Nunca añadas la lógica de un
   dominio distinto dentro de una Skill existente — si el encargo no encaja
   claramente en el `description` de una Skill ya creada, es una Skill nueva.
2. **No dupliques capacidades compartidas**: si varias Skills necesitan el
   mismo recurso (por ejemplo, los brand kits o los scripts de render de
   `design-studio/`), ese recurso vive fuera de `.claude/skills/`, en la
   carpeta compartida correspondiente (`design-studio/` para todo lo visual),
   y cada Skill lo referencia desde su `SKILL.md` en vez de copiarlo.
3. **`description` como contrato de enrutado**: escribe el frontmatter
   `description` de forma que dos Skills nunca se disputen el mismo encargo.
   Sé explícito sobre qué NO cubre la Skill (ver el ejemplo en
   `diseno-ofipapel/SKILL.md`) para evitar solapes con Skills futuras.
4. **Cero dependencias entre Skills**: una Skill no debe asumir que otra ya
   se ha ejecutado antes en la misma sesión. Si dos Skills comparten un paso
   común, ese paso va a un documento/script compartido (fuera de
   `.claude/skills/`), no a una Skill de la que ambas dependan.

## Candidatas futuras (sin crear todavía)

Ideas para próximas Skills, cada una en su propia carpeta cuando se aborden:
- Redacción/copy de marca (textos de venta, descripciones de producto)
- SEO técnico de Canarias INK (datos estructurados, metadatos)
- Automatización de informes/backlog periódicos
