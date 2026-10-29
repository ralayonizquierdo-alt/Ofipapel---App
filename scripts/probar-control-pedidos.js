// Pruebas de control-pedidos-logica.js. Ejecutar: node --test scripts/probar-control-pedidos.js
//
// Datos inventados a propósito: los pedidos reales llevan nombres de clientes
// y precios, y este repositorio es público.
const test = require('node:test');
const assert = require('node:assert/strict');
const CP = require('../control-pedidos-logica.js');

const pedido = [
  { ref: '780100027', cant: 4, precio: 3.25 },
  { ref: '781350027', cant: 5, precio: 4.13 },
  { ref: '742776027', cant: 1, precio: 5.67 },
  { ref: '770140327', cant: 1, precio: 12.67 },
  { ref: '780070027', cant: 6, precio: 4.35 },
];
const propuesta = [
  { ref: '780100027', cant: 4, precio: 3.25 },
  { ref: '781350027', cant: 5, precio: 4.30 },
  { ref: '770140327', cant: 1, precio: 8.76 },
  { ref: '780070027', cant: 4, precio: 4.35 },
  { ref: '999999927', cant: 2, precio: 1.00 },
];

const porRef = (filas) => Object.fromEntries(filas.map((f) => [f.ref, f]));

test('detecta falta, extra, cambio de cantidad y de precio', () => {
  const f = porRef(CP.compararPedido(pedido, propuesta));
  assert.equal(f['780100027'].estado, 'ok');
  assert.equal(f['780100027'].revisar, false);
  assert.equal(f['742776027'].estado, 'falta');
  assert.equal(f['999999927'].estado, 'extra');
  assert.equal(f['780070027'].estado, 'cambio');
  assert.ok(f['780070027'].motivos.some((m) => m.tipo === 'cantidad'));
  assert.equal(f['770140327'].difPrecio, -3.91);
  assert.equal(f['770140327'].revisar, true);
});

test('pedido del comercial: tolerancia cero, cualquier cambio de precio hay que decidirlo', () => {
  const f = porRef(CP.compararPedido(pedido, propuesta));
  const m = f['781350027'].motivos.find((x) => x.tipo === 'precio');
  assert.ok(m, 'el cambio de 0,17 € tiene que aparecer');
  assert.equal(f['781350027'].revisar, true, 'sin opciones se aplica la del comercial (cero)');
  const centimo = CP.compararPedido([{ ref: 'A', cant: 1, precio: 1 }], [{ ref: 'A', cant: 1, precio: 1.01 }], { tolerancia: CP.TOLERANCIA.comercial });
  assert.equal(centimo[0].revisar, true);
});

test('reposición: hasta 0,25 € es informativo, por encima hay que revisarlo', () => {
  const tol = CP.TOLERANCIA.reposicion;
  const justo = CP.compararPedido([{ ref: 'A', cant: 1, precio: 1 }], [{ ref: 'A', cant: 1, precio: 1.25 }], { tolerancia: tol });
  assert.equal(justo[0].revisar, false, '0,25 € exactos todavía es informativo');
  assert.equal(justo[0].motivos[0].informativo, true, 'pero se enseña');
  const pasa = CP.compararPedido([{ ref: 'A', cant: 1, precio: 1 }], [{ ref: 'A', cant: 1, precio: 1.26 }], { tolerancia: tol });
  assert.equal(pasa[0].revisar, true);
});

test('no deja cerrar el pedido con discordancias sin decidir', () => {
  const filas = CP.compararPedido(pedido, propuesta);
  assert.throws(() => CP.aplicarDecisiones(filas, {}), /sin validar/);
});

test('las faltas y la cantidad que no llega pasan a restos', () => {
  const filas = CP.compararPedido(pedido, propuesta);
  const r = CP.aplicarDecisiones(filas, {
    '742776027': { accion: 'resto' },
    '780070027': { accion: 'resto' },
    '770140327': { accion: 'aceptar', nota: 'Facturar al cliente la versión que reciba' },
    '999999927': { accion: 'excluir' },
    '781350027': { accion: 'aceptar' },
  });
  assert.deepEqual(r.restos.map((x) => [x.ref, x.cant]), [['742776027', 1], ['780070027', 2]]);
  const lin = porRef(r.lineas);
  assert.equal(lin['780070027'].cant, 4, 'se acepta lo que viene');
  assert.equal(lin['770140327'].precio, 8.76);
  assert.equal(lin['999999927'], undefined);
  assert.equal(lin['781350027'].precio, 4.30, 'aceptado: precio del proveedor');
  assert.equal(r.notas.length, 1);
});

test('anular una falta no crea resto', () => {
  const filas = CP.compararPedido([{ ref: 'A', cant: 2 }], []);
  const r = CP.aplicarDecisiones(filas, { A: { accion: 'anular' } });
  assert.equal(r.restos.length, 0);
  assert.equal(r.lineas.length, 0);
});

test('manual exige una cantidad válida', () => {
  const filas = CP.compararPedido([{ ref: 'A', cant: 2, precio: 1 }], [{ ref: 'A', cant: 3, precio: 1 }]);
  assert.throws(() => CP.aplicarDecisiones(filas, { A: { accion: 'manual', cant: '' } }), /Cantidad manual/);
  const r = CP.aplicarDecisiones(filas, { A: { accion: 'manual', cant: '2', precio: '0,95' } });
  // El precio a mano es el neto: el base no se toca y se cuadra con el importe.
  assert.deepEqual([r.lineas[0].cant, r.lineas[0].precio, r.lineas[0].importe], [2, 1, 1.9]);
});

test('una llegada posterior se asigna al cliente original, el más antiguo primero', () => {
  const restos = [
    { id: 'r2', proveedor: 'FINOCAM', ref: '785100027', pendiente: 2, fecha: '2026-10-05', cliente: 'CLIENTE B' },
    { id: 'r1', proveedor: 'FINOCAM', ref: '785100027', pendiente: 1, fecha: '2026-10-01', cliente: 'CLIENTE A' },
    { id: 'r3', proveedor: 'OTRO', ref: '785100027', pendiente: 5, fecha: '2026-09-01', cliente: 'CLIENTE C' },
  ];
  const s = CP.sugerirAsignacion(restos, [{ ref: '785 100 027', cant: 4 }], 'FINOCAM');
  assert.deepEqual(s.asignaciones.map((a) => [a.cliente, a.cant]), [['CLIENTE A', 1], ['CLIENTE B', 2]]);
  assert.deepEqual(s.sobrante, [{ ref: '785100027', cant: 1 }], 'de otro proveedor no se toca');
});

test('referencia que no está en el catálogo: avisa y sugiere la parecida', () => {
  const catalogo = { '792000327': { d: 'CAL. SOBREMESA ART', p: 4.96 }, '780100027': { d: 'CAL', p: 3.25 } };
  const [f] = CP.compararPedido([{ ref: '782000327', cant: 2, precio: 4.96 }], [], { catalogo });
  assert.equal(f.enCatalogo, false);
  assert.equal(f.sugerencias[0].ref, '792000327');
  const trans = CP.sugerenciasCatalogo('780010027', catalogo);
  assert.equal(trans[0].ref, '780100027', 'dos cifras contiguas intercambiadas');
  // Si la propuesta del proveedor la trae, la tarifa guardada es la que está vieja: solo se avisa
  const [g] = CP.compararPedido([{ ref: 'NUEVA1', cant: 2, precio: 1 }], [{ ref: 'NUEVA1', cant: 2, precio: 1 }], { catalogo });
  assert.equal(g.enCatalogo, false);
  assert.equal(g.revisar, false, 'no obliga a decidir');
  assert.ok(g.motivos.some((m) => m.tipo === 'no_catalogo' && m.informativo));
});

test('descuentos encadenados → uno equivalente sin tocar el precio base', () => {
  const r = CP.descuentoEquivalente(100, 2, [10, 5], { decimales: 4 });
  assert.equal(r.descuento, 14.5);
  assert.equal(r.subtotal, 171);
  const aj = CP.descuentoEquivalente(100, 2, [10, 5], { subtotalObjetivo: 170.99, decimales: 4 });
  assert.equal(aj.descuento, 14.505);
  assert.equal(aj.residuo, 0);
  const corto = CP.descuentoEquivalente(100, 2, [10, 5], { subtotalObjetivo: 170.99, decimales: 2 });
  assert.notEqual(corto.residuo, 0, 'con 2 decimales no cuadra y lo tiene que decir');
});

test('lee el formulario de Finocam: cabecera, líneas pedidas y catálogo entero', () => {
  const hoja = [
    ['CÓDIGO CLIENTE', '00000', '', 'IMPORTE PEDIDO NETO\n(sin IVA)', '', '', '', '', '', 9.1],
    ['% DTO.GLOBAL', 0.3],
    ['OBSERVACIONES\n(Máximo 190 caracteres)', 'PEDIDO Nº3 CLIENTE X'],
    ['Descripción facturas (35) ', 'Formato', 'EAN13', 'Referencia  ', 'CANT.\nPEDIDO', '\nDESC.\nLIN.', 'PTD \nsin \nIVA', 'PVP', 'IVA'],
    ['AGENDAS'],
    ['CAL.PARED L', 'L', 8422952420866, 780070027, 2, '', 4.35, 9, 0.21],
    ['CAL.PARED M', 'M', 8422952420880, 780060027, '', '', 3.25, 7, 0.21],
  ];
  const p = CP.leerPropuesta(hoja);
  assert.equal(p.cabecera.dtoGlobal, 30);
  assert.equal(p.cabecera.numeroPedido, 3);
  assert.equal(p.lineas.length, 1);
  assert.deepEqual([p.lineas[0].ref, p.lineas[0].cant, p.lineas[0].precio, p.lineas[0].iva], ['780070027', 2, 4.35, 21]);
  assert.equal(Object.keys(p.catalogo).length, 2, 'el catálogo incluye lo no pedido');
});

test('Excel de Géminis: artículos desde la fila 11, precio base intacto', () => {
  const aoa = CP.filasGeminis([{ ref: '780070027', desc: 'CAL', ean: '842', cant: 2, precio: 4.35 }], { proveedor: 'FINOCAM' }, { dto: 30, igic: 7 });
  assert.equal(aoa.length, 11);
  const fila11 = aoa[10];
  const col = (k) => fila11[CP.PLANTILLA_GEMINIS.columnas.indexOf(k)];
  assert.equal(col('ref'), '780070027');
  assert.equal(col('precio'), 4.35);
  assert.equal(col('dto'), 30);
  assert.equal(col('total'), 6.09);
  assert.equal(aoa[9][0], 'Cod.Barras EAN13', 'títulos en la fila 10');
});

test('parseNum entiende los precios escritos a mano', () => {
  assert.equal(CP.parseNum("4'13"), 4.13);
  assert.equal(CP.parseNum('4,13'), 4.13);
  assert.equal(CP.parseNum('1.234,56'), 1234.56);
  assert.equal(CP.parseNum(''), null);
  assert.equal(CP.parseNum('abc'), null);
});

// ── Reposición ──────────────────────────────────────────────────────────────
const REPO = { comparar: 'neto', tolerancia: CP.TOLERANCIA.reposicion };

test('reposición: se compara el precio NETO, después de todos los descuentos', () => {
  // Pedido: 10 € con 10+5 → 8,55 neto. Proveedor: 10 € con 10 → 9,00 neto.
  // El precio base es el mismo; la subida está en el descuento.
  const [f] = CP.compararPedido(
    [{ ref: 'A', cant: 1, precio: 10, dtos: '10+5' }],
    [{ ref: 'A', cant: 1, precio: 10, dtos: [10], importe: 9 }], REPO);
  assert.equal(f.netoPedido, 8.55);
  assert.equal(f.netoPropuesta, 9);
  assert.equal(f.difPrecio, 0.45);
  assert.equal(f.revisar, true);
  assert.match(f.motivos.find((m) => m.tipo === 'precio').texto, /neto/);
  const [g] = CP.compararPedido([{ ref: 'A', cant: 1, precio: 10, dtos: '10' }], [{ ref: 'A', cant: 1, precio: 9.2 }], REPO);
  assert.equal(g.revisar, false, '0,20 € en reposición es informativo');
  assert.equal(g.motivos[0].informativo, true);
});

