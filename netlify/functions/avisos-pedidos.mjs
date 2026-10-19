// Aviso por correo de los pedidos nuevos de Control de Pedidos (2026-10-19).
//
// Cada 10 minutos mira en Supabase («App Bancos», tabla cp_docs) los pedidos
// que aún no se han avisado (columna `avisado`, que nace en false al crearse un
// documento y que la app nunca toca) y, si hay alguno del comercial, manda UN
// correo resumen —no uno por pedido: una campaña subida por fotos crea 15 o 20
// de golpe— agrupado por campaña y marcando las campañas nuevas. Después los
// marca como avisados. Los de reposición se marcan sin avisar.
//
// Solo actúa donde está AVISOS_PEDIDOS_PARA (el sitio `ofipapel`): hay varios
// sitios de Netlify sirviendo este repo y, si no, cada uno mandaría el suyo.
// Necesita además SUPABASE_SERVICE_ROLE_KEY y RESEND_API_KEY. El remitente es
// AVISOS_PEDIDOS_DE o, si no está, el de pruebas de Resend, que solo entrega
// en el correo con el que se abrió la cuenta de Resend.

const SUPA_URL = 'https://agjmciudnnginqybnogh.supabase.co';
const APP = 'https://ofipapel.netlify.app/control-pedidos.html';

const claveTexto = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const claveCampana = (d) => claveTexto(d && d.proveedor) + '|' + claveTexto(d && d.campana);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nPed = (n) => (/^\d$/.test(String(n || '')) ? '0' + n : String(n || '—'));
const quien = (autor) => String(autor || '').replace(/@ofipapel\.internal$/, '') || '¿?';

/**
 * De las filas nuevas y las campañas que ya existían, el contenido del correo:
 * { asunto, texto, html, n } o null si no hay pedidos del comercial.
 */
export function resumenAvisos(filas, campanasExistentes) {
  const conocidas = new Set(campanasExistentes || []);
  const grupos = new Map();
  for (const f of filas || []) {
    const d = f.datos || {};
    if (d.tipo === 'reposicion') continue;
    const k = claveCampana(d);
    if (!grupos.has(k)) grupos.set(k, { proveedor: d.proveedor || '¿proveedor?', campana: d.campana || 'sin campaña', nueva: !conocidas.has(k), pedidos: [] });
    grupos.get(k).pedidos.push({ numero: d.numero, cliente: d.cliente || '', lineas: (d.lineas || []).length, autor: quien(f.autor) });
  }
  if (!grupos.size) return null;
  const lista = [...grupos.values()];
  for (const g of lista) g.pedidos.sort((a, b) => String(a.numero).localeCompare(String(b.numero), 'es', { numeric: true }));
  const n = lista.reduce((s, g) => s + g.pedidos.length, 0);
  const nuevas = lista.filter((g) => g.nueva);
  const asunto = nuevas.length
    ? `🆕 Campaña nueva: ${nuevas.map((g) => `${g.proveedor} · ${g.campana}`).join(', ')}` + (n > nuevas.reduce((s, g) => s + g.pedidos.length, 0) ? ' y más pedidos' : '')
    : `${n} pedido${n === 1 ? '' : 's'} nuevo${n === 1 ? '' : 's'}: ${lista.map((g) => `${g.proveedor} · ${g.campana}`).join(', ')}`;
  const linea = (p) => `nº ${nPed(p.numero)} · ${p.cliente} — ${p.lineas} línea${p.lineas === 1 ? '' : 's'} · subido por ${p.autor}`;
  const texto = [`Hay ${n} pedido${n === 1 ? '' : 's'} nuevo${n === 1 ? '' : 's'} en Control de Pedidos:`, '',
    ...lista.flatMap((g) => [`${g.nueva ? '🆕 CAMPAÑA NUEVA · ' : ''}${g.proveedor} · ${g.campana}`, ...g.pedidos.map((p) => '  - ' + linea(p)), '']),
    `Abrir la app: ${APP}`].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1b2b1f">
    <p>Hay <b>${n} pedido${n === 1 ? '' : 's'} nuevo${n === 1 ? '' : 's'}</b> en Control de Pedidos:</p>
    ${lista.map((g) => `<h3 style="margin:16px 0 6px;color:#1e5d2a">${g.nueva ? '<span style="background:#c62828;color:#fff;border-radius:10px;padding:2px 8px;font-size:12px">🆕 CAMPAÑA NUEVA</span> ' : ''}${esc(g.proveedor)} · ${esc(g.campana)}</h3>
    <ul style="margin:0;padding-left:20px">${g.pedidos.map((p) => `<li>${esc(linea(p))}</li>`).join('')}</ul>`).join('')}
    <p style="margin-top:20px"><a href="${APP}" style="background:#1e7d32;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir Control de Pedidos</a></p>
  </div>`;
  return { asunto, texto, html, n };
}

export default async () => {
  const para = process.env.AVISOS_PEDIDOS_PARA;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!para) return new Response('Sin AVISOS_PEDIDOS_PARA en este sitio: no se avisa desde aquí');
  if (!supaKey || !resendKey) {
    console.error('avisos-pedidos: falta', !supaKey ? 'SUPABASE_SERVICE_ROLE_KEY' : 'RESEND_API_KEY');
    return new Response('Falta configuración', { status: 500 });
  }
  const { createClient } = await import('@supabase/supabase-js');
  const supa = createClient(SUPA_URL, supaKey, { auth: { persistSession: false } });

  const { data: filas, error } = await supa.from('cp_docs').select('id,datos,autor')
    .eq('coleccion', 'pedidos').eq('avisado', false).eq('borrado', false).order('actualizado').limit(500);
  if (error) { console.error('avisos-pedidos: leyendo cp_docs', error.message); return new Response('Error', { status: 500 }); }
  if (!filas.length) return new Response('Nada nuevo');

  const { data: viejos, error: e2 } = await supa.from('cp_docs').select('datos->proveedor,datos->campana')
    .eq('coleccion', 'pedidos').eq('avisado', true).eq('borrado', false);
  if (e2) { console.error('avisos-pedidos: campañas existentes', e2.message); return new Response('Error', { status: 500 }); }
  const resumen = resumenAvisos(filas, (viejos || []).map((d) => claveCampana(d)));

  if (resumen) {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.AVISOS_PEDIDOS_DE || 'Control de Pedidos <onboarding@resend.dev>',
        to: para.split(',').map((x) => x.trim()).filter(Boolean),
        subject: resumen.asunto, text: resumen.texto, html: resumen.html,
      }),
    });
    // Si el correo no sale, no se marcan: se vuelve a intentar en la siguiente vuelta.
    if (!resp.ok) { console.error('avisos-pedidos: Resend', resp.status, await resp.text()); return new Response('Resend falló', { status: 502 }); }
  }
  const ids = filas.map((f) => f.id);
  const { error: e3 } = await supa.from('cp_docs').update({ avisado: true }).eq('coleccion', 'pedidos').in('id', ids);
  if (e3) console.error('avisos-pedidos: marcando avisados', e3.message);
  return new Response(resumen ? `Avisados ${resumen.n} pedido(s)` : 'Solo reposición: marcados sin avisar');
};

export const config = { schedule: '*/10 * * * *' };
