# Arquitectura de integración con Canva Connect (diseño, sin implementar)

**Estado: diseño only — cero código escrito.** Encargo explícito del
propietario: dejar la arquitectura lista para implementación inmediata,
pero la prioridad sigue siendo resolver el texto fantasma que OpenAI
introduce en las fotografías (ver `.claude/rax/DEUDA_TECNICA.md` DT-18)
antes de tocar una sola línea de esto.

## Flujo objetivo

```
HELIX → OpenAI (fotografía limpia del producto) → Canva (composición) → Control de calidad → Publicación
```

Sustituye el rol que hoy tiene `creative-lab/layout-composer/` (HTML +
Chromium): la fotografía sale de `openai-images.provider.js` tal cual
(sin texto/logo/CTA, ya forzado hoy vía `NEGATIVE_PROMPT_TERMS`), y toda
la composición (logo, título, precio, CTA, iconos, dirección, redes)
pasa a hacerla Canva sobre una plantilla de marca ya diseñada.

## Piezas de la API real de Canva Connect (verificadas, no supuestas)

Confirmado usando las herramientas MCP de Canva ya disponibles en esta
sesión (no inventado de memoria):

1. **OAuth 2.0** — toda llamada a la API real requiere un token de una
   app registrada en el Canva Developer Portal, con consentimiento del
   usuario/organización propietaria del Brand Kit de Ofipapel.
2. **Brand Templates** (`search-brand-templates` / `get-brand-template-dataset`) —
   una plantilla de marca ya diseñada en Canva expone un *dataset*: un
   mapa de campos rellenables por nombre, cada uno con un tipo
   (`text` o `image`). Si el dataset viene vacío, esa plantilla no sirve
   para autofill — hay que etiquetar sus elementos primero.
3. **Tagging de plantillla** (`create-brand-template-draft` →
   `start-editing-transaction` → `perform-editing-operations` con
   `autofill_field_label` → `commit-editing-transaction` →
   `publish-brand-template`) — así es como un elemento de diseño (una
   caja de texto, un marco de imagen) se convierte en un campo
   rellenable con un nombre concreto (`titulo`, `precio`, `foto_producto`,
   `logo`...). Es trabajo de diseño, se hace una vez por plantilla.
4. **Autofill** (`autofill-design`, no directamente expuesta en las
   herramientas que tengo cargadas en esta sesión pero documentada por
   `search-brand-templates`/`create-design-from-brand-template` como el
   mecanismo real) — crea un diseño nuevo a partir de una plantilla +
   un dataset de valores (texto plano por campo `text`, ID de asset por
   campo `image`).
5. **Subida de assets** — la herramienta `upload-asset-from-url`
   disponible en esta sesión **solo acepta URLs ya públicas** (nunca
   archivos locales/generados, por seguridad). La API REST real de
   Canva Connect (`POST /v1/asset-uploads`) sí admite subir bytes
   directamente sin pasar por una URL pública — así es como se subiría
   la foto real generada por OpenAI (que vive solo en memoria/`/tmp` de
   la función Netlify, nunca debe publicarse en una URL pública). Punto
   importante a no perder: la implementación real usará esa vía directa
   de la API REST, no el patrón "desde URL" de las herramientas
   interactivas de esta sesión.
6. **Exportación** (`export-design`, tras `get-export-formats`) — PNG
   final descargable una vez el diseño está autorellenado.

## Diseño de la integración futura (para cuando se active)

### 1. Plantillas de marca en Canva (trabajo de diseño manual, no de código)

Una plantilla de marca por cada una de las 4 familias oficiales
(Lifestyle, Premium Editorial, Comercial, Problema-Solución — mismas 4
de `art-direction-engine/patterns.js#OFFICIAL_FAMILIES`), diseñada a
mano en Canva con el Brand Kit real de Ofipapel (fuente, colores,
logo), y con estos campos etiquetados para autofill:

| Campo (dataset) | Tipo | Origen en el pipeline actual |
|---|---|---|
| `foto_producto` | image | Foto limpia de `openai-images.provider.js` |
| `logo` | image | Ya fijo en la plantilla (no hace falta autofill si no cambia) |
| `titulo` | text | `brief.copy.title` |
| `precio` | text | `brief.copy.price` (hoy sin cablear, ver DT — pendiente aparte) |
| `cta` | text | `brief.copy.cta` |
| `direccion` | text | `preparedAssets.brand.contact` |
| `redes` | text/image | `preparedAssets.brand.contact` (iconos ya fijos en plantilla si son siempre los mismos) |
| `iconos_specs` | text (×N) | Derivados de `brief.product.description`, mismo criterio que `icon-library` hoy |

