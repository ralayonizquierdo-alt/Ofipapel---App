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
  /** Clave para EMPAREJAR referencias: una referencia solo de cifras vale lo
   *  mismo con o sin ceros delante (Géminis «00839» = factura «000000839»).
   *  Solo para comparar: lo que se guarda y se exporta sigue siendo normRef. */
  function claveRef(ref) {
    const r = normRef(ref);
    return /^\d+$/.test(r) ? (r.replace(/^0+/, '') || '0') : r;
  }

  // ── Altas nuevas ──────────────────────────────────────────────────────────
  // Lo que aún no está dado de alta en Géminis va con la referencia «2 ALTA
  // NUEVA» y, en la descripción, la referencia del proveedor seguida de «>»
  // («UA000570>MALETIN…», «UA000710 / UA000720>TRAVEL SET», «VL000011 Caja…»).
  // Para comparar se usa ese código (o la suma de varios); al Excel de Géminis
  // vuelve a salir «2 ALTA NUEVA» con la descripción tal cual.
  const REF_ALTA = '2 ALTA NUEVA';
  function codigosAlta(desc) {
    const d = String(desc || '');
    const cabeza = d.includes('>') ? d.split('>')[0] : d.trim().split(/\s+/)[0];
    return cabeza.split('/').map((t) => normRef(t)).filter((t) => /^[A-Z0-9][A-Z0-9.-]{2,}$/.test(t) && /\d/.test(t) && /[A-Z]/.test(t));
  }
  /** Una línea con «2 ALTA NUEVA» → ref = código(s) del proveedor (unidos con «+»), alta = true y descAlta = la descripción original. */
  function marcarAlta(l) {
    if (!l || l.alta) return l;
    let r = normRef(l.ref);
    let desc = String(l.desc || '');
    // Leídas antes del arreglo: referencia «2» y la descripción empezando por «ALTA NUEVA».
    if (r === '2' && /^\s*ALTA\s*NUEVA\b/i.test(desc)) { desc = desc.replace(/^\s*ALTA\s*NUEVA\s*/i, ''); r = '2ALTANUEVA'; }
    if (!/^2?ALTANUEVA$/.test(r)) return l;
    const cods = codigosAlta(desc);
    return { ...l, ref: cods.length ? cods.join('+') : 'ALTA-' + claveDesc(desc), desc, alta: true, descAlta: desc };
  }
  /** Código del proveedor → clave de la línea de alta que lo agrupa (para las que juntan varios). */
  function aliasAltas(lineas) {
    const m = new Map();
    for (const l of lineas || []) {
      if (!l || !l.alta || !String(l.ref).includes('+')) continue;
      for (const c of String(l.ref).split('+')) m.set(claveRef(c), claveRef(l.ref));
    }
    return m;
  }
  /** Líneas de un documento del proveedor con las de nuestras altas que juntan varios códigos fundidas en una (para el Excel de la factura final). */
  function fusionarAltas(lineasDoc, lineasNuestras) {
    const alias = aliasAltas(lineasNuestras);
    const info = new Map((lineasNuestras || []).filter((l) => l && l.alta).map((l) => [claveRef(l.ref), l]));
    const out = [];
    const grupos = new Map();
    for (const l of lineasDoc || []) {
      const k = alias.get(claveRef(l.ref)) || claveRef(l.ref);
      const nuestra = info.get(k);
      if (!nuestra) { out.push(l); continue; }
      if (!grupos.has(k)) {
        const g = { ...l, ref: nuestra.ref, alta: true, descAlta: nuestra.descAlta, cant: parseNum(l.cant) || 0, importe: parseNum(l.importe) };
        grupos.set(k, g); out.push(g); continue;
      }
      const g = grupos.get(k);
      g.cant += parseNum(l.cant) || 0;
      g.importe = g.importe != null && parseNum(l.importe) != null ? red2(g.importe + parseNum(l.importe)) : null;
    }
    return out;
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

  function agrupar(lineas, alias) {
    const m = new Map();
    for (const l of lineas || []) {
      let ref = claveRef(l.ref);
      if (alias && alias.has(ref)) ref = alias.get(ref);
      if (!ref) continue;
      if (!m.has(ref)) {
        m.set(ref, { ref: normRef(l.ref), desc: '', ean: '', exp: false, cant: 0, precio: null, dtos: [], importe: 0, sinImporte: false, udsCaja: null, unidad: '', veces: 0 });
      }
      const g = m.get(ref);
      g.cant += parseNum(l.cant) || 0;
      g.veces += 1;
      if (l.exp) g.exp = true;
      if (l.alta) { g.alta = true; g.descAlta = l.descAlta; }
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
    // Proveedor de netos con margen (tarifa con % de beneficio o incremento): el
    // comercial apunta precio de VENTA, así que se compara con el neto del
    // proveedor llevado a venta con el mismo ajuste (ventaPropuesta).
    // Con «tarifa» (Miquelrius) el comercial apunta el precio de tarifa del
    // proveedor, antes de sus descuentos: se compara con ese, no con el neto.
    const ajuste = o.ajusteVenta && (o.ajusteVenta.modo === 'tarifa' || (o.ajusteVenta.modo && o.ajusteVenta.modo !== 'ninguno' && parseNum(o.ajusteVenta.pct))) ? o.ajusteVenta : null;
    const ped = agrupar(lineasPedido);
    const pro = agrupar(lineasPropuesta, aliasAltas(lineasPedido));
    const claves = [...ped.keys(), ...[...pro.keys()].filter((r) => !ped.has(r))];
    // Catálogo e historial por clave (sin ceros delante en las numéricas).
    const cat = catalogo ? new Map(Object.keys(catalogo).map((k) => [claveRef(k), catalogo[k]])) : null;
    const ant = new Map(Object.keys(anteriores).map((k) => [claveRef(k), anteriores[k]]));

    const filas = claves.map((clave) => {
      const a = ped.get(clave);
      const b = pro.get(clave);
      // La referencia que se enseña y con la que se decide es la de nuestro pedido.
      const ref = (a || b).ref;
      const enCat = cat && cat.get(clave);
      const fila = {
        ref,
        desc: (b && b.desc) || (enCat && enCat.d) || (a && a.desc) || '',
        ean: (b && b.ean) || (a && a.ean) || (enCat && enCat.ean) || '',
        exp: Boolean(a && a.exp),
        alta: Boolean(a && a.alta),
        descAlta: (a && a.descAlta) || '',
        cantPedida: a ? a.cant : 0,
        cantPropuesta: b ? b.cant : 0,
        precioPedido: a ? a.precio : null,
        precioPropuesta: b ? b.precio : null,
        dtosPedido: a ? a.dtos : [],
        dtosPropuesta: b ? b.dtos : [],
        netoPedido: a ? a.neto : null,
        netoPropuesta: b ? b.neto : null,
        ventaPropuesta: !b || !ajuste ? null : ajuste.modo === 'tarifa' ? (b.precio != null ? b.precio : null) : b.neto != null ? precioVenta(b.neto, ajuste) : null,
        ajusteVenta: ajuste,
        importePropuesta: b ? b.importe : null,
        udsCajaPedido: a ? a.udsCaja : null,
        udsCajaPropuesta: b ? b.udsCaja : null,
        precioDeHistorial: false,
        difPrecio: null,
        difPrecioPct: null,
        motivos: [],
        estado: 'ok',
        revisar: false,
        enCatalogo: catalogo ? Boolean(enCat) : null,
        sugerencias: [],
      };

      if (a && a.veces > 1) fila.motivos.push({ tipo: 'duplicada_pedido', texto: `Aparece ${a.veces} veces en el pedido (se suman)`, revisar: true });
      // Un alta que junta varios códigos del proveedor viene, a propósito, en varias líneas.
      if (b && b.veces > 1 && !(a && a.alta && String(a.ref).includes('+'))) fila.motivos.push({ tipo: 'duplicada_propuesta', texto: `Aparece ${b.veces} veces en la propuesta (se suman)`, revisar: true });

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
        const ahora = fila.ventaPropuesta != null ? fila.ventaPropuesta : neto ? b.neto : b.precio;
        if (antes == null && ant.get(clave) != null) { antes = ant.get(clave); fila.precioDeHistorial = true; }
        fila.precioReferencia = antes;
        if (antes != null && ahora != null && red2(antes) !== red2(ahora)) {
          const dif = red2(ahora - antes);
          fila.difPrecio = dif;
          fila.difPrecioPct = antes ? red2((dif / antes) * 100) : null;
          const fuera = Math.abs(dif) > tol + 1e-9;
          fila.estado = 'cambio';
          fila.motivos.push({
            tipo: 'precio',
            texto: `${fila.ventaPropuesta != null ? (ajuste.modo === 'tarifa' ? 'Precio de tarifa' : 'Precio de venta') : neto ? 'Precio neto' : 'Precio'} ${fmt(antes)} → ${fmt(ahora)} (${dif > 0 ? '+' : ''}${fmt(dif)})` +
              (fila.ventaPropuesta != null ? (ajuste.modo === 'tarifa' ? ` · neto del proveedor ${fmt(b.neto)}` : ` · coste del proveedor ${fmt(b.neto)} con ${textoAjuste(ajuste)}`) : '') +
              (fila.precioDeHistorial ? ' respecto al último precio aceptado' : ''),
            revisar: fuera,
            informativo: !fuera,
          });
        }
      }

      if (catalogo && !fila.enCatalogo && a) {
        fila.sugerencias = sugerenciasCatalogo(ref, catalogo);
        // Si el proveedor la trae en su propuesta, existe: la tarifa guardada puede
        // ser antigua (lo que manda es la última propuesta). Solo se avisa.
        fila.motivos.push(b
          ? { tipo: 'no_catalogo', texto: 'No está en la tarifa guardada del proveedor (puede ser una referencia nueva)', revisar: false, informativo: true }
          : { tipo: 'no_catalogo', texto: 'La referencia no existe en el catálogo del proveedor: posible error de lectura', revisar: true });
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
    const lista = (g, k) => (g && g[k]) || [];
    const conAlgo = (grupos || []).filter((g) => lista(g, 'faltan').length || lista(g, 'sobran').length || lista(g, 'precios').length);
    if (!conAlgo.length) return '';
    const uds = (n) => `${n} ud${n === 1 ? '' : 's'}.`;
    const donde = o.campana ? 'los pedidos de la campaña ' + o.campana : conAlgo.length === 1 ? 'nuestro pedido' : 'nuestros pedidos';
    // Texto general: el motivo concreto va en cada referencia (puede ser una
    // falta, algo de más o sin pedir, un precio que no cuadra…).
    const out = [`Buenos días${proveedor ? ', ' + proveedor : ''}:`, '',
      `Al revisar vuestra propuesta o factura de ${donde} hemos encontrado las siguientes diferencias. Os indicamos el motivo en cada referencia:`];
    for (const g of conAlgo) {
      const num = g.numero && g.numero !== '—' ? `Pedido nº ${g.numero}` : 'Pedido';
      out.push('', `${num}${g.cliente ? ' · ' + g.cliente : ''}`);
      // Una línea por referencia, con todos sus motivos (p. ej. de más y además otro precio).
      const porRef = new Map();
      const de = (x) => {
        if (!porRef.has(x.ref)) porRef.set(x.ref, { ref: x.ref, desc: x.desc || '', motivos: [], nota: '' });
        const r = porRef.get(x.ref);
        if (x.nota) r.nota = x.nota;
        return r;
      };
      for (const x of lista(g, 'faltan')) {
        de(x).motivos.push(x.total
          ? `no viene (pedimos ${uds(x.cant)}): ¿está descatalogada, agotada o es un error? ¿Cuándo la enviaríais?`
          : `faltan ${uds(x.cant)} (pedimos ${x.de}, vienen ${x.de - x.cant})`);
      }
      for (const x of lista(g, 'sobran')) {
        de(x).motivos.push(x.total
          ? `no la hemos pedido (${uds(x.cant)}): no la incluyáis`
          : `viene de más: ${uds(x.cant)} (pedimos ${x.de - x.cant}, vienen ${x.de}): corregid la cantidad`);
      }
      for (const x of lista(g, 'precios')) {
        de(x).motivos.push(`el precio neto no cuadra: ${fmt(x.ahora)} € por unidad en lugar de ${fmt(x.antes)} €`);
      }
      for (const r of porRef.values()) {
        const motivo = r.motivos.join('; ') || 'revisadla, por favor';
        out.push(`  - ${r.ref}  ${r.desc}  →  ${motivo}`.replace(/ {2,}→/, '  →') + (r.nota ? `\n      Nota: ${r.nota}` : ''));
      }
    }
    out.push('', 'Quedamos a la espera de vuestra respuesta para corregirlo. Gracias.');
    return out.join('\n');
  }

  /**
   * Lo que se ha decidido «Reclamar al proveedor» en un pedido, por tipo:
   * faltas, lo que viene de más o sin pedir, y precios que no cuadran. Cada
   * cosa lleva la nota que se haya escrito para el proveedor (`motivo`).
   */
  function aReclamar(filas, decisiones) {
    const dec = (ref) => (decisiones && decisiones[ref]) || {};
    const reclamada = (x) => dec(x.ref).accion === 'reclamar';
    const nota = (x) => ({ ...x, nota: String(dec(x.ref).motivo || '').trim() });
    const { faltan, sobran } = faltasYSobras(filas);
    const precios = (filas || []).filter((f) => reclamada(f) && f.difPrecio != null && f.precioReferencia != null)
      .map((f) => (f.ventaPropuesta != null && f.ajusteVenta.modo !== 'tarifa'
        // Con margen: al proveedor se le habla en coste — el que esperábamos
        // (el precio apuntado, sin el margen) frente al neto que propone.
        ? { ref: f.ref, desc: f.desc, antes: precioCoste(f.precioReferencia, f.ajusteVenta), ahora: f.netoPropuesta }
        : { ref: f.ref, desc: f.desc, antes: f.precioReferencia, ahora: red2(f.precioReferencia + f.difPrecio) }));
    return { faltan: faltan.filter(reclamada).map(nota), sobran: sobran.filter(reclamada).map(nota), precios: precios.map(nota) };
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
    const fac = agrupar(lineasFactura, aliasAltas(lineasValidadas));
    const conGlobal = (neto, dto) => (neto == null ? null : neto * (1 - (parseNum(dto) || 0) / 100));
    const faltan = [];
    const sobran = [];
    const precios = [];
    for (const [k, a] of val) {
      const ref = a.ref;
      const b = fac.get(k);
      const cb = b ? b.cant : 0;
      if (cb < a.cant) faltan.push({ ref, k, desc: a.desc || (b && b.desc) || '', cant: red2(a.cant - cb), de: a.cant, total: cb === 0 });
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
    for (const [k, b] of fac) {
      const ref = b.ref;
      const ca = val.has(k) ? val.get(k).cant : 0;
      if (b.cant > ca) sobran.push({ ref, k, desc: b.desc, cant: red2(b.cant - ca), de: b.cant, total: ca === 0 });
    }
    // Misma mercancía facturada con otra referencia (93-07 → 93M-07): si una
    // que no viene y una de más tienen el mismo EAN o la misma descripción
    // completa y la misma cantidad, no es una falta ni una sobra, es un cambio
    // de referencia (solo si el emparejamiento es único).
    const descLarga = (d) => String(d || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');
    const misma = (x, y) => {
      const ea = (val.get(x.k) || {}).ean; const eb = (fac.get(y.k) || {}).ean;
      if (ea && eb) return String(ea) === String(eb);
      const da = descLarga(x.desc); return da.length >= 8 && da === descLarga(y.desc);
    };
    const cambiosRef = [];
    for (const x of faltan.slice()) {
      if (!x.total) continue;
      const cand = sobran.filter((y) => y.total && y.cant === x.cant && misma(x, y));
      if (cand.length !== 1 || faltan.filter((z) => z.total && z.cant === x.cant && misma(z, cand[0])).length !== 1) continue;
      const y = cand[0];
      faltan.splice(faltan.indexOf(x), 1);
      sobran.splice(sobran.indexOf(y), 1);
      cambiosRef.push({ ref: x.ref, refFactura: y.ref, desc: x.desc || y.desc, cant: x.cant });
      const na = conGlobal(val.get(x.k).neto, o.dtoValidado);
      const nb = conGlobal(fac.get(y.k).neto, o.dtoFactura);
      const igual = (p, q) => p != null && q != null && Math.abs(p - q) < 0.01;
      if (na != null && nb != null && !(igual(na, nb) || igual(val.get(x.k).neto, fac.get(y.k).neto) || igual(na, conGlobal(fac.get(y.k).neto, o.dtoValidado)))) {
        precios.push({ ref: `${x.ref} → ${y.ref}`, desc: x.desc || y.desc, validado: red2(na), facturado: red2(nb) });
      }
    }
    // Sustituciones que decide el usuario (el proveedor manda otro artículo en
    // lugar del pedido: calendario de pared → de sobremesa): `sustituciones`
    // { refValidada: refFacturada }. Lo que cubre deja de faltar y de sobrar.
    for (const [rv, rf] of Object.entries(o.sustituciones || {})) {
      const x = faltan.find((z) => z.k === claveRef(rv));
      const y = sobran.find((z) => z.k === claveRef(rf));
      if (!x || !y) continue;
      const q = Math.min(x.cant, y.cant);
      x.cant = red2(x.cant - q); y.cant = red2(y.cant - q);
      if (!x.cant) faltan.splice(faltan.indexOf(x), 1);
      if (!y.cant) sobran.splice(sobran.indexOf(y), 1);
      cambiosRef.push({ ref: x.ref, refFactura: y.ref, desc: `${x.desc} → ${y.desc}`, cant: q, manual: true });
    }
    return { faltan, sobran, precios, cambiosRef, cuadra: !faltan.length && !sobran.length && !precios.length };
  }

  /**
   * La factura final manda: lo validado que no viene en ella queda en RESTOS
   * del cliente, como si el proveedor no lo tuviera en stock. Devuelve las
   * líneas de resto (cant = lo que falta) con el precio al cliente.
   */
  function restosDeFactura(lineasValidadas, lineasFactura, opciones) {
    const r = controlFactura(lineasValidadas, lineasFactura, opciones);
    const porRef = new Map((lineasValidadas || []).map((l) => [claveRef(l.ref), l]));
    return r.faltan.map((x) => {
      const l = porRef.get(claveRef(x.ref)) || {};
      return { ref: x.ref, desc: x.desc || l.desc || '', ean: l.ean || '', cant: x.cant,
        precio: l.precioCliente != null ? l.precioCliente : (l.precio != null ? l.precio : null) };
    });
  }

  /**
   * Fotos de un pedido y hojas del talonario: «1/4», «hoja 2 de 4», «3-4»…
   * Devuelve cuántas fotos hay, las hojas leídas, el total que dicen (el
   * mayor) y las que faltan, para avisar si alguna foto se quedó atrás.
   */
  /**
   * Fotos del pedido que son la misma hoja subida dos veces, por su CONTENIDO
   * (mismas referencias y cantidades), aunque no traigan nº de hoja: las
   * fotos de WhatsApp o del talonario sin «1/2» se colaban (nº 5 de Miquelrius,
   * 21/10/2026). Devuelve [{ foto, igualA }] con la segunda de cada pareja.
   */
  function firmaLineas(lineas) {
    return (lineas || []).map((l) => `${claveRef(l.ref)}x${parseNum(l.cant) || 0}`).sort().join(' ');
  }
  function fotosRepetidas(lineas) {
    const porFoto = new Map();
    for (const l of lineas || []) {
      if (!l.foto) continue;
      if (!porFoto.has(l.foto)) porFoto.set(l.foto, []);
      porFoto.get(l.foto).push(l);
    }
    const vistas = new Map();
    const out = [];
    for (const [foto, ls] of porFoto) {
      const f = firmaLineas(ls);
      if (!f) continue;
      if (vistas.has(f)) out.push({ foto, igualA: vistas.get(f) }); else vistas.set(f, foto);
    }
    return out;
  }

  function hojasDelPedido(fotos, totalAMano) {
    const lista = fotos || [];
    // Si el usuario ha dicho cuántas hojas tiene el pedido, eso manda sobre lo
    // leído (la lectura puede equivocarse: «2/3» en un pedido de dos hojas).
    const fijo = Number(totalAMano) > 0 && Number(totalAMano) <= 50 ? Math.floor(Number(totalAMano)) : null;
    const leidas = new Set();
    const vistas = new Set(), repetidas = new Set();
    let total = null;
    for (const f of lista) {
      const m = String(f.hoja || '').match(/(\d+)\s*(?:\/|-|de)\s*(\d+)/i);
      if (!m) continue;
      const n = Number(m[1]); const t = Number(m[2]);
      if (!n || !t || n > t || t > 50) continue;
      leidas.add(n);
      // La misma hoja subida dos veces duplica sus líneas (y salen faltas que no lo son).
      if (vistas.has(n + '/' + t)) repetidas.add(n); else vistas.add(n + '/' + t);
      total = Math.max(total || 0, t);
    }
    if (fijo) { total = fijo; for (const n of [...leidas]) if (n > fijo) leidas.delete(n); }
    const faltan = [];
    if (total) for (let k = 1; k <= total; k++) if (!leidas.has(k)) faltan.push(k);
    return { fotos: lista.length, hojas: [...leidas].sort((x, y) => x - y), total, faltan, aMano: Boolean(fijo), repetidas: [...repetidas].sort((x, y) => x - y) };
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
    const alias = aliasAltas(lineas);
    (lineasPropuesta || []).forEach((l, i) => { let r = claveRef(l.ref); if (alias.has(r)) r = alias.get(r); if (r && !pos.has(r)) pos.set(r, i); });
    return (lineas || []).map((l, i) => ({ l, i, p: pos.has(claveRef(l.ref)) ? pos.get(claveRef(l.ref)) : Infinity }))
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
    const acc = accionesBase(fila, tipo);
    // Un precio que no cuadra también se reclama (2026-10-19).
    if (fila.difPrecio != null && !acc.includes('reclamar')) acc.splice(1, 0, 'reclamar');
    return acc;
  }
  function accionesBase(fila, tipo) {
    if (tipo === 'reposicion') {
      // Como en el comercial, una falta se puede reclamar al proveedor; lo
      // que nunca hay en reposición es «resto».
      if (fila.estado === 'falta') return ['reclamar', 'excluir', 'mantener', 'manual'];
      if (fila.estado === 'extra') return ['aceptar', 'reclamar', 'excluir'];
      return fila.cantPropuesta !== fila.cantPedida
        ? ['aceptar', 'reclamar', 'mantener', 'manual', 'excluir']
        : ['aceptar', 'mantener', 'manual', 'excluir'];
    }
    if (fila.estado === 'falta') return ['reclamar', 'resto', 'anular'];
    // Lo que viene sin pedirse, o de más, también se puede reclamar al proveedor.
    if (fila.estado === 'extra') return ['aceptar', 'reclamar', 'excluir'];
    const menos = fila.cantPropuesta < fila.cantPedida;
    if (menos) return ['aceptar', 'reclamar', 'resto', 'mantener', 'manual', 'excluir'];
    return fila.cantPropuesta > fila.cantPedida ? ['aceptar', 'reclamar', 'mantener', 'manual', 'excluir'] : ['aceptar', 'mantener', 'manual', 'excluir'];
  }

  /**
   * Al sustituir la propuesta por otra nueva del proveedor: las decisiones de
   * las referencias cuya línea del proveedor no cambia (misma cantidad y mismo
   * precio neto, o ausente en las dos) se mantienen; las demás se quitan para
   * volver a decidirlas (un «Descartar» de algo que ahora sí viene, o una
   * cantidad a mano de antes, ya no valen). La nota de facturación se conserva.
   * Devuelve { decisiones, quitadas: [ref] }.
   */
  function decisionesQueSiguen(lineasAntes, lineasAhora, decisiones) {
    const a = agrupar(lineasAntes);
    const b = agrupar(lineasAhora);
    const igual = (x, y) => (!x && !y) || (x && y && x.cant === y.cant && red2(x.neto) === red2(y.neto));
    const salida = {};
    const quitadas = [];
    for (const [ref, d] of Object.entries(decisiones || {})) {
      const k = claveRef(ref);
      if (!d || !d.accion || igual(a.get(k), b.get(k))) { salida[ref] = d; continue; }
      quitadas.push(ref);
      if (d.nota) salida[ref] = { nota: d.nota };
    }
    return { decisiones: salida, quitadas };
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
   *    apuntó el comercial, «Aceptar propuesta» = el NETO del proveedor, tras
   *    los descuentos de cada línea y sin el global; «a mano» = el escrito).
   *    Es el del listado del cliente: el comercial nunca trabaja con descuentos.
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
      const base = { ref: f.ref, desc: f.desc, ean: f.ean, exp: Boolean(f.exp), ...(f.alta ? { alta: true, descAlta: f.descAlta } : {}) };
      // _neto: el precio neto de esa línea (tras sus descuentos), para el precio al cliente.
      const propuesta = (cant) => ({ ...base, cant, precio: f.precioPropuesta, dtos: f.dtosPropuesta,
        importe: cant === f.cantPropuesta ? f.importePropuesta : null, udsCaja: f.udsCajaPropuesta || f.udsCajaPedido,
        _neto: f.ventaPropuesta != null ? f.ventaPropuesta : f.netoPropuesta });
      const pedido = (cant) => (f.precioPedido != null
        ? { ...base, cant, precio: f.precioPedido, dtos: f.dtosPedido, importe: null, udsCaja: f.udsCajaPedido || f.udsCajaPropuesta, _neto: f.netoPedido }
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
        case 'reclamar': { // a la espera del proveedor: entra lo que trae, sin restos;
          // si trae de más (o algo no pedido), solo entra lo pedido.
          const cant = Math.min(f.cantPropuesta, f.cantPedida || 0);
          if (cant > 0) lineas.push(propuesta(cant));
          break;
        }
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
      for (const l of lineas.slice(desde)) {
        // El comercial trabaja siempre con precio NETO (sin descuentos): al
        // cliente va el neto, nunca el precio de tarifa del proveedor.
        const neto = l._neto != null ? l._neto : l.precio;
        delete l._neto;
        if (!comercial) continue;
        l.precioCliente = precioClienteManual != null ? precioClienteManual : neto;
        if (f.precioPropuesta != null) {
          l.precio = f.precioPropuesta;
          l.dtos = f.dtosPropuesta;
          l.importe = l.cant === f.cantPropuesta ? f.importePropuesta : null;
        } else if (f.ajusteVenta && f.ajusteVenta.modo !== 'tarifa' && l.precio != null) {
          // Sin línea del proveedor, lo apuntado es precio de venta: a Géminis va el coste.
          l.precio = precioCoste(l.precio, f.ajusteVenta);
          l.dtos = [];
          l.importe = null;
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
    for (const [k, g] of agrupar(llegada)) {
      const ref = g.ref;
      let queda = g.cant;
      for (const r of abiertos) {
        if (queda <= 0) break;
        if (claveRef(r.ref) !== k) continue;
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
  /**
   * La columna «Descuento» puede traer un porcentaje (27), una fracción (0,27)
   * o el descuento en euros por unidad (2,2356 sobre 8,28): con precio,
   * cantidad e importe se elige la lectura con la que cuadra la línea.
   * Sin importe, o si ninguna cuadra, se lee como siempre (fracción → %).
   */
  function dtosDeColumna(brutos, precio, cant, importe) {
    const comoSiempre = brutos.map((n) => (n > 0 && n < 1 ? red2(n * 100) : n));
    if (brutos.length !== 1 || !precio || !cant || importe == null) return comoSiempre;
    const n = brutos[0];
    const lecturas = [n, n * 100, (n / precio) * 100].filter((d) => d > 0 && d < 100);
    const cuadra = (d) => Math.abs(precio * cant * (1 - d / 100) - importe) <= 0.02 + 0.01 * cant;
    if (comoSiempre.length && cuadra(comoSiempre[0])) return comoSiempre;
    const d = lecturas.find(cuadra);
    return d == null ? comoSiempre : [Math.round(d * 10000) / 10000];
  }

  /**
   * Precio de venta a partir del precio de la tarifa, según cómo la manda el
   * proveedor: {modo:'ninguno'} (ya es precio de venta, p. ej. Finocam: tarifa
   * base cuyo descuento es nuestro margen), {modo:'incremento', pct} (coste +
   * pct %) o {modo:'beneficio', pct} (pct % de beneficio sobre la venta:
   * coste / (1 − pct/100)). Redondeado a céntimos.
   */
  /** Lo contrario de precioVenta: el coste que corresponde a un precio de venta. */
  function precioCoste(venta, ajuste) {
    const v = parseNum(venta);
    if (v == null) return null;
    const a = ajuste || {};
    const pct = parseNum(a.pct) || 0;
    if (a.modo === 'incremento') return red2(v / (1 + pct / 100));
    if (a.modo === 'beneficio' && pct > 0 && pct < 100) return red2(v * (1 - pct / 100));
    return red2(v);
  }
  function textoAjuste(a) {
    const pct = parseNum(a && a.pct);
    if (a && a.modo === 'tarifa') return 'el precio de tarifa del proveedor, sin sus descuentos';
    if (!a || !a.modo || a.modo === 'ninguno' || !pct) return 'el precio de la tarifa';
    return a.modo === 'beneficio' ? `${fmt(pct).replace(',00', '')} % de beneficio` : `+${fmt(pct).replace(',00', '')} % sobre coste`;
  }
  function precioVenta(precio, ajuste) {
    const p = parseNum(precio);
    if (p == null) return null;
    const a = ajuste || {};
    const pct = parseNum(a.pct) || 0;
    if (a.modo === 'incremento') return red2(p * (1 + pct / 100));
    if (a.modo === 'beneficio' && pct > 0 && pct < 100) return red2(p / (1 - pct / 100));
    return red2(p);
  }

  /**
   * Tarifa completa de un proveedor (Excel), para el catálogo: sirve para
   * rellenar descripción y precio al apuntar una referencia y para detectar
   * referencias mal escritas. Necesita una columna de referencia y otra de
   * descripción o de precio (sin cantidades). Devuelve { items: {ref: {d, p, ean}}, n }.
   */
  function leerTarifa(filas) {
    const hallar = (cab, pruebas) => {
      for (const pr of pruebas) {
        const i = cab.findIndex((c) => pr.test(clave(c)));
        if (i >= 0) return i;
      }
      return -1;
    };
    let iCab = -1;
    let col = null;
    for (let i = 0; i < Math.min((filas || []).length, 60); i++) {
      const cab = filas[i] || [];
      const ref = hallar(cab, [/^REFERENCIA\b/, /^RFCIA/, /^REFCIA/, /^REF\.?\b/, /^ARTICULO\b/, /^CODIGO\b/, /^COD\.? ?ART/, /^COD\.?$/]);
      const desc = hallar(cab, [/^DESCRIPCION/, /^DENOMINACION/, /^CONCEPTO/, /^NOMBRE\b/, /^ARTICULO\b/]);
      const precio = hallar(cab, [/^PRECIO\b/, /^TARIFA\b/, /^P\.? ?TARIFA\b/, /^P\.? ?UNIT/, /^PTD\b/, /^COSTE?\b/, /^COSTO\b/, /^PVP\b/, /^P\.? ?V\.? ?P/]);
      if (ref >= 0 && (precio >= 0 || (desc >= 0 && desc !== ref))) {
        iCab = i;
        col = { ref, desc: desc === ref ? -1 : desc, precio, ean: hallar(cab, [/^EAN/, /^COD\.? ?BARRAS/, /^CODIGO DE BARRAS/]) };
        break;
      }
    }
    if (iCab < 0) throw new Error('No encuentro la fila de títulos: hace falta una columna «Referencia» (o «Código») y otra de «Descripción» o «Precio»');
    const items = {};
    for (let i = iCab + 1; i < filas.length; i++) {
      const f = filas[i] || [];
      const ref = normRef(f[col.ref]);
      if (!ref || ref.length > 30) continue;
      const d = col.desc >= 0 ? String(f[col.desc] == null ? '' : f[col.desc]).trim() : '';
      const p = col.precio >= 0 ? parseNum(f[col.precio]) : null;
      if (!d && p == null) continue;
      const ean = col.ean >= 0 ? String(f[col.ean] == null ? '' : f[col.ean]).trim() : '';
      items[ref] = { d, p, ean };
    }
    return { items, n: Object.keys(items).length };
  }

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
          precio: hallar(cab, [/^PTD\b/, /^PRECIO\b/, /^P\.? ?UNIT/, /^P\.? ?COSTO/, /^COSTE?\b/, /^COSTO\b/, /^TARIFA\b/, /^P\.? ?TARIFA\b/, /^UNIDAD$/]),
          // Puede haber varias columnas de descuento encadenadas (Dto. 1, Dto. 2…).
          dtos: hallarTodas(cab, [/^DESC\.? ?LIN/, /^DTO\b/, /^DCTO\b/, /^% ?DTO\b/, /^DESCUENTO\b/]),
          iva: hallar(cab, [/^IVA\b/, /^IGIC\b/]),
          // Puede haber más de un «TOTAL» (el neto por unidad y el de la línea):
          // el importe de la línea es el mayor de ellos.
          importes: hallarTodas(cab, [/^IMPORTE\b/, /^SUBTOTAL\b/, /^TOTAL\b/, /^NETO\b/]),
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
        const brutos = col.dtos.map((i) => parseNum(f[i])).filter((n) => n);
        const imps = col.importes.map((i) => parseNum(f[i])).filter((n) => n != null);
        const importe = imps.length ? imps.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)) : null;
        const dtos = dtosDeColumna(brutos, precio, cant, importe);
        let iva = parseNum(val(f, col.iva));
        if (iva != null && iva > 0 && iva < 1) iva = red2(iva * 100);
        lineas.push(marcarAlta({ ref, desc, ean, cant, precio, dtos, iva, importe, udsCaja: parseNum(val(f, col.udsCaja)) }));
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
  /**
   * Una factura agrupada (Apli/Miquelrius: un bloque «Pedido Cliente: Pedido 5_
   * B2F» por cada pedido nuestro) se parte en un documento por pedido, con las
   * líneas de cada bloque (`pedido` de cada línea, que la lectura con IA rellena
   * solo cuando hay varios). La base imponible es la del total, así que en las
   * partes va vacía. Con un solo pedido, el documento tal cual.
   */
  /**
   * Una factura o propuesta de toda una campaña junta (el proveedor no la separa
   * por cliente, o sus «Pedido 5_ B2F» no son nuestros pedidos): cada línea va a
   * los pedidos que piden esa referencia, hasta lo que pide cada uno — primero el
   * pedido cuyo nº coincide con el bloque de la línea, si lo trae, y luego por nº
   * de pedido —. El importe se reparte en proporción a la cantidad. Lo que no
   * pide nadie, o lo que viene de más, queda en `sobrantes`.
   * pedidos: [{ id, numero, lineas }] → { porPedido: Map(id → lineas), sobrantes }
   */
  function repartirPorReferencias(lineasDoc, pedidos) {
    const numero = (x) => { const m = String(x || '').match(/\d+/); return m ? Number(m[0]) : Infinity; };
    const lista = (pedidos || []).slice().sort((a, b) => numero(a.numero) - numero(b.numero));
    const falta = new Map(lista.map((p) => [p.id, new Map([...agrupar(p.lineas, aliasAltas(p.lineas))].map(([k, g]) => [k, g.cant]))]));
    const porPedido = new Map();
    const sobrantes = [];
    const parte = (l, q, imp) => Object.assign({}, l, { cant: q, importe: imp });
    for (const l of lineasDoc || []) {
      const clave = claveRef(l.ref);
      let resto = parseNum(l.cant);
      if (!clave || !resto) { sobrantes.push(l); continue; }
      const total = resto;
      const nBloque = l.bloque ? numero(l.bloque) : null;
      const candidatos = lista.filter((p) => (falta.get(p.id).get(clave) || 0) > 0)
        .sort((a, b) => Number(numero(b.numero) === nBloque) - Number(numero(a.numero) === nBloque));
      let repartido = 0;
      for (const p of candidatos) {
        if (resto <= 0) break;
        const q = Math.min(resto, falta.get(p.id).get(clave));
        falta.get(p.id).set(clave, falta.get(p.id).get(clave) - q);
        resto -= q;
        let imp = null;
        if (l.importe != null) { imp = resto <= 0 ? red2(l.importe - repartido) : red2(l.importe * q / total); repartido = red2(repartido + imp); }
        if (!porPedido.has(p.id)) porPedido.set(p.id, []);
        porPedido.get(p.id).push(parte(l, q, imp));
      }
      if (resto > 0) sobrantes.push(parte(l, resto, l.importe != null ? red2(l.importe - repartido) : null));
    }
    return { porPedido, sobrantes };
  }

  function separarPorPedido(res) {
    const r = res || {};
    const lineas = r.lineas || [];
    const clave = (l) => String((l && l.pedido) || '').trim();
    const pedidos = [...new Set(lineas.map(clave).filter(Boolean))];
    if (pedidos.length < 2) return [r];
    const partes = new Map(pedidos.map((k) => [k, []]));
    let sin = [];
    for (const l of lineas) (clave(l) ? partes.get(clave(l)) : sin).push(l);
    const doc = (k, ls) => Object.assign({}, r, {
      pedidoCliente: k, baseImponible: '', lineas: ls,
      notas: [`Parte de ${r.tipoDocumento || 'documento'} ${r.numero || ''} (${pedidos.length} pedidos)`.replace(/\s+/g, ' '), r.notas].filter(Boolean).join(' · '),
    });
    const out = pedidos.map((k) => doc(k, partes.get(k)));
    if (sin.length) out.push(doc('', sin));
    return out;
  }

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
      ...(String(l.pedido || '').trim() ? { bloque: String(l.pedido).trim() } : {}),
    })).filter((l) => l.ref || l.desc).map(marcarAlta);

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

  /**
   * Plantilla «Luis»: la oficial de Gestión, PLANTILLA_PEDIDOS_PROVEEDORES_ALTA_NUEVOS.xlt
   * (la que mandó el propietario el 20/10/2026), celda a celda: cabecera y
   * recordatorio de familias en las filas 1–10, títulos en la 11 y artículos
   * desde la 12, columnas A–P. Con la «Rober» (filasGeminis) Géminis daba de
   * alta cada línea como artículo «2».
   */
  function filasGeminisLuis(lineas, cab, opciones) {
    const N = 16; // A..P
    const fila = () => new Array(N).fill('');
    const c = cab || {};
    const aoa = [];
    let r;
    r = fila(); r[10] = 1001; r[11] = '< L} LIBROS DE TEXTOS     '; r[14] = 'Para otros dieños consultar el arbol de FAMILIAS'; aoa.push(r);
    r = fila(); r[2] = 'PROPUESTA    DE     PEDIDO'; r[4] = 'ALMACEN'; r[5] = c.almacen || ''; r[9] = 'L}'; r[10] = 100125; r[11] = 'LIBRO TEXTOS (L} 25%)         ';
    r[14] = 20; r[15] = '-} ARTICULOS de DISEÑO (Escolar)'; aoa.push(r);
    r = fila(); r[9] = 'L}'; r[10] = 100130; r[11] = 'LIBRO TEXTOS (L} 30%)         '; r[13] = 'Para incluir'; aoa.push(r);
    r = fila(); r[2] = 'PROVEEDOR;'; r[3] = c.proveedor || ''; r[10] = 1002; r[11] = '<< L< LIBROS DE LECTURAS '; r[13] = 'Referencias';
    r[14] = 209102; r[15] = 'ARTICULOS DISEÑO (Varios)     '; aoa.push(r);
    r = fila(); r[9] = 'L<'; r[10] = 100225; r[11] = 'LIBRO Lecturas (25% L<)       '; r[13] = 'en un mismo';
    r[14] = 209162; r[15] = 'MOCHILAS (Diseño)                            '; aoa.push(r);
    r = fila(); r[0] = '922-75.35.20'; r[2] = 'Nº Pedido'; r[3] = c.numero || ''; r[4] = 'FECHA'; r[5] = c.fecha || ''; r[9] = 'L<'; r[10] = 100230;
    r[11] = 'LIBRO Lecturas (30% L<)       '; r[13] = 'codigo'; r[14] = 209160; r[15] = 'Macutos Bolsas y Bandoleras (Diseño)'; aoa.push(r);
    r = fila(); r[0] = 'Compras@ofipapelsl.com'; r[13] = 'el padre no '; r[14] = 209163; r[15] = 'Monederos Billeteras (Diseño)'; aoa.push(r);
    r = fila(); r[2] = 'Contactar con:'; r[4] = 'E-mail'; r[10] = 209102; r[11] = 'ARTICULOS DISEÑO (Varios)     '; r[13] = 'lleva ';
    r[14] = 209166; r[15] = 'Neceser Escolar (Diseño)'; aoa.push(r);
    r = fila(); r[10] = 209162; r[11] = 'MOCHILAS (Diseño) SOLO  ALTA EN WEB                           '; r[14] = 209176; r[15] = 'Plumier (Diseño)'; aoa.push(r);
    r = fila(); r[1] = 'MARCA'; r[2] = 'Rfecia. Compra'; r[11] = 'CODIGO  A'; r[12] = 'Margen'; r[14] = 209179; r[15] = 'Portatodo (Diseño)'; aoa.push(r);
    aoa.push(['Codigo I.S.B.N.', 'EDITORIAL', 'Rfcia. Proveedor', 'DESCRIPCION', 'Caja', 'Ud./Caja', 'Udes', 'Precio U.', 'Dcto', 'Igic', 'IMPORTE', 'RECONVERTIR', 'COD. FAMILIA', 'PADRE', '>>>>>>>>>>>>>>>>>>>>>>>', '']);
    const dto = (opciones && opciones.dto) || 0;
    const igic = (opciones && opciones.igic != null) ? opciones.igic : '';
    for (const l of lineas || []) {
      const precio = l.precio == null ? 0 : l.precio;
      const dtoLinea = l.dto != null ? l.dto : dto;
      const importe = l.total != null ? l.total : red2(precio * l.cant * (1 - dtoLinea / 100));
      aoa.push([l.ean || '', '', l.alta ? REF_ALTA : l.ref, l.alta ? (l.descAlta || l.desc || '') : (l.desc || ''), '', '', l.cant,
        precio, dtoLinea, l.igic != null ? l.igic : igic, importe, '', '', '', '', '']);
    }
    return aoa;
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
        // UdsXCja va en la plantilla pero siempre en blanco (propietario, 2026-10-08):
        // la cantidad es solo «Pedidas», y un valor ahí daba lugar a errores.
        ean: l.ean || '', desc: l.alta ? (l.descAlta || l.desc || '') : (l.desc || ''), ref: l.alta ? REF_ALTA : l.ref, cajas: '', udsCaja: '', cant: l.cant,
        precio, dto: dtoLinea, igic: l.igic != null ? l.igic : igic, total, bonif: '', sinStock: '', codOfipapel: '', refProveedor: l.alta ? REF_ALTA : l.ref,
      };
      aoa.push(P.columnas.map((c) => v[c]));
    }
    return aoa;
  }

  /**
   * «Propuesta de Pedido» de Géminis (nuestro programa): el pedido que mandamos
   * al proveedor. Se lee sin IA, línea a línea del texto del PDF, porque la IA
   * confundía las columnas de números seguidas (Bultos, cajas, Udes. x Caja,
   * Unidades). Columnas: Cod.Venta (nuestro código) · R · Rfc.Compra (la del
   * proveedor, la que se compara) · Descripción · Bultos · cajas · Udes. x Caja
   * · **Unidades** (la cantidad, siempre; no sale de cajas × uds: un 0 × 60
   * puede ser 12) · Precio · Desc.Bon · Cod. Barras.
   * Devuelve lo mismo que la lectura con IA (para lineasDeDocumento) o null si
   * el texto no es de este formato.
   */
  function leerPedidoGeminis(lineasTexto) {
    const filas = (lineasTexto || []).map((x) => String(x).replace(/\s+/g, ' ').trim()).filter(Boolean);
    const todo = filas.join('\n');
    if (!/Propuesta de Pedido/i.test(todo) || !/Rfc\.?\s*Compra/i.test(todo) || !/Unidades/i.test(todo)) return null;
    const NUM = '(\\d{1,3}(?:\\.\\d{3})*,\\d{2,4})';
    const re = new RegExp('^(\\S+) (?:([A-Z]) )?(\\S+) (.+?) (\\d+) (\\d+) (\\d+) (\\d+) ' + NUM + '(?: (\\d{1,2}(?:,\\d+)?)(?= |$))?(?: (\\S+))?(?: .*)?$');
    const lineas = [];
    for (const f0 of filas) {
      const f = f0.replace(/^(\S+ (?:[A-Z] )?)2 ALTA NUEVA /i, '$12_ALTA_NUEVA ');
      const m = f.match(re);
      if (!m || !/\d/.test(m[1])) continue;
      let [, codVenta, , rfc, desc, , cajas, udsCaja, unidades, precio, dto, ean] = m;
      if (rfc === '2_ALTA_NUEVA') rfc = REF_ALTA;
      lineas.push({
        referencia: rfc, codVenta, ean: ean && !/^\d{1,2},/.test(ean) ? ean : '', descripcion: desc.trim(),
        cantidad: unidades, udsCaja: Number(udsCaja) ? udsCaja : '', cajas, precio, descuentos: dto && Number(dto.replace(',', '.')) ? dto : '',
        importe: '', duda: '',
      });
    }
    if (!lineas.length) return null;
    const prov = filas.map((x) => x.match(/^\(\s*\d+\s*\)\s*(.+?)(?: \d{2}\/\d{2}\/\d{4}.*)?$/)).find(Boolean);
    const num = filas.map((x) => x.match(/^Almac[eé]n (\d+)$/i)).find(Boolean);
    const fecha = todo.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
    return {
      proveedor: prov ? prov[1].trim() : '', tipoDocumento: 'Propuesta de Pedido (Géminis)', numero: num ? num[1] : '',
      fecha: fecha ? fecha[1] : '', baseImponible: '', dtoGlobal: '', pedidoCliente: '', notas: '', lineas,
    };
  }

  /**
   * Pedidos de una campaña tal como se mandan al proveedor: uno por cliente
   * (nº y cliente), con cantidad, referencia y descripción — sin precios.
   * Ordenados por nº de pedido; las líneas sin referencia ni descripción, fuera.
   */
  function pedidosParaProveedor(pedidos) {
    return (pedidos || [])
      .map((p) => ({
        numero: String(p.numero || ''),
        cliente: String(p.cliente || ''),
        lineas: (p.lineas || []).filter((l) => (l.ref || l.desc) && Number(l.cant) > 0)
          .map((l) => ({ cant: Number(l.cant), exp: !!l.exp, ref: String(l.ref || ''), desc: String(l.desc || '') })),
      }))
      .filter((p) => p.lineas.length)
      .sort((a, b) => a.numero.localeCompare(b.numero, 'es', { numeric: true }) || a.cliente.localeCompare(b.cliente, 'es'));
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
    leerPedidoGeminis, pedidosParaProveedor, firma, documentosDe, aplicarDocumento, cambiosPendientes, integrarSubida, integrarBajada,
    normRef, parseNum, red2, fmt, agrupar,
    parseDtos, precioNeto, claveRef, marcarAlta, codigosAlta, aliasAltas, fusionarAltas, REF_ALTA, compararPedido, faltasYSobras, faltasPendientes, controlFactura, restosDeFactura, hojasDelPedido, ordenarComoPropuesta, parecidoLineas, repartirPorContenido, textoReclamacion, aReclamar, leerTarifa, precioVenta, precioCoste, filasGeminisLuis, sugerenciasCatalogo, accionesPara, sinDecidir, decisionesQueSiguen, aplicarDecisiones, lineasParaGeminis, lineasDeDocumento, separarPorPedido, repartirPorReferencias, fotosRepetidas, firmaLineas,
    sugerirAsignacion, descuentoEquivalente, leerPropuesta, filasGeminis,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.ControlPedidos = api;
})(typeof window !== 'undefined' ? window : globalThis);
