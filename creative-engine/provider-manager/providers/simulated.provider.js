// Proveedor simulado — el único siempre disponible. Sin red, sin
// credenciales, sin modelo:
//
// 1. Si la petición trae una foto real del producto
//    (`req.referenceImages[0]`, un data URL `data:image/...;base64,...`),
//    la usa directamente como asset — sigue sin ser "generación por IA"
//    (no hay ningún modelo de por medio), pero permite que
//    layout-composer/ (creative-lab) componga una pieza real en vez de
//    un placeholder abstracto. Mismo criterio ya usado en
//    marketing-engine/core/providers/providers/simulated.provider.js —
//    aquí no existía todavía porque nadie lo necesitaba hasta que
//    layout-composer/ empezó a consumir el asset generado de verdad.
// 2. Si no hay foto real, genera un placeholder SVG determinista (mismo
//    prompt+dimensiones → mismo fichero) — igual que siempre.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PROVIDER_META = {
  id: 'simulated',
  label: 'Simulado (placeholder determinista / foto real si existe)',
  status: 'active',
  kind: 'image',
  capabilities: {
    contentClasses: ['photo', 'art'],
    // Acepta cualquier campo de la petición sin fallar — es un
    // placeholder permisivo, no interpreta semánticamente prompt ni
    // negativePrompt (solo entran en el hash determinista del nombre de
    // fichero cuando no hay foto real). Coherente con su propósito:
    // dejar pasar cualquier GenerationRequest válido para poder probar
    // el resto del sistema sin que las capacidades de un provider "de
    // prueba" limiten el flujo de verdad.
    supportsNegativePrompt: true,
    supportsReferenceImages: true,
    maxVariantsPerCall: 1,
    outputFormats: ['svg', 'png', 'jpg'],
  },
};

const DATA_URL_RE = /^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/s;

async function generate(req) {
  const outputDir = (req.metadata && req.metadata.outputDir) || process.cwd();
  fs.mkdirSync(outputDir, { recursive: true });

  const sourceImage = req.referenceImages && req.referenceImages[0];
  const match = typeof sourceImage === 'string' ? sourceImage.match(DATA_URL_RE) : null;

  if (match) return useRealPhoto(match, outputDir, req);
  return generatePlaceholder(outputDir, req);
}

function useRealPhoto(match, outputDir, req) {
  const [, subtype, base64Data] = match;
  const ext = subtype.split('+')[0].toLowerCase(); // 'svg+xml' -> 'svg'
  const buffer = Buffer.from(base64Data, 'base64');
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 10);
  const assetPath = path.join(outputDir, `foto-producto-${hash}.${ext}`);
  fs.writeFileSync(assetPath, buffer);

  return {
    assetPath,
    providerId: PROVIDER_META.id,
    width: req.width,
    height: req.height,
    format: ext === 'svg' ? 'svg' : ext === 'png' ? 'png' : 'jpg',
    rawResponse: { note: 'Foto real del producto usada tal cual — sin IA real ni llamada de red.' },
  };
}

function generatePlaceholder(outputDir, req) {
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
