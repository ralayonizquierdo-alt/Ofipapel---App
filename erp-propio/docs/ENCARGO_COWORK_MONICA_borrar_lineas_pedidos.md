# Encargo para el Cowork del PC de Mónica — borrar de la copia las líneas de pedido que ya no existen

**De:** Rober (preparado por Claude Code, 27/11/2026)
**Programa:** `erp-propio/scripts/geminiswin/espejo_geminiswin.py` (rama `erp` del repositorio), el que copia GeminisWin al ERP desde el PC de Mónica.
**Solo se lee GeminisWin. No se cambia nada en GeminisWin.**

## Qué pasa

Al editar un pedido a proveedor, GeminisWin marca como **borradas** las líneas viejas de `PEDIDLIN` y añade las nuevas al final.
El programa se salta los registros borrados y solo envía altas y cambios, así que **las líneas viejas se quedan para siempre en el ERP**.
Ejemplo: el pedido 42-95604 (SAM Manipulados) tiene unas 70 líneas en GeminisWin y 213 en el ERP. Resultado: el Gestor de compras cree que viene en camino casi el doble de mercancía.

## Lo que ya está hecho en el ERP (no hay que tocarlo)

La función `espejo-gw-ingesta` acepta ya, con la misma cabecera `x-puente-clave`:

```json
{ "tabla": "PEDIDLIN", "borrar": ["42|95604|3|00180", "..."], "equipo": "NOMBRE-PC" }
```

- Cada clave tiene **el mismo formato que la «c» de las filas** (`clave_de`: `IDOFICINA|NUMERO|LINEA|COD_INTERN`).
- Máximo 20.000 claves por envío. Si hay más, se mandan en varios.
- Responde `{ "ok": true, "tabla": "PEDIDLIN", "claves": N, "borradas": M }`.
- Para otras tablas responde `{ "ok": true, "ignorada": true }` y no borra nada. De momento solo `PEDIDLIN`.

## Cambio que hay que hacer en `pasada()`

Es la propuesta que ya hizo el otro Cowork (nota 179): **reconciliar por clave al terminar una lectura COMPLETA**.

1. Lista de tablas a reconciliar, al principio del fichero:
   ```python
   RECONCILIAR = {'PEDIDLIN'}
   ```
2. Dentro del bucle `for reg in lector:`, **antes** del `continue` de «huella igual», guardar todas las claves leídas:
   ```python
   leidas.add(k)          # con `leidas = set()` creado justo antes del bucle
   ```
3. Solo se reconcilia si esta pasada leyó la tabla **entera**:
   - `tabla in RECONCILIAR`
   - `filtro is None` y `desde_reg == 0` (no fue una lectura parcial de «grandes»)
   - `dentro is None` (no hay `ventana_dias` para PEDIDCAB)
   - la lectura terminó **sin fallo** (`fallo` vacío) y después del último `enviar()` / `cargar()`
4. Al terminar, calcular lo que ya no existe y mandarlo:
   ```python
   enviadas = [r[0] for r in con.execute('select clave from registro where tabla = ?', (tabla,))]
   faltan = [c for c in enviadas if c not in leidas]
   # Seguridad: si no se leyó nada, o faltaría más de la mitad, algo raro pasa: NO borrar y avisar en el registro.
   if leidas and len(faltan) <= len(enviadas) // 2:
       for i in range(0, len(faltan), 5000):
           trozo = faltan[i:i + 5000]
           r = llamar(cfg, clave, {'tabla': tabla, 'borrar': trozo, 'equipo': equipo})
           if not r.get('ok'):
               resumen.append(f'{tabla}: no se pudo borrar ({corto(r.get("error", ""))})')
               break
           con.executemany('delete from registro where tabla = ? and clave = ?', [(tabla, c) for c in trozo])
           con.commit()
       resumen.append(f'{tabla}: {len(faltan)} líneas que ya no existen, borradas de la copia')
   elif faltan:
       resumen.append(f'{tabla}: faltarían {len(faltan)} de {len(enviadas)}; no se borra nada por seguridad')
   ```

## Cómo comprobar que funciona

- En la primera pasada después del cambio deben salir **varios miles** de «líneas que ya no existen, borradas». Son las acumuladas de pedidos editados: 95604, 95602 y otros.
- En el ERP, el pedido **42-95604** debe quedar con las mismas líneas que en GeminisWin (unas 70). Por ejemplo, el artículo **00180** solo con **480**, sin la línea de 640.
- Si algo falla, el programa sigue como antes. Solo deja de borrar.

## Al terminar

Deja una nota en `coordinacion_notas` (`de: cowork`, `para: claude-code`) con:
- la fecha y hora del cambio;
- el commit en la rama `erp`;
- el resultado de la primera pasada (cuántas líneas se borraron).
