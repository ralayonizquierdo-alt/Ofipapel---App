// Proveedor "simulated" — el ÚNICO con status:"active" hoy. No llama a
// ninguna IA real. Tiene dos comportamientos:
//
// 1. Si la petición trae una foto real del producto
//    (`req.metadata.sourceImage`, un data URL `data:image/...;base64,...`
//    subido por el usuario en la app), la usa directamente como asset —
//    sigue sin ser "generación por IA" (no hay ningún modelo de por
//    medio), pero permite verificar el flujo completo con una imagen real
//    en vez de un placeholder abstracto.
// 2. Si no hay foto real, genera un placeholder SVG determinista (mismo
//    prompt + dimensiones → mismo fichero).
//
// Cuando se conecte un proveedor real (ver los demás ficheros de este
// directorio), marketing-engine/agents/05-especialista-prompts/config.js
// es lo único que hay que cambiar para dejar de usar este por defecto.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { jobDir } = require('../../job-store.js');

const PROVIDER_META = { id: 'simulated', status: 'active', kind: 'image' };

const DATA_URL_RE = /^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/s;

/**
 * @param {import('../provider.interface.js').GenerationRequest} req
 * @returns {Promise<import('../provider.interface.js').GenerationResult>}
 */
async function generate(req) {
  const jobId = (req.metadata && req.metadata.jobId) || '_sin-job';
  const outDir = path.join(jobDir(jobId), 'assets');
  fs.mkdirSync(outDir, { recursive: true });

  const sourceImage = req.metadata && req.metadata.sourceImage;
  const match = typeof sourceImage === 'string' ? sourceImage.match(DATA_URL_RE) : null;

  if (match) {
    return useRealPhoto(match, outDir, req);
  }

  return generatePlaceholder(outDir, req);
}

function useRealPhoto(match, outDir, req) {
  const [, subtype, base64Data] = match;
  const ext = subtype.split('+')[0].toLowerCase(); // 'svg+xml' -> 'svg'
  const buffer = Buffer.from(base64Data, 'base64');
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 10);
  const assetPath = path.join(outDir, `foto-producto-${hash}.${ext}`);

  fs.writeFileSync(assetPath, buffer);

  return {
    assetPath,
    providerId: PROVIDER_META.id,
    width: req.width,
    height: req.height,
    rawResponse: { note: 'Foto real del producto usada tal cual — sin generación por IA, proveedor simulado.' },
  };
}

function generatePlaceholder(outDir, req) {
  const seed = crypto
    .createHash('sha256')
    .update(`${req.prompt}|${req.width}x${req.height}|${req.contentClass}`)
    .digest('hex')
    .slice(0, 10);

  const assetPath = path.join(outDir, `simulado-${seed}.svg`);

  const escapedPrompt = String(req.prompt)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .slice(0, 200);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${req.width}" height="${req.height}" viewBox="0 0 ${req.width} ${req.height}">
  <rect width="100%" height="100%" fill="#1A5C1A"/>
  <rect x="20" y="20" width="${req.width - 40}" height="${req.height - 40}" fill="none" stroke="#8DC41E" stroke-width="4" stroke-dasharray="12,10"/>
  <text x="50%" y="46%" text-anchor="middle" font-family="sans-serif" font-size="${Math.max(18, Math.round(req.width / 22))}" fill="#ffffff">IMAGEN SIMULADA</text>
  <text x="50%" y="54%" text-anchor="middle" font-family="sans-serif" font-size="${Math.max(12, Math.round(req.width / 40))}" fill="#C0E4C3">${escapedPrompt}</text>
</svg>`;

  fs.writeFileSync(assetPath, svg, 'utf8');

  return {
    assetPath,
    providerId: PROVIDER_META.id,
    width: req.width,
    height: req.height,
    rawResponse: { seed, note: 'Placeholder determinista — sin proveedor de IA real conectado.' },
  };
}

module.exports = { PROVIDER_META, generate };