test('reposición: cambio de formato (unidades por caja) y posible sustitución', () => {
  const f = porRef(CP.compararPedido(
    [{ ref: 'A', cant: 12, precio: 1, udsCaja: 12 }, { ref: 'VIEJA', cant: 5, precio: 2, ean: '8410000000017', desc: 'Bolígrafo azul caja 50' }],
    [{ ref: 'A', cant: 12, precio: 1, udsCaja: 10 }, { ref: 'NUEVA', cant: 5, precio: 2, ean: '8410000000017', desc: 'Otro texto' }], REPO));
  assert.ok(f.A.motivos.some((m) => m.tipo === 'formato'));
  assert.equal(f.NUEVA.sustituyeA, 'VIEJA');
  assert.equal(f.VIEJA.sustituidaPor, 'NUEVA');
});

test('reposición: sin precio en el pedido se compara con el último precio aceptado', () => {
  const [f] = CP.compararPedido([{ ref: 'A', cant: 1 }], [{ ref: 'A', cant: 1, precio: 5 }], { ...REPO, preciosAnteriores: { A: 4.5 } });
  assert.equal(f.precioDeHistorial, true);
  assert.equal(f.difPrecio, 0.5);
  assert.equal(f.revisar, true);
});

test('reposición: nunca ofrece restos; «mantener» conserva la cantidad del pedido pero va con el precio del proveedor', () => {
  const filas = CP.compararPedido(
    [{ ref: 'A', cant: 4, precio: 10, dtos: '10+5' }, { ref: 'B', cant: 2, precio: 3 }],
    [{ ref: 'A', cant: 4, precio: 11, dtos: [10, 5] }], REPO);
  for (const f of filas) assert.ok(!CP.accionesPara(f, 'reposicion').includes('resto'));
  const r = CP.aplicarDecisiones(filas, { A: { accion: 'mantener' }, B: { accion: 'excluir' } });
  assert.equal(r.restos.length, 0);
  assert.deepEqual([r.lineas[0].cant, r.lineas[0].precio, r.lineas[0].dtos], [4, 11, [10, 5]], 'a Géminis, lo que factura el proveedor (23/10/2026)');
});

test('Géminis: un solo descuento equivalente, precio base intacto, cuadrando con el importe del proveedor', () => {
  const [l] = CP.lineasParaGeminis([{ ref: 'A', cant: 2, precio: 100, dtos: [10, 5], importe: 170.99 }], { decimales: 4 });
  assert.deepEqual([l.precio, l.dto, l.total, l.residuo], [100, 14.505, 170.99, 0]);
  const [l2] = CP.lineasParaGeminis([{ ref: 'A', cant: 2, precio: 100, dtos: [10, 5], importe: 170.99 }], { decimales: 2 });
  assert.notEqual(l2.residuo, 0, 'con 2 decimales no cuadra al céntimo y hay que avisar');
  const [c] = CP.lineasParaGeminis([{ ref: 'A', cant: 2, precio: 4.35, dtos: [] }], { dtoGlobal: 30 });
  assert.deepEqual([c.dto, c.total], [30, 6.09], 'comercial: el descuento global de la campaña');
});

test('lee el Excel que genera la herramienta de PDF (referencia en «Rfcia. Proveedor», no en el ISBN)', () => {
  const hoja = [
    ['', '', 'PROVEEDOR;', 'APLI'],
    ['Codigo I.S.B.N.', 'MARCA/EDITORIAL', 'Rfcia. Proveedor', 'DESCRIPCION', 'Caja', 'Ud./Caja', 'Udes', 'Precio U.', 'Dcto', 'Igic', 'IMPORTE', '', 'COD. FAMILIA', ''],
    ['8410782012345', 'APLI', '01234', 'ETIQUETAS A4', '', 10, 20, 5.5, 12.5, 7, 96.25, '', 209102, ''],
    ['', '', '', '', '', '', '', '', '', 'TOTAL', 96.25],
  ];
  const p = CP.leerPropuesta(hoja);
  assert.equal(p.lineas.length, 1);
  const l = p.lineas[0];
  assert.deepEqual([l.ref, l.ean, l.cant, l.precio, l.dtos, l.importe, l.udsCaja], ['01234', '8410782012345', 20, 5.5, [12.5], 96.25, 10]);
  const r = CP.aplicarDecisiones(CP.compararPedido([{ ref: '01234', cant: 20, precio: 5.5, dtos: '12,5%' }], p.lineas, REPO), {});
  assert.deepEqual([r.lineas[0].ean, r.lineas[0].udsCaja, r.lineas[0].importe], ['8410782012345', 10, 96.25], 'llegan al Excel de Géminis');
});

test('factura leída con IA: líneas, dudas automáticas y cuadre con la base imponible', () => {
  const res = {
    proveedor: 'Proveedor X', tipoDocumento: 'factura', numero: 'F-77', fecha: '01/10/2026', baseImponible: '82,43', dtoGlobal: '', notas: 'Portes 6,00',
    lineas: [
      { referencia: '01234', ean: '8410000000017', descripcion: 'ETIQUETAS', cantidad: '12', udsCaja: '10', precio: '5,50', descuentos: '10+5', importe: '56,43', duda: '' },
      { referencia: '05555', ean: '', descripcion: 'CARPETA', cantidad: '6', udsCaja: '', precio: '2,00', descuentos: '', importe: '12,00', duda: '' },
      { referencia: '09999', ean: '', descripcion: 'GRAPAS', cantidad: '5', udsCaja: '', precio: '3,00', descuentos: '', importe: '14,00', duda: '' },
    ],
  };
  const d = CP.lineasDeDocumento(res);
  assert.deepEqual(d.lineas.map((l) => [l.ref, l.cant, l.precio, l.dtos, l.importe]),
    [['01234', 12, 5.5, [10, 5], 56.43], ['05555', 6, 2, [], 12], ['09999', 5, 3, [], 14]]);
  assert.equal(d.lineas[0].duda, '', '56,43 sale de 5,50 × 12 − 10+5 (con el redondeo del proveedor)');
  assert.match(d.lineas[2].duda, /no sale de precio/, '5 × 3,00 son 15,00, no 14,00');
  assert.deepEqual([d.control.sumaLineas, d.control.base, d.control.cuadra], [82.43, 82.43, true]);
  const falta = CP.lineasDeDocumento({ ...res, lineas: res.lineas.slice(0, 2) });
  assert.equal(falta.control.cuadra, false, 'si se salta una línea, la suma no llega a la base');
  // Y la comparación de reposición funciona con lo leído
  const f = CP.compararPedido([{ ref: '01234', cant: 12, precio: 5.5, dtos: '10+5' }], d.lineas, REPO);
  assert.equal(f.find((x) => x.ref === '01234').estado, 'ok');
});

test('faltas y sobras: lo pedido que no viene y lo que viene sin pedirse, aparte de precios', () => {
  const filas = CP.compararPedido(pedido, propuesta);
  const { faltan, sobran } = CP.faltasYSobras(filas);
  assert.deepEqual(faltan.map((x) => [x.ref, x.cant, x.de, x.total]), [['742776027', 1, 1, true], ['780070027', 2, 6, false]]);
  assert.deepEqual(sobran.map((x) => [x.ref, x.cant, x.total]), [['999999927', 2, true]]);
  // Un cambio solo de precio no es ni falta ni sobra
  assert.ok(!faltan.concat(sobran).some((x) => x.ref === '770140327'));
});

test('factura leída con IA: el nº de «su pedido» sirve para asignarla sola', () => {
  const d = CP.lineasDeDocumento({ pedidoCliente: 'S/ref. Su pedido nº 5 Librería Abona', notas: '', lineas: [] });
  assert.equal(d.cabecera.numeroPedido, 5);
  assert.match(d.cabecera.observaciones, /Abona/);
  assert.equal(CP.lineasDeDocumento({ pedidoCliente: '', lineas: [] }).cabecera.numeroPedido, null);
});

test('comercial: «mantener lo pedido» fija el precio al cliente; el coste para Géminis sigue siendo el del proveedor', () => {
  const filas = CP.compararPedido([{ ref: '770140327', cant: 1, precio: 12.67 }], [{ ref: '770140327', cant: 1, precio: 8.76 }]);
  const m = CP.aplicarDecisiones(filas, { 770140327: { accion: 'mantener' } }, { comercial: true }).lineas[0];
  assert.deepEqual([m.precioCliente, m.precio], [12.67, 8.76]);
  const a = CP.aplicarDecisiones(filas, { 770140327: { accion: 'aceptar' } }, { comercial: true }).lineas[0];
  assert.deepEqual([a.precioCliente, a.precio], [8.76, 8.76]);
  const x = CP.aplicarDecisiones(filas, { 770140327: { accion: 'manual', cant: '1', precio: '11' } }, { comercial: true }).lineas[0];
  assert.deepEqual([x.precioCliente, x.precio], [11, 8.76]);
  const [g] = CP.lineasParaGeminis([m], { dtoGlobal: 30 });
  assert.deepEqual([g.precio, g.total], [8.76, 6.13], 'Géminis: coste del proveedor con su 30 %');
  // Reposición: «mantener» guarda nuestra cantidad, con el precio que factura el proveedor
  assert.equal(CP.aplicarDecisiones(filas, { 770140327: { accion: 'mantener' } }).lineas[0].precio, 8.76);
});

test('comercial: su precio es NETO; se compara con el neto del proveedor y al cliente va el neto', () => {
  const COM = { comparar: 'neto', tolerancia: CP.TOLERANCIA.comercial };
  // El proveedor trae tarifa 10 con un 20 %: neto 8, el mismo que apuntó el comercial.
  const filas = CP.compararPedido([{ ref: 'A', cant: 3, precio: 8 }], [{ ref: 'A', cant: 3, precio: 10, dtos: [20], importe: 24 }], COM);
  assert.equal(filas[0].estado, 'ok', 'no es un cambio de precio');
  const a = CP.aplicarDecisiones(filas, {}, { comercial: true }).lineas[0];
  assert.deepEqual([a.precioCliente, a.precio, a.dtos, a._neto], [8, 10, [20], undefined], 'al cliente 8; a Géminis, la tarifa y su descuento');
  // Si el neto del proveedor no cuadra, sí es un cambio, y «aceptar» lleva al cliente el neto, no la tarifa.
  const g = CP.compararPedido([{ ref: 'A', cant: 1, precio: 7.5 }], [{ ref: 'A', cant: 1, precio: 10, dtos: [20] }], COM);
  assert.ok(g[0].revisar);
  assert.equal(CP.aplicarDecisiones(g, { A: { accion: 'aceptar' } }, { comercial: true }).lineas[0].precioCliente, 8);
  assert.equal(CP.aplicarDecisiones(g, { A: { accion: 'mantener' } }, { comercial: true }).lineas[0].precioCliente, 7.5);
});

test('propuesta nueva: se mantienen las decisiones de lo que no cambia; lo demás se vuelve a decidir', () => {
  const antes = [{ ref: 'A', cant: 2, precio: 5 }, { ref: 'B', cant: 1, precio: 3 }, { ref: 'C', cant: 4, precio: 10, dtos: [10] }];
  const ahora = [{ ref: 'A', cant: 2, precio: 5 }, { ref: 'B', cant: 3, precio: 3 }, { ref: 'C', cant: 4, precio: 9 }, { ref: 'D', cant: 1, precio: 1 }];
  const dec = { A: { accion: 'aceptar' }, B: { accion: 'manual', cant: '1', nota: 'factura aparte' }, C: { accion: 'mantener' }, D: { accion: 'anular' }, E: { accion: 'resto' }, F: { nota: 'solo nota' } };
  const r = CP.decisionesQueSiguen(antes, ahora, dec);
  // A igual; C: 10 − 10 % = 9 neto, igual; E no viene ni antes ni ahora; F sin acción.
  assert.deepEqual(r.quitadas, ['B', 'D']);
  assert.deepEqual(r.decisiones, { A: { accion: 'aceptar' }, B: { nota: 'factura aparte' }, C: { accion: 'mantener' }, E: { accion: 'resto' }, F: { nota: 'solo nota' } });
});

