import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, X, CheckCircle2, Circle, StickyNote, Bell, ShoppingCart, BellRing, Mic, MicOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { playAlarm } from '../lib/sounds'
import type { Coisinha } from '../types'

const TYPE_CONFIG = {
  nota:         { label: 'Nota',         icon: StickyNote,    color: '#c9a96e', bg: '#c9a96e15' },
  recordatorio: { label: 'Recordatorio', icon: Bell,          color: '#d4609e', bg: '#d4609e15' },
  compra:       { label: 'Compra',       icon: ShoppingCart,  color: '#6db56d', bg: '#6db56d15' },
} as const

type CoisinhaType = keyof typeof TYPE_CONFIG

const emptyForm = (): Partial<Coisinha> => ({
  type: 'nota',
  title: '',
  content: '',
  done: false,
  reminder_date: '',
  reminder_time: '',
})

export default function CoisinhasPage() {
  const [items, setItems] = useState<Coisinha[]>([])
  const [filter, setFilter] = useState<CoisinhaType | 'all'>('all')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<Partial<Coisinha>>(emptyForm())
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )
  const [listeningContent, setListeningContent] = useState(false)

  function startVoiceContent() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'es-ES'
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0][0].transcript
      setForm(p => ({ ...p, content: (p.content ? p.content + ' ' : '') + text }))
      setListeningContent(false)
    }
    rec.onend = () => setListeningContent(false)
    rec.start()
    setListeningContent(true)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (items.length === 0) return
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const nowTime  = format(new Date(), 'HH:mm')
    const dueToday = items.filter(i => {
      if (i.done || i.type !== 'recordatorio' || i.reminder_date !== todayStr) return false
      if (i.reminder_time && nowTime < i.reminder_time) return false
      return true
    })
    if (dueToday.length > 0) {
      playAlarm()
      if (notifPerm === 'granted') {
        dueToday.forEach(i => {
          new Notification(`🌟 Coisinhas — ${i.title}`, {
            body: i.content ?? 'Recordatorio para hoy',
            tag: `coisinha-${i.id}`,
          })
        })
      }
    }
  }, [items, notifPerm])

  async function requestNotifPermission() {
    if (typeof Notification === 'undefined') return
    const perm = await Notification.requestPermission()
    setNotifPerm(perm)
  }

  async function load() {
    const { data } = await supabase
      .from('coisinhas')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setItems(data)
  }

  async function save() {
    if (!form.title?.trim()) return
    const payload = { ...form }
    if (!payload.reminder_date) delete payload.reminder_date
    if (form.id) {
      await supabase.from('coisinhas').update(payload).eq('id', form.id)
    } else {
      await supabase.from('coisinhas').insert(payload)
    }
    setShowModal(false)
    setForm(emptyForm())
    load()
  }

  async function toggleDone(item: Coisinha) {
    await supabase.from('coisinhas').update({ done: !item.done }).eq('id', item.id)
    load()
  }

  async function del(id: string) {
    await supabase.from('coisinhas').delete().eq('id', id)
    load()
  }

  const filtered = filter === 'all' ? items : items.filter(i => i.type === filter)
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const remindersToday = items.filter(i => !i.done && i.type === 'recordatorio' && i.reminder_date === todayStr)

  return (
    <div className="animate-fadeIn max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="font-display text-3xl font-bold" style={{
            background: 'linear-gradient(135deg, #d4609e, #c9a96e)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Minhas Coisinhas
          </h2>
          <p className="text-[#aaa] text-sm mt-1">
            {items.filter(i => !i.done).length} pendientes
          </p>
        </div>
        <div className="flex items-center gap-2">
          {notifPerm === 'default' && (
            <button
              onClick={requestNotifPermission}
              className="flex items-center gap-1.5 text-xs text-[#bbb] hover:text-[#d4609e] border border-[#2a2a2a] hover:border-[#d4609e40] px-3 py-2 rounded-lg transition-all"
            >
              <Bell size={13} /> Avisos
            </button>
          )}
          {notifPerm === 'granted' && (
            <span className="flex items-center gap-1 text-xs text-[#d4609e]">
              <BellRing size={12} /> Activados
            </span>
          )}
          <button
            onClick={() => { setForm(emptyForm()); setShowModal(true) }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={16} /> Añadir
          </button>
        </div>
      </div>

      {/* Recordatorios para hoy */}
      {remindersToday.length > 0 && (
        <div className="card mb-6 border-[#d4609e]/40 bg-[#d4609e08]">
          <h3 className="text-sm font-semibold text-[#e0e0e0] flex items-center gap-2 mb-3">
            <BellRing size={14} style={{ color: '#d4609e' }} /> Recordatorios para hoy
          </h3>
          <div className="space-y-2">
            {remindersToday.map(i => (
              <div key={i.id} className="flex items-center gap-3 text-sm">
                <Bell size={13} style={{ color: '#d4609e' }} />
                <span className="text-[#e0e0e0] flex-1 font-medium">{i.title}</span>
                {i.content && <span className="text-[#bbb] text-xs truncate max-w-[140px]">{i.content}</span>}
                <span className="text-xs font-semibold" style={{ color: '#d4609e' }}>¡Hoy!</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            filter === 'all'
              ? 'text-[#0a0a0a] border-transparent'
              : 'border-[#2a2a2a] text-[#bbb]'
          }`}
          style={filter === 'all' ? { backgroundColor: '#d4609e' } : {}}
        >
          Todo
        </button>
        {(Object.keys(TYPE_CONFIG) as CoisinhaType[]).map(key => {
          const cfg = TYPE_CONFIG[key]
          const Icon = cfg.icon
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                filter === key ? 'text-[#0a0a0a] border-transparent' : 'border-[#2a2a2a] text-[#bbb]'
              }`}
              style={filter === key ? { backgroundColor: cfg.color } : {}}
            >
              <Icon size={11} /> {cfg.label}
            </button>
          )
        })}
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="card text-center py-16">
          <span className="text-5xl">🌟</span>
          <p className="text-[#999] mt-4">Nada por aquí todavía</p>
          <p className="text-[#888] text-sm">Añade notas, recordatorios o cosas a comprar</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => {
            const cfg = TYPE_CONFIG[item.type]
            const Icon = cfg.icon
            const isRemindedToday = item.type === 'recordatorio' && item.reminder_date === todayStr && !item.done
            return (
              <div
                key={item.id}
                className={`card group flex items-start gap-3 cursor-pointer transition-all ${item.done ? 'opacity-40' : ''}`}
                onClick={() => { setForm(item); setShowModal(true) }}
              >
                {item.type === 'compra' ? (
                  <button
                    onClick={e => { e.stopPropagation(); toggleDone(item) }}
                    className="flex-shrink-0 mt-0.5"
                    style={{ color: item.done ? '#6db56d' : '#444' }}
                  >
                    {item.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  </button>
                ) : (
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: cfg.bg }}>
                    <Icon size={14} style={{ color: cfg.color }} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-medium ${item.done ? 'line-through text-[#999]' : 'text-[#e0e0e0]'}`}>
                      {item.title}
                    </p>
                    {isRemindedToday && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ backgroundColor: '#d4609e20', color: '#d4609e' }}>
                        ¡Hoy!
                      </span>
                    )}
                  </div>
                  {item.content && (
                    <p className="text-xs text-[#aaa] mt-0.5 truncate">{item.content}</p>
                  )}
                  {item.reminder_date && (
                    <p className="text-xs text-[#999] mt-1 flex items-center gap-1">
                      <Bell size={10} style={{ color: '#d4609e' }} />
                      {format(new Date(item.reminder_date + 'T00:00:00'), "d MMM yyyy", { locale: es })}
                    </p>
                  )}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); del(item.id) }}
                  className="text-[#888] hover:text-[#e05252] opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#3a3a3a] rounded-2xl w-full max-w-md animate-fadeIn">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a]">
              <h3 className="font-display text-lg font-semibold text-[#e0e0e0]">
                {form.id ? 'Editar' : 'Nueva coisinha'}
              </h3>
              <button onClick={() => { setShowModal(false); setForm(emptyForm()) }} className="text-[#999] hover:text-[#bbb]">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Tipo */}
              <div>
                <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-2">Tipo</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(TYPE_CONFIG) as CoisinhaType[]).map(key => {
                    const cfg = TYPE_CONFIG[key]
                    const Icon = cfg.icon
                    return (
                      <button
                        key={key}
                        onClick={() => setForm(p => ({ ...p, type: key }))}
                        className={`flex items-center gap-2 py-2.5 px-3 rounded-lg border text-xs font-medium transition-all ${
                          form.type === key ? 'border-transparent text-[#0a0a0a]' : 'border-[#2a2a2a] text-[#bbb]'
                        }`}
                        style={form.type === key ? { backgroundColor: cfg.color } : {}}
                      >
                        <Icon size={13} /> {cfg.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Título */}
              <div>
                <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-1.5">
                  {form.type === 'compra' ? 'Qué comprar' : 'Título'}
                </label>
                <input
                  type="text"
                  value={form.title ?? ''}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder={form.type === 'compra' ? 'Leche, pan, café...' : form.type === 'recordatorio' ? 'Llamar al médico...' : 'Mi nota...'}
                  className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#d4609e] focus:outline-none"
                />
              </div>

              {/* Contenido / detalles */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-[#bbb] uppercase tracking-wider">Detalles</label>
                  <button onClick={startVoiceContent}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${listeningContent ? 'border-[#e05252] text-[#e05252]' : 'border-[#3a3a3a] text-[#999] hover:border-[#d4609e] hover:text-[#d4609e]'}`}>
                    {listeningContent ? <MicOff size={12} /> : <Mic size={12} />}
                    {listeningContent ? 'Escuchando…' : 'Voz'}
                  </button>
                </div>
                <textarea
                  ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }}
                  value={form.content ?? ''}
                  onChange={e => {
                    setForm(p => ({ ...p, content: e.target.value }))
                    e.currentTarget.style.height = 'auto'
                    e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'
                  }}
                  rows={3}
                  className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#d4609e] focus:outline-none resize-none overflow-hidden"
                  style={{ minHeight: '80px' }}
                />
              </div>

              {/* Recordatorio — solo para tipo recordatorio */}
              {form.type === 'recordatorio' && (
                <div>
                  <label className="text-xs text-[#bbb] uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                    <BellRing size={11} style={{ color: '#d4609e' }} /> Aviso
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={form.reminder_date ?? ''}
                      onChange={e => setForm(p => ({ ...p, reminder_date: e.target.value }))}
                      className="flex-1 bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] focus:border-[#d4609e] focus:outline-none"
                    />
                    <input
                      type="time"
                      value={form.reminder_time ?? ''}
                      onChange={e => setForm(p => ({ ...p, reminder_time: e.target.value }))}
                      className="w-28 bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] focus:border-[#d4609e] focus:outline-none"
                    />
                  </div>
                  <p className="text-[10px] text-[#999] mt-1">Sonará a la hora indicada (o al abrir la app si no hay hora)</p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[#2a2a2a] flex justify-end gap-2">
              <button onClick={() => { setShowModal(false); setForm(emptyForm()) }} className="btn-ghost">Cancelar</button>
              <button onClick={save} className="btn-primary">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
