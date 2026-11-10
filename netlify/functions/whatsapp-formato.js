// Cómo se escribe un mensaje para WhatsApp.
//
// Vive aparte de whatsapp-send.js a propósito: los botones no se mandan por
// ahí —se montan en whatsapp-escalado.js y en el webhook, con su propio
// fetch—, así que los tres lo necesitan. Y, de paso, las pruebas sustituyen
// whatsapp-send por uno falso para no llamar a Meta; teniendo esto en su
// propio módulo, el formato que de verdad se usa entra también en las pruebas.

// WHATSAPP NO ENTIENDE EL MARKDOWN, Y LOS ASTERISCOS SE VEN.
//
// Visto en real el 6/11/2026: «I'll need your **order number**» le llegó al
// cliente con los cuatro asteriscos puestos. La IA escribe en markdown porque
// es como escribe siempre, y WhatsApp usa otra cosa: una sola estrella para la
// negrita (*así*) y un guion bajo para la cursiva (_así_).
//
// Se arregla al salir, en un solo sitio, en vez de pedírselo al modelo en el
// prompt: los textos fijos tampoco pueden llevar markdown por error, y esto no
// depende de que nadie se acuerde.
//
// Solo se tocan los pares completos. Un asterisco suelto («talla 3*4») se deja
// como está, y el guion bajo NO se convierte: aparece dentro de referencias y
// direcciones de correo mucho más a menudo que como cursiva.
function paraWhatsapp(texto) {
  // Las dos cosas van juntas a propósito: todos los sitios que mandan algo ya
  // llaman aquí, así que la corrección de los datos de contacto entra sola y
  // no hay forma de olvidarse de ponerla.
  return arreglarDatosDeContacto(String(texto ?? ''))
    .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '*$1*') // ***negrita cursiva*** → *…*
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '*$1*') //     **negrita**        → *…*
    .replace(/(^|[\s(])__(?=\S)([\s\S]*?\S)__(?=$|[\s.,;:!?)])/g, '$1_$2_'); // __negrita__ → _…_
}

// NUESTRO CORREO Y NUESTRO TELÉFONO NO SE INVENTAN.
//
// Encontrado con el sondeo del 8/11/2026: la IA dio «pedidos@ofipapel.net» y
// «922 123 456». Ninguno existe. Y es de los fallos más caros que puede
// cometer, porque el cliente se va convencido: manda su pedido a un buzón que
// no existe —ofipapel.net es solo la web, no tiene correo (lo dijo el
// propietario el 7/11/2026)— o llama a un desconocido. No se entera nadie: ni
// él, que cree que ya lo ha mandado, ni nosotros, que no recibimos nada.
//
// Aquí no hace falta ninguna red que «revise si es verdad»: nuestro correo y
// nuestro teléfono son dos datos cerrados, con una sola respuesta correcta. Si
// sale uno que no es, se cambia por el bueno y se deja constancia en el log.
//
// Va en el formateador, que es por donde pasa TODO lo que sale (texto y
// botones), así que no depende de que la red esté puesta en cada sitio.
//
// LÍMITE, a propósito: solo se corrigen los datos que se presentan como
// NUESTROS — un correo en un dominio «ofipapel…» y un fijo canario (922/928).
// El correo o el móvil del propio cliente, si el bot los repite, se dejan tal
// cual: ahí el equivocado no somos nosotros.
// Los datos buenos se leen de la configuración del negocio, no se copian
// aquí: si mañana se abre un buzón nuevo, se añade en un solo sitio. El
// `require` va DENTRO de la función a propósito — este módulo es el último
// paso antes de mandar y lo cargan send, escalado y el webhook, así que
// pedirlo arriba enredaría el orden de carga sin ganar nada.
function datosBuenos() {
  try {
    const cfg = require('./whatsapp-agent-config');
    const correos = (cfg.CORREOS_DE_LA_CASA || []).map((c) => String(c).toLowerCase());
    const telefonos = (cfg.STORES || []).map((t) => String(t.phone || '').replace(/\D/g, ''));
    return {
      correos,
      telefonos: telefonos.filter(Boolean),
      correoBueno: correos[0] || 'pedidos@ofipapelsl.com',
      telefonoBueno: (cfg.STORES && cfg.STORES[0] && cfg.STORES[0].phone) || '922 753 520',
    };
  } catch (err) {
    // Si por lo que sea no se puede leer, no se corrige nada: vale más dejar
    // pasar el mensaje que tirarlo.
    console.error('whatsapp-formato: no se pudieron leer los datos de contacto:', err.message);
    return null;
  }
}

const UN_CORREO = /\b[\w.+-]+@[\w.-]+\.\w{2,}\b/g;
// Un fijo canario: 922 o 928, con o sin espacios, puntos o guiones.
const UN_FIJO_CANARIO = /\b9(?:22|28)[\s.-]?\d{3}[\s.-]?\d{3}\b/g;

function arreglarDatosDeContacto(texto, aviso = 'whatsapp') {
  let t = String(texto ?? '');
  const buenos = datosBuenos();
  if (!buenos) return t;

  // CUIDADO: a veces citar el correo malo es justo lo que hay que hacer.
  //
  // Cuando el cliente pregunta «¿pedidos@ofipapel.net es vuestro correo?», la
  // respuesta correcta lo nombra para decirle que no existe: «lo que mandaste
  // a pedidos@ofipapel.net no nos ha llegado — vuelve a mandarlo a
  // pedidos@ofipapelsl.com». Corregirlo ahí deja un mensaje que se contradice
  // («lo que mandaste a X no ha llegado, mándalo a X»). Lo pilló el sondeo del
  // 8/11/2026 en cuanto se puso esta red.
  //
  // La diferencia es limpia: cuando se está CONTRASTANDO, el mensaje lleva
  // también el correo bueno; cuando la IA se lo inventa, lleva solo el falso.
  // Así que si el bueno ya está escrito, aquí no se toca nada.
  const yaLlevaElBueno = buenos.correos.some((c) => t.toLowerCase().includes(c));

  t = t.replace(UN_CORREO, (correo) => {
    const bajo = correo.toLowerCase();
    if (buenos.correos.includes(bajo)) return correo;
    if (yaLlevaElBueno) return correo;
    // Un dominio que no es nuestro no se toca: será el del cliente.
    if (!/@[\w.-]*ofipapel/i.test(bajo)) return correo;
    console.error(`${aviso}: correo inventado corregido (${correo} → ${buenos.correoBueno}).`);
    return buenos.correoBueno;
  });

  t = t.replace(UN_FIJO_CANARIO, (tel) => {
    const soloCifras = tel.replace(/\D/g, '');
    if (buenos.telefonos.includes(soloCifras)) return tel;
    console.error(`${aviso}: teléfono inventado corregido (${tel} → ${buenos.telefonoBueno}).`);
    return buenos.telefonoBueno;
  });

  return t;
}

module.exports = { paraWhatsapp, arreglarDatosDeContacto };