test('factura final: la misma mercancía con otra referencia no es falta ni sobra', () => {
  const val = [{ ref: '93-07', desc: 'BANDEJA MATTIO AZUL -REF. MTT4220101A-', cant: 20, precio: 2 },
    { ref: '93-08', desc: 'BANDEJA MATTIO GRIS -REF. MTT4220101G-', cant: 40, precio: 2 },
    { ref: 'X1', desc: 'OTRA COSA', cant: 5, precio: 1 }];
  const fac = [{ ref: '93M-07', desc: 'BANDEJA MATTIO AZUL -REF. MTT4220101A-', cant: 20, precio: 2 },
    { ref: '93M-08', desc: 'BANDEJA MATTIO GRIS -REF. MTT4220101G-', cant: 40, precio: 2.5 },
    { ref: 'Y9', desc: 'NADA QUE VER', cant: 5, precio: 1 }];
  const r = CP.controlFactura(val, fac);
  assert.deepEqual(r.cambiosRef.map((x) => [x.ref, x.refFactura, x.cant]), [['93-07', '93M-07', 20], ['93-08', '93M-08', 40]]);
  assert.deepEqual(r.faltan.map((x) => x.ref), ['X1'], 'descripción distinta: sigue siendo falta');
  assert.deepEqual(r.sobran.map((x) => x.ref), ['Y9']);
  assert.deepEqual(r.precios.map((x) => [x.ref, x.validado, x.facturado]), [['93-08 → 93M-08', 2, 2.5]]);
  // Con cantidad distinta no se empareja
  const r2 = CP.controlFactura([val[0]], [{ ...fac[0], cant: 10 }]);
  assert.equal(r2.cambiosRef.length, 0);
  // Y lo que cambia de referencia no va a Restos
  assert.deepEqual(CP.restosDeFactura(val.slice(0, 2), fac.slice(0, 2)), []);
});

test('referencias numéricas: con o sin ceros delante son la misma (Géminis 00839 = factura 000000839)', () => {
  const REPO = { comparar: 'neto', tolerancia: CP.TOLERANCIA.reposicion };
  const pedido = [{ ref: '00839', cant: 10, precio: 1 }, { ref: '11330', cant: 144, precio: 0.5 }, { ref: 'BLC-025', cant: 1, precio: 1 }];
  const factura = [{ ref: '000000839', cant: 10, precio: 1 }, { ref: '000011330', cant: 144, precio: 0.5 }, { ref: 'BLC-25', cant: 1, precio: 1 }];
  const filas = CP.compararPedido(pedido, factura, REPO);
  assert.deepEqual(filas.filter((f) => f.estado === 'ok').map((f) => f.ref), ['00839', '11330'], 'se enseña la referencia de nuestro pedido');
  // Con letras no se tocan los ceros: BLC-025 y BLC-25 siguen siendo distintas
  assert.deepEqual(filas.filter((f) => f.estado !== 'ok').map((f) => [f.ref, f.estado]), [['BLC-025', 'falta'], ['BLC-25', 'extra']]);
  const c = CP.controlFactura(pedido.slice(0, 2), factura.slice(0, 2));
  assert.equal(c.cuadra, true);
  assert.equal(CP.claveRef(' 000 '), '0');
  // El orden de la propuesta también casa sin los ceros
  assert.deepEqual(CP.ordenarComoPropuesta(pedido.slice(0, 2).reverse(), factura).map((l) => l.ref), ['00839', '11330']);
});

test('lo que viene de más o sin pedir también se puede reclamar', () => {
  const filas = CP.compararPedido([{ ref: 'A', cant: 2, precio: 1 }, { ref: 'B', cant: 5, precio: 1 }],
    [{ ref: 'A', cant: 2, precio: 1 }, { ref: 'B', cant: 8, precio: 1 }, { ref: 'X', cant: 1, precio: 3, desc: 'NO PEDIDA' }]);
  const B = filas.find((f) => f.ref === 'B');
  const X = filas.find((f) => f.ref === 'X');
  for (const tipo of ['comercial', 'reposicion']) {
    assert.ok(CP.accionesPara(X, tipo).includes('reclamar'), 'no pedida: ' + tipo);
    assert.ok(CP.accionesPara(B, tipo).includes('reclamar'), 'de más: ' + tipo);
  }
  // Reclamada: entra solo lo pedido (5 de B; nada de X)
  const r = CP.aplicarDecisiones(filas, { B: { accion: 'reclamar' }, X: { accion: 'reclamar' } });
  assert.deepEqual(r.lineas.map((l) => [l.ref, l.cant]), [['A', 2], ['B', 5]]);
  const { sobran } = CP.faltasYSobras(filas);
  const t = CP.textoReclamacion('APLI', [{ numero: '7', cliente: 'Reposición', faltan: [], sobran }]);
  assert.match(t, /hemos encontrado las siguientes diferencias/);
  assert.match(t, /B .*viene de más: 3 uds\. \(pedimos 5, vienen 8\)/);
  assert.match(t, /X\s+NO PEDIDA\s+→\s+no la hemos pedido \(1 ud\.\)/);
  assert.doesNotMatch(t, /descatalogada/, 'sin faltas no pregunta por descatalogados');
});

test('«2 ALTA NUEVA»: se compara por el código de la descripción y a Géminis vuelve como alta nueva', () => {
  const g = CP.leerPedidoGeminis([
    'Propuesta de Pedido', 'Cod.Venta R Rfc.Compra Descripción Bultos cajas Udes. x Caja Unidades Precio Desc.Bon Cod. Barras',
    '113267 DA000060 CERA BARRA 12-COLORES 0 0 0 10 0,000 8400001134322',
    '00002 2 ALTA NUEVA UA000570>MALETIN ARTISTICO 130 piezas 0 0 0 5 11,622',
    '00002 2 ALTA NUEVA UA000710 / UA000720>TRAVEL SET SURTIDO 0 0 0 12 2,373',
    '00002 2 ALTA NUEVA VL000011 Caja expositora Surtida 0 0 0 1 34,602',
    '00002 2 ALTA NUEVA PLANNING PARED 26/27 84x59cm 0 0 0 40 0,000',
  ]);
  const ped = CP.lineasDeDocumento(g).lineas;
  assert.deepEqual(ped.map((l) => [l.ref, l.alta || false, l.cant]), [
    ['DA000060', false, 10], ['UA000570', true, 5], ['UA000710+UA000720', true, 12], ['VL000011', true, 1], ['ALTA-PLANNINGPARED2', true, 40]]);
  assert.equal(ped[1].descAlta, 'UA000570>MALETIN ARTISTICO 130 piezas');
  // Lo leído antes del arreglo (referencia «2») se repara igual
  assert.equal(CP.marcarAlta({ ref: '2', desc: 'ALTA NUEVA AD-EXP002>PLANNING PARED', cant: 40 }).ref, 'AD-EXP002');
  // Propuesta del proveedor: el travel set viene en dos líneas y se suma
  const prop = [{ ref: 'DA000060', cant: 10, precio: 4.307 }, { ref: 'UA000570', cant: 5, precio: 11.6216 },
    { ref: 'UA000710', cant: 6, precio: 2.3725 }, { ref: 'UA000720', cant: 6, precio: 2.3725 }, { ref: 'VL000011', cant: 1, precio: 34.602 }];
  const filas = CP.compararPedido(ped, prop, { comparar: 'neto', tolerancia: CP.TOLERANCIA.reposicion });
  const { faltan, sobran } = CP.faltasYSobras(filas);
  assert.deepEqual(faltan.map((x) => x.ref), ['ALTA-PLANNINGPARED2'], 'solo falta lo que no trae código');
  assert.deepEqual(sobran, []);
  // Al Excel: «2 ALTA NUEVA» y nuestra descripción
  const fin = CP.aplicarDecisiones(filas, { 'ALTA-PLANNINGPARED2': { accion: 'excluir' }, DA000060: { accion: 'aceptar' } }).lineas;
  const aoa = CP.filasGeminis(CP.lineasParaGeminis(fin, {}), {});
  const datos = aoa.slice(10);
  const travel = datos.find((r) => String(r[1]).startsWith('UA000710'));
  assert.ok(travel, 'la descripción del Excel es la nuestra');
  assert.equal(travel[2], '2 ALTA NUEVA');
  assert.equal(travel[5], 12);
  assert.equal(datos.find((r) => r[1].startsWith('CERA'))[2], 'DA000060');
  // Factura final con las dos líneas del travel set: una sola línea de alta
  const fus = CP.fusionarAltas([{ ref: 'UA000710', cant: 6, precio: 2.3725, importe: 14.24 }, { ref: 'UA000720', cant: 6, precio: 2.3725, importe: 14.24 }], fin);
  assert.deepEqual(fus.map((l) => [l.ref, l.cant, l.alta, l.importe]), [['UA000710+UA000720', 12, true, 28.48]]);
  assert.deepEqual(CP.controlFactura(fin, [{ ref: 'UA000710', cant: 6, precio: 2.3725 }, { ref: 'UA000720', cant: 6, precio: 2.3725 },
    { ref: 'DA000060', cant: 10, precio: 4.307 }, { ref: 'UA000570', cant: 5, precio: 11.6216 }, { ref: 'VL000011', cant: 1, precio: 34.602 }]).cuadra, true);
});

test('reclamación de faltas: separada por cliente, con faltas totales y parciales', () => {
  const t = CP.textoReclamacion('FINOCAM', [
    { numero: '2', cliente: 'CLIENTE A', faltan: [{ ref: '785100027', desc: 'CALENDARIO', cant: 2, de: 2, total: true }] },
    { numero: '3', cliente: 'CLIENTE B', faltan: [] },
    { numero: '4', cliente: 'CLIENTE C', faltan: [{ ref: '782000327', desc: 'AGENDA', cant: 1, de: 3, total: false }] },
  ], { campana: '2027' });
  assert.match(t, /Pedido nº 2 · CLIENTE A\n  - 785100027  CALENDARIO  →  no viene \(pedimos 2 uds\.\): ¿está descatalogada/);
  assert.match(t, /782000327  AGENDA  →  faltan 1 ud\. \(pedimos 3, vienen 2\)/);
  assert.doesNotMatch(t, /CLIENTE B/, 'un pedido sin faltas no sale');
  assert.match(t, /campaña 2027/);
  assert.equal(CP.textoReclamacion('X', [{ numero: '1', faltan: [] }]), '');
});

test('faltas pendientes: solo las sin decidir y las que se reclaman; lo reclamado no va a restos', () => {
  const filas = CP.compararPedido(
    [{ ref: 'A', cant: 2, precio: 1 }, { ref: 'B', cant: 1, precio: 1 }, { ref: 'C', cant: 3, precio: 1 }, { ref: 'D', cant: 1, precio: 1 }],
    [{ ref: 'C', cant: 1, precio: 1 }]);
  assert.ok(CP.accionesPara(filas.find((f) => f.ref === 'A'), 'comercial').includes('reclamar'));
  const repo = CP.accionesPara(filas.find((f) => f.ref === 'A'), 'reposicion');
  assert.ok(repo.includes('reclamar') && !repo.includes('resto'), 'reposición: se reclama, nunca va a restos');
  const dec = { A: { accion: 'reclamar' }, B: { accion: 'anular' }, C: { accion: 'aceptar' } };
  const pend = CP.faltasPendientes(filas, dec);
  assert.deepEqual(pend.map((x) => [x.ref, x.pendiente]), [['A', 'reclamar'], ['D', 'decidir']]);
  const r = CP.aplicarDecisiones(filas, { ...dec, D: { accion: 'resto' } }, { comercial: true });
  assert.deepEqual(r.restos.map((x) => [x.ref, x.cant]), [['D', 1]], 'solo el «sin stock» va a restos; lo reclamado no');
  assert.deepEqual(CP.faltasPendientes(filas, { ...dec, D: { accion: 'resto' } }).map((x) => x.ref), ['A']);
});

test('la marca de expositor del pedido llega a las líneas finales', () => {
  const filas = CP.compararPedido([{ ref: 'E1', cant: 1, exp: true, precio: 100 }], [{ ref: 'E1', cant: 1, precio: 100 }]);
  assert.equal(CP.aplicarDecisiones(filas, {}, { comercial: true }).lineas[0].exp, true);
});

