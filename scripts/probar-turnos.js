// DE UNO EN UNO POR CLIENTE.
//
//   node scripts/probar-turnos.js
//
// Conversación real del 16/11/2026 a las 2:25 de la madrugada. El cliente
// escribió en dos globos, como escribe todo el mundo:
//
//   «Hola quería preguntarles por un pedido»
//   «685025»
//
// Meta manda cada globo en su propia petición y Netlify las atendió en dos
// instancias a la vez. De los registros de Netlify:
//
//   02:25:12,6  el saludo   → 19,0 s
//   02:25:13,9  el número   →  8,5 s
//
// Así que al cliente le llegaron las respuestas al revés:
//
//   bot: «Ahora mismo no puedo comprobar tu pedido...»   (la del número)
//   bot: «¡Hola! Claro, ¿cuál es el número de pedido?»   (la del saludo)
//
// Le pidió el número que acababa de darle, y en ese orden. Peor aún: el turno
// del número corrió ANTES de que el bot preguntase nada, así que no contaba
// como respuesta a ninguna pregunta y el hilo del pedido se perdió.
//
// Lo que se comprueba aquí es el turno: que el segundo espera al primero, que
// el orden se conserva — y, sobre todo, que NADA de esto deja mudo al bot.
process.env.UPSTASH_REDIS_REST_URL = 'https://redis-de-prueba.local';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token-de-prueba';

const path = require('path');
const store = require(path.join(__dirname, '..', 'netlify/functions/conversation-store.js'));

let fallos = 0;
const ok = (cond, etiqueta) => {
  console.log(`  ${cond ? '✔' : '✗'}  ${etiqueta}`);
  if (!cond) fallos++;
};

// —————————————————————————————————————————————————————————————————
// Un Redis de mentira, con lo justo: SET ... NX EX, GET y DEL.
let almacen = new Map();
let redisCaido = false;

global.fetch = async (_url, opts) => {
  if (redisCaido) throw new Error('ECONNRESET');
  const args = JSON.parse(opts.body);
  const [cmd, key, valor, ...resto] = args;
  let result = null;

  if (cmd === 'SET') {
    const nx = resto.includes('NX') || valor === 'NX';
    if (!(nx && almacen.has(key))) {
      almacen.set(key, valor);
      result = 'OK';
    }
  } else if (cmd === 'GET') {
    result = almacen.has(key) ? almacen.get(key) : null;
  } else if (cmd === 'DEL') {
    result = almacen.delete(key) ? 1 : 0;
  }

  return { ok: true, status: 200, json: async () => ({ result }) };
};

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('\n=== Dos globos seguidos del mismo cliente: no se pisan');
  almacen = new Map();
  const orden = [];

  // El saludo, que tarda (en real fueron 19 s por el arranque en frío).
  const saludo = (async () => {
    const turno = await store.tomarTurno('34600111222');
    try {
      await dormir(600);
      orden.push('respuesta al saludo');
    } finally {
      await store.soltarTurno('34600111222', turno);
    }
  })();

  // El número, que llega un instante después y es rapidísimo.
  await dormir(50);
  const numero = (async () => {
    const turno = await store.tomarTurno('34600111222');
    try {
      orden.push('respuesta al número');
    } finally {
      await store.soltarTurno('34600111222', turno);
    }
  })();

  await Promise.all([saludo, numero]);
  ok(
    orden[0] === 'respuesta al saludo' && orden[1] === 'respuesta al número',
    `se contesta en el orden en que escribió: ${orden.join(' → ')}`
  );
  ok(almacen.size === 0, 'y el turno queda libre al terminar');

  console.log('\n=== Dos clientes distintos NO se esperan entre sí');
  almacen = new Map();
  const t0 = Date.now();
  const unoA = store.tomarTurno('34600111222');
  const unoB = store.tomarTurno('34600333444');
  const [ta, tb] = await Promise.all([unoA, unoB]);
  ok(Boolean(ta) && Boolean(tb), 'los dos toman turno a la vez');
  ok(Date.now() - t0 < 300, 'sin esperarse (ninguno sondea)');
  await store.soltarTurno('34600111222', ta);
  await store.soltarTurno('34600333444', tb);

  // —————————————————————————————————————————————————————————————————
  // Y AHORA LO IMPORTANTE: que nada de esto pueda dejar al bot mudo.
  console.log('\n=== Falla abierto: pase lo que pase, se contesta');

  console.log('\n--- si el turno de delante se eterniza, el de detrás sigue');
  almacen = new Map();
  const ocupado = await store.tomarTurno('34600111222'); // nunca se suelta
  const t1 = Date.now();
  const segundo = await store.tomarTurno('34600111222', { esperaMs: 900 });
  const esperado = Date.now() - t1;
  ok(segundo === null, 'no consigue turno…');
  ok(esperado >= 800 && esperado < 3000, `…pero deja de esperar y sigue (${esperado} ms)`);
  await store.soltarTurno('34600111222', ocupado);

  console.log('\n--- si Redis no contesta, no se espera a nadie');
  almacen = new Map();
  redisCaido = true;
  const t2 = Date.now();
  const sinRedis = await store.tomarTurno('34600111222');
  ok(sinRedis === null, 'devuelve «sin turno» en vez de reventar');
  ok(Date.now() - t2 < 300, 'y sin quedarse esperando');
  await store.soltarTurno('34600111222', sinRedis); // no debe lanzar
  redisCaido = false;

  console.log('\n--- soltar un turno que no es nuestro no se lo quita a otro');
  almacen = new Map();
  const mio = await store.tomarTurno('34600111222');
  almacen.set('turno:34600111222', 'de-otra-instancia'); // como si el nuestro hubiera caducado
  await store.soltarTurno('34600111222', mio);
  ok(almacen.get('turno:34600111222') === 'de-otra-instancia', 'el turno del otro sigue en pie');

  console.log('\n--- soltar sin haber tomado turno no hace nada');
  almacen = new Map();
  almacen.set('turno:34600111222', 'de-otra-instancia');
  await store.soltarTurno('34600111222', null);
  ok(almacen.get('turno:34600111222') === 'de-otra-instancia', 'no toca nada');

  console.log(fallos === 0 ? '\n✔ Sin fallos\n' : `\n✗ ${fallos} fallo(s)\n`);
  process.exit(fallos === 0 ? 0 : 1);
})();
