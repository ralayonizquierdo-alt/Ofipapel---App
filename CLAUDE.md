# Ofipapel App — Guía para Claude Code

## Estructura del repo

```
/
├── Index.html          ← PWA principal de gestión financiera (SPA vanilla JS/HTML/CSS)
├── sw.js               ← Service Worker (bumpar versión en cada deploy)
├── canarias-ink.html   ← App Canarias Ink (SPA vanilla, independiente)
├── falcontrol.html     ← Control de faltas (estático)
├── alquileres/         ← App React de gestión de alquileres
├── joe-app/            ← App React Joe
├── docs/               ← Documentación y recursos (calendarios fiscales, etc.)
├── netlify.toml        ← Config Netlify (staging/preview)
├── build.sh            ← Build script: compila React apps + ensambla _site/
└── .github/workflows/  ← CI/CD GitHub Pages (main → deploy automático)
```

## Deploy

| Entorno | Trigger | Destino |
|---------|---------|---------|
| GitHub Pages (producción) | Push a `main` | `ralayonizquierdo-alt.github.io/Ofipapel---App` |
| Netlify (staging) | Push a cualquier rama | Preview URL por rama |

## Workflow Git

```
main ← merge PR ← feature/xxx ← desarrollo
```

- **Nunca** commitear directamente a `main`
- Crear rama `feature/descripcion` o usar `claude/app-code-request-XXXXX` para sesiones Claude Code
- PR obligatoria; revisar checklist antes de mergear
- Tras merge a `main` el deploy a GitHub Pages es automático (~1 min)

## ⚠️ Service Worker — obligatorio en cada PR

`sw.js` usa un cache versionado. Si modificas `Index.html` (o cualquier asset estático), **debes** bumpar el número de versión:

```js
// sw.js línea 1
const CACHE = 'ofipapel-vXX';  // incrementar XX
```

Sin esto, los usuarios verán la versión cacheada antigua aunque el servidor sirva la nueva.

## Seguridad — reglas absolutas

- ❌ **NUNCA** commitear claves API ni secrets
- ❌ `ANTHROPIC_API_KEY` jamás en código cliente — solo en variables de entorno de Netlify
- ✅ La API key de Claude la introduce el usuario y se guarda en `localStorage` (`op_claude_key`)
- ✅ La `supabase_anon_key` hardcodeada en `Index.html` es intencional (app frontend pública, protegida por RLS)

## Mapa de claves localStorage (Index.html)

| Clave localStorage | Contenido |
|--------------------|-----------|
| `op_registros` | Array de registros financieros diarios (dashboard principal) |
| `op_cajaefectivo` | Resúmenes de caja por fecha {fecha, ofipapel, aliz1, aliz2} |
| `op_cajadetalles` | Detalles por terminal por fecha {fecha, terminales[]} |
| `op_cajacierres` | Ejercicios de caja para conciliación bancaria |
| `op_cajabancorecibos` | Resguardos bancarios ingresados |
| `op_claude_key` | API key de Claude (el usuario la pega, nunca viene del servidor) |
| `op_cajacierres_seed_v1` | Guard que evita re-ejecutar el seed de datos iniciales |

## Parser Excel Géminis POS (XLSX.js)

La hoja `TOTAL CAJAS` tiene **dos formatos** según el terminal:

| Terminal | Fondo al Cierre | Columna | Índice |
|----------|----------------|---------|--------|
| OFIPAPEL / ALIZ-2 | Fila `Crédito..:` | Q | 16 |
| ALIZ-1 | Fila `Fondo al Cierre:` | B | 1 |

- Valores enteros en Excel = céntimos → dividir entre 100
- Valores float = ya son euros

Grupos de terminales:
- **OFIPAPEL**: {43, 44, 45, 46, 48}
- **ALIZ1**: {A2, A3}
- **ALIZ2**: {AA}
- Terminal **47**: excluido siempre

## Comandos útiles

```bash
# Dev local de apps React
cd alquileres && npm run dev
cd joe-app && npm run dev

# Build completo (igual que Netlify)
bash build.sh

# Ver log de commits
git log --oneline -10
```

## Archivos que NO deben tocarse sin motivo

- `.github/workflows/pages.yml` — pipeline de producción
- `netlify.toml` — routing de Netlify
- `.nojekyll` — necesario para GitHub Pages
- `index.html` (minúscula) — redirige al Index.html principal; no confundir con `Index.html`
