#!/bin/bash
set -e

# Netlify preserva /opt/build/cache entre builds del mismo sitio (salvo
# "Clear cache and deploy"). Lo usamos para no reconstruir alquileres/ o
# joe-app/ cuando nada ha cambiado en su carpeta desde el último despliegue,
# ahorrando el npm ci + build de la app que no cambió.
CACHE_DIR="/opt/build/cache"

# netlify/functions/ es el único sitio del repo con dependencias npm reales
# (@sparticuz/chromium + playwright-core, DT-16 — `.claude/rax/DEUDA_TECNICA.md`
# — Chromium compatible con Lambda para marketing-engine-run.js). Netlify
# empaqueta las funciones a partir del checkout que deja build.sh, así que
# node_modules tiene que existir ANTES de que termine este script — Netlify
# no instala por su cuenta un package.json que no esté en la raíz del sitio.
#
# Ese npm ci es además el paso más caro de todo el build:
# @sparticuz/chromium son ~50 MB comprimidos que se descargan y descomprimen
# enteros cada vez, en los tres sitios, en cada push. Sus dependencias solo
# cambian cuando cambia el lockfile, así que se cachea el árbol resuelto y se
# reinstala únicamente cuando ese lockfile cambia. La huella es el hash del
# propio package-lock.json: si no coincide con la cacheada, se reinstala.
FN_CACHE="$CACHE_DIR/netlify-functions-node_modules"
FN_LOCK_HASH=$(sha256sum netlify/functions/package-lock.json | cut -d' ' -f1)
if [ -d "$FN_CACHE/node_modules" ] && [ "$(cat "$FN_CACHE/lock.sha256" 2>/dev/null)" = "$FN_LOCK_HASH" ]; then
  echo "== netlify/functions: dependencias sin cambios, reutilizando caché =="
  mkdir -p netlify/functions/node_modules
  cp -a "$FN_CACHE/node_modules/." netlify/functions/node_modules/
else
  echo "== netlify/functions: instalando dependencias (Chromium para Lambda) =="
  (cd netlify/functions && npm ci)
  rm -rf "$FN_CACHE"
  mkdir -p "$FN_CACHE/node_modules"
  cp -a netlify/functions/node_modules/. "$FN_CACHE/node_modules/"
  echo "$FN_LOCK_HASH" > "$FN_CACHE/lock.sha256"
fi

# Devuelve 0 (skip) solo si hay build anterior en caché Y no hay diferencias
# reales en esa carpeta desde el último commit desplegado. Cualquier duda
# (primera build, caché limpiada, fallo del diff) hace que se reconstruya.
should_skip_build() {
  local watch_dir="$1"
  local cache_marker="$2"

  if [ -z "$CACHED_COMMIT_REF" ] || [ ! -d "$cache_marker" ]; then
    return 1
  fi
  git diff --quiet "$CACHED_COMMIT_REF" "$COMMIT_REF" -- "$watch_dir" 2>/dev/null
}

build_alquileres() {
  echo "== alquileres: reconstruyendo (cambios detectados o sin caché previa) =="
  cd alquileres
  npm ci
  npm run build
  cd ..
  rm -rf "$CACHE_DIR/alquileres-dist"
  mkdir -p "$CACHE_DIR/alquileres-dist"
  cp -r alquileres/dist/. "$CACHE_DIR/alquileres-dist/"
}

build_joe_app() {
  echo "== joe-app: reconstruyendo (cambios detectados o sin caché previa) =="
  cd joe-app
  npm ci
  npm run build
  cd ..
  rm -rf "$CACHE_DIR/joe-dist"
  mkdir -p "$CACHE_DIR/joe-dist"
  cp -r joe-app/dist/. "$CACHE_DIR/joe-dist/"
}

if should_skip_build "alquileres/" "$CACHE_DIR/alquileres-dist"; then
  echo "== alquileres: sin cambios desde el último deploy, reutilizando build anterior =="
  mkdir -p alquileres/dist
  cp -r "$CACHE_DIR/alquileres-dist/." alquileres/dist/
else
  build_alquileres
fi

# ── Joe's App solo se publica donde puede funcionar ────────────────────────
# Vite mete VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY DENTRO del bundle en
# tiempo de build. Si no están en el entorno no falla nada: compila igual y
# deja `createClient(void 0, void 0)`, o sea una app que se abre y no conecta
# con nada.
#
# Esas variables solo están puestas en el sitio `joesworld` de Netlify. Los
# otros dos sitios y GitHub Pages llevaban meses publicando ese bundle vacío
# en /joe/ — comprobado el 2026-09-08 descargando los cuatro y mirando dentro:
# tres de las cuatro copias estaban rotas y las cuatro devolvían 200, así que
# por fuera no se distinguían.
#
# Publicar algo roto es peor que no publicarlo: quien abra una de esas URL ve
# la app, mete su PIN y no entiende por qué no hay datos. Así que si faltan
# las credenciales, /joe/ simplemente no se publica ahí — y de paso se ahorra
# el `npm ci` + build de una app que no iba a servir para nada.
if [ -n "${VITE_SUPABASE_URL:-}" ] && [ -n "${VITE_SUPABASE_ANON_KEY:-}" ]; then
  PUBLICAR_JOE=1
