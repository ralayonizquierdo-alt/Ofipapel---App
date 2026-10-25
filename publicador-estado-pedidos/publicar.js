#!/usr/bin/env node
// EL PUBLICADOR: del listado de GeminisWin a la tabla que lee el bot.
//
//   node publicar.js "C:\\geminisw\\estado-pedidos-web.xls"
//   node publicar.js listado.csv --seco     (lo calcula todo y NO escribe nada)
//
// Corre en la oficina, donde está GeminisWin — no en Netlify. GeminisWin no
// tiene API: alguien (o una tarea programada con computer use, como las Skills
// de listados) genera el listado y esto lo sube.
//
// Credenciales en variables de entorno, nunca en el fichero:
//   SUPABASE_GESTION_EMAIL     gestion@ofipapel.internal
//   SUPABASE_GESTION_PASSWORD  la suya
//
// Esa cuenta solo puede INSERT y UPDATE sobre `estado_pedidos_web`. No puede
// borrar —no hay política de DELETE— ni tocar ninguna otra tabla. No se usa
// `service_role` en ningún sitio.

const { leerListado } = require('./leer-listado');
const {
  construirFilas, detectarColumnas, resumenDeColumnas, ListadoIlegible,
} = require('./filas');

const SUPA_URL = 'https://agjmciudnnginqybnogh.supabase.co';
// La misma clave publishable que ya está en Index.html: es pública y no da
// acceso a esta tabla (se le quitó el permiso a nivel de GRANT). Supabase la
// exige como cabecera `apikey` en toda petición, y por eso está aquí.
const SUPA_ANON = 'sb_publishable_LaJCCCGsN2VIXFDFAxEb6g_eEZHh3j6';

// Se suben por tandas para no mandar un cuerpo enorme de una vez. El listado
// entero de pedidos vivos son unos cientos de filas, así que con esto va en una
// o dos tandas.
const POR_TANDA = 200;

async function entrar(email, password) {
  const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPA_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok || !datos.access_token) {
    throw new Error(`No se pudo entrar en Supabase (${r.status}): ${datos.error_description || datos.msg || 'sin detalle'}`);
  }
  return datos.access_token;
}

// SE ESCRIBE POR UNA FUNCIÓN, NO CONTRA LA TABLA.
//
// `publicar_estado_pedidos(jsonb)` comprueba por dentro que quien llama es
// gestion@ofipapel.internal y hace el alta-o-actualización de cada pedido. Es
// el mismo patrón que `cp_guardar_lote` en Control de Pedidos.
//
// No es una preferencia de estilo: escribiendo contra la tabla ESTO NO FUNCIONA.
// La cuenta del publicador no tiene permiso de lectura —a propósito, para que no
// pueda leerse los pedidos—, y sin lectura un upsert no puede resolver el
// conflicto ni un UPDATE encontrar su fila. Daba de alta un pedido la primera
// vez y a partir de ahí no podía volver a tocarlo nunca. Comprobado contra las
// políticas reales el 25/10/2026.
async function subirTanda(filas, token) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/publicar_estado_pedidos`, {
    method: 'POST',
    headers: {
      apikey: SUPA_ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_filas: filas }),
  });
  if (!r.ok) {
    const detalle = await r.text().catch(() => '');
    throw new Error(`Supabase rechazó la subida (${r.status}): ${detalle.slice(0, 400)}`);
  }
  return Number(await r.json().catch(() => 0)) || 0;
}

function informe({ filas, columnas, sinTraducir, sinNumero, repetidos }) {
  console.log('Columnas encontradas:');
  for (const [campo, titulo] of Object.entries(columnas)) {
    console.log(`   ${campo.padEnd(18)} ${titulo || '— (no está en el listado)'}`);
  }
  console.log('');

  const porEstado = new Map();
  for (const f of filas) porEstado.set(f.estado, (porEstado.get(f.estado) || 0) + 1);
  console.log(`${filas.length} pedidos listos para publicar:`);
  for (const [estado, n] of [...porEstado.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(5)}  ${estado}`);
  }

  if (sinNumero) console.log(`\n${sinNumero} filas sin número de pedido web reconocible (no se publican).`);
  if (repetidos) console.log(`${repetidos} filas repetidas para el mismo pedido: se queda la última.`);

  if (sinTraducir.size) {
    const total = [...sinTraducir.values()].reduce((a, b) => a + b, 0);
    console.log(`\n⚠  ${sinTraducir.size} estados de GeminisWin SIN TRADUCIR (${total} pedidos):`);
    for (const [palabra, n] of [...sinTraducir.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`   ${String(n).padStart(5)}  "${palabra}"`);
    }
    console.log(
      '\n   Esos pedidos NO se publican y el bot seguirá contestando con WooCommerce.\n' +
      '   Para que entren, añade cada palabra a TRADUCCION en estados.js — pero\n' +
      '   solo cuando sepas qué significa de verdad en GeminisWin. Acuérdate de\n' +
      '   "Liquidado": ahí significa COBRADO, no facturado.'
    );
  }
}

