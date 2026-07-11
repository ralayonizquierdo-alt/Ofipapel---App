import { useState, useEffect } from 'react'
import { Delete, Fingerprint } from 'lucide-react'

export const PIN_STORAGE_KEY = 'joe_pin_hash'
const SESSION_KEY  = 'joe_unlocked'
const CRED_ID_KEY  = 'joe_cred_id'

export async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function getCurrentPinHash(): string | null {
  try { return localStorage.getItem(PIN_STORAGE_KEY) } catch { return null }
}

function isSessionValid(): boolean {
  try { return sessionStorage.getItem(SESSION_KEY) === '1' } catch { return false }
}

function saveSession() {
  try { sessionStorage.setItem(SESSION_KEY, '1') } catch {}
}

// ── WebAuthn helpers ────────────────────────────────────────────────────────

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
function fromB64url(s: string): ArrayBuffer {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
    .padEnd(s.length + (4 - s.length % 4) % 4, '=')
  const str = atob(b64)
  const buf = new ArrayBuffer(str.length)
  new Uint8Array(buf).forEach((_, i, a) => { a[i] = str.charCodeAt(i) })
  return buf
}

function hasCredential() { return !!localStorage.getItem(CRED_ID_KEY) }

async function isBioAvailable(): Promise<boolean> {
  try {
    return !!(
      window.PublicKeyCredential &&
      typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function' &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    )
  } catch { return false }
}

async function registerBiometric(): Promise<boolean> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: challenge.buffer as ArrayBuffer,
        rp: { name: "Joe's World", id: location.hostname },
        user: { id: new ArrayBuffer(16), name: 'joe', displayName: 'Joe' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        timeout: 60000,
      },
    }) as PublicKeyCredential | null
    if (!cred) return false
    localStorage.setItem(CRED_ID_KEY, b64url(cred.rawId))
    return true
  } catch { return false }
}

async function authenticateBiometric(): Promise<boolean> {
  const stored = localStorage.getItem(CRED_ID_KEY)
  if (!stored) return false
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    const ok = await navigator.credentials.get({
      publicKey: {
        challenge: challenge.buffer as ArrayBuffer,
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: fromB64url(stored) }],
        userVerification: 'required',
        timeout: 60000,
      },
    })
    return !!ok
  } catch { return false }
}

// ── Component ───────────────────────────────────────────────────────────────

interface Props { onUnlock: () => void }

