// EL ESTADO REAL DEL PEDIDO, EL DE GEMINISWIN.
//
// WooCommerce no se entera de que un pedido se ha facturado, cargado en la
// furgoneta o entregado: eso hay que cambiarlo a mano, así que su estado va por
// detrás de la realidad. Hasta ahora el bot lo avisaba con una coletilla ("si ya
// se ha facturado, ese cambio puede tardar en reflejarse aquí"), que es tanto
// como decirle al cliente que no lo sabemos.
//
// Un proceso aparte, del lado de Gestión, publica el estado de verdad en
// Supabase («App Bancos», tabla `estado_pedidos_web`) y aquí se lee.
//
// DOS CUIDADOS QUE NO SON NEGOCIABLES:
//
// 1. Esto se consulta SOLO después de que WooCommerce haya confirmado que el
//    pedido es de quien escribe (por su teléfono o por su nombre). La tabla no
//    lleva nombres a propósito: la identidad se comprueba siempre contra
//    WooCommerce, nunca contra esto.
//
// 2. Los estados de aquí NO son los de GeminisWin. Allí «Liquidado» significa
//    COBRADO (el repartidor ha pagado la factura en administración), no
//    facturado — tomarlo por «facturado» le diría al cliente que su pedido va de
//    camino cuando en realidad ya se cobró hace días, o al revés. El publicador
//    traduce a los siete estados de abajo y el bot solo entiende esos.

const SUPA_URL = 'https://agjmciudnnginqybnogh.supabase.co';

// La clave publishable es PÚBLICA: es la misma que ya está escrita en
// Index.html y en control-pedidos.html, y el repositorio es público. No da
// acceso a esta tabla — se le quitó el permiso a nivel de GRANT y las políticas
// RLS solo dejan leer a la cuenta del bot —, pero hace falta igualmente porque
// Supabase la exige como cabecera `apikey` en toda petición.
const SUPA_ANON = 'sb_publishable_LaJCCCGsN2VIXFDFAxEb6g_eEZHh3j6';

const TIMEZONE = 'Atlantic/Canary';

// El webhook tiene ~10 s antes de que Meta dé la respuesta por perdida. Esto es
// una consulta por clave primaria a una tabla pequeña: si tarda más que esto,
// algo va mal y se prefiere contestar con WooCommerce a hacer esperar.
const TIMEOUT_MS = 3000;

// La hora a la que se cierra la facturación del día. Lo que entra antes se
// factura esa misma tarde (~14:00) y sale en el reparto de esa tarde; lo que
// entra después, al día laborable siguiente.
const CORTE_MINUTOS = 13 * 60;

// Margen después de facturar para dar por hecho que ya debería estar liquidado.
// Se factura hacia las 14:00; a partir de las 15:00 un pedido que entró a
// tiempo y sigue sin facturar es que algo se ha torcido, y ahí no se promete
// plazo: se ofrece una persona.
const YA_DEBERIA_ESTAR_MINUTOS = 15 * 60;

function isConfigured() {
  return Boolean(process.env.SUPABASE_BOT_EMAIL && process.env.SUPABASE_BOT_PASSWORD);
}

// --------------------------------------------------------------------------
// FECHAS. Todo en hora de Canarias, que es donde se factura y se reparte.
//
// Se trabaja con el DÍA CIVIL en texto ('2026-10-22') y no con instantes: las
// preguntas que hay que contestar son «¿qué día laborable toca?» y «¿esto es de
// antes de ayer?», que son de calendario, no de reloj. Comparar textos de fecha
// ISO ordena igual que comparar días, y así no hay que pelearse con el cambio
// de hora ni con husos.
// --------------------------------------------------------------------------

const FORMATO_DIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const FORMATO_HORA = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

// '2026-10-22'
function diaCivil(fecha) {
  return FORMATO_DIA.format(fecha instanceof Date ? fecha : new Date(fecha));
}

function minutosDelDia(fecha) {
  const partes = FORMATO_HORA.formatToParts(fecha instanceof Date ? fecha : new Date(fecha));
  const hora = Number(partes.find((p) => p.type === 'hour').value);
  const minuto = Number(partes.find((p) => p.type === 'minute').value);
  return hora * 60 + minuto;
}