Esto es trabajo de diseño en la propia Canva, no algo que un commit
resuelva — es el equivalente a lo que ya se hizo a mano para las 4
plantillas maestras oficiales (`.claude/rax/DECISIONES.md`, sprint
"Cierre de arquitectura" Fase 3).

### 2. Nuevo proveedor (reutiliza el stub ya existente, no arquitectura paralela)

`creative-engine/provider-manager/providers/canva.provider.js` **ya
existe** como stub (`status:'planned'`, `kind:'template'`,
`supportsReferenceImages:true` en su META declarada desde el principio
justo para este caso). Activarlo sigue el mismo patrón documentado en
`README.md` ("Cómo activar un proveedor ya registrado"):

```
generate(req) {
  // req.metadata.templateId + req.metadata.fields (dataset) en vez de
  // req.prompt — mismo contrato ya anotado en la cabecera del fichero.
  // 1. Subir req.referenceImages[0] (la foto de OpenAI) vía asset-uploads
  // 2. autofill-design con brand_template_id + dataset (texto + asset id)
  // 3. Poll del job de autofill hasta 'success'
  // 4. export-design del resultado a PNG
  // 5. Descargar y guardar en req.metadata.outputDir, igual que hoy
}
```

### 3. Dónde se conecta en el pipeline (cambio mínimo, no arquitectura nueva)

`creative-lab/index.js#composeFinalLayout` es hoy el único punto que
llama a `layout-composer/service.js#composeLayout`. El día que se
active Canva, esa llamada se sustituye — o se selecciona por env var,
mismo patrón que `creativeProviderId = OPENAI_API_KEY ? 'openai-images' : 'simulated'`
en `marketing-engine-run-background.js` — por una llamada equivalente
al proveedor `canva`. `art-direction-engine` sigue decidiendo qué
familia oficial (y por tanto qué `brand_template_id`) usar; eso no
cambia.

### 4. Credenciales necesarias (mismo patrón que `OPENAI_API_KEY`)

Variables de entorno nuevas en Netlify, nunca en el repo:
- `CANVA_CLIENT_ID` / `CANVA_CLIENT_SECRET` — app registrada en Canva
  Developer Portal.
- `CANVA_REFRESH_TOKEN` (o el mecanismo de token de larga duración que
  ofrezca la app tipo "Server-to-Server" de Canva, si existe para el
  caso de uso — a confirmar en el momento de crear la app real; si no
  existe, hace falta un flujo de refresco de token con almacenamiento
  persistente, ver nota de riesgo abajo).
- IDs de las 4 plantillas de marca (`brand_template_id` por familia) —
  se obtienen tras crearlas y publicarlas en Canva.

### Riesgo real a vigilar cuando se implemente

Canva Connect usa OAuth con tokens de acceso de corta duración +
refresh token — a diferencia de `OPENAI_API_KEY` (una clave estática),
esto necesita lógica de refresco y un sitio donde guardar el token
vigente entre invocaciones de la función Netlify (candidato natural:
Netlify Blobs, ya en uso desde DT-17 para `marketing-engine-run-background.js`).
No es arquitectura nueva de verdad (reutiliza Blobs), pero sí es más
que "una env var" — se documenta aquí para no llevarse la sorpresa el
día de la implementación.

## Qué NO se ha hecho todavía (a propósito)

- Ninguna cuenta ni credencial de Canva Developer creada.
- Ninguna plantilla de marca diseñada/etiquetada en Canva todavía.
- `canva.provider.js` sigue siendo el stub `PROVIDER_NOT_IMPLEMENTED`,
  sin tocar.
- Ningún cambio en `creative-lab/index.js` ni en `layout-composer/`.

## Orden de trabajo acordado

1. **Ahora**: resolver DT-18 (texto fantasma de OpenAI dentro de la
   fotografía) — bloqueante absoluto, sin esto Canva heredaría el mismo
   problema con una foto sucia.
2. **Después**: el propietario confirma que tiene (o crea) cuenta de
   Canva Developer y decide si diseña las 4 plantillas de marca él
   mismo o pide ayuda para ello.
3. **Entonces**: implementación real de `canva.provider.js` siguiendo
   este documento.
