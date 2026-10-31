# Informes de GeminisWin (.FRX)

GeminisWin guarda cada informe (lo que sale al pulsar la impresora) en un par de ficheros de
Visual FoxPro: `.FRX` + `.FRT` (o `.F2X` + `.F2T`, formato FoxPro 2.x). Cowork copió los 2.185
de `C:\geminisw\` el 30/10/2026 (ZIP `Informes_GeminisWin_2026-10-30.zip`, fuera del repositorio).

- `leer_frx.py <carpeta> <salida.json>`: los lee todos a JSON (bandas en orden, cada campo con su
  expresión, formato, total y condición de impresión, textos, variables y entorno de datos).
- `cargar_informes.py <carpeta>`: sube `informes.json` a la tabla `gw_informe` (sin la carpeta
  `bak`, que son copias antiguas). Hace falta un usuario administrador del ERP.

Cargados: **598 informes** (521 `.FRX` y 77 `.F2X`). Para buscar uno:

```sql
select fichero, impresora, campos from gw_informe where lower(nombre) like 'lisart%';
select o->>'banda' banda, coalesce(o->>'texto', o->>'expr') que, o->>'total' total
  from gw_informe, jsonb_array_elements(objetos) o
 where fichero = 'LisartP1.FRX' and o->>'tipo' in ('texto', 'campo');
```

Pistas para leerlos: `m.xxx` son variables que pone la pantalla antes de imprimir (filtros,
títulos); `Parametr.xxx` sale de la tabla de parámetros; `_pageno` es el nº de página;
`ORIENTATION=1` es apaisado y `PAPERSIZE=9` es A4. Los nombres de informe no dicen a qué opción
del desplegable corresponden: se cruzan por las columnas y el título (`m.inftitulo`) con las
capturas de cada ventana «Informes de…».