// Para sumar y restar días se usa un ancla en UTC a partir del día civil. No es
// el instante real de ese día en Canarias, y da igual: solo se usa para contar
// días y saber el día de la semana, y para eso un ancla sin huso es lo más
// seguro que hay.
function ancla(dia) {
  const [a, m, d] = String(dia).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function esLaborable(dia) {
  const n = ancla(dia).getUTCDay();
  return n >= 1 && n <= 5;
}

function sumarDias(dia, cuantos) {
  const d = ancla(dia);
  d.setUTCDate(d.getUTCDate() + cuantos);
  return d.toISOString().slice(0, 10);
}

// El siguiente día laborable, sin contar el de partida.
function siguienteLaborable(dia) {
  let d = sumarDias(dia, 1);
  while (!esLaborable(d)) d = sumarDias(d, 1);
  return d;
}

// El último día laborable ANTES del de partida (el viernes, si se parte del
// lunes o del fin de semana).
function laborableAnterior(dia) {
  let d = sumarDias(dia, -1);
  while (!esLaborable(d)) d = sumarDias(d, -1);
  return d;
}

// ¿ESTE DATO ES VIEJO?
//
// Se mide en días laborables y no en horas: el publicador solo corre de lunes a
// viernes, así que un dato del viernes por la tarde es perfectamente bueno el
// lunes por la mañana aunque tenga sesenta horas. Caduca cuando es anterior al
// último día laborable, o sea cuando se ha saltado una pasada entera.
function caducado(actualizado, ahora = new Date()) {
  if (!actualizado) return true;
  return diaCivil(actualizado) < laborableAnterior(diaCivil(ahora));
}

// EL DÍA EN QUE ESTE PEDIDO DEBERÍA FACTURARSE.
//
// Antes de las 13:00 de un laborable, ese mismo día. Después, o en fin de
// semana, el laborable siguiente. (Viernes a las 12:00 → viernes, y se entrega
// el lunes; viernes a las 14:00 → lunes, y se entrega el martes.)
function diaDeFacturacion(fechaHoraPedido) {
  if (!fechaHoraPedido) return null;
  const dia = diaCivil(fechaHoraPedido);
  if (esLaborable(dia) && minutosDelDia(fechaHoraPedido) < CORTE_MINUTOS) return dia;
  return siguienteLaborable(dia);
}

// --------------------------------------------------------------------------
// LAS RESPUESTAS.
//
// Ninguna da una fecha concreta: no tenemos calendario de festivos, y decir «lo
// tendrás el día 1» en vísperas de un festivo es prometer algo que no se va a
// cumplir. Siempre «el siguiente día laborable», que es cierto siempre.
//
// Y van escritas aquí, en los dos idiomas, por la misma razón que las de
// WooCommerce: se construyen con datos reales del pedido y esos no se traducen
// «a ojo» — se generan o no se generan.
// --------------------------------------------------------------------------

const PERSONA = { ofrecerPersona: true };

function fraseRecibido(fila, ahora, idioma) {
  const hoy = diaCivil(ahora);
  const factura = diaDeFacturacion(fila.fecha_hora_pedido);

  // Sin fecha de pedido no se puede calcular nada: se dice lo que se sabe y
  // nada más.
  if (!factura) {
    return idioma === 'en'
      ? { texto: 'Your order is being prepared.' }
      : { texto: 'Tu pedido se está preparando.' };
  }

  // Ya tendría que estar facturado y no lo está. No se promete ningún plazo.
  if (factura < hoy || (factura === hoy && minutosDelDia(ahora) >= YA_DEBERIA_ESTAR_MINUTOS)) {
    return idioma === 'en'
      ? { texto: 'Your order is being prepared, but it is taking longer than usual. ', ...PERSONA }
      : { texto: 'Tu pedido se está preparando, pero está tardando más de lo habitual. ', ...PERSONA };
  }

  const hoyMismo = factura === hoy;
  if (idioma === 'en') {
    return {
      texto: `Your order is being prepared; it will be invoiced ${hoyMismo ? 'today' : 'on the next working day'} and you will normally receive it the following working day.`,
    };
  }
  return {
    texto: `Tu pedido se está preparando; se facturará ${hoyMismo ? 'hoy' : 'el próximo día laborable'} y lo recibirás normalmente el día laborable siguiente.`,
  };
}

function fraseEnReparto(fila, ahora, idioma) {
  const hoy = diaCivil(ahora);
  const cargado = fila.fecha_reparto ? diaCivil(`${fila.fecha_reparto}T12:00:00Z`) : null;

  // Cargado en la furgoneta HOY: sale mañana. (Sin fecha de reparto se dice lo
  // mismo, que es lo prudente: nunca anuncia una entrega para hoy que no se
  // pueda sostener.)
  if (!cargado || cargado >= hoy) {
    return idioma === 'en'
      ? { texto: 'Your order is ready and goes out for delivery on the next working day.' }
      : { texto: 'Tu pedido está preparado y sale en reparto el próximo día laborable.' };
  }

  return idioma === 'en'
    ? { texto: 'Your order is out for delivery today.' }
    : { texto: 'Tu pedido está hoy en reparto.' };
}

// Devuelve { texto, ofrecerPersona?, entregado? } o null si el estado no se
// reconoce — y entonces manda WooCommerce, como hasta ahora. Un estado que no
// entendemos no se le enseña al cliente.
function fraseDeEstado(fila, ahora = new Date(), idioma = 'es') {
  if (!fila || !fila.estado) return null;

  switch (fila.estado) {
    case 'recibido':
      return fraseRecibido(fila, ahora, idioma);

    case 'facturado':
      return idioma === 'en'
        ? { texto: 'Your order has already been invoiced; you will receive it on the next working day.' }
        : { texto: 'Tu pedido ya está facturado; lo recibirás el siguiente día laborable.' };

    case 'en_reparto':
      return fraseEnReparto(fila, ahora, idioma);

    // Se marca como entregado para poder reaccionar si el cliente dice que no
    // lo ha recibido: eso no es una duda, es un problema, y lo atiende una
    // persona (ver negacionDeEntrega en whatsapp-webhook.js).
    case 'entregado':
      return idioma === 'en'
        ? { texto: 'Your order is recorded as delivered.', entregado: true }
        : { texto: 'Tu pedido figura como entregado.', entregado: true };

    case 'no_entregado':
      return idioma === 'en'
        ? { texto: "We couldn't deliver it; it is rescheduled for the next delivery round. ", ...PERSONA }
        : { texto: 'No pudimos entregarlo; está reprogramado para el siguiente reparto. ', ...PERSONA };

    case 'incidencia':
      return idioma === 'en'
        ? { texto: 'There is an incident with that order. ', ...PERSONA }
        : { texto: 'Hay una incidencia con ese pedido. ', ...PERSONA };

    case 'anulado':
      return idioma === 'en'
        ? { texto: 'That order is recorded as cancelled. ', ...PERSONA }
        : { texto: 'Ese pedido figura como anulado. ', ...PERSONA };

    default:
      return null;
  }
}

// --------------------------------------------------------------------------
// LA CONSULTA.
// --------------------------------------------------------------------------

// La sesión dura una hora larga y estas funciones se reutilizan entre mensajes
// mientras están calientes, así que se guarda el token para no pedir uno en
// cada pregunta. Si caduca o falla, se pide otro.
let sesion = { token: null, caduca: 0 };

async function entrar() {
  if (sesion.token && Date.now() < sesion.caduca) return sesion.token;

  const resp = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPA_ANON },
    body: JSON.stringify({
      email: process.env.SUPABASE_BOT_EMAIL,
      password: process.env.SUPABASE_BOT_PASSWORD,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!resp.ok) {
    console.error('gestion-pedidos: no se pudo entrar en Supabase:', resp.status, await resp.text());
    sesion = { token: null, caduca: 0 };
    return null;
  }

  const datos = await resp.json();
  if (!datos?.access_token) return null;
  // Un minuto de margen antes de que caduque de verdad.
  sesion = { token: datos.access_token, caduca: Date.now() + Math.max(0, (datos.expires_in || 3600) - 60) * 1000 };
  return sesion.token;
}

// La fila de ese pedido, o null. NUNCA lanza: si Supabase está caído, tarda o
// la cuenta no tiene permiso, el bot contesta con WooCommerce como siempre.
// Una caída de esto no puede dejar a un cliente sin respuesta.
async function estadoDeGestion(pedidoWeb) {
  const numero = String(pedidoWeb || '').trim();
  if (!isConfigured() || !numero) return null;

  try {
    const token = await entrar();
    if (!token) return null;

    const url = `${SUPA_URL}/rest/v1/estado_pedidos_web?pedido_web=eq.${encodeURIComponent(numero)}&select=*`;
    const resp = await fetch(url, {
      headers: { apikey: SUPA_ANON, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!resp.ok) {
      // 401 con token bueno = la cuenta no tiene permiso de lectura; se tira la
      // sesión por si acaso era que había caducado.
      sesion = { token: null, caduca: 0 };
      console.error('gestion-pedidos: Supabase devolvió', resp.status, await resp.text());
      return null;
    }

    const filas = await resp.json();
    return Array.isArray(filas) && filas.length ? filas[0] : null;
  } catch (err) {
    const motivo = err.name === 'TimeoutError' ? `tardó más de ${TIMEOUT_MS} ms` : err.message;
    console.error('gestion-pedidos: no se pudo consultar el estado:', motivo);
    return null;
  }
}

module.exports = {
  isConfigured,
  estadoDeGestion,
  fraseDeEstado,
  caducado,
  diaDeFacturacion,
  diaCivil,
  esLaborable,
  siguienteLaborable,
  laborableAnterior,
  CORTE_MINUTOS,
  YA_DEBERIA_ESTAR_MINUTOS,
};
