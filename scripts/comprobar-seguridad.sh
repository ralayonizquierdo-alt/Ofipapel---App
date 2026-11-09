#!/usr/bin/env bash
#
# Comprueba, con peticiones de verdad, que los datos del ecosistema NO se leen
# ni se escriben sin credencial.
#
# Por qué existe: la auditoría de agosto de 2026 se hizo a mano y a los dos
# meses nadie sabía si lo cerrado seguía cerrado. Una norma de seguridad
# —SOC 2 CC7, ISO 27001 A.8.8 y A.5.36— no pide solo arreglarlo: pide poder
# demostrar, con fecha, que se sigue comprobando. Esto es esa prueba, y se
# puede correr en cualquier momento sin tocar nada.
#
#   bash scripts/comprobar-seguridad.sh
#
# Solo lee. La única escritura que intenta es un UPDATE con un filtro que no
# casa con ninguna fila: si el permiso existiera no cambiaría nada, y si no
# existe —que es lo que se espera— devuelve 401.
#
# Las claves que usa son las PÚBLICAS que ya van dentro del HTML servido: no
# hay ningún secreto en este fichero. Lo que se comprueba es justo que esas
# claves, por sí solas, no abren nada.
#
# Sale con 0 si todo está cerrado y con 1 si algo se puede leer o escribir.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

fallos=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
mal()  { printf '  \033[31m✗ %s\033[0m\n' "$1"; fallos=$((fallos + 1)); }
titulo(){ printf '\n\033[1m%s\033[0m\n' "$1"; }

# ─── Supabase «App Bancos» (Finanzas y Control de Pedidos) ──────────────────
titulo "Supabase «App Bancos» — con la clave publishable del HTML, sin sesión"

SUPA_URL=$(grep -oE 'https://[a-z0-9]+\.supabase\.co' Index.html | head -1)
SUPA_KEY=$(grep -oE 'sb_publishable_[A-Za-z0-9_-]+' Index.html | head -1)

if [ -z "$SUPA_URL" ] || [ -z "$SUPA_KEY" ]; then
  mal "no encuentro la URL o la clave de Supabase en Index.html"
else
  for t in registros app_sync cp_docs cp_miembros fin_miembros cp_homologar; do
    code=$(curl -sS -o /dev/null -w '%{http_code}' \
      "$SUPA_URL/rest/v1/$t?select=*&limit=1" \
      -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY")
    case "$code" in
      401|403) ok "$t no se lee ($code)" ;;
      *)       mal "$t RESPONDE $code — se puede leer sin cuenta" ;;
    esac
  done

  # Escritura: filtro imposible, así que ni con permiso cambiaría nada.
  for t in app_sync registros cp_docs; do
    code=$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH \
      "$SUPA_URL/rest/v1/$t?id=eq.__no_existe_jamas__" \
      -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
      -H 'Content-Type: application/json' -H 'Prefer: return=minimal' -d '{}')
    case "$code" in
      401|403) ok "$t no se escribe ($code)" ;;
      *)       mal "$t ACEPTA ESCRITURA ($code) sin cuenta" ;;
    esac
  done
fi

# ─── Firestore ──────────────────────────────────────────────────────────────
# Dos proyectos: ofipapelvv (Alquileres y Vacaciones) y el de Fichaje.
comprueba_firestore() {
  local proyecto="$1" apikey="$2"; shift 2

  # 1) Sin ninguna credencial.
  for c in "$@"; do
    code=$(curl -sS -o /dev/null -w '%{http_code}' \
      "https://firestore.googleapis.com/v1/projects/$proyecto/databases/(default)/documents/$c?pageSize=1")
    case "$code" in
      401|403) ok "$proyecto/$c no se lee sin credencial ($code)" ;;
      *)       mal "$proyecto/$c RESPONDE $code — se lee sin credencial" ;;
    esac
  done

  # 2) Con la sesión anónima que Firebase concede a quien la pida, si está
  #    abierta. Que la conceda no es un fallo en sí: el fallo sería que esa
  #    sesión llegara a los datos.
  local tok
  tok=$(curl -sS -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$apikey" \
    -H 'Content-Type: application/json' -d '{"returnSecureToken":true}' \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("idToken",""))' 2>/dev/null)

  if [ -z "$tok" ]; then
    ok "$proyecto no concede sesiones anónimas"
    return
  fi
  printf '  \033[33m!\033[0m %s SÍ concede sesión anónima (apáguala en Firebase → Authentication)\n' "$proyecto"
  for c in "$@"; do
    code=$(curl -sS -o /dev/null -w '%{http_code}' \
      "https://firestore.googleapis.com/v1/projects/$proyecto/databases/(default)/documents/$c?pageSize=1" \
      -H "Authorization: Bearer $tok")
    case "$code" in
      401|403) ok "$proyecto/$c tampoco con sesión anónima ($code)" ;;
      *)       mal "$proyecto/$c RESPONDE $code CON SESIÓN ANÓNIMA — abierto" ;;
    esac
  done
}