test('control de la factura final: lo que no ha venido, lo que sobra y los cambios de precio', () => {
  const validadas = [{ ref: 'A', cant: 2, precio: 10, dtos: [30] }, { ref: 'B', cant: 5, precio: 4 }, { ref: 'C', cant: 1, precio: 3 }];
  const factura = [{ ref: 'A', cant: 2, precio: 10, dtos: [30] }, { ref: 'B', cant: 3, precio: 4 }, { ref: 'C', cant: 1, precio: 3.5 }, { ref: 'D', cant: 1, precio: 1 }];
  const r = CP.controlFactura(validadas, factura);
  assert.deepEqual(r.faltan.map((x) => [x.ref, x.cant, x.total]), [['B', 2, false]]);
  assert.deepEqual(r.sobran.map((x) => [x.ref, x.cant]), [['D', 1]]);
  assert.deepEqual(r.precios.map((x) => [x.ref, x.validado, x.facturado]), [['C', 3, 3.5]]);
  assert.equal(r.cuadra, false);
  assert.equal(CP.controlFactura(validadas, validadas).cuadra, true);
  assert.equal(CP.controlFactura(validadas, factura.slice(1)).faltan[0].total, true, 'A no viene nada');
  // 30 % global en la propuesta validada y aplicado línea a línea en la factura: no es cambio de precio
  const r2 = CP.controlFactura([{ ref: 'X', cant: 1, precio: 10 }], [{ ref: 'X', cant: 1, precio: 10, dtos: [30] }], { dtoValidado: 30 });
  assert.equal(r2.cuadra, true);
  // la factura no trae el 30 % (ni en línea ni leído en cabecera): mismo precio base, no es cambio
  assert.equal(CP.controlFactura([{ ref: 'X', cant: 1, precio: 10 }], [{ ref: 'X', cant: 1, precio: 10 }], { dtoValidado: 30 }).cuadra, true);
  assert.equal(CP.controlFactura([{ ref: 'X', cant: 1, precio: 10 }], [{ ref: 'X', cant: 1, precio: 11 }], { dtoValidado: 30 }).precios.length, 1);
});

test('hojas del pedido: cuenta fotos y avisa de la hoja que falta', () => {
  const r = CP.hojasDelPedido([{ hoja: '1/4' }, { hoja: 'Hoja 2 de 4' }, { hoja: '4-4' }, { hoja: '' }]);
  assert.deepEqual([r.fotos, r.hojas, r.total, r.faltan], [4, [1, 2, 4], 4, [3]]);
  assert.deepEqual(CP.hojasDelPedido([{ hoja: '1/1' }]).faltan, []);
  assert.equal(CP.hojasDelPedido([{ hoja: '' }, { hoja: 'pedido 5' }]).total, null, 'sin numeración no se adivina');
  assert.equal(CP.hojasDelPedido([]).fotos, 0);
});

test('propuestas sin nº ni cliente: se reparten por las referencias que coinciden', () => {
  const pedidos = [
    { id: 'p1', lineas: [{ ref: 'A', cant: 1 }, { ref: 'B', cant: 1 }, { ref: 'C', cant: 1 }] },
    { id: 'p2', lineas: [{ ref: 'X', cant: 1 }, { ref: 'Y', cant: 1 }] },
    { id: 'p3', lineas: [{ ref: 'Q', cant: 1 }] },
  ];
  const docs = [
    { id: 'd2', lineas: [{ ref: 'X', cant: 1 }, { ref: 'Y', cant: 2 }, { ref: 'Z', cant: 1 }] },
    { id: 'd1', lineas: [{ ref: 'A', cant: 1 }, { ref: 'B', cant: 1 }] },
    { id: 'd3', lineas: [{ ref: 'A', cant: 1 }, { ref: 'M', cant: 1 }, { ref: 'N', cant: 1 }] },
  ];
  const r = CP.repartirPorContenido(docs, pedidos);
  assert.deepEqual(r.asignados.map((x) => [x.docId, x.pedidoId]).sort(), [['d1', 'p1'], ['d2', 'p2']]);
  assert.equal(r.sugerencias.d3.pedidoId, 'p1', 'd3 se parece poco: solo sugerencia, y p1 ya está cogido');
  assert.deepEqual(CP.parecidoLineas(docs[1].lineas, pedidos[0].lineas), { comunes: 2, deDoc: 2, dePedido: 3, score: 2 / 3 });
});

test('el Excel de Géminis va en el orden de la propuesta del proveedor; lo que no viene en ella, al final', () => {
  const finales = [{ ref: 'A' }, { ref: 'X' }, { ref: 'B' }, { ref: 'C' }, { ref: 'Y' }];
  const propuesta = [{ ref: 'C' }, { ref: 'A' }, { ref: 'B' }];
  assert.deepEqual(CP.ordenarComoPropuesta(finales, propuesta).map((l) => l.ref), ['C', 'A', 'B', 'X', 'Y']);
  assert.deepEqual(CP.ordenarComoPropuesta(finales, null).map((l) => l.ref), ['A', 'X', 'B', 'C', 'Y'], 'sin propuesta, se queda como está');
});

test('la factura final manda: lo validado que no viene en ella queda como resto, a precio de cliente', () => {
  const validadas = [
    { ref: 'A', desc: 'Agenda', cant: 3, precio: 4, precioCliente: 9 },
    { ref: 'B', desc: 'Bloc', cant: 2, precio: 1 },
    { ref: 'C', desc: 'Carpeta', cant: 1, precio: 2 },
  ];
  const factura = [{ ref: 'A', cant: 1, precio: 4 }, { ref: 'C', cant: 1, precio: 2 }, { ref: 'Z', cant: 5, precio: 1 }];
  assert.deepEqual(CP.restosDeFactura(validadas, factura), [
    { ref: 'A', desc: 'Agenda', ean: '', cant: 2, precio: 9 },
    { ref: 'B', desc: 'Bloc', ean: '', cant: 2, precio: 1 },
  ]);
  assert.deepEqual(CP.restosDeFactura(validadas, validadas), [], 'si cuadra, no hay restos');
});

// ── Nube ─────────────────────────────────────────────────────────────────────
const estado = () => ({
  pedidos: [{ id: 'p1', numero: '1', lineas: [{ ref: 'A', cant: 1 }] }, { id: 'p2', numero: '2', lineas: [] }],
  restos: [{ id: 'r1', ref: 'A', pendiente: 1 }], notas: [],
  catalogos: { FINOCAM: { items: { A: { d: 'Agenda' } } } }, historial: {},
});
/** Una nube de mentira con las mismas reglas que cp_guardar. */
function nubeFalsa() {
  const filas = new Map();
  let reloj = 0;
  return {
    filas,
    guardar(docs, autor) {
      return docs.map((d) => {
        const k = d.coleccion + '/' + d.id;
        const f = filas.get(k);
        const base = { coleccion: d.coleccion, id: d.id };
        if (d.version == null ? f : (!f || f.version !== d.version)) return f ? { ...base, ok: false, version: f.version, datos: f.datos, borrado: f.borrado, autor: f.autor } : { ...base, ok: false, version: null };
        const n = { coleccion: d.coleccion, id: d.id, datos: JSON.parse(JSON.stringify(d.datos)), borrado: d.borrado, version: f ? f.version + 1 : 1, autor, actualizado: ++reloj };
        filas.set(k, n);
        return { ...base, ok: true, version: n.version };
      });
    },
    bajar(desde) { return [...filas.values()].filter((f) => f.actualizado > (desde || 0)).map((f) => JSON.parse(JSON.stringify(f))); },
  };
}
function sincronizar(E, meta, nube, autor) {
  const conflictos = [];
  const b = CP.integrarBajada(E, meta, nube.bajar(0)); conflictos.push(...b.conflictos);
  const env = CP.cambiosPendientes(E, meta);
  const s = CP.integrarSubida(E, meta, env, nube.guardar(env, autor)); conflictos.push(...s.conflictos);
  return conflictos;
}

test('nube: la firma no depende del orden de las claves (la nube lo cambia)', () => {
  assert.equal(CP.firma({ b: 1, a: [1, { y: 2, x: null }] }), CP.firma({ a: [1, { x: null, y: 2 }], b: 1 }));
  assert.notEqual(CP.firma({ a: 1 }), CP.firma({ a: 2 }));
  assert.equal(CP.firma({ a: undefined, b: 1 }), CP.firma({ b: 1 }));
});

test('nube: el primer dispositivo lo sube todo; otro vacío lo recibe igual', () => {
  const nube = nubeFalsa();
  const A = estado(); const mA = {};
  assert.equal(CP.cambiosPendientes(A, mA).length, 4, '2 pedidos, 1 resto, 1 catálogo');
  assert.deepEqual(sincronizar(A, mA, nube, 'admin'), []);
  assert.equal(CP.cambiosPendientes(A, mA).length, 0, 'ya no queda nada por subir');
  const B = { pedidos: [], restos: [], notas: [], catalogos: {}, historial: {} }; const mB = {};
  assert.deepEqual(sincronizar(B, mB, nube, 'luis'), []);
  assert.equal(CP.firma(B), CP.firma(A));
  assert.equal(CP.cambiosPendientes(B, mB).length, 0);
});

test('nube: cambios en pedidos distintos se juntan; borrar llega a los demás', () => {
  const nube = nubeFalsa();
  const A = estado(); const mA = {}; sincronizar(A, mA, nube, 'admin');
  const B = { pedidos: [], restos: [], notas: [], catalogos: {}, historial: {} }; const mB = {}; sincronizar(B, mB, nube, 'luis');
  A.pedidos[0].numero = '1-A';
  B.pedidos.find((p) => p.id === 'p2').numero = '2-B';
  B.restos = [];
  assert.deepEqual(sincronizar(A, mA, nube, 'admin'), []);
  assert.deepEqual(sincronizar(B, mB, nube, 'luis'), []);
  assert.deepEqual(sincronizar(A, mA, nube, 'admin'), []);
  assert.deepEqual(A.pedidos.map((p) => p.numero).sort(), ['1-A', '2-B']);
  assert.deepEqual(B.pedidos.map((p) => p.numero).sort(), ['1-A', '2-B']);
  assert.equal(A.restos.length, 0, 'el resto borrado en B desaparece en A');
});

test('nube: el mismo pedido cambiado en dos sitios no se pisa en silencio', () => {
  const nube = nubeFalsa();
  const A = estado(); const mA = {}; sincronizar(A, mA, nube, 'admin');
  const B = { pedidos: [], restos: [], notas: [], catalogos: {}, historial: {} }; const mB = {}; sincronizar(B, mB, nube, 'luis');
  A.pedidos[0].numero = 'de A';
  B.pedidos.find((p) => p.id === 'p1').numero = 'de B';
  assert.deepEqual(sincronizar(A, mA, nube, 'admin'), [], 'A sube primero');
  const c = sincronizar(B, mB, nube, 'luis');
  assert.equal(c.length, 1, 'B se entera del choque');
  assert.equal(c[0].nuestro.numero, 'de B', 'lo de B queda apartado, no perdido');
  assert.equal(c[0].autor, 'admin');
  assert.equal(B.pedidos.find((p) => p.id === 'p1').numero, 'de A', 'manda lo que ya estaba en la nube');
  assert.equal(CP.cambiosPendientes(B, mB).length, 0);
});

test('nube: sin cobertura se acumula y sube al volver; un borrado sin subir no resucita', () => {
  const nube = nubeFalsa();
  const A = estado(); const mA = {}; sincronizar(A, mA, nube, 'admin');
  A.pedidos.push({ id: 'p3', numero: '3', lineas: [] });
  A.pedidos[0].numero = 'otro';
  A.pedidos = A.pedidos.filter((p) => p.id !== 'p2');
  const pend = CP.cambiosPendientes(A, mA);
  assert.deepEqual(pend.map((d) => [d.id, d.borrado]).sort(), [['p1', false], ['p2', true], ['p3', false]]);
  assert.deepEqual(sincronizar(A, mA, nube, 'admin'), []);
  assert.equal(nube.filas.get('pedidos/p2').borrado, true);
  assert.equal(CP.cambiosPendientes(A, mA).length, 0);
  sincronizar(A, mA, nube, 'admin');
  assert.equal(A.pedidos.some((p) => p.id === 'p2'), false);
});

