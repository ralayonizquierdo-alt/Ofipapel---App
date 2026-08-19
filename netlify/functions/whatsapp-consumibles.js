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

// La referencia con la que merece la pena buscar en el catálogo: la que más se
// repite entre los consumibles de esa impresora. En una inkjet suelen ser
// cuatro colores de la misma referencia ("604"), así que la más repetida es
// justo la que el cliente necesita.
function referenciaPrincipal(impresora) {
  const cuenta = new Map();
  for (const consumible of consumiblesDe(impresora)) {
    const ref = consumible.r;
    if (!ref) continue;
    cuenta.set(ref, (cuenta.get(ref) || 0) + 1);
  }
  let mejor = null;
  for (const [ref, veces] of cuenta) {
    if (!mejor || veces > mejor.veces) mejor = { ref, veces };
  }
  return mejor ? mejor.ref : null;
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
    '  qué precio. El precio y el stock solo salen del bloque PRODUCTOS. Si ahí no hay',
    '  nada, dile la referencia que necesita y ofrécele consultar disponibilidad.',
    '- Son las referencias ORIGINALES. Si pregunta por compatibles o genéricos, dile',
    '  que lo consultas, sin prometer que exista.',
  ].join('\n');
}

module.exports = {
  buscarImpresoras,
  consumiblesDe,
  referenciaPrincipal,
  bloqueDeConsumibles,
  normalizar,
};
