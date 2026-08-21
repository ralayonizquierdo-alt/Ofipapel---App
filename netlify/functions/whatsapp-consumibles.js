// Qué consumible lleva cada impresora.
//
// El cliente casi nunca sabe la referencia del cartucho; sabe el modelo de su
// impresora ("tengo una Epson XP-4200"). Este módulo hace de puente: del modelo
// a la referencia comercial (604, 604XL...), que es la que el catálogo de
// ofipapel.net entiende y la que va impresa en la caja.
//
// Los datos van EN EL PROPIO BOT (data/consumibles-impresora.json), no se
// consultan por red. Dos razones: la relación equipo-consumible no está
// publicada en la web, y la web se cae o nos bloquea con demasiada frecuencia
// como para depender de ella para esto. Se regenera con
// scripts/generar-consumibles.py a partir del Excel del distribuidor.

const datos = require('./data/consumibles-impresora.json');

// Cómo escribe el catálogo cada referencia. El proveedor nos da "TN248"; la web
// dice "TN-248", y el buscador de WordPress compara letra por letra, así que sin
// esto hay que adivinar la forma probando variantes (con guion, sin guion...).
// Se genera con scripts/emparejar-catalogo.py mirando los nombres reales de los
// productos.
//
// Es opcional a propósito: si el fichero no está, el bot sigue funcionando
// exactamente como antes, adivinando. Así una regeneración a medias nunca deja
// el bot roto.
let REFERENCIAS_CATALOGO = {};
try {
  REFERENCIAS_CATALOGO = require('./data/referencias-catalogo.json').referencias || {};
} catch {
  console.warn('whatsapp-consumibles: sin referencias-catalogo.json, se buscará por la referencia del proveedor.');
}

// Un alias de 4 caracteres ("C2326") es corto y podría aparecer por casualidad
// en cualquier frase; solo se acepta si además se nombra la marca. Los de 5 o
// más ("MFCL2710DW", "SMARTTANK5109") son inconfundibles por sí solos.
const LARGO_SIN_MARCA = 5;

// Cuántas impresoras distintas se le pasan a la IA como mucho. Un modelo escrito
// a medias ("una MFC-L2710") puede encajar con varias versiones del mismo
// equipo; con tres basta para que la IA pregunte cuál es sin abrumar.
const MAX_IMPRESORAS = 3;

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

// El índice se construye una sola vez por arranque de la función, no en cada
// mensaje: son ~470 impresoras y reordenarlas en cada llamada sería tirar
// milisegundos a la basura dentro de un presupuesto de 10 segundos.
const INDICE = (() => {
  const entradas = [];
  datos.impresoras.forEach((impresora, posicion) => {
    impresora.a.forEach((alias) => {
      if (alias.length < 4) return;
      entradas.push({ alias, posicion, marca: normalizar(impresora.m) });
    });
  });
  // De más largo a más corto: si el cliente escribe "MFCL2710DW" queremos ese
  // modelo y no el "MFCL2710" genérico que también encajaría.
  return entradas.sort((a, b) => b.alias.length - a.alias.length);
})();

// Las palabras del mensaje que pueden ser un modelo: llevan letra y número
// juntos ("XP-4200", "MA2100"). Sirven para el segundo intento, el de modelo
// escrito a medias.
function posiblesModelos(texto) {
  return String(texto || '')
    .split(/[\s,;.:()/]+/)
    .map(normalizar)
    .filter((p) => p.length >= 4 && /[A-Z]/.test(p) && /[0-9]/.test(p));
}

