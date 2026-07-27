# ADN Visual de Ofipapel

Manual de reglas visuales inmutables para cualquier campaña de Ofipapel
(redes sociales, banners, material promocional). No es una guía de estilo
aspiracional: cada regla de aquí viene de una decisión ya tomada y ya
defendida — con su motivo, su ejemplo correcto real y su ejemplo
incorrecto real, observado en este mismo proyecto — no de una preferencia
estética sin probar.

Un diseñador (humano o no) que siga este documento al pie de la letra
debe producir una campaña coherente con todas las anteriores, sin
necesidad de ver ninguna de ellas primero.

No es un documento de arquitectura ni de proceso. No dice *cómo* se
construye una pieza — dice qué tiene que ser verdad en el resultado final,
sin excepción, publicable mañana en el Instagram oficial de Ofipapel.

---

## 1. Logo

### 1.1 Posición fija: esquina superior izquierda
El logo vive siempre en la esquina superior izquierda del lienzo. Nunca en
el centro, nunca flotando sobre el cuerpo de la fotografía, nunca en la
esquina inferior salvo en piezas donde el pie de página sea el único lugar
posible.

- **Motivo**: el logo es el ancla de marca del sistema — si su posición
  cambia pieza a pieza, dos campañas consecutivas no se leen como de la
  misma marca. También sostiene el equilibrio en Z de la composición
  (ver regla 9.3): logo y precio deben vivir en polos opuestos.
- **Ejemplo correcto**: logo en la esquina superior izquierda,
  `top:48px / left:64px` sobre un lienzo de 1080×1350.
- **Ejemplo incorrecto**: logo reposicionado en el centro-derecha del
  lienzo, junto a un estante de la fotografía, sin ningún ancla — ocurrió
  en una edición manual de la campaña del Ventilador MUVIP y fue el
  primer defecto señalado en la revisión de Director Creativo.
- **Prioridad**: CRÍTICO.

### 1.2 Tamaño relativo mínimo
El logo nunca puede ocupar menos de ~15% del ancho del lienzo.

- **Motivo**: por debajo de ese umbral el logo deja de leerse en la
  miniatura de un feed móvil — un logo que no se reconoce a tamaño de
  publicación no cumple su función. Esta regla dobló el tamaño del logo
  respecto al sistema original tras una revisión explícita de que "el
  logo mínimo debe ser 2 veces más grande".
- **Ejemplo correcto**: 190px de ancho sobre un lienzo de 1080px (~17,6%).
- **Ejemplo incorrecto**: logos de menos de 100px sobre el mismo lienzo
  (~9%), ilegibles a tamaño de publicación.
- **Prioridad**: CRÍTICO.

### 1.3 Legibilidad garantizada, nunca color-dependiente
El logo mantiene siempre sus colores reales de marca (verde + blanco +
naranja del icono del trébol). Nunca se convierte a un silueteado
monocromo para "que combine" con el fondo — en su lugar se ancla con una
sombra suave si la fotografía detrás es clara.

- **Motivo**: el propio logo ya combina texto blanco sobre un bloque
  verde con texto verde sobre fondo transparente — invertirlo a blanco
  monocromo hace que la parte "OFI" (ya blanca) se funda con su propio
  fondo y desaparezca.
- **Ejemplo correcto**: logo a color real + `drop-shadow` de anclaje.
- **Ejemplo incorrecto**: logo con `filter: invert(1)` que borró
  visualmente las letras "OFI".
- **Prioridad**: CRÍTICO.

---

## 2. Precio

### 2.1 Tamaño: el segundo elemento más grande de la pieza
El precio es, después del titular, el elemento tipográfico más grande de
la composición — nunca por debajo del ~85% del tamaño del titular.

- **Motivo**: instrucción explícita y repetida del propietario — "el
  precio siempre debe ser grande, casi lo más grande". Es el dato que más
  rápido convierte a un espectador en comprador; tratarlo como un dato
  secundario es el error comercial más caro que puede cometer una pieza.
- **Ejemplo correcto**: titular a 110px, precio a 100px (~91%).
- **Ejemplo incorrecto**: precio en una píldora de 30px con borde fino,
  perdido frente a un titular de 98px — versión rechazada de la campaña
  del Ventilador MUVIP antes de esta regla.
- **Prioridad**: CRÍTICO.

### 2.2 Posición: esquina superior derecha, polo opuesto al logo
El precio vive siempre en la esquina superior derecha.

- **Motivo**: junto con la regla 1.1, garantiza el recorrido en Z de la
  composición y evita que dos elementos de "negocio" (marca + precio)
  compitan en el mismo cuadrante.
