// EL PUBLICADOR DEL ESTADO DE PEDIDOS (GeminisWin → Supabase).
//
//   node scripts/probar-publicador.js
//
// Lo que se prueba aquí no es "que no pete": es que NO PUBLIQUE UNA MENTIRA.
// Todo lo que sale de este programa se le dice a un cliente por WhatsApp, y un
// estado mal traducido no da un error — da una frase educada y falsa.
//
// Por eso casi todas las pruebas son de lo que NO debe hacer: no traducir lo
// que no conoce, no inventarse un número de pedido, no dar por bueno un
// listado que no entiende, y no correr la hora de corte por culpa del cambio
// de hora.
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const RAIZ = path.join(__dirname, '..');
const DIR = path.join(RAIZ, 'publicador-estado-pedidos');
const estados = require(path.join(DIR, 'estados.js'));
const { construirFilas, claveWeb, aDia, aInstante, ListadoIlegible } = require(path.join(DIR, 'filas.js'));
const { leerCSV, leerListado } = require(path.join(DIR, 'leer-listado.js'));

let fallos = 0;
const comprobar = (etiqueta, fn) => {
  try {
    fn();
    console.log(`OK   ${etiqueta}`);
  } catch (err) {
    fallos += 1;
    console.log(`MAL  ${etiqueta}\n     ${err.message.split('\n')[0]}`);
  }
};

const csv = (texto) => construirFilas(leerCSV(texto));

console.log('=== La traducción de estados\n');

comprobar('"Liquidado" NO se traduce: en GeminisWin es COBRADO, no facturado', () => {
  assert.strictEqual(estados.traducir('Liquidado'), null);
  assert.strictEqual(estados.traducir('LIQUIDADO'), null);
});

comprobar('lo que no conocemos se queda fuera, no se aproxima', () => {
  assert.strictEqual(estados.traducir('Servido'), null);
  assert.strictEqual(estados.traducir('Pdte. Servir'), null);
  assert.strictEqual(estados.traducir('vete a saber'), null);
  assert.strictEqual(estados.traducir(''), null);
  assert.strictEqual(estados.traducir(null), null);
});

comprobar('las palabras que sí significan lo mismo se traducen', () => {
  assert.strictEqual(estados.traducir('Facturado'), 'facturado');
  assert.strictEqual(estados.traducir('  FACTURADO  '), 'facturado');
  assert.strictEqual(estados.traducir('Anulado'), 'anulado');
  assert.strictEqual(estados.traducir('Cancelado'), 'anulado');
  assert.strictEqual(estados.traducir('No entregado'), 'no_entregado');
  assert.strictEqual(estados.traducir('En reparto'), 'en_reparto');
});

comprobar('todo lo que traducimos lo entiende el bot', () => {
  // Si alguien añade aquí un estado que el bot no conoce, el bot lo ignoraría y
  // esas filas no servirían para nada. Mejor saberlo aquí.
  for (const destino of estados.TRADUCCION.values()) {
    assert.ok(estados.esEstadoDelBot(destino), `"${destino}" no es un estado del bot`);
  }
});

console.log('\n=== El número de pedido web (la clave de la tabla)\n');

comprobar('se queda con el número, lleve los adornos que lleve', () => {
  assert.strictEqual(claveWeb('663273'), '663273');
  assert.strictEqual(claveWeb('#663273'), '663273');
  assert.strictEqual(claveWeb('Pedido 663273'), '663273');
  assert.strictEqual(claveWeb(' 663273 WEB '), '663273');
  assert.strictEqual(claveWeb('0663273'), '663273', 'sin ceros por delante');
});

comprobar('lo que no parece un número de pedido NO se inventa', () => {
  // Una clave inventada es una fila que el bot encontraría para otro pedido.
  assert.strictEqual(claveWeb(''), null);
  assert.strictEqual(claveWeb('B2F'), null);
  assert.strictEqual(claveWeb('5'), null, 'tres cifras o menos no es un pedido web');
  assert.strictEqual(claveWeb('1234567890123'), null, 'eso es otra cosa, no un pedido');
});

