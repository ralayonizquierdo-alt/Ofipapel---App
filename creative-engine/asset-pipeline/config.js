// Tablas de datos del Asset Pipeline — sin lógica, solo criterio tabulado.

const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BRAND_KIT_PATH = path.join(REPO_ROOT, 'design-studio', 'brand-kit.json');

// Dimensiones reales verificadas contra app.html (Calendario → const
// TAMANOS, líneas ~1938-1942), leídas el 2026-07-25. No son un módulo
// requerible (viven en un <script> inline de un HTML) — redeclaradas aquí
// a propósito, mismo criterio que el resto del proyecto para valores
// verificados en un sitio y necesarios en otro sin crear una dependencia.
//
// `story` es una adición propia de creative-engine SIN equivalente en
// app.html (que solo conoce foto|carrusel|reel) — justificada porque
// design-studio/templates/ ya tiene una plantilla de story
// (ofipapel-vuelta-al-cole-story.html). Documentado aquí para que quien
// lea esto no asuma que vino de la app.
const FORMAT_DIMENSIONS = {
  foto: {
    instagram: { width: 1080, height: 1350 },
    facebook: { width: 1200, height: 630 },
    ambas: { width: 1080, height: 1080 },
  },
  carrusel: {
    instagram: { width: 1080, height: 1350 },
    facebook: { width: 1080, height: 1080 },
    ambas: { width: 1080, height: 1080 },
  },
  reel: {
    instagram: { width: 1080, height: 1920 },
    facebook: { width: 1080, height: 1920 },
    ambas: { width: 1080, height: 1920 },
  },
  story: {
    instagram: { width: 1080, height: 1920 },
    facebook: { width: 1080, height: 1920 },
    ambas: { width: 1080, height: 1920 },
  },
};

const DEFAULT_PLATFORM = 'ambas';

// Resolutor POSICIONAL de paleta — no hay ninguna clave de color
// compartida entre las 3 marcas en brand-kit.json (verificado leyendo el
// fichero real el 2026-07-25: ofipapel usa verdeOscuro/verdeMedio/...,
// canarias-ink usa fondo/acentoPrimarioCian/..., falcontrol usa
// fondo/verdeEstado/...). Un resolutor "por nombre" no puede funcionar
// para las 3 a la vez. Esta tabla asigna manualmente qué clave real de
// cada marca cumple cada rol (primary/secondary/accent/background) —
// explícita e inspeccionable, igual que brand-kit.json en sí.
const PALETTE_KEY_ORDER = {
  ofipapel: { primary: 'verdeOscuro', secondary: 'verdeMedio', accent: 'acentoLima', background: 'fondoPalido' },
  'canarias-ink': { primary: 'acentoPrimarioCian', secondary: 'acentoPrimarioCianOscuro', accent: 'verde', background: 'fondo' },
  falcontrol: { primary: 'verdeEstado', secondary: 'rojoAlerta', accent: 'naranja', background: 'fondo' },
};

module.exports = { REPO_ROOT, BRAND_KIT_PATH, FORMAT_DIMENSIONS, DEFAULT_PLATFORM, PALETTE_KEY_ORDER };