export default function PinScreen({ onUnlock }: Props) {
  const isFirstTime = !getCurrentPinHash()
  const [step, setStep]   = useState<'login' | 'create' | 'confirm' | 'bio-setup'>(isFirstTime ? 'create' : 'login')
  const [pin, setPin]     = useState('')
  const [newPin, setNewPin] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)
  const [bioAvail, setBioAvail] = useState(false)

  // Check session + biometric availability on mount
  useEffect(() => {
    if (isSessionValid()) { onUnlock(); return }
    // Auto-trigger biometric if registered
    if (!isFirstTime && hasCredential()) {
      authenticateBiometric().then(ok => { if (ok) { saveSession(); onUnlock() } })
    }
    isBioAvailable().then(setBioAvail)
  }, [])

  const subtitles: Partial<Record<typeof step, string>> = {
    login:     'introduce tu PIN',
    create:    'crea tu PIN de acceso',
    confirm:   'repite tu PIN',
    'bio-setup': 'activa huella / Face ID',
  }

  function press(d: string) {
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    setError(false)
    if (next.length === 4) handleFull(next)
  }

  function del() { setPin(p => p.slice(0, -1)); setError(false) }

  function triggerError() {
    setError(true); setShake(true)
    setTimeout(() => { setPin(''); setError(false); setShake(false) }, 600)
  }

  async function handleFull(code: string) {
    if (step === 'login') {
      const h = await hashPin(code)
      if (h === getCurrentPinHash()) { saveSession(); onUnlock() }
      else triggerError()
    } else if (step === 'create') {
      setNewPin(code); setStep('confirm'); setPin('')
    } else if (step === 'confirm') {
      if (code !== newPin) { triggerError(); setStep('confirm'); return }
      const h = await hashPin(code)
      try { localStorage.setItem(PIN_STORAGE_KEY, h) } catch {}
      if (bioAvail) { setStep('bio-setup'); setPin('') }
      else { saveSession(); onUnlock() }
    }
  }

  async function handleBioSetup() {
    await registerBiometric() // success or not, we proceed
    saveSession(); onUnlock()
  }

  async function handleBioLogin() {
    const ok = await authenticateBiometric()
    if (ok) { saveSession(); onUnlock() }
    else setError(true)
  }

  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  // ── Bio-setup screen ───────────────────────────────────────────────────
  if (step === 'bio-setup') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center z-50"
        style={{ background: '#0a0a0a' }}>
        <div className="mb-10 flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #c9a96e 0%, #8a6020 100%)', boxShadow: '0 0 0 3px #c9a96e22, 0 4px 20px #c9a96e30' }}>
            <span className="font-black text-3xl select-none" style={{ color: '#0a0a0a', lineHeight: 1, transform: 'translateY(-1px)', display: 'block' }}>J</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#c9a96e' }}>Joe's World</h1>
          <p className="text-xs tracking-[0.3em] uppercase" style={{ color: '#555' }}>activa huella / Face ID</p>
        </div>
        <div className="flex flex-col gap-3 w-64">
          <button onClick={handleBioSetup}
            className="flex items-center justify-center gap-2.5 py-4 rounded-2xl text-sm font-medium active:scale-95 transition-all"
            style={{ background: '#c9a96e18', border: '1px solid #c9a96e35', color: '#c9a96e' }}>
            <Fingerprint size={18} />
            Activar huella / Face ID
          </button>
          <button onClick={() => { saveSession(); onUnlock() }}
            className="py-3 rounded-xl text-xs transition-colors"
            style={{ color: '#444' }}>
            Omitir por ahora
          </button>
        </div>
        <p className="mt-10 text-[10px] tracking-widest uppercase" style={{ color: '#2a2a2a' }}>♩ rock &amp; roll ♪</p>
      </div>
    )
  }

  // ── PIN screen ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center z-50"
      style={{ background: '#0a0a0a' }}>

      {/* Logo */}
      <div className="mb-10 flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #c9a96e 0%, #8a6020 100%)', boxShadow: '0 0 0 3px #c9a96e22, 0 4px 20px #c9a96e30' }}>
          <span className="font-black text-3xl select-none" style={{ color: '#0a0a0a', lineHeight: 1, transform: 'translateY(-1px)', display: 'block' }}>J</span>
        </div>
        <h1 className="text-2xl font-bold" style={{ color: '#c9a96e' }}>Joe's World</h1>
        <p className="text-xs tracking-[0.3em] uppercase" style={{ color: '#555' }}>{subtitles[step]}</p>
      </div>

      {/* Dots */}
      <div className={`flex gap-4 mb-8 ${shake ? 'animate-shake' : ''}`}>
        {[0,1,2,3].map(i => (
          <div key={i} className="w-4 h-4 rounded-full border-2 transition-all duration-150"
            style={{
              borderColor: error ? '#e05252' : '#c9a96e',
              backgroundColor: i < pin.length ? (error ? '#e05252' : '#c9a96e') : 'transparent',
            }} />
        ))}
      </div>

      {error && (
        <p className="text-sm mb-4 -mt-2" style={{ color: '#e05252' }}>
          {step === 'confirm' ? 'Los PINs no coinciden' : 'PIN incorrecto'}
        </p>
      )}

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3">
        {keys.map((k, i) => {
          if (k === '') return <div key={i} />
          if (k === '⌫') return (
            <button key={i} onClick={del}
              className="w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-150 active:scale-95"
              style={{ background: '#1a1a1a', color: '#777' }}>
              <Delete size={22} />
            </button>
          )
          return (
            <button key={i} onClick={() => press(k)}
              className="w-20 h-20 rounded-2xl text-2xl font-semibold transition-all duration-150 active:scale-95"
              style={{ background: '#1a1a1a', color: '#e0e0e0', border: '1px solid #222' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#252525')}
              onMouseLeave={e => (e.currentTarget.style.background = '#1a1a1a')}>
              {k}
            </button>
          )
        })}
      </div>

      {/* Biometric button (login, credential registered) */}
      {step === 'login' && hasCredential() && (
        <button onClick={handleBioLogin}
          className="mt-6 flex items-center gap-2 text-xs px-4 py-2.5 rounded-xl active:scale-95 transition-all"
          style={{ color: '#c9a96e', border: '1px solid #c9a96e28', background: '#c9a96e08' }}>
          <Fingerprint size={15} />
          Usar huella / Face ID
        </button>
      )}

      {step !== 'login' && (
        <div className="flex gap-1.5 mt-6">
          {(['create','confirm'] as const).map(s => (
            <div key={s} className="w-1.5 h-1.5 rounded-full transition-all"
              style={{ background: s === step ? '#c9a96e' : '#2a2a2a' }} />
          ))}
        </div>
      )}

      <p className="mt-8 text-[10px] tracking-widest uppercase" style={{ color: '#2a2a2a' }}>♩ rock &amp; roll ♪</p>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-8px)}
          40%{transform:translateX(8px)}
          60%{transform:translateX(-8px)}
          80%{transform:translateX(8px)}
        }
        .animate-shake { animation: shake 0.5s ease-in-out; }
      `}</style>
    </div>
  )
}