console.log('\n=== Las fechas, y el cambio de hora\n');

comprobar('una fecha española se convierte en día', () => {
  assert.strictEqual(aDia('23/10/2026'), '2026-10-23');
  assert.strictEqual(aDia('23/10/26'), '2026-10-23');
  assert.strictEqual(aDia('2026-10-23'), '2026-10-23');
  assert.strictEqual(aDia('23/10/2026 7:56'), '2026-10-23');
  assert.strictEqual(aDia('no es una fecha'), null);
  assert.strictEqual(aDia(''), null);
});

comprobar('EN VERANO la hora del pedido no se corre (Canarias = UTC+1)', () => {
  // El pedido real #663273: viernes 23/10/2026 a las 7:56 de la mañana en la
  // tienda. Si esto se mandara como si fuera UTC, el bot leería las 8:56 y la
  // hora de corte de las 13:00 caería donde no es.
  assert.strictEqual(aInstante('23/10/2026 7:56'), '2026-10-23T06:56:00.000Z');
});

comprobar('EN INVIERNO tampoco (Canarias = UTC)', () => {
  // El cambio de hora de 2026 es el domingo 25 de octubre.
  assert.strictEqual(aInstante('26/10/2026 7:56'), '2026-10-26T07:56:00.000Z');
});

comprobar('la hora de corte del bot cuadra con lo que publicamos', () => {
  // La prueba de verdad: se publica una hora y el bot decide con ella. Las dos
  // mitades tienen que estar de acuerdo, no cada una por su lado.
  const gestion = require(path.join(RAIZ, 'netlify/functions/gestion-pedidos.js'));
  assert.strictEqual(gestion.diaDeFacturacion(aInstante('23/10/2026 12:59')), '2026-10-23',
    'antes de las 13:00 se factura ese mismo día');
  assert.strictEqual(gestion.diaDeFacturacion(aInstante('23/10/2026 13:01')), '2026-10-26',
    'después de las 13:00, el siguiente laborable (lunes)');
});

console.log('\n=== El listado entero\n');

const LISTADO = [
  'Nº Pedido Web;Cliente;Estado;Fecha Pedido;Fecha Factura;Fecha Reparto',
  '663273;DONATACO, S.L.U;Facturado;23/10/2026 7:56;23/10/2026;26/10/2026',
  '#663274;OTRO CLIENTE;En reparto;23/10/2026 9:10;23/10/2026;23/10/2026',
  '663275;UN TERCERO;Anulado;22/10/2026 16:00;;',
].join('\n');

comprobar('un listado normal sale entero y con sus fechas', () => {
  const r = csv(LISTADO);
  assert.strictEqual(r.filas.length, 3);
  const uno = r.filas.find((f) => f.pedido_web === '663273');
  assert.deepStrictEqual(uno, {
    pedido_web: '663273',
    estado: 'facturado',
    fecha_hora_pedido: '2026-10-23T06:56:00.000Z',
    fecha_factura: '2026-10-23',
    fecha_reparto: '2026-10-26',
  });
  assert.strictEqual(r.filas.find((f) => f.pedido_web === '663275').fecha_factura, null);
});

comprobar('"actualizado" no se manda NUNCA: lo pone la base de datos', () => {
  // Si lo mandáramos, un publicador con la hora mal puesta haría que el bot
  // diera por fresco un dato viejo. El trigger de Supabase lo pisa igualmente.
  for (const fila of csv(LISTADO).filas) {
    assert.ok(!('actualizado' in fila), 'se está mandando actualizado');
  }
});

comprobar('un estado desconocido no se publica: se cuenta y se avisa', () => {
  const r = csv([
    'Nº Pedido Web;Estado',
    '663273;Facturado',
    '663274;Liquidado',
    '663275;Liquidado',
    '663276;Pdte. Servir',
  ].join('\n'));
  assert.strictEqual(r.filas.length, 1, 'solo el facturado');
  assert.strictEqual(r.sinTraducir.get('Liquidado'), 2);
  assert.strictEqual(r.sinTraducir.get('Pdte. Servir'), 1);
});

