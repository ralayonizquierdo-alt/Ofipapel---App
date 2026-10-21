// Fotos de los registros del parte, guardadas DE MOMENTO solo en este aparato
// (IndexedDB: localStorage no tiene sitio para imágenes). Dónde se guardan de
// verdad —para que lleguen al ordenador y al parte— está pendiente de decidir
// con el propietario; el registro solo apunta los ids (`entry.fotos`).
//
// Cada foto se reduce antes de guardarla (lado mayor 1600 px, JPEG 0,75: unos
// 200–400 KB) para no llenar el teléfono.
(function (raiz) {
  const BD = 'fauna-fotos', ALMACEN = 'fotos', LADO_MAX = 1600, CALIDAD = 0.75;
  let abierta = null;
  function bd() {
    abierta ||= new Promise((ok, mal) => {
      const pet = indexedDB.open(BD, 1);
      pet.onupgradeneeded = () => pet.result.createObjectStore(ALMACEN, {keyPath: 'id'});
      pet.onsuccess = () => ok(pet.result);
      pet.onerror = () => { abierta = null; mal(pet.error || new Error('No se puede abrir el almacén de fotos.')); };
    });
    return abierta;
  }
  async function operar(modo, hacer) {
    const db = await bd();
    return new Promise((ok, mal) => {
      const tx = db.transaction(ALMACEN, modo), pet = hacer(tx.objectStore(ALMACEN));
      tx.oncomplete = () => ok(pet?.result);
      tx.onerror = tx.onabort = () => mal(tx.error || new Error('No se ha podido guardar la foto.'));
    });
  }
  // Reduce la foto; si el navegador no sabe decodificarla, se guarda tal cual.
  async function reducir(fichero) {
    try {
      const img = await createImageBitmap(fichero, {imageOrientation: 'from-image'});
      const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(img.width * escala); lienzo.height = Math.round(img.height * escala);
      lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
      img.close?.();
      const blob = await new Promise(ok => lienzo.toBlob(ok, 'image/jpeg', CALIDAD));
      return blob && blob.size < fichero.size ? blob : fichero;
    } catch { return fichero; }
  }
  async function guardar(fichero, datos = {}) {
    const blob = await reducir(fichero);
    const id = 'foto-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    await operar('readwrite', s => s.put({id, blob, tipo: blob.type || 'image/jpeg', creada: Date.now(), ...datos}));
    return id;
  }
  const leer = id => operar('readonly', s => s.get(id));
  const borrar = id => operar('readwrite', s => s.delete(id));

  raiz.FaunaFotos = {guardar, leer, borrar, disponible: typeof indexedDB !== 'undefined'};
})(window);
