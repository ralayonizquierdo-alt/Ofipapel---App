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
  return String(texto ?? '')
    .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '*$1*') // ***negrita cursiva*** → *…*
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '*$1*') //     **negrita**        → *…*
    .replace(/(^|[\s(])__(?=\S)([\s\S]*?\S)__(?=$|[\s.,;:!?)])/g, '$1_$2_'); // __negrita__ → _…_
}

module.exports = { paraWhatsapp };
