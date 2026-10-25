// DEL LISTADO DE GEMINISWIN A LAS FILAS DE LA TABLA.
//
// Todo lo que decide algo vive aquí y es función pura, para poder probarlo sin
// GeminisWin, sin Excel y sin Supabase (`node scripts/probar-publicador.js`).
//
// Las columnas se buscan POR TÍTULO, no por posición, igual que en Control de
// Pedidos: un listado al que alguien le añade una columna no debe empezar a
// publicar basura en silencio. Si falta una de las dos imprescindibles —el
// número de pedido web y el estado—, esto para y dice qué títulos encontró, que
// es la información con la que se arregla en treinta segundos.

const { normalizar, traducir } = require('./estados');

// Títulos posibles de cada columna, normalizados. Se añaden los que haga falta
// según lo que traiga el listado de verdad; mientras tanto, cuantos más
// razonables, menos probable es tener que tocar nada.
const TITULOS = {
  pedido_web: [
    'pedido web', 'n pedido web', 'no pedido web', 'num pedido web', 'numero pedido web',
    'pedido internet', 'pedido tienda online', 'su pedido', 'pedido cliente',
    'referencia web', 'ref web',
  ],
  estado: ['estado', 'situacion', 'estado pedido', 'estado del pedido'],
  fecha_hora_pedido: [
    'fecha pedido', 'fecha hora pedido', 'fecha del pedido', 'fecha entrada', 'fecha',
  ],
  fecha_factura: ['fecha factura', 'f factura', 'fecha de factura'],
  fecha_reparto: ['fecha reparto', 'f reparto', 'fecha de reparto', 'fecha carga', 'fecha envio'],
};

function buscarColumna(titulos, candidatos) {
  const normalizados = titulos.map((t) => ({ titulo: t, norma: normalizar(t) }));
  for (const candidato of candidatos) {
    const exacto = normalizados.find((t) => t.norma === candidato);
    if (exacto) return exacto.titulo;
  }
  // Segunda pasada, más tolerante: «Nº Pedido Web (origen)» contiene el
  // candidato. Se prueba solo después de agotar las coincidencias exactas para
  // que «fecha» no se lleve por delante a «fecha factura».
  for (const candidato of candidatos) {
    const contiene = normalizados.find((t) => t.norma.includes(candidato));
    if (contiene) return contiene.titulo;
  }
  return null;
}

function detectarColumnas(titulos) {
  const columnas = {};
  for (const [campo, candidatos] of Object.entries(TITULOS)) {
    columnas[campo] = buscarColumna(titulos, candidatos);
  }
  return columnas;
}

// --------------------------------------------------------------------------
// FECHAS.
//
// GeminisWin las escribe a la española (23/10/2026, con o sin hora). Las dos
// columnas de día (factura y reparto) van a la tabla como día pelado, sin zona
// horaria, que es como las lee el bot.
//
// La del pedido NO: lleva hora y con ella se decide si entró antes de las 13:00
// (netlify/functions/gestion-pedidos.js). Y ahí la zona horaria importa de
// verdad — en verano Canarias va una hora por delante de UTC, así que mandar
// «07:56» como si fuera UTC correría la hora de corte media parte del año. Se
// convierte el instante exacto usando la zona de Canarias de ESA fecha, no la
// de hoy.
// --------------------------------------------------------------------------

const TIMEZONE = 'Atlantic/Canary';

function offsetMinutos(instante) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(instante);
  const v = (tipo) => Number(partes.find((p) => p.type === tipo).value);
  const comoSiFueraUTC = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour') % 24, v('minute'));
  return (comoSiFueraUTC - instante.getTime()) / 60000;
}

// Hora de pared en Canarias → el instante real. Dos pasadas bastan: la primera
// da el desfase aproximado y la segunda lo corrige.
function instanteEnCanarias(a, m, d, hh, mm) {
  const pared = Date.UTC(a, m - 1, d, hh, mm);
  let t = pared;
  for (let i = 0; i < 2; i += 1) t = pared - offsetMinutos(new Date(t)) * 60000;
  return new Date(t);
}

function trocearFecha(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return {
      a: valor.getFullYear(), m: valor.getMonth() + 1, d: valor.getDate(),
      hh: valor.getHours(), mm: valor.getMinutes(),
    };
  }
  const texto = String(valor == null ? '' : valor).trim();
  if (!texto) return null;

  const conHora = texto.match(
    /^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:[\sT]+(\d{1,2}):(\d{2}))?/
  );
  if (!conHora) return null;

  let [, p1, p2, p3, hh, mm] = conHora;
  let a; let m; let d;
  if (p1.length === 4) {
    // 2026-10-23
    [a, m, d] = [Number(p1), Number(p2), Number(p3)];
  } else {
    // 23/10/2026 (y 23/10/26)
    [d, m, a] = [Number(p1), Number(p2), Number(p3)];
    if (a < 100) a += 2000;
  }
  if (!(a >= 2000 && a <= 2100) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { a, m, d, hh: Number(hh || 0), mm: Number(mm || 0) };
}

// «23/10/2026» → «2026-10-23». Para las columnas de día.
function aDia(valor) {
  const t = trocearFecha(valor);
  if (!t) return null;
  return `${t.a}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`;
}

// «23/10/2026 7:56» → el instante exacto, en ISO. Para la fecha del pedido.
function aInstante(valor) {
  const t = trocearFecha(valor);
  if (!t) return null;
  return instanteEnCanarias(t.a, t.m, t.d, t.hh, t.mm).toISOString();
}

