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
        m.set(ref, { ref, desc: '', ean: '', exp: false, cant: 0, precio: null, dtos: [], importe: 0, sinImporte: false, udsCaja: null, unidad: '', veces: 0 });
      }
      const g = m.get(ref);
      g.cant += parseNum(l.cant) || 0;
      g.veces += 1;
      if (l.exp) g.exp = true;
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
        exp: Boolean(a && a.exp),
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

  /**
   * Texto para reclamar al proveedor lo que falta, separado por cliente (o por
   * pedido de reposición). Texto plano, para pegarlo en un correo tal cual.
   * grupos: [{ numero, cliente, faltan: [{ref, desc, cant, de, total}] }]
   */
  function textoReclamacion(proveedor, grupos, opciones) {
    const o = opciones || {};
    const conFaltas = (grupos || []).filter((g) => g.faltan && g.faltan.length);
    if (!conFaltas.length) return '';
    const uds = (n) => `${n} ud${n === 1 ? '' : 's'}.`;
    const out = [
      `Buenos días${proveedor ? ', ' + proveedor : ''}:`,
      '',
      `En ${o.campana ? 'la campaña ' + o.campana : 'los pedidos'} faltan las siguientes referencias que no vienen en vuestra propuesta o factura.`,
      '¿Podéis indicarnos si están descatalogadas, agotadas o si ha sido un error, y cuándo las enviaríais?',
    ];
    for (const g of conFaltas) {
      out.push('', `Pedido nº ${g.numero}${g.cliente ? ' · ' + g.cliente : ''}`);
      for (const x of g.faltan) {
        out.push(`  - ${x.ref}  ${x.desc || ''}  →  faltan ${uds(x.cant)}${x.total ? '' : ` (de ${x.de} pedidas)`}`.replace(/ {2,}→/, '  →'));
      }
    }
    out.push('', 'Gracias.');
    return out.join('\n');
  }

  /**
   * Faltas que siguen PENDIENTES tras las decisiones: las aún sin decidir y
   * las que se ha decidido reclamar al proveedor. Las descartadas (anular,
   * excluir, aceptar menos, mantener…) o dejadas solo en restos ya no cuentan.
   * Cada una lleva `pendiente`: 'decidir' | 'reclamar'.
   */
  function faltasPendientes(filas, decisiones) {
    const accion = (ref) => (decisiones && decisiones[ref] && decisiones[ref].accion) || '';
    const porRef = new Map((filas || []).map((f) => [f.ref, f]));
    return faltasYSobras(filas).faltan
      .map((x) => ({ ...x, pendiente: accion(x.ref) === 'reclamar' ? 'reclamar' : accion(x.ref) ? '' : 'decidir' }))
      .filter((x) => x.pendiente && !(x.pendiente === 'decidir' && porRef.get(x.ref) && !porRef.get(x.ref).revisar));
  }

  /**
   * Último control: la FACTURA FINAL del proveedor frente a lo que se validó.
   * Pasa a menudo que se confirma una propuesta y luego facturan otra cosa
   * (agotados en ese momento): aquí sale qué no ha venido, qué viene sin
   * estar confirmado y qué cambia de precio neto (a partir de 1 céntimo).
   * El descuento global de cabecera (el 30 % de Finocam) se aplica a cada
   * lado por separado: { dtoValidado, dtoFactura } en %.
   */
  function controlFactura(lineasValidadas, lineasFactura, opciones) {
    const o = opciones || {};
    const val = agrupar(lineasValidadas);
    const fac = agrupar(lineasFactura);
    const conGlobal = (neto, dto) => (neto == null ? null : neto * (1 - (parseNum(dto) || 0) / 100));
    const faltan = [];
    const sobran = [];
    const precios = [];
    for (const [ref, a] of val) {
      const b = fac.get(ref);
      const cb = b ? b.cant : 0;
      if (cb < a.cant) faltan.push({ ref, desc: a.desc || (b && b.desc) || '', cant: red2(a.cant - cb), de: a.cant, total: cb === 0 });
      const na = conGlobal(a.neto, o.dtoValidado);
      const nb = b ? conGlobal(b.neto, o.dtoFactura) : null;
      // El descuento global puede venir en la cabecera o ya aplicado en cada
      // línea, y la lectura no siempre lo encuentra: si el precio coincide
      // por cualquiera de los dos caminos, no es un cambio de precio.
      const igual = (x, y) => x != null && y != null && Math.abs(x - y) < 0.01;
      const mismo = b && (igual(na, nb) || igual(a.neto, b.neto) || igual(na, conGlobal(b.neto, o.dtoValidado)));
      if (na != null && nb != null && !mismo) {
        precios.push({ ref, desc: a.desc || b.desc, validado: red2(na), facturado: red2(nb) });
      }
    }
    for (const [ref, b] of fac) {
      const ca = val.has(ref) ? val.get(ref).cant : 0;
      if (b.cant > ca) sobran.push({ ref, desc: b.desc, cant: red2(b.cant - ca), de: b.cant, total: ca === 0 });
    }
    return { faltan, sobran, precios, cuadra: !faltan.length && !sobran.length && !precios.length };
  }

  /**
   * La factura final manda: lo validado que no viene en ella queda en RESTOS
   * del cliente, como si el proveedor no lo tuviera en stock. Devuelve las
   * líneas de resto (cant = lo que falta) con el precio al cliente.
   */
  function restosDeFactura(lineasValidadas, lineasFactura, opciones) {
    const r = controlFactura(lineasValidadas, lineasFactura, opciones);
    const porRef = new Map((lineasValidadas || []).map((l) => [normRef(l.ref), l]));
    return r.faltan.map((x) => {
      const l = porRef.get(normRef(x.ref)) || {};
      return { ref: x.ref, desc: x.desc || l.desc || '', ean: l.ean || '', cant: x.cant,
        precio: l.precioCliente != null ? l.precioCliente : (l.precio != null ? l.precio : null) };
    });
  }

  /**
   * Fotos de un pedido y hojas del talonario: «1/4», «hoja 2 de 4», «3-4»…
   * Devuelve cuántas fotos hay, las hojas leídas, el total que dicen (el
   * mayor) y las que faltan, para avisar si alguna foto se quedó atrás.
   */
  function hojasDelPedido(fotos) {
    const lista = fotos || [];
    const leidas = new Set();
    let total = null;
    for (const f of lista) {
      const m = String(f.hoja || '').match(/(\d+)\s*(?:\/|-|de)\s*(\d+)/i);
      if (!m) continue;
      const n = Number(m[1]); const t = Number(m[2]);
      if (!n || !t || n > t || t > 50) continue;
      leidas.add(n);
      total = Math.max(total || 0, t);
    }
    const faltan = [];
    if (total) for (let k = 1; k <= total; k++) if (!leidas.has(k)) faltan.push(k);
    return { fotos: lista.length, hojas: [...leidas].sort((x, y) => x - y), total, faltan };
  }

  /**
   * Cuánto se parecen dos listas de líneas por sus REFERENCIAS: sirve para
   * saber a qué pedido va una propuesta que no trae nº de pedido ni cliente
   * reconocible (p. ej. las de Miquelrius, con su propio nº «MR23636»).
   * score = referencias comunes / referencias del mayor de los dos (0..1).
   */
  function parecidoLineas(a, b) {
    const ra = new Set([...agrupar(a).keys()]);
    const rb = new Set([...agrupar(b).keys()]);
    let comunes = 0;
    for (const r of ra) if (rb.has(r)) comunes++;
    const mayor = Math.max(ra.size, rb.size);
    return { comunes, deDoc: ra.size, dePedido: rb.size, score: mayor ? comunes / mayor : 0 };
  }

  /**
   * Reparte documentos entre pedidos por contenido, sin repetir pedido:
   * primero las parejas que más se parecen. Solo se asigna con score ≥ 0.5;
   * para el resto devuelve la mejor sugerencia (o ninguna).
   * docs: [{ id, lineas }] · pedidos: [{ id, lineas }]
   * → { asignados: [{docId, pedidoId, ...parecido}], sugerencias: {docId: {pedidoId, ...parecido}} }
   */
  function repartirPorContenido(docs, pedidos, umbral) {
    const minimo = umbral == null ? 0.5 : umbral;
    const pares = [];
    for (const d of docs || []) for (const p of pedidos || []) {
      const x = parecidoLineas(d.lineas, p.lineas);
      if (x.comunes) pares.push({ docId: d.id, pedidoId: p.id, ...x });
    }
    pares.sort((x, y) => y.score - x.score || y.comunes - x.comunes);
    const usadosD = new Set(); const usadosP = new Set();
    const asignados = [];
    const sugerencias = {};
    for (const x of pares) {
      if (!sugerencias[x.docId]) sugerencias[x.docId] = x;
      if (x.score < minimo || usadosD.has(x.docId) || usadosP.has(x.pedidoId)) continue;
      usadosD.add(x.docId); usadosP.add(x.pedidoId);
      asignados.push(x);
    }
    for (const id of usadosD) delete sugerencias[id];
    return { asignados, sugerencias };
  }

  /**
   * Ordena las líneas como vienen en la propuesta/factura del proveedor (el
   * orden en que factura), que es como se quieren subir a Gestión. Las que no
   * están en la propuesta van al final, en su orden de antes.
   */
  function ordenarComoPropuesta(lineas, lineasPropuesta) {
    const pos = new Map();
    (lineasPropuesta || []).forEach((l, i) => { const r = normRef(l.ref); if (r && !pos.has(r)) pos.set(r, i); });
    return (lineas || []).map((l, i) => ({ l, i, p: pos.has(normRef(l.ref)) ? pos.get(normRef(l.ref)) : Infinity }))
      .sort((x, y) => x.p - y.p || x.i - y.i).map((x) => x.l);
  }

  // ── Decisiones ────────────────────────────────────────────────────────────

  /**
   * Acciones posibles por fila. La primera es la sugerida.
   *  - resto:    (solo comercial) no viene o viene menos, y el cliente lo
   *              sigue esperando → RESTOS
   *  - reclamar: (solo comercial) se reclama al proveedor y se espera su
   *              respuesta. NO va a restos: si fue un fallo suyo, lo añade y
   *              la propuesta nueva ya lo trae; si está descatalogado, se
   *              cambia a «anular». Sigue contando como falta pendiente.
   *  - resto:    (solo comercial) el proveedor no tiene stock → RESTOS
   *  - anular:   (solo comercial) descartado para siempre (descatalogado o el
   *              cliente ya no lo quiere)
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
      // Como en el comercial, una falta se puede reclamar al proveedor; lo
      // que nunca hay en reposición es «resto».
      if (fila.estado === 'falta') return ['reclamar', 'excluir', 'mantener', 'manual'];
      if (fila.estado === 'extra') return ['aceptar', 'excluir'];
      return fila.cantPropuesta < fila.cantPedida
        ? ['aceptar', 'reclamar', 'mantener', 'manual', 'excluir']
        : ['aceptar', 'mantener', 'manual', 'excluir'];
    }
    if (fila.estado === 'falta') return ['reclamar', 'resto', 'anular'];
    if (fila.estado === 'extra') return ['aceptar', 'excluir'];
    const menos = fila.cantPropuesta < fila.cantPedida;
    return menos ? ['aceptar', 'reclamar', 'resto', 'mantener', 'manual', 'excluir'] : ['aceptar', 'mantener', 'manual', 'excluir'];
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
   *
   * Pedidos del COMERCIAL (opciones.comercial): hay dos precios distintos.
   *  - precioCliente: el que se decide aquí («Mantener lo pedido» = lo que
   *    apuntó el comercial, «Aceptar propuesta» = el del proveedor, «a mano»
   *    = el escrito). Es el del listado del cliente.
   *  - precio / dtos / importe: el COSTE, siempre el que factura el proveedor
   *    cuando lo trae. Es el que va al Excel de Géminis (pedido de compra):
   *    meter ahí el precio al cliente falsearía el coste y el margen.
   */
  function aplicarDecisiones(filas, decisiones, opciones) {
    const comercial = Boolean(opciones && opciones.comercial);
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
      const base = { ref: f.ref, desc: f.desc, ean: f.ean, exp: Boolean(f.exp) };
      const propuesta = (cant) => ({ ...base, cant, precio: f.precioPropuesta, dtos: f.dtosPropuesta,
        importe: cant === f.cantPropuesta ? f.importePropuesta : null, udsCaja: f.udsCajaPropuesta || f.udsCajaPedido });
      const pedido = (cant) => (f.precioPedido != null
        ? { ...base, cant, precio: f.precioPedido, dtos: f.dtosPedido, importe: null, udsCaja: f.udsCajaPedido || f.udsCajaPropuesta }
        : propuesta(cant));
      const desde = lineas.length;
      let precioClienteManual = null;
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
        case 'reclamar': // a la espera del proveedor: entra lo que trae, sin restos
          if (f.cantPropuesta > 0) lineas.push(propuesta(f.cantPropuesta));
          break;
        case 'mantener':
          if (f.cantPedida > 0) lineas.push(pedido(f.cantPedida));
          break;
        case 'manual': {
          const cant = parseNum(d.cant);
          if (cant == null || cant < 0) throw new Error(`Cantidad manual no válida en ${f.ref}`);
          if (cant === 0) break;
          const netoManual = parseNum(d.precio);
          precioClienteManual = netoManual;
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
      if (comercial) {
        for (const l of lineas.slice(desde)) {
          l.precioCliente = precioClienteManual != null ? precioClienteManual : l.precio;
          if (f.precioPropuesta != null) {
            l.precio = f.precioPropuesta;
            l.dtos = f.dtosPropuesta;
            l.importe = l.cant === f.cantPropuesta ? f.importePropuesta : null;
          }
        }
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

  // ── Nube: datos compartidos entre dispositivos ────────────────────────────
  // El estado se reparte en documentos (uno por pedido, resto, nota, catálogo
  // de proveedor e historial de proveedor). Cada dispositivo recuerda, por
  // documento, la versión de la nube que tiene y su firma en ese momento: si
  // la firma actual es otra, hay un cambio suyo pendiente de subir.

  const COLECCIONES_LISTA = ['pedidos', 'restos', 'notas'];
  const COLECCIONES_MAPA = ['catalogos', 'historial'];

  /** JSON con las claves ordenadas: la nube (jsonb) no conserva su orden. */
  function firma(v) {
    if (v === undefined) return 'null';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map((x) => (x === undefined ? 'null' : firma(x))).join(',') + ']';
    return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + firma(v[k])).join(',') + '}';
  }

  /** Map 'coleccion/id' → {coleccion, id, datos}. */
  function documentosDe(E) {
    const docs = new Map();
    for (const c of COLECCIONES_LISTA) for (const x of (E[c] || [])) if (x && x.id) docs.set(c + '/' + x.id, { coleccion: c, id: String(x.id), datos: x });
    for (const c of COLECCIONES_MAPA) for (const [k, v] of Object.entries(E[c] || {})) docs.set(c + '/' + k, { coleccion: c, id: k, datos: v });
    return docs;
  }

  /** Pone (o quita, con datos null) un documento en el estado. */
  function aplicarDocumento(E, coleccion, id, datos) {
    if (COLECCIONES_LISTA.includes(coleccion)) {
      const lista = E[coleccion] = E[coleccion] || [];
      const i = lista.findIndex((x) => String(x.id) === String(id));
      if (datos == null) { if (i >= 0) lista.splice(i, 1); }
      else if (i >= 0) lista[i] = datos;
      else lista.push(datos);
    } else if (COLECCIONES_MAPA.includes(coleccion)) {
      const mapa = E[coleccion] = E[coleccion] || {};
      if (datos == null) delete mapa[id]; else mapa[id] = datos;
    }
  }

  /**
   * Lo que hay que subir: documentos nuevos o cambiados desde la última vez
   * que coincidieron con la nube, y los borrados (estaban y ya no están).
   * meta: {'col/id': {v: versión en la nube, f: firma entonces, borrado}}
   */
  function cambiosPendientes(E, meta) {
    const m = meta || {};
    const docs = documentosDe(E);
    const out = [];
    for (const [k, d] of docs) {
      const f = firma(d.datos);
      const prev = m[k];
      if (!prev || prev.borrado || prev.f !== f) out.push({ coleccion: d.coleccion, id: d.id, datos: d.datos, version: prev ? prev.v : null, borrado: false, firma: f });
    }
    for (const [k, prev] of Object.entries(m)) {
      if (docs.has(k) || prev.borrado) continue;
      const i = k.indexOf('/');
      out.push({ coleccion: k.slice(0, i), id: k.slice(i + 1), datos: null, version: prev.v, borrado: true, firma: 'null' });
    }
    return out;
  }

  /**
   * Respuesta de la nube a una subida: lo aceptado queda al día; si otro
   * dispositivo lo cambió antes, manda la nube y lo nuestro se aparta como
   * conflicto (no se pierde). Devuelve {cambiado, conflictos}.
   */
  function integrarSubida(E, meta, enviados, respuestas) {
    const porClave = new Map(enviados.map((d) => [d.coleccion + '/' + d.id, d]));
    let cambiado = false;
    const conflictos = [];
    for (const r of respuestas || []) {
      const k = r.coleccion + '/' + r.id;
      const d = porClave.get(k);
      if (!d) continue;
      if (r.ok) { meta[k] = { v: r.version, f: d.firma, borrado: d.borrado }; continue; }
      if (r.version == null) { delete meta[k]; continue; } // ya no existe en la nube: se sube como nuevo en la próxima vuelta
      // Si lo que hay en la nube es justo lo nuestro (subida repetida), no hay conflicto.
      if (firma(r.borrado ? null : r.datos) === d.firma) { meta[k] = { v: r.version, f: d.firma, borrado: !!r.borrado }; continue; }
      conflictos.push({ coleccion: r.coleccion, id: r.id, nuestro: d.datos, suyo: r.borrado ? null : r.datos, autor: r.autor || '', fecha: r.actualizado || '' });
      aplicarDocumento(E, r.coleccion, r.id, r.borrado ? null : r.datos);
      meta[k] = { v: r.version, f: firma(r.borrado ? null : r.datos), borrado: !!r.borrado };
      cambiado = true;
    }
    return { cambiado, conflictos };
  }

  /**
   * Lo que llega de la nube (filas de cp_docs). Si ese documento no tiene
   * cambios nuestros sin subir, se aplica; si los tiene, también manda la
   * nube y lo nuestro se aparta como conflicto. Devuelve {cambiado, conflictos}.
   */
  function integrarBajada(E, meta, filas) {
    let cambiado = false;
    const conflictos = [];
    const actuales = documentosDe(E);
    for (const r of filas || []) {
      const k = r.coleccion + '/' + r.id;
      const prev = meta[k];
      if (prev && prev.v >= r.version) continue; // ya la teníamos
      const local = actuales.get(k);
      const fLocal = local ? firma(local.datos) : 'null';
      const remoto = r.borrado ? null : r.datos;
      const fRemoto = firma(remoto);
      const pendiente = prev ? (prev.borrado ? !!local : prev.f !== fLocal) : !!local;
      if (pendiente && fLocal !== fRemoto) {
        conflictos.push({ coleccion: r.coleccion, id: r.id, nuestro: local ? local.datos : null, suyo: remoto, autor: r.autor || '', fecha: r.actualizado || '' });
      }
      if (fLocal !== fRemoto) { aplicarDocumento(E, r.coleccion, r.id, remoto); cambiado = true; }
      meta[k] = { v: r.version, f: fRemoto, borrado: !!r.borrado };
    }
    return { cambiado, conflictos };
  }

  const api = {
    TOLERANCIA, PLANTILLA_GEMINIS,
    firma, documentosDe, aplicarDocumento, cambiosPendientes, integrarSubida, integrarBajada,
    normRef, parseNum, red2, fmt, agrupar,
    parseDtos, precioNeto, compararPedido, faltasYSobras, faltasPendientes, controlFactura, restosDeFactura, hojasDelPedido, ordenarComoPropuesta, parecidoLineas, repartirPorContenido, textoReclamacion, sugerenciasCatalogo, accionesPara, sinDecidir, aplicarDecisiones, lineasParaGeminis, lineasDeDocumento,
    sugerirAsignacion, descuentoEquivalente, leerPropuesta, filasGeminis,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.ControlPedidos = api;
})(typeof window !== 'undefined' ? window : globalThis);
