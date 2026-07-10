# Identidad visual — Ofipapel y Canarias INK

Tokens extraídos directamente del código ya publicado en este repo
(`Index.html`, `canarias-ink.html`). Son la fuente de verdad: cualquier
pieza nueva debe partir de aquí, no de colores inventados sobre la marcha.

## Canarias INK (tienda online de consumibles de impresión)

Fuente: `canarias-ink.html`.

- **Logo**: `logo-canarias-ink.png` (raíz del repo).
- **Color primario**: `#00BFA5` (verde-azulado/teal — el color de marca
  dominante, usado en CTAs y acentos).
- **Color primario oscuro** (hover/contraste): `#00897B`.
- **Secundarios / acentos usados en categorías y estados**:
  - Azul información: `#2196F3`, `#1565C0`, `#003087`
  - Cian de apoyo: `#00B4D8`
  - Naranja oferta/urgencia: `#FF9800`, `#F39C12`
  - Rojo alerta/descuento: `#E63946`
  - Púrpura: `#9C27B0`
  - Índigo: `#635BFF`, `#5C6BC0`
  - Texto oscuro / fondo oscuro: `#1A1D2E`
- **Base neutra**: blanco `#fff`, gris texto `#555`.
- **Tipografía**:
  - Texto general: **Inter** (pesos 300–800), vía Google Fonts.
  - Datos técnicos / precios / referencias: **IBM Plex Mono** (400–500).
- **Tono de voz**: directo y técnico-comercial (nombres de producto,
  compatibilidades por marca de impresora), con llamadas a la acción claras
  ("Envío gratuito a toda Canarias en pedidos superiores a 50€"). Evita el
  lenguaje florido; el comprador busca la referencia exacta rápido.
- **Estructura ya existente que hay que reutilizar, no duplicar**: la propia
  `canarias-ink.html` ya tiene secciones de catálogo (`#catalog-grid`,
  `#featured-products`), filtros por marca/tipo (`#brand-filters`,
  `#cat-chips`), ofertas y blog. Las piezas de marketing deben enlazar o
  alimentar estas secciones, no crear un catálogo paralelo.

## Ofipapel (papelería física, Los Cristianos — Tenerife)

Fuente: `Index.html` (nota: es la app interna de "Control Financiero", no
una web pública de marca — es la única referencia visual disponible hoy en
el repo para Ofipapel).

- **Logo**: pendiente. No existe todavía un archivo de logo de Ofipapel en
  el repo. Hasta que se aporte uno, usar solo texto con la tipografía y
  color de marca de abajo; marcar cualquier pieza generada como "pendiente
  de logo" si el hueco es visible.
- **Color primario**: `#1A5C1A` (verde oscuro), variante `#0d3d0d`.
- **Secundarios**: rojo `#E74C3C` / `#E31837` (alertas, descuentos), verde
  claro `#8DC41E` / `#27AE60` (positivo/confirmación), ámbar `#F0A500` /
  `#F5A623` (aviso), azul `#1a3c8f` / `#004B91` (información).
- **Tipografía**: Arial/sans-serif genérica en la app interna — **no** se
  considera tipografía de marca definitiva. Recomendación: adoptar la misma
  familia que Canarias INK (**Inter** + **IBM Plex Mono**) para las piezas
  de marketing de Ofipapel, salvo que el negocio defina lo contrario, de
  forma que ambas marcas del grupo compartan una base tipográfica coherente.
- **Datos reales de tienda** (para pie de banners, landing, WhatsApp, etc.):
  ver `netlify/functions/whatsapp-agent-config.js` — no los copies aquí,
  léelos de esa fuente para que un cambio de horario no quede desincronizado
  en dos sitios.

## Pendiente de confirmación con el negocio

- Logo oficial de Ofipapel.
- Si el verde `#1A5C1A` de la app de Control Financiero es realmente el
  verde de marca de la tienda física, o solo un color de UI interno.

`sales-marketing` debe señalar estas piezas como "provisional — validar con
el negocio" mientras sigan sin confirmar, en vez de darlas por definitivas.
