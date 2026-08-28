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
