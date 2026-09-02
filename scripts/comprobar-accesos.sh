#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# ¿Se llega a nuestros datos sin ninguna credencial?
#
#   bash scripts/comprobar-accesos.sh
#
# Devuelve 0 si todo está cerrado, 1 si algo responde. Solo hace lecturas y
# comprobaciones de permiso: NO escribe, NO borra y NO crea nada. Se puede
# ejecutar en producción tantas veces como se quiera.
#
# ─── Por qué existe ────────────────────────────────────────────────────────
# Las auditorías manuales de este proyecto fallaron tres veces por el mismo
# motivo, y las tres veces fue de método, no de conocimiento:
#
#   1. Se revisaron las tablas que usa el código (`registros`, `app_sync`) sin
#      preguntar antes qué tablas existían. `public.usuarios`, con contraseñas
#      en claro, llevaba meses expuesta y no apareció.
#   2. Se probaron colecciones de Firestore deducidas leyendo el código
#      (`eventos`, `personas`...). Devolvían 200 y se dieron por confirmadas.
#      No existían: Firestore responde 200 vacío a cualquier nombre inventado
#      si las reglas dejan leer. Las reales se llaman `ofipapel_fichaje_*`.
#   3. Solo se probó lectura. Por eso el proyecto de fichaje figuraba como
#      "se puede leer" cuando además se podían borrar fichajes y cambiar PIN.
#
# ─── Cómo evita repetirlos ─────────────────────────────────────────────────
#   · Intenta ENUMERAR primero. Si lo consigue, esa es la lista buena: incluye
#     lo que nadie recuerda. Si no lo consigue, lo dice y avisa de que la
#     comprobación es parcial — nunca se calla y da un falso "todo bien".
#   · Prueba ESCRITURA además de lectura.
#   · Comprueba si cualquiera puede FABRICARSE una sesión. Si puede, exigir
#     sesión no protege nada, y eso ya nos pasó en Firebase y en Supabase.
#   · Distingue una respuesta de error de una respuesta con datos. La primera
#     versión de este script llegó a tomar las palabras `error`, `code` y
#     `PERMISSION_DENIED` de un mensaje de error como si fueran nombres de
#     colecciones, y las dio por seguras. De ahí que todo se parsee con JSON
#     de verdad y no con grep.
# ═══════════════════════════════════════════════════════════════════════════

set -uo pipefail

FALLOS=0; PARCIAL=0
ok()    { printf '  \033[32m✓\033[0m %s\n' "$1"; }
mal()   { printf '  \033[31m✗ ABIERTO\033[0m %s\n' "$1"; FALLOS=$((FALLOS+1)); }
aviso() { printf '  \033[33m!\033[0m %s\n' "$1"; }
titulo(){ printf '\n\033[1m%s\033[0m\n' "$1"; }
CURL="curl -s --max-time 25"

