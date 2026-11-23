#!/bin/bash
# graphify (prueba, rama prueba-graphify): cada sesión en la nube arranca en un contenedor limpio, así que se instala
# la versión fijada si falta y se construye el grafo SOLO DE CÓDIGO (AST local, sin IA ni tokens, ~10 s) si no existe.
# graphify-out/ no se versiona (ver .gitignore): pesa ~17 MB y cambia con cada cambio de código.
set -uo pipefail
export GRAPHIFY_NO_CTA=1
VERSION="0.9.115"
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0

if ! command -v graphify >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/graphify" ]; then
  if command -v uv >/dev/null 2>&1; then
    uv tool install --quiet "graphifyy[leiden,sql]==${VERSION}" >&2 || { echo "graphify: no se pudo instalar (sigo sin él)" >&2; exit 0; }
  else
    python3 -m pip install --user --quiet "graphifyy[leiden,sql]==${VERSION}" >&2 || { echo "graphify: no se pudo instalar (sigo sin él)" >&2; exit 0; }
  fi
fi
export PATH="$HOME/.local/bin:$PATH"

if [ ! -f graphify-out/graph.json ]; then
  graphify extract . --code-only --no-label --no-cluster >/dev/null 2>&1 \
    && graphify cluster-only . --no-label --no-viz >/dev/null 2>&1 \
    || echo "graphify: no se pudo construir el grafo (sigo sin él)" >&2
fi
exit 0
