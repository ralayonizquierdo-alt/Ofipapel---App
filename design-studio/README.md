# RAX Design Studio

RAX (esta sesión de Claude Code) puede actuar como estudio de diseño digital
para Ofipapel: crear banners, logotipos, gráficos para redes, editar fotos de
producto y preparar piezas listas para imprimir o publicar — sin depender de
un diseñador humano para cada pieza. Este documento es la referencia que debe
consultarse (o que un futuro RAX debe leer) antes de abordar cualquier
encargo visual.

## 1. Herramientas disponibles y cuándo usar cada una

### A. Conector "Adobe for Creativity" (MCP) — nivel Photoshop/Illustrator/InDesign/Express

Ya autenticado con cuenta completa de Adobe (no cuenta de invitado) en esta
sesión. Cubre la mayoría de necesidades **sin pedir ninguna clave**:

| Necesidad | Herramienta / flujo |
|---|---|
| Banner, logotipo, póster, gráfico de redes **desde cero** | `create_visual_design_express_skill` (playbook de diseño en HTML) → `font_recommend`/`find_fonts` → `get_fontkit_embed_url` → `html_export_readiness_skill` → `export_html_to_express` (si el destino es un documento Express editable) |
| Partir de una plantilla ya diseñada (flyer, post de Instagram, invitación...) | `search_design` (plantillas de Adobe Express) → `fill_text` / `change_background_color` → `download_design` |
| Editar foto de producto: recorte, color, exposición, viñeteado, quitar fondo | `image_remove_background`, `image_apply_adjustments`, `image_crop_and_resize`, `image_apply_auto_tone`, `image_apply_preset`, etc. |
| Vectorizar un logo o dibujo (PNG/foto → SVG editable) | `image_vectorize` |
| Ampliar/expandir el lienzo de una imagen (outpainting) | `image_generative_expand` — es la única capacidad generativa disponible en este conector |
| Foto de stock con licencia comercial real (no genérica de internet) | `asset_search` (`entityScope: "StockAsset"`) → `asset_license_and_download_stock` |
| Maquetación multipágina / folletos / mail merge desde CSV | herramientas de InDesign (`document_render_layout`, `document_merge_data_layout`, etc.) |
| Mood board / tablero de referencias visuales | `create_firefly_board` |

**Limitación importante de este conector:** en este entorno **no** incluye
generación de imágenes por IA a partir de texto (text-to-image), relleno
generativo, reemplazo de fondo por prompt, ni eliminación de objetos. Para eso
existe la integración con Firefly descrita en la sección C.

Antes de cualquier llamada a una herramienta Adobe hay que invocar primero
`adobe_mandatory_init` (una vez por sesión).

### B. Render HTML → PNG/PDF standalone (`design-studio/scripts/render-html.js`)

Para cuando el destino es un archivo (PNG/PDF) y no un documento de Adobe
Express — por ejemplo, para publicar directo en la web o enviar a imprenta
sin pasar por Express. Usa el mismo playbook de diseño en HTML
(`create_visual_design_express_skill`) para redactar el fichero, pero en vez
de exportarlo a Express, se renderiza con Chromium headless (Playwright, ya
preinstalado en las sesiones en la nube de Claude Code):

```bash
NODE_PATH=/opt/node22/lib/node_modules node design-studio/scripts/render-html.js \
  design-studio/templates/mi-diseno.html \
  design-studio/output/mi-diseno.png \
  1200 630 2   # ancho, alto, escala (2 = @2x / retina)
```

Cambia la extensión de salida a `.pdf` para exportar PDF en vez de PNG (usa
las mismas dimensiones en píxeles CSS).

En un entorno sin Playwright preinstalado: `npm install playwright && npx playwright install chromium`,
y elimina el `executablePath` fijo del script (o ajústalo a tu instalación).

`design-studio/output/` está en `.gitignore` — son artefactos regenerables,
no se versionan. Lo que sí se versiona son las plantillas HTML fuente en
`design-studio/templates/`.

### C. Adobe Firefly Services API (generación de imágenes por IA) — preparado, pendiente de credenciales

`design-studio/scripts/firefly-generate.js` implementa el flujo completo
(OAuth Server-to-Server + llamada a `POST /v3/images/generate`) para generar
imágenes comerciales a partir de un prompt de texto. Firefly se entrena solo
con contenido con licencia y de dominio público, por lo que sus resultados
son seguros de usar comercialmente (a diferencia de muchos generadores de IA
genéricos) — es la opción adecuada para un negocio real.

**Estado: código escrito pero sin probar** (no hay credenciales configuradas
en este entorno todavía). Antes de confiar en él, pruébalo una vez con las
credenciales reales.

Para activarlo:
1. Entra en https://developer.adobe.com/console, crea o reutiliza un proyecto.
2. "Add API" → "Firefly API" (dentro de Firefly Services).
3. Credencial de tipo **OAuth Server-to-Server**.
4. Copia el **Client ID** y el **Client Secret**.
5. Expórtalos como variables de entorno (nunca los pegues en el código ni los subas al repo):
   ```bash
   export FIREFLY_CLIENT_ID="..."
   export FIREFLY_CLIENT_SECRET="..."
   ```
6. Uso:
   ```bash
   node design-studio/scripts/firefly-generate.js \
     "estantería de papelería moderna, luz natural, foto de producto" \
     design-studio/output/producto.png 2048 2048 photo
   ```

**Nota de coste:** la API de Firefly factura por generación por encima de la
cuota gratuita del plan de Adobe. No automatizar en bucle ni en un pipeline
sin supervisión hasta confirmar el pricing con la cuenta real.

## 2. Brand kits (paleta y tipografía reales de cada producto)