function buscarImpresoras(texto) {
  const plano = normalizar(texto);
  if (plano.length < 4) return [];

  const encontradas = [];
  const vistas = new Set();

  // El índice está ordenado de alias más largo a más corto, así que el primero
  // que encaja es el modelo más específico. A partir de ahí solo se aceptan
  // alias de la misma longitud: los más cortos son trozos del mismo modelo.
  const recoger = (encaja, soloElMasEspecifico = true) => {
    let largoDelPrimero = 0;
    for (const entrada of INDICE) {
      if (entrada.alias.length < LARGO_SIN_MARCA && !plano.includes(entrada.marca)) continue;
      if (!encaja(entrada.alias)) continue;

      if (largoDelPrimero === 0) largoDelPrimero = entrada.alias.length;
      if (soloElMasEspecifico && entrada.alias.length < largoDelPrimero) break;

      if (vistas.has(entrada.posicion)) continue;
      vistas.add(entrada.posicion);
      encontradas.push(datos.impresoras[entrada.posicion]);
      if (encontradas.length >= MAX_IMPRESORAS) return;
    }
  };

  recoger((alias) => plano.includes(alias));
  if (encontradas.length > 0) return encontradas;

  // Nadie escribe el modelo entero. "Tengo una ECOSYS MA2100" tiene que llegar
  // a la MA2100cwfx y a la MA2100fx; de eso se encarga esta segunda pasada, que
  // acepta que el alias EMPIECE por lo que escribió el cliente. Se pide un poco
  // más de longitud porque un prefijo corto encaja con demasiadas cosas.
  const modelos = posiblesModelos(texto).filter((m) => m.length >= LARGO_SIN_MARCA);
  if (modelos.length === 0) return encontradas;
  recoger((alias) => modelos.some((m) => alias.startsWith(m)), false);

  return encontradas;
}

function consumiblesDe(impresora) {
  return impresora.c.map((i) => datos.consumibles[i]).filter(Boolean);
}

// La FAMILIA de una referencia: lo que comparten todos los colores del mismo
// tóner. TN248BK, TN248C, TN248XLM y TN248VAL son todos "TN248".
//
// Hace falta porque en una láser color cada referencia aparece UNA vez (una por
// color), así que contarlas tal cual no distingue el tóner del cliente de la
// correa de arrastre. Visto en real con una Brother DCP-L3560CDW: se buscó en
// el catálogo por "BU229CL" (el cinturón de arrastre) en vez de por el tóner, y
// no salió ni un precio.
// También se quita la capacidad (XL/XXL): "604" y "604XL" son el mismo cartucho
// en dos tamaños, y buscar el catálogo por "604" encuentra los dos, mientras que
// buscar por "604XL" deja fuera el normal.
const SUFIJO_DE_COLOR = /(BK|CL|VAL|CMY|[CMYK])$/;
const SUFIJO_DE_CAPACIDAD = /XX?L$/;

function familiaDeReferencia(ref) {
  const base = String(ref || '').toUpperCase().replace(SUFIJO_DE_COLOR, '').replace(SUFIJO_DE_CAPACIDAD, '');
  return base || String(ref || '');
}

// La referencia con la que merece la pena buscar en el catálogo: la familia que
// más se repite entre los consumibles de esa impresora. Es la del consumible que
// se gasta — el tóner o la tinta —, porque de eso hay uno por color y de los
// tambores y recipientes de residuos hay uno solo.
function referenciaPrincipal(impresora) {
  const cuenta = new Map();
  for (const consumible of consumiblesDe(impresora)) {
    if (!consumible.r) continue;
    const familia = familiaDeReferencia(consumible.r);
    cuenta.set(familia, (cuenta.get(familia) || 0) + 1);
  }

  let mejor = null;
  for (const [familia, veces] of cuenta) {
    // A igualdad de apariciones gana la más corta: entre "604" y "604XL", "604"
    // encuentra las dos en el catálogo y "604XL" solo una.
    const gana = !mejor || veces > mejor.veces || (veces === mejor.veces && familia.length < mejor.familia.length);
    if (gana) mejor = { familia, veces };
  }
  return mejor ? mejor.familia : null;
}

// Con qué preguntarle al catálogo por el consumible de esta impresora: la forma
// exacta en que está escrito ahí, si la sabemos, y si no la referencia tal cual
// viene del proveedor (que es lo que se hacía siempre hasta ahora).
function consultaDeCatalogo(impresora) {
  const familia = referenciaPrincipal(impresora);
  if (!familia) return null;
  return REFERENCIAS_CATALOGO[familia] || familia;
}

