// Plantilla inteligente "layout-diagonal" — para graphicFamily
// 'oferta-destacada' (layoutId: 'layout-diagonal' en
// 02-director-arte/config.js). Composición genuinamente distinta de
// pieza-generica.js (layout-centrado): franja diagonal de acento,
// producto desplazado a un lado, CTA visible como botón — no una
// variación cosmética, una jerarquía visual distinta (ver hierarchy en
// 02-director-arte/config.js: logo, oferta, producto, titular, cta).
//
// Misma firma que pieza-generica.js: buildHtml(data) → string. Añadida
// siguiendo la extensión ya documentada en pieza-generica.js — un
// fichero nuevo aquí, una entrada en 07-maquetador/config.js#TEMPLATES_BY_LAYOUT_ID,
// cero cambios en service.js más allá de la selección.

function buildHtml(data) {
  const { brand, productName, title, cta, assetPath, width, height } = data;
  const colors = brand.colors || {};
  const primary = colors.verdeOscuro || colors.fondo || '#1A5C1A';
  const accent = colors.acentoLima || colors.acentoPrimarioCian || colors.verdeEstado || '#8DC41E';
  const bodyFont = (brand.fonts && brand.fonts.body) || 'Inter';
  const logoAsset = brand.assets && brand.assets.logoTransparent;

  const logoLayer = logoAsset
    ? `<div class="top"><div class="logo-chip"><img src="file://${require('node:path').resolve(brand.__repoRoot, logoAsset)}"></div></div>`
    : '';
  const ctaLayer = cta
    ? `<div class="cta-btn">${escapeHtml(cta)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="hz:canvas-width" content="${width}">
<meta name="hz:canvas-height" content="${height}">
<title>marketing-engine — pieza generada (oferta)</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(bodyFont)}:wght@600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; font-family: '${bodyFont}', sans-serif; }
  .frame { position: relative; width: ${width}px; height: ${height}px; background: #ffffff; overflow: hidden; }
  .diagonal-stripe {
    position: absolute; z-index: 1; top: -10%; left: -20%; width: 140%; height: 55%;
    background: linear-gradient(115deg, ${primary} 55%, ${accent} 100%);
    transform: rotate(-8deg); box-shadow: 0 30px 60px rgba(0,0,0,0.2);
  }
  .top { position: relative; z-index: 3; padding: ${Math.round(height * 0.04)}px 0 0; display: flex; justify-content: center; }
  .logo-chip { background: #fff; border-radius: 18px; padding: 12px 22px; box-shadow: 0 12px 30px rgba(0,0,0,0.25); }
  .logo-chip img { height: ${Math.round(height * 0.03)}px; display: block; }
  .oferta-badge {
    position: absolute; z-index: 3; top: ${Math.round(height * 0.1)}px; left: 8%;
    background: #fff; color: ${primary}; font-weight: 800; font-size: ${Math.round(width * 0.045)}px;
    padding: 10px 24px; border-radius: 40px; box-shadow: 0 12px 24px rgba(0,0,0,0.2);
  }
  .product-plate {
    position: absolute; z-index: 2; top: 38%; right: 6%; width: 72%; height: 38%;
    background: radial-gradient(circle at 50% 42%, #ffffff 0%, #f2f8f2 70%);
    border-radius: 40px; box-shadow: 0 30px 70px rgba(0,0,0,0.3);
  }
  .product-img { position: absolute; z-index: 3; top: 40%; right: 6%; width: 72%; height: 34%; object-fit: contain; }
  .title-wrap { position: absolute; z-index: 3; bottom: 16%; left: 6%; width: 88%; }
  .title { font-size: ${Math.round(width * 0.075)}px; font-weight: 800; color: ${primary}; line-height: 1.1; }
  .cta-btn {
    display: inline-block; margin-top: 20px; background: ${accent}; color: #1a1a1a; font-weight: 800;
    font-size: ${Math.round(width * 0.032)}px; padding: 14px 34px; border-radius: 50px;
  }
</style>
</head>
<body>
  <div class="frame">
    <div class="diagonal-stripe"></div>
    ${logoLayer}
    <div class="oferta-badge">OFERTA</div>
    <div class="product-plate"></div>
    <img class="product-img" src="file://${assetPath}">
    <div class="title-wrap">
      <div class="title">${escapeHtml(title || productName)}</div>
      ${ctaLayer}
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
