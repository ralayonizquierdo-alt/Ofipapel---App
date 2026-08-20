// Gestión de usuarios via Supabase Auth Admin API.
// Requiere SUPABASE_SERVICE_ROLE_KEY en las variables de entorno de Netlify.
// Solo accesible para usuarios con email *@ofipapel.internal cuyo nombre
// sea 'admin' o 'rober'.

const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://agjmciudnnginqybnogh.supabase.co';
const SUPA_ANON = 'sb_publishable_LaJCCCGsN2VIXFDFAxEb6g_eEZHh3j6';
const ADMIN_USERNAMES = new Set(['admin', 'rober']);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function respond(statusCode, body) {
  return { statusCode, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return respond(500, { error: 'SUPABASE_SERVICE_ROLE_KEY no configurada en Netlify' });

  // Verificar JWT del llamante
  const jwt = (event.headers.authorization || '').replace('Bearer ', '');
  if (!jwt) return respond(401, { error: 'Sin token de autenticación' });

  const anonClient = createClient(SUPA_URL, SUPA_ANON);
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(jwt);
  if (authErr || !user) return respond(401, { error: 'Token inválido o expirado' });

  const callerUsername = user.email.replace('@ofipapel.internal', '');
  if (!ADMIN_USERNAMES.has(callerUsername)) return respond(403, { error: 'Sin permisos de administración' });

  const adminClient = createClient(SUPA_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return respond(400, { error: 'JSON inválido' }); }

  const { action, userId, username, password } = body;

  try {
    if (action === 'list') {
      const { data, error } = await adminClient.auth.admin.listUsers({ perPage: 200 });
      if (error) throw error;
      const users = data.users
        .filter(u => u.email && u.email.endsWith('@ofipapel.internal'))
        .map(u => ({
          id: u.id,
          username: u.email.replace('@ofipapel.internal', ''),
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
        }));
      return respond(200, { users });
    }

    if (action === 'create') {
      if (!username || !password) return respond(400, { error: 'Faltan username y/o password' });
      if (password.length < 6) return respond(400, { error: 'La contraseña debe tener al menos 6 caracteres' });
      const email = username.toLowerCase() + '@ofipapel.internal';
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      return respond(200, { ok: true, id: data.user.id });
    }

    if (action === 'resetPassword') {
      if (!userId || !password) return respond(400, { error: 'Faltan userId y/o password' });
      if (password.length < 6) return respond(400, { error: 'La contraseña debe tener al menos 6 caracteres' });
      const { error } = await adminClient.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      return respond(200, { ok: true });
    }

    if (action === 'delete') {
      if (!userId) return respond(400, { error: 'Falta userId' });
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) throw error;
      return respond(200, { ok: true });
    }

    return respond(400, { error: 'Acción desconocida: ' + action });
  } catch (e) {
    console.error('admin-users error:', e);
    return respond(500, { error: e.message || 'Error interno' });
  }
};
