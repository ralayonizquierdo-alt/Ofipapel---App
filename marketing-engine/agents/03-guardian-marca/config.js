// Parámetros de validación propios de este agente. IMPORTANTE: nunca
// colores/tipografías aquí — esos viven en UN solo sitio,
// design-studio/brand-kit.json, para no repetir el error documentado en
// .claude/rax/DECISIONES.md (2026-07-10: identidad visual duplicada y con
// datos incorrectos en un intento anterior de esta misma idea).

const path = require('node:path');

// Raíz del repo, calculada de forma relativa a este fichero para no
// depender de cwd — funciona igual invocado desde cualquier directorio.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const BRAND_KIT_PATH = path.join(REPO_ROOT, 'design-studio', 'brand-kit.json');

// Marcas que exigen eslogan obligatorio (ver design-studio/README.md,
// "Eslogan oficial (obligatorio)" — hoy solo Ofipapel lo tiene definido).
const REQUIRE_SLOGAN_FOR = ['ofipapel'];

module.exports = { REPO_ROOT, BRAND_KIT_PATH, REQUIRE_SLOGAN_FOR };