Cada uno de los tres productos de Ofipapel tiene su propia identidad visual
ya establecida en el código — úsalas para que cualquier pieza nueva encaje
con lo existente en vez de inventar una paleta distinta.

### Ofipapel (`Index.html`) — control financiero / marca institucional
- Verde oscuro corporativo: `#1A5C1A` · Verde medio: `#237523` · Verde claro: `#3DAF3D`
- Acento lima (del logo): `#8DC41E` · Acento oscuro: `#6FA018`
- Acento naranja (del logo): `#F5A623`
- Fondo pálido: `#F2F8F2` / `#EBF7EB`
- Tipografía: **Inter** (texto general) + **IBM Plex Mono** (etiquetas, datos, acentos técnicos), ambas vía Google Fonts `@import` — así es como ya se cargan en `Index.html`.
  - Nota Adobe Fonts: `Inter` no está en el plan Adobe Fonts conectado (`not_entitled`); `IBM Plex Mono` sí (`IBMPlexMono-Bold`, disponible). Para piezas que vayan a Adobe Express, usa Adobe Fonts cuando puedas y cae a Google Fonts `@import` para igualar la marca exacta cuando el destino sea un archivo standalone.
- Gradiente de fondo de referencia (pantalla de login): `linear-gradient(135deg,#0d3d0d 0%,#1A5C1A 40%,#237523 70%,#3a8f2a 100%)`

#### Fondo e identidad corporativa oficial para publicaciones (obligatorio)

Proporcionado por el propietario el 2026-07-21 — **usar como fondo/paleta por
defecto en todas las publicaciones de redes sociales** (posts e imágenes de
producto), no solo en piezas de `Index.html`, salvo que se pida explícitamente
otra cosa:

- Imagen fuente versionada: `design-studio/assets/fondo-corporativo-ofipapel.png`
  (textura de ondas verdes con motivo de trébol — mismo trébol del logo —
  destellos y una franja azul/turquesa en la esquina inferior izquierda).
- Colores extraídos de esa imagen (ampliación de la paleta de arriba, no la
  sustituyen):
  - Verde brillante (dominante del fondo): `#5FB355` – `#83D084`
  - Verde claro / highlight: `#9DDD9C` – `#C0E4C3`
  - Acento azul/turquesa (nuevo, esquina del fondo): `#6DB0AE`
  - Transición verde-amarillo (borde del fondo): `#C1D48A`
  - Blanco base: `#FEFEFC`
- Úsalo como `background-image` (con `background-size:cover`) en piezas donde
  el fondo verde plano/gradiente quedaría soso — tarjetas de características,
  pantallas finales de vídeo, posts de producto — en vez de un
  `linear-gradient` inventado. El acento azul es nuevo respecto a la paleta
  histórica (solo verdes): úsalo con moderación (detalles, no como color
  principal) hasta que el propietario confirme si sustituye o complementa el
  naranja como segundo acento.

### Canarias INK (`canarias-ink.html`) — e-commerce de consumibles de impresora
- Fondo oscuro: `#1A1D2E` / `#12141F` (sidebar)
- Acento primario cian: `#00B4D8`
- Acentos por categoría de producto: tóner `#E63946`, inkjet `#2196F3`, botella `#00BFA5`, cinta `#FF9800`, etiqueta `#9C27B0`, ribbon `#5C6BC0`
- Tipografía: **Inter** + **IBM Plex Mono**, igual que Ofipapel (vía Google Fonts)

### FalControl (`falcontrol.html`) — alertas de radio
- Fondo casi negro: `#0d0d0d` / tarjetas `#191919` / `#212121`
- Verde de estado: `#00e676` · Rojo de alerta: `#ff1744` · Naranja: `#ff6d00`
- Tipografía: system UI (`Segoe UI`, system-ui) — sin fuente de marca específica

## 3. Flujo recomendado para un encargo nuevo

1. **Identifica el destino**: ¿documento Adobe Express editable, archivo standalone (PNG/PDF/PPTX), o ambos? Pregúntalo si no está claro (regla del propio playbook de diseño).
2. **Elige la paleta/tipografía** de la sección 2 según qué producto de Ofipapel es la pieza.
3. **Redacta el HTML** siguiendo `create_visual_design_express_skill` (dimensiones fijas, metadatos `hz:canvas-*`, fuentes embebidas correctamente).
4. **Entrega**:
   - Express → `html_export_readiness_skill` y luego `export_html_to_express`.
   - Standalone → `design-studio/scripts/render-html.js`.
5. Si la pieza necesita una fotografía que no existe (producto, escena, etc.):
   - Primero intenta **Adobe Stock con licencia** (`asset_search` + `asset_license_and_download_stock`) — más rápido, sin coste de generación, resultado profesional real.
   - Si hace falta una imagen específica que no existe en stock → `design-studio/scripts/firefly-generate.js` (requiere credenciales, ver sección 1C).

## 4. Estructura de esta carpeta

```
design-studio/
├── README.md              ← este documento
├── templates/              plantillas HTML fuente (versionadas)
│   ├── ofipapel-banner.html            demo de banner de marca genérico de Ofipapel
│   └── ofipapel-vuelta-al-cole-*.html  campaña real (banner/post/story/whatsapp/landing)
├── campaigns/
│   └── vuelta-al-cole-2026/COPY.md     copy comercial, CTAs y confirmaciones pendientes de cada campaña
├── assets/                 activos de marca fuente reutilizables (logos, etc.), versionados
├── scripts/
│   ├── render-html.js        HTML → PNG/PDF standalone (Playwright/Chromium)
│   └── firefly-generate.js   texto → imagen vía Adobe Firefly API (sin probar, pendiente de credenciales)
└── output/                 artefactos generados (en .gitignore, no versionar)
```