test('pedido de Géminis («Propuesta de Pedido»): la cantidad es «Unidades», la referencia «Rfc.Compra»', () => {
  // Datos inventados con el mismo diseño de columnas que el PDF real.
  const texto = [
    'SUMINISTROS DE OFICINA Propuesta de Pedido',
    'Proveedor N.I.F. X Fecha Pedido Fecha llegada',
    '( 01234 ) PROVEEDOR PRUEBA 08/10/2026 20/10/2026',
    'Almacén 12345',
    'Cod.Venta R Rfc.Compra Descripción Bultos cajas',
    'Caja Unidades Precio Desc.Bon Cod. Barras Imágen',
    '111 AB-1 BANDEJA APILABLE (Azul) 0 3 10 30 1,065 8400000000017',
    '222 XY-9 PORTA-Folleto 1-Cajetin 1/3 C-104 0 0 60 12 2,209 8400000000024',
    '333 Z-5 PIZARRA 120x150 0 0 0 6 67,808 10,00 8400000000031',
    '444 RE-1 SIN CODIGO DE BARRAS 0 0 0 20 0,000',
    '08/10/20 Pág. 1',
  ];
  const r = CP.leerPedidoGeminis(texto);
  assert.equal(r.proveedor, 'PROVEEDOR PRUEBA');
  assert.equal(r.numero, '12345');
  assert.deepEqual(r.lineas.map((l) => [l.referencia, l.cantidad, l.precio, l.descuentos, l.ean]), [
    ['AB-1', '30', '1,065', '', '8400000000017'],
    ['XY-9', '12', '2,209', '', '8400000000024'], // 0 cajas × 60 por caja, pero son 12 unidades
    ['Z-5', '6', '67,808', '10,00', '8400000000031'],
    ['RE-1', '20', '0,000', '', ''],
  ]);
  const d = CP.lineasDeDocumento(r);
  assert.deepEqual(d.lineas.map((l) => l.cant), [30, 12, 6, 20]);
  assert.equal(CP.leerPedidoGeminis(['FACTURA', 'Ref Cantidad Precio', 'A 1 2,00']), null, 'otro documento: a la IA');
});

test('Excel de Géminis: la columna UdsXCja va en la plantilla pero en blanco; la cantidad, en «Pedidas»', () => {
  const aoa = CP.filasGeminis([{ ref: 'A', desc: 'X', cant: 30, udsCaja: 10, precio: 1.065, dto: 0 }], {}, {});
  const P = CP.PLANTILLA_GEMINIS;
  const fila = aoa[P.primeraFila - 1];
  assert.equal(aoa[P.primeraFila - 2][P.columnas.indexOf('udsCaja')], 'UdsXCja', 'la columna sigue en la plantilla');
  assert.equal(fila[P.columnas.indexOf('udsCaja')], '');
  assert.equal(fila[P.columnas.indexOf('cant')], 30);
});

test('envío al proveedor: un bloque por pedido (nº y cliente), sin precios, por orden de nº', () => {
  const r = CP.pedidosParaProveedor([
    { numero: '10', cliente: 'CLIENTE B', lineas: [{ ref: 'A1', desc: 'AGENDA', cant: 2, precio: 3.5 }, { ref: '', desc: '', cant: 1 }] },
    { numero: '9', cliente: 'CLIENTE A', lineas: [{ ref: 'E1', desc: 'EXPOSITOR', cant: 1, exp: true, precio: 0 }, { ref: 'Z', cant: 0 }] },
    { numero: '11', cliente: 'VACÍO', lineas: [] },
  ]);
  assert.deepEqual(r, [
    { numero: '9', cliente: 'CLIENTE A', lineas: [{ cant: 1, exp: true, ref: 'E1', desc: 'EXPOSITOR' }] },
    { numero: '10', cliente: 'CLIENTE B', lineas: [{ cant: 2, exp: false, ref: 'A1', desc: 'AGENDA' }] },
  ]);
  assert.ok(!JSON.stringify(r).includes('precio'), 'sin precios');
});

test('propuesta con dos «TOTAL» (neto por unidad y de la línea) y el descuento en euros', () => {
  const { lineas } = CP.leerPropuesta([
    ['REF', 'DESCRIPCION', 'EAN', 'P.TARIFA', 'DESCUENTO', 'TOTAL', 'CANTIDAD', 'TOTAL'],
    ['A1', 'LAPICES', '', 8.28, 2.2356, 6.0444, 12, 72.5328],
    ['A2', 'ESTUCHE', '', 2.52, 0.6804, 1.8396, 48, 88.3008],
    ['A3', 'CON PORCENTAJE', '', 10, 0.27, 7.3, 2, 14.6],
  ]);
  assert.deepStrictEqual(lineas.map((l) => [l.ref, l.precio, l.dtos[0], l.importe, CP.precioNeto(l)]), [
    ['A1', 8.28, 27, 72.5328, 6.0444],
    ['A2', 2.52, 27, 88.3008, 1.8396],
    ['A3', 10, 27, 14.6, 7.3],
  ]);
});

test('reclamar un precio que no cuadra, con el motivo escrito para el proveedor', () => {
  const filas = CP.compararPedido(
    [{ ref: 'P1', desc: 'ESTUCHE', cant: 10, precio: 2.54 }, { ref: 'P2', desc: 'LAPICES', cant: 5, precio: 1 }, { ref: 'P3', desc: 'CERAS', cant: 4, precio: 1 }],
    [{ ref: 'P1', desc: 'ESTUCHE', cant: 10, precio: 3.1 }, { ref: 'P2', desc: 'LAPICES', cant: 5, precio: 1 }],
    { comparar: 'neto', tolerancia: CP.TOLERANCIA.reposicion });
  const P1 = filas.find((f) => f.ref === 'P1');
  assert.ok(CP.accionesPara(P1, 'reposicion').includes('reclamar'), 'reposición');
  assert.ok(CP.accionesPara(P1, 'comercial').includes('reclamar'), 'comercial');
  const dec = { P1: { accion: 'reclamar', motivo: 'Nos lo pasasteis a 2,54 en la oferta' }, P3: { accion: 'reclamar' } };
  const r = CP.aReclamar(filas, dec);
  assert.deepEqual(r.precios.map((x) => [x.ref, x.antes, x.ahora, x.nota]), [['P1', 2.54, 3.1, 'Nos lo pasasteis a 2,54 en la oferta']]);
  assert.deepEqual(r.faltan.map((x) => x.ref), ['P3']);
  const t = CP.textoReclamacion('LANCELOT', [{ numero: '95042', cliente: 'Reposición', ...r }]);
  assert.match(t, /P1  ESTUCHE  →  el precio neto no cuadra: 3,10 € por unidad en lugar de 2,54 €\n      Nota: Nos lo pasasteis a 2,54 en la oferta/);
  assert.match(t, /P3  CERAS  →  no viene \(pedimos 4 uds\.\)/);
  assert.doesNotMatch(t, /P2/, 'lo que cuadra no sale');
  // Validar no depende de reclamar un precio: el Excel lleva lo que factura el proveedor
  assert.deepEqual(CP.aplicarDecisiones(filas, dec).lineas.map((l) => [l.ref, l.cant]), [['P1', 10], ['P2', 5]]);
});

test('hojas del pedido: el total puesto a mano manda sobre lo leído en las fotos', () => {
  const fotos = [{ nombre: 'a.jpg', hoja: '1/3' }, { nombre: 'b.jpg', hoja: '2/3' }];
  assert.deepEqual(CP.hojasDelPedido(fotos).faltan, [3], 'leído: 3 hojas, falta la 3');
  const r = CP.hojasDelPedido(fotos, 2);
  assert.deepEqual([r.total, r.faltan, r.aMano], [2, [], true]);
  assert.deepEqual(CP.hojasDelPedido(fotos, '').faltan, [3], 'vacío: se vuelve a lo leído');
  assert.deepEqual(CP.hojasDelPedido([{ nombre: 'a.jpg', hoja: '1/1' }], 2).faltan, [2], 'también sirve para avisar de una hoja que no se leyó como tal');
});

test('aviso por correo: un resumen por campaña, campañas nuevas marcadas y sin reposición', async () => {
  const { resumenAvisos } = await import('../netlify/functions/avisos-pedidos.mjs');
  const ped = (tipo, proveedor, campana, numero, cliente, n) => ({ datos: { tipo, proveedor, campana, numero, cliente, lineas: Array(n).fill({}) }, autor: 'miguel@ofipapel.internal' });
  const r = resumenAvisos([
    ped('comercial', 'FINOCAM', '2027', '21', 'TORRES', 3),
    ped('comercial', 'MIQUELRIUS', 'Navidad', '1', 'PAPELES', 1),
    ped('comercial', 'FINOCAM', '2027', '9', 'ALDAYO', 2),
    ped('reposicion', 'LANCELOT', '', '', '', 30),
  ], ['FINOCAM|2027']);
  assert.equal(r.n, 3, 'la reposición no cuenta');
  assert.match(r.asunto, /Campaña nueva: MIQUELRIUS · Navidad y más pedidos/);
  assert.match(r.texto, /FINOCAM · 2027\n  - nº 09 · ALDAYO — 2 líneas · subido por miguel\n  - nº 21 · TORRES/);
  assert.match(r.texto, /🆕 CAMPAÑA NUEVA · MIQUELRIUS · Navidad/);
  assert.doesNotMatch(r.texto, /LANCELOT/);
  assert.equal(resumenAvisos([ped('reposicion', 'X', '', '', '', 1)], []), null);
  assert.match(resumenAvisos([ped('comercial', 'FINOCAM', '2027', '22', 'A', 1)], ['FINOCAM|2027']).asunto, /^1 pedido nuevo: FINOCAM · 2027$/);
});

test('tarifa del proveedor: referencia + descripción o precio, prefiere «Precio» a «PVP» y se salta lo que no es artículo', () => {
  const r = CP.leerTarifa([
    ['TARIFA FINOCAM 2027'], [],
    ['Código', 'Descripción', 'EAN', 'PVP', 'Precio'],
    ['780100027', 'CALENDARIO A4', '8412345678901', '5,90', 3.25],
    ['', 'FAMILIA: AGENDAS', '', '', ''],
    ['782000327', 'AGENDA DÍA PÁGINA', '', 8, '4,10'],
    ['TOTAL', '', '', '', ''],
  ]);
  assert.equal(r.n, 2);
  assert.deepEqual(r.items['780100027'], { d: 'CALENDARIO A4', p: 3.25, ean: '8412345678901' });
  assert.equal(r.items['782000327'].p, 4.1);
  // Solo referencia y descripción (sin precios) también vale
  assert.equal(CP.leerTarifa([['Referencia', 'Denominación'], ['A-1', 'BOLÍGRAFO']]).items['A-1'].d, 'BOLÍGRAFO');
  assert.throws(() => CP.leerTarifa([['Cantidad', 'Importe'], [1, 2]]), /columna «Referencia»/);
});

test('precio de venta de una tarifa: sin ajuste, incremento sobre coste o beneficio sobre venta', () => {
  assert.equal(CP.precioVenta(10, { modo: 'ninguno' }), 10);
  assert.equal(CP.precioVenta('10', null), 10);
  assert.equal(CP.precioVenta(10, { modo: 'incremento', pct: 30 }), 13);
  assert.equal(CP.precioVenta(7, { modo: 'beneficio', pct: 30 }), 10, '30 % de beneficio sobre la venta: 7 / 0,7');
  assert.equal(CP.precioVenta(3.33, { modo: 'beneficio', pct: '25' }), 4.44);
  assert.equal(CP.precioVenta(null, { modo: 'incremento', pct: 30 }), null);
  assert.equal(CP.precioVenta(5, { modo: 'beneficio', pct: 100 }), 5, 'un 100 % no tiene sentido: se deja el precio');
});

