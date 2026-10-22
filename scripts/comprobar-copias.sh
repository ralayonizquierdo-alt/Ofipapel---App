#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# ¿Cuántas copias hay de cada app, y están todas al día?
#
#   bash scripts/comprobar-copias.sh
#
# ─── Por qué existe ────────────────────────────────────────────────────────
# Este repositorio se publica en CUATRO sitios a la vez: tres de Netlify y uno
# de GitHub Pages. Los cuatro construyen el mismo código, así que en teoría
# sirven lo mismo. En la práctica no tiene por qué: desde que `netlify-ignore.sh`
# salta builds por sitio, cada uno se reconstruye por motivos distintos y puede
# quedarse atrás sin que nada lo avise.
#
# Eso no es una hipótesis. Ya pasó: `ofipapel-fichaje-test` sirvió durante meses
# una copia de julio de `fichaje.html` — sin el arreglo de XSS, apuntando a los
# datos reales — y nadie lo supo porque por fuera se veía igual (DT-26).
#
# El problema de fondo no es el gasto, es no saber cuál es la buena. Este script
# lo contesta descargando cada app de cada sitio y comparando el contenido.
# No supone nada a partir de la configuración: mira lo que de verdad se sirve.
#
# ─── Cómo leerlo ───────────────────────────────────────────────────────────
#   IGUAL      todas las copias vivas son idénticas — no hay nada que decidir
#   DISTINTAS  hay al menos dos versiones circulando: alguien está viendo una
#              vieja, y hay que averiguar quién
#   (404)      esa app no se publica en ese sitio; normal, no es un fallo
# ═══════════════════════════════════════════════════════════════════════════

set -u

PLATAFORMAS=(
  "ofipapel|https://ofipapel.netlify.app"
  "spontaneous|https://spontaneous-lebkuchen-60fa41.netlify.app"
  "joesworld|https://joesworld.netlify.app"
  "gh-pages|https://ralayonizquierdo-alt.github.io/Ofipapel---App"
)

# Las apps con build propio (joe-app, alquileres) no se comparan por su HTML:
# el index es una cáscara y lo que cambia es el bundle, cuyo nombre lleva un
# hash. Por eso se compara el nombre del fichero .js, que ES el resumen del
# contenido — si dos sitios sirven bundles con distinto nombre, sirven código
# distinto, sin necesidad de descargarlo.
APPS_HTML=(
  "inicio.html" "Index.html" "canarias-ink.html" "falcontrol.html"
  "vacaciones.html" "importacion-pedidos-proveedores.html"
  "fichaje.html" "app.html" "privacidad.html" "404.html"
)
APPS_BUILD=("joe" "alquileres")

huella_html() { # $1 = url  → sha256 corto, o vacío si no hay 200
  local cuerpo
  cuerpo=$(curl -s -L --max-time 25 -w '\n%{http_code}' "$1") || return 1
  [ "$(tail -1 <<<"$cuerpo")" = "200" ] || return 1
  sed '$d' <<<"$cuerpo" | sha256sum | cut -c1-10
}

huella_bundle() { # $1 = url base de la app con build
  curl -s -L --max-time 25 "$1/" \
    | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1 \
    | sed 's|assets/index-||; s|\.js||'
}

printf '%-38s' "APP"
for p in "${PLATAFORMAS[@]}"; do printf '%-14s' "${p%%|*}"; done
printf '%s\n' "VEREDICTO"
printf '%s\n' "$(printf '─%.0s' {1..110})"

iguales=0; distintas=0; total_copias=0

comparar() { # $1 = etiqueta, $2 = tipo (html|build), $3 = ruta
  local etiqueta=$1 tipo=$2 ruta=$3
  local -a huellas=()
  printf '%-38s' "$etiqueta"
  for p in "${PLATAFORMAS[@]}"; do
    local base="${p##*|}" h=""
    if [ "$tipo" = html ]; then
      h=$(huella_html "$base/$ruta") || h=""
    else
      h=$(huella_bundle "$base/$ruta")
    fi
    if [ -z "$h" ]; then printf '%-14s' "—"; else
      printf '%-14s' "$h"; huellas+=("$h"); total_copias=$((total_copias+1))
    fi
  done
  local unicas
  unicas=$(printf '%s\n' "${huellas[@]}" | sort -u | wc -l)
  if [ "${#huellas[@]}" -le 1 ]; then printf '%s\n' "1 sola copia"
  elif [ "$unicas" -eq 1 ]; then printf '%s\n' "IGUAL (${#huellas[@]} copias)"; iguales=$((iguales+1))
  else printf '%s\n' "⚠ DISTINTAS — $unicas versiones"; distintas=$((distintas+1)); fi
}

for a in "${APPS_HTML[@]}"; do comparar "$a" html "$a"; done
for a in "${APPS_BUILD[@]}"; do comparar "$a/ (bundle)" build "$a"; done

echo
echo "Apps idénticas en todas sus copias: $iguales"
echo "Apps con versiones distintas:       $distintas"
echo "Copias vivas en total:              $total_copias"
echo
if [ "$distintas" -gt 0 ]; then
  echo "Hay al menos una app sirviendo dos versiones a la vez. Antes de tocar"
  echo "nada, averigua por qué dirección entra la gente: apagar la copia buena"
  echo "es peor que tener dos."
else
  echo "Todas las copias coinciden. Eso NO significa que no sobren: significa"
  echo "que hoy no hay ninguna desactualizada."
fi
