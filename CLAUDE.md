# Ofipapel — App (ecosistema RAX)

Monorepo con varios negocios/proyectos de la familia Ofipapel. Este archivo es
el punto de entrada que Claude Code carga automáticamente al empezar
cualquier sesión: da contexto general y apunta a dónde vive el resto del
conocimiento del proyecto. No dupliques aquí lo que ya vive en otro sitio.

## Qué hay en este repo

| Proyecto | Tipo | Ruta | Stack |
|---|---|---|---|
| Ofipapel · Control Financiero | Sitio/app de negocio (papelería) | `Index.html` | HTML monolítico + Chart.js + Supabase + XLSX |
| Canarias INK | Microsite de marca (venta de consumibles) | `canarias-ink.html` | HTML monolítico |
| FalControl | Microsite/herramienta (radio alerta) | `falcontrol.html` | HTML monolítico |
| Alquileres | Aplicación interna | `alquileres/` | React 19 + Vite + TS + Supabase + Tailwind |
| Joe App | Aplicación familiar/personal (calendario, turnos, etc.) | `joe-app/` | React 19 + Vite + TS + Supabase |
| Agente WhatsApp | Automatización (auto-respuesta con IA) | `netlify/functions/` | Netlify Functions + Claude API |

Despliegue **doble**: GitHub Pages (`.github/workflows/pages.yml`, sirve el
repo tal cual) y Netlify (`netlify.toml` + `build.sh`, compila `alquileres/`
y `joe-app/` y ensambla `_site/`). Cualquier cambio de estructura de
carpetas de nivel superior debe revisar ambos.

## Dónde vive el resto del conocimiento (no lo dupliques)

- **Skills modulares de Claude Code** → `.claude/skills/` (una carpeta por
  Skill, cada una con su `SKILL.md`). Índice y convenciones en
  `.claude/skills/README.md`.
- **"Cerebro" de RAX** (inventario, roadmaps, deuda técnica, decisiones,
  historial de sesiones) → `.claude/rax/`. Estos documentos son la fuente de
  verdad viva del proyecto; se actualizan solos, no se reescriben a mano
  salvo corrección puntual.
- La Skill **`project-manager`** (`.claude/skills/project-manager/SKILL.md`)
  es responsable de mantener todo lo anterior al día. Al empezar una sesión
  de trabajo real sobre este repo, actívala primero para tener contexto
  antes de tocar código.

## Reglas de RAX (aplican a cualquier Skill o sesión en este repo)

Máximo impacto · mínimo riesgo · máxima reutilización · cero duplicidades ·
evolución continua. Antes de crear un documento, Skill o carpeta nueva,
comprueba que no exista ya algo equivalente.