test('proveedor de netos con margen: se compara en precio de venta, al cliente la venta, a Géminis y al proveedor el coste', () => {
  const ajusteVenta = { modo: 'beneficio', pct: 30 };
  assert.equal(CP.precioCoste(10, ajusteVenta), 7);
  assert.equal(CP.precioCoste(13, { modo: 'incremento', pct: 30 }), 10);
  const filas = CP.compararPedido(
    [{ ref: 'A', cant: 2, precio: 10 }, { ref: 'B', cant: 1, precio: 5 }, { ref: 'C', cant: 1, precio: 10 }],
    [{ ref: 'A', cant: 2, precio: 7 }, { ref: 'B', cant: 1, precio: 4 }],
    { comparar: 'neto', tolerancia: CP.TOLERANCIA.comercial, ajusteVenta });
  const A = filas.find((f) => f.ref === 'A');
  const B = filas.find((f) => f.ref === 'B');
  assert.equal(A.estado, 'ok', '7 de coste con 30 % de beneficio = 10, lo que apuntó el comercial');
  assert.equal(A.ventaPropuesta, 10);
  assert.equal(B.ventaPropuesta, 5.71);
  assert.match(B.motivos.find((m) => m.tipo === 'precio').texto, /Precio de venta 5,00 → 5,71 .*coste del proveedor 4,00 con 30 % de beneficio/);
  const dec = { B: { accion: 'aceptar' }, C: { accion: 'mantener' } };
  const r = CP.aplicarDecisiones(filas, dec, { comercial: true });
  const l = (ref) => r.lineas.find((x) => x.ref === ref);
  assert.deepEqual([l('A').precioCliente, l('A').precio], [10, 7], 'al cliente la venta; a Géminis el coste');
  assert.deepEqual([l('B').precioCliente, l('B').precio], [5.71, 4]);
  assert.deepEqual([l('C').precioCliente, l('C').precio], [10, 7], 'sin línea del proveedor: el coste sale del precio apuntado');
  // Reclamar el precio de B: al proveedor, en coste (nunca el precio de venta ni el margen)
  const rec = CP.aReclamar(filas, { B: { accion: 'reclamar' } });
  assert.deepEqual(rec.precios.map((x) => [x.antes, x.ahora]), [[3.5, 4]]);
  // Sin ajuste (Finocam), todo como antes
  const [f] = CP.compararPedido([{ ref: 'A', cant: 1, precio: 10 }], [{ ref: 'A', cant: 1, precio: 7 }], { comparar: 'neto', ajusteVenta: { modo: 'ninguno' } });
  assert.equal(f.ventaPropuesta, null);
  assert.equal(f.estado, 'cambio');
});

test('Excel de Géminis, plantilla «Luis» (PEDIDOS_PROVEEDORES_ALTA_NUEVOS.xlt): títulos en la fila 11 y artículos desde la 12', () => {
  const aoa = CP.filasGeminisLuis([
    { ref: 'AL000177', desc: '12 LAPICES', ean: '8413240476511', cant: 12, precio: 8.28, dto: 27, total: 72.53 },
    { ref: 'UA000570', alta: true, descAlta: 'UA000570>MALETIN', desc: 'MALETIN', cant: 5, precio: 15.92, dto: 27, total: 58.11 },
  ], { proveedor: 'LANCELOT TRADING SL', numero: '95042', fecha: '20/10/2026', almacen: '04' }, { igic: 7 });
  assert.deepEqual([aoa[1][2], aoa[1][4], aoa[1][5]], ['PROPUESTA    DE     PEDIDO', 'ALMACEN', '04']);
  assert.deepEqual([aoa[3][2], aoa[3][3]], ['PROVEEDOR;', 'LANCELOT TRADING SL']);
  assert.deepEqual([aoa[5][2], aoa[5][3], aoa[5][4], aoa[5][5]], ['Nº Pedido', '95042', 'FECHA', '20/10/2026']);
  assert.deepEqual([aoa[9][1], aoa[9][2]], ['MARCA', 'Rfecia. Compra']);
  assert.deepEqual(aoa[10].slice(0, 14), ['Codigo I.S.B.N.', 'EDITORIAL', 'Rfcia. Proveedor', 'DESCRIPCION', 'Caja', 'Ud./Caja', 'Udes', 'Precio U.', 'Dcto', 'Igic', 'IMPORTE', 'RECONVERTIR', 'COD. FAMILIA', 'PADRE']);
  assert.deepEqual(aoa[11].slice(0, 11), ['8413240476511', '', 'AL000177', '12 LAPICES', '', '', 12, 8.28, 27, 7, 72.53]);
  assert.deepEqual(aoa[12].slice(2, 4), ['2 ALTA NUEVA', 'UA000570>MALETIN']);
  assert.equal(aoa.length, 13, 'sin fila de total: la plantilla no la lleva');
  // La marca elegida en la campaña va en la columna B (EDITORIAL) de cada artículo
  const conMarca = CP.filasGeminisLuis([{ ref: 'A', cant: 1, precio: 1 }, { ref: 'B', cant: 1, precio: 1 }], { proveedor: 'FINOCAM', marca: 'FINOCAM' }, {});
  assert.deepEqual(conMarca.slice(11).map((f) => f[1]), ['FINOCAM', 'FINOCAM']);
});

test('Factura agrupada (Apli/Miquelrius): un documento por «Pedido Cliente», cada uno a su pedido', () => {
  const l = (ref, pedido) => ({ referencia: ref, ean: '', descripcion: ref, cantidad: '1', udsCaja: '', precio: '10,000', descuentos: '29', importe: '7,10', duda: '', pedido });
  const res = { proveedor: 'APLI PAPER S.A.U.', tipoDocumento: 'factura', numero: '1771692', fecha: '', pedidoCliente: 'Pedido 5_ B2F; Pedido 6_B2F', baseImponible: '21,30', dtoGlobal: '', notas: '',
    lineas: [l('MR8280', 'Pedido 5_ B2F'), l('MR13428', 'Pedido 5_ B2F'), l('MR19683', 'Pedido 6_B2F')] };
  const partes = CP.separarPorPedido(res).map(CP.lineasDeDocumento);
  assert.deepEqual(partes.map((d) => [d.cabecera.numeroPedido, d.lineas.map((x) => x.ref).join(',')]), [[5, 'MR8280,MR13428'], [6, 'MR19683']]);
  assert.equal(partes[0].control.cuadra, null, 'la base imponible es la del total: en las partes no se compara');
  // De un solo pedido (o sin el campo), el documento tal cual
  assert.equal(CP.separarPorPedido(Object.assign({}, res, { lineas: res.lineas.map((x) => Object.assign({}, x, { pedido: '' })) })).length, 1);
});

test('Factura de toda la campaña junta: cada línea al pedido que pidió esa referencia; lo demás, sobrante', () => {
  const peds = [
    { id: 'a', numero: '2', lineas: [{ ref: 'MR1', cant: 2 }, { ref: 'MR2', cant: 1 }] },
    { id: 'b', numero: '1', lineas: [{ ref: 'MR1', cant: 1 }] },
    { id: 'c', numero: '3', lineas: [{ ref: 'MR1', cant: 5 }] },
  ];
  const r = CP.repartirPorReferencias([
    { ref: 'MR1', cant: 4, precio: 10, dtos: [], importe: 40 },
    { ref: 'MR2', cant: 3, precio: 5, dtos: [], importe: 15 },
    { ref: 'MR9', cant: 1, precio: 2, dtos: [], importe: 2 },
  ], peds);
  const de = (id) => (r.porPedido.get(id) || []).map((l) => `${l.ref}x${l.cant}=${l.importe}`).join(' ');
  assert.equal(de('b'), 'MR1x1=10', 'por nº de pedido: primero el 1');
  assert.equal(de('a'), 'MR1x2=20 MR2x1=5');
  assert.equal(de('c'), 'MR1x1=10');
  assert.deepEqual(r.sobrantes.map((l) => `${l.ref}x${l.cant}=${l.importe}`), ['MR2x2=10', 'MR9x1=2']);
  // Con bloque («Pedido 3_…»), primero el pedido de ese nº
  const r2 = CP.repartirPorReferencias([{ ref: 'MR1', cant: 1, importe: 10, bloque: 'Pedido 3_ Gift' }], peds);
  assert.deepEqual([...r2.porPedido.keys()], ['c']);
});

test('Foto repetida por contenido: dos fotos con las mismas referencias y cantidades, aunque no traigan nº de hoja', () => {
  const l = (ref, cant, foto) => ({ ref, cant, foto });
  const lineas = [l('MR1', 2, 'a.jpg'), l('MR12074', 1, 'b.jpg'), l('MR13428', 1, 'b.jpg'), l('MR13428', 1, 'c.jpg'), l('MR12074', 1, 'c.jpg')];
  assert.deepEqual(CP.fotosRepetidas(lineas), [{ foto: 'c.jpg', igualA: 'b.jpg' }]);
  assert.deepEqual(CP.fotosRepetidas([l('MR1', 2, 'a.jpg'), l('MR1', 3, 'b.jpg')]), [], 'otra cantidad: no es la misma hoja');
});

test('Último control: sustitución decidida a mano (el proveedor manda otro artículo en lugar del pedido)', () => {
  const val = [{ ref: '785120027', desc: 'CAL.PARED', cant: 2, precio: 5 }, { ref: '792020327', desc: 'CAL.PARED ART', cant: 1, precio: 5 }];
  const fac = [{ ref: '787060127', desc: 'CAL.SOBREMESA', cant: 2, precio: 5 }, { ref: '792000327', desc: 'CAL.SOBREMESA ART', cant: 2, precio: 5 }];
  const r = CP.controlFactura(val, fac, { sustituciones: { '785120027': '787060127', '792020327': '792000327' } });
  assert.equal(r.faltan.length, 0);
  assert.deepEqual(r.sobran.map((x) => [x.ref, x.cant]), [['792000327', 1]], 'sustituye 1 de 2: el otro sigue de más');
  assert.equal(r.cambiosRef.filter((x) => x.manual).length, 2);
  assert.equal(CP.restosDeFactura(val, fac, { sustituciones: { '785120027': '787060127' } }).map((x) => x.ref).join(), '792020327', 'lo sustituido no va a Restos');
});

test('Reparto por referencias: el bloque que nombra al cliente («Pedido Aliz I_Gift») va a ese pedido antes que a otros que piden lo mismo', () => {
  const pedidos = [
    { id: 'a', numero: '5', cliente: 'PAPELES', lineas: [{ ref: 'MR1', cant: 1 }] },
    { id: 't', numero: '25', cliente: 'ALIZ (TIENDA)', lineas: [{ ref: 'MR1', cant: 1 }] },
  ];
  const r = CP.repartirPorReferencias([{ ref: 'MR1', cant: 1, importe: 10, bloque: 'Pedido Aliz I_Gift' }], pedidos);
  assert.deepEqual([...r.porPedido.keys()], ['t']);
  const r2 = CP.repartirPorReferencias([{ ref: 'MR1', cant: 1, importe: 10, bloque: 'Pedido 4_ Gift' }], pedidos);
  assert.deepEqual([...r2.porPedido.keys()], [], 'el bloque «Pedido 4» no es del pedido 5 aunque pida lo mismo');
  assert.strictEqual(r2.sobrantes.length, 1);
});

test('Factura por bloques: manda el bloque, entero, y nunca se compensa con otros pedidos', () => {
  const pedidos = [
    { id: 'p15', numero: '15', cliente: 'LA PAGINA', lineas: [{ ref: 'F1', cant: 1 }, { ref: 'F2', cant: 1 }, { ref: 'EXP', cant: 1 }] },
    { id: 'p17', numero: '17', cliente: 'TANIA', lineas: [{ ref: 'C1', cant: 2 }, { ref: 'EXP', cant: 1 }] },
    { id: 'p26', numero: '26', cliente: 'OFIPAPEL (TIENDA)', lineas: [{ ref: 'C1', cant: 1 }, { ref: 'G1', cant: 5 }, { ref: 'G2', cant: 5 }] },
  ];
  const lineas = [
    { ref: 'F1', cant: 1, bloque: 'Pedido 15_ Gift' }, { ref: 'EXP', cant: 1, bloque: 'Pedido 15_ Gift' }, { ref: 'NUEVA', cant: 2, bloque: 'Pedido 15_ Gift' },
    // La tienda («Gift» sin nº) recibe 3 y pidió 1: las 2 de más NO van a Tania, que también pide C1.
    { ref: 'C1', cant: 3, bloque: 'Gift' }, { ref: 'G1', cant: 5, bloque: 'Gift' }, { ref: 'G2', cant: 5, bloque: 'Gift' },
    // Un «Pedido 5_ B2F» de otra campaña: nº que no casa con nada que se pida aquí.
    { ref: 'B2F1', cant: 1, bloque: 'Pedido 5_ B2F' },
  ];
  const r = CP.repartirPorReferencias(lineas, pedidos);
  const de = (id) => (r.porPedido.get(id) || []).map((l) => `${l.ref}x${l.cant}`).sort();
  assert.deepEqual(de('p15'), ['EXPx1', 'F1x1', 'NUEVAx2'], 'el bloque entero a su pedido, también lo que no pidió (para decidir allí)');
  assert.deepEqual(de('p26'), ['C1x3', 'G1x5', 'G2x5'], 'lo de más se queda en su bloque');
  assert.deepEqual(de('p17'), [], 'a Tania no se le da nada de otro bloque');
  assert.deepEqual(r.sobrantes.map((l) => l.ref), ['B2F1']);
  assert.deepEqual(r.bloquesSinDueno, ['Pedido 5_ B2F']);
  // El dueño ya está validado (no admite reparto): su bloque queda aparte, marcado como suyo, sin ir a otro.
  const r3 = CP.repartirPorReferencias([{ ref: 'C1', cant: 2, bloque: 'Pedido 17_ Gift' }], [pedidos[2]], { todos: pedidos });
  assert.deepEqual([...r3.porPedido.keys()], []);
  assert.deepEqual(r3.sobrantes.map((l) => [l.ref, l.duenoId]), [['C1', 'p17']]);
});