else
  PUBLICAR_JOE=0
  echo "== joe-app: NO se publica aquí — faltan VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY =="
  echo "   (es lo correcto en todo sitio que no sea 'joesworld'; sin ellas el"
  echo "    bundle se compila sin backend y la app no conecta con nada)"
fi

if [ "$PUBLICAR_JOE" = "1" ]; then
  if should_skip_build "joe-app/" "$CACHE_DIR/joe-dist"; then
    echo "== joe-app: sin cambios desde el último deploy, reutilizando build anterior =="
    mkdir -p joe-app/dist
    cp -r "$CACHE_DIR/joe-dist/." joe-app/dist/
  else
    build_joe_app
  fi
fi

# Assemble _site: static root files + built apps
mkdir -p _site/alquileres
if [ "$PUBLICAR_JOE" = "1" ]; then mkdir -p _site/joe; fi

# Copy root static files
cp inicio.html _site/
# GitHub Pages no soporta netlify.toml/_redirects (eso solo lo lee Netlify),
# así que su "/" busca "index.html" literal y con inicio.html no existe eso
# devuelve 404 real (confirmado en producción) — cualquier enlace del hub
# parece "roto" porque nunca se llega a una página con enlaces sanos. Copia
# aparte, no symlink: Netlify sigue resolviendo "/" por su propia regla
# force=true en netlify.toml, esto solo cubre el hueco de GitHub Pages.
cp inicio.html _site/index.html
# Index.html → finanzas.html para evitar colisión case-insensitive con index.html en Netlify
cp Index.html _site/finanzas.html 2>/dev/null || true
cp canarias-ink.html _site/ 2>/dev/null || true
cp falcontrol.html _site/ 2>/dev/null || true
cp app.html _site/ 2>/dev/null || true
cp vacaciones.html _site/ 2>/dev/null || true
cp fichaje.html _site/ 2>/dev/null || true
cp favicon-fichaje.svg _site/ 2>/dev/null || true
cp importacion-pedidos-proveedores.html _site/ 2>/dev/null || true
cp sw.js _site/ 2>/dev/null || true
cp sw-ink.js _site/ 2>/dev/null || true
cp hero-productos.jpg _site/ 2>/dev/null || true
cp logo-canarias-ink.png _site/ 2>/dev/null || true
cp logo-ofipapel.png _site/ 2>/dev/null || true
cp logo-ofipapel-transparente.png _site/ 2>/dev/null || true
cp fondo-ofipapel.jpg _site/ 2>/dev/null || true
cp fondo-conversaciones.jpg _site/ 2>/dev/null || true
cp fondo-importacion-pedidos.jpg _site/ 2>/dev/null || true
cp bg-trebol.png _site/ 2>/dev/null || true
cp hub-coin-*.webp _site/ 2>/dev/null || true
cp hub-center.webp _site/ 2>/dev/null || true
cp sound-connect.mp3 _site/ 2>/dev/null || true
cp sound-click.mp3 _site/ 2>/dev/null || true
cp manifest-inicio.json _site/ 2>/dev/null || true
# Manifest e iconos del panel del bot. El panel es una FUNCIÓN de Netlify
# (/.netlify/functions/conversations), así que no puede servir sus propios
# ficheros estáticos: los pide por ruta absoluta y tienen que estar aquí, en la
# raíz del sitio. Sin ellos el manifest da 404 y el icono del móvil vuelve a
# comportarse como un acceso directo (abre pestaña nueva en cada toque).
cp manifest-bot.json _site/ 2>/dev/null || true
cp icon-bot-192.png _site/ 2>/dev/null || true
cp icon-bot-512.png _site/ 2>/dev/null || true
cp icon-bot-maskable-192.png _site/ 2>/dev/null || true
cp icon-bot-maskable-512.png _site/ 2>/dev/null || true
cp icon-ofipapel-192.png _site/ 2>/dev/null || true
cp icon-ofipapel-512.png _site/ 2>/dev/null || true
cp icon-ofipapel-192-maskable.png _site/ 2>/dev/null || true
cp icon-ofipapel-512-maskable.png _site/ 2>/dev/null || true
cp privacidad.html _site/ 2>/dev/null || true
cp 404.html _site/ 2>/dev/null || true

# Copy the built apps
cp -r alquileres/dist/. _site/alquileres/
if [ "$PUBLICAR_JOE" = "1" ]; then cp -r joe-app/dist/. _site/joe/; fi

# SPA routing (+ fuerza "/" al hub exacto, ver comentario en netlify.toml).
# El "!" tras el 200 es la sintaxis de _redirects para force=true: sin él,
# Netlify no aplica la regla porque "/" resuelve a Index.html como fichero
# "existente" (case-insensitive) antes de mirar los redirects.
{
  echo "/               /inicio.html              200!"
  echo "/Index.html     /finanzas.html            200!"
  echo "/alquileres/*  /alquileres/index.html  200"
  # Sin la regla, /joe/ da 404 en vez de servir una app sin backend. Es lo que
  # se quiere: un 404 se ve, una app que no conecta parece que funciona.
  if [ "$PUBLICAR_JOE" = "1" ]; then
    echo "/joe/*         /joe/index.html          200"
  fi
} > _site/_redirects
