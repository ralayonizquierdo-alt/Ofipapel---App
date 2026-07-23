# `.claude/brand` — Identidad de marca oficial de OFIPAPEL

Esta carpeta es la **fuente única de verdad** de la identidad visual de
OFIPAPEL. No es un proyecto ni una app: es documentación y activos de
referencia que cualquier Skill (actual o futura) debe consultar **antes**
de generar cualquier pieza gráfica o publicitaria para la marca.

No sustituye ni duplica nada de lo que ya existe en el repo
(`design-studio/`, `.claude/skills/diseno-ofipapel/`): los complementa como
capa de reglas y activos oficiales, verificados y aprobados por el
propietario del negocio.

## Por qué existe

Antes de esta carpeta, la identidad de marca vivía repartida e implícita:
código CSS de `Index.html`, plantillas de `design-studio/templates/`,
y criterio manual de cada encargo. Eso funciona para generar piezas, pero
no da un lugar único, explícito y versionado donde consultar "¿esto es
correcto para la marca?" antes de publicar nada.

## Estructura

```
.claude/brand/
├── README.md       ← este documento
├── reglas.md        reglas de identidad visual (obligatorias)
├── mejoras.md        oportunidades de mejora detectadas, pendientes de aprobación
├── logo/            logotipo oficial y variantes aprobadas
├── colores/         paleta oficial de color
├── tipografias/      tipografías oficiales
├── plantillas/       plantillas de diseño aprobadas (banners, posts, flyers...)
├── ejemplos/         piezas ya aprobadas, como referencia de estilo
└── prompts/          prompts de generación de imagen aprobados (Firefly, etc.)
```

## Quién debe consultar esto

Cualquier Skill o flujo que genere contenido gráfico o publicitario para
OFIPAPEL — hoy, principalmente `.claude/skills/diseno-ofipapel/` y el
`design-studio/` — debe leer `reglas.md` (y los activos de `logo/`,
`colores/`, `tipografias/` que apliquen) antes de producir nada. Si un
prompt o instrucción puntual contradice lo que hay aquí, **gana esta
carpeta**.

## Cómo evoluciona

Esta carpeta está pensada para aprender con el tiempo, no para quedarse
congelada el día de su creación:

- Cuando el propietario apruebe un diseño, plantilla o decisión de
  identidad visual, se propondrá incorporarla aquí (como nueva regla en
  `reglas.md`, plantilla en `plantillas/`, o ejemplo en `ejemplos/`).
- Nunca se modifica la identidad visual de forma automática. Toda
  incorporación requiere aprobación explícita del propietario.
- Las oportunidades de mejora detectadas en la propia estructura se
  documentan en `mejoras.md`, nunca se aplican solas.

## Modo conservador

Ante cualquier duda sobre marca, se pregunta antes de inventar. En
particular, nunca se inventan logotipos, colores, productos,
especificaciones, precios, teléfonos, direcciones ni textos comerciales:
si no está documentado aquí ni confirmado por el propietario, se pregunta.
