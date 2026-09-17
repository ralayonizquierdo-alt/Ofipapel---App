// La lista de clientes que se perdieron mientras el bot estuvo mudo.
//
//   node scripts/probar-perdidos.js
//
// Del 10 al 17 de septiembre de 2026 el bot reventaba en cada mensaje. No
// contestó a nadie ni guardó ninguna conversación, pero sí quedó la ficha de
// quien escribía por PRIMERA vez (se escribe en la primera línea del webhook,
// antes del punto donde reventaba). Esta vista los rescata para poder
// escribirles.
//
// Lo que se comprueba aquí es justo lo que haría que la lista fuera inútil o,
// peor, engañosa:
//   - que no se cuele nadie de fuera del tramo de fechas,
//   - que no se pierda nadie de dentro,
//   - que una ficha corrupta no tumbe el listado entero,
//   - que el recorrido de la base se haga con SCAN (KEYS bloquea el servidor)
//     y que los valores se pidan en bloque, no de uno en uno.
const Module = require('module');
const path = require('path');
const orig = Module.prototype.require;
const RAIZ = path.join(__dirname, '..');

process.env.UPSTASH_REDIS_REST_URL = 'https://ejemplo.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token-de-prueba';

const DENTRO = Date.UTC(2026, 8, 12, 11, 0); // 12 de septiembre: en mitad del fallo
const ANTES = Date.UTC(2026, 8, 1, 11, 0);
const DESPUES = Date.UTC(2026, 8, 20, 11, 0);

// Lo que habría en la base. Las claves que no empiezan por "cliente:" están a
// propósito: el SCAN debe filtrarlas con MATCH y no traerlas.
const BASE = {
  'cliente:34600000001': { nombreWhatsapp: 'Lucía', primerContacto: DENTRO, ultimoContacto: DENTRO },
  'cliente:34600000002': { nombreWhatsapp: 'Taller Paco', primerContacto: DENTRO + 3600000 },
  'cliente:34600000003': { nombreWhatsapp: 'Antiguo', primerContacto: ANTES, ultimoContacto: DENTRO },
  'cliente:34600000004': { nombreWhatsapp: 'Reciente', primerContacto: DESPUES },
  'cliente:34600000005': 'esto no es json {{{',
  'cliente:34600000006': { primerContacto: DENTRO + 7200000 }, // sin nombre: sigue valiendo, el número es lo que importa
  'conv:34600000001': '[]',
};

const comandos = [];

Module.prototype.require = function (p) {
  const m = orig.apply(this, arguments);
  return m;
};

global.fetch = async (url, opts) => {
  const args = JSON.parse(opts.body);
  comandos.push(args[0]);
  const [cmd] = args;

  if (cmd === 'SCAN') {
    const patron = args[3];
    if (patron !== 'cliente:*') throw new Error('el SCAN debe filtrar por cliente:*, no traerse la base entera');
    const claves = Object.keys(BASE).filter((k) => k.startsWith('cliente:'));
    // Se devuelve en dos vueltas a propósito: si el código no siguiera el
    // cursor, se dejaría la mitad de los clientes fuera sin avisar.
    const cursor = args[1];
    const resultado = cursor === '0'
      ? ['7', claves.slice(0, 3)]
      : ['0', claves.slice(3)];
    return { ok: true, json: async () => ({ result: resultado }) };
  }

  if (cmd === 'MGET') {
    const valores = args.slice(1).map((k) => {
      const v = BASE[k];
      return v === undefined ? null : typeof v === 'string' ? v : JSON.stringify(v);
    });
    return { ok: true, json: async () => ({ result: valores }) };
  }

  throw new Error(`comando inesperado contra la base: ${cmd}`);
};

const store = require(path.join(RAIZ, 'netlify/functions/conversation-store.js'));
Module.prototype.require = orig;

(async () => {
  let fallos = 0;
  const mal = (msg) => { fallos++; console.log('  MAL  ' + msg); };
  const bien = (msg) => console.log('  OK   ' + msg);

  const desde = Date.UTC(2026, 8, 10, 9, 20);
  const hasta = Date.UTC(2026, 8, 17, 9, 56);
  const clientes = await store.listarFichasPorPrimerContacto(desde, hasta);
  const numeros = clientes.map((c) => c.phone);

  console.log('\n=== Quién sale en la lista');
  for (const esperado of ['34600000001', '34600000002', '34600000006']) {
    numeros.includes(esperado)
      ? bien(`sale ${esperado}, que escribió por primera vez durante el fallo`)
      : mal(`FALTA ${esperado}: escribió durante el fallo y se queda sin rescatar`);
  }
  numeros.includes('34600000003')
    ? mal('se cuela 34600000003, que ya era cliente de antes')
    : bien('no se cuela el cliente antiguo');
  numeros.includes('34600000004')
    ? mal('se cuela 34600000004, que escribió después del arreglo')
    : bien('no se cuela el que escribió después');
  numeros.includes('34600000005')
    ? mal('se cuela una ficha corrupta')
    : bien('la ficha corrupta se salta sin tumbar el listado');

  console.log('\n=== Cómo se consulta la base');
  comandos.includes('KEYS')
    ? mal('usa KEYS, que bloquea el servidor entero mientras recorre')
    : bien('no usa KEYS');
  comandos.filter((c) => c === 'SCAN').length >= 2
    ? bien('sigue el cursor del SCAN hasta el final (no se deja claves fuera)')
    : mal('no sigue el cursor del SCAN: se dejaría clientes sin listar');
  const gets = comandos.filter((c) => c === 'GET').length;
  gets === 0
    ? bien('pide los valores en bloque con MGET, no uno a uno')
    : mal(`hace ${gets} GET sueltos: con muchos clientes eso es un comando por cliente`);

  console.log('\n=== Qué se enseña de cada uno');
  const lucia = clientes.find((c) => c.phone === '34600000001');
  lucia?.nombre === 'Lucía' ? bien('se conserva el nombre de WhatsApp') : mal('se pierde el nombre');
  const sinNombre = clientes.find((c) => c.phone === '34600000006');
  sinNombre ? bien('un cliente sin nombre sigue saliendo (el número es lo que vale)') : mal('se descarta al que no tiene nombre');
  clientes[0]?.phone === '34600000006'
    ? bien('ordenados del más reciente al más antiguo')
    : mal('no están ordenados por fecha descendente');

  console.log(fallos === 0 ? '\n✔ Sin fallos' : `\n✗ ${fallos} fallos`);
  process.exit(fallos === 0 ? 0 : 1);
})();
