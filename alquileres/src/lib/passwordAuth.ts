const DEFAULT_PW_HASH = 'd086b000c4d69407866d15606d2c5bb9c8f64431bf4f72d1393b9996ca9a3cec'
const PW_KEY = 'aq_pw_hash'

export async function hashPw(pw: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function getStoredHash(): string {
  return localStorage.getItem(PW_KEY) ?? DEFAULT_PW_HASH
}

export function saveHash(hash: string) {
  localStorage.setItem(PW_KEY, hash)
}
