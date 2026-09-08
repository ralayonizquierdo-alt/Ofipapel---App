// ¿Cuándo se consulta el catálogo de ofipapel.net?
//
//   node scripts/probar-catalogo.js
//
// Consultarlo cuesta tiempo real: la web es lenta y a ratos nos bloquea, y
// cuando falla el cliente se lleva un "un segundo, por favor" y la respuesta se
// va a la función de segundo plano. Por eso no se consulta para preguntas que
// no van de productos.
//
// El error NO cuesta lo mismo en las dos direcciones:
//   - Consultar de más: solo cuesta tiempo. Es lo que había antes.
//   - Consultar de menos: el bot se queda sin precios ni stock en una consulta
//     de producto real. Eso es lo caro.
// Así que ante la duda se consulta, y esta batería vigila sobre todo la
// segunda lista.
const Module = require('module');
const path = require('path');
const orig = Module.prototype.require;
const RAIZ = path.join(__dirname, '..');

let consultado = false;
Module.prototype.require = function (p) {
  if (p === './woocommerce-client') {
    return {
      isConfigured: () => true,
      buscarEnCatalogo: async () => { consultado = true; return { productos: [], fallo: false }; },
      searchCategories: async () => { consultado = true; return []; },
    };
  }
  if (p === './conversation-store') {
    return { ...orig.apply(this, arguments), registrarBusquedaSinResultado: async () => {}, leerAliasBusqueda: async () => null };
  }
  return orig.apply(this, arguments);
};
const { construirContextoCatalogo } = require(path.join(RAIZ, 'netlify/functions/whatsapp-catalogo.js'));
Module.prototype.require = orig;

// NO debe consultar: nada de esto está en el catálogo.
const SIN_CATALOGO = [
  'Buenas tardes\nCuanto tardan los pedidos en entregarse?',
  'Un pedido en Tenerife cuanto tardan habitualmente en entregarlo?',
  '¿Cuánto tardáis en entregar?',
  '¿A qué hora abrís?',
  '¿Dónde estáis?',
  '¿Cuál es vuestro horario los sábados?',
  '¿Dónde puedo encontrar la factura?',
  'Muchas gracias, muy amables',
  '¿Hacéis envíos a La Palma?',
  '¿Puedo pagar contra reembolso?',
];

// SÍ debe consultar: hay señal de producto. Equivocarse aquí es lo caro.
const CON_CATALOGO = [
  '¿Tenéis el 305XL?',
  '¿Tenéis grapadoras? ¿Y las mandáis a casa?',
  'Busco un cuaderno A4',
  '¿Cuánto cuesta el tóner TN-248?',
  'Necesito tinta para mi impresora',
  '¿Vendéis papel fotográfico?',
  '¿Hay stock de folios?',
  'Quiero comprar una grapadora',
  '¿Qué precio tiene el cartucho 604?',
  'Tengo una Epson XP-4200, ¿qué tinta lleva?',
  '¿Me dices el precio de las carpetas?',
  'Necesito 500 folios, ¿me los mandáis a casa?',
];

(async () => {
  let fallos = 0;

  console.log('=== NO debe consultar el catálogo (respuesta instantánea) ===');
  for (const texto of SIN_CATALOGO) {
    consultado = false;
    await construirContextoCatalogo({ from: '34600111222', text: texto, history: [] });
    if (consultado) fallos++;
    console.log(`  ${consultado ? 'MAL  consulta' : 'OK   se salta '} <- ${texto.replace(/\n/g, ' / ').slice(0, 62)}`);
  }

  console.log('\n=== SÍ debe consultar (equivocarse aquí es lo caro) ===');
  for (const texto of CON_CATALOGO) {
    consultado = false;
    await construirContextoCatalogo({ from: '34600111222', text: texto, history: [] });
    if (!consultado) fallos++;
    console.log(`  ${consultado ? 'OK   consulta ' : 'MAL  se salta'} <- ${texto.slice(0, 62)}`);
  }

  console.log(fallos === 0 ? '\n✔ Sin fallos' : `\n✗ ${fallos} fallos`);
  process.exit(fallos === 0 ? 0 : 1);
})();