test('Restos que llegan en la factura siguiente: lo que sobra del reparto se da al resto pendiente más antiguo', () => {
  const restos = [
    { id: 'r2', ref: 'MR1', cliente: 'B', numero: '8', proveedor: 'MIQUELRIUS', fecha: '2026-10-10', pendiente: 2, anulado: false },
    { id: 'r1', ref: 'MR1', cliente: 'A', numero: '4', proveedor: 'MIQUELRIUS', fecha: '2026-10-05', pendiente: 1, anulado: false },
    { id: 'r3', ref: 'MR2', cliente: 'A', numero: '4', proveedor: 'OTRO', fecha: '2026-10-05', pendiente: 1, anulado: false },
  ];
  const r = CP.restosQueLlegan(restos, [{ ref: 'MR1', cant: 4, importe: 40, origen: 'f2.pdf' }, { ref: 'MR2', cant: 1, importe: 5 }], 'MIQUELRIUS');
  assert.deepEqual(r.asignaciones.map((a) => [a.restoId, a.cant, a.origen]), [['r1', 1, 'f2.pdf'], ['r2', 2, 'f2.pdf']]);
  assert.deepEqual(r.sobrantes.map((l) => [l.ref, l.cant, l.importe]), [['MR1', 1, 10], ['MR2', 1, 5]], 'otro proveedor no cuenta; lo que sobra conserva su parte del importe');
});

test('Códigos internos desde la liquidación de Géminis: por referencia, por EAN o por referencia sin la cola del año', () => {
  const g = [
    { codVenta: '141161', referencia: '6211630', ean: '8422952403975' },
    { codVenta: '79139', referencia: '7801800', ean: '' }, { codVenta: '79139', referencia: '7801800', ean: '' },
    { codVenta: '555', referencia: 'X-1', ean: '8400000000001' },
    { codVenta: '1', referencia: '1234567', ean: '' }, { codVenta: '2', referencia: '12345678', ean: '' },
    { codVenta: '900', referencia: '00839', ean: '' },
  ];
  const r = CP.codigosInternos([
    { ref: '621163027' }, { ref: '780180027' }, { ref: 'Y-9', ean: '8400000000001' }, { ref: '123456789' }, { ref: '839' }, { ref: 'NADA' },
  ], g);
  assert.deepEqual(r, { 621163027: '141161', 780180027: '79139', 'Y-9': '555', 839: '900' }, 'dos candidatos con códigos distintos: no se adivina');
});

test('Excel de Géminis: las referencias de Finocam van sin el año del final', () => {
  assert.equal(CP.refParaGeminis('621163027', 'FINOCAM'), '6211630');
  assert.equal(CP.refParaGeminis('1984293', 'FINOCAM'), '1984293', 'las de 7 cifras, tal cual');
  assert.equal(CP.refParaGeminis('621163027', 'MIQUELRIUS'), '621163027', 'solo Finocam');
  assert.equal(CP.refParaGeminis('MR4566', 'FINOCAM'), 'MR4566');
});

test('Emparejar referencias que el proveedor factura con otro código (Fellowes)', () => {
  const ped = [
    { ref: 'ESP010', cant: 20, desc: 'negro ESPIRAL METAL 5:1 10mm NEGROS 60-H' },
    { ref: '943162', cant: 6, desc: 'ESPIRAL METAL 5:1 16mm NEGROS 140-H' },
    { ref: 'IBESP925136', cant: 2, desc: 'ESPIRAL METAL 5:1 36mm BLANCA 320-H' },
    { ref: 'ESP905140', cant: 2, desc: 'ESPIRAL METAL 5:1 40mm Negro 360-H' },
    { ref: '53088', cant: 70, desc: 'FUNDA PLASTIFICAR A-3 175mi' },
    { ref: '4812170', cant: 20, desc: 'REPOSAPIES Fellowes' },
    { ref: '54775', cant: 5, desc: 'TAPAS Encuadernar' },
    { ref: 'IGUAL', cant: 1, desc: 'X' },
  ];
  const pro = [
    { ref: '5110301', cant: 20, desc: 'ESP10N - METAL COILS 10MM BLACK 100PK' },
    { ref: '5110601', cant: 6, desc: 'ESP16N - METAL COILS 16MM BLACK 100PK' },
    { ref: '5114301', cant: 2, desc: 'ESP36B - METAL COILS 36MM WHITE 25PK' },
    { ref: '5111901', cant: 2, desc: 'ESP40N - METAL COILS 40MM BLACK 25PK' },
    { ref: '5308803', cant: 1, desc: 'LAMINATING POUCH A3 175MIC 100PK' },
    { ref: '48121-70', cant: 20, desc: 'REPOSAPIÉS AJUSTABLE' },
    { ref: '5477502', cant: 5, desc: '50PK POLYPROP. COVERS BLACK' },
    { ref: 'IGUAL', cant: 1, desc: 'X' },
  ];
  assert.deepEqual(CP.emparejarReferencias(ped, pro), {
    '48121-70': '4812170', 5308803: '53088', 5477502: '54775',
    5110301: 'ESP010', 5110601: '943162', 5114301: 'IBESP925136', 5111901: 'ESP905140',
  });
  // Dos candidatos con la misma medida y cantidad: decide el color («black» = negro)…
  assert.deepEqual(CP.emparejarReferencias([{ ref: 'A', cant: 2, desc: '24mm negro' }], [{ ref: 'B', cant: 2, desc: '24MM black' }, { ref: 'C', cant: 2, desc: '24MM white' }]), { B: 'A' });
  // …y sin nada que los distinga, no se adivina
  assert.deepEqual(CP.emparejarReferencias([{ ref: 'A', cant: 2, desc: '24mm tapa' }], [{ ref: 'B', cant: 2, desc: '24MM caja' }, { ref: 'C', cant: 2, desc: '24MM bolsa' }]), {});
});

test('Emparejar referencias: el proveedor pone prefijo y sufijo a nuestro código (Archivo 2000)', () => {
  const ped = ['1106', '64004', '64005', '27104M', '66617', '6142', '11004CSTP', '6157A', '6157', '6156A'].map((ref) => ({ ref, cant: 1, desc: '' }));
  const pro = ['01A1106CSTL', '01C64004PT', '01C64005PT', '01A27104MNE', '01A66617CSTP', '01A6142CSTP', '01A11004CSTP', '01C6157ACSTP', '01C6157CSTP', '01C6156ACSTP'].map((ref) => ({ ref, cant: 1, desc: '' }));
  const r = CP.emparejarReferencias(ped, pro);
  assert.equal(r['01C6157ACSTP'], '6157A');
  assert.equal(r['01C6157CSTP'], '6157');
  assert.equal(r['01A1106CSTL'], '1106');
  assert.equal(Object.keys(r).length, 10);
});

test('Reposición: el proveedor cuenta por cajas y nosotros por unidades; «Mantener» va con su precio', () => {
  const ped = [{ ref: 'L1', cant: 72, precio: 0.24 }, { ref: 'P2', cant: 288, precio: 0.33 }, { ref: 'X3', cant: 10, precio: 1 }];
  const pro = [{ ref: 'L1', cant: 3, precio: 5.79, importe: 17.37 }, { ref: 'P2', cant: 24, precio: 4.27, importe: 102.48 }, { ref: 'X3', cant: 5, precio: 1 }];
  const filas = CP.compararPedido(ped, pro, { comparar: 'neto', tolerancia: CP.TOLERANCIA.reposicion });
  const f = (r) => filas.find((x) => x.ref === r);
  assert.equal(f('L1').porCaja, 24); assert.equal(f('L1').cantPropuesta, 72); assert.equal(f('L1').revisar, false);
  assert.equal(f('P2').porCaja, 12); assert.equal(f('P2').revisar, false, '0,356 frente a 0,33: dentro de la tolerancia de reposición');
  assert.equal(f('X3').porCaja, undefined, 'mitad de cantidad al mismo precio: no es por cajas');
  const r = CP.aplicarDecisiones(filas, { X3: { accion: 'mantener' } }, { comercial: false });
  const l1 = r.lineas.find((l) => l.ref === 'L1');
  assert.equal(l1.cant, 72); assert.equal(l1.importe, 17.37);
  const x3 = r.lineas.find((l) => l.ref === 'X3');
  assert.deepEqual([x3.cant, x3.precio], [10, 1]);
});

test('Pedido de Géminis con miles («1.200») y cajas de nuestro pedido cuando el proveedor manda de más', () => {
  const r = CP.leerPedidoGeminis([
    'Propuesta de Pedido', 'PROVEEDOR PRUEBA', 'Almacén 12345',
    'Cod.Venta R Rfc.Compra Descripción Bultos cajas',
    'Caja Unidades Precio Desc.Bon Cod. Barras Imágen',
    '555 B-1 BOLIGRAFO AZUL 0 432 25 10.800 0,265 8400000000048',
    '666 B-2 BOLIGRAFO NEGRO 0 48 25 1.200 0,216 8400000000055',
  ]);
  assert.deepEqual(r.lineas.map((l) => [l.referencia, l.cantidad, l.udsCaja]), [['B-1', '10800', '25'], ['B-2', '1200', '25']]);
  const ped = [{ ref: 'B-1', cant: 4800, precio: 0.265, udsCaja: '25' }, { ref: 'B-2', cant: 72, precio: 0.241, udsCaja: '6' }];
  const pro = [{ ref: 'B-1', cant: 200, precio: 6.62 }, { ref: 'B-2', cant: 3, precio: 5.785 }];
  const f = CP.compararPedido(ped, pro, { comparar: 'neto', tolerancia: CP.TOLERANCIA.reposicion });
  assert.deepEqual([f[0].porCaja, f[0].cantPropuesta, f[0].revisar], [25, 5000, true], '200 cajas de 25: vienen 200 de más');
  assert.deepEqual([f[1].porCaja, f[1].cantPropuesta], [24, 72], 'sin cuadrar con las uds/caja, vale el múltiplo exacto');
});

test('Faltas y sobras razonadas: errata, pedido equivocado, sustituto y expositor por piezas', () => {
  const F = [
    { ref: 'MR1269', desc: 'BOLIGRAFO CHERRIES', cant: 1, precio: 3.6 },
    { ref: 'MR23646', desc: 'EXP.22 AG.ESPIRAL GRAFICA 27', cant: 1, precio: 191.31 },
    { ref: 'MR500', desc: 'CALENDARIO PARED FLORES', cant: 2, precio: 8 },
  ];
  const S = [
    { ref: 'MR12069', desc: 'BOLIGRAFO CHERRIES', cant: 2, precio: 3.6 },
    { ref: 'MR22296', desc: 'EXP.SOBREMESA VACIO', cant: 1, precio: 0 },
    { ref: 'MR25273', desc: 'AG GRID', cant: 13, precio: 7.37 },
    { ref: 'MR38559', desc: 'AG MIKADO', cant: 9, precio: 10.86 },
    { ref: 'MR600', desc: 'CALENDARIO SOBREMESA FLORES', cant: 2, precio: 8.3 },
    { ref: 'MR777', desc: 'NADA', cant: 3, precio: 1 },
  ];
  const ex = CP.explicarDiferencias(F, S, { otros: [{ pedido: '17', faltan: [{ ref: 'MR777' }], sobran: [] }] });
  const por = (t) => ex.filter((x) => x.tipo === t);
  assert.deepStrictEqual(por('errata').map((x) => [x.falta.ref, x.sobra.ref]), [['MR1269', 'MR12069']]);
  assert.deepStrictEqual(por('otroPedido').map((x) => [x.sobra.ref, x.pedido]), [['MR777', '17']]);
  assert.deepStrictEqual(por('sustituto').map((x) => [x.falta.ref, x.sobra.ref]), [['MR500', 'MR600']]);
  assert.deepStrictEqual(por('expositor').map((x) => x.sobras.map((s) => s.ref).sort()), [['MR22296', 'MR25273', 'MR38559']]);
  // Una cifra cambiada sin casar cantidad y precio no es errata.
  assert.strictEqual(CP.explicarDiferencias([{ ref: 'AB1234', desc: 'X', cant: 1, precio: 5 }], [{ ref: 'AB1235', desc: 'Y', cant: 4, precio: 9 }]).length, 0);
});

