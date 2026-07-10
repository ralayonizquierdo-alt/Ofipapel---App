---
name: project-manager
description: Prioriza y coordina el trabajo propuesto por las demás Skills de RAX (campañas, piezas, iniciativas). Úsala cuando haya que decidir qué se ejecuta primero, registrar una propuesta de trabajo, o consultar qué está en curso antes de proponer algo nuevo.
---

# project-manager

Coordinador de trabajo entre Skills. No ejecuta campañas ni diseña piezas —
decide (o ayuda a decidir) qué se hace primero y evita que dos Skills
dupliquen esfuerzo sobre lo mismo.

Esta es una versión mínima: un formato de cola de prioridades y las reglas
para usarla. Se ampliará con vistas por estado, dependencias entre tareas y,
más adelante, sincronización con una herramienta externa de gestión si el
negocio la adopta — sin romper el formato de archivo que las demás Skills ya
usan para escribir en la cola.

## Cuándo usarla

- Antes de empezar un trabajo nuevo de tamaño no trivial (una campaña, una
  serie de piezas, un plan anual): revisa la cola para ver si ya hay algo
  parecido en curso o planificado.
- Al terminar de diseñar una propuesta (p. ej. `sales-marketing` proponiendo
  3 campañas): regístrala en la cola con impacto/esfuerzo en vez de decidir
  unilateralmente cuál se ejecuta.
- Cuando el negocio (el usuario) pida prioridades o quiera reordenar el
  trabajo pendiente.

## Cómo usarla

1. Cola de prioridades: `references/cola-prioridades.md`. Es un archivo
   vivo — cualquier Skill puede añadir una fila, ninguna debe borrar el
   historial de otra sin motivo (marca como completada/descartada en vez de
   eliminar).
2. Formato de cada propuesta: título, Skill de origen, negocio (Ofipapel /
   Canarias INK / ambos), impacto estimado (alto/medio/bajo), esfuerzo
   estimado (alto/medio/bajo), fecha límite si la hay, estado
   (propuesta / en curso / hecha / descartada).
3. Criterio de priorización por defecto cuando el usuario no da uno propio:
   primero impacto alto + esfuerzo bajo, luego lo atado a una fecha del
   calendario comercial que ya se acerca, y el resto por impacto.
4. Si dos Skills proponen trabajo que se solapa (p. ej. dos campañas para el
   mismo hueco de calendario), señálalo y pide al usuario que elija en vez
   de fusionarlas por tu cuenta.

## Fuera de alcance (todavía)

Integración con herramientas externas de gestión de proyecto (Trello,
Asana, Linear...). Si el negocio adopta una, esta Skill es el punto natural
para documentar esa conexión.