// LO QUE SE IMPRIME CON --inspeccionar.
//
// Pensado para copiarlo y mandarlo: dice cómo se llaman las columnas y qué
// palabras hay en las que tienen pocas (ahí está la de estados), y NO enseña
// clientes, importes ni números de pedido.
function inspeccionar(crudo) {
  const columnas = detectarColumnas(crudo.titulos || []);
  console.log(`${crudo.filas.length} filas, ${(crudo.titulos || []).length} columnas.\n`);

  console.log('Lo que reconozco solo:');
  for (const [campo, titulo] of Object.entries(columnas)) {
    console.log(`   ${campo.padEnd(18)} ${titulo || '— no lo encuentro'}`);
  }

  console.log('\nTodas las columnas:');
  for (const col of resumenDeColumnas(crudo)) {
    console.log(`\n   «${col.titulo}»  — ${col.distintos} valores distintos`);
    if (col.valores) {
      for (const [valor, n] of col.valores) {
        console.log(`        ${String(n).padStart(5)}  ${valor === '' ? '(vacío)' : valor}`);
      }
    } else {
      console.log('        (sus valores no se repiten: será el cliente, un número o una fecha)');
    }
  }

  console.log(
    '\nMándame esto tal cual. Con los títulos de las columnas y las palabras de\n' +
    'la de estados queda configurado.\n' +
    '\nSolo se enseñan los valores que SE REPITEN, que son los de catálogo (los\n' +
    'estados). De una columna donde cada fila es distinta —el cliente, el número\n' +
    'de pedido, la fecha— solo sale el título, nunca el contenido.'
  );
}

async function principal() {
  const args = process.argv.slice(2);
  const seco = args.includes('--seco') || args.includes('--dry-run');
  const soloMirar = args.includes('--inspeccionar');
  const ruta = args.find((a) => !a.startsWith('--')) || process.env.LISTADO_PEDIDOS;

  if (!ruta) {
    console.error(
      'Falta el listado.\n' +
      '  node publicar.js <fichero.xls|.xlsx|.csv>                 publica\n' +
      '  node publicar.js <fichero> --seco                         lo calcula y no escribe\n' +
      '  node publicar.js <fichero> --inspeccionar                 solo mira qué trae el listado'
    );
    process.exit(2);
  }

  const crudo = leerListado(ruta);

  // Va antes que nada: es lo que hay que poder hacer cuando el listado todavía
  // no se entiende, que es justo cuando `construirFilas` pararía.
  if (soloMirar) { inspeccionar(crudo); return; }

  const resultado = construirFilas(crudo);
  informe(resultado);

  // Un listado del que no sale ni una fila es un listado que no entendemos: lo
  // peor que se puede hacer es dar por buena una pasada vacía. No se publica
  // nada y se sale con error, para que la tarea programada lo marque como
  // fallida y alguien lo mire.
  if (resultado.filas.length === 0) {
    console.error('\n✗ Ni una sola fila publicable. No se sube nada.');
    process.exit(1);
  }

  if (seco) {
    console.log('\n(--seco: no se ha escrito nada en Supabase.)');
    return;
  }

  const email = process.env.SUPABASE_GESTION_EMAIL;
  const password = process.env.SUPABASE_GESTION_PASSWORD;
  if (!email || !password) {
    console.error('\n✗ Faltan SUPABASE_GESTION_EMAIL y/o SUPABASE_GESTION_PASSWORD.');
    process.exit(2);
  }

  const token = await entrar(email, password);
  let escritos = 0;
  for (let i = 0; i < resultado.filas.length; i += POR_TANDA) {
    escritos += await subirTanda(resultado.filas.slice(i, i + POR_TANDA), token);
  }
  console.log(`\n✔ Publicados ${escritos} pedidos.`);

  // Si la base de datos dice que ha escrito menos filas de las que le mandamos,
  // algo se ha quedado por el camino y conviene que la tarea programada lo
  // marque como fallida: las filas que no se reescriben envejecen y el bot deja
  // de usarlas sin que nadie se entere.
  if (escritos !== resultado.filas.length) {
    console.error(`✗ Se mandaron ${resultado.filas.length} y se escribieron ${escritos}.`);
    process.exit(1);
  }
}

if (require.main === module) {
  principal().catch((err) => {
    if (err instanceof ListadoIlegible) console.error(`\n✗ ${err.message}`);
    else console.error(`\n✗ ${err.message}`);
    process.exit(1);
  });
}

module.exports = { entrar, subirTanda, informe };