// --------------------------------------------------------------------------
// EL NÚMERO DE PEDIDO WEB.
//
// Es la clave de la tabla y tiene que ser EXACTAMENTE el número con el que el
// cliente escribe y con el que el bot pregunta a WooCommerce (663273). Viene
// con adornos según dónde lo guarde GeminisWin: «#663273», «Pedido 663273»,
// «663273 WEB».
//
// Se queda con las cifras. Si lo que sale no parece un número de pedido —menos
// de cuatro cifras, o nada—, esa fila no se publica: una clave inventada es una
// fila que el bot encontraría para el pedido equivocado.
// --------------------------------------------------------------------------
function claveWeb(valor) {
  const cifras = String(valor == null ? '' : valor).replace(/\D+/g, '');
  if (cifras.length < 4 || cifras.length > 9) return null;
  return String(Number(cifras)); // sin ceros a la izquierda
}

// --------------------------------------------------------------------------

class ListadoIlegible extends Error {}

// Devuelve { filas, columnas, sinTraducir, sinNumero, repetidos }.
//
// `filas` es lo que se manda a Supabase tal cual. `actualizado` NO se envía
// nunca: lo pone la base de datos con su trigger.
function construirFilas({ titulos, filas }) {
  const columnas = detectarColumnas(titulos || []);

  if (!columnas.pedido_web || !columnas.estado) {
    const falta = [!columnas.pedido_web && 'el número de pedido web', !columnas.estado && 'el estado']
      .filter(Boolean).join(' y ');
    throw new ListadoIlegible(
      `No encuentro ${falta} en el listado.\n` +
      `Columnas que trae: ${(titulos || []).join(' | ') || '(ninguna)'}\n` +
      'Añade el título que corresponda a TITULOS, en publicador-estado-pedidos/filas.js.'
    );
  }

  const porPedido = new Map();
  const sinTraducir = new Map();
  let sinNumero = 0;
  let repetidos = 0;

  for (const fila of filas) {
    const pedidoWeb = claveWeb(fila[columnas.pedido_web]);
    if (!pedidoWeb) { sinNumero += 1; continue; }

    const bruto = fila[columnas.estado];
    const estado = traducir(bruto);
    if (!estado) {
      const palabra = String(bruto == null ? '' : bruto).trim() || '(vacío)';
      sinTraducir.set(palabra, (sinTraducir.get(palabra) || 0) + 1);
      continue;
    }

    if (porPedido.has(pedidoWeb)) repetidos += 1;
    porPedido.set(pedidoWeb, {
      pedido_web: pedidoWeb,
      estado,
      fecha_hora_pedido: columnas.fecha_hora_pedido ? aInstante(fila[columnas.fecha_hora_pedido]) : null,
      fecha_factura: columnas.fecha_factura ? aDia(fila[columnas.fecha_factura]) : null,
      fecha_reparto: columnas.fecha_reparto ? aDia(fila[columnas.fecha_reparto]) : null,
    });
  }

  return { filas: [...porPedido.values()], columnas, sinTraducir, sinNumero, repetidos };
}

// --------------------------------------------------------------------------
// MIRAR UN LISTADO SIN TOCAR NADA.
//
// La primera vez que esto se encuentre con un listado de GeminisWin de verdad,
// lo normal es que algo no cuadre: una columna que se llama distinto, o
// palabras de estado que no conocemos. `construirFilas` para y dice qué falta,
// pero para arreglarlo hace falta ver el listado entero — y el listado lleva
// clientes reales, así que no puede salir de la oficina.
//
// Esto saca lo único que hace falta para configurarlo y que NO es confidencial:
// cómo se llaman las columnas y qué palabras distintas hay en cada una de las
// pocas. Ni nombres, ni importes, ni números de pedido.
//
// Una columna es "de catálogo" cuando sus valores SE REPITEN: la de estados
// tiene cinco o seis palabras para trescientas filas, la de clientes tiene
// trescientas. Solo se enseñan las de catálogo.
//
// No basta con contar valores distintos: en un listado de cuatro filas, cuatro
// clientes son cuatro valores distintos y se colarían. Por eso se exige además
// que cada valor se repita, de media, al menos una vez — una columna donde cada
// fila es diferente no se enseña, sea el listado grande o pequeño.
const MAXIMO_VALORES_DISTINTOS = 25;

function esDeCatalogo(distintos, filas) {
  return distintos > 0 && distintos <= MAXIMO_VALORES_DISTINTOS && distintos * 2 <= filas;
}

function resumenDeColumnas({ titulos, filas }) {
  const lista = titulos && titulos.length
    ? titulos
    : [...new Set(filas.flatMap((f) => Object.keys(f)))];

  return lista.map((titulo) => {
    const cuenta = new Map();
    for (const fila of filas) {
      const valor = String(fila[titulo] == null ? '' : fila[titulo]).trim();
      cuenta.set(valor, (cuenta.get(valor) || 0) + 1);
    }
    const distintos = cuenta.size;
    const valores = esDeCatalogo(distintos, filas.length)
      ? [...cuenta.entries()].sort((a, b) => b[1] - a[1])
      : null;
    return { titulo, distintos, valores };
  });
}

module.exports = {
  TITULOS, detectarColumnas, buscarColumna, construirFilas, resumenDeColumnas,
  claveWeb, aDia, aInstante, instanteEnCanarias, ListadoIlegible,
  MAXIMO_VALORES_DISTINTOS, esDeCatalogo,
};