- **Ejemplo correcto**: precio arriba a la derecha, logo arriba a la
  izquierda, el resto del texto abajo.
- **Ejemplo incorrecto**: logo y precio ambos en el cuadrante
  superior-derecho, forzando al ojo a decidir cuál mirar primero.
- **Prioridad**: CRÍTICO.

### 2.3 Etiqueta "PRECIO"
El numeral del precio siempre va acompañado de una etiqueta pequeña
("PRECIO") en mayúsculas espaciadas, nunca del símbolo de moneda solo o
de un texto largo tipo "desde" / "oferta especial".

- **Motivo**: confirma en menos de un segundo qué está mirando el
  espectador sin añadir ruido — un solo word extra, no una frase.
- **Ejemplo correcto**: "PRECIO" en 22px + "89€" en 100px debajo.
- **Ejemplo incorrecto**: un badge de oferta con texto adicional
  ("¡Oferta limitada!") compitiendo por el mismo espacio.
- **Prioridad**: IMPORTANTE.

---

## 3. Tipografía

### 3.1 Una sola familia tipográfica por pieza
Toda la pieza — titular, precio, subtítulo, iconos, CTA, eslogan y
footer — usa la misma familia tipográfica (Outfit). Nunca se introduce
una segunda familia decorativa, manuscrita o script, ni siquiera para el
eslogan de marca.

- **Motivo**: es la señal número uno que distingue una pieza de agencia
  de una plantilla retocada a mano. Verificado en una revisión de
  Director Creativo Ejecutivo: la mezcla de tipografías fue el defecto
  más citado de toda la crítica.
- **Ejemplo correcto**: eslogan "Mucho más que papel" en Outfit itálica,
  mismo peso visual que el resto del sistema.
- **Ejemplo incorrecto**: mismo eslogan en una fuente manuscrita/script
  conviviendo con un titular en una tipografía grotesca distinta —
  resultado de una edición manual no guiada por este documento.
- **Prioridad**: CRÍTICO.

### 3.2 Jerarquía: máximo 6 tamaños tipográficos, en escalera
Una pieza nunca usa más de 6 tamaños de texto distintos, y cada tamaño
debe representar un nivel de importancia real — nunca dos bloques de
información distinta comparten el mismo tamaño.

- **Motivo**: el ritmo de una composición se lee por la progresión de
  tamaños; aplanar la jerarquía (todo casi del mismo tamaño) o
  fragmentarla en demasiados niveles produce ambos el mismo resultado:
  el espectador no sabe qué leer primero.
- **Ejemplo correcto**: titular 110px → precio 100px → subtítulo 30px →
  CTA 34px → eslogan 24px → footer 21px/16px.
- **Ejemplo incorrecto**: seis bloques de texto entre 24px y 30px sin
  ninguno que domine claramente.
- **Prioridad**: IMPORTANTE.

### 3.3 El titular nunca es el nombre de producto en crudo
El titular es siempre una frase publicitaria escrita para vender un
beneficio, nunca el nombre comercial o la referencia (SKU) del producto
volcada tal cual.

- **Motivo**: es el cambio que más ha elevado la calidad percibida de
  toda la sesión de trabajo — la primera vez que una pieza dejó de
  sentirse genérica fue exactamente cuando el titular dejó de repetir el
  nombre del producto.
