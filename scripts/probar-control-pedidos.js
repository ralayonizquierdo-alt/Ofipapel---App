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
  assert.deepEqual([r.lineas[0].cant, r.lineas[0].precio], [2, 0.95]);
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
