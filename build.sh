#!/bin/bash
set -e

# netlify/functions/ es el único sitio del repo con dependencias npm reales
# (@sparticuz/chromium + playwright-core, DT-16 — `.claude/rax/DEUDA_TECNICA.md`
# — Chromium compatible con Lambda para marketing-engine-run.js). Netlify
# empaqueta las funciones a partir del checkout que deja build.sh, así que
# node_modules tiene que existir ANTES de que termine este script — Netlify
# no instala por su cuenta un package.json que no esté en la raíz del sitio.
echo "== netlify/functions: instalando dependencias (Chromium para Lambda) =="
(cd netlify/functions && npm ci)

# Netlify preserva /opt/build/cache entre builds del mismo sitio (salvo
# "Clear cache and deploy"). Lo usamos para no reconstruir alquileres/ o
# joe-app/ cuando nada ha cambiado en su carpeta desde el último despliegue,
# ahorrando el npm ci + build de la app que no cambió.
CACHE_DIR="/opt/build/cache"

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

if should_skip_build "joe-app/" "$CACHE_DIR/joe-dist"; then
  echo "== joe-app: sin cambios desde el último deploy, reutilizando build anterior =="
  mkdir -p joe-app/dist
  cp -r "$CACHE_DIR/joe-dist/." joe-app/dist/
else
  build_joe_app
fi

# Assemble _site: static root files + built apps
mkdir -p _site/alquileres
mkdir -p _site/joe

# Copy root static files
cp inicio.html _site/
cp Index.html _site/ 2>/dev/null || true
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
cp bg-trebol.png _site/ 2>/dev/null || true
cp hub-coin-*.webp _site/ 2>/dev/null || true
cp hub-center.webp _site/ 2>/dev/null || true
cp sound-connect.mp3 _site/ 2>/dev/null || true
cp manifest-inicio.json _site/ 2>/dev/null || true
cp icon-ofipapel-192.png _site/ 2>/dev/null || true
cp icon-ofipapel-512.png _site/ 2>/dev/null || true
cp icon-ofipapel-192-maskable.png _site/ 2>/dev/null || true
cp icon-ofipapel-512-maskable.png _site/ 2>/dev/null || true
cp privacidad.html _site/ 2>/dev/null || true
cp 404.html _site/ 2>/dev/null || true

# Copy the built apps
cp -r alquileres/dist/. _site/alquileres/
cp -r joe-app/dist/. _site/joe/

# SPA routing (+ fuerza "/" al hub exacto, ver comentario en netlify.toml).
# El "!" tras el 200 es la sintaxis de _redirects para force=true: sin él,
# Netlify no aplica la regla porque "/" resuelve a Index.html como fichero
# "existente" (case-insensitive) antes de mirar los redirects.
{
  echo "/               /inicio.html              200!"
  echo "/alquileres/*  /alquileres/index.html  200"
  echo "/joe/*         /joe/index.html          200"
} > _site/_redirects
