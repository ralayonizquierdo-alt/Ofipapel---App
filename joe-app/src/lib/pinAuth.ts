export const PIN_STORAGE_KEY = 'joe_pin_hash'

export async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function getCurrentPinHash(): string | null {
  try { return localStorage.getItem(PIN_STORAGE_KEY) } catch { return null }
}
