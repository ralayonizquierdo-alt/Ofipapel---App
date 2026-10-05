// Lógica de negocio de control-pedidos.html, sin nada de interfaz.
//
// Vive en un fichero aparte (y no inline como el resto de HTML monolíticos)
// solo para poder probarla con node: scripts/probar-control-pedidos.js. El
// navegador la carga con <script src> y la usa como window.ControlPedidos.
//
// Reglas que salen de lo hablado con el propietario (ver el informe de
// migración del prototipo, 2026-10-02) y que NO se deben relajar:
//   - Todo cambio de precio se enseña. En pedidos del COMERCIAL la tolerancia
//     es cero: cualquier diferencia hay que decidirla (2026-10-02). La de
//     0,25 € (incluido, informativo) es solo para pedidos de REPOSICIÓN.
//   - Nada se exporta mientras quede una discordancia sin decidir.
//   - Lo que el cliente pidió y no llega queda en RESTOS, ligado a ese cliente,
//     para reconocerlo cuando aparezca en un pedido posterior.
//   - El precio base nunca se toca para cuadrar un subtotal: se ajusta solo el
//     descuento (Géminis admite uno por línea).
(function (raiz) {
  'use strict';

  const TOLERANCIA = { comercial: 0, reposicion: 0.25 };

  // ── Normalización ─────────────────────────────────────────────────────────

  /** Referencia comparable: mayúsculas y sin espacios. No quita barras ni
   *  puntos: en los manuscritos una "/" suele ser un 1 mal trazado, y
   *  borrarla convertiría un error visible en otra referencia válida. */
  function normRef(ref) {
    return String(ref == null ? '' : ref).toUpperCase().replace(/\s+/g, '');
  }

  /** Acepta 4,13 · 4'13 · 4.13 · 1.234,56 · números. Vacío o ilegible → null. */
  function parseNum(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    let s = String(v).trim().replace(/[€\s]/g, '').replace(/[´`’']/g, ',');
    if (!s) return null;
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  const red2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  // ── Comparación pedido ↔ propuesta ────────────────────────────────────────

  /** «10+5», «10%+5%», [10, 5], 10 → [10, 5]. Los ceros no cuentan. */
  function parseDtos(v) {
    if (v == null || v === '') return [];
    if (Array.isArray(v)) return v.map(parseNum).filter((n) => n);
    if (typeof v === 'number') return v ? [v] : [];
    return String(v).split('+').map((x) => parseNum(x.replace('%', ''))).filter((n) => n);
  }

  /** Precio neto unitario, después de TODOS los descuentos. Si la línea trae
   *  importe, manda el importe: lleva dentro los redondeos del proveedor. */
  function precioNeto(l) {
    const cant = parseNum(l.cant);
    const imp = parseNum(l.importe);
    if (imp != null && cant) return Math.round((imp / cant) * 10000) / 10000;
    const p = parseNum(l.precio);
    if (p == null) return null;
    return Math.round(parseDtos(l.dtos).reduce((x, d) => x * (1 - d / 100), p) * 10000) / 10000;
  }

  function agrupar(lineas) {
    const m = new Map();
    for (const l of lineas || []) {
      const ref = normRef(l.ref);
      if (!ref) continue;
      if (!m.has(ref)) {
        m.set(ref, { ref, desc: '', ean: '', cant: 0, precio: null, dtos: [], importe: 0, sinImporte: false, udsCaja: null, unidad: '', veces: 0 });
      }
      const g = m.get(ref);
      g.cant += parseNum(l.cant) || 0;
      g.veces += 1;
      if (!g.desc && l.desc) g.desc = String(l.desc);
      if (!g.ean && l.ean) g.ean = String(l.ean);
      if (g.precio == null && parseNum(l.precio) != null) { g.precio = parseNum(l.precio); g.dtos = parseDtos(l.dtos); }
      const imp = parseNum(l.importe);
      if (imp == null) g.sinImporte = true; else g.importe += imp;
      if (g.udsCaja == null && parseNum(l.udsCaja)) g.udsCaja = parseNum(l.udsCaja);
      if (!g.unidad && l.unidad) g.unidad = String(l.unidad).trim().toUpperCase();
    }
    for (const g of m.values()) {
      g.importe = g.sinImporte ? null : red2(g.importe);
      delete g.sinImporte;
      g.neto = precioNeto(g);
    }
    return m;
  }

  /** Descripción reducida para emparejar posibles sustituciones. */
  const claveDesc = (d) => String(d || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '').slice(0, 14);

  /**
   * Una fila por referencia (unión de pedido y propuesta), en el orden del
   * pedido y después las que solo trae el proveedor.
   *
   * opciones:
   *   tolerancia        € por debajo de los cuales (incluido) un cambio de
   *                     precio es informativo. Por defecto la del comercial (0).
   *   comparar          'bruto' (comercial: precio de tarifa contra precio de
   *                     tarifa) o 'neto' (reposición: después de todos los
   *                     descuentos). Por defecto 'bruto'.
   *   catalogo          {ref: {d, p, ean}} para marcar referencias inexistentes.
   *   preciosAnteriores {ref: neto} último precio aceptado; se usa si el pedido
   *                     no trae precio.
   *
   * estado: 'ok' | 'falta' (pedida, no viene) | 'extra' (viene sin pedirse)
   *         | 'cambio' (viene, pero con cantidad, precio o formato distintos)
   * Cada fila lleva `motivos` con el detalle y `revisar` (true si hace falta
   * decisión). Todo cambio de precio se enseña; dentro de la tolerancia no
   * obliga a decidir, salvo que haya además otro motivo.
   */
  function compararPedido(lineasPedido, lineasPropuesta, opciones) {
    const o = opciones || {};
    // Por defecto, la del comercial (cero): la más estricta si alguien olvida pasarla.
    const tol = o.tolerancia != null ? o.tolerancia : TOLERANCIA.comercial;
    const neto = o.comparar === 'neto';
    const catalogo = o.catalogo || null;
    const anteriores = o.preciosAnteriores || {};
    const ped = agrupar(lineasPedido);
    const pro = agrupar(lineasPropuesta);
    const refs = [...ped.keys(), ...[...pro.keys()].filter((r) => !ped.has(r))];

    const filas = refs.map((ref) => {
      const a = ped.get(ref);
      const b = pro.get(ref);
      const fila = {
        ref,
        desc: (b && b.desc) || (catalogo && catalogo[ref] && catalogo[ref].d) || (a && a.desc) || '',
        ean: (b && b.ean) || (a && a.ean) || (catalogo && catalogo[ref] && catalogo[ref].ean) || '',
        cantPedida: a ? a.cant : 0,
        cantPropuesta: b ? b.cant : 0,
        precioPedido: a ? a.precio : null,
        precioPropuesta: b ? b.precio : null,
        dtosPedido: a ? a.dtos : [],
        dtosPropuesta: b ? b.dtos : [],
        netoPedido: a ? a.neto : null,
        netoPropuesta: b ? b.neto : null,
        importePropuesta: b ? b.importe : null,
        udsCajaPedido: a ? a.udsCaja : null,
        udsCajaPropuesta: b ? b.udsCaja : null,
        precioDeHistorial: false,
        difPrecio: null,
        difPrecioPct: null,
        motivos: [],
        estado: 'ok',
        revisar: false,
        enCatalogo: catalogo ? Boolean(catalogo[ref]) : null,
        sugerencias: [],
      };

      if (a && a.veces > 1) fila.motivos.push({ tipo: 'duplicada_pedido', texto: `Aparece ${a.veces} veces en el pedido (se suman)`, revisar: true });
      if (b && b.veces > 1) fila.motivos.push({ tipo: 'duplicada_propuesta', texto: `Aparece ${b.veces} veces en la propuesta (se suman)`, revisar: true });

      if (a && !b) {
        fila.estado = 'falta';
        fila.motivos.push({ tipo: 'falta', texto: 'Pedida y no viene en la propuesta', revisar: true });
      } else if (!a && b) {
        fila.estado = 'extra';
        fila.motivos.push({ tipo: 'extra', texto: 'Viene en la propuesta y no estaba pedida', revisar: true });
      } else {
        if (a.cant !== b.cant) {
          fila.estado = 'cambio';
          fila.motivos.push({ tipo: 'cantidad', texto: `Cantidad ${a.cant} → ${b.cant}`, revisar: true });
        }
        if (a.udsCaja && b.udsCaja && a.udsCaja !== b.udsCaja) {
          fila.estado = 'cambio';
          fila.motivos.push({ tipo: 'formato', texto: `Unidades por caja ${a.udsCaja} → ${b.udsCaja}`, revisar: true });
        }
        if (a.unidad && b.unidad && a.unidad !== b.unidad) {
          fila.estado = 'cambio';
          fila.motivos.push({ tipo: 'unidad', texto: `Unidad de venta ${a.unidad} → ${b.unidad}`, revisar: true });
        }
        let antes = neto ? a.neto : a.precio;
        const ahora = neto ? b.neto : b.precio;
        if (antes == null && anteriores[ref] != null) { antes = anteriores[ref]; fila.precioDeHistorial = true; }
        fila.precioReferencia = antes;
        if (antes != null && ahora != null && red2(antes) !== red2(ahora)) {
          const dif = red2(ahora - antes);
          fila.difPrecio = dif;
          fila.difPrecioPct = antes ? red2((dif / antes) * 100) : null;
          const fuera = Math.abs(dif) > tol + 1e-9;
          fila.estado = 'cambio';
          fila.motivos.push({
            tipo: 'precio',
            texto: `${neto ? 'Precio neto' : 'Precio'} ${fmt(antes)} → ${fmt(ahora)} (${dif > 0 ? '+' : ''}${fmt(dif)})` +
              (fila.precioDeHistorial ? ' respecto al último precio aceptado' : ''),
            revisar: fuera,
            informativo: !fuera,
          });
        }
      }

      if (catalogo && !fila.enCatalogo && a) {
        fila.sugerencias = sugerenciasCatalogo(ref, catalogo);
        fila.motivos.push({ tipo: 'no_catalogo', texto: 'La referencia no existe en el catálogo del proveedor: posible error de lectura', revisar: true });
      }
      return fila;
    });

    // Posibles sustituciones: una falta y un extra con el mismo EAN o una
    // descripción casi igual. Solo se señala; decidir sigue siendo del usuario.
    const faltas = filas.filter((f) => f.estado === 'falta');
    for (const x of filas.filter((f) => f.estado === 'extra')) {
      const par = faltas.find((f) => (f.ean && f.ean === x.ean) || (claveDesc(f.desc).length >= 6 && claveDesc(f.desc) === claveDesc(x.desc)));
      if (!par) continue;
      x.sustituyeA = par.ref;
      par.sustituidaPor = x.ref;
      x.motivos.push({ tipo: 'sustitucion', texto: `¿Sustituye a ${par.ref}?`, revisar: true });
      par.motivos.push({ tipo: 'sustitucion', texto: `¿Sustituida por ${x.ref}?`, revisar: true });
    }

    for (const f of filas) f.revisar = f.motivos.some((m) => m.revisar);
    return filas;
  }

  function fmt(n) {
    return n == null ? '—' : n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Referencias del catálogo a una cifra de distancia (sustitución o dos
   *  cifras contiguas intercambiadas): el error típico al leer un manuscrito. */
  function sugerenciasCatalogo(ref, catalogo, max) {
    const r = normRef(ref);
    const out = [];
    for (const k of Object.keys(catalogo || {})) {
      if (k.length !== r.length || k === r) continue;
      const difs = [];
      for (let i = 0; i < r.length && difs.length < 3; i++) if (k[i] !== r[i]) difs.push(i);
      const una = difs.length === 1;
      const trans = difs.length === 2 && difs[1] === difs[0] + 1 && k[difs[0]] === r[difs[1]] && k[difs[1]] === r[difs[0]];
      if (una || trans) out.push({ ref: k, desc: catalogo[k].d || '', precio: catalogo[k].p == null ? null : catalogo[k].p });
      if (out.length >= (max || 5)) break;
    }
    return out;
  }

  /**
   * Lo esencial de la comparación, separado de todo lo demás (precios,
   * formato, duplicados…):
   *  - faltan: pedido que no viene, entero (no está en la propuesta/factura)
   *            o en parte (viene menos cantidad).
   *  - sobran: viene sin haberse pedido, o en más cantidad de la pedida.
   * Cada entrada lleva cuánto (`cant`), sobre cuánto (`de`) y si es total.
   */
  function faltasYSobras(filas) {
    const faltan = [];
    const sobran = [];
    for (const f of filas || []) {
      const dif = f.cantPropuesta - f.cantPedida;
      const base = { ref: f.ref, desc: f.desc, precio: f.precioPedido != null ? f.precioPedido : f.precioPropuesta, sustitucion: f.sustituyeA || f.sustituidaPor || null };
      if (dif < 0) faltan.push({ ...base, cant: -dif, de: f.cantPedida, total: f.cantPropuesta === 0 });
      else if (dif > 0) sobran.push({ ...base, cant: dif, de: f.cantPropuesta, total: f.cantPedida === 0 });
    }
    return { faltan, sobran };
  }

  // ── Decisiones ────────────────────────────────────────────────────────────

  /**
   * Acciones posibles por fila. La primera es la sugerida.
   *  - resto:    (solo comercial) no viene o viene menos, y el cliente lo
   *              sigue esperando → RESTOS
   *  - anular:   (solo comercial) no viene y ya no se espera
   *  - aceptar:  se acepta lo que trae el proveedor
   *  - mantener: se mantiene lo pedido (cantidad, precio y descuentos del pedido)
   *  - excluir:  la línea no entra en el pedido final
   *  - manual:   cantidad y/o precio neto a mano
   *
   * En reposición no hay restos: las faltas se ven en la comparación y
   * se deciden ahí, pero nunca entran en el almacén de faltas del comercial.
   */
  function accionesPara(fila, tipo) {
    if (tipo === 'reposicion') {
      if (fila.estado === 'falta') return ['excluir', 'mantener', 'manual'];
      if (fila.estado === 'extra') return ['aceptar', 'excluir'];
      return ['aceptar', 'mantener', 'manual', 'excluir'];
    }
    if (fila.estado === 'falta') return ['resto', 'anular'];
    if (fila.estado === 'extra') return ['aceptar', 'excluir'];
    const menos = fila.cantPropuesta < fila.cantPedida;
    return menos ? ['aceptar', 'resto', 'mantener', 'manual', 'excluir'] : ['aceptar', 'mantener', 'manual', 'excluir'];
  }

  function sinDecidir(filas, decisiones) {
    return filas.filter((f) => f.revisar && !(decisiones && decisiones[f.ref] && decisiones[f.ref].accion));
  }

  /**
   * Aplica las decisiones. Devuelve las líneas finales del pedido y los
   * restos (solo los genera la acción `resto`, que reposición no ofrece).
   * Lanza error si queda algo por decidir: no hay pedido final a medias.
   *
   * Cada línea final lleva el precio BASE (nunca se toca), sus descuentos y,
   * si se conoce, el importe al que tiene que cuadrar (el del proveedor, o
   * el que sale del precio neto escrito a mano).
   */
  function aplicarDecisiones(filas, decisiones) {
    const pendientes = sinDecidir(filas, decisiones);
    if (pendientes.length) {
      const e = new Error('Quedan referencias sin validar: ' + pendientes.map((f) => f.ref).join(', '));
      e.pendientes = pendientes.map((f) => f.ref);
      throw e;
    }
    const lineas = [];
    const restos = [];
    const notas = [];
    for (const f of filas) {
      const d = (decisiones && decisiones[f.ref]) || { accion: f.estado === 'falta' ? 'resto' : 'aceptar' };
      if (d.nota) notas.push({ ref: f.ref, desc: f.desc, texto: d.nota });
      const base = { ref: f.ref, desc: f.desc, ean: f.ean };
      const propuesta = (cant) => ({ ...base, cant, precio: f.precioPropuesta, dtos: f.dtosPropuesta,
        importe: cant === f.cantPropuesta ? f.importePropuesta : null, udsCaja: f.udsCajaPropuesta || f.udsCajaPedido });
      const pedido = (cant) => (f.precioPedido != null
        ? { ...base, cant, precio: f.precioPedido, dtos: f.dtosPedido, importe: null, udsCaja: f.udsCajaPedido || f.udsCajaPropuesta }
        : propuesta(cant));
      switch (d.accion) {
        case 'excluir':
        case 'anular':
          break;
        case 'resto':
          if (f.cantPropuesta > 0) lineas.push(propuesta(f.cantPropuesta));
          if (f.cantPedida > f.cantPropuesta) {
            restos.push({ ...base, cant: f.cantPedida - f.cantPropuesta, precio: f.precioPedido != null ? f.precioPedido : f.precioPropuesta });
          }
          break;
        case 'mantener':
          if (f.cantPedida > 0) lineas.push(pedido(f.cantPedida));
          break;
        case 'manual': {
          const cant = parseNum(d.cant);
          if (cant == null || cant < 0) throw new Error(`Cantidad manual no válida en ${f.ref}`);
          if (cant === 0) break;
          const netoManual = parseNum(d.precio);
          const l = f.cantPropuesta > 0 ? propuesta(cant) : pedido(cant);
          if (netoManual != null) {
            // El precio a mano es el neto final. El base no se toca: se cuadra
            // con el descuento. Solo si el neto supera al base (no hay
            // descuento posible) pasa a ser el precio base.
            if (l.precio == null || netoManual > l.precio) { l.precio = netoManual; l.dtos = []; }
            l.importe = red2(netoManual * cant);
          }
          lineas.push(l);
          break;
        }
        default: // aceptar
          if (f.cantPropuesta > 0) lineas.push(propuesta(f.cantPropuesta));
      }
    }
    return { lineas, restos, notas };
  }

  // ── Restos y llegadas posteriores ─────────────────────────────────────────

  /**
   * Reparte lo que llega en un pedido posterior entre los restos abiertos del
   * mismo proveedor, empezando por el más antiguo (FIFO). Es una PROPUESTA:
   * el usuario la confirma o la cambia antes de aplicarla.
   *
   * restos:   [{id, proveedor, ref, pendiente, fecha, cliente}]
   * llegada:  [{ref, cant}]
   * Devuelve  [{restoId, ref, cliente, cant}] y lo que sobra sin dueño.
   */
  function sugerirAsignacion(restos, llegada, proveedor) {
    const abiertos = (restos || [])
      .filter((r) => r.pendiente > 0 && (!proveedor || r.proveedor === proveedor))
      .slice()
      .sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)) || String(x.id).localeCompare(String(y.id)));
    const asignaciones = [];
    const sobrante = [];
    for (const [ref, g] of agrupar(llegada)) {
      let queda = g.cant;
      for (const r of abiertos) {
        if (queda <= 0) break;
        if (normRef(r.ref) !== ref) continue;
        const ya = asignaciones.filter((a) => a.restoId === r.id).reduce((s, a) => s + a.cant, 0);
        const cabe = Math.min(queda, r.pendiente - ya);
        if (cabe <= 0) continue;
        asignaciones.push({ restoId: r.id, ref, cliente: r.cliente, cant: cabe });
        queda -= cabe;
      }
      if (queda > 0) sobrante.push({ ref, cant: queda });
    }
    return { asignaciones, sobrante };
  }

  // ── Descuentos ────────────────────────────────────────────────────────────

  /**
   * Varios descuentos encadenados → uno solo equivalente, sin tocar el precio
   * base. Si el proveedor imprime el subtotal, se cuadra contra ese (absorbe
   * sus redondeos). `residuo` ≠ 0 avisa de que con esos decimales no cuadra.
   */
  function descuentoEquivalente(precioBase, cant, descuentos, opciones) {
    const dec = (opciones && opciones.decimales != null) ? opciones.decimales : 2;
    const bruto = precioBase * cant;
    if (!(bruto > 0)) return { descuento: 0, subtotal: 0, objetivo: 0, residuo: 0 };
    let mult = 1;
    for (const d of descuentos || []) {
      const v = parseNum(d) || 0;
      if (v < 0 || v >= 100) throw new Error('Cada descuento debe estar entre 0 y 100');
      mult *= 1 - v / 100;
    }
    const objetivo = red2(opciones && opciones.subtotalObjetivo != null ? opciones.subtotalObjetivo : bruto * mult);
    const f = Math.pow(10, dec);
    const descuento = Math.round((1 - objetivo / bruto) * 100 * f) / f;
    const subtotal = red2(bruto * (1 - descuento / 100));
    return { descuento, subtotal, objetivo, residuo: red2(subtotal - objetivo) };
  }

  // ── Lectura de la propuesta del proveedor (Excel) ─────────────────────────

  const quitarTildes = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const clave = (s) => quitarTildes(s == null ? '' : s).toUpperCase().replace(/\s+/g, ' ').trim();

  /**
   * Recibe la hoja como matriz (SheetJS sheet_to_json con header:1) y busca la
   * fila de cabecera. Perfil Finocam: «Referencia», «CANT. PEDIDO»,
   * «PTD sin IVA», «EAN13», «Descripción facturas», «% DTO.GLOBAL» arriba y
   * «OBSERVACIONES» con el nº de pedido. Si las columnas tienen otros nombres,
   * prueba sinónimos genéricos.
   *
   * Devuelve las líneas con cantidad (lo que propone el proveedor), el
   * catálogo completo (todas las filas con referencia, también las de
   * cantidad vacía: el formulario de Finocam trae la tarifa entera) y la
   * cabecera que haya.
   */
  function leerPropuesta(filas) {
    // Por prioridad de patrón, no de columna: en el Excel de la herramienta de
    // PDF la primera columna es «Codigo I.S.B.N.» y la referencia buena es
    // «Rfcia. Proveedor», más a la derecha.
    const hallar = (cab, pruebas) => {
      for (const p of pruebas) {
        const i = cab.findIndex((c) => p.test(clave(c)));
        if (i >= 0) return i;
      }
      return -1;
    };
    const hallarTodas = (cab, pruebas) => cab.map((c, i) => (pruebas.some((p) => p.test(clave(c))) ? i : -1)).filter((i) => i >= 0);
    let iCab = -1;
    let col = null;
    for (let i = 0; i < Math.min(filas.length, 60); i++) {
      const cab = filas[i] || [];
      const ref = hallar(cab, [/^REFERENCIA\b/, /^RFCIA/, /^REFCIA/, /^REF\.?\b/, /^ARTICULO\b/, /^CODIGO\b/]);
      const cant = hallar(cab, [/^CANT/, /^PEDIDAS\b/, /^UDES\b/, /^UDS\b/, /^UNIDADES\b/]);
      if (ref >= 0 && cant >= 0) {
        iCab = i;
        col = {
          ref,
          cant,
          desc: hallar(cab, [/^DESCRIPCION/, /^DENOMINACION/, /^CONCEPTO/]),
          ean: hallar(cab, [/^EAN/, /^COD\.? ?BARRAS/, /^CODIGO\s*I\.?\s*S\.?\s*B\.?\s*N/, /^ISBN\b/]),
          precio: hallar(cab, [/^PTD\b/, /^PRECIO\b/, /^P\.? ?UNIT/, /^P\.? ?COSTO/, /^COSTE?\b/, /^COSTO\b/, /^TARIFA\b/, /^UNIDAD$/]),
          // Puede haber varias columnas de descuento encadenadas (Dto. 1, Dto. 2…).
          dtos: hallarTodas(cab, [/^DESC\.? ?LIN/, /^DTO\b/, /^DCTO\b/, /^% ?DTO\b/, /^DESCUENTO\b/]),
          iva: hallar(cab, [/^IVA\b/, /^IGIC\b/]),
          importe: hallar(cab, [/^IMPORTE\b/, /^SUBTOTAL\b/, /^TOTAL\b/, /^NETO\b/]),
          udsCaja: hallar(cab, [/^UDS?\.?\s*(\/|X)\s*CA?JA/, /^UNID\w*\s*(\/|POR)\s*CAJA/]),
        };
        break;
      }
    }
    if (iCab < 0) throw new Error('No encuentro la fila de cabecera (columnas de referencia y cantidad) en la propuesta');

    const cabecera = { dtoGlobal: null, observaciones: '', numeroPedido: null, importeNeto: null };
    for (let i = 0; i < iCab; i++) {
      const f = filas[i] || [];
      for (let j = 0; j < f.length; j++) {
        const k = clave(f[j]);
        const sig = f.slice(j + 1).find((v) => v !== '' && v != null);
        if (/% ?DTO\.? ?GLOBAL/.test(k)) {
          const n = parseNum(sig);
          if (n != null) cabecera.dtoGlobal = n > 0 && n < 1 ? red2(n * 100) : n;
        } else if (/^OBSERVACIONES/.test(k) && sig != null) {
          cabecera.observaciones = String(sig).trim();
        } else if (/IMPORTE PEDIDO NETO/.test(k)) {
          cabecera.importeNeto = parseNum(sig);
        }
      }
    }
    const m = clave(cabecera.observaciones).match(/PEDIDO\s*N\S*\s*(\d+)/);
    if (m) cabecera.numeroPedido = Number(m[1]);

    const val = (f, i) => (i >= 0 ? f[i] : null);
    const lineas = [];
    const catalogo = {};
    for (let i = iCab + 1; i < filas.length; i++) {
      const f = filas[i] || [];
      const ref = normRef(val(f, col.ref));
      if (!ref) continue;
      const desc = String(val(f, col.desc) || '').trim();
      const ean = String(val(f, col.ean) || '').trim();
      const precio = parseNum(val(f, col.precio));
      catalogo[ref] = { d: desc, p: precio, ean };
      const cant = parseNum(val(f, col.cant));
      if (cant) {
        const dtos = col.dtos.map((i) => parseNum(f[i])).filter((n) => n).map((n) => (n > 0 && n < 1 ? red2(n * 100) : n));
        let iva = parseNum(val(f, col.iva));
        if (iva != null && iva > 0 && iva < 1) iva = red2(iva * 100);
        lineas.push({ ref, desc, ean, cant, precio, dtos, iva, importe: parseNum(val(f, col.importe)), udsCaja: parseNum(val(f, col.udsCaja)) });
      }
    }
    return { lineas, catalogo, cabecera };
  }

  // ── Documentos leídos con IA (PDF o foto de un proveedor) ─────────────────

  /**
   * Convierte lo que devuelve la función de lectura en modo 'documento' en
   * líneas como las de leerPropuesta, y comprueba lo leído sin fiarse de ello:
   *  - cada línea cuyo importe no sale de precio × cantidad − descuentos (o
   *    sin referencia, o sin cantidad) queda con `duda` para revisarla;
   *  - la suma de los importes se compara con la base imponible del propio
   *    documento: `control.cuadra` = false → falta o sobra alguna línea, o
   *    hay un importe mal leído.
   */
  function lineasDeDocumento(res) {
    const r = res || {};
    const lineas = (r.lineas || []).map((l) => ({
      ref: normRef(l.referencia),
      ean: String(l.ean || '').replace(/\s+/g, ''),
      desc: String(l.descripcion || '').trim(),
      cant: parseNum(l.cantidad),
      udsCaja: parseNum(l.udsCaja),
      precio: parseNum(l.precio),
      dtos: parseDtos(l.descuentos),
      importe: parseNum(l.importe),
      duda: String(l.duda || '').trim(),
    })).filter((l) => l.ref || l.desc);

    for (const l of lineas) {
      const avisos = [];
      if (!l.ref) avisos.push('sin referencia');
      if (!l.cant) avisos.push('sin cantidad');
      if (l.importe != null && l.precio != null && l.cant) {
        const calc = red2(l.precio * l.cant * l.dtos.reduce((x, d) => x * (1 - d / 100), 1));
        // Hay proveedores que redondean el neto unitario antes de multiplicar:
        // se admite un céntimo por unidad.
        if (Math.abs(calc - l.importe) > 0.02 + 0.01 * l.cant) {
          avisos.push(`el importe ${fmt(l.importe)} no sale de precio × cantidad − descuentos (${fmt(calc)})`);
        }
      }
      if (avisos.length) l.duda = [l.duda, ...avisos].filter(Boolean).join(' · ');
    }

    const suma = red2(lineas.reduce((t, l) => t + (l.importe || 0), 0));
    const base = parseNum(r.baseImponible);
    let dtoGlobal = parseNum(r.dtoGlobal);
    if (dtoGlobal != null && dtoGlobal > 0 && dtoGlobal < 1) dtoGlobal = red2(dtoGlobal * 100);
    let cuadra = null;
    if (base != null) {
      // La base puede ir antes o después del descuento global del documento.
      cuadra = Math.abs(suma - base) <= 0.02 || Boolean(dtoGlobal && Math.abs(red2(suma * (1 - dtoGlobal / 100)) - base) <= 0.02);
    }
    return {
      lineas,
      catalogo: {},
      cabecera: {
        proveedor: String(r.proveedor || '').trim(),
        tipoDocumento: String(r.tipoDocumento || '').trim(),
        numero: String(r.numero || '').trim(),
        fecha: String(r.fecha || '').trim(),
        dtoGlobal: dtoGlobal || null,
        observaciones: [r.pedidoCliente, r.notas].map((x) => String(x || '').trim()).filter(Boolean).join(' · '),
        // «su pedido nº 5» → 5, para asignarlo solo al pedido que toca.
        numeroPedido: (() => {
          const m = String(r.pedidoCliente || '').match(/pedido\D{0,12}?(\d+)/i) || String(r.pedidoCliente || '').match(/^\D*(\d+)\D*$/);
          return m ? Number(m[1]) : null;
        })(),
      },
      control: { sumaLineas: suma, base, cuadra, sinImporte: lineas.filter((l) => l.importe == null).length },
    };
  }

  // ── Excel para Géminis ────────────────────────────────────────────────────

  /**
   * Disposición del Excel de importación. Los artículos empiezan en la fila 11
   * (confirmado por el propietario el 2026-10-02). Las columnas A–N siguen la
   * plantilla «PROPUESTA DE PEDIDO» que entregó; las filas de cabecera 1–10
   * están PENDIENTES de comprobar con un .xls que Géminis haya aceptado: si
   * cambia algo, se toca solo aquí.
   */
  const PLANTILLA_GEMINIS = {
    primeraFila: 11,
    columnas: ['ean', 'desc', 'ref', 'cajas', 'udsCaja', 'cant', 'precio', 'dto', 'igic', 'total', 'bonif', 'sinStock', 'codOfipapel', 'refProveedor'],
    titulos: ['Cod.Barras EAN13', 'DESCRIPCION', 'Rfcia. Proveedor', 'Cajas', 'UdsXCja', 'Pedidas', 'UNIDAD', 'Dcto', 'Igic', 'TOTAL', 'U/Bonifica', 'Sin STOCK', 'Cod. Ofipapel', 'Code/rfcia Provee.'],
  };

  /**
   * Prepara las líneas finales para Géminis: un único descuento por línea
   * (el equivalente a todos los encadenados más el global, si lo hay) sin
   * tocar el precio base, cuadrando contra el importe del proveedor cuando se
   * conoce. `residuo` ≠ 0 en una línea = con esos decimales no cuadra al
   * céntimo, y la página lo enseña antes de exportar.
   */
  function lineasParaGeminis(lineas, opciones) {
    const o = opciones || {};
    const global = parseNum(o.dtoGlobal) || 0;
    return (lineas || []).map((l) => {
      const precio = parseNum(l.precio) || 0;
      const dtos = parseDtos(l.dtos).concat(global ? [global] : []);
      const objetivo = l.importe != null ? red2(l.importe * (global ? 1 - global / 100 : 1)) : null;
      const eq = descuentoEquivalente(precio, l.cant, dtos, { decimales: o.decimales, subtotalObjetivo: objetivo });
      return { ...l, precio, dto: eq.descuento, total: eq.subtotal, residuo: eq.residuo };
    });
  }

  /** Matriz lista para SheetJS (aoa_to_sheet) con cabecera en 1–10 y datos desde la 11. */
  function filasGeminis(lineas, cab, opciones) {
    const P = PLANTILLA_GEMINIS;
    const n = P.columnas.length;
    const vacia = () => new Array(n).fill('');
    const aoa = [];
    for (let i = 0; i < P.primeraFila - 1; i++) aoa.push(vacia());
    aoa[1][1] = 'PROPUESTA DE PEDIDO';
    aoa[1][2] = 'ALMACEN ' + ((cab && cab.almacen) || '');
    aoa[3][1] = 'PROVEEDOR; ' + ((cab && cab.proveedor) || '');
    aoa[3][2] = 'FECHA: ' + ((cab && cab.fecha) || '');
    aoa[5][2] = 'N PEDIDO: ' + ((cab && cab.numero) || '');
    if (cab && cab.observaciones) { aoa[1][5] = 'Observaciones:'; aoa[2][5] = cab.observaciones; }
    aoa[P.primeraFila - 2] = P.titulos.slice();

    const dto = (opciones && opciones.dto) || 0;
    const igic = (opciones && opciones.igic != null) ? opciones.igic : '';
    for (const l of lineas) {
      const precio = l.precio == null ? 0 : l.precio;
      const dtoLinea = l.dto != null ? l.dto : dto;
      const total = l.total != null ? l.total : red2(precio * l.cant * (1 - dtoLinea / 100));
      const v = {
        ean: l.ean || '', desc: l.desc || '', ref: l.ref, cajas: '', udsCaja: l.udsCaja || '', cant: l.cant,
        precio, dto: dtoLinea, igic: l.igic != null ? l.igic : igic, total, bonif: '', sinStock: '', codOfipapel: '', refProveedor: l.ref,
      };
      aoa.push(P.columnas.map((c) => v[c]));
    }
    return aoa;
  }

  const api = {
    TOLERANCIA, PLANTILLA_GEMINIS,
    normRef, parseNum, red2, fmt, agrupar,
    parseDtos, precioNeto, compararPedido, faltasYSobras, sugerenciasCatalogo, accionesPara, sinDecidir, aplicarDecisiones, lineasParaGeminis, lineasDeDocumento,
    sugerirAsignacion, descuentoEquivalente, leerPropuesta, filasGeminis,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.ControlPedidos = api;
})(typeof window !== 'undefined' ? window : globalThis);