test('Excel por factura: facturaDeLinea saca el nº de la línea o del fichero', () => {
  assert.strictEqual(CP.facturaDeLinea({ fra: '0001768607' }), '1768607');
  assert.strictEqual(CP.facturaDeLinea({ origen: '0001769800.pdf' }), '1769800');
  assert.strictEqual(CP.facturaDeLinea({}, '55'), '55');
});

test('Cuadre de artículos: lo facturado tiene que acabar en un cliente', () => {
  const ok = CP.cuadreArticulos([
    { numero: '1', cliente: 'A', validado: true, factura: [{ ref: 'X', cant: 2 }, { ref: 'Y', cant: 1 }], final: [{ ref: 'X', cant: 2 }, { ref: 'Y', cant: 1 }, { ref: 'Z', cant: 3 }] },
  ]);
  assert.deepStrictEqual([ok.facturadas, ok.aClientes, ok.difs.length], [3, 3, 0]);
  const mal = CP.cuadreArticulos([
    { numero: '1', cliente: 'A', validado: true, factura: [{ ref: 'X', cant: 3 }], final: [{ ref: 'X', cant: 2 }] },
    { numero: '2', cliente: 'B', validado: false, factura: [{ ref: 'Y', cant: 1 }], final: [] },
    { numero: '3', cliente: '', sinCliente: true, factura: [{ ref: 'W', cant: 4 }], final: [] },
  ]);
  assert.deepStrictEqual([mal.facturadas, mal.aClientes, mal.sinValidar, mal.sinCliente], [8, 2, 1, 4]);
  assert.deepStrictEqual(mal.difs.map((d) => [d.numero, d.ref, d.facturado, d.aCliente]), [['1', 'X', 3, 2]]);
});

test('Sadipal/Fabriano: altas de solo cifras, códigos viejos y colores en italiano', () => {
  assert.deepStrictEqual(CP.codigosAlta('65900208>SET REGALO SKETCHBOOK'), ['65900208']);
  assert.deepStrictEqual(CP.codigosAlta('06803006/9/7/8/10>SET BOLIGRAFO Inspira'), ['06803006', '06803009', '06803007', '06803008', '06803010']);
  // Un alta guardada antes sin código se arregla sola
  assert.strictEqual(CP.marcarAlta({ ref: 'ALTA-65900208SETREG', alta: true, descAlta: '65900208>SET REGALO SKETCHBOOK', cant: 10 }).ref, '65900208');
  const ped = [
    { ref: '53721297', cant: 240, desc: 'PAPEL FOTOCOPIA A-4 240gr. (Pvp-150-Hojas)' },
    { ref: '61121297', cant: 20, desc: 'PAPEL Fotocopia A-4 80gr. 500-H Color (Amarillo-Claro)' },
    { ref: 'F60621297', cant: 20, desc: 'PAPEL Fotocopia A-4 80gr. 500-H Color (Amarillo-Fuerte)' },
    { ref: '61321297', cant: 5, desc: 'PAPEL Fotocopia A-4 80gr. 500-H Color (Salmon)' },
    { ref: '60121297', cant: 5, desc: 'PAPEL Fotocopia A-4 80gr. 500-H Color (Verde-Fuerte)' },
    { ref: '11406', cant: 30, desc: 'PAPEL CREPE 0,50x250ctm METALIZADO (ORO)' },
    { ref: 'S1545015', cant: 30, desc: 'PAPEL CREPE 0,50ctm x 2,50mts (EXTRA 60%) (Azul-Marino)' },
    { ref: '65900208', cant: 10, desc: '65900208>SET REGALO SKETCHBOOK', alta: true },
    { ref: '07722714', cant: 10, desc: '07722714>CALENDARIO WALLIS 26X8', alta: true },
    { ref: '06803001+06803002+06803003', cant: 10, desc: '06803001/2/3>SET LAPIZ', alta: true },
  ];
  const pro = [
    { ref: 'F50621297', cant: 240, desc: 'IMAGING PRO A4 240g 150H' },
    { ref: 'F75021297', cant: 20, desc: 'FA. COL. 80g A4 FSC BANANA 500H' },
    { ref: 'F74621297', cant: 20, desc: 'FA. COL. 80g A4 FSC GIALLO 500H' },
    { ref: 'F75221297', cant: 5, desc: 'FA. COL. 80g A4 FSC ALBICOCA 500H' },
    { ref: 'F74121297', cant: 5, desc: 'FA. COL. 80g A4 FSC VERDE 500H' },
    { ref: 'S1505005', cant: 30, desc: 'PAPEL CREPE ALUM-60g-0,50x1,5m-Pack 10r-ORO_HFE' },
    { ref: 'F65900208', cant: 10, desc: 'SKETCHBOOK & WRITING SET' },
    { ref: 'F07702714', cant: 10, desc: '2027 WALLIS CALENDAR' },
    { ref: 'F06803001', cant: 10, desc: 'FABRIANO SHORTY PENCIL SET ROSSO' },
    { ref: 'S2436126', cant: 4, desc: 'SD VINYL CRAFT 30,5X183 cm-MATT-ROJO FUERTE' },
  ];
  assert.deepStrictEqual(CP.emparejarReferencias(ped, pro), {
    F50621297: '53721297', F75021297: '61121297', F74621297: 'F60621297', F75221297: '61321297', F74121297: '60121297',
    S1505005: '11406', F65900208: '65900208', F07702714: '07722714', F06803001: '06803001+06803002+06803003',
  });
});

test('Expositor agotado y servido suelto: lo que sobra es todo de la misma familia y no es de nadie', () => {
  const F = [{ ref: 'MR24544', desc: 'EXP. NOTEBOOK', cant: 1, precio: 48.8, total: true }];
  const S = [
    { ref: 'MR4577', desc: 'NB0 A6 100 LIS GREEN FLORAL GARDEN', cant: 4, precio: 3.05, total: true },
    { ref: 'MR4580', desc: 'NB0 A6 100 LIS FLOWER FLORAL GARDEN', cant: 4, precio: 3.05, total: true },
  ];
  const ex = CP.explicarDiferencias(F, S);
  assert.strictEqual(ex.length, 1);
  assert.strictEqual(ex[0].tipo, 'expositor');
  assert.strictEqual(ex[0].parcial, true, '24,40 € de 48,80 €: viene incompleto');
  assert.deepStrictEqual(ex[0].sobras.map((s) => s.ref), ['MR4577', 'MR4580']);
  // Lo que sobra no es de la misma familia: no se adivina
  assert.strictEqual(CP.explicarDiferencias(F, [{ ref: 'A', desc: 'CUBILETE NUBE', cant: 2, precio: 5, total: true }, { ref: 'B', desc: 'GRAPADORA GRAFITO', cant: 2, precio: 5, total: true }]).length, 0);
});

test('a Restos nunca va lo que vino de más: solo lo que pidió el cliente', () => {
  const val = [
    { ref: 'A', desc: 'PEDIDO', cant: 5, precio: 1, pedida: 5 },
    { ref: 'B', desc: 'ACEPTADO DE MÁS', cant: 8, precio: 1, pedida: 5 },
    { ref: 'C', desc: 'SIN PEDIR (SUMADO AL CLIENTE)', cant: 3, precio: 1, pedida: 0 },
  ];
  const r = CP.restosDeFactura(val, []);
  assert.deepEqual(r.map((x) => `${x.ref}x${x.cant}`), ['Ax5', 'Bx5']);
});

test('bloque de otra campaña («Pedido 5_ B2F») no va a nuestro pedido 5; «Ag. anual» manda por nº aunque venga desglosado', () => {
  const L = (ref, cant, bloque) => ({ ref, cant, precio: 1, importe: cant, bloque });
  const p5 = { id: 'p5', numero: '5', cliente: 'PAPELERIA', lineas: [{ ref: 'MR13428', cant: 1 }, { ref: 'MR12074', cant: 1 }],
    factura: { lineas: [L('MR13428', 1, 'Pedido 4_ Gift'), L('MR12074', 1, 'Pedido 4_ Gift')] } };
  const p16 = { id: 'p16', numero: '16', cliente: 'TANIA', lineas: [{ ref: 'MR13383', cant: 1 }, { ref: 'MR34831', cant: 1 }],
    propuesta: null };
  const p1 = { id: 'p1', numero: '1', cliente: 'BARCO', lineas: [{ ref: 'MR28450', cant: 3 }], factura: { lineas: [L('MR28450', 3, 'Pedido 1_ Ag. anual')] } };
  const todos = [p1, p5, p16];
  assert.equal(CP.duenoDeBloque('Pedido 5_ B2F', [L('MR8280', 1), L('MR13428', 1)], todos), null);
  const b16 = [L('MR13383', 1), L('MR34825', 1), L('MR34826', 1), L('MR34827', 1), L('MR34828', 2), L('MR34829', 2), L('MR34830', 1)];
  assert.equal(CP.duenoDeBloque('Pedido 16_ Ag. anual', b16, todos), p16);
  // Sin bloques previos en la campaña, se sigue pidiendo un tercio de referencias en común.
  assert.equal(CP.duenoDeBloque('Pedido 5_ B2F', [L('MR8280', 1), L('MR8281', 1), L('MR13428', 1), L('MR8282', 1)], [{ ...p5, factura: null }]), null);
});

test('la etiqueta del bloque ignora el nº pegado («Pedido 13_ B2F» no es de «Pedido 13_Gift»)', () => {
  const L = (ref, cant, bloque) => ({ ref, cant, precio: 1, importe: cant, bloque });
  const p13 = { id: 'p13', numero: '13', cliente: 'X', lineas: [{ ref: 'A', cant: 1 }], factura: { lineas: [L('A', 1, 'Pedido 13_Gift')] } };
  assert.equal(CP.duenoDeBloque('Pedido 13_B2F', [L('A', 1)], [p13]), null);
  assert.equal(CP.duenoDeBloque('Pedido 13_ Gift + Xmas', [L('B', 1)], [p13, { id: 'o', numero: '1', lineas: [], factura: { lineas: [L('C', 1, 'Pedido 1_ Gift')] } }]), p13);
});

test('Sadipal: «1.000» leído como 1 — se corrige la cantidad, nunca el precio', () => {
  const r = CP.lineasDeDocumento({ lineas: [
    { referencia: 'S321A403', descripcion: 'FABRIANO', cantidad: 1, precio: 0.07, descuentos: '30+5', importe: 46.55 },
    { referencia: 'S322A403', descripcion: 'FABRIANO', cantidad: 400, precio: 0.09, descuentos: '30+5', importe: 23.94 },
  ] });
  assert.deepEqual(r.lineas.map((l) => [l.cant, l.precio]), [[1000, 0.07], [400, 0.09]]);
  // Aunque llegue mal leída a la comparación, no se toma por «cajas de 1.000» ni se divide el precio.
  const filas = CP.compararPedido([{ ref: 'S321A403', cant: 1000, precio: 0.047, udsCaja: 4 }],
    [{ ref: 'S321A403', cant: 1, precio: 0.07, dtos: [30, 5], importe: 46.55 }], { neto: true });
  assert.equal(filas[0].precioPropuesta, 0.07);
  assert.ok(!filas[0].porCaja);
});

test('Géminis: el descuento equivalente nunca sale negativo ni ≥ 100 %', () => {
  const eq = CP.descuentoEquivalente(0.07, 1, [30, 5], { subtotalObjetivo: 46.55 });
  assert.equal(eq.descuento, 33.5);
  assert.ok(eq.residuo !== 0);
});
