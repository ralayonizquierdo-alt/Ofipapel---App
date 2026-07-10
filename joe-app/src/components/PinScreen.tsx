import { useState, useEffect } from 'react'
import { Delete } from 'lucide-react'

const PIN_HASH = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'
const SESSION_KEY = 'joe_unlocked'
const SESSION_HOURS = 12

async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function isSessionValid(): boolean {
  try {
    const expiry = parseInt(sessionStorage.getItem(SESSION_KEY) || '0')
    return expiry > Date.now()
  } catch { return false }
}

interface Props { onUnlock: () => void }

export default function PinScreen({ onUnlock }: Props) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  useEffect(() => {
    if (isSessionValid()) onUnlock()
  }, [])

  function press(d: string) {
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    setError(false)
    if (next.length === 4) verify(next)
  }

  function del() {
    setPin(p => p.slice(0, -1))
    setError(false)
  }

  async function verify(code: string) {
    const h = await hashPin(code)
    if (h === PIN_HASH) {
      try { sessionStorage.setItem(SESSION_KEY, String(Date.now() + SESSION_HOURS * 3600 * 1000)) } catch {}
      onUnlock()
    } else {
      setError(true)
      setShake(true)
      setTimeout(() => { setPin(''); setShake(false) }, 600)
    }
  }

  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫']

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
        <p className="text-xs tracking-[0.3em] uppercase" style={{ color: '#555' }}>introduce tu PIN</p>
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
        <p className="text-sm mb-4 -mt-2" style={{ color: '#e05252' }}>PIN incorrecto</p>
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

      <p className="mt-10 text-[10px] tracking-widest uppercase" style={{ color: '#2a2a2a' }}>♩ rock & roll ♪</p>

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
