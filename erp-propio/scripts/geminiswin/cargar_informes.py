"""Sube informes.json (leer_frx.py) a la tabla gw_informe. Usuario administrador del ERP:
ERP_USUARIO=... ERP_CLAVE=... SUPABASE_URL=... SUPABASE_KEY=... python3 cargar_informes.py <carpeta>"""
import json, os, re, ssl, sys, urllib.request
S = sys.argv[1]  # carpeta con informes.json (salida de leer_frx.py)
url, key = os.environ['SUPABASE_URL'], os.environ['SUPABASE_KEY']  # clave publicable
clave = os.environ['ERP_CLAVE']
ctx = ssl.create_default_context(cafile=os.environ.get('SSL_CERT_FILE'))  # en la nube: el certificado del proxy
def pedir(ruta, cuerpo, cab):
    r = urllib.request.Request(url + ruta, data=json.dumps(cuerpo).encode(), headers={'apikey': key, 'Content-Type': 'application/json', **cab}, method='POST')
    return json.load(urllib.request.urlopen(r, context=ctx)) if 'return=minimal' not in str(cab) else urllib.request.urlopen(r, context=ctx).status
tok = pedir('/auth/v1/token?grant_type=password', {'email': os.environ['ERP_USUARIO'] + '@ofipapel.local', 'password': clave}, {})['access_token']
inf = [i for i in json.load(open(f'{S}/informes.json')) if i['carpeta'] != 'bak']
filas = [{'fichero': i['fichero'], 'nombre': i['nombre'], 'formato': i['formato'],
          'impresora': i.get('cabecera', {}).get('impresora') or None, 'bandas': i['bandas'], 'objetos': i['objetos'],
          'variables': i['variables'], 'datos': i['datos'],
          'campos': [o['expr'] for o in i['objetos'] if o['tipo'] == 'campo' and o.get('banda') == 'detalle' and o.get('expr')]} for i in inf]
cab = {'Authorization': 'Bearer ' + tok, 'Prefer': 'resolution=merge-duplicates,return=minimal'}
for n in range(0, len(filas), 40):
    pedir('/rest/v1/gw_informe?on_conflict=fichero', filas[n:n + 40], cab)
print(len(filas), 'informes cargados')
