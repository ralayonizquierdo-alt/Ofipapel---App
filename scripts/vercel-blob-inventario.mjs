// ═══════════════════════════════════════════════════════════════════════════
// ¿Qué ocupa el Blob de Vercel, y qué se puede borrar?
//
//   BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..." node scripts/vercel-blob-inventario.mjs
//
// Solo LISTA. No borra nada. Para borrar hay que pasar --borrar además de un
// filtro explícito, y aun así pide confirmación (ver abajo).
//
// ─── Por qué existe ────────────────────────────────────────────────────────
// El 2026-09-07 el Blob de Vercel superó el límite del plan gratuito: 1,03 GB
// de 1 GB. La gráfica de uso es plana hasta el 20 de julio y sube en línea
// recta desde entonces.
//
// Leyendo el código de RAX-OS solo hay dos cosas que escriban ahí:
//
//   expedientes/<id>/<fecha>-<nombre>      fotos de roturas y devoluciones.
//                                          Se comprimen en el navegador antes
//                                          de subir (1600px, calidad 0,8 →
//                                          unos 300 KB) y SÍ se borran cuando
//                                          se borra el expediente.
//   reclamaciones/<proveedor>/<fecha>-…pdf PDFs de las reclamaciones enviadas
//                                          a proveedores. NUNCA se borran: no
//                                          hay ninguna llamada a `del()` para
//                                          esta ruta en todo el repositorio.
//
// Cuál de las dos se ha comido el giga no se puede saber leyendo código: hay
// que contar lo que hay. De ahí este script. Es la misma regla que el resto de
// la auditoría de este proyecto — enumerar antes de decidir, en vez de suponer
// y borrar lo que no era.
//
// ─── Dónde está el token ───────────────────────────────────────────────────
// Vercel → proyecto rax-os → Settings → Environment Variables →
// BLOB_READ_WRITE_TOKEN. Es un token con permiso de BORRADO: no lo pegues en
// un chat ni lo dejes en un fichero. Pásalo por delante del comando, como en
// el ejemplo de arriba, y ya está.
// ═══════════════════════════════════════════════════════════════════════════

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!TOKEN) {
  console.error('Falta BLOB_READ_WRITE_TOKEN.');
  console.error('Vercel → rax-os → Settings → Environment Variables → BLOB_READ_WRITE_TOKEN\n');
  console.error('  BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..." node scripts/vercel-blob-inventario.mjs');
  process.exit(1);
}

const args = process.argv.slice(2);
const borrar = args.includes('--borrar');
const prefijoFiltro = (args.find((a) => a.startsWith('--prefijo=')) || '').split('=')[1] || '';
const antesDe = (args.find((a) => a.startsWith('--antes-de=')) || '').split('=')[1] || '';

const mb = (b) => (b / 1024 / 1024).toFixed(1) + ' MB';

// La API de Blob pagina de 1.000 en 1.000. Se recorre entera: contar la mitad
// y extrapolar es justo el error que hay que evitar.
async function listarTodo() {
  const todos = [];
  let cursor;
  do {
    const url = new URL('https://blob.vercel-storage.com');
    url.searchParams.set('limit', '1000');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) {
      console.error(`Error ${res.status} al listar:`, (await res.text()).slice(0, 200));
      process.exit(1);
    }
    const json = await res.json();
    todos.push(...(json.blobs || []));
    cursor = json.cursor;
    process.stderr.write(`\r  leídos ${todos.length}…`);
  } while (cursor);
  process.stderr.write('\r' + ' '.repeat(30) + '\r');
  return todos;
}

const blobs = await listarTodo();
const total = blobs.reduce((s, b) => s + (b.size || 0), 0);

console.log(`\n${blobs.length} ficheros · ${mb(total)} en total\n`);

// ─── Reparto por carpeta de primer nivel ──────────────────────────────────
const porRaiz = new Map();
for (const b of blobs) {
  const raiz = (b.pathname || '').split('/')[0] || '(raíz)';
  const e = porRaiz.get(raiz) || { n: 0, bytes: 0 };
  e.n++; e.bytes += b.size || 0;
  porRaiz.set(raiz, e);
}
console.log('POR CARPETA');
for (const [raiz, e] of [...porRaiz].sort((a, b) => b[1].bytes - a[1].bytes)) {
  const pct = ((e.bytes / total) * 100).toFixed(0);
  console.log(`  ${raiz.padEnd(18)} ${String(e.n).padStart(5)} ficheros  ${mb(e.bytes).padStart(10)}  ${pct}%`);
}

