// Proveedor simulado — el único activo hoy. Sin red, sin credenciales,
// sin modelo: un placeholder SVG determinista (mismo hash → mismo
// archivo). No es "conectar un proveedor de IA" — es lo que permite que
// la demo de creative-engine escriba ficheros reales y ejercite de verdad
// creative-assets/store.js, exactamente el mismo criterio que
// marketing-engine/core/providers/providers/simulated.provider.js.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PROVIDER_META = {
  id: 'simulated',
  label: 'Simulado (placeholder determinista)',
  status: 'active',
  kind: 'image',
  capabilities: {
    contentClasses: ['photo', 'art'],
    // Acepta cualquier campo de la petición sin fallar — es un
    // placeholder permisivo, no interpreta semánticamente ni prompt ni
    // negativePrompt (ambos solo entran en el hash determinista del
    // nombre de fichero). Coherente con su propósito: dejar pasar
    // cualquier GenerationRequest válido para poder probar el resto del
    // sistema sin que las capacidades de un provider "de prueba" limiten
    // el flujo de verdad.
    supportsNegativePrompt: true,
    supportsReferenceImages: false,
    maxVariantsPerCall: 1,
    outputFormats: ['svg'],
  },
};

async function generate(req) {
  const outputDir = (req.metadata && req.metadata.outputDir) || process.cwd();
  fs.mkdirSync(outputDir, { recursive: true });

  const hash = crypto
    .createHash('sha256')
    .update(`${req.prompt}|${req.negativePrompt || ''}|${req.width}x${req.height}`)
    .digest('hex')
    .slice(0, 12);

  const assetPath = path.join(outputDir, `placeholder-${hash}.svg`);
  fs.writeFileSync(assetPath, buildPlaceholderSvg(req, hash), 'utf8');

  return {
    assetPath,
    providerId: PROVIDER_META.id,
    width: req.width,
    height: req.height,
    format: 'svg',
    rawResponse: {
      note: 'Placeholder SVG determinista — proveedor simulado, sin IA real ni llamada de red.',
      promptHash: hash,
    },
  };
}

function buildPlaceholderSvg(req, hash) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${req.width}" height="${req.height}" viewBox="0 0 ${req.width} ${req.height}">
  <rect width="100%" height="100%" fill="#1a1a3e"/>
  <rect x="4" y="4" width="${req.width - 8}" height="${req.height - 8}" fill="none" stroke="#00d9ff" stroke-width="4" stroke-dasharray="16 10"/>
  <text x="50%" y="46%" fill="#00d9ff" font-family="sans-serif" font-size="28" text-anchor="middle">CREATIVE ENGINE — SIMULADO</text>
  <text x="50%" y="53%" fill="#808099" font-family="monospace" font-size="14" text-anchor="middle">${hash}</text>
  <text x="50%" y="59%" fill="#808099" font-family="monospace" font-size="12" text-anchor="middle">${req.width}×${req.height} · ${req.contentClass}</text>
</svg>`;
}

module.exports = { PROVIDER_META, generate };
