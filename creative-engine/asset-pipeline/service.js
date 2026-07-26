// Asset Pipeline — resuelve TODOS los recursos que necesita una
// generación creativa (foto de producto, logo, brand-kit, colores, copy,
// CTA, formato) en un único bundle normalizado, listo para
// prompt-composer/ y para el proveedor. Nunca genera ni reescribe texto —
// copy/CTA pasan tal cual desde el CreativeBrief.

const fs = require('node:fs');
const { BRAND_KIT_PATH, FORMAT_DIMENSIONS, DEFAULT_PLATFORM, PALETTE_KEY_ORDER } = require('./config.js');

/**
 * @param {object} brief - CreativeBrief (ver ../brief/contracts.js)
 * @param {object} [options]
 * @param {string} [options.productPhotoPath] - ruta o data-URL de una foto real del producto, si existe
 * @returns {object} PreparedAssets: { brand, product, copy, dimensions, warnings }
 */
function prepareAssets(brief, options = {}) {
  const warnings = [];
  const brandData = loadBrand(brief.brand.id, warnings);
  const dimensions = resolveDimensions(brief.format.postType, brief.format.platform, warnings);

  return {
    brand: {
      id: brief.brand.id,
      label: brandData.label,
      palette: resolvePalette(brief.brand.id, brandData, warnings),
      fonts: brandData.fonts || {},
      slogan: brandData.slogan || null,
      logoPath: resolveAssetPath(brandData, 'logoTransparent', brief.brand.id, warnings),
      backgroundImagePath: resolveAssetPath(brandData, 'backgroundImage', brief.brand.id, warnings),
      contact: brandData.contact || null,
    },
    product: {
      name: brief.product.name,
      description: brief.product.description,
      category: brief.product.category,
      photoPath: options.productPhotoPath || null,
    },
    copy: { ...brief.copy },
    dimensions,
    warnings,
  };
}

// Recarga en caliente — mismo patrón que
// marketing-engine/agents/03-guardian-marca/service.js, para que un
// cambio en brand-kit.json se recoja sin reiniciar el proceso.
function loadBrand(brandId, warnings) {
  let brandKit;
  try {
    delete require.cache[require.resolve(BRAND_KIT_PATH)];
    brandKit = require(BRAND_KIT_PATH);
  } catch (err) {
    warnings.push(`No se pudo leer brand-kit.json: ${err.message}`);
    return {};
  }

  const brand = brandKit[brandId];
  if (!brand) {
    warnings.push(`Marca "${brandId}" no existe en design-studio/brand-kit.json`);
    return {};
  }
  return brand;
}

function resolvePalette(brandId, brandData, warnings) {
  const order = PALETTE_KEY_ORDER[brandId];
  const colors = brandData.colors || {};

  if (!order) {
    warnings.push(`Sin orden de paleta declarado para "${brandId}" en asset-pipeline/config.js`);
    return { primary: null, secondary: null, accent: null, background: null, all: flattenAllColors(brandData) };
  }

  return {
    primary: colors[order.primary] || null,
    secondary: colors[order.secondary] || null,
    accent: colors[order.accent] || null,
    background: colors[order.background] || null,
    all: flattenAllColors(brandData),
  };
}

// `colors` son siempre strings hex; `backgroundPalette` (solo ofipapel)
// mezcla strings y arrays de gradiente — se aplana tomando el primer
// valor de cada array. Ignora cualquier clave "_comment".
function flattenAllColors(brandData) {
  const values = [];
  for (const block of [brandData.colors, brandData.backgroundPalette, brandData.categoryColors]) {
    if (!block) continue;
    for (const [key, value] of Object.entries(block)) {
      if (key === '_comment') continue;
      if (Array.isArray(value)) values.push(value[0]);
      else if (typeof value === 'string') values.push(value);
    }
  }
  return values;
}

function resolveAssetPath(brandData, assetKey, brandId, warnings) {
  const relativePath = brandData.assets && brandData.assets[assetKey];
  if (!relativePath) {
    // Normal hoy para canarias-ink y falcontrol — ninguna de las dos
    // marcas tiene bloque `assets` en brand-kit.json todavía. Aviso, no fallo.
    warnings.push(`Marca "${brandId}" no tiene "${assetKey}" declarado en brand-kit.json.`);
    return null;
  }
  const { REPO_ROOT } = require('./config.js');
  const path = require('node:path');
  const absolutePath = path.join(REPO_ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    warnings.push(`"${assetKey}" de "${brandId}" declarado pero no encontrado en disco: ${relativePath}`);
    return null;
  }
  return absolutePath;
}

function resolveDimensions(postType, platform, warnings) {
  const byFormat = FORMAT_DIMENSIONS[postType];
  if (!byFormat) {
    warnings.push(`Formato "${postType}" sin dimensiones declaradas — usando "foto"/${DEFAULT_PLATFORM}.`);
    return { ...FORMAT_DIMENSIONS.foto[DEFAULT_PLATFORM], format: 'foto', platform: DEFAULT_PLATFORM };
  }
  const dims = byFormat[platform] || byFormat[DEFAULT_PLATFORM];
  if (!byFormat[platform]) {
    warnings.push(`Plataforma "${platform}" sin dimensión propia para "${postType}" — usando ${DEFAULT_PLATFORM}.`);
  }
  return { ...dims, format: postType, platform };
}

module.exports = { prepareAssets };