- **Ejemplo correcto**: "Tu verano, bajo control." como titular; el
  nombre técnico completo ("Ventilador nebulizador MUVIP · 75W · Mando a
  distancia") baja de categoría a subtítulo.
- **Ejemplo incorrecto**: "Ventilador Nebulizador 75W 40cm con Mando
  MUVIP - MV0596" como titular a tamaño dominante.
- **Prioridad**: CRÍTICO.

---

## 4. CTA (llamada a la acción)

### 4.1 Presencia obligatoria
Ninguna pieza puede publicarse sin un CTA explícito y legible. Es el
único elemento, junto al precio y la fotografía de producto, que nunca
se sacrifica por falta de espacio — antes se recortan iconos o
elementos decorativos.

- **Motivo**: un anuncio comercial sin llamada a la acción no es una
  pieza incompleta, es una pieza que no vende. Verificado como el
  defecto más grave posible en una revisión de Director Creativo: bastó
  con que desapareciera para que la pieza pasara de "publicable" a "no
  publicable", sin que ningún otro acierto de la composición lo
  compensara.
- **Ejemplo correcto**: "Cómpralo en Ofipapel →" siempre presente.
- **Ejemplo incorrecto**: pieza donde el CTA fue sustituido por el
  eslogan de marca durante una edición manual, dejando la campaña sin
  ninguna instrucción de acción.
- **Prioridad**: CRÍTICO.

### 4.2 Posición: tercio inferior, alineado al margen izquierdo
El CTA vive siempre en el tercio inferior de la pieza, después del
argumento de venta (subtítulo/iconos) y antes del eslogan/footer —
nunca en la mitad superior, nunca flotando aislado sobre la fotografía.

- **Motivo**: continúa el recorrido de lectura natural — titular,
  argumento, acción — en ese orden y sin saltos.
- **Prioridad**: CRÍTICO.

### 4.3 Tamaño mínimo
El texto del CTA nunca baja de 30px sobre un lienzo de 1080px de ancho
(~2,8% del ancho del lienzo), y siempre lleva un subrayado o marca visual
de acento (verde lima) que lo distinga como interactivo.

- **Motivo**: por debajo de ese tamaño deja de leerse como una acción
  y se confunde con texto informativo.
- **Ejemplo correcto**: 34px, subrayado de 2px en verde lima (#8DC41E).
- **Ejemplo incorrecto**: CTA de 14-20px sin ningún tratamiento visual
  que lo diferencie del resto del texto — sistema previo a la revisión
  de proporciones.
- **Prioridad**: CRÍTICO.

---

## 5. Iconos

### 5.1 Tamaño mínimo: 32px
Ningún icono baja nunca de 32px de lado sobre un lienzo de 1080px.

- **Motivo**: instrucción explícita y terminante del propietario —
  "nunca vuelvas a generar elementos diminutos" — tras detectar iconos
  de apenas 15-20px, ilegibles en móvil.
- **Ejemplo correcto**: 40px actual, con etiqueta de texto de 16px
  debajo.
- **Ejemplo incorrecto**: iconos de 15-20px del sistema anterior a la
  revisión de proporciones.
- **Prioridad**: CRÍTICO.

### 5.2 Un único lenguaje visual: línea, sin relleno, mismo grosor
Todos los iconos de una misma pieza — incluidos los de contacto en el
footer — comparten el mismo estilo: trazo de línea, sin relleno, mismo
grosor (~1,8px), esquinas redondeadas. Nunca se mezcla un icono de línea
con un icono de relleno sólido o de color.

- **Motivo**: un icono de estilo distinto (por ejemplo, un icono de app
  de mensajería con relleno de color) rompe la consistencia del sistema
  y se lee como un elemento pegado a posteriori, no diseñado junto al
  resto.
- **Ejemplo correcto**: icono de teléfono en el footer con el mismo
  trazo de línea blanca que los iconos de características del producto.
- **Ejemplo incorrecto**: icono de WhatsApp en círculo verde relleno
  junto a iconos de línea blanca — resultado de una edición manual.
- **Prioridad**: CRÍTICO.

### 5.3 Solo con señal real detrás
Un icono nunca se añade como relleno decorativo — solo representa una
característica que existe de verdad en la descripción del producto.

- **Motivo**: principio de "todo elemento debe justificar su
  existencia"; un icono sin dato real detrás es ruido, no información.
- **Prioridad**: IMPORTANTE.

---

## 6. Footer / pie de contacto

### 6.1 Contenido fijo
El footer contiene siempre: teléfono, web y dirección — nunca más
información que esa, nunca menos.

- **Prioridad**: IMPORTANTE.

### 6.2 Tamaño y jerarquía
Texto del footer nunca por debajo de 16px; nunca al mismo tamaño ni peso
visual que el CTA — es, con intención, el nivel de menor jerarquía de la
pieza, pero legible sin entrecerrar los ojos.

- **Ejemplo correcto**: 21px, opacidad reducida (~0,68) respecto al
  blanco puro del resto del texto.
- **Ejemplo incorrecto**: 16px a opacidad 0,55 — técnicamente legible en
  pantalla grande, insuficiente en una miniatura de móvil.
- **Prioridad**: IMPORTANTE.

### 6.3 Tratamiento: nunca una caja de canto duro
El footer se resuelve siempre integrado sobre la fotografía (transparente
o con degradado), nunca como una banda de color sólido con un corte recto
que interrumpe la imagen.

- **Motivo**: una banda de color sólido con canto duro se lee como una
  pegatina añadida al final, no como parte de la composición original.
- **Prioridad**: IMPORTANTE.

---

## 7. Márgenes y espacio

### 7.1 Margen estructural mínimo
Ningún elemento de texto o icono puede tocar el borde del lienzo. Margen
mínimo uniforme del ~6% del ancho del lienzo en los cuatro lados (64px
sobre 1080px).

- **Prioridad**: CRÍTICO.

### 7.2 Espacio negativo: el tercio superior respira
El tercio superior del lienzo (por encima del bloque de titular) queda
predominantemente despejado — solo logo y precio, nunca texto adicional,
nunca un segundo bloque de información.

- **Motivo**: es el "respiro" que separa la fotografía del bloque de
  comunicación inferior y evita que la pieza se sienta saturada aunque
  todos los elementos individuales sean grandes.
- **Ejemplo incorrecto**: rellenar ese espacio con un elemento adicional
  (badge, sello, texto promocional) solo porque hay sitio libre.
- **Prioridad**: IMPORTANTE.

---

## 8. Cantidad de elementos

### 8.1 Máximo 8 bloques de contenido
Una pieza nunca supera 8 bloques de contenido: logo, precio, titular,
subtítulo, fila de iconos, CTA, eslogan, footer. Ningún elemento
adicional (sellos, marcos, textos promocionales extra, badges de
urgencia) se añade sin eliminar uno de los ocho existentes primero.

- **Motivo**: "si un elemento no aporta valor, se elimina" — cada bloque
  nuevo compite por la misma atención finita del espectador.
- **Prioridad**: IMPORTANTE.

---

## 9. Contraste, color y composición

### 9.1 Contraste de texto siempre garantizado, nunca casual
Todo texto sobre fotografía va siempre respaldado por una capa de
oscurecimiento (degradado) dedicada a esa zona — nunca depende de que la
foto sea "casualmente oscura" ahí.

- **Motivo**: una fotografía real cambia de tono según el encuadre; el
  contraste no puede ser un accidente de composición.
- **Ejemplo incorrecto**: texto blanco superpuesto directamente sobre una
  ventana clara sin ningún oscurecimiento detrás, ilegible en parte.
- **Prioridad**: CRÍTICO.

### 9.2 Uso del verde: un solo acento por pieza
El verde institucional (#1A5C1A / #237523) y el acento lima (#8DC41E) son
los únicos colores de marca. El lima se reserva para un único detalle de
énfasis por pieza (el subrayado del CTA o la palabra "papel" del
eslogan) — nunca para bloques grandes de fondo salvo en piezas
explícitamente concebidas como panel de marca. Prohibido introducir un
segundo acento de color (turquesa, naranja, morado...) sin motivo de
marca explícito.

- **Prioridad**: IMPORTANTE.

### 9.3 Recorrido visual fijo
El recorrido de lectura de toda pieza sigue siempre el mismo orden:
**precio (arriba-derecha) → producto/fotografía (centro) → titular
(abajo-izquierda) → argumento/iconos → CTA → eslogan/contacto**, con el
logo siempre en el polo opuesto al precio (arriba-izquierda) sosteniendo
el equilibrio en Z de toda la composición.

- **Prioridad**: CRÍTICO.

### 9.4 Punto focal: el producto en uso, nunca el precio ni el logo
El punto focal fotográfico de la pieza es siempre el producto — a ser
posible en uso real, no aislado sobre fondo blanco si existe una
fotografía lifestyle real disponible. El precio es el punto focal
*tipográfico* secundario; el logo nunca es punto focal.

- **Ejemplo correcto**: fotografía real del producto en un salón, a
  sangre completa, ocupando el 100% del lienzo.
- **Ejemplo incorrecto**: producto recortado sobre fondo blanco genérico
  habiendo una fotografía de uso real disponible.
- **Prioridad**: CRÍTICO.

---

## 10. Totalmente prohibido

Resumen de las líneas rojas de este documento — cualquiera de estos
puntos, por sí solo, invalida una pieza para publicación:

1. Logo fuera de su esquina fija superior izquierda.
2. Pieza sin CTA visible.
3. Más de una familia tipográfica en la misma pieza.
4. Iconos mezclando estilos (línea + relleno, blanco + color).
5. Bandas de color sólido con canto duro cortando la fotografía.
6. Texto u otro elemento tocando el borde del lienzo.
7. Elementos decorativos sin un dato real detrás (iconos de relleno,
   sellos, badges de urgencia falsa).
8. Titular que es el nombre de producto o la referencia (SKU) en crudo.
9. Precio tratado como dato secundario (tamaño menor al ~85% del
   titular).
10. Dos elementos de marca/negocio (logo y precio) compartiendo el mismo
    cuadrante del lienzo.