function bloqueDeConsumibles(impresoras) {
  if (!impresoras || impresoras.length === 0) return null;

  const fichas = impresoras.map((impresora) => {
    const lista = consumiblesDe(impresora)
      .map((c) => `  · ${c.d}${c.r && !c.d.includes(c.r) ? ` (ref. ${c.r})` : ''}`)
      .join('\n');
    return `- ${impresora.m} ${impresora.n}:\n${lista}`;
  });

  return [
    'CONSUMIBLES DE LA IMPRESORA que menciona el cliente (dato interno de Ofipapel,',
    'sacado de la tabla equipo-consumible del proveedor — es fiable):',
    fichas.join('\n'),
    '',
    'Úsalo para decirle QUÉ referencia necesita. Ojo:',
    '- Si arriba aparece más de una impresora, no adivines: pregúntale cuál es la suya.',
    '- Esta lista dice qué consumible es compatible, NO que lo tengamos en tienda ni a',
    '  qué precio. NUNCA digas "en stock", "disponibles" ni "tenemos" apoyándote en esta',
    '  lista: eso solo lo sabes por el bloque PRODUCTOS. Si ahí no hay nada, dile la',
    '  referencia que necesita y ofrécele consultar precio y disponibilidad.',
    '- Estas referencias son las ORIGINALES del fabricante. En la tienda solemos tener',
    '  además COMPATIBLES de la misma referencia, bastante más baratos: en el bloque',
    '  PRODUCTOS aparecen con la palabra "Compatible" en el nombre. Si los ves ahí,',
    '  ofrécelos junto al original diciendo cuál es cuál y el precio de cada uno — es lo',
    '  que la mayoría de los clientes acaba llevándose. Si en PRODUCTOS no hay ningún',
    '  compatible, no lo des por hecho: di que lo consultas.',
  ].join('\n');
}

// Respuesta de seguridad cuando la IA se ha venido arriba con el stock y no
// había datos de catálogo que lo respaldaran. La genérica ("¿qué estás
// buscando?") tiraría a la basura lo único cierto que teníamos: la referencia.
// Esta la conserva y es honesta con lo que no sabemos.
function respuestaSinCatalogo(impresoras) {
  if (!impresoras || impresoras.length === 0) return null;

  const { STORES } = require('./whatsapp-agent-config');
  const contacto = `escribe a pedidos@ofipapelsl.com, llama al ${STORES[0].phone} o pásate por la tienda`;

  if (impresoras.length > 1) {
    const modelos = impresoras.map((i) => `${i.m} ${i.n}`.trim()).join(', ');
    return `Para darte la referencia exacta necesito saber cuál es tu modelo: ¿${modelos}? Dímelo y te digo qué cartucho lleva.`;
  }

  const impresora = impresoras[0];

  // Solo las referencias del consumible que se gasta (el tóner o la tinta). El
  // tambor, el cinturón de arrastre y el recipiente de residuos también salen en
  // el índice, pero nadie los pide por WhatsApp y alargan el mensaje para nada.
  const familia = referenciaPrincipal(impresora);
  const referencias = [];
  for (const consumible of consumiblesDe(impresora)) {
    if (!consumible.r || familiaDeReferencia(consumible.r) !== familia) continue;
    if (!referencias.includes(consumible.r)) referencias.push(consumible.r);
  }
  if (referencias.length === 0) return null;

  // Se dan todas las referencias, no solo la primera: en una láser color son
  // cuatro colores y dos capacidades, y quedarse con una sola obliga al cliente
  // a preguntar otra vez.
  const lista = referencias.join(', ');

  return (
    `Esa impresora lleva ${referencias.length > 1 ? 'estas referencias' : 'esta referencia'}: ${lista}. ` +
    `Lo que no puedo confirmarte ahora mismo es el precio ni si nos queda, ni si hay versión compatible ` +
    `(que suele salir más barata): para eso ${contacto}.`
  );
}

module.exports = {
  buscarImpresoras,
  consumiblesDe,
  referenciaPrincipal,
  consultaDeCatalogo,
  bloqueDeConsumibles,
  respuestaSinCatalogo,
  normalizar,
};
