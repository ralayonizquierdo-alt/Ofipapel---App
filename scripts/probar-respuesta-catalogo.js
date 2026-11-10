#!/usr/bin/env node
// Comprueba que la respuesta de producto la escribe el CATÁLOGO y no la IA.
//
// «La IA no debe contestar sobre productos del catálogo» (propietario,
// 8/11/2026). Lo que se comprueba aquí es justo eso: que de lo que entra
// (nombre, precio, enlace, stock) no sale ni una palabra más, que el precio
// nunca se da sin decir que va sin IGIC, y que lo que no hay no se esconde.

const {
  respuestaDeCatalogo,
  nadaEnElCatalogo,
  pareceUnaIncidencia,
  MAXIMO_EN_LISTA,
} = require('../netlify/functions/whatsapp-respuesta-catalogo');

let fallos = 0;
const bien = (t) => console.log(`  OK   ${t}`);
const mal = (t, extra) => {
  fallos += 1;
  console.log(`  ✗ MAL ${t}${extra ? `\n       ${extra}` : ''}`);
};
const comprobar = (cond, t, extra) => (cond ? bien(t) : mal(t, extra));

const producto = (n) => ({
  nombre: `PRODUCTO ${n}`,
  precio: `${n},90€`,
  url: `https://ofipapel.net/p/${n}`,
  disponible: true,
});

console.log('\n=== Un solo producto');
{
  const dicho = respuestaDeCatalogo([
    { nombre: 'PAPEL Fotocopia A-4 80gr', precio: '9,90€', url: 'https://ofipapel.net/p/1', disponible: true },
  ]);
  comprobar(dicho.includes('PAPEL Fotocopia A-4 80gr'), 'dice el nombre tal cual lo trae el catálogo');
  comprobar(dicho.includes('9,90€'), 'dice el precio tal cual');
  comprobar(/IGIC/.test(dicho), 'y avisa de que el precio va sin IGIC', dicho);
  comprobar(dicho.includes('https://ofipapel.net/p/1'), 'y da el enlace de la ficha');
  // Lo importante: NADA que no estuviera en los datos.
  const sobrante = dicho
    .replace(/PAPEL Fotocopia A-4 80gr|9,90€|https:\/\/ofipapel\.net\/p\/1/g, '')
    .match(/\b(gramaje|resma|folios|blancura|ideal|perfecto|recomend\w+)\b/i);
  comprobar(!sobrante, 'y no añade ni una palabra de cosecha propia', sobrante && sobrante[0]);
}

console.log('\n=== Sin stock: se avisa, no se esconde');
{
  const dicho = respuestaDeCatalogo([
    { nombre: 'TIJERA escolar', precio: '1,20€', url: 'https://ofipapel.net/p/2', disponible: false },
  ]);
  comprobar(dicho.includes('TIJERA escolar'), 'el producto sigue saliendo');
  comprobar(/sin stock/i.test(dicho), 'y dice que figura sin stock', dicho);
  comprobar(/compras@ofipapelsl\.com|922 753 520/.test(dicho), 'y dice a quién preguntar por la reposición');
}

console.log('\n=== Varios productos: se enseñan todos, sin preguntar antes');
{
  const dicho = respuestaDeCatalogo(
    [producto(1), producto(2), producto(3)],
    { enlaceBusqueda: 'https://ofipapel.net/?s=algo' },
  );
  comprobar(
    ['PRODUCTO 1', 'PRODUCTO 2', 'PRODUCTO 3'].every((n) => dicho.includes(n)),
    'salen los tres con su precio',
  );
  comprobar(dicho.includes('https://ofipapel.net/?s=algo'), 'y el enlace de la búsqueda entera');
  comprobar(!/\?\s*$/.test(dicho.trim()), 'y NO acaba preguntándole qué tamaño quiere', dicho);
}

