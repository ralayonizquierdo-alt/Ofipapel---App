// ADJUNTAR UNA FOTO DESDE EL PANEL, EN UN NAVEGADOR DE VERDAD.
//
//   node scripts/probar-panel-adjuntos.js
//
// «Cuando adjunto una imagen se queda colgado error 413» (propietario,
// 25/11/2026). En los registros de Netlify estaban los cinco intentos, todos
// 413, todos POST a /.netlify/functions/conversations.
//
// LA CAUSA: el cuerpo de la petición llega a la función en base64
// (`event.isBase64Encoded`), y base64 engorda un tercio. El tope de Netlify son
// ~6 MB, así que el techo real de binario eran ~4,3 MB — pero el panel anunciaba
// 5 MB y los dejaba pasar. Una foto del móvil de 4,5 MB se cortaba en la
// plataforma ANTES de llegar a la función, con lo cual la comprobación de
// tamaño del propio código —que existe para avisar con buenas palabras— era
// inalcanzable justo para los ficheros que tenía que cazar. Y el `onsubmit`
// había dejado ya el botón en «Enviando...»: de ahí el «se queda colgado».
//
// POR QUÉ ESTA PRUEBA ABRE UN NAVEGADOR: el arreglo es código de navegador
// (encoger la foto en un lienzo antes de enviarla), y esta es la clase de fallo
// que en el servidor se ve perfecto. `probar-panel-js.js` comprueba que el
// script PARSEA; esto comprueba que HACE SU TRABAJO. Mide el efecto: qué
// fichero sale de verdad hacia el servidor.
const path = require('path');
const Module = require('module');

const RAIZ = path.join(__dirname, '..');
const orig = Module.prototype.require;

Module.prototype.require = function (p) {
  if (p === './whatsapp-send') {
    return {
      sendWhatsappMessage: async () => ({ ok: true }),
      sendWhatsappTemplate: async () => ({ ok: true }),
      uploadWhatsappMedia: async () => ({}),
      sendWhatsappMedia: async () => ({}),
      getBusinessProfile: async () => ({ ok: true, perfil: {} }),
      getPhoneNumberStatus: async () => ({ ok: true, numero: {} }),
    };
  }
  if (p === '@netlify/blobs') {
    return { connectLambda: () => {}, getStore: () => ({ set: async () => {}, getWithMetadata: async () => null }) };
  }
  const m = orig.apply(this, arguments);
  if (p === './conversation-store') {
    return {
      ...m,
      isConfigured: () => true,
      loadConversation: async () => [{ role: 'user', content: 'hola', ts: Date.now() }],
      listConversationPhones: async () => ['34600111222'],
      getFichaCliente: async () => ({}),
      isBotPaused: async () => false,
      getEstadoEntrega: async () => ({}),
      getPausaGlobal: async () => null,
      listarNotasNegocio: async () => [],
      listarAlias: async () => [],
      leerFallosDelBot: async () => [],
      leerFallosDeEnvio: async () => [],
      ultimaVisita: async () => 0,
      marcarVisita: async () => {},
    };
  }
  return m;
};
const conv = require(path.join(RAIZ, 'netlify/functions/conversations.js'));
const { MAX_ATTACHMENT_BYTES } = conv;
Module.prototype.require = orig;

let fallos = 0;
const ok = (cond, etiqueta, extra) => {
  console.log(`  ${cond ? '✔' : '✗'}  ${etiqueta}${cond || !extra ? '' : `  — ${extra}`}`);
  if (!cond) fallos += 1;
};

