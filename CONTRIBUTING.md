# Normas de trabajo — Ofipapel · App

Aplican a cualquiera que trabaje en este repositorio: el propietario,
colaboradores humanos, y cualquier sesión de Claude Code (la Skill
`project-manager`, `.claude/skills/project-manager/SKILL.md`, opera estas
mismas normas automáticamente). Nacen de un problema real: en julio de
2026, 4+ ramas independientes reconstruyeron el mismo sistema (RAX) sin
saber que las otras existían, generando trabajo duplicado y dos backends
incompatibles para la misma app. Ver `.claude/rax/DECISIONES.md`
(2026-07-12/13) para el caso completo.

## 1. Comprobar ramas existentes antes de empezar

**Regla fija: ninguna rama nueva se crea sin comprobar antes si ya existe
una rama activa para ese mismo trabajo.**

Antes de `git checkout -b` o de empezar cualquier desarrollo:

1. Revisa `git branch -r` y los PRs abiertos del repositorio.
2. Busca específicamente ramas o PRs cuyo nombre, título o commits
   recientes sugieran el mismo objetivo que la tarea que vas a empezar.
3. `.claude/rax/INVENTORY.md` y `.claude/rax/DECISIONES.md` deberían tener
   rastro de las ramas RAX conocidas; si no lo tienen, compruébalo en
   GitHub directamente antes de asumir que no existe nada.

Una rama cuenta como **activa** si no está fusionada, no está cerrada, y
tiene actividad o relevancia reciente. Una rama ya rescatada y pendiente
de borrar no cuenta como activa.

## 2. Si existe una rama activa para el trabajo

**Continúa sobre ella.** No crees una segunda rama "por si acaso" ni
porque parezca más limpio empezar de cero — ese razonamiento es
exactamente el que causó la duplicación de julio de 2026.

Antes de escribir una sola línea de código sobre esa rama (o sobre
cualquier rama, incluida una nueva), sigue el **proceso de reconciliación**
de la sección 4 si detectas que ya hay trabajo relacionado en marcha.

## 3. Si no existe ninguna rama activa equivalente

Crea una única rama nueva, y dilo explícitamente en el primer mensaje de
la sesión o del trabajo: nombre de la rama y desde qué base se creó
(normalmente `origin/main` actual, nunca un punto antiguo). Esto deja
rastro para que cualquier otra sesión o colaborador la encuentre antes de
duplicar el trabajo.

## 4. Proceso de reconciliación

Si detectas que otra rama (o `main`) contiene trabajo relacionado con lo
que vas a hacer, **reconcíliala antes de implementar, no después**:

1. Lee el diff real de esa rama contra su base — no te fíes solo del
   título o del mensaje de commit; verifica el contenido de los ficheros
   clave.
2. Decide explícitamente, con criterio escrito, qué se rescata y qué se
   descarta. Criterios que ya han aplicado en este repo: prioriza lo que
   aporta funcionalidad real, seguridad o reduce deuda técnica sobre lo
   que solo reorganiza documentación; si dos soluciones resuelven el mismo
   problema (p. ej. dos backends distintos para la misma app), la que ya
   está integrada en `main` gana salvo razón técnica muy fuerte para
   cambiarla.
3. Registra la decisión en `.claude/rax/DECISIONES.md` (qué se rescató, de
   dónde, qué se descartó y por qué) **antes** de dar la tarea por
   iniciada, no como limpieza posterior.
4. Nunca reimplementes desde cero algo que ya existe en `main` o en un PR
   abierto solo porque no lo viste hacer — compruébalo primero.

## 5. Creación de Pull Requests

- Un PR por unidad de trabajo coherente; evita mezclar rescates de código
  con reescrituras de documentación en el mismo PR si son cosas separables
  (facilita la revisión y el rollback).
- Título y descripción en español, claros sobre qué se hizo y por qué —
  no solo qué ficheros cambiaron. Si el PR rescata o reconcilia trabajo de
  otra rama, dilo explícitamente en la descripción (qué rama, qué se
  rescató, qué se descartó).
- Antes de abrir el PR, verifica: `npm run lint` y `npm run build` limpios
  en `joe-app`/`alquileres` si se tocaron; para los HTML monolíticos, al
  menos verificación de sintaxis JS (`node --check` sobre el contenido de
  los `<script>` inline) y una carga real sin excepciones.
- No abras un PR de código como efecto colateral de una tarea de
  documentación/arquitectura, ni al revés.

## 6. Criterio para cerrar o eliminar ramas

Antes de proponer cerrar un PR o borrar una rama, clasifica su contenido
en una de estas categorías (mismo criterio que usa `project-manager`, ver
`SKILL.md`):

| Categoría | Criterio | Qué hacer |
|---|---|---|
| **Producción** | Se usa actualmente o puede afectar a una app en funcionamiento (incluye la rama base de cualquier PR abierto, aunque el PR en sí lleve tiempo sin actividad) | No se cierra ni se borra sin aprobación expresa |
| **Inactivo con valor** | No se usa ahora, pero contiene trabajo aprovechable que no está ya en `main` ni en otro PR | Se documenta (`DEUDA_TECNICA.md`/`DECISIONES.md`) y se conserva — no se borra solo por estar parada |
| **Prueba/obsoleto** | Todo su contenido útil ya existe, verificado con diffs reales (no solo mensajes de commit), en `main` o en el PR que va a fusionarse | Segura de borrar, y solo con aprobación expresa del propietario |

Reglas adicionales:

- **Nunca borres una rama solo por antigüedad.** La fecha del último commit
  no es criterio de eliminación — el contenido sí.
- Antes de marcar una rama como "Prueba/obsoleto", verifica su contenido
  útil con un diff real contra el destino (`main` o el PR definitivo), no
  solo comparando títulos de commit — dos commits con el mismo mensaje
  pueden tener contenido distinto, y viceversa.
- Si hay cualquier duda sobre si algo sigue en uso, asume que sí lo está y
  no lo toques — regístralo para que decida el propietario en vez de
  asumir.
- El borrado de ramas remotas requiere siempre aprobación expresa, nunca
  se ejecuta como parte de una tarea de "limpieza" sin confirmación
  explícita para esa rama en concreto.

## Referencias

- `.claude/skills/project-manager/SKILL.md` — cómo la Skill de RAX aplica
  estas normas automáticamente en cada sesión de Claude Code.
- `.claude/rax/DECISIONES.md` — historial completo de decisiones,
  incluido el caso que motivó estas normas.
- `CLAUDE.md` — mapa general del repositorio y convenciones de commit.
