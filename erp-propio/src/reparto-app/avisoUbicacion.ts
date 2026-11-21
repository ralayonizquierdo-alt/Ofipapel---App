// Aviso de ubicación de la app de repartidores (art. 90 LO 3/2018 y art. 20.3 del Estatuto de los
// Trabajadores). Si se cambia el texto, hay que subir VERSION: la app lo volverá a enseñar a todos y
// quedará constancia de la lectura nueva (tabla reparto_aviso_leido).
export const AVISO_VERSION = '2026-11-21'

export const AVISO_TITULO = 'Aviso sobre tu ubicación'

export const AVISO_PUNTOS: [string, string][] = [
  ['Qué se recoge', 'La ubicación del móvil, solo si se cumplen las tres cosas a la vez: la app está abierta en la pantalla, tienes tu ruta de reparto abierta en ella y has fichado la entrada (sin haber fichado la salida).'],
  ['Solo con la app abierta', 'La ubicación la envía la propia app mientras la tienes abierta. Si la cierras o la dejas en segundo plano (por ejemplo, al cambiar a otra aplicación), deja de enviarse. No hay nada que siga funcionando por detrás.'],
  ['Cuándo NO se recoge', 'Antes de fichar la entrada, en las pausas, después de fichar la salida, con la app cerrada y siempre que no tengas una ruta abierta. Fuera del trabajo, nunca.'],
  ['Para qué', 'Para modernizar y mejorar la gestión de los repartos: saber por dónde va cada ruta, avisar a los clientes y atender incidencias. No se usa para otra cosa.'],
  ['Quién la ve', 'Solo el personal de la oficina que lleva los repartos.'],
  ['Cuánto se guarda', '30 días. Después se borra sola.'],
  ['Tus derechos', 'Puedes pedir ver tus datos, corregirlos o que se borren, y preguntar cualquier duda, en la oficina o a la dirección de la empresa.'],
]

export const AVISO_PIE =
  'La empresa te informa de esto según el artículo 90 de la Ley Orgánica 3/2018, de Protección de Datos, y el artículo 20.3 del Estatuto de los Trabajadores. Al pulsar el botón confirmas que lo has leído; queda guardado con la fecha y la hora.'