// ─── Reparto por antigüedad ────────────────────────────────────────────────
// Lo que se puede borrar sin discutir suele ser lo viejo, así que interesa
// saber cuánto pesa cada tramo antes de decidir dónde poner el corte.
const ahora = Date.now();
const tramos = [
  ['más de 6 meses', 180], ['3 a 6 meses', 90], ['1 a 3 meses', 30],
  ['última semana a 1 mes', 7], ['última semana', 0],
];
console.log('\nPOR ANTIGÜEDAD');
let restantes = [...blobs];
for (const [etiqueta, dias] of tramos) {
  const corte = ahora - dias * 86400000;
  const dentro = restantes.filter((b) => new Date(b.uploadedAt).getTime() < corte);
  restantes = restantes.filter((b) => new Date(b.uploadedAt).getTime() >= corte);
  if (dentro.length) {
    const bytes = dentro.reduce((s, b) => s + (b.size || 0), 0);
    console.log(`  ${etiqueta.padEnd(24)} ${String(dentro.length).padStart(5)} ficheros  ${mb(bytes).padStart(10)}`);
  }
}

// ─── Los 15 más grandes ────────────────────────────────────────────────────
console.log('\nLOS 15 MÁS GRANDES');
for (const b of [...blobs].sort((a, b) => (b.size || 0) - (a.size || 0)).slice(0, 15)) {
  console.log(`  ${mb(b.size || 0).padStart(10)}  ${String(b.uploadedAt).slice(0, 10)}  ${b.pathname}`);
}

// ─── Borrado, solo si se pide explícitamente ───────────────────────────────
if (!borrar) {
  console.log('\nEsto ha sido solo un inventario: no se ha borrado nada.');
  console.log('Para borrar hay que decir QUÉ, con las dos condiciones a la vez:');
  console.log('  node scripts/vercel-blob-inventario.mjs --borrar --prefijo=reclamaciones/ --antes-de=2026-07-01');
  console.log('\nAntes de borrar fotos de expedientes, comprueba que el expediente');
  console.log('correspondiente ya no existe en Firestore: la app las sirve desde');
  console.log('/api/documentos/... y borrarlas deja el expediente sin sus fotos.');
  process.exit(0);
}

if (!prefijoFiltro || !antesDe) {
  console.error('\n--borrar exige --prefijo= y --antes-de= a la vez. Sin las dos, no se borra nada.');
  console.error('Es a propósito: un borrado a lo ancho aquí se lleva fotos de expedientes vivos.');
  process.exit(1);
}

const corte = new Date(antesDe).getTime();
if (Number.isNaN(corte)) { console.error('\n--antes-de no es una fecha válida (usa AAAA-MM-DD).'); process.exit(1); }

const aBorrar = blobs.filter(
  (b) => (b.pathname || '').startsWith(prefijoFiltro) && new Date(b.uploadedAt).getTime() < corte
);
const bytesABorrar = aBorrar.reduce((s, b) => s + (b.size || 0), 0);

console.log(`\nSe van a borrar ${aBorrar.length} ficheros (${mb(bytesABorrar)}):`);
console.log(`  prefijo "${prefijoFiltro}", subidos antes de ${antesDe}`);
for (const b of aBorrar.slice(0, 10)) console.log(`    ${b.pathname}`);
if (aBorrar.length > 10) console.log(`    …y ${aBorrar.length - 10} más`);

if (!aBorrar.length) { console.log('\nNada que borrar con ese filtro.'); process.exit(0); }

console.log('\nEsto NO se puede deshacer. Tienes 10 segundos para cancelar con Ctrl+C.');
await new Promise((r) => setTimeout(r, 10000));

let borrados = 0;
for (const lote of Array.from({ length: Math.ceil(aBorrar.length / 100) }, (_, i) =>
  aBorrar.slice(i * 100, i * 100 + 100))) {
  const res = await fetch('https://blob.vercel-storage.com/delete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: lote.map((b) => b.url) }),
  });
  if (!res.ok) { console.error(`\nError ${res.status}:`, (await res.text()).slice(0, 200)); break; }
  borrados += lote.length;
  process.stderr.write(`\r  borrados ${borrados}/${aBorrar.length}…`);
}
console.log(`\n\nBorrados ${borrados} ficheros · ${mb(bytesABorrar)} liberados.`);