titulo "Firestore «ofipapelvv» — Alquileres y Vacaciones"
comprueba_firestore ofipapelvv \
  "$(grep -oE "AIzaSy[A-Za-z0-9_-]{30,}" alquileres/src/lib/firebase.ts | head -1)" \
  reservations payments expenses apartments empleados

titulo "Firestore de Fichaje"
comprueba_firestore ofipapel-fichaje-63ced \
  "$(grep -oE "apiKey: '(AIzaSy[A-Za-z0-9_-]{30,})'" fichaje.html | grep -oE 'AIzaSy[A-Za-z0-9_-]{30,}' | head -1)" \
  fichajes empleados config

# ─── Funciones que cuestan dinero ───────────────────────────────────────────
titulo "Funciones de Netlify — sin token"

SITIO=${SITIO:-https://ofipapel.netlify.app}
# `alquileres-asistente-estado` solo admite GET: con POST contestaría 405 sin
# llegar a mirar la credencial, y eso no prueba nada.
for f in chat-assistant alquileres-asistente marketing-engine-run; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$SITIO/.netlify/functions/$f" \
    -H 'Content-Type: application/json' -d '{}')
  case "$code" in
    401|403) ok "$f pide credencial ($code)" ;;
    404)     printf '  · %s no está publicada aquí (404)\n' "$f" ;;
    *)       mal "$f RESPONDE $code sin credencial" ;;
  esac
done

code=$(curl -sS -o /dev/null -w '%{http_code}' "$SITIO/.netlify/functions/alquileres-asistente-estado?jobId=abcdefgh")
case "$code" in
  401|403) ok "alquileres-asistente-estado pide credencial ($code)" ;;
  404)     printf '  · alquileres-asistente-estado no está publicada aquí (404)\n' ;;
  *)       mal "alquileres-asistente-estado RESPONDE $code sin credencial" ;;
esac

# ─── Cabeceras de seguridad ─────────────────────────────────────────────────
titulo "Cabeceras que sirve $SITIO"

cab=$(curl -sSI "$SITIO/alquileres/")
for h in strict-transport-security x-content-type-options x-frame-options \
         referrer-policy permissions-policy; do
  if grep -qi "^$h:" <<<"$cab"; then ok "$h"; else mal "falta $h"; fi
done

# La CSP está aplazada a propósito: los HTML monolíticos llevan el JavaScript
# dentro, así que una CSP útil hay que montarla por fases (el plan está en
# docs/seguridad/POLITICA_SEGURIDAD.md). Se avisa, no se da por fallo.
if grep -qi '^content-security-policy:' <<<"$cab"; then
  ok "content-security-policy"
else
  printf '  \033[33m!\033[0m sin content-security-policy (aplazada: ver docs/seguridad/POLITICA_SEGURIDAD.md)\n'
fi

# ─── Resultado ──────────────────────────────────────────────────────────────
printf '\n'
if [ "$fallos" -eq 0 ]; then
  printf '\033[32mTodo cerrado.\033[0m %s\n' "$(date '+%d/%m/%Y %H:%M')"
else
  printf '\033[31m%s comprobaciones han fallado.\033[0m %s\n' "$fallos" "$(date '+%d/%m/%Y %H:%M')"
fi
exit $((fallos > 0))
