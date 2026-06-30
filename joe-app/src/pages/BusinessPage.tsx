import { useState, useEffect } from 'react'
import { format, parseISO, isPast } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, X, CheckCircle2, Circle, Clock, AlertCircle, Mic, MicOff, BellRing } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { playAlarm } from '../lib/sounds'

interface BusinessTask {
  id: string
  title: string
  description?: string
  due_date?: string
  due_time?: string
  priority: 'high' | 'medium' | 'low'
  done: boolean
  created_at: string
}

const PRIORITY = {
  high:   { label: 'Alta',   color: '#e05252', bg: '#e0525215' },
  medium: { label: 'Media',  color: '#c9a96e', bg: '#c9a96e15' },
  low:    { label: 'Baja',   color: '#6db56d', bg: '#6db56d15' },
} as const

const emptyTask = (): Partial<BusinessTask> => ({
  title: '',
  description: '',
  priority: 'medium',
  done: false,
  due_date: '',
  due_time: '',
})

export default function BusinessPage() {
  const [tasks, setTasks] = useState<BusinessTask[]>([])
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('pending')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<Partial<BusinessTask>>(emptyTask())
  const [listening, setListening] = useState(false)
  const [listeningDesc, setListeningDesc] = useState(false)

  useEffect(() => { loadTasks() }, [])

  useEffect(() => {
    if (tasks.length === 0) return
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const nowTime  = format(new Date(), 'HH:mm')
    const dueToday = tasks.filter(t => {
      if (t.done || t.due_date !== todayStr) return false
      if (t.due_time && nowTime < t.due_time) return false
      return true
    })
    if (dueToday.length > 0) playAlarm()
  }, [tasks])

  async function loadTasks() {
    const { data } = await supabase.from('business_tasks').select('*').order('created_at', { ascending: false })
    if (data) setTasks(data)
  }

  async function save() {
    if (!form.title?.trim()) return
    if (form.id) {
      await supabase.from('business_tasks').update(form).eq('id', form.id)
    } else {
      await supabase.from('business_tasks').insert(form)
    }
    setShowModal(false)
    setForm(emptyTask())
    loadTasks()
  }

  async function toggleDone(task: BusinessTask) {
    await supabase.from('business_tasks').update({ done: !task.done }).eq('id', task.id)
    loadTasks()
  }

  async function del(id: string) {
    await supabase.from('business_tasks').delete().eq('id', id)
    loadTasks()
  }

  function startVoiceDesc() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'es-ES'
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0][0].transcript
      setForm(p => ({ ...p, description: (p.description ? p.description + ' ' : '') + text }))
      setListeningDesc(false)
    }
    rec.onend = () => setListeningDesc(false)
    rec.start()
    setListeningDesc(true)
  }

  function startVoice() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'es-ES'
    rec.onresult = (e: SpeechRecognitionEvent) => { setForm(p => ({ ...p, title: e.results[0][0].transcript })); setListening(false) }
    rec.onend = () => setListening(false)
    rec.start()
    setListening(true)
  }

  const filtered = tasks.filter(t =>
    filter === 'all' ? true : filter === 'done' ? t.done : !t.done
  )

  const overdue = tasks.filter(t => !t.done && t.due_date && isPast(parseISO(t.due_date)))
  const pending = tasks.filter(t => !t.done)
  const done = tasks.filter(t => t.done)

  return (
    <div className="animate-fadeIn max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="font-display text-3xl font-bold" style={{
            background: 'linear-gradient(135deg, #9b6bb5, #c9a96e)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Empresa
          </h2>
          <p className="text-[#aaa] text-sm mt-1">
            {pending.length} pendientes · {done.length} completadas
          </p>
        </div>
        <button onClick={() => { setForm(emptyTask()); setShowModal(true) }} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nueva tarea
        </button>
      </div>

      {/* Tareas para hoy */}
      {(() => {
        const todayStr = format(new Date(), 'yyyy-MM-dd')
        const dueToday = tasks.filter(t => !t.done && t.due_date === todayStr)
        if (dueToday.length === 0) return null
        return (
          <div className="card mb-4 border-[#e0a84a]/40 bg-[#e0a84a08]">
            <p className="text-sm text-[#e0a84a] flex items-center gap-2 font-medium mb-2">
              <BellRing size={14} /> {dueToday.length} tarea{dueToday.length > 1 ? 's' : ''} para hoy
            </p>
            {dueToday.map(t => (
              <p key={t.id} className="text-xs text-[#bbb] ml-5">• {t.title}</p>
            ))}
          </div>
        )
      })()}

      {/* Alertas vencidas */}
      {overdue.length > 0 && (
        <div className="card mb-4 border-[#e05252]/30 bg-[#e0525208]">
          <p className="text-sm text-[#e05252] flex items-center gap-2 font-medium mb-2">
            <AlertCircle size={14} /> {overdue.length} tarea{overdue.length > 1 ? 's' : ''} vencida{overdue.length > 1 ? 's' : ''}
          </p>
          {overdue.map(t => (
            <p key={t.id} className="text-xs text-[#bbb] ml-5">• {t.title}</p>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 mb-6">
        {([['pending', 'Pendientes'], ['done', 'Completadas'], ['all', 'Todo']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              filter === key ? 'bg-[#9b6bb5] text-white border-[#9b6bb5]' : 'border-[#2a2a2a] text-[#bbb]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Lista tareas */}
      {filtered.length === 0 ? (
        <div className="card text-center py-16">
          <CheckCircle2 size={40} className="mx-auto text-[#2a2a2a] mb-4" />
          <p className="text-[#999]">{filter === 'done' ? '¡Sin completadas aún!' : '¡Todo al día!'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => {
            const pr = PRIORITY[task.priority]
            const isOverdue = !task.done && task.due_date && isPast(parseISO(task.due_date))
            return (
              <div
                key={task.id}
                className={`card group flex items-start gap-3 cursor-pointer transition-all ${task.done ? 'opacity-50' : ''}`}
                onClick={() => { setForm(task); setShowModal(true) }}
              >
                <button
                  onClick={e => { e.stopPropagation(); toggleDone(task) }}
                  className="flex-shrink-0 mt-0.5"
                  style={{ color: task.done ? '#6db56d' : '#444' }}
                >
                  {task.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-medium ${task.done ? 'line-through text-[#999]' : 'text-[#e0e0e0]'}`}>
                      {task.title}
                    </p>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: pr.bg, color: pr.color }}>
                      {pr.label}
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-xs text-[#aaa] mt-0.5 truncate">{task.description}</p>
                  )}
                  {task.due_date && (
                    <p className={`text-xs flex items-center gap-1 mt-1 ${isOverdue ? 'text-[#e05252]' : 'text-[#999]'}`}>
                      <Clock size={10} />
                      {format(parseISO(task.due_date), "d MMM yyyy", { locale: es })}
                      {isOverdue && ' — vencida'}
                    </p>
                  )}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); del(task.id) }}
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
              <h3 className="font-display text-lg font-semibold text-[#e0e0e0]">{form.id ? 'Editar tarea' : 'Nueva tarea'}</h3>
              <button onClick={() => { setShowModal(false); setForm(emptyTask()) }} className="text-[#999] hover:text-[#bbb]"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-1.5">Tarea</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.title ?? ''}
                    onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="¿Qué hay que hacer?"
                    className="flex-1 bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#9b6bb5] focus:outline-none"
                  />
                  <button
                    onClick={listening ? () => setListening(false) : startVoice}
                    className={`px-3 rounded-lg border transition-colors ${listening ? 'border-[#e05252] text-[#e05252]' : 'border-[#3a3a3a] text-[#bbb] hover:border-[#9b6bb5]'}`}
                  >
                    {listening ? <MicOff size={16} /> : <Mic size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-1.5">Prioridad</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(PRIORITY) as (keyof typeof PRIORITY)[]).map(key => (
                    <button
                      key={key}
                      onClick={() => setForm(p => ({ ...p, priority: key }))}
                      className={`py-2 rounded-lg border text-xs font-medium transition-all ${
                        form.priority === key ? 'border-transparent text-[#0a0a0a]' : 'border-[#2a2a2a] text-[#bbb]'
                      }`}
                      style={form.priority === key ? { backgroundColor: PRIORITY[key].color } : {}}
                    >
                      {PRIORITY[key].label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-1.5">Fecha límite</label>
                <div className="flex gap-2">
                  <input type="date" value={form.due_date ?? ''} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                    className="flex-1 bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] focus:border-[#9b6bb5] focus:outline-none" />
                  <input type="time" value={form.due_time ?? ''} onChange={e => setForm(p => ({ ...p, due_time: e.target.value }))}
                    className="w-28 bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] focus:border-[#9b6bb5] focus:outline-none" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-[#bbb] uppercase tracking-wider">Notas</label>
                  <button onClick={startVoiceDesc}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${listeningDesc ? 'border-[#e05252] text-[#e05252]' : 'border-[#3a3a3a] text-[#999] hover:border-[#9b6bb5] hover:text-[#9b6bb5]'}`}>
                    {listeningDesc ? <MicOff size={12} /> : <Mic size={12} />}
                    {listeningDesc ? 'Escuchando…' : 'Voz'}
                  </button>
                </div>
                <textarea value={form.description ?? ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  rows={2}
                  className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#9b6bb5] focus:outline-none resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#2a2a2a] flex justify-end gap-2">
              <button onClick={() => { setShowModal(false); setForm(emptyTask()) }} className="btn-ghost">Cancelar</button>
              <button onClick={save} className="btn-primary">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
