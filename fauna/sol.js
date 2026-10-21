// Salida y puesta del sol en el aeropuerto de Tenerife Sur (GCTS), calculadas
// en el propio teléfono (algoritmo de la NOAA, error de ~1 minuto): no hace
// falta internet ni ningún servicio externo.
//
// Regla del servicio (indicada por el propietario, 20/10/2026, corregida el
// mismo día): el inicio es 15 minutos ANTES de la salida del sol y el fin 15
// minutos DESPUÉS de la puesta, redondeados al múltiplo de 5 minutos más cercano.
(function (raiz) {
  const GCTS = {lat: 28.0445, lon: -16.5725, zona: 'Atlantic/Canary'};
  const MARGEN_MIN = 15, REDONDEO_MIN = 5;
  const rad = g => g * Math.PI / 180, grad = r => r * 180 / Math.PI;

  // Minutos UTC desde la medianoche UTC de la fecha; salida (subida=true) o puesta.
  function minutosUTC(fecha, subida, {lat, lon}) {
    const [a, m, d] = fecha.split('-').map(Number);
    const n = Math.round((Date.UTC(a, m - 1, d) - Date.UTC(a, 0, 1)) / 864e5) + 1;
    const g = 2 * Math.PI / 365 * (n - 1 + 0.5);
    const ecTiempo = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    // 90,833° = horizonte + refracción + radio del disco solar (salida/puesta oficiales).
    const ha = grad(Math.acos(Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(decl)) - Math.tan(rad(lat)) * Math.tan(decl)));
    return 720 - 4 * (lon + (subida ? ha : -ha)) - ecTiempo;
  }
  // HH:MM en hora de Canarias (con su cambio de horario) de unos minutos UTC del día.
  function horaLocal(fecha, minutos, zona) {
    const [a, m, d] = fecha.split('-').map(Number);
    const t = new Date(Date.UTC(a, m - 1, d) + Math.round(minutos) * 6e4);
    return new Intl.DateTimeFormat('es-ES', {timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(t);
  }
  const aMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const aHora = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const servicio = (hhmm, desfase) => aHora(Math.round((aMin(hhmm) + desfase) / REDONDEO_MIN) * REDONDEO_MIN);

  function horarioSolar(fecha, lugar = GCTS) {
    const salida = horaLocal(fecha, minutosUTC(fecha, true, lugar), lugar.zona);
    const puesta = horaLocal(fecha, minutosUTC(fecha, false, lugar), lugar.zona);
    // finAnterior: la regla equivocada de la primera versión (15 min antes de la
    // puesta), para corregir los días que se abrieron con ella.
    return {salida, puesta, inicio: servicio(salida, -MARGEN_MIN), fin: servicio(puesta, MARGEN_MIN), finAnterior: servicio(puesta, -MARGEN_MIN)};
  }

  const api = {horarioSolar, GCTS};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.FaunaSol = api;
})(typeof window !== 'undefined' ? window : globalThis);
