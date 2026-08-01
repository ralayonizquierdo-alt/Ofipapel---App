// Sección "copy" — el principio de COMPOSICIÓN POSTERIOR, en código.
//
// creative-engine genera imagen/fondo con espacio negativo deliberado;
// el texto (titular, CTA) y el logo se componen DESPUÉS, en otra capa —
// mismo patrón que ya usa marketing-engine/agents/07-maquetador con
// HTML→PNG (el proveedor de imagen nunca escribe el texto final). Los
// modelos de difusión renderizan texto mal; pedirles que reserven espacio
// es fiable, pedirles que escriban el titular no lo es.
//
// Esta sección NUNCA pide renderizar el copy — solo reserva espacio. Es
// lo que hace coherentes los checks "espacioLogo"/"espacioTextos" de
// creative-validator/: si esta sección desapareciera, esos checks no
// tendrían nada que verificar.

function build(brief) {
  const copy = brief.copy || {};
  if (!copy.title && !copy.cta) return null;

  const parts = ['Dejar espacio negativo limpio para superponer texto y logo en posproducción — NO renderizar ningún texto ni letras dentro de la imagen'];
  if (copy.title) parts.push('reservar una zona (superior o inferior) para un titular corto');
  if (copy.cta) parts.push('reservar una zona para un botón o llamada a la acción');

  return { id: 'copy', label: 'Espacio de texto', text: parts.join('; ') };
}

module.exports = { build };
