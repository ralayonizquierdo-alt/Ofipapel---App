// CONTESTAR A UNA FOTO DEL CLIENTE.
//
// Vive aparte del webhook porque tiene DOS usuarios: el propio webhook, cuando
// la pregunta llega justo detrás de la foto, y la función de segundo plano
// (whatsapp-foto-background.js), que despierta cuando la pregunta no llega
// nunca. Las dos tienen que contestar exactamente igual, así que lo hacen con
// el mismo código y no con dos copias.
//
// LA PREGUNTA MANDA SOBRE LA FOTO (palabras del propietario, 19/10/2026). Por
// la imagen sola no se sabe qué quiere saber el cliente —si la tenemos, cuánto
// vale, si hay otro color—, así que la foto entra aquí como CONTEXTO y lo que
// gobierna la respuesta es lo que él escribe.

const { askClaude } = require('./whatsapp-agent-core');
const {
  isNoSeLaRespuesta,
  isUnverifiedConfirmation,
  isUnverifiedStockClaim,
  preciosSinRespaldo,
} = require('./whatsapp-agent-config');
const { construirContextoCatalogo, unirContexto } = require('./whatsapp-catalogo');
const { respuestaSinCatalogo } = require('./whatsapp-consumibles');
const { textoParaBuscar, comoSeLeDiceALaIA, juntarLecturas } = require('./whatsapp-vision');
const { sendEscalateButtons, escalateQuestion } = require('./whatsapp-escalado');
const { sendWhatsappMessage } = require('./whatsapp-send');

// La IA se presenta con su propio saludo de vez en cuando aunque se le pida que
// no; el sistema ya antepone el suyo. Es la misma limpieza que hace el webhook.
const SALUDO_PROPIO = /^(¡?hola!?|buenos días|buenas tardes|buenas noches|buenas)[,.!]?\s+/i;
const quitarSaludoDeLaIA = (texto) => String(texto || '').replace(SALUDO_PROPIO, '').trim();

// Devuelve la respuesta, o null si no hay ninguna de la que fiarse. Ese null es
// la pieza importante: significa "no lo sé", y quien llama ofrece entonces una
// persona. Una foto es terreno resbaladizo —la lectura puede estar mal— así que
// aquí NO se baja el listón: valen las mismas redes de seguridad que con el
// texto (sin datos de catálogo no se confirma ningún producto y no se dice
// ningún precio), y lo que no las pase no se manda.
async function contestarAUnaFoto({ from, lecturas, pregunta = '', history = [], fichaCliente, notas, idioma }) {
  const lectura = juntarLecturas(lecturas);
  if (!lectura) return null;

  const busqueda = textoParaBuscar(lectura, pregunta);
  if (!busqueda) return null;

  // `forzar`: aquí no hay que decidir si la pregunta va de un producto. La
  // lectura ya ha dicho que en la foto hay un artículo, y el filtro de palabras
  // está hecho para frases de clientes ("¿tenéis...?", "busco..."), no para una
  // descripción nuestra — aplicarlo haría que no se buscara nunca.
  const { productContext, contextoConsumibles, impresoras, fallo } =
    await construirContextoCatalogo({ from, text: busqueda, history, forzar: true });

  // La web no contestó y no tenemos datos. Contestar a una foto sin catálogo es
  // justo lo que no se puede hacer: no hay nada con lo que comprobar la lectura.
  if (fallo && !productContext) return null;

  const datos = unirContexto(contextoConsumibles, productContext);
  const respuesta = await askClaude(
    comoSeLeDiceALaIA(lectura, pregunta, idioma),
    history,
    datos,
    fichaCliente,
    notas
  );

  if (isNoSeLaRespuesta(respuesta)) return null;
  if (
    !productContext &&
    (isUnverifiedConfirmation(respuesta) ||
      isUnverifiedStockClaim(respuesta) ||
      preciosSinRespaldo(respuesta, datos, fichaCliente, notas, busqueda).length > 0)
  ) {
    // Sin catálogo que lo respalde, lo único que se puede decir con certeza es
    // qué referencia necesita su impresora, si la lectura la ha identificado.
    return respuestaSinCatalogo(impresoras) || null;
  }

  return quitarSaludoDeLaIA(respuesta);
}

// Lo mismo, pero además mandándoselo al cliente: contesta si puede y, si no,
// le ofrece una persona. Nunca se queda callado — una foto que no se sabe
// resolver sigue mereciendo respuesta.
//
// Devuelve el texto que se le acabó mandando, para que quien llame lo archive
// como corresponda (el webhook lo empareja con el mensaje del cliente; el
// segundo plano lo guarda suelto, porque el mensaje ya se archivó al llegar).
async function responderAUnaFoto({ from, lecturas, pregunta, history, fichaCliente, notas, idioma, presentacion = '' }) {
  const respuesta = await contestarAUnaFoto({ from, lecturas, pregunta, history, fichaCliente, notas, idioma });

  if (respuesta) {
    const texto = presentacion + respuesta;
    await sendWhatsappMessage(from, texto);
    return texto;
  }

  // Se ha visto la foto y no se ha sabido resolver, que no es lo mismo que no
  // haberla podido mirar — y es lo que el cliente nota.
  const prefijo = idioma === 'en'
    ? `${presentacion}Thanks — I've seen the photo, but I can't confirm from here whether we have it. `
    : `${presentacion}Gracias, he visto la foto, pero no te puedo confirmar desde aquí si lo tenemos. `;
  await sendEscalateButtons(from, prefijo, idioma);
  return `${prefijo}${escalateQuestion(idioma)}`;
}

module.exports = { contestarAUnaFoto, responderAUnaFoto };