comprobar('una fila sin número de pedido se descarta, no tumba la pasada', () => {
  const r = csv([
    'Nº Pedido Web;Estado',
    ';Facturado',
    'B2F;Facturado',
    '663273;Facturado',
  ].join('\n'));
  assert.strictEqual(r.filas.length, 1);
  assert.strictEqual(r.sinNumero, 2);
});

comprobar('el mismo pedido dos veces no se duplica', () => {
  const r = csv([
    'Nº Pedido Web;Estado',
    '663273;Facturado',
    '663273;En reparto',
  ].join('\n'));
  assert.strictEqual(r.filas.length, 1);
  assert.strictEqual(r.filas[0].estado, 'en_reparto', 'se queda la última');
  assert.strictEqual(r.repetidos, 1);
});

console.log('\n=== Cuando el listado no es el que esperamos\n');

comprobar('sin la columna del pedido web, PARA y dice qué columnas vio', () => {
  let err = null;
  try {
    csv('Cliente;Estado\nDONATACO;Facturado');
  } catch (e) { err = e; }
  assert.ok(err instanceof ListadoIlegible, 'tendría que parar');
  assert.ok(/Cliente/.test(err.message), 'no dice qué columnas encontró');
  assert.ok(/filas\.js/.test(err.message), 'no dice dónde se arregla');
});

comprobar('sin la columna de estado, también para', () => {
  assert.throws(() => csv('Nº Pedido Web;Cliente\n663273;DONATACO'), ListadoIlegible);
});

comprobar('"Fecha" a secas no se lleva por delante a "Fecha Factura"', () => {
  // Las coincidencias exactas van antes que las parciales; si no, la columna
  // del pedido se llevaría la de la factura y las cuentas de plazos saldrían
  // mal sin que nadie se entere.
  const r = csv('Nº Pedido Web;Estado;Fecha Factura;Fecha Pedido\n663273;Facturado;20/10/2026;23/10/2026');
  assert.strictEqual(r.columnas.fecha_factura, 'Fecha Factura');
  assert.strictEqual(r.columnas.fecha_pedido, undefined);
  assert.strictEqual(r.filas[0].fecha_factura, '2026-10-20');
});

comprobar('una columna que no está, simplemente no viaja', () => {
  const r = csv('Nº Pedido Web;Estado\n663273;Facturado');
  assert.strictEqual(r.columnas.fecha_reparto, null);
  assert.strictEqual(r.filas[0].fecha_reparto, null);
});

console.log('\n=== Leer el fichero\n');

comprobar('CSV con ; y con , y con comillas', () => {
  const conComas = leerCSV('Nº Pedido Web,Estado\n663273,Facturado');
  assert.strictEqual(conComas.filas[0]['Nº Pedido Web'], '663273');
  const conComillas = leerCSV('Nº Pedido Web;Descripcion;Estado\n663273;"ROLLOS 80x65; pack 8";Facturado');
  assert.strictEqual(conComillas.filas[0].Descripcion, 'ROLLOS 80x65; pack 8');
  assert.strictEqual(conComillas.filas[0].Estado, 'Facturado');
});

comprobar('un CSV de Excel (BOM al principio) se lee igual', () => {
  const r = leerCSV('﻿Nº Pedido Web;Estado\n663273;Facturado');
  assert.strictEqual(construirFilas(r).filas.length, 1);
});

comprobar('un fichero de verdad, desde el disco', () => {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pub-')), 'listado.csv');
  fs.writeFileSync(tmp, LISTADO, 'utf8');
  try {
    assert.strictEqual(construirFilas(leerListado(tmp)).filas.length, 3);
  } finally {
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  }
});

comprobar('un fichero que no existe lo dice claro', () => {
  assert.throws(() => leerListado('/no/existe/esto.csv'), /No existe el fichero/);
});

console.log(fallos === 0 ? '\n✔ Sin fallos' : `\n✗ ${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
