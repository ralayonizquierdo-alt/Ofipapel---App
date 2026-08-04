// Plantilla inteligente por defecto del Maquetador: construye el HTML de
// una pieza a partir de los datos acumulados en el Job (marca, layout,
// copy, asset generado) y el brand-kit real de la marca. NO es una
// plantilla estática de design-studio/templates/ — se genera en memoria
// para poder insertar los datos concretos de cada job — pero SÍ reutiliza
// el mismo lenguaje visual y el mismo motor de render
// (design-studio/scripts/render-html.js) que esas plantillas.
//
// "Plantillas inteligentes" (plural) es el concepto correcto aquí: si en
// el futuro hace falta un layout visualmente distinto por marca/tipo de
// post, se añade OTRO fichero en este mismo directorio con la misma firma
// buildHtml(data) → string, y 07-maquetador/config.js decide cuál usar
// según job.state['director-arte'].layoutId — sin tocar service.js.

/**
 * @param {object} data
 * @param {object} data.brand - entrada de design-studio/brand-kit.json para la marca del job
 * @param {string} data.productName
 * @param {string} data.title
 * @param {string} data.assetPath - ruta absoluta a la imagen/SVG generado por el proveedor de IA
 * @param {number} data.width
 * @param {number} data.height
 * @returns {string} HTML autocontenido, listo para design-studio/scripts/render-html.js
 */
function buildHtml(data) {
  const { brand, productName, title, assetPath, width, height } = data;
  const colors = brand.colors || {};
  const primary = colors.verdeOscuro || colors.fondo || '#1A5C1A';
  const accent = colors.acentoLima || colors.acentoPrimarioCian || colors.verdeEstado || '#8DC41E';
  const bodyFont = (brand.fonts && brand.fonts.body) || 'Inter';
  const backgroundAsset = brand.assets && brand.assets.backgroundImage;
  const logoAsset = brand.assets && brand.assets.logoTransparent;

  const backgroundLayer = backgroundAsset
    ? `<img class="bgphoto" src="file://${require('node:path').resolve(brand.__repoRoot, backgroundAsset)}">`
    : '';
  const logoLayer = logoAsset
    ? `<div class="top"><div class="logo-chip"><img src="file://${require('node:path').resolve(brand.__repoRoot, logoAsset)}"></div></div>`
    : '';
  const sloganLayer = brand.slogan
    ? `<div class="slogan">${escapeHtml(brand.slogan)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="hz:canvas-width" content="${width}">
<meta name="hz:canvas-height" content="${height}">
<title>marketing-engine — pieza generada</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(bodyFont)}:wght@600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; font-family: '${bodyFont}', sans-serif; }
  .frame { position: relative; width: ${width}px; height: ${height}px; background: ${primary}; overflow: hidden; }
  .bgphoto { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.55; }
  .bgtint { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0.65) 100%); }
  .top { position: relative; z-index: 3; padding: ${Math.round(height * 0.04)}px 0 0; display: flex; justify-content: center; }
  .logo-chip { background: #fff; border-radius: 18px; padding: 12px 22px; box-shadow: 0 12px 30px rgba(0,0,0,0.3); }
  .logo-chip img { height: ${Math.round(height * 0.03)}px; display: block; }
  .product-plate {
    position: absolute; z-index: 2; top: 22%; left: 8%; width: 84%; height: 45%;
    background: radial-gradient(circle at 50% 42%, #ffffff 0%, #f2f8f2 70%);
    border-radius: 40px; box-shadow: 0 30px 70px rgba(0,0,0,0.35);
  }
  .product-img { position: absolute; z-index: 3; top: 24%; left: 0; width: 100%; height: 40%; object-fit: contain; }
  .title-wrap {
    position: absolute; z-index: 3; bottom: 12%; left: 6%; width: 88%; text-align: center;
  }
  .title { font-size: ${Math.round(width * 0.07)}px; font-weight: 800; color: #fff; line-height: 1.1; text-shadow: 0 4px 18px rgba(0,0,0,0.5); }
  .slogan { margin-top: 14px; font-size: ${Math.round(width * 0.025)}px; font-weight: 700; font-style: italic; color: ${accent}; }
</style>
</head>
<body>
  <div class="frame">
    ${backgroundLayer}
    <div class="bgtint"></div>
    ${logoLayer}
    <div class="product-plate"></div>
    <img class="product-img" src="file://${assetPath}">
    <div class="title-wrap">
      <div class="title">${escapeHtml(title || productName)}</div>
      ${sloganLayer}
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = { buildHtml };
