# RAX — Skills

RAX es el sistema de asistentes especializados (Skills) de Claude Code para
Ofipapel y Canarias INK. Cada Skill es un rol experto con una misión acotada;
juntas forman un equipo virtual que trabaja sobre el mismo negocio y los
mismos datos, sin pisarse el trabajo.

## Principio rector: una sola fuente de verdad

Ninguna Skill debe redefinir un dato que otra Skill (o el propio repo) ya
posee. Antes de escribir un dato nuevo (color de marca, horario de tienda,
prioridad de una campaña...), busca si ya existe y referéncialo en vez de
copiarlo. Esto es lo que evita duplicidades a medida que el equipo de Skills
crece.

Fuentes de verdad ya establecidas en este repo:

| Dato | Fuente | Quién lo usa |
|---|---|---|
| Identidad visual (colores, tipografías, tono) | `.claude/skills/diseno-ofipapel/references/identidad-visual.md` | `sales-marketing` y cualquier Skill que genere piezas visuales |
| Datos de tienda Ofipapel (dirección, horario, teléfono) | `netlify/functions/whatsapp-agent-config.js` | agente de WhatsApp, `sales-marketing` (para banners/landing con horario, etc.) |
| Catálogo Canarias INK (categorías, marcas, ofertas, blog) | `canarias-ink.html` (secciones `#catalog-grid`, `#featured-products`, `ofertas`, `blog`) | `sales-marketing` |
| Cola de prioridades / roadmap de iniciativas | `.claude/skills/project-manager/references/cola-prioridades.md` | todas las Skills que propongan trabajo |

## Skills disponibles

| Skill | Misión | Estado |
|---|---|---|
| [`diseno-ofipapel`](./diseno-ofipapel/SKILL.md) | Guarda y aplica la identidad visual de Ofipapel y Canarias INK | Base mínima creada |
| [`project-manager`](./project-manager/SKILL.md) | Prioriza y coordina el trabajo entre Skills | Base mínima creada |
| [`sales-marketing`](./sales-marketing/SKILL.md) | Director de Marketing: campañas, contenido, plan anual | Completa |

## Cómo se coordinan las Skills

1. Una Skill que necesita identidad visual (colores, logo, tono de voz) la
   pide a `diseno-ofipapel` — nunca inventa sus propios valores.
2. Una Skill que genera trabajo nuevo (una campaña, una pieza, una
   propuesta) lo registra en la cola de `project-manager` con impacto,
   esfuerzo y fecha límite en vez de decidir en solitario qué se ejecuta
   primero.
3. Antes de crear contenido, cada Skill revisa qué existe ya en el repo
   (páginas, secciones, piezas anteriores) para reutilizar o actualizar en
   vez de duplicar.

## Añadir una Skill nueva

Cada Skill vive en `.claude/skills/<nombre>/SKILL.md` con frontmatter
`name` + `description` (esta última es la que Claude usa para decidir cuándo
activarla, así que debe ser concreta). El contenido de referencia extenso
(catálogos, calendarios, plantillas) va en `references/` dentro de la propia
Skill, no en el `SKILL.md` — así el archivo principal se mantiene corto y
las referencias se cargan solo cuando hacen falta. Actualiza la tabla de
arriba al añadirla.

## Roadmap de conectores externos

Ver `.claude/skills/sales-marketing/references/conectores-roadmap.md` para el
estado y la arquitectura prevista de las integraciones con Meta Ads, Google
Ads, Google Analytics, Search Console, Mailchimp, Brevo, WhatsApp Business y
Google Business Profile. El roadmap vive dentro de `sales-marketing` porque
es quien primero los necesitará, pero el patrón de conector es reutilizable
por cualquier Skill futura.
