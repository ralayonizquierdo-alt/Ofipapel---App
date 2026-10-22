#!/bin/bash
# Comando "ignore" de Netlify (ver [build] ignore en netlify.toml).
#
# Netlify ejecuta este script ANTES de arrancar el build. Convenio de Netlify,
# al revés de lo habitual:
#   exit 0  →  SALTAR el build (no consume minutos, se reutiliza el deploy anterior)
#   exit 1  →  CONSTRUIR
#
# Motivo: este repo alimenta TRES sitios de Netlify a la vez (`ofipapel`,
# `spontaneous-lebkuchen-60fa41` y `joesworld`), así que cada push cuesta tres
# builds completos. Buena parte de los commits son documentación
# (`.claude/rax/*.md`, `*.md`, `docs/`) que `build.sh` no copia a `_site/` en
# ningún caso — reconstruir por ellos no cambia ni un byte de lo publicado.
#
# Diseño a prueba de fallos: cualquier duda (primera build, caché limpiada,
# `git diff` que falla, lista de ficheros vacía) termina en `exit 1` = construir.
# Nunca se salta un build sin haber comprobado de verdad qué cambió.

set -u

# Sin referencia al último commit desplegado no hay forma de saber qué cambió.
if [ -z "${CACHED_COMMIT_REF:-}" ] || [ -z "${COMMIT_REF:-}" ]; then
  echo "ignore: sin CACHED_COMMIT_REF/COMMIT_REF — se construye por precaución."
  exit 1
fi

if [ "$CACHED_COMMIT_REF" = "$COMMIT_REF" ]; then
  echo "ignore: mismo commit que el último deploy — se construye por precaución."
  exit 1
fi

CHANGED=$(git diff --name-only "$CACHED_COMMIT_REF" "$COMMIT_REF" 2>/dev/null)
if [ $? -ne 0 ] || [ -z "$CHANGED" ]; then
  echo "ignore: no se pudo calcular el diff — se construye por precaución."
  exit 1
fi

# ── Regla por sitio ────────────────────────────────────────────────────────
# Los tres sitios construyen este mismo repositorio, pero cada uno se usa para
# UNA cosa concreta (comprobado buscando quién enlaza a cada dominio):
#
#   ofipapel                      la interfaz principal y las funciones que usa
#                                 el hub (fichaje, finanzas...). Construye
#                                 siempre.
#   spontaneous-lebkuchen-60fa41  el webhook de WhatsApp de Meta y el resto de
#                                 funciones que llaman inicio.html, Index.html
#                                 y alquileres. Solo necesita reconstruirse
#                                 cuando cambian las funciones.
#   joesworld                     Joe's App, y nada más. Solo necesita
#                                 reconstruirse cuando cambia joe-app/.
#
# Antes los tres reconstruían TODO en cada push: 356 builds en un mes según los
# datos de uso de Netlify, tres veces el mismo trabajo. Esto lo recorta sin
# mover ninguna URL y sin tocar el webhook de Meta, que es lo que no se puede
# arriesgar: si Meta apunta a un sitio que ya no existe, el bot deja de
# responder a los clientes.
#
# CONTRAPARTIDA, explícita: la copia que los sitios secundarios tienen del
# resto de páginas (fichaje.html, finanzas...) se quedará atrás. Es aceptable
# porque nadie entra a esas páginas por esos dominios — el hub las sirve desde
# GitHub Pages y las funciones desde `ofipapel`. Si alguna vez se empieza a
# usar `joesworld/fichaje.html` o similar, hay que quitar su regla de aquí. Es
# el mismo tipo de trampa que dejó `ofipapel-fichaje-test` congelado y sin los
# arreglos de seguridad (DT-26), así que conviene no olvidarlo.
#
# Netlify expone el nombre del sitio en SITE_NAME. Si no llega (o es un sitio
# que no esté en esta lista), se aplica la regla general de abajo, que es la
# conservadora.
case "${SITE_NAME:-}" in
  joesworld)
    if git diff --quiet "$CACHED_COMMIT_REF" "$COMMIT_REF" -- \
         joe-app/ build.sh netlify.toml netlify-ignore.sh 2>/dev/null; then
      echo "ignore: joesworld solo sirve Joe's App y joe-app/ no ha cambiado — build saltado."
      exit 0
    fi
    echo "ignore: joesworld — cambios en joe-app/ o en la configuración del build."
    exit 1
    ;;
  spontaneous-lebkuchen-60fa41)
    if git diff --quiet "$CACHED_COMMIT_REF" "$COMMIT_REF" -- \
         netlify/ build.sh netlify.toml netlify-ignore.sh 2>/dev/null; then
      echo "ignore: spontaneous-lebkuchen solo sirve funciones y netlify/ no ha cambiado — build saltado."
      exit 0
    fi
    echo "ignore: spontaneous-lebkuchen — cambios en netlify/ o en la configuración del build."
    exit 1
    ;;
esac

# ── Regla general (sitio principal, y cualquier sitio no listado arriba) ───
# Un fichero cuenta como "solo documentación" si build.sh no lo publica nunca:
#   .claude/**       cerebro RAX y Skills (nunca se copian a _site/)
#   docs/**          documentación suelta
#   *.md             cualquier markdown, esté donde esté
#   .github/**       workflows de CI y dependabot (no afectan a Netlify)
# Cualquier otra ruta — incluidos los .html de la raíz, las apps React, las
# funciones y el propio netlify.toml/build.sh — obliga a construir.
while IFS= read -r file; do
  [ -z "$file" ] && continue
  case "$file" in
    .claude/*|docs/*|.github/*) continue ;;
    *.md) continue ;;
  esac
  echo "ignore: '$file' afecta a lo publicado — se construye."
  exit 1
done <<< "$CHANGED"

echo "ignore: solo documentación desde $CACHED_COMMIT_REF — build saltado."
echo "$CHANGED" | sed 's/^/  · /'
exit 0
