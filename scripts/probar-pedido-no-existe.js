// «NO EXISTE» NO ES LO MISMO QUE «NO HE PODIDO MIRARLO».
//
//   node scripts/probar-pedido-no-existe.js
//
// Conversación real del 6/11/2026, en inglés. El cliente dio su número de
// albarán y pidió entrega para el lunes; el bot le pidió el número de pedido,
// él lo buscó en su correo y contestó:
//
//   «Yes please connect me to someone. I found this in the email: Pedido #674885»
//
// Y se llevó: «I can't find any order with the number 674885».
//
// Esa frase salía SIEMPRE que la consulta volvía vacía — y `wcRequest` devolvía
// vacío en cinco situaciones distintas: sin claves configuradas, con cualquier
// error HTTP (incluido el 401 de unas claves caducadas), con la pantalla
// anti-bots del hosting, al agotarse el tiempo y ante cualquier fallo de red.
// Solo UNA de esas cinco significa que el pedido no está.
//
// Es de las mentiras más caras que puede decir el bot: el cliente se queda
// pensando que su pedido se ha perdido, y encima con el papel delante.
const path = require('path');
const dir = path.join(__dirname, '..', 'netlify/functions');
const wc = require(path.join(dir, 'woocommerce-client.js'));
const { paraWhatsapp } = require(path.join(dir, 'whatsapp-formato.js'));

let fallos = 0;
const ok = (cond, etiqueta) => {
  console.log(`  ${cond ? '✔' : '✗'}  ${etiqueta}`);
  if (!cond) fallos++;
};

// Hacen falta claves para que la función llegue a pedir nada.
process.env.WOOCOMMERCE_CONSUMER_KEY = 'ck_prueba';
process.env.WOOCOMMERCE_CONSUMER_SECRET = 'cs_prueba';

const respuesta = (fn) => {
  global.fetch = fn;
  return wc.getOrderConMotivo('674885');
};

(async () => {
  console.log('\n=== La web dice que no está: ahí sí se puede afirmar');
  let r = await respuesta(async () => ({
    ok: false,
    status: 404,
    text: async () => 'No encontrado',
    headers: new Map(),
  }));
  ok(r.motivo === wc.MOTIVO.NO_EXISTE, `404 → ${r.motivo}`);

  console.log('\n=== Y en todo lo demás, NO se puede');
  const noSePudo = [
    ['401 (claves caducadas)', async () => ({ ok: false, status: 401, text: async () => 'Unauthorized', headers: new Map() })],
    ['500 (la web rota)', async () => ({ ok: false, status: 500, text: async () => 'Error', headers: new Map() })],
    [
      'HTML en vez de JSON (anti-bots del hosting)',
      async () => ({ ok: true, status: 200, headers: new Map([['content-type', 'text/html']]), json: async () => ({}) }),
    ],
    ['se agotó el tiempo', async () => { const e = new Error('timeout'); e.name = 'TimeoutError'; throw e; }],
    ['la red falló', async () => { throw new Error('ECONNRESET'); }],
  ];
  for (const [etiqueta, fn] of noSePudo) {
    const res = await respuesta(fn);
    ok(res.motivo === wc.MOTIVO.NO_SE_PUDO, `${etiqueta} → ${res.motivo}`);
  }

  console.log('\n=== Sin claves configuradas tampoco se afirma nada');
  const k = process.env.WOOCOMMERCE_CONSUMER_KEY;
  delete process.env.WOOCOMMERCE_CONSUMER_KEY;
  r = await wc.getOrderConMotivo('674885');
  ok(r.motivo === wc.MOTIVO.NO_SE_PUDO, `sin claves → ${r.motivo}`);
  process.env.WOOCOMMERCE_CONSUMER_KEY = k;

  console.log('\n=== Y cuando el pedido SÍ está, llega entero');
  r = await respuesta(async () => ({
    ok: true,
    status: 200,
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({ id: 674885, number: '674885', status: 'processing' }),
  }));
  ok(r.motivo === wc.MOTIVO.OK && r.order && r.order.number === '674885', 'el pedido llega con motivo «ok»');

  // ———————————————————————————————————————————————————————————————
  // EL OTRO FALLO DE LA MISMA CONVERSACIÓN: los asteriscos.
  //
  // «I'll need your **order number**» le llegó al cliente con los cuatro
  // asteriscos puestos. La IA escribe en markdown; WhatsApp usa una sola
  // estrella para la negrita.
  console.log('\n=== WhatsApp no entiende el markdown');
  ok(
    paraWhatsapp("I'll need your **order number** (it should be in your email)") ===
      "I'll need your *order number* (it should be in your email)",
    'la frase real del 6/11 sale con una sola estrella'
  );
  ok(paraWhatsapp('***muy importante***') === '*muy importante*', '***negrita cursiva*** → *…*');
  ok(paraWhatsapp('__así__ también') === '_así_ también', '__así__ → _así_');

  console.log('\n--- y lo que NO se puede tocar:');
  for (const [texto, por] of [
    ['talla 3*4 y 5*5', 'un asterisco suelto no es negrita'],
    ['la referencia TN_248_BK', 'los guiones bajos de una referencia'],
    ['escribe a impresion.ofipapel@gmail.com', 'un correo'],
    ['*esto ya estaba bien*', 'la negrita de WhatsApp se deja igual'],
  ]) {
    ok(paraWhatsapp(texto) === texto, `${por}: «${texto}»`);
  }

  console.log(fallos === 0 ? '\n✔ Sin fallos\n' : `\n✗ ${fallos} fallo(s)\n`);
  process.exit(fallos === 0 ? 0 : 1);
})();
