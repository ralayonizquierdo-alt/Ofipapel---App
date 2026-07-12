---
name: diseno-ofipapel
description: Genera piezas de diseño de marca para Ofipapel, Canarias INK o FalControl — banners web, publicaciones para redes sociales, carteles, flyers y material promocional — reutilizando la identidad visual real de cada marca. Úsalo cuando el usuario pida un banner, cartel, flyer, publicación/post, gráfico de redes, material promocional, o cualquier pieza visual de marca para alguna de estas tres apps. No lo uses para diseño de interfaz de joe-app/alquileres (eso es UI de producto, no una pieza de marca) ni para nada fuera de estas tres marcas.
---

# Skill: Diseño Ofipapel

Produce piezas de diseño de marca (banners, posts, carteles, flyers, material
promocional) para las tres marcas del grupo, reutilizando su identidad visual
real en vez de inventar una nueva cada vez.

Esta skill es la **capa de invocación**. La capa de capacidades (brand kits,
scripts de render, integración con Adobe) vive en `design-studio/` en la raíz
del repo y es compartida por todas las skills de diseño presentes y futuras —
no dupliques esa información aquí; consúltala.

## Antes de empezar

1. Lee `design-studio/README.md` — ahí están las 3 secciones que necesitas:
   - **Sección 1**: qué herramienta usar según la tarea (conector Adobe for
     Creativity ya autenticado, `design-studio/scripts/render-html.js` para
     salida standalone PNG/PDF, `design-studio/scripts/firefly-generate.js`
     para imágenes generadas por IA).
   - **Sección 2**: brand kit real de cada marca (paleta, tipografía,
     gradiente de referencia) — Ofipapel, Canarias INK, FalControl. Usa
     siempre estos valores; no inventes una paleta nueva.
   - **Sección 3**: flujo recomendado paso a paso.
2. Identifica qué marca es (si no está claro por el encargo, pregunta:
   Ofipapel / Canarias INK / FalControl).
3. Identifica el tipo de pieza y sus dimensiones por defecto (tabla abajo).
4. Sigue el playbook de `create_visual_design_express_skill` (Adobe) para
   redactar el HTML del diseño — esta skill no reemplaza ese playbook, lo
   invoca con el contexto de marca ya resuelto.

## Tipos de pieza y dimensiones por defecto

| Encargo | Dimensiones sugeridas | Notas |
|---|---|---|
| Banner web (cabecera, hero) | 1200×630 px | Igual que `design-studio/templates/ofipapel-banner.html` (referencia) |
| Publicación cuadrada (Instagram/Facebook) | 1080×1080 px | — |
| Historia / story (Instagram/Facebook) | 1080×1920 px | — |
| Flyer / hoja informativa | A4 — 210×297mm (794×1123 px a 96dpi) | Usar unidades absolutas (mm), no px, si se va a imprimir |
| Cartel pequeño | A3 — 297×420mm (1123×1587 px a 96dpi) | Confirmar con el usuario si es para imprimir |
| Material promocional variado (ofertas, avisos) | Según destino — pregunta si no está especificado | No asumas tamaño de imprenta sin confirmar |

Si el encargo no encaja en esta tabla, usa el criterio del playbook de Adobe
(`create_visual_design_express_skill`, sección "Suggested dimensions") y, si
es para imprenta, confirma el tamaño con el usuario antes de producir la
pieza final.

## Entrega

Sigue la regla ya establecida en `design-studio/README.md` sección 3: pregunta
siempre el destino antes de producir el archivo final —
documento Adobe Express editable, archivo standalone (PNG/PDF), o ambos.

- **Express** → `html_export_readiness_skill` → `export_html_to_express`.
- **Standalone** → `design-studio/scripts/render-html.js`.

Guarda cualquier plantilla HTML nueva y reutilizable en
`design-studio/templates/` (versionada). Los archivos generados van a
`design-studio/output/` (en `.gitignore`, no se versionan).

## Si hace falta una fotografía que no existe

1. Primero Adobe Stock con licencia (`asset_search` +
   `asset_license_and_download_stock`) — más rápido y sin coste de
   generación.
2. Si no hay nada adecuado en stock, `design-studio/scripts/firefly-generate.js`
   (requiere `FIREFLY_CLIENT_ID`/`FIREFLY_CLIENT_SECRET` — ver
   `design-studio/README.md` sección 1C si aún no están configuradas).

## Principio de esta arquitectura

Esta skill no debe modificarse para añadir soporte a una marca o tipo de
pieza no relacionados con diseño de marca — eso corresponde a una skill
nueva. Cada skill de RAX vive en su propia carpeta bajo `.claude/skills/` y
es autocontenida: añadir una skill nueva nunca requiere tocar esta. Ver
`.claude/skills/README.md` para el criterio de cuándo crear una skill nueva
frente a extender esta.
