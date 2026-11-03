// Envío de correo por Microsoft 365 (Microsoft Graph), la misma conexión que usa la app de Devoluciones (RAX-OS).
// App de Azure/Entra con permiso de aplicación «Mail.Send» y flujo client credentials: envía en nombre del buzón que
// se le diga (Archivo → Datos de Empresa → «Correo remitente»). Las claves son secretos de las funciones de Supabase:
// AZURE_TENANT_ID, AZURE_CLIENT_ID y AZURE_CLIENT_SECRET (nunca en la base de datos ni en el programa).
// Copia en cada función que lo usa (correo-enviar/graph.ts, nexa/graph.ts): el despliegue no comparte carpetas.

let cache: { token: string; hasta: number } | null = null

export const graphConfigurado = () =>
  !!(Deno.env.get('AZURE_TENANT_ID') && Deno.env.get('AZURE_CLIENT_ID') && Deno.env.get('AZURE_CLIENT_SECRET'))

async function token(): Promise<string> {
  if (cache && cache.hasta > Date.now() + 30_000) return cache.token
  const tenant = Deno.env.get('AZURE_TENANT_ID') ?? ''
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('AZURE_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('AZURE_CLIENT_SECRET') ?? '',
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  const d = await r.json()
  if (!r.ok || !d.access_token) throw new Error(`Microsoft no ha dado acceso: ${d.error_description ?? d.error ?? r.status}`)
  cache = { token: d.access_token, hasta: Date.now() + Number(d.expires_in ?? 3600) * 1000 }
  return cache.token
}

export interface CorreoGraph {
  desde: string
  para: string[]
  cc?: string[]
  responderA?: string | null
  asunto: string
  html: string
  adjuntos?: { nombre: string; base64: string; tipo?: string }[]
}

export async function enviarGraph(c: CorreoGraph): Promise<void> {
  const t = await token()
  const dir = (a: string) => ({ emailAddress: { address: a } })
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.desde)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: c.asunto,
        body: { contentType: 'HTML', content: c.html },
        toRecipients: c.para.map(dir),
        ...(c.cc?.length ? { ccRecipients: c.cc.map(dir) } : {}),
        ...(c.responderA ? { replyTo: [dir(c.responderA)] } : {}),
        ...(c.adjuntos?.length
          ? {
              attachments: c.adjuntos.map((a) => ({
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: a.nombre,
                contentType: a.tipo ?? 'application/pdf',
                contentBytes: a.base64,
              })),
            }
          : {}),
      },
      saveToSentItems: true,
    }),
  })
  if (!r.ok) {
    const txt = await r.text()
    if (r.status === 403 || /ErrorAccessDenied|MailboxNotEnabled/i.test(txt))
      throw new Error(`Microsoft no deja enviar desde ${c.desde}: la app solo puede usar los buzones que tenga permitidos (habla con quien gestiona Microsoft 365).`)
    throw new Error(`Microsoft ha rechazado el correo (${r.status}): ${txt.slice(0, 300)}`)
  }
}
