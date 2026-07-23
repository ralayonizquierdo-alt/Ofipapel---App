# Reglas de identidad de marca — OFIPAPEL

Estas reglas son obligatorias para cualquier pieza gráfica o publicitaria
de OFIPAPEL (banners, posts, flyers, carteles, material promocional,
catálogo, etc.). Ante cualquier contradicción entre un prompt o encargo
puntual y estas reglas, **prevalecen siempre estas reglas**.

## 1. Logotipo

- Utilizar siempre el logotipo oficial, tal cual está en `logo/`.
- **Nunca recrear el logotipo mediante IA** (ni "parecido", ni
  "inspirado en", ni regenerado). Si se necesita un formato o tamaño
  distinto, se re-exporta el original — no se redibuja.
- El logotipo debe colocarse siempre sobre una zona blanca (o de contraste
  suficiente que no comprometa su legibilidad). No superponer directamente
  sobre fotografías, texturas o fondos de color sin una zona blanca de
  respiro alrededor.

## 2. Fotografía de producto

- Nunca modificar un producto original (forma, proporciones, marca,
  etiqueta, color real del producto).
- Solo se puede cambiar: fondo, iluminación y composición de la escena.
  Todo lo demás del producto se mantiene fiel a la realidad.

## 3. Color

- Utilizar siempre la paleta oficial (ver `colores/paleta.md`).
- El **verde medio (`#237523`) es el color corporativo principal**.
- No introducir colores fuera de la paleta oficial salvo aprobación
  explícita del propietario (que pasaría a documentarse aquí).

## 4. Estilo y composición

- Mantener un estilo limpio, moderno y con mucho espacio en blanco. Evitar
  saturar la composición de elementos.
- El precio debe tener gran protagonismo cuando la pieza incluya un
  precio: tamaño, contraste y posición que lo hagan lo primero que se lee
  después del producto.

## 5. Mensajes oficiales

- Eslogan oficial: **"Mucho más que papel"**.
- Dirección de la sede principal (Los Cristianos): **C/ Bulevar Chajofe,
  n.º 4, 38650 Los Cristianos, Santa Cruz de Tenerife, España** — verificada
  contra `netlify/functions/whatsapp-agent-config.js` (fuente ya existente
  en el repo; OFIPAPEL tiene además otras dos tiendas — Av. de Suecia y
  Res. Las Viñas — que no deben confundirse con la sede principal salvo que
  el encargo sea específicamente sobre esa tienda).

## 6. Nunca inventar

Ante cualquier duda, preguntar antes que inventar. En particular, nunca se
inventan:

- logotipos
- colores
- productos
- especificaciones (medidas, materiales, compatibilidades...)
- precios
- teléfonos
- direcciones
- textos comerciales

Si un dato necesario no está en esta carpeta ni en el resto del repo,
se pregunta al propietario en lugar de asumirlo.

## Autoaprendizaje

Cuando el propietario apruebe un diseño, una plantilla o una decisión de
identidad visual, se propondrá incorporarla a `.claude/brand` (como regla
nueva aquí, plantilla en `plantillas/`, o ejemplo en `ejemplos/`) para que
el sistema evolucione. Nunca se modifica la identidad visual de forma
automática sin esa aprobación explícita.