console.log('\n=== Muchos productos: no se pega el catálogo en el chat');
{
  const muchos = Array.from({ length: 12 }, (_, i) => producto(i + 1));
  const dicho = respuestaDeCatalogo(muchos, { enlaceBusqueda: 'https://ofipapel.net/?s=algo' });
  const cuantos = (dicho.match(/^• /gm) || []).length;
  comprobar(cuantos === MAXIMO_EN_LISTA, `lista ${MAXIMO_EN_LISTA} como máximo`, `listó ${cuantos}`);
  comprobar(/Hay 7 m[áa]s/.test(dicho), 'y dice cuántos quedan en el enlace', dicho);
}

console.log('\n=== Precio a consultar');
{
  const dicho = respuestaDeCatalogo([
    { nombre: 'VINILO POSCA', precio: null, url: 'https://ofipapel.net/p/9', disponible: true },
  ]);
  comprobar(/a consultar/i.test(dicho), 'sin precio en la web, dice «a consultar»', dicho);
  comprobar(!/0\s*€|gratis|regalo/i.test(dicho), 'y no se lo inventa ni lo pone a cero');
}

console.log('\n=== Escalado por cantidad: se avisa, no se resume');
{
  const dicho = respuestaDeCatalogo([
    {
      nombre: 'BOLIGRAFO BIC',
      precio: '0,30€',
      url: 'https://ofipapel.net/p/4',
      disponible: true,
      ofertaPorCantidad: true,
    },
  ]);
  comprobar(/ficha/i.test(dicho), 'manda a la ficha, que es donde están los tramos', dicho);
  comprobar(!/\b\d+\s*(uds|unidades)\s*(x|por|a)\s*\d/.test(dicho), 'y no se inventa ningún tramo');
}

console.log('\n=== Sin resultados: no se dice «no lo tenemos»');
{
  comprobar(respuestaDeCatalogo([]) === null, 'sin productos no compone nada y el turno sigue');
  comprobar(respuestaDeCatalogo(null) === null, 'ni con una lista que no llegó');
  const dicho = nadaEnElCatalogo('es', 'https://ofipapel.net/?s=x');
  comprobar(!/no lo tenemos|no tenemos/i.test(dicho), 'no afirma que no exista (puede estar en tienda)', dicho);
  comprobar(dicho.includes('https://ofipapel.net/?s=x'), 'y le deja el enlace para que mire él');
}

console.log('\n=== En inglés');
{
  const dicho = respuestaDeCatalogo(
    [{ nombre: 'A-4 PAPER', precio: '9,90€', url: 'https://ofipapel.net/p/1', disponible: false }],
    { idioma: 'en' },
  );
  comprobar(/out of stock/i.test(dicho), 'el aviso de stock va en inglés', dicho);
  comprobar(/IGIC/.test(dicho), 'y el IGIC se sigue diciendo');
}

console.log('\n=== Una incidencia no se contesta con precios');
{
  const incidencias = [
    'el papel que me mandasteis viene roto',
    'el cartucho vino dañado',
    'no me ha llegado el pedido de folios',
    'quiero devolver unos folios',
    'me enviasteis el toner equivocado',
  ];
  for (const t of incidencias) {
    comprobar(pareceUnaIncidencia(t), `se reconoce: «${t}»`);
  }
  // Y lo que sí es una consulta de producto NO se confunde con una incidencia:
  // si se confundiera, el catálogo dejaría de mandar y volveríamos a la IA.
  const consultas = [
    'teneis folios A4?',
    'me hace falta papel',
    'cuanto vale el cartucho 305XL?',
    'busco sillas de oficina',
    'me interesan boligrafos de colores',
  ];
  for (const t of consultas) {
    comprobar(!pareceUnaIncidencia(t), `sigue siendo consulta: «${t}»`);
  }
}

if (fallos > 0) {
  console.log(`\n✗ ${fallos} fallo(s)\n`);
  process.exit(1);
}
console.log('\n✔ La respuesta de producto sale del catálogo, no de la IA\n');
