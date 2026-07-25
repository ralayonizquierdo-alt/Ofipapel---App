// Generador de ids para creatividades — determinista donde se puede,
// legible para quien navegue creative-assets/assets/ a mano.

const crypto = require('node:crypto');

function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'sin-nombre';
}

/**
 * @param {object} brief - CreativeBrief (o al menos { brand, product: { name } })
 * @returns {string} id seguro para filesystem, único por invocación
 */
function newCreativeId(brief) {
  const brand = slugify(brief && brief.brand && brief.brand.id);
  const product = slugify(brief && brief.product && brief.product.name);
  const hash = crypto.randomBytes(4).toString('hex');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${brand}_${product}_${timestamp}_${hash}`;
}

module.exports = { newCreativeId, slugify };