(async () => {
  console.log('\n=== Adjuntar una foto desde el panel\n');

  // El tope tiene que caber en los 6 MB de Netlify DESPUÉS de base64 (+1/3),
  // más el texto del mensaje y las cabeceras del multipart. Esta comprobación
  // es la que impide que alguien vuelva a subirlo «para tener margen».
  const TOPE_NETLIFY = 6 * 1024 * 1024;
  const enBase64 = MAX_ATTACHMENT_BYTES * 4 / 3;
  ok(enBase64 < TOPE_NETLIFY * 0.95,
    'el tope anunciado cabe en una petición de Netlify una vez en base64',
    `${(MAX_ATTACHMENT_BYTES / 1048576).toFixed(1)} MB → ${(enBase64 / 1048576).toFixed(1)} MB en base64`);

  process.env.DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'prueba';
  const login = await conv.handler({
    httpMethod: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `action=login&password=${process.env.DASHBOARD_PASSWORD}`,
    queryStringParameters: {},
  });
  const cookie = (login.headers?.['Set-Cookie'] || '').split(';')[0];
  const res = await conv.handler({
    httpMethod: 'GET',
    queryStringParameters: { phone: '34600111222' },
    headers: { cookie },
  });
  const html = res.body || '';

  ok(html.includes('function encogerImagen('), 'el panel manda la función que encoge la foto');
  ok(html.includes('se reducen solas'), 'y lo dice en el texto de ayuda');

  // SIN NAVEGADOR SE PARA AQUÍ, PERO NO EN ROJO.
  //
  // Playwright no está en el runner normal del CI, y esta batería va en el
  // mismo bucle que las demás: si se cayera con error, tumbaría la puerta de
  // todo el bot por una dependencia que no tiene nada que ver. Lo de arriba
  // —la cuenta del base64 y que el panel mande la función— sí se comprueba
  // siempre, porque ahí está la causa del 413.
  //
  // La parte de navegador corre en su propio trabajo de `bot.yml`
  // («navegador»), que instala Chromium. Si esta línea sale en el registro del
  // trabajo normal es lo esperado; si sale en el de navegador, está mal.
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    console.log('\n  —    sin Playwright aquí: la parte de navegador se salta (corre en el trabajo «navegador» del CI)');
    console.log(fallos === 0 ? '\n✔ Sin fallos (sin la parte de navegador)\n' : `\n✗ ${fallos} fallo(s)\n`);
    process.exit(fallos === 0 ? 0 : 1);
  }
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage();
  const consola = [];
  pagina.on('pageerror', (e) => consola.push(String(e)));
  await pagina.setContent(html);

  // Se sustituye el envío de verdad por un espía: lo que importa es QUÉ fichero
  // habría salido hacia el servidor.
  await pagina.evaluate(() => {
    window.__enviado = null;
    window.__avisos = [];
    window.alert = (t) => window.__avisos.push(String(t));
    HTMLFormElement.prototype.submit = function () {
      const f = this.querySelector('input[type=file]');
      const a = f && f.files && f.files.length ? f.files[0] : null;
      window.__enviado = a ? { nombre: a.name, tipo: a.type, bytes: a.size } : null;
    };
    // Y se corta la navegación de verdad. Va registrado DESPUÉS del manejador
    // del panel, así que este corte no cambia ninguna de sus decisiones: solo
    // evita que el navegador abandone la página cuando el adjunto sí pasa (un
    // PDF que cabe se envía tal cual, y sin esto la prueba se queda sin DOM).
    document.querySelector('.reply-form').addEventListener('submit', (e) => {
      if (!e.defaultPrevented) {
        const f = e.target.querySelector('input[type=file]');
        const a = f && f.files && f.files.length ? f.files[0] : null;
        window.__enviado = a ? { nombre: a.name, tipo: a.type, bytes: a.size, talCual: true } : null;
      }
      e.preventDefault();
    });
  });

  ok(consola.length === 0, 'el JavaScript del panel arranca sin errores', consola.join(' | '));

  // Fabrica un fichero del tipo y peso que se le pida y lo mete en el campo,
  // igual que al elegirlo con el botón del clip.
  async function adjuntar({ tipo, megas, ancho = 4032, alto = 3024 }) {
    return pagina.evaluate(async ({ tipo, megas, ancho, alto }) => {
      let archivo;
      if (tipo === 'application/pdf') {
        // Un PDF no se puede encoger: basta con que pese.
        archivo = new File([new Uint8Array(Math.round(megas * 1024 * 1024))], 'presupuesto.pdf', { type: tipo });
      } else {
        // Una foto de móvil de verdad: grande y con ruido, para que el JPEG no
        // se comprima a nada y pese como pesaría una de verdad.
        const c = document.createElement('canvas');
        c.width = ancho; c.height = alto;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(ancho, alto);
        for (let i = 0; i < img.data.length; i += 4) {
          img.data[i] = Math.random() * 255;
          img.data[i + 1] = Math.random() * 255;
          img.data[i + 2] = Math.random() * 255;
          img.data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        const blob = await new Promise((r) => c.toBlob(r, tipo, 1));
        archivo = new File([blob], tipo === 'image/png' ? 'foto.png' : 'foto.jpg', { type: tipo });
      }
      const campo = document.querySelector('.reply-form input[type=file]');
      const t = new DataTransfer();
      t.items.add(archivo);
      campo.files = t.files;
      window.__enviado = null;
      window.__avisos = [];
      return archivo.size;
    }, { tipo, megas, ancho, alto });
  }

  async function enviar() {
    await pagina.evaluate(() => {
      const form = document.querySelector('.reply-form');
      form.querySelector('textarea').value = 'aquí lo tienes';
      form.requestSubmit();
    });
    // El encogido es asíncrono (lienzo + toBlob): se espera a que el espía
    // recoja algo o a que salga un aviso.
    await pagina.waitForFunction(
      () => window.__enviado !== null || window.__avisos.length > 0,
      null,
      { timeout: 20000 }
    ).catch(() => {});
    return pagina.evaluate(() => ({
      enviado: window.__enviado,
      avisos: window.__avisos,
      botonBloqueado: document.querySelector('.reply-form button[type=submit]').disabled,
    }));
  }

  // ———————————————————————————————————————————————————————————————
  // EL CASO REAL: la foto del móvil que daba 413.
  const pesoFoto = await adjuntar({ tipo: 'image/jpeg', megas: 0 });
  console.log(`\n  (la foto de prueba pesa ${(pesoFoto / 1048576).toFixed(1)} MB)\n`);
  ok(pesoFoto > MAX_ATTACHMENT_BYTES,
    'la foto de prueba es de las que daban 413',
    `solo pesa ${(pesoFoto / 1048576).toFixed(1)} MB, no llega al tope`);

  const r1 = await enviar();
  ok(Boolean(r1.enviado), 'la foto grande SE ENVÍA (antes se quedaba colgada)', r1.avisos.join(' | '));
  ok(r1.enviado && r1.enviado.bytes <= MAX_ATTACHMENT_BYTES,
    'y sale por debajo del tope, así que no puede dar 413',
    r1.enviado ? `salieron ${(r1.enviado.bytes / 1048576).toFixed(2)} MB` : 'no salió nada');
  ok(r1.enviado && r1.enviado.bytes * 4 / 3 < TOPE_NETLIFY,
    'contando el base64 que le añade Netlify, también',
    r1.enviado ? `${(r1.enviado.bytes * 4 / 3 / 1048576).toFixed(2)} MB en base64` : 'no salió nada');
  ok(r1.avisos.length === 0, 'y sin molestar al usuario con avisos', r1.avisos.join(' | '));

  // Un PNG grande (una captura de pantalla larga) va por el mismo camino.
  await adjuntar({ tipo: 'image/png', megas: 0, ancho: 2400, alto: 3200 });
  const r2 = await enviar();
  ok(r2.enviado && r2.enviado.bytes <= MAX_ATTACHMENT_BYTES,
    'una captura PNG grande también se reduce',
    r2.enviado ? `salieron ${(r2.enviado.bytes / 1048576).toFixed(2)} MB` : `no salió: ${r2.avisos.join(' | ')}`);

  // ———————————————————————————————————————————————————————————————
  // LA OTRA MITAD: lo que no se puede encoger se DICE, no se cuelga.
  console.log('\n--- y lo que no se puede encoger\n');
  await adjuntar({ tipo: 'application/pdf', megas: 9 });
  const r3 = await enviar();
  ok(r3.avisos.length > 0, 'un PDF de 9 MB avisa antes de intentarlo');
  ok(!r3.enviado, 'y no se manda (habría dado 413)');
  ok(!r3.botonBloqueado, 'y el botón vuelve a estar disponible, no «Enviando...» para siempre');

  // Un PDF que sí cabe tiene que salir como siempre.
  await adjuntar({ tipo: 'application/pdf', megas: 1 });
  const r4 = await enviar();
  ok(r4.avisos.length === 0, 'un PDF de 1 MB no se toca ni se avisa', r4.avisos.join(' | '));
  ok(r4.enviado && r4.enviado.talCual, 'y sale tal cual, sin pasar por el lienzo');

  // ———————————————————————————————————————————————————————————————
  // PEGAR UNA CAPTURA EN EL CUADRO DE TEXTO (25/11/2026, propietario:
  // «quiero poder pegar una captura de pantalla también en el cuadro de
  // texto»). El oyente está en el formulario y el evento sube desde el cuadro
  // de texto, así que tiene que valer — pero eso hay que comprobarlo donde
  // pasa, no razonarlo.
  console.log('\n--- pegar una captura\n');
  async function pegarEn(selector) {
    return pagina.evaluate(async (selector) => {
      const c = document.createElement('canvas');
      c.width = 1400; c.height = 900;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#123456';
      ctx.fillRect(0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      const datos = new DataTransfer();
      datos.items.add(new File([blob], 'image.png', { type: 'image/png' }));

      const donde = document.querySelector(selector);
      donde.focus();
      const campo = document.querySelector('.reply-form input[type=file]');
      const t = new DataTransfer();
      campo.files = t.files; // se vacía antes, para no leer el de la prueba anterior
      donde.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: datos, bubbles: true, cancelable: true,
      }));
      return {
        adjuntado: Boolean(campo.files && campo.files.length),
        nombre: campo.files && campo.files.length ? campo.files[0].name : null,
        seVe: document.querySelector('.attach-filename').classList.contains('show'),
      };
    }, selector);
  }

  const p1 = await pegarEn('.reply-form textarea');
  ok(p1.adjuntado, 'pegada EN EL CUADRO DE TEXTO, queda adjunta', 'no se adjuntó nada');
  ok(p1.seVe, 'y se ve su nombre en la barra, para saber que está puesta');
  ok(p1.nombre && p1.nombre.indexOf('imagen-') === 0,
    'con un nombre con la fecha, no el «image.png» del portapapeles', `se llamó ${p1.nombre}`);

  await navegador.close();

  console.log(fallos === 0 ? '\n✔ Sin fallos\n' : `\n✗ ${fallos} fallo(s)\n`);
  process.exit(fallos === 0 ? 0 : 1);
})();
