// LEER EL LISTADO QUE SALE DE GEMINISWIN.
//
// GeminisWin exporta sus listados a Excel 5.0/95 (lo hace solo, al procesar con
// salida a pantalla y «Guardar como XLS»), y desde Excel se puede guardar como
// .xlsx o .csv. Se aceptan los tres para no obligar a nadie a un paso de más.
//
// El CSV se lee aquí mismo, sin dependencias: así la batería de pruebas corre
// con `node` pelado, sin instalar nada. Para .xls/.xlsx hace falta SheetJS
// (`npm install` en esta carpeta), que se carga solo si se usa.

const fs = require('fs');
const path = require('path');

// Un CSV de Excel en español lleva `;` y viene en Windows-1252 o UTF-8 con BOM.
// Se detecta el separador por la primera línea en vez de darlo por hecho.
function separadorDe(linea) {
  const puntoYComa = (linea.match(/;/g) || []).length;
  const comas = (linea.match(/,/g) || []).length;
  const tabs = (linea.match(/\t/g) || []).length;
  if (tabs > puntoYComa && tabs > comas) return '\t';
  return puntoYComa >= comas ? ';' : ',';
}

// Partir respetando las comillas: un campo entrecomillado puede llevar el
// separador dentro ("ROLLOS 80x65; pack 8") y partir a lo bruto lo rompería.
function partirLinea(linea, sep) {
  const campos = [];
  let actual = '';
  let entreComillas = false;
  for (let i = 0; i < linea.length; i += 1) {
    const c = linea[i];
    if (entreComillas) {
      if (c === '"' && linea[i + 1] === '"') { actual += '"'; i += 1; continue; }
      if (c === '"') { entreComillas = false; continue; }
      actual += c;
      continue;
    }
    if (c === '"') { entreComillas = true; continue; }
    if (c === sep) { campos.push(actual); actual = ''; continue; }
    actual += c;
  }
  campos.push(actual);
  return campos.map((c) => c.trim());
}

function leerCSV(texto) {
  const limpio = texto.replace(/^﻿/, '');
  const lineas = limpio.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lineas.length === 0) return { titulos: [], filas: [] };

  const sep = separadorDe(lineas[0]);
  const titulos = partirLinea(lineas[0], sep);
  const filas = lineas.slice(1).map((linea) => {
    const campos = partirLinea(linea, sep);
    const fila = {};
    titulos.forEach((titulo, i) => { fila[titulo] = campos[i] === undefined ? '' : campos[i]; });
    return fila;
  });
  return { titulos, filas };
}

function leerExcel(ruta) {
  let XLSX;
  try {
    // eslint-disable-next-line global-require
    XLSX = require('xlsx');
  } catch (err) {
    throw new Error(
      'Para leer .xls/.xlsx hace falta SheetJS. Ejecuta `npm install` dentro de ' +
      'publicador-estado-pedidos/, o guarda el listado como CSV desde Excel.'
    );
  }
  const libro = XLSX.readFile(ruta, { cellDates: true });
  // El listado va en la primera hoja; GeminisWin no exporta varias.
  const hoja = libro.Sheets[libro.SheetNames[0]];
  if (!hoja) return { titulos: [], filas: [] };

  // `defval: ''` para que una celda vacía exista como columna y no desaparezca
  // de la fila, que es lo que rompe la detección de columnas por título.
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: false });
  const titulos = filas.length ? Object.keys(filas[0]) : [];
  return { titulos, filas };
}

// Devuelve { titulos, filas } — las filas son objetos planos con el título de
// cada columna como clave, tal cual los escribe GeminisWin.
function leerListado(ruta) {
  if (!fs.existsSync(ruta)) throw new Error(`No existe el fichero: ${ruta}`);
  const ext = path.extname(ruta).toLowerCase();
  if (ext === '.csv' || ext === '.txt' || ext === '.tsv') {
    return leerCSV(fs.readFileSync(ruta, 'utf8'));
  }
  return leerExcel(ruta);
}

module.exports = { leerListado, leerCSV, partirLinea, separadorDe };