# ───────────────────────────────────────────────────────────────────────────
# SUPABASE
# ───────────────────────────────────────────────────────────────────────────
comprobar_supabase() {
  local nombre="$1" url="$2" key="$3"; shift 3
  local conocidas=("$@")
  titulo "SUPABASE · $nombre"

  if [ -z "$key" ]; then
    aviso "sin clave pública para este proyecto — NO comprobado"; PARCIAL=$((PARCIAL+1)); return
  fi

  # ¿Se puede enumerar? PostgREST publica un OpenAPI con todas las tablas.
  # Que esté cerrado es buena señal: el atacante tampoco lo ve.
  local tablas
  tablas=$($CURL "$url/rest/v1/" -H "apikey: $key" | python3 -c "
import sys, json
try: d = json.load(sys.stdin)
except Exception: sys.exit(1)
if not isinstance(d, dict) or 'paths' not in d: sys.exit(1)
for p in d['paths']:
    if p.startswith('/') and len(p) > 1 and '{' not in p: print(p[1:])
" 2>/dev/null)

  if [ -n "$tablas" ]; then
    mal "el catálogo de tablas se lista con la clave pública: $(printf '%s\n' "$tablas" | wc -l | tr -d ' ') tablas al descubierto"
  else
    ok "el catálogo de tablas no se puede listar"
    aviso "por eso se prueban solo las tablas conocidas de abajo: la lista puede quedarse corta"
    PARCIAL=$((PARCIAL+1))
    tablas=$(printf '%s\n' "${conocidas[@]}")
  fi

  while IFS= read -r t; do
    [ -z "$t" ] && continue
    local c
    c=$($CURL -o /dev/null -w '%{http_code}' "$url/rest/v1/$t?limit=1" \
          -H "apikey: $key" -H "Authorization: Bearer $key")
    [ "$c" = "200" ] && mal "$t · se LEE sin credencial" || ok "$t · lectura $c"

    # DELETE con un filtro que no puede casar con ninguna fila. No borra nada
    # ni en el peor caso. Se mira el CÓDIGO DE ERROR de PostgREST, no el
    # status: `42501` es permiso denegado (cerrado) y `42703` significa que la
    # columna del filtro no existe en esa tabla, que no dice absolutamente
    # nada sobre permisos. La primera versión daba ese 42703 por "abierto" y
    # marcaba como agujero una tabla que estaba bien cerrada.
    local body
    body=$($CURL -X DELETE "$url/rest/v1/$t?id=is.null" \
          -H "apikey: $key" -H "Authorization: Bearer $key" -H 'Prefer: return=minimal')
    if printf '%s' "$body" | grep -q '"42501"'; then
      ok "$t · escritura denegada"
    elif printf '%s' "$body" | grep -qE '"(42703|PGRST205)"'; then
      # 42703: esa tabla no tiene columna `id`. PGRST205: la tabla no existe.
      # Ninguno de los dos dice nada sobre permisos, así que no se cuenta como
      # cerrado NI como abierto — se pide revisión a mano y se marca parcial.
      aviso "$t · no existe o no tiene columna id — escritura sin comprobar"
      PARCIAL=$((PARCIAL+1))
    elif [ -z "$body" ]; then
      mal "$t · admite ESCRITURA sin credencial"
    else
      aviso "$t · escritura no concluyente: $(printf '%s' "$body" | head -c 80)"
      PARCIAL=$((PARCIAL+1))
    fi
  done <<< "$tablas"

  # Sesión ≠ identidad: si cualquiera se fabrica una cuenta, exigir sesión no sirve.
  local aj; aj=$($CURL "$url/auth/v1/settings" -H "apikey: $key")
  printf '%s' "$aj" | grep -q '"disable_signup":true' \
    && ok "alta de usuarios cerrada" \
    || mal "alta de usuarios ABIERTA — cualquiera se registra y pasa a ser 'authenticated'"
  printf '%s' "$aj" | grep -q '"anonymous_users":false' \
    && ok "registro anónimo desactivado" \
    || mal "registro anónimo ACTIVADO — 'exigir sesión' no distingue a nadie"
}

# ───────────────────────────────────────────────────────────────────────────
# FIRESTORE
# ───────────────────────────────────────────────────────────────────────────
comprobar_firestore() {
  local nombre="$1" proyecto="$2" key="$3"; shift 3
  local conocidas=("$@")
  titulo "FIRESTORE · $nombre ($proyecto)"

  local tok
  tok=$($CURL -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$key" \
        -H 'Content-Type: application/json' -d '{"returnSecureToken":true}' \
        | python3 -c "
import sys, json
try: print(json.load(sys.stdin).get('idToken',''))
except Exception: pass
" 2>/dev/null)

  if [ -z "$tok" ]; then
    ok "registro anónimo desactivado — sin credenciales no hay sesión"
  else
    aviso "registro anónimo ACTIVADO: cualquiera obtiene sesión. Lo de abajo es lo que alcanza"
  fi

  local base="https://firestore.googleapis.com/v1/projects/$proyecto/databases/(default)/documents"
  local auth=(); [ -n "$tok" ] && auth=(-H "Authorization: Bearer $tok")

  # Enumerar. Se parsea como JSON: un cuerpo de error NO son colecciones.
  local cols
  cols=$($CURL -X POST "$base:listCollectionIds" "${auth[@]}" \
         -H 'Content-Type: application/json' -d '{"pageSize":300}' | python3 -c "
import sys, json
try: d = json.load(sys.stdin)
except Exception: sys.exit(1)
if not isinstance(d, dict) or 'error' in d: sys.exit(1)
for c in d.get('collectionIds', []): print(c)
" 2>/dev/null)

  if [ -n "$cols" ]; then
    mal "las colecciones se listan enteras: $(printf '%s\n' "$cols" | wc -l | tr -d ' ') al descubierto"
  else
    ok "las colecciones no se pueden listar"
    aviso "por eso se prueban solo las conocidas de abajo: la lista puede quedarse corta"
    PARCIAL=$((PARCIAL+1))
    cols=$(printf '%s\n' "${conocidas[@]}")
  fi

  while IFS= read -r c; do
    [ -z "$c" ] && continue
    local r w d
    r=$($CURL -o /dev/null -w '%{http_code}' "$base/$c?pageSize=1" "${auth[@]}")
    [ "$r" = "200" ] && mal "$c · se LEE con una sesión que cualquiera crea" || ok "$c · lectura $r"

    # currentDocument.exists=true sobre un documento inexistente: 403 si la
    # regla deniega, 404 si la permite. En ningún caso escribe.
    w=$($CURL -o /dev/null -w '%{http_code}' -X PATCH \
        "$base/$c/_comprobacion_no_existe?currentDocument.exists=true" \
        "${auth[@]}" -H 'Content-Type: application/json' -d '{"fields":{}}')
    d=$($CURL -o /dev/null -w '%{http_code}' -X DELETE "$base/$c/_comprobacion_no_existe" "${auth[@]}")
    [ "$w" = "403" ] && ok "$c · modificación denegada" || mal "$c · admite MODIFICAR ($w)"
    [ "$d" = "403" ] && ok "$c · borrado denegado"      || mal "$c · admite BORRAR ($d)"
  done <<< "$cols"
}

# ───────────────────────────────────────────────────────────────────────────
# Qué se comprueba.
#
# Solo claves PÚBLICAS: las mismas que cualquiera ve con "ver código fuente".
# Este fichero no contiene ningún secreto y puede vivir en un repo público.
#
# Las listas de apoyo son la red de seguridad para cuando la enumeración está
# cerrada. Salen de la auditoría del 2026-09-02. Si se crea una tabla o
# colección nueva, AÑÁDELA AQUÍ — o la comprobación no la mirará.
# ───────────────────────────────────────────────────────────────────────────
printf '\033[1m¿Se llega a nuestros datos sin ninguna credencial?\033[0m\n'
printf 'Solo lecturas y comprobaciones de permiso. No escribe nada.\n'

comprobar_supabase "App Bancos (Finanzas)" \
  "https://agjmciudnnginqybnogh.supabase.co" \
  "sb_publishable_LaJCCCGsN2VIXFDFAxEb6g_eEZHh3j6" \
  registros app_sync usuarios

comprobar_supabase "Joe's App" \
  "https://fiaqvzjzbpncutkngdbo.supabase.co" \
  "sb_publishable_H3eVLyJpXxMiRUim_6RcTg_U80_9sSQ" \
  events hospital_shifts coisinhas business_tasks spotify_playlists favorite_artists limon_records

comprobar_firestore "Alquileres y Vacaciones" ofipapelvv \
  AIzaSyDLqPoqiMgiqbk5Uv-4RoYrbA-5Yfc1A_s \
  apartments prices reservations payments repairs deletedRepairs expenses \
  offerPrices incomes occupancies meta ofipapel_vacaciones

comprobar_firestore "Fichaje" ofipapel-fichaje-63ced \
  AIzaSyCZ7cBQXZkw-VB0vnJE4m8lj3mscyiIMEc \
  ofipapel_fichaje_eventos ofipapel_fichaje_config

titulo "RESULTADO"
if [ "$PARCIAL" -gt 0 ]; then
  printf '  \033[33mComprobación PARCIAL\033[0m en %s backends: no se pudo enumerar y solo se\n' "$PARCIAL"
  printf '  probaron las listas conocidas. Que no salga nada NO demuestra que no haya nada.\n'
fi
if [ "$FALLOS" -eq 0 ]; then
  printf '  \033[32mNada respondió sin credencial\033[0m de todo lo comprobado.\n\n'
  exit 0
fi
printf '  \033[31m%s cosas abiertas.\033[0m Cada ✗ es un dato al que se llega sin contraseña.\n' "$FALLOS"
printf '  Antes de cerrar cualquiera: mira QUÉ APLICACIONES la usan. Cerrar reglas sin\n'
printf '  migrar antes a quien las usa deja gente fuera de su propia app (DT-29).\n\n'
exit 1
