#!/bin/bash
# Comprueba que no se haya colado ningún secreto REAL en el código versionado.
# Lo usa .github/workflows/seguridad.yml y se puede lanzar a mano: bash scripts/comprobar-secretos.sh
#
# Ignora a propósito las claves que son públicas por diseño y van en los HTML
# (anon/publishable de Supabase, apiKey web de Firebase: ver CLAUDE.md "Variables
# de entorno / secretos"). Lo que busca es lo que NUNCA debe estar en el repo:
# claves de servicio, claves privadas, tokens de API de proveedores.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 2
fallos=0
buscar() {   # $1 = descripción, $2 = patrón (ERE)
  local salida
  salida=$(git grep -nIE -e "$2" -- . ':!scripts/comprobar-secretos.sh' ':!*package-lock.json' ':!*.md' 2>/dev/null | cut -c1-160)
  if [ -n "$salida" ]; then
    echo "✗ $1:"; echo "$salida" | head -5; fallos=1
  fi
}
buscar "clave privada PEM"                  '-----BEGIN (RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----'
buscar "clave de Anthropic"                 'sk-ant-[A-Za-z0-9_-]{20,}'
buscar "clave secreta tipo OpenAI/Stripe"   '(sk|rk)_(live|test)_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9]{32,}'
buscar "token de GitHub"                    'gh[pousr]_[A-Za-z0-9]{30,}'
buscar "clave de acceso de AWS"             'AKIA[0-9A-Z]{16}'
buscar "token de Slack"                     'xox[baprs]-[A-Za-z0-9-]{10,}'
# JWT de Supabase con rol de servicio (el de anon es público; el service_role no)
for jwt in $(git grep -hIoE 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}' -- . ':!*package-lock.json' 2>/dev/null | sort -u); do
  payload=$(echo "$jwt" | cut -d. -f2 | tr '_-' '/+'); pad=$(( (4 - ${#payload} % 4) % 4 )); payload="$payload$(printf '=%.0s' $(seq 1 $pad))"
  if echo "$payload" | base64 -d 2>/dev/null | grep -q '"role" *: *"service_role"'; then
    echo "✗ JWT con rol service_role en el repositorio"; fallos=1
  fi
done
if [ "$fallos" = 0 ]; then echo "✓ Sin secretos reales en el código versionado."; fi
exit $fallos
